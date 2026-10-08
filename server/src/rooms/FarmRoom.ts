import { Room, Client } from "@colyseus/core";
import {
  Animal,
  BAG_SLOTS_1,
  BAG_UPGRADE_COST,
  CROPS,
  FEEDS,
  FEEDS_NEEDED,
  FarmState,
  InventoryItem,
  MSG,
  PRODUCE,
  Plot,
  Player,
  SEEDS,
  generateJoinCode,
  sanitizeJoinCode,
  type AnimalKind,
  type AnimalPayload,
  type CropKind,
  type MovePayload,
  type NoticePayload,
  type PlantPayload,
  type PlotPayload,
  type ShopPayload,
} from "@kebun-kita/shared";

const GRID_SIZE = 8; // kebun 8x8 petak
const MAX_CLIENTS = 4;
const WORLD_BOUND = 14; // batas jalan pemain
const INTERACT_DIST = 3.2; // jarak maksimal interaksi (anti-grief dasar)
const COW_PRODUCE_MS = 120_000; // susu tiap 2 menit (setelah 2x pakan)
const CHICKEN_PRODUCE_MS = 60_000; // telur tiap 1 menit (setelah 1x pakan)

/** batas kandang: [x0, x1, z0, z1] */
const PEN: Record<AnimalKind, [number, number, number, number]> = {
  cow: [-8, -3, 5, 8.5],
  chicken: [5, 8.5, -8, -3],
};

interface JoinOptions {
  name?: string;
  farmCode?: string;
}

const isCrop = (v: unknown): v is CropKind =>
  typeof v === "string" && (v as string) in CROPS;

const seedIdFor = (crop: CropKind): string => `seed_${crop}`;
const produceIdFor = (crop: CropKind): string => `prod_${crop}`;
const feedIdFor = (kind: AnimalKind): string =>
  kind === "cow" ? "feed_cow" : "feed_chicken";

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
    this.state.maxSlots = BAG_SLOTS_1;

    // Bibit & pakan awal (peti awal — GDD onboarding)
    this.addItem("seed_gandum", 4);
    this.addItem("feed_chicken", 2);
    this.addItem("feed_cow", 4);

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

    this.onMessage(MSG.TILL, (client, data: PlotPayload) => {
      const plot = this.getPlot(data?.plotId);
      if (!plot || plot.state !== "wild") return;
      if (!this.near(client, plot.gx - 3.5, plot.gz - 3.5)) {
        this.notify(client, "Terlalu jauh dari petak!");
        return;
      }
      plot.state = "tilled";
    });

    this.onMessage(MSG.PLANT, (client, data: PlantPayload) => {
      const plot = this.getPlot(data?.plotId);
      if (!plot || plot.state !== "tilled" || !isCrop(data?.crop)) return;
      if (!this.near(client, plot.gx - 3.5, plot.gz - 3.5)) {
        this.notify(client, "Terlalu jauh dari petak!");
        return;
      }
      const seedId = seedIdFor(data.crop);
      if (!this.takeItem(seedId, 1)) {
        const label = SEEDS[seedId as keyof typeof SEEDS]?.label ?? "bibit";
        this.notify(client, `Butuh ${label}! Beli di kios 🏪`);
        return;
      }
      plot.state = "planted";
      plot.crop = data.crop;
      plot.plantedAt = Date.now();
      plot.watered = false;
    });

    this.onMessage(MSG.WATER, (client, data: PlotPayload) => {
      const plot = this.getPlot(data?.plotId);
      if (!plot || plot.state !== "planted") return;
      if (!this.near(client, plot.gx - 3.5, plot.gz - 3.5)) {
        this.notify(client, "Terlalu jauh dari petak!");
        return;
      }
      plot.watered = true;
    });

    this.onMessage(MSG.HARVEST, (client, data: PlotPayload) => {
      const plot = this.getPlot(data?.plotId);
      if (!plot || plot.state !== "ready" || !isCrop(plot.crop)) return;
      if (!this.near(client, plot.gx - 3.5, plot.gz - 3.5)) {
        this.notify(client, "Terlalu jauh dari petak!");
        return;
      }
      if (!this.addItem(produceIdFor(plot.crop), 1)) {
        this.notify(client, "Tas penuh! Jual hasil di kios 🏪");
        return;
      }
      plot.state = "tilled";
      plot.crop = "";
      plot.watered = false;
      plot.plantedAt = 0;
    });

    this.onMessage(MSG.FEED, (client, data: AnimalPayload) => {
      const animal = this.state.animals.get(data?.animalId);
      if (!animal) return;
      if (!this.near(client, animal.x, animal.z)) {
        this.notify(client, "Terlalu jauh dari hewan!");
        return;
      }
      const need = FEEDS_NEEDED[animal.kind];
      if (animal.feedsGiven >= need) {
        this.notify(client, "Sudah kenyang, tunggu hasilnya 😊");
        return;
      }
      const feedId = feedIdFor(animal.kind);
      if (!this.takeItem(feedId, 1)) {
        const label = FEEDS[feedId as keyof typeof FEEDS]?.label ?? "pakan";
        this.notify(client, `Butuh ${label}! Beli di kios 🏪`);
        return;
      }
      animal.feedsGiven += 1;
      if (animal.feedsGiven >= need) animal.fedAt = Date.now();
    });

    this.onMessage(MSG.COLLECT, (client, data: AnimalPayload) => {
      const animal = this.state.animals.get(data?.animalId);
      if (!animal || !animal.produceReady) return;
      if (!this.near(client, animal.x, animal.z)) {
        this.notify(client, "Terlalu jauh dari hewan!");
        return;
      }
      const itemId = animal.kind === "cow" ? "milk" : "egg";
      if (!this.addItem(itemId, 1)) {
        this.notify(client, "Tas penuh! Jual hasil di kios 🏪");
        return;
      }
      animal.produceReady = false;
      animal.feedsGiven = 0;
    });

    this.onMessage(MSG.SHOP_BUY, (client, data: ShopPayload) => {
      const qty = Math.max(1, Math.min(99, Math.floor(data?.qty ?? 0)));
      if (!qty) return;
      const itemId = data?.itemId;
      const entry =
        (SEEDS as Record<string, { price: number; label: string } | undefined>)[itemId] ??
        (FEEDS as Record<string, { price: number; label: string } | undefined>)[itemId];
      if (!entry) return;
      const total = entry.price * qty;
      if (this.state.coins < total) {
        this.notify(client, `Koin kurang! Butuh 🪙${total}`);
        return;
      }
      if (!this.state.inventory.has(itemId) && this.distinctCount() >= this.state.maxSlots) {
        this.notify(client, "Tas penuh! Upgrade tas di kios 🏪");
        return;
      }
      this.state.coins -= total;
      this.addItem(itemId, qty);
    });

    this.onMessage(MSG.SHOP_SELL, (client, data: ShopPayload) => {
      const qty = Math.max(1, Math.min(99, Math.floor(data?.qty ?? 0)));
      if (!qty) return;
      const itemId = data?.itemId;
      const entry = (PRODUCE as Record<string, { sellPrice: number; label: string } | undefined>)[itemId];
      if (!entry) return;
      if (!this.takeItem(itemId, qty)) {
        this.notify(client, "Tidak punya cukup item!");
        return;
      }
      this.state.coins += entry.sellPrice * qty;
    });

    this.onMessage(MSG.UPGRADE_BAG, (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p?.isHost) {
        this.notify(client, "Hanya host yang bisa beli upgrade!");
        return;
      }
      if (this.state.maxSlots >= 20) {
        this.notify(client, "Tas sudah maksimal!");
        return;
      }
      if (this.state.coins < BAG_UPGRADE_COST) {
        this.notify(client, `Koin kurang! Butuh 🪙${BAG_UPGRADE_COST}`);
        return;
      }
      this.state.coins -= BAG_UPGRADE_COST;
      this.state.maxSlots = 20;
      this.notify(client, "Tas di-upgrade! Kapasitas 20 slot 🎒");
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

  private notify(client: Client, text: string) {
    const payload: NoticePayload = { text };
    client.send(MSG.NOTICE, payload);
  }

  /** Cek jarak pemain ke titik interaksi (anti-grief dasar). */
  private near(client: Client, x: number, z: number): boolean {
    const p = this.state.players.get(client.sessionId);
    if (!p) return false;
    const dx = p.x - x;
    const dz = p.z - z;
    return dx * dx + dz * dz <= INTERACT_DIST * INTERACT_DIST;
  }

  private distinctCount(): number {
    return this.state.inventory.size;
  }

  private getItem(id: string): InventoryItem | undefined {
    return this.state.inventory.get(id);
  }

  /**
   * Tambah item ke tas. Tiap jenis item = 1 slot; jenis baru butuh slot kosong.
   * Mengembalikan false kalau tas penuh (tidak ada yang berubah).
   */
  private addItem(id: string, qty: number): boolean {
    const existing = this.state.inventory.get(id);
    if (existing) {
      existing.qty += qty;
      return true;
    }
    if (this.state.inventory.size >= this.state.maxSlots) return false;
    const item = new InventoryItem();
    item.id = id;
    item.qty = qty;
    this.state.inventory.set(id, item);
    return true;
  }

  /** Ambil item dari tas. False kalau stok kurang (tidak ada yang berubah). */
  private takeItem(id: string, qty: number): boolean {
    const existing = this.state.inventory.get(id);
    if (!existing || existing.qty < qty) return false;
    existing.qty -= qty;
    if (existing.qty <= 0) this.state.inventory.delete(id);
    return true;
  }

  private spawnAnimal(kind: AnimalKind, x: number, z: number) {
    const animal = new Animal();
    animal.id = `animal-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    animal.kind = kind;
    animal.x = x;
    animal.z = z;
    animal.tx = x;
    animal.tz = z;
    this.state.animals.set(animal.id, animal);
  }

  /** Jalan tiap 1 detik: pertumbuhan tanaman, produksi & jalan-jalan hewan. */
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
      // Produksi: butuh pakan terpenuhi (ayam 1x, sapi 2x), lalu tunggu.
      // produceReady bersifat sticky: mengabaikan hewan hanya menunda,
      // tidak menghilangkan hasil (prinsip GDD: santai, tanpa hukuman).
      const produceMs = animal.kind === "cow" ? COW_PRODUCE_MS : CHICKEN_PRODUCE_MS;
      if (
        !animal.produceReady &&
        animal.feedsGiven >= FEEDS_NEEDED[animal.kind] &&
        animal.fedAt > 0 &&
        now - animal.fedAt >= produceMs
      ) {
        animal.produceReady = true;
      }

      // Jalan acak di dalam kandang (ayam aktif, sapi lebih kalem)
      const [x0, x1, z0, z1] = PEN[animal.kind];
      const dx = animal.tx - animal.x;
      const dz = animal.tz - animal.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        const p = animal.kind === "cow" ? 0.18 : 0.4;
        if (Math.random() < p) {
          animal.tx = x0 + Math.random() * (x1 - x0);
          animal.tz = z0 + Math.random() * (z1 - z0);
        }
      } else {
        const speed = animal.kind === "cow" ? 0.35 : 0.7;
        animal.x += (dx / d) * speed;
        animal.z += (dz / d) * speed;
      }
    });
  }
}
