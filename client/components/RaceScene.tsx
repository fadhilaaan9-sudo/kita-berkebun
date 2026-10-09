"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import { RACE_MSG, RaceState, type RaceCar } from "@kebun-kita/shared";
import { MyCar, OtherCar, Track, type CarInput, type CarPose } from "./RaceModels";

function useKeys(input: React.MutableRefObject<CarInput>) {
  useEffect(() => {
    const set = (code: string, v: boolean) => {
      const k = code.toLowerCase();
      if (k === "w" || k === "arrowup") input.current.fwd = v;
      else if (k === "s" || k === "arrowdown") input.current.back = v;
      else if (k === "a" || k === "arrowleft") input.current.left = v;
      else if (k === "d" || k === "arrowright") input.current.right = v;
    };
    const down = (e: KeyboardEvent) => set(e.key, true);
    const up = (e: KeyboardEvent) => set(e.key, false);
    const blur = () => {
      input.current = { fwd: false, back: false, left: false, right: false };
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [input]);
}

/**
 * Kamera mengikuti dari belakang mobil pemain.
 * Membaca poseRef (ditulis MyCar 60fps) — JANGAN baca dari state server
 * yang cuma update 10Hz, itu yang bikin gerakan kelihatan patah-patah.
 *
 * Mode debug: ?view=top untuk lihat lintasan dari atas.
 */
function ChaseCamera({ poseRef }: { poseRef: React.MutableRefObject<CarPose> }) {
  const target = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());
  const lookSmooth = useRef(new THREE.Vector3(0, 0.5, 5));
  const topDown =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("view") === "top";
  useFrame((state, rawDt) => {
    if (topDown) {
      state.camera.position.set(0, 32, 0.01);
      state.camera.lookAt(0, 0, 0);
      return;
    }
    const dt = Math.min(rawDt, 0.05);
    const p = poseRef.current;
    const fx = Math.sin(p.angle);
    const fz = Math.cos(p.angle);
    const camY = 4.5 + p.y;
    const lookY = 0.5 + p.y;
    target.current.set(p.x - fx * 7, camY, p.z - fz * 7);
    // damping berbasis dt (independen frame-rate)
    const kp = 1 - Math.exp(-8 * dt);
    const kl = 1 - Math.exp(-12 * dt);
    state.camera.position.lerp(target.current, kp);
    look.current.set(p.x + fx * 2.5, lookY, p.z + fz * 2.5);
    lookSmooth.current.lerp(look.current, kl);
    state.camera.lookAt(lookSmooth.current);
  });
  return null;
}

function Cars({
  room,
  input,
  poseRef,
}: {
  room: Room<RaceState>;
  input: React.MutableRefObject<CarInput>;
  poseRef: React.MutableRefObject<CarPose>;
}) {
  const cars = Array.from(room.state.cars.values());
  const me = cars.find((c) => c.id === room.sessionId);
  const others = cars.filter((c) => c.id !== room.sessionId);
  // posisi halus mobil lain (diisi OtherCar tiap frame, dibaca MyCar untuk tabrakan)
  const othersPos = useRef(new Map<string, { x: number; z: number }>());
  return (
    <>
      {me && (
        <MyCar
          car={me}
          input={input}
          poseRef={poseRef}
          othersPos={othersPos}
          onState={(x, z, angle, speed) => room.send(RACE_MSG.CAR_STATE, { x, z, angle, speed })}
        />
      )}
      {others.map((c: RaceCar) => (
        <OtherCar key={c.id} car={c} othersPos={othersPos} />
      ))}
    </>
  );
}

/** Kecepatan pemain sendiri untuk HUD (dari pose lokal, mulus). */
export function useMySpeed(poseRef: React.MutableRefObject<CarPose>) {
  const [speed, setSpeed] = useState(0);
  useEffect(() => {
    let last = 0;
    const id = setInterval(() => {
      const s = Math.abs(poseRef.current.speed);
      if (Math.abs(s - last) > 0.2) {
        last = s;
        setSpeed(s);
      }
    }, 150);
    return () => clearInterval(id);
  }, [poseRef]);
  return speed;
}

export default function RaceScene({
  room,
  poseRef,
}: {
  room: Room<RaceState>;
  poseRef: React.MutableRefObject<CarPose>;
}) {
  const input = useRef<CarInput>({ fwd: false, back: false, left: false, right: false });
  useKeys(input);
  const [, setRev] = useState(0);
  useEffect(() => {
    room.onStateChange(() => setRev((v) => v + 1));
  }, [room]);

  if (!room.state || room.state.cars === undefined) return null;

  return (
    <Canvas camera={{ position: [0, 8, 10], fov: 55 }} shadows>
      <color attach="background" args={["#87ceeb"]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[12, 18, 6]} intensity={1.3} />
      {/* tanah rumput */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#6fbf5a" />
      </mesh>
      <Suspense fallback={null}>
        <Track />
        <Cars room={room} input={input} poseRef={poseRef} />
      </Suspense>
      <ChaseCamera poseRef={poseRef} />
    </Canvas>
  );
}
