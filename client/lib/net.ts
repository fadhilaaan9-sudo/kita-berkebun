import { Client, Room } from "colyseus.js";
import { generateJoinCode, type FarmState, type RaceState } from "@kebun-kita/shared";

let client: Client | null = null;

/**
 * Alamat server game ikut hostname halaman (penting untuk main via LAN:
 * "localhost" di browser tamu artinya laptop si tamu sendiri).
 */
function wsUrl(): string {
  if (process.env.NEXT_PUBLIC_COLYSEUS_URL) return process.env.NEXT_PUBLIC_COLYSEUS_URL;
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `ws://${window.location.hostname}:2567`;
  }
  return "ws://localhost:2567";
}

function httpUrl(): string {
  return wsUrl().replace(/^ws/, "http");
}

export function getClient(): Client {
  if (!client) client = new Client(wsUrl());
  return client;
}

/** Host membuat kebun baru. (mode pertanian — tidak dipakai di branch balapan) */
export async function createFarm(name: string): Promise<Room<FarmState>> {
  const farmCode = generateJoinCode();
  return getClient().create<FarmState>("farm_room", { name, farmCode });
}

/** Tamu gabung kebun pakai kode. (mode pertanian — tidak dipakai di branch balapan) */
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

/* ================= MODE BALAPAN ================= */

export const VEHICLES = [
  "vehicle-racer",
  "vehicle-speedster",
  "vehicle-drag-racer",
  "vehicle-vintage-racer",
  "vehicle-monster-truck",
  "vehicle-suv",
  "vehicle-truck",
  "vehicle-racer-low",
] as const;
export type VehicleKind = (typeof VEHICLES)[number];

/** Host membuat room balapan baru. Kode di-generate di client (lihat catatan di createFarm). */
export async function createRace(name: string, vehicle: string): Promise<Room<RaceState>> {
  const roomCode = generateJoinCode();
  return getClient().create<RaceState>("race_room", { name, roomCode, vehicle });
}

/** Tamu gabung balapan pakai kode. */
export async function joinRace(
  code: string,
  name: string,
  vehicle: string,
): Promise<Room<RaceState>> {
  const clean = code.trim().toUpperCase();
  if (!clean) throw new Error("Masukkan kode balapan dulu.");
  let res: Response;
  try {
    res = await fetch(`${httpUrl()}/api/race/${clean}/exists`);
  } catch {
    throw new Error("Server game tidak terjangkau. Pastikan server nyala.");
  }
  if (!res.ok) throw new Error("Server game tidak terjangkau.");
  const { exists } = (await res.json()) as { exists: boolean };
  if (!exists) throw new Error("Kode balapan tidak ditemukan. Cek lagi ya.");
  return getClient().joinOrCreate<RaceState>("race_room", { name, roomCode: clean, vehicle });
}

/**
 * Tunggu sampai state awal benar-benar terisi datanya.
 *
 * Colyseus me-resolve create()/joinOrCreate() begitu handshake JOIN_ROOM
 * selesai — saat itu room.state sudah ada bentuknya tapi valuenya masih
 * undefined. Isi aslinya datang sesaat setelahnya lewat pesan ROOM_STATE
 * pertama. Baca state sebelum itu = crash.
 */
export function waitForInitialState<T>(room: Room<T>, timeoutMs = 8000): Promise<void> {
  const st = room.state as unknown as { cars?: unknown; players?: unknown } | undefined;
  if (st && (st.cars !== undefined || st.players !== undefined)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Gagal menerima data dari server. Coba lagi."));
    }, timeoutMs);
    room.onStateChange.once(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
