import { Room, Client } from "@colyseus/core";
import {
  RACE_MSG,
  RaceCar,
  RaceState,
  SPAWN,
  CHECKPOINTS,
  TOTAL_LAPS,
  clampToTrack,
  generateJoinCode,
  sanitizeJoinCode,
  type CarStatePayload,
} from "@kebun-kita/shared";

const MAX_CLIENTS = 8;
const WORLD_BOUND = 30; // batas dunia (lebih besar dari lintasan)

interface RaceJoinOptions {
  name?: string;
  roomCode?: string;
  vehicle?: string;
}

const VALID_VEHICLES = new Set([
  "vehicle-racer",
  "vehicle-speedster",
  "vehicle-drag-racer",
  "vehicle-monster-truck",
  "vehicle-vintage-racer",
  "vehicle-suv",
  "vehicle-truck",
  "vehicle-racer-low",
]);

/** Titik start (di jalan lurus bawah, sebelum garis finis) — dari shared. */
const START_X = SPAWN.x;
const START_Z = SPAWN.z;
const START_ANGLE = SPAWN.angle; // hadap +x (forward = (sin, cos))

/**
 * Room balapan: fisika arcade jalan di client (responsif),
 * server menerima state mobil, validasi ringan, checkpoint/lap,
 * lalu broadcast ke semua pemain.
 */
export class RaceRoom extends Room<RaceState> {
  maxClients = MAX_CLIENTS;
  private countdownTimer?: NodeJS.Timeout;

  onCreate(options: RaceJoinOptions) {
    let roomCode = sanitizeJoinCode(options.roomCode);
    if (roomCode.length !== 6) roomCode = generateJoinCode();
    this.setMetadata({ roomCode });
    this.setState(new RaceState());
    this.state.roomCode = roomCode;
    this.state.phase = "waiting"; // tunggu host memencet start
    this.state.countdown = 3;

    // host memencet tombol start → mulai hitungan mundur
    this.onMessage(RACE_MSG.START_RACE, (client) => {
      if (client.sessionId !== this.state.hostId) return; // hanya host
      if (this.state.phase !== "waiting") return; // sudah mulai
      if (this.state.cars.size < 1) return;
      this.startCountdown();
      console.log(`[kita-balapan:${roomCode}] host memulai balapan`);
    });

    this.onMessage(RACE_MSG.CAR_STATE, (client, data: CarStatePayload) => {
      const car = this.state.cars.get(client.sessionId);
      if (!car || typeof data?.x !== "number" || typeof data?.z !== "number") return;
      // Validasi: clamp ke dunia + jepit ke lintasan (dinding tak terlihat)
      const p = {
        x: Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, data.x)),
        z: Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, data.z)),
      };
      clampToTrack(p);
      car.x = p.x;
      car.z = p.z;
      if (typeof data.angle === "number") car.angle = data.angle;
      if (typeof data.speed === "number") {
        car.speed = Math.max(-8, Math.min(14, data.speed));
      }
      // checkpoint & lap (hanya saat racing)
      if (this.state.phase === "racing") {
        this.checkCheckpoint(car);
      }
    });

    console.log(`[kita-balapan] race room created — code: ${roomCode}`);
  }

  /** Mulai hitungan mundur 3-2-1 lalu balapan. */
  private startCountdown() {
    this.state.phase = "countdown";
    this.state.countdown = 3;
    this.countdownTimer = setInterval(() => {
      if (this.state.phase !== "countdown") {
        if (this.countdownTimer) clearInterval(this.countdownTimer);
        return;
      }
      this.state.countdown--;
      if (this.state.countdown <= 0) {
        this.state.phase = "racing";
        if (this.countdownTimer) clearInterval(this.countdownTimer);
        console.log(`[kita-balapan:${this.state.roomCode}] GO!`);
      }
    }, 1000);
  }

  /** Cek apakah mobil melewati checkpoint berikutnya (berurutan). */
  private checkCheckpoint(car: RaceCar) {
    const idx = car.checkpoint; // 0 = finis, 1..4 = checkpoint
    const [cx, cz, r] = CHECKPOINTS[idx];
    const dx = car.x - cx;
    const dz = car.z - cz;
    if (dx * dx + dz * dz > r * r) return; // belum sampai

    if (idx === 0) {
      // melewati garis finis setelah putaran penuh → lap + 1
      car.lap++;
      car.checkpoint = 1;
      console.log(`[kita-balapan:${this.state.roomCode}] ${car.name} lap ${car.lap}/${TOTAL_LAPS}`);
      if (car.lap >= TOTAL_LAPS && this.state.phase === "racing") {
        this.state.phase = "finished";
        this.state.winnerId = car.id;
        this.state.winnerName = car.name;
        console.log(`[kita-balapan:${this.state.roomCode}] PEMENANG: ${car.name}!`);
      }
    } else {
      car.checkpoint++;
      if (car.checkpoint >= CHECKPOINTS.length) {
        car.checkpoint = 0; // selanjutnya: garis finis
      }
    }
  }

  onJoin(client: Client, options: RaceJoinOptions) {
    const car = new RaceCar();
    car.id = client.sessionId;
    car.name = (options.name || "Pembalap").slice(0, 16);
    car.x = START_X;
    car.z = START_Z;
    car.angle = START_ANGLE;
    car.speed = 0;
    car.lap = 0;
    car.checkpoint = 1; // mulai dari checkpoint 1 (0 = finis di spawn)
    car.vehicle =
      typeof options.vehicle === "string" && VALID_VEHICLES.has(options.vehicle)
        ? options.vehicle
        : "vehicle-racer";
    const isFirst = this.state.cars.size === 0;
    this.state.cars.set(client.sessionId, car);
    if (isFirst) {
      this.state.hostId = client.sessionId; // pemain pertama = host
    }
    console.log(`[kita-balapan:${this.state.roomCode}] ${car.name} joined${isFirst ? " (host)" : ""}`);
  }

  onLeave(client: Client) {
    const wasHost = client.sessionId === this.state.hostId;
    this.state.cars.delete(client.sessionId);
    // host keluar → oper ke pemain pertama yang tersisa
    if (wasHost) {
      const next = this.state.cars.keys().next();
      this.state.hostId = next.done ? "" : next.value;
      if (this.state.hostId) {
        console.log(`[kita-balapan:${this.state.roomCode}] host pindah`);
      }
    }
    console.log(`[kita-balapan:${this.state.roomCode}] a racer left`);
  }

  onDispose() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }
}
