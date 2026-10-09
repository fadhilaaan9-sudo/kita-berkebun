"use client";

import { Suspense, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { RaceCar } from "@kebun-kita/shared";

const TOY = "/models/kenney_toy-car-kit";
const CITY = "/models/kenney_city-kit-roads";

/** Muat satu model GLB (di-clone per instance). */
function useModel(url: string) {
  const gltf = useLoader(GLTFLoader, url);
  return useMemo(() => gltf.scene.clone(), [gltf]);
}

/* ================= LINTASAN ================= */

interface Piece {
  file: string;
  x: number;
  z: number;
  rot: number; // rotasi Y (radian)
  kit: "city" | "toy";
  y?: number;
}

/**
 * Sirkuit: jalan kota (grid 1x1) sebagai lintasan utama,
 * pernak-pernik kit mainan (gerbang finis, cone, koin) sebagai dekorasi.
 *
 * road-bend default menghubungkan sisi barat+utara; rotasi:
 *   0 = B+U, -PI/2 = U+T, PI = T+S, PI/2 = S+B
 */
function buildTrack(): Piece[] {
  const pieces: Piece[] = [];
  const X0 = -5;
  const X1 = 5;
  const Z0 = -3;
  const Z1 = 3;
  const city = (file: string, x: number, z: number, rot = 0) =>
    pieces.push({ file, x, z, rot, kit: "city" });

  // sisi atas & bawah (jalan lurus arah x)
  for (let x = X0 + 1; x < X1; x++) {
    city("road-straight.glb", x, Z0);
    city("road-straight.glb", x, Z1);
  }
  // sisi kiri & kanan (jalan lurus arah z)
  for (let z = Z0 + 1; z < Z1; z++) {
    city("road-straight.glb", X0, z, Math.PI / 2);
    city("road-straight.glb", X1, z, Math.PI / 2);
  }
  // 4 tikungan
  city("road-bend.glb", X0, Z0, Math.PI); // kiri-atas: T+S
  city("road-bend.glb", X1, Z0, Math.PI / 2); // kanan-atas: S+B
  city("road-bend.glb", X1, Z1, 0); // kanan-bawah: B+U
  city("road-bend.glb", X0, Z1, -Math.PI / 2); // kiri-bawah: U+T

  // garis start/finis (kit mainan) di jalan lurus bawah
  pieces.push({ file: "gate-finish.glb", x: 0, z: Z1, rot: 0, kit: "toy" });

  // cone mainan di sisi luar tikungan (dekorasi)
  const toy = (file: string, x: number, z: number, rot = 0) =>
    pieces.push({ file, x, z, rot, kit: "toy" });
  toy("item-cone.glb", X0 - 1.2, Z0 - 1.2);
  toy("item-cone.glb", X1 + 1.2, Z0 - 1.2);
  toy("item-cone.glb", X1 + 1.2, Z1 + 1.2);
  toy("item-cone.glb", X0 - 1.2, Z1 + 1.2);
  // koin di jalan lurus atas (dekorasi)
  for (let x = -2; x <= 2; x++) toy("item-coin-gold.glb", x, Z0, 0);
  // barrier kota di beberapa titik
  pieces.push({ file: "construction-barrier.glb", x: X0 - 1.5, z: 0, rot: Math.PI / 2, kit: "city" });
  pieces.push({ file: "construction-barrier.glb", x: X1 + 1.5, z: 0, rot: Math.PI / 2, kit: "city" });

  return pieces;
}

function TrackPiece({ piece }: { piece: Piece }) {
  const url = `${piece.kit === "city" ? CITY : TOY}/${piece.file}`;
  const model = useModel(url);
  return <primitive object={model} position={[piece.x, piece.y ?? 0, piece.z]} rotation={[0, piece.rot, 0]} />;
}

export function Track() {
  const pieces = useMemo(buildTrack, []);
  return (
    <>
      {pieces.map((p, i) => (
        <TrackPiece key={i} piece={p} />
      ))}
    </>
  );
}

/* ================= MOBIL ================= */

const MAX_SPEED = 10;
const MAX_REVERSE = -4;
const ACCEL = 9;
const BRAKE = 14;
const FRICTION = 1.6;
const STEER_MAX = 0.55;

export interface CarInput {
  fwd: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
}

/** Mobil pemain sendiri: fisika arcade lokal + kirim state ke server. */
export function MyCar({
  car,
  input,
  onState,
}: {
  car: RaceCar;
  input: React.MutableRefObject<CarInput>;
  onState: (x: number, z: number, angle: number, speed: number) => void;
}) {
  const model = useModel(`${TOY}/${car.vehicle}.glb`);
  const group = useRef<THREE.Group>(null);
  // state fisika lokal (ref supaya tidak re-render tiap frame)
  const phys = useRef({ x: car.x, z: car.z, angle: car.angle, speed: 0 });
  const lastSent = useRef(0);

  // sinkron posisi awal dari server (sekali)
  const synced = useRef(false);
  if (!synced.current) {
    synced.current = true;
    phys.current = { x: car.x, z: car.z, angle: car.angle, speed: 0 };
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const p = phys.current;
    const inp = input.current;

    // akselerasi / rem / mundur
    if (inp.fwd) p.speed += ACCEL * dt;
    else if (inp.back) p.speed -= (p.speed > 0 ? BRAKE : ACCEL * 0.7) * dt;
    else {
      // friksi saat tidak ada input
      const f = FRICTION * dt;
      p.speed = Math.abs(p.speed) <= f ? 0 : p.speed - Math.sign(p.speed) * f;
    }
    p.speed = Math.max(MAX_REVERSE, Math.min(MAX_SPEED, p.speed));

    // belok (makin cepat makin susah belok tajam)
    const steerDir = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
    const steerFactor = Math.min(1, Math.abs(p.speed) / 4);
    p.angle += steerDir * STEER_MAX * steerFactor * Math.sign(p.speed || 1) * dt * 2.2;

    // gerak
    p.x += Math.sin(p.angle) * p.speed * dt;
    p.z += Math.cos(p.angle) * p.speed * dt;

    if (group.current) {
      group.current.position.set(p.x, 0, p.z);
      // model menghadap -z; putar PI supaya moncong ikut arah hadap
      group.current.rotation.y = p.angle + Math.PI;
      // sedikit miring saat belok (efek arcade)
      group.current.rotation.z = -steerDir * steerFactor * 0.06;
    }

    const now = performance.now();
    if (now - lastSent.current > 100) {
      lastSent.current = now;
      onState(p.x, p.z, p.angle, p.speed);
    }
  });

  return (
    <group ref={group} position={[car.x, 0, car.z]}>
      <primitive object={model} />
    </group>
  );
}

/** Mobil pemain lain: render dari state server (tanpa fisika lokal). */
export function OtherCar({ car }: { car: RaceCar }) {
  const model = useModel(`${TOY}/${car.vehicle}.glb`);
  return (
    <group position={[car.x, 0, car.z]} rotation={[0, car.angle + Math.PI, 0]}>
      <primitive object={model} />
    </group>
  );
}
