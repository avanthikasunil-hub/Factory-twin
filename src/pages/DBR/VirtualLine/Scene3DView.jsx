import React, { Suspense, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';
import { LANE_Z_A, LANE_Z_B, LANE_Z_C, LANE_Z_D, FT, getMachineZoneDims, canonicalMachineType } from './layoutGenerator';

// ─── CONSTANTS & HELPERS ─────────────────────────────────────────────
const MODEL_MAP = {
  inspection: 'inspection machine final.glb',
  snls: 'snls.glb', dnls: 'snls.glb', snec: 'snls.glb',
  overlock: '3t ol.glb', ol: '3t ol.glb', '3t': '3t ol.glb',
  foa: 'FOA.glb', 'feed off arm': 'FOA.glb',
  label: 'labelattaching.glb', attach: 'labelattaching.glb',
  wrapping: 'wrapping.glb', wrap: 'wrapping.glb',
  turning: 'turning mc.glb', pointing: 'pointing mc.glb',
  contour: 'contourmc.glb',
  'iron press': 'iron press.glb', iron: 'iron press.glb', 'iron table': 'iron press.glb', 'ironing table': 'iron press.glb',
  pressing: 'pressing.glb', press: 'pressing.glb',
  buttonhole: 'buttonhole.glb', hole: 'buttonhole.glb',
  bhole: 'buttonhole.glb', 'b/h': 'buttonhole.glb', bh: 'buttonhole.glb',
  buttonmaking: 'buttonmakinggg.glb', buttonsew: 'buttonmakinggg.glb', button: 'buttonmakinggg.glb',
  bartack: 'bartack.finalglb.glb', notch: 'notchmc.glb',
  supermarket: 'supermarket.glb',
  trolley: 'helpers table.glb', helper: 'helpers table.glb',
  'helper table': 'helpers table.glb', table: 'helpers table.glb',
  'rotary fusing': 'rotaryfusing.glb', fusing: 'fusing mc.glb', rotary: 'rotaryfusing.glb',
  blocking: 'blocking mc.glb', spreader: 'spreader.glb',
  default: 'last machine.glb',
};

function getModelUrl(type) {
  const canonical = canonicalMachineType(type);
  const t = canonical.toLowerCase();

  const sortedKeys = Object.keys(MODEL_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (key === 'default') continue;
    if (t.includes(key)) return `/models/${MODEL_MAP[key]}`;
  }

  // Industrial Fallback Logic (Matching exhaustive OB variants)
  if (t.includes('snls') || t.includes('lock') || t.includes('single') || t.includes('stitch') || t.includes('plain')) return `/models/${MODEL_MAP.snls}`;
  if (t.includes('overlock') || t.includes('ol') || t.includes('edge') || t.includes('snec') || t.includes('3t') || t.includes('5t')) return `/models/${MODEL_MAP.overlock}`;
  if (t.includes('iron') || t.includes('press') || t.includes('fusing') || t.includes('steam')) return `/models/${MODEL_MAP.iron}`;
  if (t.includes('button') || t.includes('eyelet') || t.includes('hole')) return `/models/${MODEL_MAP.buttonhole}`;
  if (t.includes('bartack') || t.includes('bt') || t.includes('track')) return `/models/${MODEL_MAP.bartack}`;
  if (t.includes('manual') || t.includes('table') || t.includes('helper') || t.includes('trolley')) return `/models/${MODEL_MAP.trolley}`;
  if (t.includes('turning') || t.includes('pointing') || t.includes('contour') || t.includes('notch') || t.includes('wrapping')) return `/models/${MODEL_MAP.turning}`;
  if (t.includes('supermarket')) return `/models/${MODEL_MAP.supermarket}`;

  return `/models/${MODEL_MAP.default}`;
}

function getTargetDims(type) {
  return getMachineZoneDims(type);
}

const STATUS = { producing: '#ef4444', changeover: '#facc15', approved: '#22c55e' };
const SEC_HEX = {
  collar: '#72b3c2', front: '#304965', back: '#aebbd1', sleeve: '#062994',
  cuff: '#0799cf', assembly: '#475569', general: '#94a3b8', supermarket: '#10b981'
};

// Optimized Shared Materials to prevent redraw lag
const MATERIAL_CACHE = {
  chair: new THREE.MeshStandardMaterial({ color: '#1e1e1e', roughness: 0.4 }),
  metal: new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.3, metalness: 0.8 }),
  coat: new THREE.MeshStandardMaterial({ color: '#bae6fd', roughness: 0.9 }),
  ppeBlue: new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.9 }),
};

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────
const Ground = () => (
  <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
      <planeGeometry args={[2000, 2000]} />
      <meshStandardMaterial color="#1e293b" roughness={0.9} metalness={0.1} />
    </mesh>
    <gridHelper args={[2000, 400, '#334155', '#334155']} position={[0, -0.45, 0]} />
  </group>
);

const WideBorder = ({ length, width, thickness = 0.1, color = "#fcd34d" }) => (
  <group position={[0, 0.015, 0]}>
    {/* Top side */}
    <mesh position={[0, 0, -width / 2 - thickness / 2]}>
      <boxGeometry args={[length + thickness * 2, 0.05, thickness]} />
      <meshStandardMaterial color={color} />
    </mesh>
    {/* Bottom side */}
    <mesh position={[0, 0, width / 2 + thickness / 2]}>
      <boxGeometry args={[length + thickness * 2, 0.05, thickness]} />
      <meshStandardMaterial color={color} />
    </mesh>
    {/* Left side */}
    <mesh position={[-length / 2 - thickness / 2, 0, 0]}>
      <boxGeometry args={[thickness, 0.05, width]} />
      <meshStandardMaterial color={color} />
    </mesh>
    {/* Right side */}
    <mesh position={[length / 2 + thickness / 2, 0, 0]}>
      <boxGeometry args={[thickness, 0.05, width]} />
      <meshStandardMaterial color={color} />
    </mesh>
  </group>
);

const HumanOperator = ({ id, rotation, isStanding, isInspection }) => {
  // Deterministic random behavior based on ID
  const seed = (id || 'default').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const isFemale = seed % 2 === 0;

  // Colors
  const skinColors = ['#f1c27d', '#ffdbac', '#e0ac69', '#8d5524', '#c68642'];
  const skinColor = skinColors[seed % skinColors.length];

  const maleShirtColors = ['#1e3a8a', '#047857', '#374151', '#7f1d1d', '#d97706'];
  const femaleShirtColors = ['#be185d', '#7e22ce', '#047857', '#b91c1c', '#0f766e'];
  const shirtColor = isFemale
    ? femaleShirtColors[seed % femaleShirtColors.length]
    : maleShirtColors[seed % maleShirtColors.length];

  const pantColors = ['#1e293b', '#334155', '#475569', '#0f172a'];
  const pantColor = pantColors[seed % pantColors.length];

  const hairColors = ['#0f0f0f', '#3b2f2f', '#4a3c31', '#d4af37', '#7b3f00'];
  const hairColor = hairColors[seed % hairColors.length];

  // Proportions
  const torsoWidth = isFemale ? 0.35 : 0.45;
  const torsoHeight = isFemale ? 0.55 : 0.6;
  const shoulderWidth = isFemale ? 0.4 : 0.5;

  return (
    <group position={[0, 0, 0.55]} rotation={[0, Math.PI, 0]} scale={[0.8, 0.8, 0.8]}>
      {/* --- CHAIR --- */}
      {!isStanding && (
        <group position={[0, 0, 0]}>
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[0.4, 0.05, 0.4]} />
            <meshStandardMaterial color="#1e1e1e" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.225, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.45]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.3} metalness={0.8} />
          </mesh>
          {[0, 1, 2, 3, 4].map(i => (
            <mesh key={i} position={[0, 0.05, 0]} rotation={[0, (i * Math.PI * 2) / 5, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.4]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.3} metalness={0.8} />
            </mesh>
          ))}
          <mesh position={[0, 0.65, -0.18]} rotation={[0.1, 0, 0]}>
            <boxGeometry args={[0.05, 0.4, 0.02]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.3} metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.8, -0.2]}>
            <boxGeometry args={[0.35, 0.2, 0.05]} />
            <meshStandardMaterial color="#1e1e1e" roughness={0.4} />
          </mesh>
        </group>
      )}

      {/* --- HUMAN BODY --- */}
      <group position={[0, isStanding ? 0.75 : 0.48, 0]}>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[torsoWidth, 0.16, 0.25]} />
          <meshStandardMaterial color={pantColor} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.16 + torsoHeight / 2, 0]} scale={[1, 1, 0.6]}>
          <cylinderGeometry args={[torsoWidth / 2, torsoWidth / 2.5, torsoHeight, 16]} />
          <meshStandardMaterial color={shirtColor} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.16 + torsoHeight / 2, 0]} scale={[1, 1, 0.65]}>
          <cylinderGeometry args={[torsoWidth / 2 + 0.02, torsoWidth / 2.5 + 0.02, torsoHeight + 0.02, 16]} />
          <meshStandardMaterial color="#bae6fd" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.16 + torsoHeight + 0.05, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.1]} />
          <meshStandardMaterial color={skinColor} roughness={0.6} />
        </mesh>
        <group position={[0, 0.16 + torsoHeight + 0.2, 0.02]}>
          <mesh>
            <sphereGeometry args={[0.13, 32, 32]} />
            <meshStandardMaterial color={skinColor} roughness={0.6} />
          </mesh>
          <mesh position={[0, -0.01, 0.13]}>
            <sphereGeometry args={[0.02, 16, 16]} />
            <meshStandardMaterial color={skinColor} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.02, -0.04]} rotation={[-0.3, 0, 0]}>
            <sphereGeometry args={[0.135, 32, 32, 0, Math.PI * 2, 0, Math.PI / 1.6]} />
            <meshStandardMaterial color="#38bdf8" roughness={0.9} />
          </mesh>
        </group>
        {/* Arms */}
        {[-1, 1].map((side) => {
          const armRotX = isInspection ? -Math.PI / 3 : -Math.PI / 4;
          const lowerArmRotX = isInspection ? -Math.PI / 2.5 : -Math.PI / 2;
          const handPosZ = isInspection ? 0.6 : 0.52;
          const handPosY = isInspection ? -0.22 : -0.28;
          return (
            <group key={side} position={[side * (shoulderWidth / 2 + 0.05), 0.16 + torsoHeight - 0.08, 0]}>
              <mesh position={[0, -0.04, 0.02]} rotation={[-Math.PI / 4, 0, 0]}>
                <capsuleGeometry args={[0.05, 0.1, 4, 16]} />
                <meshStandardMaterial color={shirtColor} roughness={0.8} />
              </mesh>
              <mesh position={[0, -0.14, 0.11]} rotation={[armRotX, 0, 0]}>
                <capsuleGeometry args={[0.04, 0.24, 4, 16]} />
                <meshStandardMaterial color={skinColor} roughness={0.6} />
              </mesh>
              <mesh position={[0, handPosY, handPosZ - 0.16]} rotation={[lowerArmRotX, 0, 0]}>
                <capsuleGeometry args={[0.035, 0.28, 4, 16]} />
                <meshStandardMaterial color={skinColor} roughness={0.6} />
              </mesh>
              <mesh position={[0, handPosY, handPosZ]} rotation={[0, 0, Math.PI / 2]}>
                <capsuleGeometry args={[0.035, 0.08, 4, 16]} />
                <meshStandardMaterial color={skinColor} roughness={0.6} />
              </mesh>
            </group>
          );
        })}
        {/* Legs */}
        {[-1, 1].map((side) => (
          <group key={side} position={[side * (torsoWidth / 2 - 0.08), 0.08, isStanding ? 0 : 0.1]}>
            {isStanding ? (
              <>
                <mesh position={[0, -0.2, 0]} rotation={[0, 0, 0]}>
                  <capsuleGeometry args={[0.065, 0.3, 4, 16]} />
                  <meshStandardMaterial color={pantColor} roughness={0.9} />
                </mesh>
                <mesh position={[0, -0.58, 0]}>
                  <capsuleGeometry args={[0.055, 0.4, 4, 16]} />
                  <meshStandardMaterial color={pantColor} roughness={0.9} />
                </mesh>
                <mesh position={[0, -0.85, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
                  <capsuleGeometry args={[0.045, 0.12, 4, 16]} />
                  <meshStandardMaterial color="#27272a" roughness={0.9} />
                </mesh>
              </>
            ) : (
              <>
                <mesh position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
                  <capsuleGeometry args={[0.065, 0.3, 4, 16]} />
                  <meshStandardMaterial color={pantColor} roughness={0.9} />
                </mesh>
                <mesh position={[0, -0.25, 0.33]}>
                  <capsuleGeometry args={[0.055, 0.35, 4, 16]} />
                  <meshStandardMaterial color={pantColor} roughness={0.9} />
                </mesh>
                <mesh position={[0, -0.48, 0.38]} rotation={[Math.PI / 2, 0, 0]}>
                  <capsuleGeometry args={[0.045, 0.12, 4, 16]} />
                  <meshStandardMaterial color="#27272a" roughness={0.9} />
                </mesh>
              </>
            )}
          </group>
        ))}
      </group>
    </group>
  );
};

const Machine3D = ({ id, machineData, showStatusLights = false, lightweight, styleMetadata = {} }) => {
  const meshRef = useRef();
  const [hovered, setHovered] = useState(false);

  const op = machineData.operation || {};
  const mType = op.machine_type || op.machine || 'SNLS';
  const qc = op.qcStatus;
  const arr = op.machineArranged;

  let statusColor = STATUS.producing;
  if (qc === 'QC_APPROVED') statusColor = STATUS.approved;
  else if (arr === 'Yes' || qc === 'RUNNING') statusColor = STATUS.changeover;
  const isPulsing = statusColor === STATUS.changeover;

  const modelPath = getModelUrl(mType);
  const targetDims = useMemo(() => getTargetDims(mType), [mType]);
  const { scene: gltfScene } = useGLTF(modelPath);

  const t = mType.toLowerCase();
  const isFusing = t.includes('fusing') || t.includes('rotary');
  const isTurning = t.includes('turning');
  const isStanding = t.includes('inspection') || t.includes('iron') || t.includes('press') || t.includes('fusing') || t.includes('rotary') || t.includes('helper') || t.includes('table');
  const needsOp = !t.includes('supermarket') && !t.includes('trolley');

  const processedScene = useMemo(() => {
    if (!gltfScene) return null;
    const cloned = gltfScene.clone();

    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const sf = isTurning ? 1.4 : 1.0;

    let sx, sy, sz;
    if (isFusing) {
      sx = size.x > 0.001 ? (targetDims.length * sf) / size.z : 1;
      sy = size.y > 0.001 ? (targetDims.height * sf) / size.y : 1;
      sz = size.z > 0.001 ? (targetDims.width * sf) / size.x : 1;
      cloned.rotation.y = -Math.PI / 2;
      cloned.position.set(-center.z, -box.min.y, center.x);
    } else {
      sx = size.x > 0.001 ? (targetDims.length * sf) / size.x : 1;
      sy = size.y > 0.001 ? (targetDims.height * sf) / size.y : 1;
      sz = size.z > 0.001 ? (targetDims.width * sf) / size.z : 1;
      cloned.position.set(-center.x, -box.min.y, -center.z);
    }

    cloned.userData.computedScale = [sx, sy, sz];

    cloned.traverse(child => {
      if (child.isMesh) {
        try {
          if ('castShadow' in child) child.castShadow = true;
          if ('receiveShadow' in child) child.receiveShadow = true;
        } catch (e) { }
        if (child.material) {
          const m = Array.isArray(child.material) ? child.material.map(mat => mat.clone()) : child.material.clone();
          child.material = m;
          const applyC = mat => { if (mat && mat.color && typeof mat.color.set === 'function') mat.color.set('#faf9f6'); };
          if (Array.isArray(child.material)) child.material.forEach(applyC);
          else applyC(child.material);
        }
      }
    });

    const wrapper = new THREE.Group();
    wrapper.add(cloned);
    wrapper.userData.computedScale = [sx, sy, sz];
    return wrapper;
  }, [gltfScene, mType, targetDims, isFusing, isTurning]);

  const modelRef = useRef();

  useLayoutEffect(() => {
    if (modelRef.current && processedScene) {
      modelRef.current.clear();
      modelRef.current.add(processedScene);
      return () => {
        if (modelRef.current) modelRef.current.remove(processedScene);
      };
    }
  }, [processedScene]);

  useFrame((_, delta) => {
    if (!meshRef.current || !processedScene) return;
    const computedScale = processedScene.userData.computedScale || [1, 1, 1];
    const targetY = hovered ? 0.08 : 0;
    meshRef.current.position.setY(THREE.MathUtils.lerp(meshRef.current.position.y, targetY, delta * 6));
    if (isPulsing) {
      const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.015;
      meshRef.current.scale.set(computedScale[0] * pulse, computedScale[1] * pulse, computedScale[2] * pulse);
    } else {
      meshRef.current.scale.set(computedScale[0], computedScale[1], computedScale[2]);
    }
  });

  const secColor = SEC_HEX[machineData.section?.toLowerCase()] || '#999';
  const isValidStr = (v) => typeof v === 'string' && v.trim() !== '' && v !== 'Unknown';
  let opLabel = 'Unknown Operation';
  
  if (isValidStr(op.op_name)) opLabel = op.op_name;
  else if (isValidStr(op.operation)) opLabel = op.operation;
  else if (isValidStr(op.operation_description)) opLabel = op.operation_description;
  else if (isValidStr(op.description)) opLabel = op.description;
  else if (isValidStr(op.name)) opLabel = op.name;
  else if (isValidStr(op.b)) opLabel = op.b;
  else if (isValidStr(op.B)) opLabel = op.B;
  else if (isValidStr(op.particulars)) opLabel = op.particulars;
  else if (typeof op.operation === 'object' && op.operation !== null) {
      if (isValidStr(op.operation.op_name)) opLabel = op.operation.op_name;
      else if (isValidStr(op.operation.operation)) opLabel = op.operation.operation;
  }

  return (
    <group position={[machineData.position.x, machineData.position.y, machineData.position.z]} rotation={[machineData.rotation.x, machineData.rotation.y, machineData.rotation.z]} dispose={null}>
      <group ref={meshRef} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
        <group ref={modelRef} dispose={null} />
      </group>
      {showStatusLights && (
        <mesh position={[0, 0.01, 0]}>
          <boxGeometry args={[targetDims.length + 0.05, 0.02, targetDims.width + 0.05]} />
          <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={isPulsing ? 2 : 1.2} transparent opacity={0.4} />
        </mesh>
      )}
      {needsOp && (
        <group position={[0, 0, (targetDims.width / 2) - 0.30]}>
          <HumanOperator
            id={id}
            rotation={0}
            isStanding={isStanding}
            isInspection={t.includes('inspection')}
            lightweight={lightweight}
          />
        </group>
      )}

      {hovered && Html && (
        <Html position={[0, (targetDims?.height || 4 * FT) + 0.8, 0]} center distanceFactor={10}>
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(12px)',
              color: '#cbd5e1',
              padding: '16px',
              borderRadius: '16px',
              fontSize: '11px',
              whiteSpace: 'nowrap',
              border: `1px solid ${secColor}55`,
              boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              minWidth: '180px',
              pointerEvents: 'auto'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '2px', fontSize: '6px', fontWeight: '900' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: secColor }} />
              {mType || 'Unknown Machine'}
            </div>
            <div style={{ fontSize: '18px', fontWeight: '800', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px', marginBottom: '2px', color: '#f1f5f9' }}>
              {opLabel}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#fff', fontWeight: '800', fontSize: '9px' }}>
                SMV: {(machineData.smv ? machineData.smv.toFixed(2) : (op.smv || op.operation?.smv || '0.00'))}
              </span>
              <span style={{ opacity: 0.4, fontSize: '9px' }}>ID: {id.split('-').pop()}</span>
            </div>
            {(() => {
              const styleMeta = Object.values(styleMetadata).find(sm =>
                (sm.style && machineData.operation?.op_name && machineData.id.includes(sm.style)) ||
                (sm.style && sm.style.length > 2 && machineData.id.toLowerCase().includes(sm.style.toLowerCase()))
              );

              if (!styleMeta?.fileUrl) return null;

              return (
                <div style={{ marginTop: '10px', display: 'flex' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(styleMeta.fileUrl, '_blank');
                    }}
                    style={{
                      background: '#8b5cf6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      fontSize: '10px',
                      fontWeight: '900',
                      cursor: 'pointer',
                      width: '100%',
                      pointerEvents: 'auto',
                      boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
                      textTransform: 'uppercase',
                      letterSpacing: '1px'
                    }}
                  >
                    View Operation Bulletin
                  </button>
                </div>
              );
            })()}
          </div>
        </Html>
      )}
    </group>
  );
};

// ─── MAIN SCENE ───────────────────────────────────────────────────────
export const Scene3D = ({
  showMachines = true,
  machines = [],
  sections = [],
  cameraPosition = [5, 8, 10],
  cameraFov = 50,
  styleMetadata = {},
  showStatusLights = false,
  lightweight = false
}) => {
  const sceneCenter = useMemo(() => {
    if (!sections.length) return [0, 0, 0];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    sections.forEach(s => {
      minX = Math.min(minX, s.position.x);
      maxX = Math.max(maxX, s.position.x + s.length);
      minZ = Math.min(minZ, s.position.z - s.width / 2);
      maxZ = Math.max(maxZ, s.position.z + s.width / 2);
    });
    return [(minX + maxX) / 2, 0, (minZ + maxZ) / 2];
  }, [sections]);

  return (
    <div className="w-full h-full">
      <Canvas
        shadows
        camera={{ position: cameraPosition, fov: cameraFov, near: 0.5, far: 30000 }}
        gl={{ antialias: true, alpha: false, logarithmicDepthBuffer: true }}
        onCreated={({ gl }) => gl.setClearColor('#080a0f')}
      >
        <fog attach="fog" args={['#080a0f', 100, 30000]} />
        <ambientLight intensity={0.9} />
        <directionalLight
          position={[20, 40, 10]}
          intensity={1.3}
          castShadow
          shadow-bias={-0.002}
          shadow-mapSize={[2048, 2048]}
        />
        <pointLight position={[10, 20, 2]} intensity={1.6} color="#3b82f6" />
        <pointLight position={[30, 20, -6]} intensity={1.3} color="#8b5cf6" />

        <Ground />

        <Suspense fallback={null}>
          {sections.map((sec, sIdx) => (
            <group key={sec.id || `sec-${sIdx}`} position={[sec.position.x + sec.length / 2, 0, sec.position.z]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
                <planeGeometry args={[sec.length, sec.width]} />
                <meshStandardMaterial color={sec.color || "#3b82f6"} roughness={0.8} transparent opacity={0.3} emissive={sec.color || "#3b82f6"} emissiveIntensity={0.1} polygonOffset polygonOffsetFactor={-10} polygonOffsetUnits={-10} depthWrite={false} />
              </mesh>
              <WideBorder length={sec.length} width={sec.width} color="#fcd34d" />
              {/* Unified Line Labels: Perfectly aligned in world Z=-1.96 (Midpoint between AB and CD) */}
              {sec.name.toLowerCase().includes('cuff') && (
                <Text
                  position={[-sec.length / 2 - 3.5, 0.02, 1.96]}
                  rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
                  fontSize={0.4} color="#64748b" anchorX="center" anchorY="middle"
                  fontWeight="black" fillOpacity={1}
                >
                  {sec.name.split(' ')[0].toUpperCase()} {sec.name.split(' ')[1].toUpperCase()}
                </Text>
              )}
              {sec.name.toLowerCase().includes('assembly cd') && (
                <Text
                  position={[sec.length / 2 + 2.0, 0.02, -1.96]}
                  rotation={[-Math.PI / 2, 0, Math.PI / 2]}
                  fontSize={0.4} color="#64748b" anchorX="center" anchorY="middle"
                  fontWeight="black" fillOpacity={1}
                >
                  {sec.name.split(' ')[0].toUpperCase()} {sec.name.split(' ')[1].toUpperCase()}
                </Text>
              )}
            </group>
          ))}
          {showMachines && machines.map((m, mIdx) => (
            <Suspense key={`${m.id || 'machine'}-${mIdx}`} fallback={null}>
              <Machine3D machineData={m} id={m.id} showStatusLights={showStatusLights} lightweight={lightweight} styleMetadata={styleMetadata} />
            </Suspense>
          ))}
          <OrbitControls target={sceneCenter} maxPolarAngle={Math.PI / 2.1} enableDamping dampingFactor={0.1} rotateSpeed={4.0} makeDefault />
        </Suspense>
      </Canvas>
    </div>
  );
};
