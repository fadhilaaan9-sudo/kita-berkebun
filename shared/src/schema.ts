import { Schema, MapSchema, type } from "@colyseus/schema";

/**
 * Satu-satunya sumber kebenaran untuk bentuk state game.
 * Dipakai server (authoritative) dan client (render). Kalau mau ubah
 * struktur data, ubah di sini — kedua sisi ikut.
 */

export const CROPS = {
  gandum: { growthMs: 2 * 60 * 1000, seedCost: 5, sellPrice: 12, label: "Gandum" },
  wortel: { growthMs: 4 * 60 * 1000, seedCost: 10, sellPrice: 25, label: "Wortel" },
  labu: { growthMs: 8 * 60 * 1000, seedCost: 20, sellPrice: 55, label: "Labu" },
} as const;
export type CropKind = keyof typeof CROPS;

export type PlotState = "wild" | "tilled" | "planted" | "ready";
export type AnimalKind = "cow" | "chicken";

export class Player extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("number") x: number = 0;
  @type("number") z: number = 0;
  @type("boolean") isHost: boolean = false;
}

export class Plot extends Schema {
  @type("string") id: string = "";
  @type("number") gx: number = 0;
  @type("number") gz: number = 0;
  @type("string") state: PlotState = "wild";
  /** nama crop dari CROPS, atau "" kalau kosong */
  @type("string") crop: string = "";
  @type("boolean") watered: boolean = false;
  /** timestamp (ms) kapan ditanam */
  @type("number") plantedAt: number = 0;
}

export class Animal extends Schema {
  @type("string") id: string = "";
  @type("string") kind: AnimalKind = "cow";
  @type("number") x: number = 0;
  @type("number") z: number = 0;
  /** 0–100, kalau rendah hewan berhenti menghasilkan */
  @type("number") hunger: number = 100;
  @type("boolean") produceReady: boolean = false;
  /** timestamp (ms) terakhir hasil diambil */
  @type("number") lastCollected: number = 0;
}

export class FarmState extends Schema {
  @type("string") farmCode: string = "";
  /** koin milik kebun (shared, co-op) */
  @type("number") coins: number = 0;
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Plot }) plots = new MapSchema<Plot>();
  @type({ map: Animal }) animals = new MapSchema<Animal>();
}

/* ================= RACING (MVP) ================= */

export class RaceCar extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  /** posisi di dunia */
  @type("number") x: number = 0;
  @type("number") z: number = 0;
  /** arah hadap (radian). forward = (sin(angle), cos(angle)) di bidang XZ */
  @type("number") angle: number = 0;
  @type("number") speed: number = 0;
  /** nama file model, mis. "vehicle-racer" */
  @type("string") vehicle: string = "vehicle-racer";
}

export class RaceState extends Schema {
  @type("string") roomCode: string = "";
  @type({ map: RaceCar }) cars = new MapSchema<RaceCar>();
}
