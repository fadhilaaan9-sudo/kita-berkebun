import { Room, Client } from "@colyseus/core";
import {
  Animal,
  CROPS,
  FarmState,
  MSG,
  Plot,
  Player,
  generateJoinCode,
  sanitizeJoinCode,
  type AnimalKind,
  type AnimalPayload,
  type CropKind,
  type MovePayload,
  type PlantPayload,
  type PlotPayload,
} from "@kebun-kita/shared";

const GRID_SIZE = 8; // kebun 8x8 petak
const MAX_CLIENTS = 4;
const WORLD_BOUND = 14; // batas jalan pemain
const COW_PRODUCE_MS = 120_000; // susu tiap 2 menit (kalau kenyang)
const CHICKEN_PRODUCE_MS = 60_000; // telur tiap 1 menit (kalau kenyang)

interface JoinOptions {
  name?: string;
  farmCode?: string;
}

const isCrop = (v: unknown): v is CropKind =>
  typeof v === "string" && (v as string) in CROPS;

/**
 * Satu room = satu kebun. Server bersifat authoritative:
 * semua aksi ekonomi & perubahan state divalidasi di sini,
 * client tidak dipercaya.
 */
export class FarmRoom extends Room<FarmState> {
  maxClients = MAX_CLIENTS;

  onCreate(options: JoinOptions) {
    // Kode normalnya sudah di-generate client dan terkirim lewat opsi
    // pembuatan room (lihat createFarm di client). Fallback di sini
    // hanya untuk jaga-jaga kalau opsi kosong/tidak valid.
    let farmCode = sanitizeJoinCode(options.farmCode);
    if (farmCode.length !== 6) farmCode = generateJoinCode();
    this.setMetadata({ farmCode });
    this.setState(new FarmState());
    this.state.farmCode = farmCode;
    this.state.coins = 100;

    for (let gx = 0; gx < GRID_SIZE; gx++) {
      for (let gz = 0; gz < GRID_SIZE; gz++) {
        const plot = new Plot();
        plot.id = `plot-${gx}-${gz}`;
        plot.gx = gx;
        plot.gz = gz;
        this.state.plots.set(plot.id, plot);
      }
    }

    this.spawnAnimal("cow", -6, 6);
    this.spawnAnimal("cow", -4, 7);
    this.spawnAnimal("chicken", 6, -6);
    this.spawnAnimal("chicken", 7, -5);

    this.onMessage(MSG.MOVE, (client, data: MovePayload) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof data?.x !== "number" || typeof data?.z !== "number") return;
      // TODO(M2): validasi kecepatan (anti-teleport)
      p.x = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, data.x));
      p.z = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, data.z));
    });

    this.onMessage(MSG.TILL, (_client, data: PlotPayload) => {
      const plot = this.getPlot(data?.plotId);
      if (!plot || plot.state !== "wild") return;
      plot.state = "tilled";
    });

    this.onMessage(MSG.PLANT, (_client, data: PlantPayload) => {
      const plot = this.getPlot(data?.plotId);
      if (!plot || plot.state !== "tilled" || !isCrop(data?.crop)) return;
      const cost = CROPS[data.crop].seedCost;
      if (this.state.coins < cost) return;
      this.state.coins -= cost;
      plot.state = "planted";
      plot.crop = data.crop;
      plot.plantedAt = Date.now();
      plot.watered = false;
    });

    this.onMessage(MSG.WATER, (_client, data: PlotPayload) => {
      const plot = this.getPlot(data?.plotId);
      if (!plot || plot.state !== "planted") return;
      plot.watered = true;
    });

    this.onMessage(MSG.HARVEST, (_client, data: PlotPayload) => {
      const plot = this.getPlot(data?.plotId);
      if (!plot || plot.state !== "ready" || !isCrop(plot.crop)) return;
      this.state.coins += CROPS[plot.crop].sellPrice;
      plot.state = "tilled";
      plot.crop = "";
      plot.watered = false;
      plot.plantedAt = 0;
    });

    this.onMessage(MSG.FEED, (_client, data: AnimalPayload) => {
      const animal = this.state.animals.get(data?.animalId);
      if (!animal) return;
      animal.hunger = 100;
    });

    this.onMessage(MSG.COLLECT, (_client, data: AnimalPayload) => {
      const animal = this.state.animals.get(data?.animalId);
      if (!animal || !animal.produceReady) return;
      this.state.coins += animal.kind === "cow" ? 15 : 5;
      animal.produceReady = false;
      animal.lastCollected = Date.now();
    });

    this.setSimulationInterval(() => this.tick(), 1000);
    console.log(`[kebun-kita] farm room created — code: ${farmCode}`);
  }

  onJoin(client: Client, options: JoinOptions) {
    const player = new Player();
    player.id = client.sessionId;
    player.name = (options.name || "Petani").slice(0, 16);
    player.x = 0;
    player.z = 5;
    player.isHost = this.clients.length === 1;
    this.state.players.set(client.sessionId, player);
    console.log(`[kebun-kita:${this.state.farmCode}] ${player.name} joined`);
  }

  onLeave(client: Client) {
    const wasHost = this.state.players.get(client.sessionId)?.isHost;
    this.state.players.delete(client.sessionId);
    if (wasHost) {
      const next = this.state.players.values().next().value as Player | undefined;
      if (next) next.isHost = true;
    }
    console.log(`[kebun-kita:${this.state.farmCode}] a player left`);
  }

  private getPlot(plotId: string | undefined): Plot | undefined {
    if (!plotId) return undefined;
    return this.state.plots.get(plotId);
  }

  private spawnAnimal(kind: AnimalKind, x: number, z: number) {
    const animal = new Animal();
    animal.id = `animal-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    animal.kind = kind;
    animal.x = x;
    animal.z = z;
    animal.hunger = 100;
    animal.lastCollected = Date.now();
    this.state.animals.set(animal.id, animal);
  }

  /** Jalan tiap 1 detik: pertumbuhan tanaman & kebutuhan hewan. */
  private tick() {
    const now = Date.now();

    this.state.plots.forEach((plot) => {
      if (plot.state === "planted" && plot.watered && isCrop(plot.crop)) {
        if (now - plot.plantedAt >= CROPS[plot.crop].growthMs) {
          plot.state = "ready";
        }
      }
    });

    this.state.animals.forEach((animal) => {
      animal.hunger = Math.max(0, animal.hunger - 0.5);
      const produceMs = animal.kind === "cow" ? COW_PRODUCE_MS : CHICKEN_PRODUCE_MS;
      if (animal.hunger <= 30) {
        animal.produceReady = false;
      } else if (!animal.produceReady && now - animal.lastCollected >= produceMs) {
        animal.produceReady = true;
      }
    });
  }
}
