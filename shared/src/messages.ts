import type { CropKind } from "./schema.js";

/** Nama pesan client → server. Server yang memvalidasi semuanya. */
export const MSG = {
  MOVE: "move",
  TILL: "till",
  PLANT: "plant",
  WATER: "water",
  HARVEST: "harvest",
  FEED: "feed",
  COLLECT: "collect",
} as const;

export interface MovePayload {
  x: number;
  z: number;
}

export interface PlotPayload {
  plotId: string;
}

export interface PlantPayload {
  plotId: string;
  crop: CropKind;
}

export interface AnimalPayload {
  animalId: string;
}

/** Pesan untuk mode balapan. */
export const RACE_MSG = {
  /** client -> server: posisi mobil (dikirim rutin saat menyetir) */
  CAR_STATE: "car_state",
  /** client(host) -> server: mulai hitungan mundur */
  START_RACE: "start_race",
} as const;

export interface CarStatePayload {
  x: number;
  z: number;
  angle: number;
  speed: number;
}
