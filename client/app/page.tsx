"use client";

import { useState } from "react";
import type { Room } from "colyseus.js";
import { CROPS, FarmState, type CropKind } from "@kebun-kita/shared";
import { createFarm, joinFarm } from "@/lib/net";
import FarmScene from "@/components/FarmScene";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Terjadi kesalahan.";
}

export default function Home() {
  const [phase, setPhase] = useState<"menu" | "playing">("menu");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [room, setRoom] = useState<Room<FarmState> | null>(null);
  const [crop, setCrop] = useState<CropKind>("gandum");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [coins, setCoins] = useState(0);
  const [farmCode, setFarmCode] = useState("");
  const [players, setPlayers] = useState<{ id: string; name: string; isHost: boolean }[]>([]);

  const attach = (r: Room<FarmState>) => {
    const sync = () => {
      setCoins(r.state.coins);
      setFarmCode(r.state.farmCode);
      setPlayers(
        Array.from(r.state.players.values()).map((p) => ({ id: p.id, name: p.name, isHost: p.isHost })),
      );
    };
    sync();
    r.onStateChange(() => sync());
    setRoom(r);
    setPhase("playing");
  };

  const handleCreate = async () => {
    setError("");
    setBusy(true);
    try {
      attach(await createFarm(name.trim() || "Petani"));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    setError("");
    setBusy(true);
    try {
      attach(await joinFarm(code, name.trim() || "Petani"));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    await room?.leave();
    room?.removeAllListeners();
    setRoom(null);
    setPhase("menu");
    setCode("");
  };

  if (phase === "menu" || !room) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-sky-200 to-green-200 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-green-800">🌱 Kebun Kita</h1>
          <p className="text-sm text-gray-500 mt-1 mb-6">
            Bertani & beternak bareng teman, langsung dari browser.
          </p>

          <label className="block text-sm font-medium text-gray-700 mb-1">Nama kamu</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="mis. Ferhen"
            maxLength={16}
            className="w-full border rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-green-500"
          />

          <button
            onClick={handleCreate}
            disabled={busy}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-lg px-3 py-2 mb-4"
          >
            {busy ? "Menyambung…" : "Buat Kebun Baru"}
          </button>

          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">atau gabung</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Kode: K3BUN1"
              maxLength={6}
              className="flex-1 border rounded-lg px-3 py-2 uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={handleJoin}
              disabled={busy}
              className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-2"
            >
              Gabung
            </button>
          </div>

          {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

          <p className="text-xs text-gray-400 mt-6">
            Pastikan server game nyala di <code>ws://localhost:2567</code> (jalankan{" "}
            <code>npm run dev</code> dari root repo).
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen w-screen relative">
      <FarmScene room={room} crop={crop} />

      {/* HUD atas */}
      <div className="absolute top-3 left-3 flex gap-2 items-center">
        <div className="bg-black/60 text-white rounded-lg px-3 py-1.5 text-sm font-semibold">
          🪙 {coins}
        </div>
        <button
          onClick={() => navigator.clipboard?.writeText(farmCode)}
          title="Klik untuk salin kode"
          className="bg-black/60 text-white rounded-lg px-3 py-1.5 text-sm font-mono tracking-widest hover:bg-black/80"
        >
          🔑 {farmCode}
        </button>
      </div>

      {/* daftar pemain */}
      <div className="absolute top-3 right-3 bg-black/60 text-white rounded-lg px-3 py-2 text-sm">
        <p className="font-semibold mb-1">👥 Pemain ({players.length}/4)</p>
        {players.map((p) => (
          <p key={p.id}>
            {p.name} {p.isHost && <span title="Host">👑</span>}
          </p>
        ))}
        <button onClick={handleLeave} className="mt-2 text-xs underline text-gray-300 hover:text-white">
          Keluar kebun
        </button>
      </div>

      {/* pilih bibit */}
      <div className="absolute bottom-3 left-3 flex gap-2">
        {(Object.keys(CROPS) as CropKind[]).map((c) => (
          <button
            key={c}
            onClick={() => setCrop(c)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              crop === c ? "bg-green-600 text-white" : "bg-black/60 text-white hover:bg-black/80"
            }`}
          >
            🌱 {CROPS[c].label}
          </button>
        ))}
      </div>

      {/* bantuan */}
      <div className="absolute bottom-3 right-3 bg-black/60 text-white rounded-lg px-3 py-2 text-xs max-w-[220px]">
        <p>
          <b>WASD</b> jalan · <b>klik petak</b>: cangkul → tanam → siram → panen ·
          <b> klik hewan</b>: kasih makan / ambil hasil (kuning)
        </p>
      </div>
    </main>
  );
}
