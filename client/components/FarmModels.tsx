"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import type { Animal, AnimalKind, CropKind, Plot } from "@kebun-kita/shared";

const M = "/models";
const DIRT = `${M}/crops_dirtSingle.glb`;

/** Model tanaman per jenis: muda (planted) -> matang (ready). */
const CROP_MODEL: Record<CropKind, { young: string; mature: string }> = {
  gandum: { young: `${M}/crops_wheatStageA.glb`, mature: `${M}/crops_wheatStageB.glb` },
  wortel: { young: `${M}/crops_leafsStageA.glb`, mature: `${M}/crops_leafsStageB.glb` },
  labu: { young: `${M}/crops_cornStageB.glb`, mature: `${M}/crops_cornStageD.glb` },
};

const ANIMAL_MODEL: Record<AnimalKind, string> = {
  cow: `${M}/animal-cow.glb`,
  chicken: `${M}/animal-chick.glb`,
};

// Preload supaya tidak ada pop-in saat model pertama kali dipakai.
useGLTF.preload(DIRT);
Object.values(CROP_MODEL).forEach(({ young, mature }) => {
  useGLTF.preload(young);
  useGLTF.preload(mature);
});
Object.values(ANIMAL_MODEL).forEach((url) => useGLTF.preload(url));
useGLTF.preload(`${M}/fence_simple.glb`);

/** Satu tanaman di atas petak (komponen sendiri agar hook selalu konsisten). */
function CropPlant({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(), [scene]);
  return <primitive object={clone} position={[0, 0.02, 0]} />;
}

/** Petak kebun: wild = kotak rumput, sisanya model tanah/tanaman Kenney. */
export function PlotModel({ plot, onClick }: { plot: Plot; onClick: () => void }) {
  const pos: [number, number, number] = [plot.gx - 3.5, 0, plot.gz - 3.5];

  if (plot.state === "wild") {
    return (
      <mesh position={[pos[0], 0.1, pos[2]]} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <boxGeometry args={[0.95, 0.2, 0.95]} />
        <meshStandardMaterial color="#5da75d" />
      </mesh>
    );
  }

  return <DirtPlot pos={pos} plot={plot} onClick={onClick} />;
}

function DirtPlot({ pos, plot, onClick }: { pos: [number, number, number]; plot: Plot; onClick: () => void }) {
  const { scene } = useGLTF(DIRT);
  // clone per petak: satu Object3D tidak bisa punya banyak parent
  const dirt = useMemo(() => scene.clone(), [scene]);
  const cropUrl =
    plot.crop && (plot.state === "planted" || plot.state === "ready")
      ? CROP_MODEL[plot.crop as CropKind][plot.state === "ready" ? "mature" : "young"]
      : null;

  return (
    <group position={pos} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <primitive object={dirt} />
      {cropUrl && <CropPlant url={cropUrl} />}
      {/* hitbox tak terlihat: area klik lebih besar dari modelnya */}
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[1, 0.7, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Badge melayang: penanda hewan/tanaman siap dipanen. */
function ReadyBadge({ y }: { y: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = y + Math.sin(clock.elapsedTime * 3) * 0.12;
  });
  return (
    <mesh ref={ref} position={[0, y, 0]}>
      <octahedronGeometry args={[0.22]} />
      <meshStandardMaterial color="#ffd23f" emissive="#ff9d00" emissiveIntensity={0.5} />
    </mesh>
  );
}

/** Hewan: model Kenney Cube Pets + animasi (idle, makan saat hasil siap). */
export function AnimalModel({ animal, onClick }: { animal: Animal; onClick: () => void }) {
  const { scene, animations } = useGLTF(ANIMAL_MODEL[animal.kind]);
  // clone per instance: tiap hewan punya mixer animasinya sendiri
  const clone = useMemo(() => scene.clone(), [scene]);
  const group = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    const clip = animal.produceReady ? "eat" : "idle";
    const action = actions[clip];
    action?.reset().fadeIn(0.3).play();
    return () => {
      action?.fadeOut(0.3);
    };
  }, [actions, animal.produceReady]);

  const scale = animal.kind === "cow" ? 1.1 : 0.9;
  return (
    <group
      position={[animal.x, 0, animal.z]}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <group ref={group} scale={scale}>
        <primitive object={clone} />
      </group>
      {animal.produceReady && <ReadyBadge y={animal.kind === "cow" ? 1.9 : 1.2} />}
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[1.4, 1.4, 1.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Pagar dekoratif mengelilingi area petak (9x9), ada celah pintu di selatan. */
export function FenceBorder() {
  const { scene } = useGLTF(`${M}/fence_simple.glb`);
  const fences = useMemo(() => {
    const list: { pos: [number, number, number]; rot: number; obj: THREE.Object3D }[] = [];
    const add = (x: number, z: number, rot: number) =>
      list.push({ pos: [x, 0, z], rot, obj: scene.clone() });
    for (let i = -4; i <= 4; i++) {
      add(i, -4.6, 0);
      if (Math.abs(i) > 1) add(i, 4.6, 0); // celah pintu di selatan
    }
    for (let i = -3; i <= 3; i++) {
      add(-4.6, i, Math.PI / 2);
      add(4.6, i, Math.PI / 2);
    }
    return list;
  }, [scene]);
  return (
    <>
      {fences.map((f, idx) => (
        <primitive key={idx} object={f.obj} position={f.pos} rotation={[0, f.rot, 0]} />
      ))}
    </>
  );
}

/** Bungkus Suspense untuk semua pemakaian model di scene. */
export function ModelSuspense({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
