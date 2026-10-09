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

/**
 * Batas lintasan: sirkuit berbentuk cincin persegi panjang.
 * - Kotak luar: tepi tile terluar
 * - Lubang dalam: rumput tengah yang tidak boleh dimasuki
 */
export const TRACK_OUT = { x: 5.5 * S, z: 3.5 * S };
export const TRACK_IN = { x: 4.5 * S, z: 2.5 * S };
/** Jarak aman bodi mobil dari tepi (setengah lebar mobil + sedikit). */
export const WALL_MARGIN = 0.35;

/** Titik spawn: tengah jalan lurus bawah, menghadap +x. */
export const SPAWN = { x: 0, z: 3 * S, angle: Math.PI / 2 };

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
