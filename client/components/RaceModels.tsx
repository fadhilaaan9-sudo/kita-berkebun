"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { RaceCar } from "@kebun-kita/shared";
import { CAR_SCALE, GRID, TRACK_SCALE, clampToTrack, trackHeight, trackPitch } from "@kebun-kita/shared";

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
 * Sirkuit 15x9: jalan kota (grid 1x1) sebagai lintasan utama,
 * pernak-pernik kit mainan sebagai dekorasi.
 *
 * JEMBATAN LAYANG di jalan lurus atas (x -2..2): jalan menanjak
 * (road-slant-high), melewati dek jembatan (road-bridge) di atas
 * jalan kota dekorasi, lalu turun lagi. Tinggi diatur trackHeight().
 *
 * road-bend: rot 0 = Barat+Selatan, +PI/2 = Timur+Selatan,
 *            PI = Timur+Utara, -PI/2 = Barat+Utara
 * (diverifikasi visual 2026-10-09 oleh ferhen)
 * road-slant-high: rot 0 = menanjak ke +x (diukur dari vertex)
 */
function buildTrack(): Piece[] {
  const pieces: Piece[] = [];
  const X0 = -GRID.x; // -7
  const X1 = GRID.x; // 7
  const Z0 = -GRID.z; // -4
  const Z1 = GRID.z; // 4
  const city = (file: string, x: number, z: number, rot = 0, y = 0) =>
    pieces.push({ file, x, z, rot, kit: "city", y });
  const toy = (file: string, x: number, z: number, rot = 0, y = 0) =>
    pieces.push({ file, x, z, rot, kit: "toy", y });

  // jalan lurus bawah (arah x) — bukit di x -6..-3, chicane di x -2..0
  for (let x = X0 + 1; x < X1; x++) {
    if (x >= 1) city("road-straight.glb", x, Z1);
  }
  // BUKIT ROLLER-COASTER: naik-turun di jalan bawah barat
  city("road-slant.glb", -6, Z1, 0); // naik ke +x
  city("road-slant.glb", -5, Z1, Math.PI); // turun ke +x
  city("road-slant.glb", -4, Z1, 0); // naik ke +x
  city("road-slant.glb", -3, Z1, Math.PI); // turun ke +x
  // CHICANE (tikungan S): jog ke selatan di jalan lurus bawah
  // A: masuk dari barat, belok selatan | B: dari utara, belok timur
  // C: lurus | D: dari barat, belok utara | E: dari selatan, belok timur
  city("road-bend.glb", -2, Z1, 0); // A: Barat+Selatan
  city("road-bend.glb", -2, Z1 + 1, Math.PI); // B: Utara+Timur
  city("road-straight.glb", -1, Z1 + 1); // C
  city("road-bend.glb", 0, Z1 + 1, -Math.PI / 2); // D: Barat+Utara
  city("road-bend.glb", 0, Z1, Math.PI / 2); // E: Selatan+Timur
  // jalan lurus atas: normal kecuali segmen jembatan (x -2..2)
  for (let x = X0 + 1; x < X1; x++) {
    if (x <= -3 || x >= 3) city("road-straight.glb", x, Z0);
  }
  // jembatan layang: tanjakan barat, dek, tanjakan timur
  city("road-slant-high.glb", -2, Z0, 0); // menanjak ke +x (timur)
  city("road-bridge.glb", -1, Z0, Math.PI/2);
  city("road-bridge.glb", 0, Z0, Math.PI/2);
  city("road-bridge.glb", 1, Z0, Math.PI/2);
  city("road-slant-high.glb", 2, Z0, Math.PI); // menanjak ke -x (barat)
  // pilar penyangga jembatan
  city("bridge-pillar.glb", -1, Z0);
  city("bridge-pillar.glb", 1, Z0);

  // sisi kiri & kanan (jalan lurus arah z)
  for (let z = Z0 + 1; z < Z1; z++) {
    city("road-straight.glb", X0, z, Math.PI / 2);
    city("road-straight.glb", X1, z, Math.PI / 2);
  }
  // 4 tikungan (sudah diverifikasi)
  city("road-bend.glb", X0, Z0, Math.PI / 2); // kiri-atas: Timur+Selatan
  city("road-bend.glb", X1, Z0, -Math.PI / 600); // kanan-atas: Barat+Selatan
  city("road-bend.glb", X1, Z1, -Math.PI / 2); // kanan-bawah: Barat+Utara
  city("road-bend.glb", X0, Z1, Math.PI); // kiri-bawah: Timur+Utara

  // garis start/finis (kit mainan) di jalan lurus bawah, timur chicane
  pieces.push({ file: "gate-finish.glb", x: 4, z: Z1, rot: 0, kit: "toy" });

  // cone mainan di sisi luar tikungan (dekorasi)
  toy("item-cone.glb", X0 - 1.2, Z0 - 1.2);
  toy("item-cone.glb", X1 + 1.2, Z0 - 1.2);
  toy("item-cone.glb", X1 + 1.2, Z1 + 1.2);
  toy("item-cone.glb", X0 - 1.2, Z1 + 1.2);
  // koin di jalan lurus bawah (dekorasi) — lewati area chicane & bukit datar
  for (let x = 1; x <= 6; x++) {
    toy("item-coin-gold.glb", x, Z1, 0);
  }
  // koin melayang di atas bukit (hadiah!)
  for (const x of [-6, -5, -4, -3]) {
    toy("item-coin-gold.glb", x, Z1, 0, 0.45);
  }
  // barrier kota di beberapa titik
  pieces.push({ file: "construction-barrier.glb", x: X0 - 1.5, z: 0, rot: Math.PI / 2, kit: "city" });
  pieces.push({ file: "construction-barrier.glb", x: X1 + 1.5, z: 0, rot: Math.PI / 2, kit: "city" });

  // ===== DEKORASI KOTA HIDUP (di luar jangkauan mobil) =====
  // lampu jalan di sepanjang sisi luar lintasan (lewati x=0 atas: jalan bawah jembatan;
  // lewati x=-2,0 bawah: area chicane)
  for (let x = -6; x <= 6; x += 2) {
    if (x !== 0) city("light-curved.glb", x, Z0 - 1.7, Math.PI);
    if (x !== -2 && x !== 0) city("light-curved.glb", x, Z1 + 1.7, 0);
  }
  // rambu peringatan sebelum chicane
  city("road-sign-warning.glb", -3.5, Z1 + 1.7, -Math.PI / 6);
  // tiang listrik di sisi kiri luar
  for (let z = -2; z <= 2; z += 2) city("electricity-pole.glb", X0 - 2.4, z);
  // rambu-rambu dekat tikungan
  city("road-sign-stop.glb", X1 - 1.8, Z1 - 1.4, Math.PI / 4);
  city("road-sign-warning.glb", X0 + 1.8, Z0 + 1.4, -Math.PI / 4);
  city("road-sign-street.glb", X0 + 1.8, Z1 - 1.4, Math.PI / 3);
  city("sign-highway.glb", X1 + 2.4, Z0 - 2, Math.PI / 2);
  // lampu lalu lintas dekat garis finis
  city("traffic-light.glb", 2.4, Z1 + 1.5, Math.PI);
  // pohon di rumput tengah (tidak bisa ditabrak — di dalam dinding)
  toy("tree.glb", -4.5, -1.5);
  toy("tree-pine.glb", 0, 1);
  toy("tree.glb", 4.5, -1.5);
  toy("tree-pine.glb", -3, 2);
  toy("tree-pine.glb", 3, 2);
  // pohon di sudut-sudut luar
  toy("tree.glb", -10, -6.5);
  toy("tree-pine.glb", 10, -6.5);
  toy("tree.glb", -10, 6.5);
  toy("tree-pine.glb", 10, 6.5);

  return pieces;
}

function TrackPiece({ piece }: { piece: Piece }) {
  const url = `${piece.kit === "city" ? CITY : TOY}/${piece.file}`;
  const model = useModel(url);
  return <primitive object={model} position={[piece.x, piece.y ?? 0, piece.z]} rotation={[0, piece.rot, 0]} />;
}

export function Track() {
  const pieces = useMemo(buildTrack, []);
  // skala seluruh lintasan (posisi + ukuran ikut membesar, tetap tersambung)
  return (
    <group scale={TRACK_SCALE}>
      {pieces.map((p, i) => (
        <TrackPiece key={i} piece={p} />
      ))}
    </group>
  );
}

/* ================= MOBIL ================= */

const MAX_SPEED = 10;
const MAX_REVERSE = -4;
const ACCEL = 9;
const BRAKE = 14;
const FRICTION = 1.6;
const STEER_MAX = 0.55;

/** Input kosong (untuk fase non-racing). */
const EMPTY_INPUT: CarInput = { fwd: false, back: false, left: false, right: false };

export interface CarInput {
  fwd: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
}

/** Posisi mobil di memori lokal (ditulis 60fps oleh MyCar, dibaca kamera). */
export interface CarPose {
  x: number;
  z: number;
  angle: number;
  speed: number;
  y: number;
}

/**
 * Mobil pemain sendiri: fisika arcade lokal + kirim state ke server.
 * Menulis pose ke poseRef tiap frame supaya kamera bisa ngikutin
 * dengan mulus (jangan baca dari state server yang cuma update 10Hz).
 */
export function MyCar({
  car,
  input,
  poseRef,
  othersPos,
  phase,
  onState,
}: {
  car: RaceCar;
  input: React.MutableRefObject<CarInput>;
  poseRef: React.MutableRefObject<CarPose>;
  othersPos: React.MutableRefObject<Map<string, { x: number; z: number }>>;
  phase: string;
  onState: (x: number, z: number, angle: number, speed: number) => void;
}) {
  const model = useModel(`${TOY}/${car.vehicle}.glb`);
  const group = useRef<THREE.Group>(null);
  const pitchRef = useRef<THREE.Group>(null);
  // state fisika lokal (ref supaya tidak re-render tiap frame)
  const phys = useRef({ x: car.x, z: car.z, angle: car.angle, speed: 0, steer: 0 });
  const lastSent = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const p = phys.current;
    // selama countdown/finished: abaikan input (fisika tabrakan & dinding tetap jalan)
    const inp = phase === "racing" ? input.current : EMPTY_INPUT;

    // akselerasi / rem / mundur
    if (inp.fwd) p.speed += ACCEL * dt;
    else if (inp.back) p.speed -= (p.speed > 0 ? BRAKE : ACCEL * 0.7) * dt;
    else {
      // friksi saat tidak ada input
      const f = FRICTION * dt;
      p.speed = Math.abs(p.speed) <= f ? 0 : p.speed - Math.sign(p.speed) * f;
    }
    p.speed = Math.max(MAX_REVERSE, Math.min(MAX_SPEED, p.speed));

    // belok: steering dihaluskan (tidak langsung patah)
    const steerTarget = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
    p.steer += (steerTarget - p.steer) * Math.min(1, dt * 10);
    const steerFactor = Math.min(1, Math.abs(p.speed) / 4);
    p.angle += p.steer * STEER_MAX * steerFactor * Math.sign(p.speed || 1) * dt * 2.2;

    // gerak
    p.x += Math.sin(p.angle) * p.speed * dt;
    p.z += Math.cos(p.angle) * p.speed * dt;
    // dinding tak terlihat: mobil tidak bisa keluar lintasan
    clampToTrack(p);
    // tabrakan dengan pemain lain (lingkaran vs lingkaran, sisi-klien)
    const R = 0.38; // radius tabrakan per mobil
    for (const [id, o] of othersPos.current.entries()) {
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      const minD = R * 2;
      if (d < minD) {
        let nx: number, nz: number;
        if (d > 0.0001) {
          nx = dx / d;
          nz = dz / d;
        } else {
          // tepat bertumpuk (mis. spawn bareng): pisahkan deterministik
          // berdasarkan urutan id supaya kedua klien mendorong berlawanan arah
          nx = car.id < id ? -1 : 1;
          nz = 0;
        }
        const overlap = minD - d;
        p.x += nx * overlap;
        p.z += nz * overlap;
        // tabrakan menyerap kecepatan
        p.speed *= 0.82;
      }
    }
    // jepit lagi setelah dorongan tabrakan
    clampToTrack(p);
    // tinggi mengikuti jembatan layang (tanjakan/dek)
    const y = trackHeight(p.x, p.z);

    if (group.current) {
      group.current.position.set(p.x, y, p.z);
      // model menghadap -z; putar PI supaya moncong ikut arah hadap
      group.current.rotation.y = p.angle + Math.PI;
      // sedikit miring saat belok (efek arcade)
      group.current.rotation.z = -p.steer * steerFactor * 0.08;
    }
    // hidung naik/turun mengikuti tanjakan (di grup dalam, setelah yaw)
    if (pitchRef.current) {
      pitchRef.current.rotation.x = trackPitch(p.x, p.z, p.angle);
    }

    // tulis pose untuk kamera (60fps, mulus)
    poseRef.current.x = p.x;
    poseRef.current.z = p.z;
    poseRef.current.angle = p.angle;
    poseRef.current.speed = p.speed;
    poseRef.current.y = y;

    const now = performance.now();
    if (now - lastSent.current > 100) {
      lastSent.current = now;
      onState(p.x, p.z, p.angle, p.speed);
    }
  });

  return (
    <group ref={group} position={[car.x, 0, car.z]}>
      <group ref={pitchRef} scale={CAR_SCALE}>
        <primitive object={model} />
      </group>
    </group>
  );
}

/**
 * Mobil pemain lain: interpolasi menuju state server supaya
 * tidak patah-patah (server update 10Hz, render 60fps).
 */
export function OtherCar({
  car,
  othersPos,
}: {
  car: RaceCar;
  othersPos: React.MutableRefObject<Map<string, { x: number; z: number }>>;
}) {
  const model = useModel(`${TOY}/${car.vehicle}.glb`);
  const group = useRef<THREE.Group>(null);
  const smooth = useRef({ x: car.x, z: car.z, angle: car.angle });

  // bersihkan dari peta saat keluar
  useEffect(() => {
    return () => {
      othersPos.current.delete(car.id);
    };
  }, [car.id, othersPos]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = smooth.current;
    const k = Math.min(1, dt * 8);
    s.x += (car.x - s.x) * k;
    s.z += (car.z - s.z) * k;
    // lerp sudut via jalur terpendek
    let d = car.angle - s.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    s.angle += d * k;
    // catat posisi halus untuk logika tabrakan MyCar
    othersPos.current.set(car.id, { x: s.x, z: s.z });
    if (group.current) {
      group.current.position.set(s.x, trackHeight(s.x, s.z), s.z);
      group.current.rotation.y = s.angle + Math.PI;
    }
  });

  return (
    <group ref={group} position={[car.x, trackHeight(car.x, car.z), car.z]}>
      <group scale={CAR_SCALE}>
        <primitive object={model} />
      </group>
    </group>
  );
}
