"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import { FarmState, MSG, type CropKind, type Plot } from "@kebun-kita/shared";
import { AnimalModel, FenceBorder, PlotModel } from "./FarmModels";

function useKeys() {
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  return keys;
}

/** Avatar pemain sendiri: gerak lokal (responsif) + kirim posisi ke server. */
function MyAvatar({ room, keys }: { room: Room<FarmState>; keys: React.MutableRefObject<Record<string, boolean>> }) {
  const ref = useRef<THREE.Mesh>(null);
  const pos = useRef({ x: 0, z: 5 });
  const lastSent = useRef(0);
  const camTarget = useRef(new THREE.Vector3());

  useEffect(() => {
    if (!room.state || room.state.players === undefined) return;
    const me = room.state.players.get(room.sessionId);
    if (me) pos.current = { x: me.x, z: me.z };
  }, [room]);

  useFrame((state, dt) => {
    const k = keys.current;
    const speed = 5;
    let dx = 0;
    let dz = 0;
    if (k["w"] || k["arrowup"]) dz -= 1;
    if (k["s"] || k["arrowdown"]) dz += 1;
    if (k["a"] || k["arrowleft"]) dx -= 1;
    if (k["d"] || k["arrowright"]) dx += 1;
    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz);
      pos.current.x = THREE.MathUtils.clamp(pos.current.x + (dx / len) * speed * dt, -14, 14);
      pos.current.z = THREE.MathUtils.clamp(pos.current.z + (dz / len) * speed * dt, -14, 14);
      const now = performance.now();
      if (now - lastSent.current > 100) {
        lastSent.current = now;
        room.send(MSG.MOVE, { x: pos.current.x, z: pos.current.z });
      }
    }
    if (ref.current) ref.current.position.set(pos.current.x, 0.6, pos.current.z);
    camTarget.current.set(pos.current.x, 13, pos.current.z + 11);
    state.camera.position.lerp(camTarget.current, 0.08);
    state.camera.lookAt(pos.current.x, 0, pos.current.z);
  });

  return (
    <mesh ref={ref} position={[pos.current.x, 0.6, pos.current.z]}>
      <capsuleGeometry args={[0.35, 0.7, 4, 12]} />
      <meshStandardMaterial color="#e8833a" />
    </mesh>
  );
}

function OtherAvatars({ room }: { room: Room<FarmState> }) {
  const players = Array.from(room.state.players.values()).filter((p) => p.id !== room.sessionId);
  return (
    <>
      {players.map((p) => (
        <mesh key={p.id} position={[p.x, 0.6, p.z]}>
          <capsuleGeometry args={[0.35, 0.7, 4, 12]} />
          <meshStandardMaterial color={p.isHost ? "#b64400" : "#3a7bd5"} />
        </mesh>
      ))}
    </>
  );
}

function Plots({ room, crop }: { room: Room<FarmState>; crop: CropKind }) {
  const plots = Array.from(room.state.plots.values());

  const handleClick = (plot: Plot) => {
    if (plot.state === "wild") room.send(MSG.TILL, { plotId: plot.id });
    else if (plot.state === "tilled") room.send(MSG.PLANT, { plotId: plot.id, crop });
    else if (plot.state === "planted") room.send(MSG.WATER, { plotId: plot.id });
    else if (plot.state === "ready") room.send(MSG.HARVEST, { plotId: plot.id });
  };

  return (
    <>
      {plots.map((plot) => (
        <PlotModel key={plot.id} plot={plot} onClick={() => handleClick(plot)} />
      ))}
    </>
  );
}

function Animals({ room }: { room: Room<FarmState> }) {
  const animals = Array.from(room.state.animals.values());
  return (
    <>
      {animals.map((a) => (
        <AnimalModel
          key={a.id}
          animal={a}
          onClick={() => {
            // siap panen → ambil hasil, kalau tidak → kasih makan
            room.send(a.produceReady ? MSG.COLLECT : MSG.FEED, { animalId: a.id });
          }}
        />
      ))}
    </>
  );
}

function House() {
  return (
    <group position={[-10, 0, -9]}>
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[4, 2, 3.5]} />
        <meshStandardMaterial color="#f3e5d0" />
      </mesh>
      <mesh position={[0, 2.9, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[3.1, 1.8, 4]} />
        <meshStandardMaterial color="#b64400" />
      </mesh>
    </group>
  );
}

export default function FarmScene({ room, crop }: { room: Room<FarmState>; crop: CropKind }) {
  const keys = useKeys();
  // render ulang tiap ada patch state dari server
  const [, setRev] = useState(0);
  useEffect(() => {
    room.onStateChange(() => setRev((v) => v + 1));
  }, [room]);

  // State awal Colyseus tiba sesaat setelah join (bentuknya ada, isinya
  // menyusul) — jangan render scene sebelum datanya lengkap.
  if (!room.state || room.state.players === undefined) return null;

  return (
    <Canvas camera={{ position: [0, 13, 16], fov: 50 }}>
      <color attach="background" args={["#bfe3ff"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 15, 5]} intensity={1.2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#79c25f" />
      </mesh>
      <Suspense fallback={null}>
        <Plots room={room} crop={crop} />
        <Animals room={room} />
        <FenceBorder />
      </Suspense>
      <House />
      <MyAvatar room={room} keys={keys} />
      <OtherAvatars room={room} />
    </Canvas>
  );
}
