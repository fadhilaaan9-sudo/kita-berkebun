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

/**
 * Batas lintasan: sirkuit berbentuk cincin persegi panjang.
 * - Kotak luar: tepi tile terluar
 * - Lubang dalam: rumput tengah yang tidak boleh dimasuki
 */
export const TRACK_OUT = { x: (GRID.x + 0.5) * S, z: (GRID.z + 0.5) * S };
export const TRACK_IN = { x: (GRID.x - 0.5) * S, z: (GRID.z - 0.5) * S };
/** Jarak aman bodi mobil dari tepi (setengah lebar mobil + sedikit). */
export const WALL_MARGIN = 0.35;

/** Titik spawn: tengah jalan lurus bawah, menghadap +x. */
export const SPAWN = { x: 0, z: GRID.z * S, angle: Math.PI / 2 };

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
  if (Math.abs(z - BRIDGE.z) < 0.6 * S) {
    const ax = Math.abs(x);
    if (ax <= BRIDGE.halfDeck) return BRIDGE.height;
    if (ax <= BRIDGE.rampEnd) {
      return (BRIDGE.height * (BRIDGE.rampEnd - ax)) / (BRIDGE.rampEnd - BRIDGE.halfDeck);
    }
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
 * Dinding tak terlihat (invisible guard rail): jepit posisi ke cincin lintasan.
 * Dipakai client tiap frame (fisika lokal) dan server saat terima CAR_STATE
 * (otoritatif, anti-cheat kasar). Mobil yang menabrak dinding akan meluncur
 * mengikutinya.
 */
export function clampToTrack(p: { x: number; z: number }): void {
  const ox = TRACK_OUT.x - WALL_MARGIN;
  const oz = TRACK_OUT.z - WALL_MARGIN;
  p.x = Math.max(-ox, Math.min(ox, p.x));
  p.z = Math.max(-oz, Math.min(oz, p.z));
  // jangan masuk lubang rumput tengah (diperlebar margin dari sisi dalam)
  const ix = TRACK_IN.x + WALL_MARGIN;
  const iz = TRACK_IN.z + WALL_MARGIN;
  if (Math.abs(p.x) < ix && Math.abs(p.z) < iz) {
    const dx = ix - Math.abs(p.x);
    const dz = iz - Math.abs(p.z);
    if (dx < dz) p.x = (p.x >= 0 ? 1 : -1) * ix;
    else p.z = (p.z >= 0 ? 1 : -1) * iz;
  }
}
