import { Client, Room } from "colyseus.js";
import type { FarmState } from "@kebun-kita/shared";

let client: Client | null = null;

function wsUrl(): string {
  return process.env.NEXT_PUBLIC_COLYSEUS_URL || "ws://localhost:2567";
}

function httpUrl(): string {
  return wsUrl().replace(/^ws/, "http");
}

export function getClient(): Client {
  if (!client) client = new Client(wsUrl());
  return client;
}

/** Host membuat kebun baru — server yang generate kode 6 digit. */
export async function createFarm(name: string): Promise<Room<FarmState>> {
  return getClient().create<FarmState>("farm_room", { name, farmCode: "" });
}

/** Tamu gabung pakai kode. Kode dicek dulu via HTTP supaya salah ketik
 *  menampilkan error, bukan malah membuat kebun baru. */
export async function joinFarm(code: string, name: string): Promise<Room<FarmState>> {
  const clean = code.trim().toUpperCase();
  if (!clean) throw new Error("Masukkan kode kebun dulu.");
  let res: Response;
  try {
    res = await fetch(`${httpUrl()}/api/farm/${clean}/exists`);
  } catch {
    throw new Error("Server game tidak terjangkau. Pastikan server nyala.");
  }
  if (!res.ok) throw new Error("Server game tidak terjangkau.");
  const { exists } = (await res.json()) as { exists: boolean };
  if (!exists) throw new Error("Kode kebun tidak ditemukan. Cek lagi ya.");
  return getClient().joinOrCreate<FarmState>("farm_room", { name, farmCode: clean });
}
