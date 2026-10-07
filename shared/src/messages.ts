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
