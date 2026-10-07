import express from "express";
import { createServer } from "http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { FarmRoom } from "./rooms/FarmRoom.js";

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

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// filterBy(["farmCode"]): tamu dengan kode yang sama masuk ke room yang sudah
// ada, bukan membuat room baru.
gameServer.define("farm_room", FarmRoom).filterBy(["farmCode"]);

await gameServer.listen(port);
console.log(`[kebun-kita] server listening on ws://localhost:${port}`);
