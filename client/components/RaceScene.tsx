"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import { RACE_MSG, RaceState, type RaceCar } from "@kebun-kita/shared";
import { MyCar, OtherCar, Track, type CarInput } from "./RaceModels";

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

/** Kamera mengikuti dari belakang mobil pemain. */
function ChaseCamera({ room }: { room: Room<RaceState> }) {
  const target = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());
  useFrame((state) => {
    const me = room.state?.cars.get(room.sessionId);
    if (!me) return;
    const fx = Math.sin(me.angle);
    const fz = Math.cos(me.angle);
    // Perkiraan posisi halus: pakai state server (cukup untuk MVP)
    target.current.set(me.x - fx * 7, 4.5, me.z - fz * 7);
    state.camera.position.lerp(target.current, 0.12);
    look.current.set(me.x + fx * 2, 0.5, me.z + fz * 2);
    state.camera.lookAt(look.current);
  });
  return null;
}

function Cars({ room, input }: { room: Room<RaceState>; input: React.MutableRefObject<CarInput> }) {
  const cars = Array.from(room.state.cars.values());
  const me = cars.find((c) => c.id === room.sessionId);
  const others = cars.filter((c) => c.id !== room.sessionId);
  return (
    <>
      {me && (
        <MyCar
          car={me}
          input={input}
          onState={(x, z, angle, speed) => room.send(RACE_MSG.CAR_STATE, { x, z, angle, speed })}
        />
      )}
      {others.map((c: RaceCar) => (
        <OtherCar key={c.id} car={c} />
      ))}
    </>
  );
}

/** Tampilkan kecepatan pemain sendiri (diambil dari state fisika via event). */
export function useMySpeed(room: Room<RaceState>) {
  const [speed, setSpeed] = useState(0);
  useEffect(() => {
    let last = 0;
    const id = setInterval(() => {
      const me = room.state?.cars.get(room.sessionId);
      const s = me ? Math.abs(me.speed) : 0;
      if (Math.abs(s - last) > 0.3) {
        last = s;
        setSpeed(s);
      }
    }, 200);
    return () => clearInterval(id);
  }, [room]);
  return speed;
}

export default function RaceScene({ room }: { room: Room<RaceState> }) {
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
        <Cars room={room} input={input} />
      </Suspense>
      <ChaseCamera room={room} />
    </Canvas>
  );
}
