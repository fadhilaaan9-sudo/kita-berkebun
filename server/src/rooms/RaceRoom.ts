import { Room, Client } from "@colyseus/core";
import {
  RACE_MSG,
  RaceCar,
  RaceState,
  SPAWN,
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
 * Room balapan MVP: fisika arcade jalan di client (responsif),
 * server menerima state mobil, validasi ringan, lalu broadcast
 * ke semua pemain. Lap/checkpoint menyusul di iterasi berikutnya.
 */
export class RaceRoom extends Room<RaceState> {
  maxClients = MAX_CLIENTS;

  onCreate(options: RaceJoinOptions) {
    let roomCode = sanitizeJoinCode(options.roomCode);
    if (roomCode.length !== 6) roomCode = generateJoinCode();
    this.setMetadata({ roomCode });
    this.setState(new RaceState());
    this.state.roomCode = roomCode;

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
    });

    console.log(`[kita-balapan] race room created — code: ${roomCode}`);
  }

  onJoin(client: Client, options: RaceJoinOptions) {
    const car = new RaceCar();
    car.id = client.sessionId;
    car.name = (options.name || "Pembalap").slice(0, 16);
    car.x = START_X;
    car.z = START_Z;
    car.angle = START_ANGLE;
    car.speed = 0;
    car.vehicle =
      typeof options.vehicle === "string" && VALID_VEHICLES.has(options.vehicle)
        ? options.vehicle
        : "vehicle-racer";
    this.state.cars.set(client.sessionId, car);
    console.log(`[kita-balapan:${this.state.roomCode}] ${car.name} joined`);
  }

  onLeave(client: Client) {
    this.state.cars.delete(client.sessionId);
    console.log(`[kita-balapan:${this.state.roomCode}] a racer left`);
  }
}
