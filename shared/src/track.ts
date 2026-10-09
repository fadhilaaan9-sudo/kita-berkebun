/**
 * Konstanta lintasan & fisika yang dipakai bareng client + server.
 */

/** Skala mobil (diukur dari GLB: racer 0.525 lebar vs aspal ~0.7 -> 0.6 pas). */
export const CAR_SCALE = 0.6;

/**
 * Skala lintasan: seluruh potongan jalan + dekorasi dibungkus satu grup
 * yang di-skala, jadi posisi dan ukuran ikut membesar bersamaan dan
 * tetap tersambung. Batas dinding & spawn dihitung dari skala ini.
 */
export const TRACK_SCALE = 2;

const S = TRACK_SCALE;

/** Ukuran grid lintasan (satuan build, sebelum skala). */
export const GRID = { x: 7, z: 4 }; // x: -7..7, z: -4..4

/** Jarak aman bodi mobil dari tepi (setengah lebar mobil + sedikit). */
export const WALL_MARGIN = 0.35;

/** Bukit roller-coaster di jalan lurus bawah barat (satuan world). */
export const HILLS = {
  z: GRID.z * S, // 8: garis tengah jalan
  x0: -6.5 * S, // awal zona (tile x=-6)
  x1: -2.5 * S, // akhir zona (tile x=-3)
  height: 0.27 * S, // tinggi puncak bukit
};

/** Jumlah lap untuk menang. */
export const TOTAL_LAPS = 3;

/**
 * Checkpoint berurutan (satuan world): [x, z, radius].
 * 0 = garis finis/start, sisanya mengikuti arah balapan.
 * Mobil harus melewati semuanya berurutan sebelum finis dihitung.
 */
export const CHECKPOINTS: Array<[number, number, number]> = [
  [8, 8, 2.5], // 0: garis finis (spawn)
  [14, 0, 2.5], // 1: sisi kanan (setelah tikungan kanan-bawah)
  [0, -8, 2.5], // 2: atas jembatan layang
  [-14, 0, 2.5], // 3: sisi kiri (setelah tikungan kiri-atas)
  [-9, 8, 2.5], // 4: bukit (jalan bawah barat)
];

/** Titik spawn: jalan lurus bawah, timur chicane, menghadap +x. */
export const SPAWN = { x: 4 * S, z: GRID.z * S, angle: Math.PI / 2 };

/** Tinggi bukit segitiga (naik-turun tiap 2 tile), x dalam world. */
function hillHeight(x: number): number {
  const local = (x - HILLS.x0) / S; // 0..4 (satuan build)
  const phase = ((local % 2) + 2) % 2; // 0..2
  const h = phase < 1 ? phase : 2 - phase; // 0→1→0
  return h * HILLS.height;
}

/**
 * Jembatan layang di jalan lurus atas: jalan menanjak, melewati
 * jembatan di atas jalan kota (dekorasi), lalu turun lagi.
 * (satuan world/dunia, bukan build)
 */
export const BRIDGE = {
  z: -GRID.z * S, // -8: garis tengah jalan lurus atas
  halfDeck: 1.5 * S, // |x| <= 3: dek penuh
  rampEnd: 2.5 * S, // |x| <= 5: tanjakan
  height: 0.5 * S, // 1.0: tinggi dek
};

/**
 * Tinggi permukaan jalan di (x, z). 0 di darat, naik mengikuti
 * tanjakan & dek jembatan. Kontinu (tidak ada lompatan).
 */
export function trackHeight(x: number, z: number): number {
  // jembatan layang (jalan atas)
  if (Math.abs(z - BRIDGE.z) < 0.6 * S) {
    const ax = Math.abs(x);
    if (ax <= BRIDGE.halfDeck) return BRIDGE.height;
    if (ax <= BRIDGE.rampEnd) {
      return (BRIDGE.height * (BRIDGE.rampEnd - ax)) / (BRIDGE.rampEnd - BRIDGE.halfDeck);
    }
  }
  // bukit roller-coaster (jalan bawah barat)
  if (Math.abs(z - HILLS.z) < 0.6 * S && x >= HILLS.x0 && x <= HILLS.x1) {
    return hillHeight(x);
  }
  return 0;
}

/**
 * Kemiringan hidung mobil (pitch, radian) mengikuti tanjakan.
 * Positif = hidung naik. Dipakai di grup dalam setelah yaw.
 */
export function trackPitch(x: number, z: number, angle: number): number {
  const e = 0.3;
  const dhdx = (trackHeight(x + e, z) - trackHeight(x - e, z)) / (2 * e);
  const dhdz = (trackHeight(x, z + e) - trackHeight(x, z - e)) / (2 * e);
  const slope = dhdx * Math.sin(angle) + dhdz * Math.cos(angle);
  return Math.atan(slope);
}

/**
 * Dinding tak terlihat (invisible guard rail): jepit posisi ke area lintasan.
 *
 * Lintasan didefinisikan sebagai daftar persegi (whitelist, satuan build):
 * [xMin, xMax, zMin, zMax]. Mobil valid jika di dalam salah satunya
 * (dengan margin); jika di luar semua, ditarik ke titik terdekat.
 * Dipakai client tiap frame dan server saat terima CAR_STATE (otoritatif).
 */
const AREAS: Array<[number, number, number, number]> = [
  [-7.5, 7.5, -4.5, -3.5], // jalan lurus atas (ada jembatan)
  [-7.5, -1.5, 3.5, 4.5], // jalan lurus bawah, barat chicane
  [-0.5, 7.5, 3.5, 4.5], // jalan lurus bawah, timur chicane
  [-2.5, -1.5, 3.5, 5.5], // chicane: kaki barat (vertikal)
  [-2.5, 0.5, 4.5, 5.5], // chicane: tengah (horizontal)
  [-0.5, 0.5, 3.5, 5.5], // chicane: kaki timur (vertikal)
  [-7.5, -6.5, -4.5, 4.5], // sisi kiri
  [6.5, 7.5, -4.5, 4.5], // sisi kanan
];

export function clampToTrack(p: { x: number; z: number }): void {
  const M = WALL_MARGIN;
  for (const [x0, x1, z0, z1] of AREAS) {
    if (p.x >= x0 * S + M && p.x <= x1 * S - M && p.z >= z0 * S + M && p.z <= z1 * S - M) {
      return; // di jalan, aman
    }
  }
  // di luar semua area: tarik ke titik terdekat
  let bx = p.x;
  let bz = p.z;
  let bd = Infinity;
  for (const [x0, x1, z0, z1] of AREAS) {
    const cx = Math.max(x0 * S + M, Math.min(x1 * S - M, p.x));
    const cz = Math.max(z0 * S + M, Math.min(z1 * S - M, p.z));
    const d = (cx - p.x) ** 2 + (cz - p.z) ** 2;
    if (d < bd) {
      bd = d;
      bx = cx;
      bz = cz;
    }
  }
  p.x = bx;
  p.z = bz;
}
