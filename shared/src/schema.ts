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

/** Bibit: dibeli di kios, dikonsumsi saat menanam. */
export const SEEDS = {
  seed_gandum: { crop: "gandum" as CropKind, price: 5, label: "Bibit Gandum", emoji: "🌾" },
  seed_wortel: { crop: "wortel" as CropKind, price: 10, label: "Bibit Wortel", emoji: "🥕" },
  seed_labu: { crop: "labu" as CropKind, price: 20, label: "Bibit Labu", emoji: "🎃" },
} as const;
export type SeedKind = keyof typeof SEEDS;

/** Pakan: dibeli di kios, dikonsumsi saat memberi makan. */
export const FEEDS = {
  feed_chicken: { animal: "chicken" as const, price: 2, label: "Pakan Ayam", emoji: "🌽" },
  feed_cow: { animal: "cow" as const, price: 3, label: "Pakan Sapi", emoji: "🥬" },
} as const;
export type FeedKind = keyof typeof FEEDS;

/** Hasil: didapat dari panen/koleksi, dijual di kios. */
export const PRODUCE = {
  prod_gandum: { sellPrice: 12, label: "Gandum", emoji: "🌾" },
  prod_wortel: { sellPrice: 25, label: "Wortel", emoji: "🥕" },
  prod_labu: { sellPrice: 55, label: "Labu", emoji: "🎃" },
  egg: { sellPrice: 5, label: "Telur", emoji: "🥚" },
  milk: { sellPrice: 15, label: "Susu", emoji: "🥛" },
} as const;
export type ProduceKind = keyof typeof PRODUCE;

/** Berapa kali pakan per siklus sampai hasil mulai diproduksi (GDD). */
export const FEEDS_NEEDED: Record<AnimalKind, number> = { chicken: 1, cow: 2 };

export const BAG_SLOTS_1 = 12;
export const BAG_SLOTS_2 = 20;
export const BAG_UPGRADE_COST = 150;

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

export class InventoryItem extends Schema {
  @type("string") id: string = "";
  @type("number") qty: number = 0;
}

export class Animal extends Schema {
  @type("string") id: string = "";
  @type("string") kind: AnimalKind = "cow";
  @type("number") x: number = 0;
  @type("number") z: number = 0;
  /** target jalan acak di dalam kandang */
  @type("number") tx: number = 0;
  @type("number") tz: number = 0;
  /** berapa kali sudah diberi pakan di siklus ini */
  @type("number") feedsGiven: number = 0;
  /** timestamp (ms) saat kebutuhan pakan siklus ini terpenuhi */
  @type("number") fedAt: number = 0;
  @type("boolean") produceReady: boolean = false;
}

export class FarmState extends Schema {
  @type("string") farmCode: string = "";
  /** koin milik kebun (shared, co-op) */
  @type("number") coins: number = 0;
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Plot }) plots = new MapSchema<Plot>();
  @type({ map: Animal }) animals = new MapSchema<Animal>();
  /** tas bersama: itemId -> jumlah (tiap jenis = 1 slot) */
  @type({ map: InventoryItem }) inventory = new MapSchema<InventoryItem>();
  @type("number") maxSlots: number = BAG_SLOTS_1;
}
