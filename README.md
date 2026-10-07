# Kebun Kita 🌱🐄

Game survival pertanian & peternakan 3D multiplayer yang jalan langsung di browser.
Satu kebun = satu room; teman bisa gabung pakai **kode 6 digit**.

> Status: **skeleton MVP** — fondasi monorepo + koneksi client-server + join code.
> Lihat `kebun-kita-gdd-mvp.pdf` (Game Design Doc) untuk visi lengkapnya.

## Struktur monorepo

```
kebun-kita/
├── client/   # Next.js + react-three-fiber (Three.js ala React) → deploy ke Vercel
├── server/   # Colyseus (Node.js) — room, state, kode join, logika authoritative → VPS/Railway/dll
└── shared/   # Skema state + tipe pesan, dipakai client & server (satu sumber kebenaran)
```

Satu repo dipilih supaya perubahan protokol (mis. format pesan "panen") selalu
sinkron antara client dan server dalam satu commit.

## Cara jalan (lokal)

```bash
npm install     # install semua workspace sekaligus
npm run dev     # server di ws://localhost:2567, client di http://localhost:3000
```

1. Buka `http://localhost:3000`, isi nama, klik **Buat Kebun** → dapat kode (mis. `K3BUN1`).
2. Buka tab/browser lain, klik **Gabung**, masukkan kode → dua pemain dalam satu kebun.
3. Kontrol: **WASD / panah** jalan, **klik petak** untuk cangkul → tanam → siram → panen,
   **klik hewan** untuk kasih makan / ambil hasil (kuning = siap diambil).

## Deploy

- **Client → Vercel:** import repo, set *Root Directory* = `client`,
  env `NEXT_PUBLIC_COLYSEUS_URL=wss://<domain-server-game>`.
- **Server → VPS / Railway / Render / Fly.io:** *Root Directory* = `server`,
  `npm run build && npm start`, env `PORT=2567`. Butuh proses yang selalu nyala
  (Vercel tidak cocok untuk ini).

## Alur join code

1. Host: `POST joinOrCreate("farm_room", { farmCode: "" })` → server generate kode.
2. Tamu: `GET /api/farm/:code/exists` → kalau ada, `joinOrCreate("farm_room", { farmCode })`.
3. `filterBy(["farmCode"])` memastikan tamu masuk room yang kodenya cocok,
   bukan bikin room baru.

## Peta jalan (dari GDD)

- [x] M0 — skeleton: monorepo, room, join code, gerak & klik dasar
- [ ] M1 — prototipe single-player: farming penuh 1 tanaman
- [ ] M2 — farming 3 tanaman + ternak (sapi & ayam) + toko
- [ ] M3 — multiplayer penuh: peran host/tamu, anti-griefing
- [ ] M4 — persistensi: PostgreSQL + Redis, kode kebun permanen
- [ ] M5 — playtest, poles, rilis publik
