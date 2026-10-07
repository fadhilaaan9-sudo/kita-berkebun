// Huruf ambigu (I, O, L, 0, 1) dibuang supaya kode gampang dibaca/dikte.
// crypto.getRandomValues tersedia di Node 20+ maupun browser modern,
// jadi fungsi ini bisa dipakai server maupun client.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateJoinCode(length = 6): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

/** Bersihkan kode dari input: uppercase, hanya A-Z/0-9, maks 6 karakter. */
export function sanitizeJoinCode(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
