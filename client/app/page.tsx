"use client";

import { useState } from "react";
import type { Room } from "colyseus.js";
import {
  BAG_UPGRADE_COST,
  FEEDS,
  MSG,
  PRODUCE,
  SEEDS,
  FarmState,
  type CropKind,
  type NoticePayload,
} from "@kebun-kita/shared";
import { createFarm, joinFarm, waitForInitialState } from "@/lib/net";
import FarmScene from "@/components/FarmScene";

/** Semua item yang dikenal client, untuk label & ikon di UI. */
const ITEM_META: Record<string, { label: string; emoji: string }> = {};
for (const [id, s] of Object.entries(SEEDS)) ITEM_META[id] = { label: s.label, emoji: s.emoji };
for (const [id, f] of Object.entries(FEEDS)) ITEM_META[id] = { label: f.label, emoji: f.emoji };
for (const [id, p] of Object.entries(PRODUCE)) ITEM_META[id] = { label: p.label, emoji: p.emoji };

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Terjadi kesalahan.";
}

interface InvItem {
  id: string;
  qty: number;
}

interface Notice {
  id: number;
  text: string;
}

export default function Home() {
  const [phase, setPhase] = useState<"menu" | "playing">("menu");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [room, setRoom] = useState<Room<FarmState> | null>(null);
  const [selectedSeed, setSelectedSeed] = useState<string>("seed_gandum");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [coins, setCoins] = useState(0);
  const [farmCode, setFarmCode] = useState("");
  const [players, setPlayers] = useState<{ id: string; name: string; isHost: boolean }[]>([]);
  const [inventory, setInventory] = useState<InvItem[]>([]);
  const [maxSlots, setMaxSlots] = useState(12);
  const [isHost, setIsHost] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopTab, setShopTab] = useState<"beli" | "jual" | "upgrade">("beli");
  const [notices, setNotices] = useState<Notice[]>([]);

  const pushNotice = (text: string) => {
    const id = Date.now() + Math.random();
    setNotices((ns) => [...ns.slice(-2), { id, text }]);
    setTimeout(() => setNotices((ns) => ns.filter((n) => n.id !== id)), 3500);
  };

  const attach = (r: Room<FarmState>) => {
    const sync = () => {
      // Jaga-jaga: state bisa belum lengkap saat callback pertama
      if (!r.state || r.state.players === undefined) return;
      setCoins(r.state.coins);
      setFarmCode(r.state.farmCode);
      setMaxSlots(r.state.maxSlots);
      const me = r.state.players.get(r.sessionId);
      setIsHost(!!me?.isHost);
      setPlayers(
        Array.from(r.state.players.values()).map((p) => ({ id: p.id, name: p.name, isHost: p.isHost })),
      );
      const inv = Array.from(r.state.inventory.values()).map((it) => ({ id: it.id, qty: it.qty }));
      setInventory(inv);
      // kalau bibit terpilih habis, pindah ke bibit lain yang ada
      setSelectedSeed((cur) => {
        if (inv.some((it) => it.id === cur && it.qty > 0)) return cur;
        const alt = inv.find((it) => it.id.startsWith("seed_") && it.qty > 0);
        return alt ? alt.id : cur;
      });
    };
    sync();
    r.onStateChange(() => sync());
    r.onMessage(MSG.NOTICE, (data: NoticePayload) => pushNotice(data.text));
    setRoom(r);
    setPhase("playing");
  };

  const handleCreate = async () => {
    setError("");
    setBusy(true);
    let r: Room<FarmState> | null = null;
    try {
      r = await createFarm(name.trim() || "Petani");
      await waitForInitialState(r);
      attach(r);
    } catch (e) {
      // Bersihkan room yang gagal attach supaya tidak jadi room zombie di server
      if (r) {
        try {
          await r.leave();
        } catch {
          /* abaikan */
        }
        r.removeAllListeners();
      }
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    setError("");
    setBusy(true);
    let r: Room<FarmState> | null = null;
    try {
      r = await joinFarm(code, name.trim() || "Petani");
      await waitForInitialState(r);
      attach(r);
    } catch (e) {
      if (r) {
        try {
          await r.leave();
        } catch {
          /* abaikan */
        }
        r.removeAllListeners();
      }
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
    setShopOpen(false);
    setNotices([]);
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

  const crop: CropKind = (SEEDS[selectedSeed as keyof typeof SEEDS]?.crop ?? "gandum");
  const seedQty = (id: string) => inventory.find((it) => it.id === id)?.qty ?? 0;
  const buy = (itemId: string, qty: number) => room.send(MSG.SHOP_BUY, { itemId, qty });
  const sell = (itemId: string, qty: number) => room.send(MSG.SHOP_SELL, { itemId, qty });
  const sellables = inventory.filter((it) => it.id in PRODUCE);

  return (
    <main className="h-screen w-screen relative">
      <FarmScene room={room} crop={crop} onOpenKiosk={() => setShopOpen(true)} />

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
        <button
          onClick={() => setShopOpen(true)}
          className="bg-orange-600/90 text-white rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-orange-600"
        >
          🏪 Kios
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

      {/* toast notice */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 flex flex-col gap-2 items-center pointer-events-none">
        {notices.map((n) => (
          <div
            key={n.id}
            className="bg-red-900/90 text-white rounded-lg px-4 py-2 text-sm font-medium shadow-lg"
          >
            {n.text}
          </div>
        ))}
      </div>

      {/* inventory bar */}
      <div className="absolute bottom-3 left-3 flex gap-2 items-center max-w-[62vw] overflow-x-auto">
        <div
          title={`Tas bersama: ${inventory.length}/${maxSlots} slot`}
          className="bg-black/60 text-white rounded-lg px-3 py-1.5 text-sm font-semibold shrink-0"
        >
          🎒 {inventory.length}/{maxSlots}
        </div>
        {inventory.map((it) => {
          const meta = ITEM_META[it.id];
          if (!meta) return null;
          const isSeed = it.id.startsWith("seed_");
          const selected = selectedSeed === it.id;
          return (
            <button
              key={it.id}
              disabled={!isSeed}
              onClick={() => isSeed && setSelectedSeed(it.id)}
              title={meta.label}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold shrink-0 ${
                selected
                  ? "bg-green-600 text-white"
                  : isSeed
                    ? "bg-black/60 text-white hover:bg-black/80"
                    : "bg-black/40 text-white cursor-default"
              }`}
            >
              {meta.emoji} ×{it.qty}
            </button>
          );
        })}
      </div>

      {/* bantuan */}
      <div className="absolute bottom-3 right-3 bg-black/60 text-white rounded-lg px-3 py-2 text-xs max-w-[230px]">
        <p>
          <b>WASD</b> jalan · <b>klik petak</b>: cangkul → tanam → siram → panen ·
          <b> klik hewan</b>: makan / ambil hasil (kuning = siap, merah = butuh pakan) · bibit & pakan
          beli di <b>🏪 Kios</b>
        </p>
      </div>

      {/* modal kios */}
      {shopOpen && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-1">
              <h2 className="text-xl font-bold">🏪 Kios</h2>
              <button
                onClick={() => setShopOpen(false)}
                className="text-gray-500 hover:text-gray-800 text-xl px-2"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">🪙 Koin kebun: {coins}</p>

            <div className="flex gap-2 mb-4">
              {(["beli", "jual", "upgrade"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setShopTab(t)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize ${
                    shopTab === t ? "bg-orange-600 text-white" : "bg-gray-100 hover:bg-gray-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {shopTab === "beli" && (
              <div className="flex flex-col gap-2">
                {Object.entries({ ...SEEDS, ...FEEDS }).map(([id, item]) => (
                  <div key={id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                    <span className="text-sm font-medium">
                      {item.emoji} {item.label}
                      <span className="text-gray-500"> — 🪙{item.price}</span>
                      <span className="text-gray-400 text-xs"> (punya ×{seedQty(id)})</span>
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => buy(id, 1)}
                        className="bg-green-600 text-white text-xs font-semibold rounded px-2 py-1 hover:bg-green-700"
                      >
                        +1
                      </button>
                      <button
                        onClick={() => buy(id, 5)}
                        className="bg-green-600 text-white text-xs font-semibold rounded px-2 py-1 hover:bg-green-700"
                      >
                        +5
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {shopTab === "jual" && (
              <div className="flex flex-col gap-2">
                {sellables.length === 0 && (
                  <p className="text-sm text-gray-500">Belum ada hasil untuk dijual. Panen dulu! 🌱</p>
                )}
                {sellables.map((it) => {
                  const p = PRODUCE[it.id as keyof typeof PRODUCE];
                  return (
                    <div key={it.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                      <span className="text-sm font-medium">
                        {p.emoji} {p.label} ×{it.qty}
                        <span className="text-gray-500"> — 🪙{p.sellPrice}/pcs</span>
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => sell(it.id, 1)}
                          className="bg-orange-600 text-white text-xs font-semibold rounded px-2 py-1 hover:bg-orange-700"
                        >
                          Jual 1
                        </button>
                        <button
                          onClick={() => sell(it.id, it.qty)}
                          className="bg-orange-600 text-white text-xs font-semibold rounded px-2 py-1 hover:bg-orange-700"
                        >
                          Jual semua
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {shopTab === "upgrade" && (
              <div className="flex flex-col gap-3">
                <div className="border rounded-lg px-3 py-3">
                  <p className="font-semibold text-sm">🎒 Tas II</p>
                  <p className="text-xs text-gray-500 mb-2">
                    Kapasitas {maxSlots} → 20 slot. Hanya host yang bisa membeli.
                  </p>
                  <button
                    onClick={() => room.send(MSG.UPGRADE_BAG, {})}
                    disabled={maxSlots >= 20 || !isHost}
                    className="bg-purple-600 text-white text-sm font-semibold rounded-lg px-3 py-1.5 disabled:opacity-40 hover:bg-purple-700"
                  >
                    {maxSlots >= 20 ? "Sudah maksimal" : `Beli — 🪙${BAG_UPGRADE_COST}`}
                  </button>
                  {!isHost && maxSlots < 20 && (
                    <p className="text-xs text-gray-400 mt-1">Minta host untuk membeli upgrade ini.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
