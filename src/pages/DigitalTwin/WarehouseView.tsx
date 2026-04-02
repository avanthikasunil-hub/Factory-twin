import React, { Suspense, useMemo, useState, useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  useTexture,
  useCursor,
  PivotControls
} from "@react-three/drei";
import * as THREE from "three";
import styled from "styled-components";
import { Edit2, Save, Undo2, Redo2, ChevronDown, Play, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const Wrapper = styled.div`
  width: 100%;
  height: 100%;
  background: #f8fafc;
  overflow: hidden;
  position: relative;
`;

/* ───── 1. CONSTANTS ───── */
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
  "#485460", "#2d3436", "#34495e", "#2c3e50", "#2d3436", "#1e272e", "#000000", "#121212"
];

const SPECS = {
  rackHeight: 5.2,
  rackDepth: 1.5,
  bayWidth: 2.8,
  levels: [0.6, 2.2, 3.8],
  postColor: "#001f3f",
  beamColor: "#c2410c",
};

const rollGeom = new THREE.CylinderGeometry(0.16, 0.16, 1.25, 12);
const tubeGeom = new THREE.CylinderGeometry(0.05, 0.05, 1.27, 8);
const tubeMat = new THREE.MeshStandardMaterial({ color: "#cbd5e1" });

/* ───── 2. POSITION HELPERS ───── */
const getStandardPositions = (x: number, z: number) => [[x - 3.5, 0, z + 3], [x + 3.5, 0, z + 3], [x - 3.5, 0, z - 3], [x + 3.5, 0, z - 3]];
const getRTIPositions = (x: number, z: number) => [
  [x - 3.5, 0, z + 12], [x + 3.5, 0, z + 12], [x - 3.5, 0, z + 6], [x + 3.5, 0, z + 6],
  [x - 3.5, 0, z], [x + 3.5, 0, z], [x - 3.5, 0, z - 6], [x + 3.5, 0, z - 6], [x - 3.5, 0, z - 12], [x + 3.5, 0, z - 12]
];
const getWidePositions = (x: number, z: number) => [
  [x - 10.5, 0, z + 3], [x - 3.5, 0, z + 3], [x + 3.5, 0, z + 3], [x + 10.5, 0, z + 3],
  [x - 10.5, 0, z - 3], [x - 3.5, 0, z - 3], [x + 3.5, 0, z - 3], [x + 10.5, 0, z - 3]
];
const getInterliningPositions = (x: number, z: number) => [
  [x - 10.5, 0, z + 3], [x - 3.5, 0, z + 3], [x + 3.5, 0, z + 3],
  [x - 10.5, 0, z - 3], [x - 3.5, 0, z - 3], [x + 3.5, 0, z - 3], [x + 10.5, 0, z - 3]
];

const ZONE_LAYOUT = {
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

/* ───── 3. SUB-COMPONENTS ───── */

const FloatingLabel = ({ text, position = [0, 3, 0], bgColor = "#fbbf24", textColor = "#000000", scale = 1.0 }: any) => {
  const spriteRef = useRef<THREE.Sprite>(null);

  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const fontSize = 100;
    const lineHeight = 120;
    const padding = 80;
    const maxWidth = 1200;

    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
    const words = text.toUpperCase().split(" ");
    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + " " + word).width;
      if (width < maxWidth) {
        currentLine += " " + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);

    let maxMeasuredWidth = 0;
    lines.forEach(line => {
      maxMeasuredWidth = Math.max(maxMeasuredWidth, ctx.measureText(line).width);
    });

    const canvasWidth = Math.max(maxMeasuredWidth, 200) + padding * 2;
    const canvasHeight = lines.length * lineHeight + padding * 1.5;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = bgColor;
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;

    ctx.beginPath();
    ctx.roundRect(0, 0, canvasWidth, canvasHeight, 30);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = textColor;
    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    lines.forEach((line, index) => {
      const yOffset = (canvasHeight / 2) - ((lines.length - 1) * lineHeight / 2) + (index * lineHeight);
      ctx.fillText(line, canvasWidth / 2, yOffset);
    });

    return new THREE.CanvasTexture(canvas);
  }, [text, bgColor, textColor]);

  const aspect = texture.image.width / texture.image.height;

  useFrame((state) => {
    if (!spriteRef.current) return;
    spriteRef.current.position.y = position[1] + Math.sin(state.clock.getElapsedTime() * 1.5) * 0.1;
    const dist = state.camera.position.distanceTo(spriteRef.current.position);
    const scaleFactor = THREE.MathUtils.clamp(dist / 55, 0.45, 2.0);
    const h = scale * scaleFactor;
    const w = h * aspect;
    spriteRef.current.scale.set(w, h, 1);
  });

  return (
    <sprite ref={spriteRef} position={new THREE.Vector3(...position)}>
      <spriteMaterial map={texture} depthTest={false} transparent opacity={0.95} />
    </sprite>
  );
};

const FabricRollPallet = ({ position, rotation = [0, 0, 0], rollColor = "#64748b", emptySlot = null, name = "" }: any) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && !!name);

  const rolls = useMemo(() => {
    const arr = [];
    const mat = new THREE.MeshStandardMaterial({ color: rollColor, roughness: 0.6 });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const index = r * 3 + c;
        if (index === emptySlot) continue;
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
      onPointerOver={(e) => { e.stopPropagation(); if (name) setHovered(true); }}
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
      {hovered && name && <FloatingLabel text={name} position={[0, 1.8, 0]} bgColor="#0284c7" textColor="#ffffff" scale={1.2} />}
    </group>
  );
};

const DoubleRack = ({ position, label, rollColor, emptySlots = [] }: any) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const twinDepth = 2.8;

  return (
    <group
      position={new THREE.Vector3(...position)}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      {[-SPECS.bayWidth, 0, SPECS.bayWidth].map((x, i) => (
        <group key={i} position={[x, SPECS.rackHeight / 2, 0]}>
          <mesh position={[0, 0, twinDepth / 2]} castShadow>
            <boxGeometry args={[0.15, SPECS.rackHeight, 0.15]} />
            <meshStandardMaterial color={SPECS.postColor} />
          </mesh>
          <mesh position={[0, 0, -twinDepth / 2]} castShadow>
            <boxGeometry args={[0.15, SPECS.rackHeight, 0.15]} />
            <meshStandardMaterial color={SPECS.postColor} />
          </mesh>
          {[1, 2.5, 4].map((y) => (
            <mesh key={y} position={[0, y - SPECS.rackHeight / 2, 0]}>
              <boxGeometry args={[0.1, 0.05, twinDepth]} />
              <meshStandardMaterial color={SPECS.postColor} />
            </mesh>
          ))}
        </group>
      ))}

      {SPECS.levels.map((y, idx) => (
        <group key={idx} position={[0, y, 0]}>
          {[twinDepth / 2 - 0.1, -(twinDepth / 2 - 0.1)].map((z, j) => (
            <mesh key={j} position={[0, -0.7, z]}>
              <boxGeometry args={[SPECS.bayWidth * 2.1, 0.2, 0.1]} />
              <meshStandardMaterial color={SPECS.beamColor} />
            </mesh>
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

      {hovered && label && <FloatingLabel text={label} position={[0, SPECS.rackHeight + 0.5, 0]} />}
    </group>
  );
};

const ZoneBoundary = ({ positions, zoneName, rackWidth = 5.8, rackDepth = 3.0 }: any) => {
  const boundary = useMemo(() => {
    if (!positions || positions.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    positions.forEach((pos: any) => {
      minX = Math.min(minX, pos[0] - rackWidth / 2);
      maxX = Math.max(maxX, pos[0] + rackWidth / 2);
      minZ = Math.min(minZ, pos[2] - rackDepth / 2);
      maxZ = Math.max(maxZ, pos[2] + rackDepth / 2);
    });
    const extra = 1.0;
    return {
      width: (maxX - minX) + 2 * extra,
      depth: (maxZ - minZ) + 2 * extra,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2
    };
  }, [positions, rackWidth, rackDepth]);

  if (!boundary) return null;
  const { width, depth, centerX, centerZ } = boundary;
  const thickness = 0.2;

  return (
    <group position={[centerX, 0.01, centerZ]}>
      <mesh position={[0, 0, depth / 2]}>
        <boxGeometry args={[width, 0.02, thickness]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>
      <mesh position={[0, 0, -depth / 2]}>
        <boxGeometry args={[width, 0.02, thickness]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>
      <mesh position={[-width / 2, 0, 0]}>
        <boxGeometry args={[thickness, 0.02, depth]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>
      <mesh position={[width / 2, 0, 0]}>
        <boxGeometry args={[thickness, 0.02, depth]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>
      {zoneName && (
        <FloatingLabel
          text={zoneName}
          position={[0, 0.02, depth / 2 + 0.8]}
          bgColor="#fbbf24"
          textColor="#000000"
          scale={0.6}
        />
      )}
    </group>
  );
};

const Truck = ({ position, rotation = [0, 0, 0] }: any) => {
  const [hovered, setHovered] = useState(false);
  const maroonPaint = <meshStandardMaterial color="#4a0404" metalness={0.1} roughness={0.9} />;
  const tireMat = <meshStandardMaterial color="#111111" roughness={0.9} />;
  const glassMat = <meshPhysicalMaterial color="#0f172a" metalness={1} roughness={0.1} opacity={0.6} transparent />;

  return (
    <group
      position={new THREE.Vector3(...position)}
      rotation={new THREE.Euler(...rotation)}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      {hovered && <FloatingLabel text="TRUCK" position={[0, 4.5, 0]} />}
      <mesh position={[0, 2.5, -2]} castShadow>
        <boxGeometry args={[4, 4.2, 14]} />
        {maroonPaint}
      </mesh>
      <mesh position={[0, 1.9, 7.2]} castShadow>
        <boxGeometry args={[3.6, 3.8, 4.4]} />
        {maroonPaint}
      </mesh>
      <mesh position={[0, 2.8, 9.42]}>
        <boxGeometry args={[3.2, 1.8, 0.05]} />
        {glassMat}
      </mesh>
      {[1.81, -1.81].map((x, i) => (
        <mesh key={i} position={[x, 2.8, 7.8]}>
          <boxGeometry args={[0.02, 1.6, 2.2]} />
          {glassMat}
        </mesh>
      ))}
      {[[1.8, 8.2], [-1.8, 8.2], [1.8, -5.5], [-1.8, -5.5], [1.8, -7.5], [-1.8, -7.5], [1.8, 3.5], [-1.8, 3.5]].map((pos, i) => (
        <mesh key={i} position={[pos[0], 0.6, pos[1]]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.6, 0.6, 0.5, 32]} />
          {tireMat}
        </mesh>
      ))}
      <mesh position={[0, 0.8, -0.5]}>
        <boxGeometry args={[3.0, 0.4, 18]} />
        <meshStandardMaterial color="#111827" metalness={0.8} />
      </mesh>
    </group>
  );
};

const AccurateAGV = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], name = "AGV" }: any) => {
  const [hovered, setHovered] = useState(false);
  const primaryColor = "#d97706";
  const secondaryColor = "#111827";
  const maroonMat = "#800000";

  return (
    <group
      position={new THREE.Vector3(...position)}
      rotation={new THREE.Euler(...rotation)}
      scale={new THREE.Vector3(...scale)}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh position={[0, 0.15, 0]} castShadow>
        <boxGeometry args={[0.9, 0.3, 1.2]} />
        <meshStandardMaterial color={secondaryColor} metalness={0.6} />
      </mesh>
      <group position={[0, 0, 0.6]}>
        {[0.25, -0.25].map((x, i) => (
          <mesh key={i} position={[x, 0.05, 0.65]} castShadow>
            <boxGeometry args={[0.2, 0.04, 1.3]} />
            <meshStandardMaterial color={primaryColor} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0.8, 0.1]} castShadow>
        <boxGeometry args={[0.9, 1.1, 0.6]} />
        <meshStandardMaterial color={secondaryColor} metalness={0.5} />
      </mesh>
      <group position={[0, 1.8, 0.4]}>
        <mesh position={[0.42, 0, 0]}><boxGeometry args={[0.06, 1.0, 0.06]} /><meshStandardMaterial color={primaryColor} /></mesh>
        <mesh position={[-0.42, 0, 0]}><boxGeometry args={[0.06, 1.0, 0.06]} /><meshStandardMaterial color={primaryColor} /></mesh>
        <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.9, 0.06, 0.06]} /><meshStandardMaterial color={primaryColor} /></mesh>
      </group>
      {/* Full human operator — same as StandingOperator */}
      <group position={[0, 0.3, -0.45]}>
        {/* Legs */}
        <mesh position={[0, 0.375, 0]}>
          <boxGeometry args={[0.35, 0.75, 0.25]} />
          <meshStandardMaterial color={maroonMat} />
        </mesh>
        {/* Torso */}
        <mesh position={[0, 1.025, 0]}>
          <boxGeometry args={[0.4, 0.55, 0.3]} />
          <meshStandardMaterial color={maroonMat} />
        </mesh>
        {/* Head */}
        <mesh position={[0, 1.45, 0]}>
          <sphereGeometry args={[0.13, 16, 16]} />
          <meshStandardMaterial color="#ffdbac" />
        </mesh>
        {/* Hair */}
        <mesh position={[0, 1.52, -0.02]} scale={[1, 0.5, 1]}>
          <sphereGeometry args={[0.135, 16, 16]} />
          <meshStandardMaterial color="#4b2c20" />
        </mesh>
        {/* Arms reaching for steering handle */}
        <mesh position={[0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, 0.1]}>
          <capsuleGeometry args={[0.06, 0.45, 4, 8]} />
          <meshStandardMaterial color={maroonMat} />
        </mesh>
        <mesh position={[-0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, -0.1]}>
          <capsuleGeometry args={[0.06, 0.45, 4, 8]} />
          <meshStandardMaterial color={maroonMat} />
        </mesh>
      </group>
      {hovered && <FloatingLabel text={name} position={[0, 3.2, 0]} />}
    </group>
  );
};

const InspectionMachine = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], name = "Inspection Machine" }: any) => {
  const [hovered, setHovered] = useState(false);
  return (
    <group position={new THREE.Vector3(...position)} rotation={new THREE.Euler(...rotation)}>
      <group
        scale={new THREE.Vector3(...scale)}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <mesh position={[-1.4, 1, 0]}><boxGeometry args={[0.3, 2, 2.2]} /><meshStandardMaterial color="#1d4ed8" metalness={0.5} /></mesh>
        <mesh position={[1.4, 1, 0]}><boxGeometry args={[0.3, 2, 2.2]} /><meshStandardMaterial color="#1d4ed8" metalness={0.5} /></mesh>
        <group position={[0, 1.5, 0.2]} rotation={[-Math.PI / 6, 0, 0]}>
          <mesh><boxGeometry args={[2.5, 1.6, 0.1]} /><meshStandardMaterial color="#334155" /></mesh>
          <mesh position={[0, 0, 0.06]}><boxGeometry args={[2.3, 1.4, 0.02]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} /></mesh>
        </group>
        {[0.4, 2.4].map((y, i) => (
          <mesh key={i} position={[0, y, 0.8]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.08, 0.08, 2.6, 16]} /><meshStandardMaterial color="#cbd5e1" metalness={0.8} /></mesh>
        ))}
        <mesh position={[0, 0.05, 0]}><boxGeometry args={[3.2, 0.1, 2.4]} /><meshStandardMaterial color="#1e293b" /></mesh>
      </group>
      {hovered && <FloatingLabel text={name} position={[0, 3.5, 0]} bgColor="#fbbf24" textColor="#000000" scale={1.0} />}
    </group>
  );
};

const IndustrialWorkTable = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], name = "Work Table" }: any) => {
  const [hovered, setHovered] = useState(false);
  return (
    <group position={new THREE.Vector3(...position)} rotation={new THREE.Euler(...rotation)}>
      <group
        scale={new THREE.Vector3(...scale)}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <mesh position={[0, 0.9, 0]}><boxGeometry args={[3, 0.15, 1.5]} /><meshStandardMaterial color="#b45309" /></mesh>
        {[[-1.4, -0.6], [1.4, -0.6], [-1.4, 0.6], [1.4, 0.6]].map((pos, i) => (
          <mesh key={i} position={[pos[0], 0.45, pos[1]]}><boxGeometry args={[0.12, 0.9, 0.12]} /><meshStandardMaterial color="#334155" /></mesh>
        ))}
        <mesh position={[0, 0.25, 0]}><boxGeometry args={[2.7, 0.05, 1.3]} /><meshStandardMaterial color="#475569" /></mesh>
      </group>
      {hovered && <FloatingLabel text={name} position={[0, 3.5, 0]} bgColor="#fbbf24" textColor="#000000" scale={1.2} />}
    </group>
  );
};

const StandingOperator = ({ position, rotation = [0, 0, 0], name = "Operator" }: any) => {
  const [hovered, setHovered] = useState(false);
  return (
    <group position={new THREE.Vector3(...position)} rotation={new THREE.Euler(...rotation)} onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }} onPointerOut={() => setHovered(false)}>
      <group scale={[2, 2, 2]}>
        {/* Legs */}
        <mesh position={[0, 0.375, 0]}><boxGeometry args={[0.35, 0.75, 0.25]} /><meshStandardMaterial color="#800000" /></mesh>
        {/* Torso */}
        <mesh position={[0, 1.025, 0]}><boxGeometry args={[0.4, 0.55, 0.3]} /><meshStandardMaterial color="#800000" /></mesh>
        {/* Head */}
        <mesh position={[0, 1.45, 0]}><sphereGeometry args={[0.13, 16, 16]} /><meshStandardMaterial color="#ffdbac" /></mesh>
        {/* Hair */}
        <mesh position={[0, 1.52, -0.02]} scale={[1, 0.5, 1]}><sphereGeometry args={[0.135, 16, 16]} /><meshStandardMaterial color="#4b2c20" /></mesh>
        {/* Arms (capsule) */}
        <mesh position={[0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, 0.1]}><capsuleGeometry args={[0.06, 0.45, 4, 8]} /><meshStandardMaterial color="#800000" /></mesh>
        <mesh position={[-0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, -0.1]}><capsuleGeometry args={[0.06, 0.45, 4, 8]} /><meshStandardMaterial color="#800000" /></mesh>
      </group>
      {hovered && <FloatingLabel text={name} position={[0, 4.5, 0]} bgColor="#334155" textColor="#ffffff" scale={1.0} />}
    </group>
  );
};

const HybridConveyor = ({ position = [0, 0, 0], rotation = [0, 0, 0] }: any) => {
  const [hovered, setHovered] = useState(false);
  const palletLength = 1.6;
  const longPartLength = 18;
  const beltY = 1.9;
  return (
    <group
      position={new THREE.Vector3(...position)}
      rotation={new THREE.Euler(...rotation)}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      <group position={[longPartLength / 2 + (4 * palletLength), 0, 0]}>
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
      <mesh position={[(4 * palletLength) / 2, beltY - 0.05, 0]} receiveShadow>
        <boxGeometry args={[4 * palletLength, 0.12, 1.3]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      {Array.from({ length: 4 }).map((_, i) => (
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
      {hovered && <FloatingLabel text="CONVEYOR" position={[9, 4.5, 0]} bgColor="#475569" textColor="#ffffff" scale={1.4} />}
    </group>
  );
};

const QRWorkstation = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] }: any) => {
  const [hovered, setHovered] = useState(false);
  const maroonMat = "#800000";
  const tableTopMat = "#475569";
  const frameMat = "#1e293b";

  return (
    <group
      position={new THREE.Vector3(...position)}
      rotation={new THREE.Euler(...rotation)}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      <group scale={new THREE.Vector3(...scale)}>
        <group scale={[0.8, 0.8, 0.8]}>
          <mesh position={[0, 0.8, 0]} receiveShadow>
            <boxGeometry args={[2.5, 0.1, 1.5]} />
            <meshStandardMaterial color={tableTopMat} roughness={0.8} />
          </mesh>
          {[[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]].map((pos, i) => (
            <mesh key={i} position={[pos[0], 0.4, pos[1]]}>
              <boxGeometry args={[0.1, 0.8, 0.1]} />
              <meshStandardMaterial color={frameMat} />
            </mesh>
          ))}
          <mesh position={[0, 0.85, 0]}>
            <boxGeometry args={[1.0, 0.3, 0.8]} />
            <meshStandardMaterial color="#334155" metalness={0.5} />
          </mesh>
        </group>
        <group position={[0.2, 0, 0.85]} rotation={[0, Math.PI, 0]}>
          <mesh position={[0, 0.375, 0]}><boxGeometry args={[0.35, 0.75, 0.25]} /><meshStandardMaterial color={maroonMat} /></mesh>
          <mesh position={[0, 1.025, 0]}><boxGeometry args={[0.4, 0.55, 0.3]} /><meshStandardMaterial color={maroonMat} /></mesh>
          <mesh position={[0, 1.45, 0]}><sphereGeometry args={[0.13, 16, 16]} /><meshStandardMaterial color="#ffdbac" /></mesh>
          <mesh position={[0, 1.52, -0.02]} scale={[1, 0.5, 1]}><sphereGeometry args={[0.135, 16, 16]} /><meshStandardMaterial color="#4b2c20" /></mesh>
          <mesh position={[0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, 0.1]}><capsuleGeometry args={[0.06, 0.45, 4, 8]} /><meshStandardMaterial color={maroonMat} /></mesh>
          <mesh position={[-0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, -0.1]}><capsuleGeometry args={[0.06, 0.45, 4, 8]} /><meshStandardMaterial color={maroonMat} /></mesh>
        </group>
      </group>
      {hovered && <FloatingLabel text="QR STICKER STATION" position={[0, 4.0, 0]} />}
    </group>
  );
};

const AutoScannerShed = ({ position }: any) => {
  const [hovered, setHovered] = useState(false);
  return (
    <group
      position={new THREE.Vector3(...position)}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh position={[0.8, 1.7, 0]}><boxGeometry args={[0.2, 3.4, 0.8]} /><meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} /></mesh>
      <mesh position={[-0.8, 1.7, 0]}><boxGeometry args={[0.2, 3.4, 0.8]} /><meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} /></mesh>
      <mesh position={[0, 3.4, 0]}><boxGeometry args={[1.8, 0.2, 0.8]} /><meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} /></mesh>
      <mesh position={[0, 3.25, 0]}><boxGeometry args={[1.4, 0.1, 0.4]} /><meshStandardMaterial color="#000" emissive="#00f2ff" emissiveIntensity={0.5} /></mesh>
      {hovered && <FloatingLabel text="AUTO QR SCANNER" position={[0, 4.8, 0]} />}
    </group>
  );
};

const MonitoringTV = ({ position, rotation = [0, 0, 0], scale = [1, 1, 1], name = "Monitoring Dashboard" }: any) => {
  const [hovered, setHovered] = useState(false);
  return (
    <group
      position={new THREE.Vector3(...position)}
      rotation={new THREE.Euler(...rotation)}
      scale={new THREE.Vector3(...scale)}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh position={[0, 0.05, 0]} castShadow><boxGeometry args={[0.8, 0.1, 0.8]} /><meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} /></mesh>
      <mesh position={[0, 1.2, 0]} castShadow><cylinderGeometry args={[0.04, 0.04, 2.4, 16]} /><meshStandardMaterial color="#475569" metalness={0.9} roughness={0.1} /></mesh>
      <group position={[0, 2.4, 0.05]}>
        <mesh castShadow><boxGeometry args={[1.8, 1.1, 0.1]} /><meshStandardMaterial color="#0f172a" roughness={0.5} /></mesh>
        <mesh position={[0, 0, 0.07]}><planeGeometry args={[1.7, 1.0]} /><meshStandardMaterial color="#ffffff" emissive="#0284c7" emissiveIntensity={0.5} /></mesh>
      </group>
      {hovered && <FloatingLabel text={name} position={[0, 4.2, 0]} bgColor="#0f172a" textColor="#ffffff" scale={1.2} />}
    </group>
  );
};

const FabricSquare = ({ position, color }: any) => (
  <mesh position={new THREE.Vector3(...position)} castShadow><boxGeometry args={[0.8, 0.1, 0.8]} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>
);

const HandheldScanner = ({ position, rotation, isScanning }: any) => (
  <group position={new THREE.Vector3(...position)} rotation={new THREE.Euler(...rotation)}>
    <mesh position={[0, 0.15, 0.05]} rotation={[0.2, 0, 0]}><boxGeometry args={[0.12, 0.1, 0.2]} /><meshStandardMaterial color="#222" /></mesh>
    <mesh position={[0, 0.16, 0.15]}><boxGeometry args={[0.08, 0.04, 0.01]} /><meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={2} /></mesh>
    {isScanning && (
      <mesh position={[0, 0.16, 2.15]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.005, 0.015, 4, 8]} />
        <meshBasicMaterial color="#ff0000" transparent opacity={0.6} />
      </mesh>
    )}
    <mesh position={[0, 0, 0]} rotation={[-0.4, 0, 0]}><boxGeometry args={[0.07, 0.25, 0.07]} /><meshStandardMaterial color="#333" /></mesh>
  </group>
);

const ScannerOperator = ({ position, rotation = [0, 0, 0], name = "Scanner Operator" }: any) => {
  const [hovered, setHovered] = useState(false);
  const maroonMat = "#800000";

  return (
    <group
      position={new THREE.Vector3(...position)}
      rotation={new THREE.Euler(...rotation)}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      <group scale={[2, 2, 2]}>
        {/* Legs */}
        <mesh position={[0, 0.375, 0]}><boxGeometry args={[0.35, 0.75, 0.25]} /><meshStandardMaterial color={maroonMat} /></mesh>
        {/* Torso */}
        <mesh position={[0, 1.025, 0]}><boxGeometry args={[0.4, 0.55, 0.3]} /><meshStandardMaterial color={maroonMat} /></mesh>
        {/* Head */}
        <mesh position={[0, 1.45, 0]}><sphereGeometry args={[0.13, 16, 16]} /><meshStandardMaterial color="#ffdbac" /></mesh>
        {/* Hair */}
        <mesh position={[0, 1.52, -0.02]} scale={[1, 0.5, 1]}><sphereGeometry args={[0.135, 16, 16]} /><meshStandardMaterial color="#4b2c20" /></mesh>
        {/* Left arm (capsule) */}
        <mesh position={[-0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, -0.1]}><capsuleGeometry args={[0.06, 0.45, 4, 8]} /><meshStandardMaterial color={maroonMat} /></mesh>
        {/* Right arm holding scanner */}
        <group position={[0.22, 1.1, 0.25]} rotation={[-Math.PI / 2.5, 0, 0.1]}>
          <mesh position={[0, -0.2, 0]}><capsuleGeometry args={[0.06, 0.45, 4, 8]} /><meshStandardMaterial color={maroonMat} /></mesh>
          <HandheldScanner position={[0, -0.45, 0.05]} rotation={[Math.PI / 2, 0, 0]} isScanning={true} />
        </group>
      </group>
      {hovered && <FloatingLabel text={name} position={[0, 4.5, 0]} bgColor="#334155" textColor="#ffffff" scale={1.0} />}
    </group>
  );
};

const QRScannerStation = ({ position, rotation = [0, 0, 0], scale = [1, 1, 1] }: any) => {
  const [hovered, setHovered] = useState(false);
  const tableMat = "#966F33";
  return (
    <group
      position={new THREE.Vector3(...position)}
      rotation={new THREE.Euler(...rotation)}
      scale={new THREE.Vector3(...scale)}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      {/* Table top */}
      <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.5, 0.1, 1.5]} />
        <meshStandardMaterial color={tableMat} roughness={0.6} metalness={0.1} />
      </mesh>
      {/* Table legs */}
      {[[1.1, 0.6], [-1.1, 0.6], [1.1, -0.6], [-1.1, -0.6]].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.75, lz]} castShadow>
          <boxGeometry args={[0.1, 1.5, 0.1]} />
          <meshStandardMaterial color={tableMat} roughness={0.6} />
        </mesh>
      ))}
      {/* Scanner unit on table */}
      <group position={[0, 1.55, 0]} scale={[0.5, 0.5, 0.5]}>
        {/* Body */}
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[0.8, 1, 0.8]} />
          <meshPhysicalMaterial color="white" roughness={0.2} clearcoat={1.0} />
        </mesh>
        {/* Screen */}
        <mesh position={[0, 0.7, 0.41]} rotation={[-0.2, 0, 0]}>
          <planeGeometry args={[0.6, 0.5]} />
          <meshStandardMaterial color="#000" emissive="#0284c7" emissiveIntensity={0.6} />
        </mesh>
        {/* Scan slot light */}
        <mesh position={[0, 0.3, 0.4]}>
          <boxGeometry args={[0.5, 0.1, 0.1]} />
          <meshBasicMaterial color="#00ffff" />
        </mesh>
      </group>
      {hovered && <FloatingLabel text="QR SCANNER STATION" position={[0, 4.5, 0]} bgColor="#0284c7" textColor="#ffffff" scale={1.3} />}
    </group>
  );
};

/* ───── 3.5. DRAGGABLE WRAPPER ───── */
const DraggableWarehouseItem = ({ item, isSelected, editTool, onSelect, onMove, onRotate, onDelete, children }: any) => {
  return (
    <group 
      position={item.position} 
      rotation={item.rotation || [0,0,0]} 
      onClick={(e) => { 
        e.stopPropagation(); 
        if (editTool === 'delete') onDelete(item.id); 
        else onSelect(item.id); 
      }}
    >
      {isSelected && (editTool === 'move' || editTool === 'rotate') ? (
        <PivotControls
          disableRotations={editTool !== 'rotate'}
          disableAxes={editTool !== 'move'}
          disableSliders={true}
          scale={7}
          depthTest={false}
          autoTransform={false}
          onDrag={(l, deltaL, w, deltaW) => {
             const position = new THREE.Vector3();
             const quaternion = new THREE.Quaternion();
             const scale = new THREE.Vector3();
             w.decompose(position, quaternion, scale);
             const euler = new THREE.Euler().setFromQuaternion(quaternion);
             if (editTool === 'move') {
               onMove(item.id, [position.x, 0, position.z]);
             } else if (editTool === 'rotate') {
               onRotate(item.id, [0, euler.y, 0]);
             }
          }}
        >
          {children}
        </PivotControls>
      ) : children}
    </group>
  );
};

/* ───── 4. MAIN VIEW ───── */
export const WarehouseView = () => {
  const [isLayoutMode, setIsLayoutMode] = useState(false);
  const [editTool, setEditTool] = useState<"move" | "rotate" | "delete" | "add">("move");
  const [selectedAddType, setSelectedAddType] = useState("rack");
  const [selectedAddLabel, setSelectedAddLabel] = useState("Rack");
  const [placingItem, setPlacingItem] = useState(false);
  const [addedItems, setAddedItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  // Local Undo/Redo tracking for Warehouse
  const [history, setHistory] = useState<any[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const pushHistory = (newItems: any[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newItems);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  useEffect(() => {
    fetch("http://localhost:4000/api/warehouse/get-layout")
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data) && data.length > 0) {
          setAddedItems(data);
          setHistory([data]);
        }
      })
      .catch(e => console.error("Could not load warehouse layout:", e));
  }, []);

  const undo = () => { if (historyIndex > 0) { setHistoryIndex(historyIndex - 1); setAddedItems(history[historyIndex - 1]); setSelectedItem(null); } };
  const redo = () => { if (historyIndex < history.length - 1) { setHistoryIndex(historyIndex + 1); setAddedItems(history[historyIndex + 1]); setSelectedItem(null); } };
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handlePointerDownFloor = (e: any) => {
    if (isLayoutMode && placingItem && editTool === 'add') {
      e.stopPropagation();
      const newItems = [...addedItems, {
        id: `added-${Date.now()}`,
        type: selectedAddType,
        position: [e.point.x, 0, e.point.z],
        rotation: [0, 0, 0]
      }];
      setAddedItems(newItems);
      pushHistory(newItems);
    } else if (isLayoutMode) {
      setSelectedItem(null);
    }
  };

  const handleMove = (id: string, pos: [number, number, number]) => {
    const newItems = addedItems.map(i => i.id === id ? { ...i, position: pos } : i);
    setAddedItems(newItems);
    pushHistory(newItems);
  };

  const handleRotate = (id: string, rot: [number, number, number]) => {
    const newItems = addedItems.map(i => i.id === id ? { ...i, rotation: rot } : i);
    setAddedItems(newItems);
    pushHistory(newItems);
  };

  const handleDelete = (id: string) => {
    const newItems = addedItems.filter(i => i.id !== id);
    setAddedItems(newItems);
    pushHistory(newItems);
    if (selectedItem === id) setSelectedItem(null);
  };

  const racks = useMemo(() => {
    const arr: any[] = [];
    Object.entries(ZONE_LAYOUT).forEach(([zone, cfg]) =>
      cfg.positions.forEach((pos, i) => arr.push({ id: `${zone}-R${i + 1}`, pos }))
    );
    return arr;
  }, []);

  const handleSave = async () => {
    try {
      const res = await fetch("http://localhost:4000/api/warehouse/save-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addedItems),
      });
      alert("✅ Warehouse layout saved permanently!");
    } catch {
      alert("❌ Could not reach server. Make sure the backend is running.");
    }
  };

  return (
    <Wrapper>
      {/* ── TOOLBAR (top-right) MIRRORING CUTTING VIEW ── */}
      <div className="absolute top-6 right-6 z-[60] flex items-center gap-3">
        {isLayoutMode && (
          <div className="flex items-center gap-1 bg-slate-950/80 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10 shadow-2xl animate-in slide-in-from-right-4">
            <div className="flex items-center gap-1 px-2 border-r border-white/10 mr-1">
              <button onClick={undo} disabled={!canUndo} className={cn("p-2 rounded-xl transition-all", canUndo ? "text-white hover:bg-white/10" : "text-white/20 cursor-not-allowed")}>
                <Undo2 size={14} />
              </button>
              <button onClick={redo} disabled={!canRedo} className={cn("p-2 rounded-xl transition-all", canRedo ? "text-white hover:bg-white/10" : "text-white/20 cursor-not-allowed")}>
                <Redo2 size={14} />
              </button>
            </div>

            {[
              { id: 'add', icon: <Play className="rotate-270" size={14} />, label: 'Add' },
              { id: 'move', icon: <Edit2 size={14} />, label: 'Move' },
              { id: 'rotate', icon: <Play className="rotate-90" size={14} />, label: 'Rotate' },
              { id: 'delete', icon: <CheckCircle className="text-red-500" size={14} />, label: 'Del' }
            ].map((tool: any) => (
              <button
                key={tool.id}
                onClick={() => setEditTool(tool.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  editTool === tool.id ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20" : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                {tool.icon}
                {tool.label}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => { setIsLayoutMode(!isLayoutMode); if (isLayoutMode) setPlacingItem(false); }}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all shadow-2xl border",
            isLayoutMode ? "bg-amber-600 text-white border-amber-500 shadow-amber-600/30" : "bg-slate-900/80 backdrop-blur-md text-white hover:bg-violet-600 border-white/10 hover:border-violet-500"
          )}
        >
          <Edit2 size={14} />
          {isLayoutMode ? "Exit Edit" : "Modify Layout"}
        </button>

        {isLayoutMode && (
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 text-white shadow-2xl shadow-emerald-600/30 hover:bg-emerald-500 transition-colors text-[11px] font-black uppercase tracking-widest border border-emerald-500"
            title="Save Layout Permanently"
          >
            <Save size={14} /> Save
          </button>
        )}
      </div>

      {/* ── ADD PANEL ── */}
      {isLayoutMode && editTool === 'add' && (
        <div className="absolute top-24 right-6 z-[60] w-72 bg-slate-950/90 backdrop-blur-2xl p-5 rounded-3xl border border-white/10 shadow-2xl animate-in fade-in slide-in-from-top-4">
          <h3 className="text-[10px] font-black uppercase text-violet-400 tracking-[0.2em] mb-4 flex items-center gap-2">
            <Play size={12} className="rotate-270" /> Add Warehouse Item
          </h3>
          <div className="space-y-4">
            <div className="relative group">
              <select
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold text-white appearance-none focus:outline-none focus:border-violet-500 transition-colors cursor-pointer"
                value={selectedAddType}
                onChange={(e) => {
                  setSelectedAddType(e.target.value);
                  setSelectedAddLabel(e.target.options[e.target.selectedIndex].text);
                }}
              >
                <option value="rack">Rack</option>
                <option value="agv">AGV</option>
                <option value="work-table">Work Table</option>
                <option value="monitoring-tv">Monitoring TV</option>
                <option value="human">Human Operator</option>
                <option value="scanner-station">QR Scanner Station</option>
                <option value="inspection-machine">Inspection Machine</option>
                <option value="pallet">Pallet</option>
              </select>
              <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
            <button
              onClick={() => setPlacingItem(!placingItem)}
              className={cn(
                "w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                placingItem ? "bg-amber-600 text-white shadow-lg" : "bg-violet-600 text-white shadow-lg hover:bg-violet-500"
              )}
            >
              {placingItem ? "Cancel Placement" : "Place Item"}
            </button>
          </div>
        </div>
      )}

      {/* ── SELECTION STATUS FOOTER ── */}
      {isLayoutMode && selectedItem && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[60] bg-slate-950/90 backdrop-blur-2xl px-8 py-4 rounded-3xl border border-violet-500/30 shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-violet-400 tracking-widest leading-none mb-1">Active Selection</span>
            <span className="text-white font-bold text-sm">1 Item Selected</span>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            {editTool === "rotate" && (
              <button 
                onClick={() => {
                  const item = addedItems.find(i => i.id === selectedItem);
                  if (item) handleRotate(selectedItem, [item.rotation[0], item.rotation[1] + Math.PI / 2, item.rotation[2]]);
                }}
                className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Rotate 90°
              </button>
            )}
            {editTool === "delete" && (
              <button onClick={() => handleDelete(selectedItem)} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                Delete Selected
              </button>
            )}
            <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-white text-[10px] font-black uppercase tracking-widest px-4 py-2">
              Clear
            </button>
          </div>
        </div>
      )}

      <Canvas shadows camera={{ position: [55, 55, 55], fov: 45 }} gl={{ antialias: true }}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[40, 60, 20]} intensity={1.5} castShadow />
          <Environment preset="warehouse" />
          <OrbitControls makeDefault dampingFactor={0.1} enableDamping maxPolarAngle={Math.PI / 2.1} />

          {/* Floor */}
          <mesh 
            rotation={[-Math.PI / 2, 0, 0]} 
            position={[0, -0.05, 10]}
            onClick={handlePointerDownFloor}
          >
            <planeGeometry args={[180, 180]} />
            <meshStandardMaterial color="#fdf5e6" opacity={0.6} transparent />
          </mesh>

          {/* Zone Boundaries */}
          {Object.entries(ZONE_LAYOUT).map(([zone, cfg]) => (
            <ZoneBoundary key={`boundary-${zone}`} positions={cfg.positions} zoneName={zone} />
          ))}

          {/* Double Racks */}
          {racks.map((r, idx) => (
            <DoubleRack
              key={r.id}
              position={r.pos}
              label={r.id}
              rollColor={r.id.startsWith("Q") ? PALETTE[13] : PALETTE[idx % PALETTE.length]}
              emptySlots={r.id === "F2-R2" ? [1] : []}
            />
          ))}

          {/* Inspection Machines */}
          <InspectionMachine position={[17, 0, 52]} rotation={[-Math.PI / 2, Math.PI, Math.PI / 2]} scale={[2, 2, 2]} name="Inspection Machine 1" />
          <InspectionMachine position={[10, 0, 51.5]} rotation={[-Math.PI / 2, Math.PI, -Math.PI / 2]} scale={[2, 2, 2]} name="Inspection Machine 2" />
          
          {/* Pallets */}
          <FabricRollPallet position={[22, 0, 45]} rollColor={PALETTE[5]} rotation={[0, 0, 0]} name="Pallet 1" />
          <FabricRollPallet position={[8, 0, 45]} rollColor={PALETTE[13]} rotation={[0, 0, 0]} name="Pallet 2" />

          {/* Tables */}
          <IndustrialWorkTable position={[40, 0, 52]} rotation={[0, Math.PI / 2, 0]} scale={[2.5, 2.5, 2.5]} name="Shrinkage Table 1" />
          <group position={[40, 1.6, 52]}>
            <FabricSquare position={[0.3, 0.7, 0.3]} color={PALETTE[2]} />
            <FabricSquare position={[-0.3, 0.7, -0.3]} color={PALETTE[3]} />
          </group>
          <IndustrialWorkTable position={[31, 0, 52]} rotation={[0, -Math.PI / 2, 0]} scale={[2.5, 2.5, 2.5]} name="Shrinkage Table 2" />
          <group position={[31, 1.6, 52]}>
            <FabricSquare position={[0, 0.7, 0]} color={PALETTE[7]} />
          </group>

          {/* Operators */}
          <StandingOperator position={[5, 0, 51.8]} rotation={[0, Math.PI / 2, 0]} name="Inspector 1" />
          <StandingOperator position={[23, 0, 52]} rotation={[0, -Math.PI / 2, 0]} name="QC Inspector" />
          <StandingOperator position={[42.8, 0, 52]} rotation={[0, -Math.PI / 2, 0]} name="Table Assistant" />
          <StandingOperator position={[34, 0, 52]} rotation={[0, -Math.PI / 2, 0]} name="Process Operator" />
          <StandingOperator position={[12, 0, 59]} rotation={[0, Math.PI / 2, 0]} name="QR Assistant" />
          <ScannerOperator position={[-12, 0, 31]} rotation={[0, Math.PI, 0]} name="Handheld Scanner Op" />

          {/* Equipment */}
          <QRScannerStation position={[14, 0, 59]} rotation={[0, -Math.PI / 2, 0]} scale={[1.2, 1.2, 1.2]} />
          <MonitoringTV position={[5, 0, 63]} rotation={[0, Math.PI, 0]} scale={[1.4, 1.4, 1.4]} name="Main Dashboard" />
          <MonitoringTV position={[-9, 0, 62]} rotation={[0, Math.PI / 2, 0]} scale={[1.4, 1.4, 1.4]} name="Process Monitor" />

          {/* Logistics */}
          <AccurateAGV position={[-21.5, 0, 55]} rotation={[0, 0, 0]} scale={[2, 2, 2]} name="AGV 1" />
          <AccurateAGV position={[14, 0, 40]} rotation={[0, Math.PI, 0]} scale={[2, 2, 2]} name="AGV 2" />
          <HybridConveyor position={[-14.0, 0, 58.5]} rotation={[0, -Math.PI / 2, 0]} />
          <QRWorkstation position={[-11.0, 0, 70]} rotation={[0, -Math.PI / 2, 0]} scale={[2, 2, 2]} />
          <AutoScannerShed position={[-14.0, 0, 67.5]} />
          <Truck position={[-14, 0, 90]} />

          {/* Static Pallet Stack */}
          <group position={[-15.5, 0, 59.3]} rotation={[0, -Math.PI / 2, 0]}>
            {[0, 1, 2, 3].map((i) => (
              <FabricRollPallet
                key={`stack-${i}`}
                position={[i * 1.6, 0, 0]}
                rotation={[0, Math.PI / 2, 0]}
                rollColor={PALETTE[(i + 10) % PALETTE.length]}
              />
            ))}
          </group>

          {/* User Added Items */}
          {addedItems.map((item) => {
            let content = null;
            if (item.type === "rack") {
              // Supermarket/Rack logic mapping internally
              content = <DoubleRack position={[0,0,0]} label="RACK" rollColor="#1e40af" />;
            } else if (item.type === "supermarket") { // legacy check for already saved options
              content = <DoubleRack position={[0,0,0]} label="RACK" rollColor="#1e40af" />;
            } else if (item.type === "agv") {
              content = <AccurateAGV position={[0,0,0]} rotation={[0, 0, 0]} scale={[2, 2, 2]} />;
            } else if (item.type === "work-table") {
              content = <IndustrialWorkTable position={[0,0,0]} rotation={[0, 0, 0]} scale={[2.5, 2.5, 2.5]} />;
            } else if (item.type === "monitoring-tv") {
              content = <MonitoringTV position={[0,0,0]} rotation={[0, 0, 0]} scale={[1.4, 1.4, 1.4]} />;
            } else if (item.type === "human") {
              content = <StandingOperator position={[0,0,0]} rotation={[0, 0, 0]} />;
            } else if (item.type === "scanner-station") {
              content = <QRScannerStation position={[0,0,0]} rotation={[0, 0, 0]} scale={[1.2, 1.2, 1.2]} />;
            } else if (item.type === "inspection-machine") {
              content = <InspectionMachine position={[0,0,0]} rotation={[0, 0, 0]} scale={[2, 2, 2]} />;
            } else if (item.type === "pallet") {
              content = <FabricRollPallet position={[0,0,0]} rotation={[0, 0, 0]} rollColor="#f97316" />;
            }
            
            return (
              <DraggableWarehouseItem
                key={item.id}
                item={item}
                isSelected={selectedItem === item.id}
                editTool={isLayoutMode ? editTool : null}
                onSelect={(id: string) => setSelectedItem(id)}
                onMove={handleMove}
                onRotate={handleRotate}
                onDelete={handleDelete}
              >
                {content}
              </DraggableWarehouseItem>
            );
          })}

        </Suspense>
      </Canvas>
    </Wrapper>
  );
};
