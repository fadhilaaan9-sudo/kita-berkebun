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
  SHOP_BUY: "shop_buy",
  SHOP_SELL: "shop_sell",
  UPGRADE_BAG: "upgrade_bag",
  /** server → client: pesan kegagalan/info untuk ditampilkan sebagai toast */
  NOTICE: "notice",
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

export interface ShopPayload {
  itemId: string;
  qty: number;
}

export interface NoticePayload {
  text: string;
}
