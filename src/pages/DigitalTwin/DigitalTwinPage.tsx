import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  useTexture,
  useCursor,
} from "@react-three/drei";
import { motion } from "framer-motion";
import {
  Warehouse,
  Scissors,
  Factory,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Box,
  Home,
  Users,
  Hash,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import styled from "styled-components";
import * as THREE from "three";
import { getLayoutSpecs, LANE_Z_CENTER_AB, LANE_Z_CENTER_CD } from "@/utils/layoutGenerator";
import { Scene3D } from "@/components/3d/Scene3D";
import { API_BASE_URL } from "../../config";
import { generateCotLayout } from "@/utils/cotLayoutGenerator";
import { SectionLayout, MachinePosition } from "@/types";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════
   1. SHARED GEOMETRY & MATERIALS
═══════════════════════════════════════════════════════ */
const rollGeom = new THREE.CylinderGeometry(0.16, 0.16, 1.25, 12);
const tubeGeom = new THREE.CylinderGeometry(0.05, 0.05, 1.27, 8);
const tubeMat = new THREE.MeshStandardMaterial({ color: "#cbd5e1" });

const SPECS = {
  rackHeight: 5.2,
  rackDepth: 1.5,
  bayWidth: 2.8,
  levels: [0.6, 2.2, 3.8],
  postColor: "#001f3f",
  beamColor: "#c2410c",
};

/* ═══════════════════════════════════════════════════════
   2. LAYOUT DATA
═══════════════════════════════════════════════════════ */
const getStandardPositions = (x: number, z: number) => [[x - 3.5, 0, z + 3], [x + 3.5, 0, z + 3], [x - 3.5, 0, z - 3], [x + 3.5, 0, z - 3]];
const getRTIPositions = (x: number, z: number) => [[x - 3.5, 0, z + 12], [x + 3.5, 0, z + 12], [x - 3.5, 0, z + 6], [x + 3.5, 0, z + 6], [x - 3.5, 0, z], [x + 3.5, 0, z], [x - 3.5, 0, z - 6], [x + 3.5, 0, z - 6], [x - 3.5, 0, z - 12], [x + 3.5, 0, z - 12]];
const getWidePositions = (x: number, z: number) => [[x - 10.5, 0, z + 3], [x - 3.5, 0, z + 3], [x + 3.5, 0, z + 3], [x + 10.5, 0, z + 3], [x - 10.5, 0, z - 3], [x - 3.5, 0, z - 3], [x + 3.5, 0, z - 3], [x + 10.5, 0, z - 3]];
const getInterliningPositions = (x: number, z: number) => [[x - 10.5, 0, z + 3], [x - 3.5, 0, z + 3], [x + 3.5, 0, z + 3], [x - 10.5, 0, z - 3], [x - 3.5, 0, z - 3], [x + 3.5, 0, z - 3], [x + 10.5, 0, z - 3]];

const ZONE_LAYOUT: Record<string, { positions: number[][] }> = {
  RTI: { positions: getRTIPositions(-30, 35) },
  F1: { positions: getStandardPositions(-30, 5) },
  F3: { positions: getStandardPositions(-30, -10) },
  F5: { positions: getStandardPositions(-30, -25) },
  F7: { positions: getStandardPositions(-30, -40) },
  Q: { positions: getStandardPositions(-10, 25) },
  F2: { positions: getStandardPositions(-10, 5) },
  F4: { positions: getStandardPositions(-10, -10) },
  F6: { positions: getStandardPositions(-10, -25) },
  F8: { positions: getStandardPositions(-10, -40) },
  INT: { positions: getInterliningPositions(25, 25) },
  F9: { positions: getWidePositions(25, 5) },
  F10: { positions: getWidePositions(25, -10) },
  F11: { positions: getWidePositions(25, -25) },
  F12: { positions: getWidePositions(25, -40) },
};

const PALETTE = [
  "#1a1a1a", "#0f172a", "#334155", "#475569", "#2c2c2c", "#1e293b", "#52525b", "#3f3f46",
  "#171717", "#1e1b4b", "#262626", "#404040", "#1e3a8a", "#1e40af", "#111827", "#1f2937",
  "#282c34", "#21252b", "#2d3436", "#353b48", "#1c1c1c", "#101010", "#0a0a0a", "#121212",
  "#2f3640", "#353b48", "#192a56", "#273c75", "#2d3436", "#636e72", "#2d3e50", "#1a252f",
  "#222f3e", "#2c3e50", "#2c2c54", "#40407a", "#2f3542", "#57606f", "#2f3640", "#333333",
  "#3d3d3d", "#23272e", "#0e1111", "#232b2b", "#353839", "#3b444b", "#242124", "#1b1d1e",
  "#212121", "#333333", "#343434", "#3b3b3b", "#3d3d3b", "#414a4c", "#434b4d", "#464544",
  "#4d4d4d", "#536872", "#536878", "#555555", "#5a5a5a", "#5e5e5e", "#626262", "#666362",
  "#2c3e50", "#34495e", "#2c2c2c", "#3d3d3d", "#2c2c54", "#30336b", "#130f40", "#1e272e",
  "#485460", "#2d3436", "#34495e", "#2c3e50", "#2d3436", "#1e272e", "#000000", "#121212",
];

const LINE_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#84cc16",
];

/* ═══════════════════════════════════════════════════════
   3. FLOATING LABEL
═══════════════════════════════════════════════════════ */
const FloatingLabel = ({
  text,
  position = [0, 3, 0] as [number, number, number],
  bgColor = "#fbbf24",
  textColor = "#000000",
  scale = 1.0,
}: any) => {
  const spriteRef = useRef<THREE.Sprite>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const fontSize = 100; const lineHeight = 120; const padding = 80; const maxWidth = 1200;
    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
    const words = text.toUpperCase().split(" ");
    const lines: string[] = []; let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
      const w = words[i];
      if (ctx.measureText(currentLine + " " + w).width < maxWidth) currentLine += " " + w;
      else { lines.push(currentLine); currentLine = w; }
    }
    lines.push(currentLine);
    let maxW = 0; lines.forEach(l => { maxW = Math.max(maxW, ctx.measureText(l).width); });
    const cW = Math.max(maxW, 200) + padding * 2;
    const cH = lines.length * lineHeight + padding * 1.5;
    canvas.width = cW; canvas.height = cH;
    ctx.clearRect(0, 0, cW, cH);
    ctx.fillStyle = bgColor;
    ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
    ctx.beginPath(); ctx.roundRect(0, 0, cW, cH, 30); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = textColor;
    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    lines.forEach((line, idx) => {
      const y = (cH / 2) - ((lines.length - 1) * lineHeight / 2) + (idx * lineHeight);
      ctx.fillText(line, cW / 2, y);
    });
    return new THREE.CanvasTexture(canvas);
  }, [text, bgColor, textColor]);
  const aspect = texture.image ? texture.image.width / texture.image.height : 1;
  useFrame((state) => {
    if (!spriteRef.current) return;
    spriteRef.current.position.y = position[1] + Math.sin(state.clock.getElapsedTime() * 1.5) * 0.1;
    const dist = state.camera.position.distanceTo(spriteRef.current.position);
    const sf = THREE.MathUtils.clamp(dist / 55, 0.45, 2.0);
    spriteRef.current.scale.set(scale * sf * aspect, scale * sf, 1);
  });
  return (
    <sprite ref={spriteRef} position={new THREE.Vector3(...position)}>
      <spriteMaterial map={texture} depthTest={false} transparent opacity={0.95} />
    </sprite>
  );
};

/* ═══════════════════════════════════════════════════════
   4. FABRIC ROLL PALLET  — hover shows label if name given
═══════════════════════════════════════════════════════ */
const FabricRollPallet = ({
  position, rotation = [0, 0, 0], rollColor = "#64748b",
  emptySlot = null, name = "",
}: any) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && !!name);

  const rolls = useMemo(() => {
    const arr: JSX.Element[] = [];
    const mat = new THREE.MeshStandardMaterial({ color: rollColor, roughness: 0.6 });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const idx = r * 3 + c;
        if (idx === emptySlot) continue;
        arr.push(
          <group key={`${r}-${c}`} position={[(c * 0.42) - 0.42, (r * 0.35) + 0.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh castShadow geometry={rollGeom} material={mat} />
            <mesh geometry={tubeGeom} material={tubeMat} />
          </group>
        );
      }
    }
    return arr;
  }, [rollColor, emptySlot]);

  return (
    <group
      position={new THREE.Vector3(...position)}
      rotation={new THREE.Euler(...rotation)}
      onPointerOver={e => { e.stopPropagation(); if (name) setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[1.5, 0.1, 1.4]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      {[0.73, -0.73].map((x, i) => (
        <mesh key={i} position={[x, 0.6, 0]}>
          <boxGeometry args={[0.04, 1.2, 1.4]} />
          <meshStandardMaterial color="#334155" wireframe />
        </mesh>
      ))}
      {rolls}
      {hovered && name && (
        <FloatingLabel text={name} position={[0, 1.8, 0]} bgColor="#0284c7" textColor="#ffffff" scale={1.2} />
      )}
    </group>
  );
};

/* ═══════════════════════════════════════════════════════
   5. DOUBLE RACK  — hover shows rack ID label
═══════════════════════════════════════════════════════ */
const DoubleRack = ({ position, label, rollColor, emptySlots = [] }: any) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const twinDepth = 2.8;

  return (
    <group
      position={new THREE.Vector3(...position)}
      onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      {/* Upright posts */}
      {[-SPECS.bayWidth, 0, SPECS.bayWidth].map((x, i) => (
        <group key={i} position={[x, SPECS.rackHeight / 2, 0]}>
          <mesh position={[0, 0, twinDepth / 2]} castShadow><boxGeometry args={[0.15, SPECS.rackHeight, 0.15]} /><meshStandardMaterial color={SPECS.postColor} /></mesh>
          <mesh position={[0, 0, -twinDepth / 2]} castShadow><boxGeometry args={[0.15, SPECS.rackHeight, 0.15]} /><meshStandardMaterial color={SPECS.postColor} /></mesh>
          {[1, 2.5, 4].map(y => (
            <mesh key={y} position={[0, y - SPECS.rackHeight / 2, 0]}><boxGeometry args={[0.1, 0.05, twinDepth]} /><meshStandardMaterial color={SPECS.postColor} /></mesh>
          ))}
        </group>
      ))}
      {/* Levels */}
      {SPECS.levels.map((y, idx) => (
        <group key={idx} position={[0, y, 0]}>
          {[twinDepth / 2 - 0.1, -(twinDepth / 2 - 0.1)].map((z, j) => (
            <mesh key={j} position={[0, -0.7, z]}><boxGeometry args={[SPECS.bayWidth * 2.1, 0.2, 0.1]} /><meshStandardMaterial color={SPECS.beamColor} /></mesh>
          ))}
          {idx === 0 ? (
            <>
              {!emptySlots.includes(0) && <FabricRollPallet position={[-SPECS.bayWidth / 2, -0.6, 0.65]} rollColor={rollColor} />}
              {!emptySlots.includes(1) && <FabricRollPallet position={[SPECS.bayWidth / 2, -0.6, 0.65]} rollColor={rollColor} />}
              {!emptySlots.includes(2) && <FabricRollPallet position={[-SPECS.bayWidth / 2, -0.6, -0.65]} rollColor={rollColor} />}
              {!emptySlots.includes(3) && <FabricRollPallet position={[SPECS.bayWidth / 2, -0.6, -0.65]} rollColor={rollColor} />}
            </>
          ) : (
            <>
              <FabricRollPallet position={[-SPECS.bayWidth / 2, -0.6, 0.65]} rollColor={rollColor} />
              <FabricRollPallet position={[SPECS.bayWidth / 2, -0.6, 0.65]} rollColor={rollColor} />
              <FabricRollPallet position={[-SPECS.bayWidth / 2, -0.6, -0.65]} rollColor={rollColor} />
              <FabricRollPallet position={[SPECS.bayWidth / 2, -0.6, -0.65]} rollColor={rollColor} />
            </>
          )}
        </group>
      ))}
      {/* Hover label — rack ID like "F1-R1", "Q-R2", etc. */}
      {hovered && label && (
        <FloatingLabel
          text={label}
          position={[0, SPECS.rackHeight + 0.8, 0]}
          bgColor="#fbbf24"
          textColor="#000000"
          scale={1.2}
        />
      )}
    </group>
  );
};

/* ═══════════════════════════════════════════════════════
   6. ZONE BOUNDARY
═══════════════════════════════════════════════════════ */
const ZoneBoundary = ({ positions, zoneName, rackWidth = 5.8, rackDepth = 3.0 }: any) => {
  const b = useMemo(() => {
    if (!positions?.length) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    positions.forEach((p: any) => {
      minX = Math.min(minX, p[0] - rackWidth / 2); maxX = Math.max(maxX, p[0] + rackWidth / 2);
      minZ = Math.min(minZ, p[2] - rackDepth / 2); maxZ = Math.max(maxZ, p[2] + rackDepth / 2);
    });
    const ex = 1.0;
    return { w: (maxX - minX) + 2 * ex, d: (maxZ - minZ) + 2 * ex, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
  }, [positions, rackWidth, rackDepth]);
  if (!b) return null;
  const t = 0.2;
  return (
    <group position={[b.cx, 0.01, b.cz]}>
      <mesh position={[0, 0, b.d / 2]}><boxGeometry args={[b.w, 0.02, t]} /><meshBasicMaterial color="#fbbf24" /></mesh>
      <mesh position={[0, 0, -b.d / 2]}><boxGeometry args={[b.w, 0.02, t]} /><meshBasicMaterial color="#fbbf24" /></mesh>
      <mesh position={[-b.w / 2, 0, 0]}><boxGeometry args={[t, 0.02, b.d]} /><meshBasicMaterial color="#fbbf24" /></mesh>
      <mesh position={[b.w / 2, 0, 0]}><boxGeometry args={[t, 0.02, b.d]} /><meshBasicMaterial color="#fbbf24" /></mesh>
      {zoneName && (
        <FloatingLabel text={zoneName} position={[0, 0.02, b.d / 2 + 0.8]} bgColor="#fbbf24" textColor="#000000" scale={0.6} />
      )}
    </group>
  );
};

/* ═══════════════════════════════════════════════════════
   7. TRUCK  — hover shows "TRUCK"
═══════════════════════════════════════════════════════ */
const Truck = ({ position, rotation = [0, 0, 0] }: any) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const paint = <meshStandardMaterial color="#4a0404" metalness={0.1} roughness={0.9} />;
  const tire = <meshStandardMaterial color="#111111" roughness={0.9} />;
  const glass = <meshPhysicalMaterial color="#0f172a" metalness={1} roughness={0.1} opacity={0.6} transparent />;
  return (
    <group
      position={new THREE.Vector3(...position)}
      rotation={new THREE.Euler(...rotation)}
      onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      {hovered && <FloatingLabel text="Delivery Truck" position={[0, 5.5, 0]} bgColor="#1e293b" textColor="#ffffff" scale={1.5} />}
      <mesh position={[0, 2.5, -2]} castShadow><boxGeometry args={[4, 4.2, 14]} />{paint}</mesh>
      <mesh position={[0, 1.9, 7.2]} castShadow><boxGeometry args={[3.6, 3.8, 4.4]} />{paint}</mesh>
      <mesh position={[0, 2.8, 9.42]}><boxGeometry args={[3.2, 1.8, 0.05]} />{glass}</mesh>
      {[1.81, -1.81].map((x, i) => <mesh key={i} position={[x, 2.8, 7.8]}><boxGeometry args={[0.02, 1.6, 2.2]} />{glass}</mesh>)}
      {[[1.8, 8.2], [-1.8, 8.2], [1.8, -5.5], [-1.8, -5.5], [1.8, -7.5], [-1.8, -7.5], [1.8, 3.5], [-1.8, 3.5]].map((p, i) => (
        <mesh key={i} position={[p[0], 0.6, p[1]]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.6, 0.6, 0.5, 32]} />{tire}
        </mesh>
      ))}
      <mesh position={[0, 0.8, -0.5]}><boxGeometry args={[3.0, 0.4, 18]} /><meshStandardMaterial color="#111827" metalness={0.8} /></mesh>
    </group>
  );
};

/* ═══════════════════════════════════════════════════════
   8. INSPECTION MACHINE  — hover shows name
═══════════════════════════════════════════════════════ */
const InspectionMachine = ({
  position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1],
  name = "Inspection Machine", showLabel = false, labelText = "",
}: any) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const labelH = 1.2 * (Array.isArray(scale) ? scale[1] : scale);
  return (
    <group position={new THREE.Vector3(...position)} rotation={new THREE.Euler(...rotation)}>
      <group
        scale={new THREE.Vector3(...scale)}
        onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <mesh position={[-1.4, 1, 0]}><boxGeometry args={[0.3, 2, 2.2]} /><meshStandardMaterial color="#1d4ed8" metalness={0.5} /></mesh>
        <mesh position={[1.4, 1, 0]}><boxGeometry args={[0.3, 2, 2.2]} /><meshStandardMaterial color="#1d4ed8" metalness={0.5} /></mesh>
        <group position={[0, 1.5, 0.2]} rotation={[-Math.PI / 6, 0, 0]}>
          <mesh><boxGeometry args={[2.5, 1.6, 0.1]} /><meshStandardMaterial color="#334155" /></mesh>
          <mesh position={[0, 0, 0.06]}><boxGeometry args={[2.3, 1.4, 0.02]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} /></mesh>
        </group>
        {[0.4, 2.4].map((y, i) => (
          <mesh key={i} position={[0, y, 0.8]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.08, 0.08, 2.6, 16]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.8} />
          </mesh>
        ))}
        <mesh position={[0, 0.05, 0]}><boxGeometry args={[3.2, 0.1, 2.4]} /><meshStandardMaterial color="#1e293b" /></mesh>
      </group>
      {/* Show on hover OR if showLabel prop is set */}
      {(hovered || showLabel) && (
        <FloatingLabel
          text={showLabel ? labelText : name}
          position={[0, labelH + 1.5, 0]}
          bgColor={showLabel ? "#0284c7" : "#fbbf24"}
          textColor={showLabel ? "#ffffff" : "#000000"}
          scale={1.4}
        />
      )}
    </group>
  );
};

/* ═══════════════════════════════════════════════════════
   9. INDUSTRIAL WORK TABLE  — hover shows name
═══════════════════════════════════════════════════════ */
const IndustrialWorkTable = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], name = "Work Table" }: any) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  return (
    <group position={new THREE.Vector3(...position)} rotation={new THREE.Euler(...rotation)}>
      <group
        scale={new THREE.Vector3(...scale)}
        onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <mesh position={[0, 0.9, 0]}><boxGeometry args={[3, 0.15, 1.5]} /><meshStandardMaterial color="#b45309" /></mesh>
        {[[-1.4, -0.6], [1.4, -0.6], [-1.4, 0.6], [1.4, 0.6]].map((p, i) => (
          <mesh key={i} position={[p[0], 0.45, p[1]]}><boxGeometry args={[0.12, 0.9, 0.12]} /><meshStandardMaterial color="#334155" /></mesh>
        ))}
        <mesh position={[0, 0.25, 0]}><boxGeometry args={[2.7, 0.05, 1.3]} /><meshStandardMaterial color="#475569" /></mesh>
      </group>
      {hovered && (
        <FloatingLabel
          text={name}
          position={[0, 0.6 * (Array.isArray(scale) ? scale[1] : scale[0]) + 1.5, 0]}
          bgColor="#fbbf24"
          textColor="#000000"
          scale={1.2}
        />
      )}
    </group>
  );
};

/* ═══════════════════════════════════════════════════════
   10. STANDING OPERATOR  — hover shows "Operator"
═══════════════════════════════════════════════════════ */
const StandingOperator = ({ position, rotation = [0, 0, 0], name = "Operator" }: any) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  return (
    <group
      position={new THREE.Vector3(...position)}
      rotation={new THREE.Euler(...rotation)}
      onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      <group scale={[2, 2, 2]}>
        <mesh position={[0, 0.375, 0]}><boxGeometry args={[0.35, 0.75, 0.25]} /><meshStandardMaterial color="#800000" /></mesh>
        <mesh position={[0, 1.025, 0]}><boxGeometry args={[0.4, 0.55, 0.3]} /><meshStandardMaterial color="#800000" /></mesh>
        <mesh position={[0, 1.45, 0]}><sphereGeometry args={[0.13, 16, 16]} /><meshStandardMaterial color="#ffdbac" /></mesh>
        <mesh position={[0, 1.52, -0.02]} scale={[1, 0.5, 1]}><sphereGeometry args={[0.135, 16, 16]} /><meshStandardMaterial color="#4b2c20" /></mesh>
        <mesh position={[0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, 0.1]}><boxGeometry args={[0.1, 0.55, 0.1]} /><meshStandardMaterial color="#800000" /></mesh>
        <mesh position={[-0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, -0.1]}><boxGeometry args={[0.1, 0.55, 0.1]} /><meshStandardMaterial color="#800000" /></mesh>
      </group>
      {hovered && (
        <FloatingLabel text={name} position={[0, 4.5, 0]} bgColor="#334155" textColor="#ffffff" scale={1.0} />
      )}
    </group>
  );
};

/* ═══════════════════════════════════════════════════════
   11. ACCURATE AGV  — hover shows name
═══════════════════════════════════════════════════════ */
const AccurateAGV = ({
  position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1],
  name = "AGV", hasPallet = false, rollColor = "#64748b", palletRotation = 0,
}: any) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const primary = "#d97706"; const grey = "#111827"; const maroon = "#800000";
  return (
    <group
      position={new THREE.Vector3(...position)}
      rotation={new THREE.Euler(...rotation)}
      scale={new THREE.Vector3(...scale)}
      onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      {/* Chassis */}
      <mesh position={[0, 0.15, 0]} castShadow><boxGeometry args={[0.9, 0.3, 1.2]} /><meshStandardMaterial color={grey} metalness={0.6} /></mesh>
      {/* Forks */}
      <group position={[0, 0, 0.6]}>
        {[0.25, -0.25].map((x, i) => (
          <mesh key={i} position={[x, 0.05, 0.65]} castShadow><boxGeometry args={[0.2, 0.04, 1.3]} /><meshStandardMaterial color={primary} /></mesh>
        ))}
      </group>
      {/* Upright body */}
      <mesh position={[0, 0.8, 0.1]} castShadow><boxGeometry args={[0.9, 1.1, 0.6]} /><meshStandardMaterial color={grey} metalness={0.5} /></mesh>
      {/* Cage */}
      <group position={[0, 1.8, 0.4]}>
        <mesh position={[0.42, 0, 0]}><boxGeometry args={[0.06, 1.0, 0.06]} /><meshStandardMaterial color={primary} /></mesh>
        <mesh position={[-0.42, 0, 0]}><boxGeometry args={[0.06, 1.0, 0.06]} /><meshStandardMaterial color={primary} /></mesh>
        <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.9, 0.06, 0.06]} /><meshStandardMaterial color={primary} /></mesh>
      </group>
      {/* Handle */}
      <mesh position={[0, 1.35, 0.35]} rotation={[0.4, 0, 0]}><cylinderGeometry args={[0.02, 0.02, 0.4]} /><meshStandardMaterial color="#000" /></mesh>
      <mesh position={[0, 1.55, 0.45]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.08, 0.02, 8, 16]} /><meshStandardMaterial color="#000" /></mesh>
      {/* Operator */}
      <group position={[0, 0.3, -0.45]}>
        <mesh position={[0, 0.375, 0]}><boxGeometry args={[0.35, 0.75, 0.25]} /><meshStandardMaterial color={maroon} /></mesh>
        <mesh position={[0, 1.025, 0]}><boxGeometry args={[0.4, 0.55, 0.3]} /><meshStandardMaterial color={maroon} /></mesh>
        <mesh position={[0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, 0.1]}><capsuleGeometry args={[0.06, 0.45, 4, 8]} /><meshStandardMaterial color={maroon} /></mesh>
        <mesh position={[-0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, -0.1]}><capsuleGeometry args={[0.06, 0.45, 4, 8]} /><meshStandardMaterial color={maroon} /></mesh>
        <mesh position={[0, 1.45, 0]}><sphereGeometry args={[0.13, 16, 16]} /><meshStandardMaterial color="#ffdbac" /></mesh>
        <mesh position={[0, 1.52, -0.02]} scale={[1, 0.5, 1]}><sphereGeometry args={[0.135, 16, 16]} /><meshStandardMaterial color="#4b2c20" /></mesh>
      </group>
      {hasPallet && (
        <group position={[0, 0, 1.4]} rotation={[0, palletRotation, 0]} scale={[0.5, 0.5, 0.5]}>
          <FabricRollPallet position={[0, 0, 0]} rollColor={rollColor} />
        </group>
      )}
      {hovered && (
        <FloatingLabel text={name} position={[0, 3.5, 0]} bgColor="#d97706" textColor="#000000" scale={1.2} />
      )}
    </group>
  );
};

/* ═══════════════════════════════════════════════════════
   12. HYBRID CONVEYOR  — hover shows label
═══════════════════════════════════════════════════════ */
const HybridConveyor = ({ position = [0, 0, 0], rotation = [0, 0, 0], count = 4 }: any) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const palletLength = 1.6; const longPartLength = 18; const beltY = 1.9;
  return (
    <group
      position={new THREE.Vector3(...position)}
      rotation={new THREE.Euler(...rotation)}
      onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      {/* Long belt section */}
      <group position={[longPartLength / 2 + (count * palletLength), 0, 0]}>
        <mesh position={[0, beltY, 0]} receiveShadow>
          <boxGeometry args={[longPartLength, 0.12, 1.3]} />
          <meshStandardMaterial color="#111827" metalness={0.9} />
        </mesh>
        <mesh position={[longPartLength / 2, beltY + 0.1, 0]}>
          <boxGeometry args={[0.05, 0.2, 1.2]} />
          <meshStandardMaterial color="#eab308" emissive="#713f12" />
        </mesh>
        {[-0.68, 0.68].map((z, j) => (
          <mesh key={j} position={[0, beltY + 0.08, z]}>
            <boxGeometry args={[longPartLength, 0.15, 0.05]} />
            <meshStandardMaterial color="#94a3b8" metalness={1} />
          </mesh>
        ))}
      </group>
      {/* Segmented section */}
      <mesh position={[(count * palletLength) / 2, beltY - 0.05, 0]} receiveShadow>
        <boxGeometry args={[count * palletLength, 0.12, 1.3]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0, beltY + 0.1, 0]}>
        <boxGeometry args={[0.05, 0.2, 1.2]} />
        <meshStandardMaterial color="#eab308" emissive="#713f12" />
      </mesh>
      {Array.from({ length: count }).map((_, i) => (
        <group key={i} position={[i * palletLength, 0, 0]}>
          <mesh position={[palletLength, beltY + 0.1, 0]}>
            <boxGeometry args={[0.05, 0.2, 1.2]} />
            <meshStandardMaterial color="#eab308" emissive="#713f12" />
          </mesh>
          <mesh position={[palletLength / 2, beltY / 2, 0]}>
            <boxGeometry args={[0.1, beltY, 1.1]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
        </group>
      ))}
      {hovered && (
        <FloatingLabel text="Roll Infeed Conveyor" position={[9, 4.5, 0]} bgColor="#475569" textColor="#ffffff" scale={1.4} />
      )}
    </group>
  );
};

/* ═══════════════════════════════════════════════════════
   13. QR WORKSTATION  — hover shows label
═══════════════════════════════════════════════════════ */
const QRWorkstation = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] }: any) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const maroon = "#800000"; const tableTop = "#475569"; const frame = "#1e293b";
  return (
    <group
      position={new THREE.Vector3(...position)}
      rotation={new THREE.Euler(...rotation)}
      onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      <group scale={new THREE.Vector3(...scale)}>
        {/* Table */}
        <mesh position={[0, 0.8, 0]} receiveShadow><boxGeometry args={[2.5, 0.1, 1.5]} /><meshStandardMaterial color={tableTop} roughness={0.8} /></mesh>
        {[[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]].map((p, i) => (
          <mesh key={i} position={[p[0], 0.4, p[1]]}><boxGeometry args={[0.1, 0.8, 0.1]} /><meshStandardMaterial color={frame} /></mesh>
        ))}
        <mesh position={[0, 0.24, 0]}><boxGeometry args={[2.2, 0.05, 1.2]} /><meshStandardMaterial color={frame} wireframe /></mesh>
        {/* Printer */}
        <group position={[0, 0.85, 0]}>
          <mesh position={[0, 0.15, 0]} castShadow><boxGeometry args={[1.0, 0.3, 0.8]} /><meshStandardMaterial color="#334155" metalness={0.5} /></mesh>
          <group position={[0, 0.3, 0]}>
            <mesh position={[0, 0.2, 0]} castShadow><boxGeometry args={[0.6, 0.4, 0.5]} /><meshStandardMaterial color="#0f172a" /></mesh>
            <mesh position={[0, 0.1, 0.3]} rotation={[0.5, 0, 0]}><planeGeometry args={[0.3, 0.2]} /><meshStandardMaterial color="white" side={THREE.DoubleSide} /></mesh>
          </group>
        </group>
        {/* Operator */}
        <group position={[0.2, 0, 0.85]} rotation={[0, Math.PI, 0]}>
          <mesh position={[0, 0.375, 0]}><boxGeometry args={[0.35, 0.75, 0.25]} /><meshStandardMaterial color={maroon} /></mesh>
          <mesh position={[0, 1.025, 0]}><boxGeometry args={[0.4, 0.55, 0.3]} /><meshStandardMaterial color={maroon} /></mesh>
          <mesh position={[-0.2, 1.1, 0.15]} rotation={[Math.PI / 2.5, 0, 0.1]}><capsuleGeometry args={[0.06, 0.45, 4, 8]} /><meshStandardMaterial color={maroon} /></mesh>
          <mesh position={[0.2, 1.1, 0.15]} rotation={[Math.PI / 2.5, 0, -0.1]}><capsuleGeometry args={[0.06, 0.45, 4, 8]} /><meshStandardMaterial color={maroon} /></mesh>
          <mesh position={[0, 1.45, 0]}><sphereGeometry args={[0.13, 16, 16]} /><meshStandardMaterial color="#ffdbac" /></mesh>
          <mesh position={[0, 1.52, -0.02]} scale={[1, 0.5, 1]}><sphereGeometry args={[0.135, 16, 16]} /><meshStandardMaterial color="#4b2c20" /></mesh>
        </group>
      </group>
      {hovered && (
        <FloatingLabel
          text="QR Sticker Station"
          position={[0, 1.2 * (Array.isArray(scale) ? scale[1] : scale[0]) + 2.0, 0]}
          bgColor="#fbbf24"
          textColor="#000000"
          scale={1.3}
        />
      )}
    </group>
  );
};

/* ═══════════════════════════════════════════════════════
   14. QR SCANNER STATION  — hover shows label
═══════════════════════════════════════════════════════ */
const QRScannerStation = ({ position, rotation = [0, 0, 0], scale = [1, 1, 1] }: any) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const wood = "#966F33";
  return (
    <group
      position={new THREE.Vector3(...position)}
      rotation={new THREE.Euler(...rotation)}
      scale={new THREE.Vector3(...scale)}
      onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh position={[0, 1.5, 0]} castShadow receiveShadow><boxGeometry args={[2.5, 0.1, 1.5]} /><meshStandardMaterial color={wood} roughness={0.6} metalness={0.1} /></mesh>
      {[[1.1, 0.6], [1.1, -0.6], [-1.1, 0.6], [-1.1, -0.6]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.75, z]} castShadow><boxGeometry args={[0.1, 1.5, 0.1]} /><meshStandardMaterial color={wood} roughness={0.6} metalness={0.1} /></mesh>
      ))}
      <group position={[0, 1.55, 0]} scale={[0.5, 0.5, 0.5]}>
        <mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[0.8, 1, 0.8]} /><meshPhysicalMaterial color="#fff" roughness={0.2} clearcoat={1.0} /></mesh>
        <mesh position={[0, 0.7, 0.41]} rotation={[-0.2, 0, 0]}><planeGeometry args={[0.6, 0.5]} /><meshStandardMaterial color="#000" emissive="#111111" roughness={0.1} /></mesh>
        <mesh position={[0, 0.3, 0.4]}><boxGeometry args={[0.5, 0.1, 0.1]} /><meshBasicMaterial color="#00ffff" /></mesh>
      </group>
      {hovered && (
        <FloatingLabel text="QR Scanner Station" position={[0, 4.5, 0]} bgColor="#0284c7" textColor="#ffffff" scale={1.3} />
      )}
    </group>
  );
};

/* ═══════════════════════════════════════════════════════
   15. AUTO SCANNER SHED  — hover shows label
═══════════════════════════════════════════════════════ */
const AutoScannerShed = ({ position }: any) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  return (
    <group
      position={new THREE.Vector3(...position)}
      onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh position={[0.8, 1.7, 0]}><boxGeometry args={[0.2, 3.4, 0.8]} /><meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} /></mesh>
      <mesh position={[-0.8, 1.7, 0]}><boxGeometry args={[0.2, 3.4, 0.8]} /><meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} /></mesh>
      <mesh position={[0, 3.4, 0]}><boxGeometry args={[1.8, 0.2, 0.8]} /><meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} /></mesh>
      <mesh position={[0, 3.25, 0]}><boxGeometry args={[1.4, 0.1, 0.4]} /><meshStandardMaterial color="#000" emissive="#000" /></mesh>
      <mesh position={[0.6, 3.55, 0]}><sphereGeometry args={[0.1, 16, 16]} /><meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} /></mesh>
      <mesh position={[-0.6, 3.55, 0]}><sphereGeometry args={[0.1, 16, 16]} /><meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} /></mesh>
      {hovered && (
        <FloatingLabel text="Auto QR Scanner" position={[0, 4.8, 0]} bgColor="#0284c7" textColor="#ffffff" scale={1.3} />
      )}
    </group>
  );
};

/* ═══════════════════════════════════════════════════════
   16. MONITORING TV  — hover shows label
═══════════════════════════════════════════════════════ */
const MonitoringScreen = ({ image }: any) => {
  const texture = useTexture(image);
  return (
    <mesh position={[0, 0, 0.07]}>
      <planeGeometry args={[1.7, 1.0]} />
      <meshBasicMaterial map={texture as any} />
    </mesh>
  );
};

const MonitoringTV = ({ position, rotation = [0, 0, 0], scale = [1, 1, 1], image, name = "Monitoring Dashboard" }: any) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  return (
    <group
      position={new THREE.Vector3(...position)}
      rotation={new THREE.Euler(...rotation)}
      scale={new THREE.Vector3(...scale)}
      onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh position={[0, 0.05, 0]} castShadow><boxGeometry args={[0.8, 0.1, 0.8]} /><meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} /></mesh>
      <mesh position={[0, 1.2, 0]} castShadow><cylinderGeometry args={[0.04, 0.04, 2.4, 16]} /><meshStandardMaterial color="#475569" metalness={0.9} roughness={0.1} /></mesh>
      <group position={[0, 2.4, 0.05]}>
        <mesh castShadow><boxGeometry args={[1.8, 1.1, 0.1]} /><meshStandardMaterial color="#0f172a" roughness={0.5} /></mesh>
        <Suspense fallback={
          <mesh position={[0, 0, 0.07]}><planeGeometry args={[1.7, 1.0]} /><meshStandardMaterial color="#fff" emissive="#0284c7" emissiveIntensity={0.5} roughness={0.2} /></mesh>
        }>
          {image
            ? <MonitoringScreen image={image} />
            : <mesh position={[0, 0, 0.07]}><planeGeometry args={[1.7, 1.0]} /><meshStandardMaterial color="#fff" emissive="#0284c7" emissiveIntensity={0.5} roughness={0.2} /></mesh>
          }
        </Suspense>
        <mesh position={[0, 0, 0.055]}><boxGeometry args={[1.75, 1.05, 0.01]} /><meshStandardMaterial color="#000" /></mesh>
      </group>
      {hovered && (
        <FloatingLabel text={name} position={[0, 4.2, 0]} bgColor="#0f172a" textColor="#ffffff" scale={1.2} />
      )}
    </group>
  );
};

/* ═══════════════════════════════════════════════════════
   17. FABRIC SQUARE
═══════════════════════════════════════════════════════ */
const FabricSquare = ({ position, color }: any) => (
  <mesh position={new THREE.Vector3(...position)} castShadow>
    <boxGeometry args={[0.8, 0.1, 0.8]} />
    <meshStandardMaterial color={color} roughness={0.8} />
  </mesh>
);

/* ═══════════════════════════════════════════════════════
   18. SCANNER OPERATOR  — hover shows label
═══════════════════════════════════════════════════════ */
const ScannerOperator = ({ position, rotation = [0, 0, 0], name = "Scanner Operator" }: any) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  return (
    <group
      position={new THREE.Vector3(...position)}
      rotation={new THREE.Euler(...rotation)}
      onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      <group scale={[2, 2, 2]}>
        <mesh position={[0, 0.375, 0]}><boxGeometry args={[0.35, 0.75, 0.25]} /><meshStandardMaterial color="#800000" /></mesh>
        <mesh position={[0, 1.025, 0]}><boxGeometry args={[0.4, 0.55, 0.3]} /><meshStandardMaterial color="#800000" /></mesh>
        <mesh position={[0, 1.45, 0]}><sphereGeometry args={[0.13, 16, 16]} /><meshStandardMaterial color="#ffdbac" /></mesh>
        <mesh position={[0, 1.52, -0.02]} scale={[1, 0.5, 1]}><sphereGeometry args={[0.135, 16, 16]} /><meshStandardMaterial color="#4b2c20" /></mesh>
        <mesh position={[-0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, -0.1]}><boxGeometry args={[0.1, 0.55, 0.1]} /><meshStandardMaterial color="#800000" /></mesh>
        <group position={[0.22, 1.1, 0.25]} rotation={[-Math.PI / 2.5, 0, 0.1]}>
          <mesh position={[0, -0.2, 0]}><boxGeometry args={[0.1, 0.55, 0.1]} /><meshStandardMaterial color="#800000" /></mesh>
          <mesh position={[0, -0.45, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
            <boxGeometry args={[0.12, 0.1, 0.2]} />
            <meshStandardMaterial color="#222" />
          </mesh>
        </group>
      </group>
      {hovered && (
        <FloatingLabel text={name} position={[0, 4.5, 0]} bgColor="#334155" textColor="#ffffff" scale={1.0} />
      )}
    </group>
  );
};

/* ═══════════════════════════════════════════════════════
   19. STYLED COMPONENTS
═══════════════════════════════════════════════════════ */
const Wrapper = styled.div`
  width: 100%; height: 100vh; background: #0f172a; overflow: hidden; display: flex;
`;
const Sidebar = styled(motion.aside)`
  width: 280px; background: #020617; border-right: 1px solid rgba(255,255,255,0.05);
  display: flex; flex-direction: column; overflow: hidden; z-index: 20; position: relative;
`;
const Content = styled.main`
  flex: 1; display: flex; flex-direction: column; position: relative; overflow: hidden;
`;
const NavItem = styled.button<{ $active: boolean }>`
  width: 100%; display: flex; align-items: center; gap: 1rem; padding: 1.2rem 1.5rem;
  background: ${p => p.$active ? "rgba(255,255,255,0.05)" : "transparent"};
  color: ${p => p.$active ? "#fff" : "#64748b"};
  border: none; border-left: 4px solid ${p => p.$active ? "#8b5cf6" : "transparent"};
  cursor: pointer; transition: all 0.3s;
  &:hover { background: rgba(255,255,255,0.03); color: #fff; }
`;

/* ═══════════════════════════════════════════════════════
   20. MAIN PAGE
═══════════════════════════════════════════════════════ */
const SIDEBAR_ITEMS = [
  { id: "warehouse", label: "Warehouse", icon: Warehouse },
  { id: "cutting", label: "Cutting", icon: Scissors },
  { id: "sewing", label: "Sewing Line", icon: Factory },
  { id: "finishing", label: "Finishing", icon: CheckCircle2 },
];

export default function DigitalTwinPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("warehouse");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [lineStatuses, setLineStatuses] = useState<any[]>([]);
  const [activeMachines, setActiveMachines] = useState<MachinePosition[]>([]);

  const activeFloor = searchParams.get("floor") || "Floor 1";
  const activeLine = searchParams.get("line") || "All Lines";

  const racks = useMemo(() => {
    const arr: any[] = [];
    Object.entries(ZONE_LAYOUT).forEach(([zone, cfg]) =>
      cfg.positions.forEach((pos, i) => arr.push({ id: `${zone}-R${i + 1}`, pos }))
    );
    return arr;
  }, []);

  const floorSections = useMemo((): SectionLayout[] => {
    const { specs, sections } = getLayoutSpecs("Line 1");
    const minZ = LANE_Z_CENTER_AB - specs.widthAB / 2;
    const maxZ = LANE_Z_CENTER_CD + specs.widthCD / 2;
    const zStep = (maxZ - minZ) + 3.7;
    const numLines = activeFloor === "Floor 1" ? 6 : 3;
    const arr: SectionLayout[] = [];
    for (let i = 0; i < numLines; i++) {
      const lineVal = activeFloor === "Floor 1" ? `Line ${i + 1}` : `Line ${i + 7}`;
      if (activeLine !== "All Lines" && lineVal !== activeLine) continue;
      const color = LINE_COLORS[(activeFloor === "Floor 1" ? i : i + 6) % LINE_COLORS.length];
      const zo = i * zStep;
      arr.push(
        { id: `${lineVal}-marker`, name: lineVal, length: 2, width: specs.widthAB + specs.widthCD + 3.7, position: { x: sections.cuff.start - 3, y: -0.01, z: (LANE_Z_CENTER_AB + LANE_Z_CENTER_CD) / 2 + zo }, color: "transparent" },
        { id: `${lineVal}-cuff`, name: `${lineVal} Cuff`, length: sections.cuff.end - sections.cuff.start, width: specs.widthAB, position: { x: sections.cuff.start, y: 0, z: LANE_Z_CENTER_AB + zo }, color },
        { id: `${lineVal}-sleeve`, name: `${lineVal} Sleeve`, length: sections.sleeve.end - sections.sleeve.start, width: specs.widthAB, position: { x: sections.sleeve.start, y: 0, z: LANE_Z_CENTER_AB + zo }, color },
        { id: `${lineVal}-back`, name: `${lineVal} Back`, length: sections.back.end - sections.back.start, width: specs.widthAB, position: { x: sections.back.start, y: 0, z: LANE_Z_CENTER_AB + zo }, color },
        { id: `${lineVal}-collar`, name: `${lineVal} Collar`, length: sections.collar.end - sections.collar.start, width: specs.widthCD, position: { x: sections.collar.start, y: 0, z: LANE_Z_CENTER_CD + zo }, color },
        { id: `${lineVal}-front`, name: `${lineVal} Front`, length: sections.front.end - sections.front.start, width: specs.widthCD, position: { x: sections.front.start, y: 0, z: LANE_Z_CENTER_CD + zo }, color },
        { id: `${lineVal}-a1`, name: `${lineVal} Assembly AB`, length: sections.assemblyAB.end - sections.assemblyAB.start, width: specs.widthAB, position: { x: sections.assemblyAB.start, y: 0, z: LANE_Z_CENTER_AB + zo }, color },
        { id: `${lineVal}-a2`, name: `${lineVal} Assembly CD`, length: sections.assemblyCD.end - sections.assemblyCD.start, width: specs.widthCD, position: { x: sections.assemblyCD.start, y: 0, z: LANE_Z_CENTER_CD + zo }, color },
      );
    }
    return arr;
  }, [activeFloor, activeLine]);

  const finishingSections = useMemo((): SectionLayout[] => {
    const { specs, sections } = getLayoutSpecs("Line 1");
    const numLines = activeFloor === "Floor 1" ? 6 : 3;
    const zStep = (LANE_Z_CENTER_CD + specs.widthCD / 2 - (LANE_Z_CENTER_AB - specs.widthAB / 2)) + 3.7;
    const arr: SectionLayout[] = [];

    const FT = 0.3048;
    const FL = 45.17 * FT;
    const FW = 22.63 * FT;

    for (let i = 0; i < numLines; i++) {
      const lineNum = activeFloor === "Floor 1" ? i + 1 : i + 7;
      const lineVal = `Line ${lineNum}`;
      if (activeLine !== "All Lines" && lineVal !== activeLine) continue;

      const color = LINE_COLORS[(activeFloor === "Floor 1" ? i : i + 6) % LINE_COLORS.length];
      const zo = i * zStep;

      arr.push({
        id: `${lineVal}-finishing`,
        name: `Line ${lineNum}`,
        length: FL,
        width: FW,
        position: {
          x: 55, // Reasonable starting position after sewing lines
          y: 0,
          z: (LANE_Z_CENTER_AB + LANE_Z_CENTER_CD) / 2 + zo
        },
        color
      });
    }
    return arr;
  }, [activeFloor, activeLine]);

  const cameraConfig = useMemo(() => {
    if (activeLine === "All Lines")
      return { pos: activeFloor === "Floor 1" ? [-90, 80, 12] : [-60, 50, 8], fov: activeFloor === "Floor 1" ? 32 : 28 };
    const num = parseInt(activeLine.split(" ")[1]);
    const idx = activeFloor === "Floor 1" ? num - 1 : num - 7;
    const { specs } = getLayoutSpecs("Line 1");
    const zStep = (LANE_Z_CENTER_CD + specs.widthCD / 2 - (LANE_Z_CENTER_AB - specs.widthAB / 2)) + 3.7;
    return { pos: [-30, 40, (LANE_Z_CENTER_AB + LANE_Z_CENTER_CD) / 2 + (idx * zStep)], fov: 25 };
  }, [activeFloor, activeLine]);

  useEffect(() => {
    const f = async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/current-styles`);
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data)) {
            setLineStatuses(data);
          }
        }
      } catch { }
    };
    f(); const t = setInterval(f, 15000); return () => clearInterval(t);
  }, []);

  const [styleCache] = useState<Map<string, any>>(new Map());
  const [lastStyleSignature, setLastStyleSignature] = useState("");

  useEffect(() => {
    if (activeTab !== "sewing") return;
    const f = async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/active-layouts`);
        if (!r.ok) return;
        const data = await r.json();
        if (!Array.isArray(data)) return;

        const getN = (l: string) => { const m = String(l).match(/\d+/); return m ? parseInt(m[0]) : null; };
        let fd = data.filter((s: any) => { 
          const n = getN(s.line_no); 
          if (n === null) return false; 
          return activeFloor === "Floor 1" ? (n >= 1 && n <= 6) : (n >= 7 && n <= 9); 
        });
        if (activeLine !== "All Lines") fd = fd.filter((s: any) => getN(s.line_no) === getN(activeLine));
        fd = fd.filter((s: any) => s.operations && Array.isArray(s.operations) && s.operations.length > 0);

        // Calculate a signature to see if we even need to update
        const signature = fd.map(s => `${s.line_no}_${s.style_no}_${s.con_no}`).join('|');
        if (signature === lastStyleSignature) return;

        const { specs } = getLayoutSpecs("Line 1");
        const zStep = (LANE_Z_CENTER_CD + specs.widthCD / 2 - (LANE_Z_CENTER_AB - specs.widthAB / 2)) + 3.7;
        
        const machines = fd.flatMap((item: any) => {
          const styleKey = `${item.line_no}_${item.style_no}_${item.con_no}`;
          let result;
          
          if (styleCache.has(styleKey)) {
            result = styleCache.get(styleKey);
          } else {
            result = generateCotLayout(item.operations, item.line_no);
            styleCache.set(styleKey, result);
          }

          const n = getN(item.line_no)!;
          const ri = n <= 6 ? n - 1 : n - 7;
          return result.machines.map((m: any) => ({ ...m, position: { ...m.position, z: m.position.z + (ri * zStep) } }));
        });

        setLastStyleSignature(signature);
        setActiveMachines(machines);
      } catch { }
    };
    f(); const t = setInterval(f, 20000); return () => clearInterval(t);
  }, [activeTab, activeFloor, activeLine, lastStyleSignature]);

  return (
    <Wrapper>
      {/* ── Sidebar ── */}
      <Sidebar animate={{ width: sidebarOpen ? 280 : 80 }} transition={{ type: "spring", damping: 20 }}>
        <div className="p-8 pb-12 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/20">
            <Box className="w-6 h-6 text-white" />
          </div>
          {sidebarOpen && (
            <div className="flex flex-col truncate">
              <span className="font-black text-white text-lg tracking-tight">FACTORY TWIN</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">Intelligence Hub</span>
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-1">
          {SIDEBAR_ITEMS.map(item => (
            <NavItem key={item.id} $active={activeTab === item.id} onClick={() => setActiveTab(item.id)}>
              <item.icon size={22} />
              {sidebarOpen && <span className="font-bold text-sm tracking-wide">{item.label}</span>}
            </NavItem>
          ))}
        </nav>
        <div className="p-6 border-t border-white/5">
          <NavItem $active={false} onClick={() => navigate("/")}>
            <Home size={22} />
            {sidebarOpen && <span className="font-bold text-sm tracking-wide">Back to Home</span>}
          </NavItem>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-24 w-6 h-6 bg-violet-600 rounded-full flex items-center justify-center text-white border-2 border-slate-950"
        >
          {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
      </Sidebar>

      {/* ── Main ── */}
      <Content>
        <div className="absolute top-8 left-8 z-10 pointer-events-none">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-1">
            <h2 className="text-4xl font-black text-white tracking-tight uppercase drop-shadow-2xl">
              {SIDEBAR_ITEMS.find(i => i.id === activeTab)?.label}
            </h2>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">Live View</span>
            </div>
          </motion.div>
        </div>

        <div className="w-full h-full flex flex-row">
          <div className="flex-1 h-full bg-[#080a0f]">
            {activeTab === "warehouse" ? (
              <Canvas shadows camera={{ position: [55, 55, 55], fov: 45 }} gl={{ antialias: true }}>
                <Suspense fallback={null}>
                  <ambientLight intensity={0.8} />
                  <directionalLight position={[40, 60, 20]} intensity={1.5} castShadow />
                  <Environment preset="warehouse" />
                  <OrbitControls makeDefault dampingFactor={0.1} enableDamping maxPolarAngle={Math.PI / 2.1} />

                  {/* Floor */}
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 10]}>
                    <planeGeometry args={[180, 180]} />
                    <meshStandardMaterial color="#fdf5e6" opacity={0.6} transparent />
                  </mesh>

                  {/* Zone Boundaries */}
                  {Object.entries(ZONE_LAYOUT).map(([zone, cfg]) => (
                    <ZoneBoundary key={zone} positions={cfg.positions} zoneName={zone} />
                  ))}

                  {/* ── Storage Racks ── label = rack ID e.g. "F1-R1" shown on hover */}
                  {racks.map((r, idx) => (
                    <DoubleRack
                      key={r.id}
                      position={r.pos}
                      label={r.id}
                      rollColor={r.id.startsWith("Q") ? PALETTE[13] : PALETTE[idx % PALETTE.length]}
                      emptySlots={r.id === "F2-R2" ? [1] : []}
                    />
                  ))}

                  {/* ── Inspection Machines ── */}
                  <InspectionMachine
                    position={[17, 0, 52]}
                    rotation={[-Math.PI / 2, Math.PI, Math.PI / 2]}
                    scale={[2, 2, 2]}
                    name="Inspection Machine 1"
                  />
                  <InspectionMachine
                    position={[10, 0, 51.5]}
                    rotation={[-Math.PI / 2, Math.PI, -Math.PI / 2]}
                    scale={[2, 2, 2]}
                    name="Inspection Machine 2"
                  />

                  {/* ── Static Pallets ── */}
                  <FabricRollPallet position={[22, 0, 45]} rollColor={PALETTE[5]} rotation={[0, 0, 0]} name="Fabric Roll Pallet" />
                  <FabricRollPallet position={[8, 0, 45]} rollColor={PALETTE[8]} rotation={[0, 0, 0]} name="Fabric Roll Pallet" />

                  {/* ── Work Tables ── */}
                  <IndustrialWorkTable position={[40, 0, 52]} rotation={[0, Math.PI / 2, 0]} scale={[2.5, 2.5, 2.5]} name="Shrinkage Table 1" />
                  <group position={[40, 1.6, 52]}>
                    <FabricSquare position={[0.5, 0, 0.5]} color={PALETTE[2]} />
                    <FabricSquare position={[-0.5, 0, -0.5]} color={PALETTE[3]} />
                  </group>

                  <IndustrialWorkTable position={[31, 0, 52]} rotation={[0, -Math.PI / 2, 0]} scale={[2.5, 2.5, 2.5]} name="Shrinkage Table 2" />
                  <group position={[31, 1.6, 52]}>
                    <FabricSquare position={[0, 0, 0]} color={PALETTE[7]} />
                  </group>

                  {/* ── Standing Operators ── each given a descriptive name */}
                  <StandingOperator position={[5, 0, 51.8]} rotation={[0, Math.PI / 2, 0]} name="Inspection Operator" />
                  <StandingOperator position={[23, 0, 52]} rotation={[0, -Math.PI / 2, 0]} name="QC Operator" />
                  <StandingOperator position={[42.8, 0, 52]} rotation={[0, -Math.PI / 2, 0]} name="Table Operator" />
                  <StandingOperator position={[34, 0, 52]} rotation={[0, -Math.PI / 2, 0]} name="Table Operator" />
                  <StandingOperator position={[12, 0, 59]} rotation={[0, Math.PI / 2, 0]} name="Scanner Supervisor" />

                  {/* ── Scanner Operator ── */}
                  <ScannerOperator position={[-12, 0, 31]} rotation={[0, Math.PI, 0]} name="Quarantine Scanner" />

                  {/* ── QR Scanner Station ── */}
                  <QRScannerStation position={[14, 0, 59]} rotation={[0, -Math.PI / 2, 0]} scale={[1.2, 1.2, 1.2]} />

                  {/* ── Monitoring TVs ── */}
                  <MonitoringTV position={[5, 0, 63]} rotation={[0, Math.PI, 0]} scale={[1.4, 1.4, 1.4]} image="/models/tv1.jpeg" name="StockGrid Dashboard" />
                  <MonitoringTV position={[-9, 0, 62]} rotation={[0, Math.PI / 2, 0]} scale={[1.4, 1.4, 1.4]} image="/models/tv2.jpeg" name="Warehouse Monitor" />

                  {/* ── AGVs ── */}
                  <AccurateAGV position={[-21.5, 0, 55]} rotation={[0, 0, 0]} scale={[2, 2, 2]} name="Logistics AGV 1" />
                  <AccurateAGV position={[14, 0, 40]} rotation={[0, 0, 0]} scale={[2, 2, 2]} name="Logistics AGV 2" />

                  {/* ── Conveyor ── */}
                  <HybridConveyor position={[-14.0, 0, 58.5]} rotation={[0, -Math.PI / 2, 0]} count={4} />

                  {/* ── QR Workstation ── */}
                  <QRWorkstation position={[-11.0, 0, 70]} rotation={[0, -Math.PI / 2, 0]} scale={[2, 2, 2]} />

                  {/* ── Auto Scanner Shed ── */}
                  <AutoScannerShed position={[-14.0, 0, 67.5]} />

                  {/* ── Conveyor Pallets ── */}
                  <group position={[-15.5, 0, 59.3]} rotation={[0, -Math.PI / 2, 0]}>
                    {[0, 1, 2, 3].map(i => (
                      <FabricRollPallet
                        key={`cp-${i}`}
                        position={[i * 1.6, 0, 0]}
                        rotation={[0, Math.PI / 2, 0]}
                        rollColor={PALETTE[(i + 10) % PALETTE.length]}
                        name={`Conveyor Pallet ${i + 1}`}
                      />
                    ))}
                  </group>

                  {/* ── Truck ── */}
                  <Truck position={[-14, 0, 90]} rotation={[0, 0, 0]} />

                </Suspense>
              </Canvas>

            ) : activeTab === "sewing" ? (
              <Scene3D
                key={activeFloor + activeLine}
                showMachines={true}
                machines={activeMachines}
                sections={floorSections}
                isOverview={activeLine === "All Lines"}
                cameraPosition={cameraConfig.pos as any}
                cameraFov={cameraConfig.fov}
              />
            ) : activeTab === "finishing" ? (
              <Scene3D
                key={"finishing" + activeFloor + activeLine}
                showMachines={false}
                machines={[]}
                sections={finishingSections}
                isOverview={activeLine === "All Lines"}
                cameraPosition={cameraConfig.pos as any}
                cameraFov={cameraConfig.fov}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold uppercase italic tracking-widest">
                {activeTab} — Coming Soon
              </div>
            )}
          </div>

          {/* ── Right Panel ── */}
          {["cutting", "sewing", "finishing"].includes(activeTab) && (
            <div className="w-[340px] bg-slate-900 border-l border-white/5 flex flex-col shadow-2xl relative z-20">
              <div className="p-6 border-b border-white/5 bg-slate-900/50 backdrop-blur-md">
                <h3 className="text-white font-black text-xs uppercase tracking-[0.2em] flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />Live Status
                </h3>
                <div className="flex items-center gap-1 mt-4 bg-black/20 p-1 rounded-xl">
                  {["Floor 1", "Floor 2"].map(f => (
                    <button key={f} onClick={() => setSearchParams({ floor: f, line: activeLine })}
                      className={cn("flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                        activeFloor === f ? "bg-violet-600 text-white" : "text-slate-500"
                      )}>{f}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(id => {
                  const lName = `Line ${id}`;
                  const s = lineStatuses.find(st => st.line_no === lName);
                  const isActive = activeLine === lName;
                  return (
                    <div key={id} className={cn("p-4 rounded-2xl border transition-all relative overflow-hidden",
                      isActive ? "bg-violet-600/20 border-violet-500/50 shadow-lg" : "bg-white/[0.02] border-white/5"
                    )}>
                      {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-500" />}
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-black text-xs text-slate-300">LINE {id}</span>
                        <div className={cn("px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border",
                          s?.status === "Running" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                            s?.status === "Changeover" ? "bg-indigo-500/10  border-indigo-500/20  text-indigo-400" :
                              "bg-slate-800 border-white/5 text-slate-500"
                        )}>{s?.status || "Idle"}</div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/[0.02]">
                          <Users size={12} className="text-slate-500" />
                          <div className="flex flex-col">
                            <span className="text-[8px] text-slate-500 uppercase">Buyer</span>
                            <span className="text-[10px] text-slate-200 font-bold truncate">{s?.buyer || "---"}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/[0.02]">
                          <Hash size={12} className="text-slate-500" />
                          <div className="flex flex-col">
                            <span className="text-[8px] text-slate-500 uppercase">Con No</span>
                            <span className="text-[10px] text-slate-200 font-bold">{s?.con_no || "---"}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => { const f = id <= 6 ? "Floor 1" : "Floor 2"; setSearchParams({ floor: f, line: lName }); }}
                        className={cn("mt-3 w-full py-2 rounded-xl flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all",
                          isActive ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                        )}
                      >{isActive ? "Focused" : "Focus Line"}</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Content>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
      `}</style>
    </Wrapper>
  );
}
