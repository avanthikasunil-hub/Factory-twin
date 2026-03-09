
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
  press: 'iron press.glb',

  // Button Family
  hole: 'buttonhole.glb',
  bhole: 'buttonhole.glb',
  bholemc: 'buttonhole.glb', // Explicit match for B/Hole M/C
  button: 'buttonmakinggg.glb',
  buttonmaking: 'buttonmakinggg.glb',

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

  for (const key of Object.keys(MODEL_MAP)) {
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
    l = 7 * FT; w = 3.5 * FT; h = 7.0 * FT;
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

export const Machine3D = ({ machineData, relativePosition }: Machine3DProps) => {
  const rootRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [modelBounds, setModelBounds] = useState({ sizeX: 0, sizeZ: 0, centerX: 0, centerZ: 0 });
  const [computedScale, setComputedScale] = useState<[number, number, number]>([1, 1, 1]);

  const { selectedMachines, toggleMachineSelection, visibleSection, updateMachinePosition, isMoveMode } = useLineStore();
  const isSelected = selectedMachines.includes(machineData.id);

  const isVisible = !visibleSection || (machineData.section && machineData.section.toLowerCase() === visibleSection.toLowerCase());

  // Unused Position Logic (Mapping state)
  const isUnused = machineData.operation.op_no === '---';

  // Bottleneck Color Logic
  const { workingHours, efficiency, targetOutput, machineLayout } = useLineStore();
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
        <Text
          position={[0, 0, 0.06]}
          fontSize={0.2}
          color="#000000"
          anchorX="center"
          anchorY="middle"
        >
          {machineData.section}
        </Text>
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
        <Text
          position={[0, 0.2, 0]}
          fontSize={0.12}
          color="#555"
          rotation={[-Math.PI / 2, 0, 0]}
          fontWeight="bold"
        >
          {isUnused ? "UNUSED POSITION" : machineData.operation.machine_type.toUpperCase()}
        </Text>
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

        {/* Garment Bundles for Supermarket */}
        {mType.includes('supermarket') && <GarmentBundles />}

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
          <Html position={[0, 2, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="bg-black/90 text-white px-2.5 py-2.0 rounded-lg text-xs whitespace-nowrap backdrop-blur-md pointer-events-none border border-white/20 shadow-xl min-w-[140px]">
              <div className="flex items-center justify-between gap-4 mb-2 pb-1.5 border-b border-white/10">
                <div className="font-black text-primary uppercase tracking-tight">
                  {machineData.operation.machine_type}
                </div>
                {machineData.machineIndex !== undefined && (
                  <div className="bg-primary/20 px-1.5 py-0.5 rounded text-[9px] font-black text-primary border border-primary/30">
                    #{machineData.machineIndex + 1}
                  </div>
                )}
              </div>

              {/* Show operation name if it's different and relevant */}
              {machineData.operation.op_name.toLowerCase() !== machineData.operation.machine_type.toLowerCase() && (
                <p className="text-[10px] text-white/90 font-bold mb-0.5">{machineData.operation.op_name}</p>
              )}

              <div className="flex items-center gap-2">
                <span className="text-[8px] bg-white/10 px-1 rounded text-white/50 font-bold uppercase tracking-widest">
                  Op {machineData.operation.op_no || "N/A"}
                </span>
              </div>

              {machineData.machineIndex !== undefined && (
                <div className="mt-1.5 pt-1.5 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">Work Content</span>
                  <span className="text-accent font-bold text-[10px]">{machineData.operation.smv?.toFixed(2)} min</span>
                </div>
              )}
            </div>
          </Html>
        )}
        {/* Machine Type Label (Always Visible) */}
        {!mType.includes('pathway') && !mType.startsWith('board') && (
          <Text
            position={[0, 1.25, 0]}
            fontSize={0.15}
            color="white"
            anchorX="center"
            anchorY="middle"
            fontWeight="bold"
            outlineWidth={0.02}
            outlineColor="#000000"
          >
            {machineData.operation.machine_type.toUpperCase()}
          </Text>
        )}
      </group>

      {/* Human Operator */}
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

      {/* Ground Zone Area Border */}
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
