
import { useRef, useState, useMemo, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, useGLTF, Html, Line, PivotControls } from '@react-three/drei';
import * as THREE from 'three';
import type { MachinePosition } from '@/types';
import { useLineStore } from '@/store/useLineStore';
import { HumanOperator } from './HumanOperator';

interface Machine3DProps {
  machineData: MachinePosition;
  relativePosition?: { x: number, y: number, z: number };
  isOverview?: boolean;
}

// Maps machine keys (lowercase) to GLB filenames
const MODEL_MAP: Record<string, string> = {
  inspection: 'inspection machine final.glb',
  // Sewing Family
  snls: 'snls.glb',
  dnls: 'snls.glb', // Double needle looks similar for layout purposes

  // Overlock / SNEC Family
  snec: 'snls.glb', // User Requested: SNEC uses SNLS model
  overlock: '3t ol.glb',
  ol: '3t ol.glb',
  '3t': '3t ol.glb',

  // Specialty
  foa: 'FOA.glb', // Feed Off Arm
  label: 'labelattaching.glb',
  attach: 'labelattaching.glb',
  wrapping: 'wrapping.glb',
  wrap: 'wrapping.glb',

  // Specifics
  turning: 'turning mc.glb',
  pointing: 'pointing mc.glb',
  contour: 'contourmc.glb', // User Requested: contourmc.glb
  iron: 'iron press.glb',
  'iron table': 'iron press.glb',
  pressing: 'pressing.glb',
  press: 'pressing.glb',

  // Button Family
  buttonhole: 'buttonhole.glb',
  hole: 'buttonhole.glb',
  bhole: 'buttonhole.glb',
  bholemc: 'buttonhole.glb', // Explicit match for B/Hole M/C
  'b/h': 'buttonhole.glb',
  bh: 'buttonhole.glb',
  buttonmaking: 'buttonmakinggg.glb',
  buttonsew: 'buttonmakinggg.glb',
  button: 'buttonmakinggg.glb',

  // Others
  bartack: 'bartack.finalglb.glb',
  notch: 'notchmc.glb', // User Requested: Notch M/C uses notchmc.glb

  // Helpers
  supermarket: 'supermarket.glb',
  trolley: 'helpers table.glb',
  helper: 'helpers table.glb',
  'helper table': 'helpers table.glb', // Explicitly add helper table keyword
  table: 'helpers table.glb',
  fusing: 'fusing mc.glb',
  rotary: 'fusing mc.glb',
  blocking: 'blocking mc.glb',

  // Default override
  default: 'last machine.glb'
};

const getModelUrl = (type: string) => {
  if (!type) return `/models/${MODEL_MAP['default']}`;

  const t = type.toLowerCase();

  // Clean string for easier matching
  const cleanType = t.replace(/[^a-z0-9]/g, '');

  // Sort keys by length descending to match most specific names first
  // (e.g. 'buttonhole' before 'hole', 'trolley' before 'ol')
  const sortedKeys = Object.keys(MODEL_MAP).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    // default override should only be hit if nothing else matches
    if (key === 'default') continue;

    if (t.includes(key) || cleanType.includes(key)) {
      return `/models/${MODEL_MAP[key]}`;
    }
  }
  return `/models/${MODEL_MAP['default']}`;
};

const getTargetDimensionsMeters = (type: string) => {
  const t = type.toLowerCase();
  const FT = 0.3048;

  let l = 4 * FT, w = 2.5 * FT, h = 4 * FT;

  if (t.includes('foa') || t.includes('feed off arm')) {
    l = 4.5 * FT; w = 2.5 * FT; h = 4.0 * FT;
  } else if (t.includes('turning')) {
    l = 4.0 * FT; w = 2.5 * FT; h = 3.0 * FT;
  } else if (t.includes('pointing')) {
    l = 3.5 * FT; w = 2.5 * FT; h = 4.0 * FT;
  } else if (t.includes('contour')) {
    l = 4.5 * FT; w = 3 * FT; h = 4.0 * FT;
  } else if (t.includes('notch')) {
    l = 4 * FT; w = 2.5 * FT; h = 3.5 * FT;
  } else if (t.includes('pressing') || (t.includes('press') && !t.includes('iron'))) {
    l = 4.72 * FT; w = 4 * FT; h = 5 * FT;
  } else if (t.includes('iron') || t.includes('press')) {
    l = 4.0 * FT; w = 3.0 * FT; h = 3.0 * FT;
  } else if (t.includes('helper') || t.includes('work table') || t.includes('table') || t.includes('trolley')) {
    l = 4.5 * FT; w = 2.5 * FT; h = 2.2 * FT;
  } else if (t.includes('inspection')) {
    l = 5.0 * FT; w = 4.0 * FT; h = 7 * FT;
  } else if (t.includes('fusing') || t.includes('rotary')) {
    l = 4.5 * FT; w = 3.0 * FT; h = 4.0 * FT;
  } else if (t.includes('blocking')) {
    l = 4 * FT; w = 2.5 * FT; h = 4.0 * FT;
  } else if (t.includes('supermarket')) {
    l = 6.0 * FT; w = 2.5 * FT; h = 7.0 * FT;
  } else if (t.includes('wrapping') || t.includes('wrap')) {
    l = 4 * FT; w = 2.5 * FT; h = 3.0 * FT;
  }

  return {
    length: l,
    width: w,
    height: h
  };
};

const GarmentBundles = () => {
  const bundles = useMemo(() => {
    const items = [];
    const colors = ['#3b82f6', '#ec4899', '#ffffff', '#10b981', '#f59e0b', '#8b5cf6'];
    const FT = 0.3048;

    // We'll place bundles in 3 shelves (approx heights)
    const shelfHeights = [0.5, 1.2, 1.9]; // In meters

    for (const yBase of shelfHeights) {
      // Fill the 7ft length (approx -1.0m to 1.0m)
      for (let x = -0.8; x <= 0.8; x += 0.45) {
        // Two rows in depth (3.5ft approx -0.5m to 0.5m)
        for (let z = -0.25; z <= 0.25; z += 0.5) {
          // Random stack height 2-5
          const stackHeight = Math.floor(Math.random() * 3) + 2;
          // Random color for this stack
          const stackColor = colors[Math.floor(Math.random() * colors.length)];

          for (let h = 0; h < stackHeight; h++) {
            items.push({
              pos: [x + (Math.random() - 0.5) * 0.05, yBase + h * 0.1, z + (Math.random() - 0.5) * 0.05],
              color: stackColor,
              rot: [0, (Math.random() - 0.5) * 0.2, 0]
            });
          }
        }
      }
    }
    return items;
  }, []);

  return (
    <group>
      {bundles.map((b, i) => (
        <mesh key={i} position={b.pos as any} rotation={b.rot as any}>
          <boxGeometry args={[0.35, 0.08, 0.4]} />
          <meshStandardMaterial color={b.color} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
};

export const Machine3D = ({ machineData, relativePosition, isOverview }: Machine3DProps) => {
  const rootRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [modelBounds, setModelBounds] = useState({ sizeX: 0, sizeZ: 0, centerX: 0, centerZ: 0 });
  const [computedScale, setComputedScale] = useState<[number, number, number]>([1, 1, 1]);

  const { selectedMachines, toggleMachineSelection, visibleSection, updateMachinePosition, isMoveMode } = useLineStore();
  const isSelected = selectedMachines.includes(machineData.id);

  const isVisible = isOverview || !visibleSection || (machineData.section && machineData.section.toLowerCase() === visibleSection.toLowerCase());

  // Unused Position Logic (Mapping state)
  const isUnused = machineData.operation.op_no === '---';

  // Bottleneck Color Logic
  const { workingHours, efficiency, targetOutput, machineLayout } = useLineStore();

  // Compute this machine's sequential number within its section (sorted by X position)
  const sectionMcNumber = useMemo(() => {
    const sec = (machineData.section || machineData.operation.section || "").toLowerCase();
    const secMachines = machineLayout
      .filter(m => (m.section || "").toLowerCase() === sec && !m.isInspection)
      .sort((a, b) => a.position.x - b.position.x);
    const idx = secMachines.findIndex(m => m.id === machineData.id);
    return { pos: idx >= 0 ? idx + 1 : '?', total: secMachines.length };
  }, [machineLayout, machineData.id, machineData.section, machineData.operation.section]);

  const bottleneckColor = useMemo(() => {
    if (!machineData.operation || machineData.operation.smv <= 0) return null;

    const opName = (machineData.operation.op_name || "").trim().toLowerCase();
    const section = machineData.section || machineData.operation.section || "";

    // Total machines for THIS operation in THIS section
    const machinesForOp = machineLayout.filter(m =>
      (m.operation.op_name || "").trim().toLowerCase() === opName &&
      (m.section || m.operation.section || "") === section
    ).length || 1;

    const effectiveTime = workingHours * 60 * (efficiency / 100);
    const opOutput = Math.floor((effectiveTime * machinesForOp) / machineData.operation.smv);

    // Assembly sections have 1/3 target
    const isAssembly = section.toLowerCase().includes('assembly');
    const adjustedTarget = isAssembly ? Math.floor(targetOutput / 3) : targetOutput;

    if (opOutput < adjustedTarget * 0.9) return '#ef4444'; // Red (<90%)
    if (opOutput < adjustedTarget) return '#eab308';       // Yellow (<100%)
    return '#22c55e';                                      // Green (>=100%)
  }, [machineData, workingHours, efficiency, targetOutput, machineLayout]);

  const modelUrl = getModelUrl(machineData.operation.machine_type);
  const targetDims = useMemo(() => getTargetDimensionsMeters(machineData.operation.machine_type), [machineData.operation.machine_type]);
  const { scene: gltfScene } = useGLTF(modelUrl, true);
  const clonedScene = useMemo(() => (gltfScene ? gltfScene.clone() : null), [gltfScene]);

  if (!isVisible) return null;

  // Board check after hooks
  if (machineData.operation.machine_type.toLowerCase().startsWith('board')) {
    return (
      <group
        position={[machineData.position.x, machineData.position.y, machineData.position.z]}
        rotation={[machineData.rotation.x, machineData.rotation.y, machineData.rotation.z]}
      >
        <mesh position={[0, -1.2, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 2.5]} />
          <meshStandardMaterial color="#333" />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[1.5, 0.5, 0.1]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      </group>
    );
  }

  // Pathway check after hooks
  if (machineData.operation.machine_type.toLowerCase() === 'pathway') {
    return (
      <group
        position={[machineData.position.x, 0.01, 0]} // Centered on Z=0, slightly above floor
        rotation={[0, 0, 0]}
      >
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2, 30]} />
          <meshStandardMaterial color="#666666" transparent opacity={0.4} />
        </mesh>
        {/* Borders */}
        <mesh position={[1, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.1, 30]} />
          <meshStandardMaterial color="#fbbf24" />
        </mesh>
        <mesh position={[-1, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.1, 30]} />
          <meshStandardMaterial color="#fbbf24" />
        </mesh>
      </group>
    );
  }

  // Unused Position or Empty check
  if (isUnused || modelUrl === 'empty') {
    return (
      <group position={[machineData.position.x, 0.05, machineData.position.z]} rotation={[0, machineData.rotation.y, 0]}>
        <Line
          points={[
            [-targetDims.length / 2, -targetDims.width / 2, 0],
            [targetDims.length / 2, -targetDims.width / 2, 0],
            [targetDims.length / 2, targetDims.width / 2, 0],
            [-targetDims.length / 2, targetDims.width / 2, 0],
            [-targetDims.length / 2, -targetDims.width / 2, 0],
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
          color="#333"
          lineWidth={1}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      </group>
    );
  }

  // Handle centering logic once when model loads
  useLayoutEffect(() => {
    if (gltfScene && clonedScene) {
      const box = new THREE.Box3().setFromObject(gltfScene);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      setModelBounds({ sizeX: size.x, sizeZ: size.z, centerX: center.x, centerZ: center.z });

      // Use targetDims.length for X and targetDims.width for Z
      const type = machineData.operation.machine_type.toLowerCase();
      const isFusingLocally = type.includes('fusing') || type.includes('rotary');

      const scaleFactor = type.includes('turning') ? 1.4 : 1.0;

      const scaleX = size.x > 0.001 ? (isFusingLocally ? (targetDims.length * scaleFactor) / size.z : (targetDims.length * scaleFactor) / size.x) : 1;
      const scaleY = size.y > 0.001 ? (targetDims.height * scaleFactor) / size.y : 1;
      const scaleZ = size.z > 0.001 ? (isFusingLocally ? (targetDims.width * scaleFactor) / size.x : (targetDims.width * scaleFactor) / size.z) : 1;

      setComputedScale([scaleX, scaleY, scaleZ]);

      if (machineData.centerModel) {
        if (isFusingLocally) {
          // Rotate 180 from previous (PI/2 -> -PI/2) to ensure front faces operator
          clonedScene.rotation.y = -Math.PI / 2;
          // Centering shift for -90 deg rotation
          clonedScene.position.x = -center.z;
          clonedScene.position.z = center.x;
        } else {
          clonedScene.position.x = -center.x;
          clonedScene.position.z = -center.z;
        }
        // Snap to floor
        const baseY = -box.min.y;
        clonedScene.position.y = isFusingLocally ? 0 : baseY;
      }

      // Change all mesh colors in the model to off-white
      clonedScene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.material) {
            // Apply off-white color (#faf9f6)
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach(m => {
                if ('color' in m) (m as any).color.set('#faf9f6');
              });
            } else {
              if ('color' in mesh.material) (mesh.material as any).color.set('#faf9f6');
            }
          }
        }
      });
    }
  }, [gltfScene, clonedScene, machineData.centerModel, machineData.operation.machine_type, targetDims.length, targetDims.width, targetDims.height]);

  useFrame((state, delta) => {
    if (!rootRef.current || !meshRef.current) return;

    // Smoothly animate position to store position (simulation feel)
    const targetPos = relativePosition || machineData.position;

    // If we are being dragged in a proxy group, snapping is better for the moving group, 
    // but for "others" lerping is essential.
    if (relativePosition) {
      rootRef.current.position.set(targetPos.x, targetPos.y, targetPos.z);
    } else {
      rootRef.current.position.x = THREE.MathUtils.lerp(rootRef.current.position.x, targetPos.x, delta * 15);
      rootRef.current.position.y = THREE.MathUtils.lerp(rootRef.current.position.y, targetPos.y, delta * 15);
      rootRef.current.position.z = THREE.MathUtils.lerp(rootRef.current.position.z, targetPos.z, delta * 15);
    }

    // Scale animation
    const clickScale = clicked ? 0.9 : 1;
    meshRef.current.scale.set(
      computedScale[0] * clickScale,
      computedScale[1] * clickScale,
      computedScale[2] * clickScale
    );

    // Hover effect
    const hoverY = (hovered && !isSelected) ? 0.1 : 0;
    meshRef.current.position.y = THREE.MathUtils.lerp(
      meshRef.current.position.y,
      hoverY,
      delta * 5
    );
  });

  const handleClick = () => {
    setClicked(true);
    setTimeout(() => setClicked(false), 150);
    toggleMachineSelection(machineData.id);
  };

  if (!isVisible) return null;

  const zoneOffsetX = machineData.centerModel ? 0 : modelBounds.centerX * computedScale[0];
  const zoneOffsetZ = machineData.centerModel ? 0 : modelBounds.centerZ * computedScale[2];

  // Apply requested dimensions directly to borders as well to match identical scaling
  const zoneLengthX = targetDims.length;
  const zoneWidthZ = targetDims.width;

  const isAssembly = machineData.section?.toLowerCase().includes('assembly');
  const mType = machineData.operation.machine_type.toLowerCase();
  const needsOperator = !mType.includes('supermarket') && !mType.includes('trolley') && !mType.includes('pathway') && !mType.startsWith('board');

  const displayPos = relativePosition || machineData.position;

  return (
    <group
      ref={rootRef}
      position={[displayPos.x, displayPos.y, displayPos.z]}
      rotation={[machineData.rotation.x, machineData.rotation.y, machineData.rotation.z]}
    >
      <group
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        {/* 3D Model */}
        <primitive object={clonedScene} castShadow receiveShadow />

        {/* Garment Bundles for Supermarket - Hidden in Overview for performance */}
        {mType.includes('supermarket') && !isOverview && <GarmentBundles />}

        {/* Bottleneck Status Ring (Always Visible) */}
        {bottleneckColor && (
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.45, 0.52, 32]} />
            <meshBasicMaterial color={bottleneckColor} toneMapped={false} transparent opacity={0.8} />
          </mesh>
        )}

        {/* Selection Highlight Ring */}
        {isSelected && (
          <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.55, 0.65, 32]} />
            <meshBasicMaterial color="#3b82f6" toneMapped={false} />
          </mesh>
        )}

        {/* Info Label (Visible on Hover) */}
        {(hovered && !isSelected) && (
          <Html position={[0, 2.2, 0]} center style={{ pointerEvents: 'none' }}>
            <div style={{
              background: 'rgba(10,10,20,0.97)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '12px',
              padding: '8px 12px',
              minWidth: '140px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              backdropFilter: 'blur(16px)',
              pointerEvents: 'none',
              fontFamily: 'system-ui, sans-serif',
            }}>
              {/* Machine type badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '9px', fontWeight: 900, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                  {machineData.operation.machine_type}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 900, color: '#111827', backgroundColor: '#eab308', padding: '1px 6px', borderRadius: '4px', letterSpacing: '0.05em', boxShadow: '0 2px 4px rgba(234,179,8,0.3)' }}>
                  MC {sectionMcNumber.pos}
                </span>
              </div>
              {/* Operation name */}
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#ffffff', lineHeight: 1.3, marginBottom: '5px', maxWidth: '180px', wordBreak: 'break-word' }}>
                {machineData.operation.op_name || machineData.operation.machine_type}
              </div>
              {/* Section + SMV row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '4px' }}>
                <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{machineData.section}</span>
                <span style={{ marginLeft: 'auto', fontSize: '9px', color: '#10b981', fontWeight: 900 }}>{machineData.operation.smv?.toFixed(2)} min</span>
              </div>
            </div>
          </Html>
        )}
      </group>

      {/* Human Operator - RESTORED visibility for all modes */}
      {needsOperator && (() => {
        const isRotated90 = Math.abs(machineData.rotation.y % Math.PI) > 0.1;
        const operatorOffsetZ = isRotated90 ? -0.25 : 0;
        const isStanding = mType.includes('inspection') || mType.includes('iron') || mType.includes('press') || mType.includes('fusing') || mType.includes('rotary') || mType.includes('helper') || mType.includes('table');
        const moveX = Math.sin(machineData.rotation.y) * operatorOffsetZ;
        const moveZ = Math.cos(machineData.rotation.y) * operatorOffsetZ;

        let extraLocalZ = 0;
        let extraLocalX = 0;
        if (mType.includes('inspection')) {
          extraLocalZ = 0.25; // Even closer
          extraLocalX = 0;
        }

        const isInspection = mType.includes('inspection');

        return (
          <group position={[zoneOffsetX + moveX + extraLocalX, 0, zoneOffsetZ + moveZ + extraLocalZ]}>
            <HumanOperator id={machineData.id} rotation={machineData.rotation.y} isStanding={isStanding} isInspection={isInspection} />
          </group>
        );
      })()}

      {/* Ground Zone Area Border - RESTORED visibility for all modes */}
      {(() => {
        let humanMaxZ = 0;
        if (needsOperator) {
          const isRotated90 = Math.abs(machineData.rotation.y % Math.PI) > 0.1;
          const operatorOffsetZ = isRotated90 ? -0.25 : 0;
          const moveZ = Math.cos(machineData.rotation.y) * operatorOffsetZ;
          const extraLocalZ = mType.includes('inspection') ? 0.25 : 0;
          const isStanding = mType.includes('inspection') || mType.includes('iron') || mType.includes('press') || mType.includes('fusing') || mType.includes('rotary') || mType.includes('helper') || mType.includes('table');
          const baseHumanDepth = isStanding ? 0.45 : 0.65; // Slightly shallower depth for better look
          humanMaxZ = moveZ + extraLocalZ + baseHumanDepth;
        }

        const maxPositiveZ = Math.max(zoneWidthZ / 2, humanMaxZ);
        const operatorSideZ = -maxPositiveZ;
        const machineSideZ = zoneWidthZ / 2;

        return (
          <group position={[zoneOffsetX, 0.05, zoneOffsetZ]} rotation={[-Math.PI / 2, 0, 0]}>
            <Line
              points={[
                [-zoneLengthX / 2, operatorSideZ, 0],
                [zoneLengthX / 2, operatorSideZ, 0],
                [zoneLengthX / 2, machineSideZ, 0],
                [-zoneLengthX / 2, machineSideZ, 0],
                [-zoneLengthX / 2, operatorSideZ, 0],
              ]}
              color={(isSelected && isMoveMode) ? "#3b82f6" : "#ffff00"}
              lineWidth={(isSelected && isMoveMode) ? 3 : 1.5}
            />
          </group>
        );
      })()}
    </group>
  );
};
