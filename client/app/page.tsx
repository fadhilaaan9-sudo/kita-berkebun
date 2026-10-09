"use client";

import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { RaceState, TOTAL_LAPS, RACE_MSG } from "@kebun-kita/shared";
import { VEHICLES, createRace, joinRace, waitForInitialState } from "@/lib/net";
import RaceScene, { useMySpeed } from "@/components/RaceScene";
import type { CarPose } from "@/components/RaceModels";
import { SPAWN } from "@kebun-kita/shared";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Terjadi kesalahan.";
}

function vehicleLabel(v: string): string {
  return v
    .replace("vehicle-", "")
    .split("-")
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(" ");
}

function GameHud({
  room,
  poseRef,
  onLeave,
}: {
  room: Room<RaceState>;
  poseRef: React.MutableRefObject<CarPose>;
  onLeave: () => void;
}) {
  const speed = useMySpeed(poseRef);
  const [roomCode, setRoomCode] = useState("");
  const [cars, setCars] = useState<{ id: string; name: string; lap: number }[]>([]);
  const [phase, setPhase] = useState("waiting");
  const [countdown, setCountdown] = useState(3);
  const [winnerName, setWinnerName] = useState("");
  const [myId, setMyId] = useState("");
  const [hostId, setHostId] = useState("");

  // sinkron ringan untuk HUD
  useEffect(() => {
    const sync = () => {
      if (!room.state || room.state.cars === undefined) return;
      setRoomCode(room.state.roomCode);
      setCars(
        Array.from(room.state.cars.values()).map((c) => ({ id: c.id, name: c.name, lap: c.lap }))
      );
      setPhase(room.state.phase);
      setCountdown(room.state.countdown);
      setWinnerName(room.state.winnerName);
      setMyId(room.sessionId);
      setHostId(room.state.hostId);
    };
    sync();
    room.onStateChange(() => sync());
  }, [room]);

  const myCar = cars.find((c) => c.id === myId);
  const myLap = myCar ? Math.min(myCar.lap + 1, TOTAL_LAPS) : 1;
  const isHost = myId !== "" && myId === hostId;

  return (
    <>
      <div className="absolute top-3 left-3 flex gap-2 items-center">
        <button
          onClick={() => navigator.clipboard?.writeText(roomCode)}
          title="Klik untuk salin kode"
          className="bg-black/60 text-white rounded-lg px-3 py-1.5 text-sm font-mono tracking-widest hover:bg-black/80"
        >
          🔑 {roomCode}
        </button>
        <div className="bg-black/60 text-white rounded-lg px-3 py-1.5 text-sm font-semibold">
          🏎️ {Math.round(speed * 9)} km/h
        </div>
        <div className="bg-black/60 text-white rounded-lg px-3 py-1.5 text-sm font-semibold">
          🏁 Lap {myLap}/{TOTAL_LAPS}
        </div>
      </div>

      <div className="absolute top-3 right-3 bg-black/60 text-white rounded-lg px-3 py-2 text-sm">
        <p className="font-semibold mb-1">👥 Pembalap ({cars.length}/8)</p>
        {cars.map((c) => (
          <p key={c.id}>
            {c.name} · Lap {Math.min(c.lap + 1, TOTAL_LAPS)}
          </p>
        ))}
        <button onClick={onLeave} className="mt-2 text-xs underline text-gray-300 hover:text-white">
          Keluar balapan
        </button>
      </div>

      {/* lobby: tunggu host memencet start */}
      {phase === "waiting" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/70 text-white rounded-2xl px-8 py-6 text-center pointer-events-auto">
            <div className="text-2xl font-bold mb-2">🏁 Siap balapan?</div>
            <div className="text-sm text-gray-300 mb-4">
              {cars.length} pembalap sudah gabung. {isHost ? "Kamu host!" : "Tunggu host memulai."}
            </div>
            {isHost ? (
              <button
                onClick={() => room.send(RACE_MSG.START_RACE)}
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl px-8 py-3 text-lg"
              >
                ▶ Start Balapan
              </button>
            ) : (
              <div className="text-gray-400 text-sm animate-pulse">Menunggu host…</div>
            )}
          </div>
        </div>
      )}

      {/* hitungan mundur */}
      {phase === "countdown" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-8xl font-black text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]">
            {countdown > 0 ? countdown : "GO!"}
          </div>
        </div>
      )}

      {/* pemenang */}
      {phase === "finished" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/70 text-white rounded-2xl px-8 py-6 text-center">
            <div className="text-5xl mb-2">🏆</div>
            <div className="text-2xl font-bold">{winnerName} menang!</div>
            <div className="text-sm text-gray-300 mt-1">
              {myId && cars.find((c) => c.id === myId)?.name === winnerName
                ? "Kamu juaranya!"
                : "Coba lagi di balapan berikutnya."}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-3 right-3 bg-black/60 text-white rounded-lg px-3 py-2 text-xs max-w-[230px]">
        <p>
          <b>W/↑</b> gas · <b>S/↓</b> rem/mundur · <b>A/D atau ←/→</b> belok
        </p>
      </div>
    </>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<"menu" | "playing">("menu");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [vehicle, setVehicle] = useState<string>(VEHICLES[0]);
  const [room, setRoom] = useState<Room<RaceState> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // pose mobil sendiri (ditulis 60fps oleh scene, dibaca kamera & HUD)
  const poseRef = useRef<CarPose>({ x: SPAWN.x, z: SPAWN.z, angle: SPAWN.angle, speed: 0, y: 0 });

  const attach = (r: Room<RaceState>) => {
    setRoom(r);
    setPhase("playing");
  };

  const cleanup = async (r: Room<RaceState> | null) => {
    if (r) {
      try {
        await r.leave();
      } catch {
        /* abaikan */
      }
      r.removeAllListeners();
    }
  };

  const handleCreate = async () => {
    setError("");
    setBusy(true);
    let r: Room<RaceState> | null = null;
    try {
      r = await createRace(name.trim() || "Pembalap", vehicle);
      await waitForInitialState(r);
      attach(r);
    } catch (e) {
      await cleanup(r);
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    setError("");
    setBusy(true);
    let r: Room<RaceState> | null = null;
    try {
      r = await joinRace(code, name.trim() || "Pembalap", vehicle);
      await waitForInitialState(r);
      attach(r);
    } catch (e) {
      await cleanup(r);
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    await cleanup(room);
    setRoom(null);
    setPhase("menu");
    setCode("");
  };

  if (phase === "menu" || !room) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-sky-300 to-orange-200 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-orange-700">🏁 Balapan Kita</h1>
          <p className="text-sm text-gray-500 mt-1 mb-6">
            Balapan mobil bareng teman, langsung dari browser. (Prototipe)
          </p>

          <label className="block text-sm font-medium text-gray-700 mb-1">Nama kamu</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="mis. Ferhen"
            maxLength={16}
            className="w-full border rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />

          <label className="block text-sm font-medium text-gray-700 mb-1">Pilih mobil</label>
          <select
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {VEHICLES.map((v) => (
              <option key={v} value={v}>
                {vehicleLabel(v)}
              </option>
            ))}
          </select>

          <button
            onClick={handleCreate}
            disabled={busy}
            className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold rounded-lg px-3 py-2 mb-4"
          >
            {busy ? "Menyambung…" : "Buat Balapan Baru"}
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
              placeholder="Kode: R4C3R1"
              maxLength={6}
              className="flex-1 border rounded-lg px-3 py-2 uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              onClick={handleJoin}
              disabled={busy}
              className="bg-gray-800 hover:bg-black disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-2"
            >
              Gabung
            </button>
          </div>

          {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

          <p className="text-xs text-gray-400 mt-6">
            Pastikan server game nyala (<code>npm run dev</code> dari root repo).
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen w-screen relative">
      <RaceScene room={room} poseRef={poseRef} />
      <GameHud room={room} poseRef={poseRef} onLeave={handleLeave} />
    </main>
  );
}
