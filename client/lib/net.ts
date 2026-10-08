import { Client, Room } from "colyseus.js";
import { generateJoinCode, type FarmState } from "@kebun-kita/shared";

let client: Client | null = null;

/**
 * Alamat server game.
 *
 * PENTING untuk main bareng via LAN: jangan hardcode "localhost", karena
 * JavaScript jalan di browser TAMU — "localhost" di sana artinya laptop
 * si tamu sendiri, bukan laptop host. Jadi hostname diambil dari alamat
 * yang dipakai membuka halaman web ini:
 *  - buka http://localhost:3000      -> server ws://localhost:2567
 *  - buka http://192.168.1.5:3000    -> server ws://192.168.1.5:2567
 *
 * Kalau nanti di-deploy (bukan LAN), set NEXT_PUBLIC_COLYSEUS_URL
 * ke alamat server aslinya.
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

/** Host membuat kebun baru.
 *
 *  Kode di-generate di CLIENT dan dikirim sebagai opsi pembuatan room.
 *  Ini penting: Colyseus filterBy() mencocokkan tamu berdasarkan OPSI
 *  PEMBUATAN room (yang tersimpan di listing), bukan berdasarkan metadata
 *  atau state yang di-set di onCreate. Kalau kode di-generate di server
 *  (di dalam onCreate), listing room tercatat dengan farmCode kosong dan
 *  tamu tidak akan pernah menemukan room yang benar — mereka malah
 *  dibuatkan room baru yang kebetulan kodenya sama!
 */
export async function createFarm(name: string): Promise<Room<FarmState>> {
  const farmCode = generateJoinCode();
  return getClient().create<FarmState>("farm_room", { name, farmCode });
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

/**
 * Tunggu sampai state awal benar-benar terisi datanya.
 *
 * Colyseus me-resolve create()/joinOrCreate() begitu handshake JOIN_ROOM
 * selesai — saat itu room.state sudah ada bentuknya (keys-nya ada) tapi
 * semua valuenya masih undefined. Isi aslinya datang sesaat setelahnya
 * lewat pesan ROOM_STATE pertama. Baca state sebelum itu = crash
 * "Cannot read properties of undefined (reading 'values')".
 */
export function waitForInitialState(room: Room<FarmState>, timeoutMs = 8000): Promise<void> {
  if (room.state && room.state.players !== undefined) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Gagal menerima data kebun dari server. Coba lagi."));
    }, timeoutMs);
    room.onStateChange.once(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
