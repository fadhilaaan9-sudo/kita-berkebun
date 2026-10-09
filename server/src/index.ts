import express from "express";
import { createServer } from "http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { FarmRoom } from "./rooms/FarmRoom.js";
import { RaceRoom } from "./rooms/RaceRoom.js";

const port = Number(process.env.PORT) || 2567;
const app = express();

// CORS: client jalan di origin berbeda (mis. localhost:3000 vs :2567),
// jadi endpoint HTTP harus mengizinkan fetch cross-origin dari browser.
// (Koneksi WebSocket Colyseus tidak butuh ini — makanya "Buat Kebun"
// bisa jalan sementara "Gabung" yang pakai fetch selalu gagal.)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }
  next();
});

app.get("/", (_req, res) => res.send("Kebun Kita — game server 🐄🌾"));

// Dipakai client sebelum join: pastikan kode yang dimasukkan benar-benar ada,
// supaya salah ketik tidak malah membuat kebun baru.
app.get("/api/farm/:code/exists", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const rooms = await matchMaker.query({ name: "farm_room" });
  const exists = rooms.some(
    (room) => (room.metadata as { farmCode?: string } | undefined)?.farmCode === code,
  );
  res.json({ exists });
});

// Versi balapan: cek kode room race sebelum join.
app.get("/api/race/:code/exists", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const rooms = await matchMaker.query({ name: "race_room" });
  const exists = rooms.some(
    (room) => (room.metadata as { roomCode?: string } | undefined)?.roomCode === code,
  );
  res.json({ exists });
});

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// filterBy(["farmCode"]): tamu yang joinOrCreate dengan kode yang sama
// diarahkan ke room yang SUDAH ADA (bukan bikin baru). PENTING: pencocokan
// dilakukan terhadap OPSI PEMBUATAN room (tersimpan di listing saat room
// dibuat), jadi host wajib mengirim farmCode asli di opsi create —
// kode yang di-generate di dalam onCreate tidak akan ikut tercocokkan.
gameServer.define("farm_room", FarmRoom).filterBy(["farmCode"]);
gameServer.define("race_room", RaceRoom).filterBy(["roomCode"]);

await gameServer.listen(port);
console.log(`[kebun-kita] server listening on ws://localhost:${port}`);
