import React, { useRef, useMemo, useState, useLayoutEffect, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { motion, AnimatePresence } from 'framer-motion';
import { Text, useGLTF, Html, Line, PivotControls } from '@react-three/drei';
import * as THREE from 'three';
import type { MachinePosition } from '@/types';
import { useLineStore } from '@/store/useLineStore';
import HumanOperator from './HumanOperator';
import { Cabin3D } from './Cabin3D';
import { IronBox } from './IronBox';
import { SpotWashBox } from './SpotWashBox';
import { GarmentConveyor } from './GarmentConveyor';
import { GerberParagon } from './GerberParagon';
import AutoSpreader from './AutoSpreader';
import ManualSpreader from './ManualSpreader';
import { FusingMachine } from './FusingMachine';
import { FT } from '../../utils/layoutGenerator';


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
  'straightknife': 'straightknife.glb',
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
  thread: 'thread.glb',
  'thread sucking': 'thread.glb',
  outinspection: 'outsideinspection.glb',
  spotwash: 'spotwash.glb', // Maintained

  // Helpers
  supermarket: 'supermarket.glb',
  trolley: 'helpers table.glb',
  helper: 'helpers table.glb',
  'helper table': 'helpers table.glb', // Explicitly add helper table keyword
  table: 'helpers table.glb',
  checking: 'checking table.glb',
  fusing: 'fusing mc.glb',
  rotary: 'rotaryfusing.glb',
  blocking: 'blocking mc.glb',
  folding: 'folding.glb',
  macpi: 'macpi.glb',
  finishing: 'finishing.glb',
  bandknife: 'bandknife.glb',
  'cuttingf': 'cuttingf.glb',

  // Default override
  default: 'last machine.glb'
};

// Pre-load all primary models in the background to ensure instantly smooth transitions
// when switching to Sewing or Finishing views (avoids main thread stall on first render).
if (typeof window !== 'undefined') {
  Array.from(new Set(Object.values(MODEL_MAP))).forEach(modelFile => {
    useGLTF.preload(`/models/${modelFile}`);
  });
}

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

const getTargetDimensionsMeters = (type: string, data?: any) => {
  const t = type.toLowerCase();
  const FT = 0.3048; // Forced rebuild touch

  // 1. Direct override from layout properties (Priority)
  if (data?.spreadingLength && (t === 'gerber' || t === 'auto-spreader' || t === 'manual-spreader' || data?.tableOnly)) {
    return {
      length: data.spreadingLength * FT,
      width: (data.tableWidth || 7.1) * FT,
      height: (data.tableHeight || 3) * FT
    };
  }

  if (data?.tableLength) {
    return {
      length: data.tableLength * FT,
      width: (data.tableWidth || 7.1) * FT,
      height: (data.tableHeight || 3) * FT
    };
  }

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
    l = 4.0 * FT; w = 3.0 * FT; h = 4.0 * FT;
  } else if (t.includes('inspection')) {
    l = 5.0 * FT; w = 4.0 * FT; h = 6.5 * FT;
  } else if (t.includes('helper') || t.includes('work table') || t.includes('table') || t.includes('trolley')) {
    l = 4.5 * FT; w = 2.5 * FT; h = 2.2 * FT;
  } else if (t.includes('fusing') || t.includes('rotary')) {
    l = 3 * FT; w = 4.0 * FT; h = 5.0 * FT;
  } else if (t.includes('cuttingf')) {
    l = 4 * FT; w = 2.5 * FT; h = 4.0 * FT;
  } else if (t.includes('blocking')) {
    l = 4 * FT; w = 2.5 * FT; h = 4.0 * FT;
  } else if (t.includes('straightknife')) {
    l = 1.0 * FT; w = 1.0 * FT; h = 2.0 * FT;
  } else if (t.includes('supermarket')) {
    l = 6.0 * FT; w = 2.5 * FT; h = 7.0 * FT;
  } else if (t.includes('wrapping') || t.includes('wrap')) {
    l = 4 * FT; w = 2.5 * FT; h = 3.0 * FT;
  } else if (t.includes('macpi')) {
    l = 6
      * FT; w = 3.0 * FT; h = 5.0 * FT;
  } else if (t.includes('checking')) {
    l = 3.0 * FT; w = 4 * FT; h = 4.5 * FT;
  } else if (t.includes('thread')) {
    l = 3 * FT; w = 3.7 * FT; h = 4 * FT;
  } else if (t.includes('folding')) {
    l = 4.0 * FT; w = 2.5 * FT; h = 4.5 * FT;
  } else if (t.includes('finishing')) {
    l = 3.0 * FT; w = 2.5 * FT; h = 5 * FT;
  } else if (t.includes('cabin') || t.includes('supervisor')) {
    l = 7 * FT; w = 7 * FT; h = 9 * FT; // 7ft x 7ft x 7ft
  } else if (t.includes('spotwash')) {
    l = 4 * FT; w = 2.5 * FT; h = 5 * FT; // Restore Original Dimensions
  } else if (t.includes('bandknife')) {
    l = 7 * FT; w = 4 * FT; h = 5.5 * FT;
  } else if (t.includes('fusing_custom')) {
    l = 24.4 * FT; w = 5.7 * FT; h = 6 * FT; // Updated to exactly 24.4ft L, 5.7ft W, and 5ft H
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

const Machine3DInternal = ({ machineData, relativePosition, isOverview }: Machine3DProps) => {
  const rootRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [modelBounds, setModelBounds] = useState({ sizeX: 0, sizeZ: 0, centerX: 0, centerZ: 0 });
  const mType = (machineData?.operation?.machine_type || 'default').toLowerCase();
  const targetDims = getTargetDimensionsMeters(mType, machineData);
  const modelUrl = getModelUrl(mType);

  const initialScale = useMemo(() => {
    if (mType.includes('fusing_custom')) return [1, 1, 1] as [number, number, number];
    return [1, 1, 1] as [number, number, number];
  }, [mType]);

  const [computedScale, setComputedScale] = useState<[number, number, number]>(initialScale);

  const {
    selectedMachines,
    toggleMachineSelection,
    visibleSection,
    isMoveMode,
    isRotateMode,
    isDeleteMode,
    isDraggingActive,
    setDraggingActive,
    moveSelectedMachines,
    updateMachinesPositions,
    updateMachineName,
    labelMachineId,
    setLabelMachineId
  } = useLineStore();

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(machineData.operation?.op_name || "");

  // Sync internal tempName with real prop name when machineData changes (e.g. from the store)
  useEffect(() => {
    setTempName(machineData.operation?.op_name || "");
  }, [machineData.operation?.op_name]);

  const { scene: gltfScene } = useGLTF(modelUrl || '/models/last machine.glb', true);
  const clonedScene = useMemo(() => (gltfScene ? gltfScene.clone() : null), [gltfScene]);

  const isSelected = machineData?.id ? selectedMachines.includes(machineData.id) : false;
  const isVisible = isOverview || !visibleSection || (machineData?.section && machineData.section.toLowerCase() === visibleSection.toLowerCase());
  const isUnused = machineData?.operation?.op_no === '---';


  // Special machine rendering will be handled after Hooks section


  // Handle centering logic once when model loads
  useLayoutEffect(() => {
    const isSpecialMachine = mType.includes('gerber') || 
      mType.includes('spreader') || 
      mType.includes('fusing_custom') || 
      mType.includes('cabin') || 
      mType.includes('supervisor') ||
      mType.includes('human') || 
      mType.includes('conveyor') ||
      mType.includes('garment') ||
      mType.startsWith('board');

    if (isSpecialMachine) {
      setComputedScale([1, 1, 1]); // Reset scaling for precision-built / coded models
      setModelBounds({ sizeX: 0, sizeZ: 0, centerX: 0, centerZ: 0 });
      return;
    }

    if (gltfScene && clonedScene) {
      // 1. Initial State Sync
      gltfScene.updateMatrixWorld(true);
      
      // 2. Pre-calculation rotation for specific models to ensure grounding logic sees the right footprint
      let isRotaryFusing = mType.includes('rotary') && !mType.includes('fusing_custom');
      if (isRotaryFusing) {
        clonedScene.rotation.y = -Math.PI / 2;
      }

      const box = new THREE.Box3().setFromObject(gltfScene);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      setModelBounds({ sizeX: size.x, sizeZ: size.z, centerX: center.x, centerZ: center.z });

      // Use targetDims.length for X and targetDims.width for Z
      const type = mType;
      const isFusingLocally = type.includes('fusing') || type.includes('rotary') || type.includes('cuttingf');

      const isInspectionLocally = type.includes('inspection') || type.includes('checking');
      const scaleFactor = type.includes('turning') ? 1.4 : 1.0;

      // Scaling logic - Swap length and width for rotary fusing to match internal rotation
      isRotaryFusing = mType.includes('rotary') && !mType.includes('fusing_custom');
      const scaleX = size.x > 0.001 ? ((isRotaryFusing ? targetDims.width : targetDims.length) * scaleFactor) / size.x : 1;
      const scaleY = size.y > 0.001 ? (targetDims.height * scaleFactor) / size.y : 1;
      const scaleZ = size.z > 0.001 ? ((isRotaryFusing ? targetDims.length : targetDims.width) * scaleFactor) / size.z : 1;

      setComputedScale([scaleX, scaleY, scaleZ]);

      if (machineData.centerModel) {
        // Enforce 0 internal rotation for layout consistency (90 deg from previous system)
        if (!isRotaryFusing) {
          clonedScene.rotation.y = mType.includes('fusing_custom') ? -Math.PI / 2 : 0;
        }

        clonedScene.position.x = -center.x;
        clonedScene.position.z = -center.z;
      }

      // 3. Precise Grounding - Use the rotated scene to find the absolute lowest point
      clonedScene.updateMatrixWorld(true);

      // Standard grounding - Snap internal position based on CLONED scene to be most accurate
      const finalBox = new THREE.Box3().setFromObject(clonedScene);
      const baseY = -finalBox.min.y;
      clonedScene.position.y = baseY;

      // Ensure the outer group itself starts at 0 height
      if (rootRef.current) rootRef.current.position.y = 0;
      if (meshRef.current) meshRef.current.position.y = 0;

      // Change all mesh colors in the model to off-white
      clonedScene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.material) {
            // Apply specific colors based on machine type
            const isFolding = mType.includes('folding');
            const targetColor = isFolding ? '#faf9f6' : '#ffffff'; // Off-white for folding, pure white for others

            if (Array.isArray(mesh.material)) {
              mesh.material.forEach(m => {
                if ('color' in m) (m as any).color.set(targetColor);
                if ('emissive' in m) (m as any).emissive.set(targetColor).multiplyScalar(0.15); // Add subtle emissive to counteract dark lighting
                if ('roughness' in m) (m as any).roughness = 0.5;
                if ('metalness' in m) (m as any).metalness = 0.1;
                if ('map' in m) (m as any).map = null; // Clear dark textures
              });
            } else {
              if ('color' in mesh.material) (mesh.material as any).color.set(targetColor);
              if ('emissive' in mesh.material) (mesh.material as any).emissive.set(targetColor).multiplyScalar(0.15);
              if ('roughness' in mesh.material) (mesh.material as any).roughness = 0.5;
              if ('metalness' in mesh.material) (mesh.material as any).metalness = 0.1;
              if ('map' in mesh.material) (mesh.material as any).map = null; // Clear dark textures
            }
          }
        }
      });
    }
  }, [gltfScene, clonedScene, machineData.centerModel, machineData.operation.machine_type, targetDims.length, targetDims.width, targetDims.height]);

  // Buttery-smooth movement logic (High-FPS Render Loop)
  const positionInitialized = useRef(false);

  useFrame((_, delta) => {
    if (!rootRef.current || !meshRef.current) return;

    const targetPos = relativePosition || machineData.position;

    // 1. Precise Tracking for Active Dragging (Absolute Zero Lag)
    if (isSelected && isDraggingActive && (window as any)._activeDragMatrix) {
      const matrix = (window as any)._activeDragMatrix as THREE.Matrix4;
      const translation = new THREE.Vector3();
      const orientation = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      matrix.decompose(translation, orientation, scl);

      const initialPos = (window as any)._initialPositions?.[machineData.id] || targetPos;

      rootRef.current.position.x = initialPos.x + translation.x;
      rootRef.current.position.y = initialPos.y;
      rootRef.current.position.z = initialPos.z + translation.z;
      positionInitialized.current = true;
    } else {
      // 2. SNAP on first render — never lerp from (0,0,0) to real position
      //    Only smooth-lerp when store updates position during an edit session
      if (!positionInitialized.current) {
        rootRef.current.position.set(targetPos.x, 0, targetPos.z);
        positionInitialized.current = true;
      } else if (isDraggingActive) {
        // Smooth lerp ONLY when user is actively dragging (edit mode)
        // Clamp to [0,1] to prevent overshoot when frames drop
        const lerpFactor = Math.min(delta * 20, 1.0);
        rootRef.current.position.x = THREE.MathUtils.lerp(rootRef.current.position.x, targetPos.x, lerpFactor);
        rootRef.current.position.y = 0;
        rootRef.current.position.z = THREE.MathUtils.lerp(rootRef.current.position.z, targetPos.z, lerpFactor);
      } else {
        // Snap to exact position when not dragging — eliminates all drift
        rootRef.current.position.set(targetPos.x, 0, targetPos.z);
      }
    }

    // 3. Hover Effect (Smooth Floating Transition)
    const hoverY = (hovered && !isSelected) ? 0.06 : 0;
    meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, hoverY, Math.min(delta * 6, 1.0));

    // 4. Interaction Feedback (Scale)
    const clickScale = clicked ? 0.9 : 1;
    meshRef.current.scale.set(
      computedScale[0] * clickScale,
      computedScale[1] * clickScale,
      computedScale[2] * clickScale
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

  // Only show the internal, non-modifiable operator if hideOperator is NOT set.
  // This allows cutting-zone machines to use separate, modifiable human entities.
  const needsOperator = (
    machineData.showOperator !== undefined
      ? machineData.showOperator
      : (
        mType.includes('snls') || mType.includes('overlock') || mType.includes('fusing') ||
        mType.includes('iron') || mType.includes('press') || mType.includes('inspection') ||
        mType.includes('bandknife') || mType.includes('rotary') ||
        mType.includes('folding') || mType.includes('macpi') || mType.includes('checking') ||
        mType.includes('thread') || mType.includes('spotwash') || mType.includes('finishing') ||
        mType.includes('helper')
      )
  ) && !machineData.hideOperator && mType !== 'human' && !mType.includes('sitting-human') && !mType.includes('supermarket') && !mType.includes('cabin');

  const displayPos = relativePosition || machineData.position || { x: 0, y: 0, z: 0 };

  // ACCESSORY CHECK - Iron box should appear on Iron machines, or any task involving 'pressing'
  const opNameLower = (machineData.operation?.op_name || machineData.opName || "").toLowerCase();
  const hasIronBox = (mType.includes('iron') || opNameLower.includes('pressing') || machineData.showIronBox === true) && machineData.hideIronBox !== true;

  // Decide if we use standard interaction group or specialized early-ish return
  if (mType === 'pathway') {
    return (
      <group position={[displayPos.x, 0.01, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2, 30]} />
          <meshStandardMaterial color="#666666" transparent opacity={0.4} />
        </mesh>
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

  if (isUnused || modelUrl === 'empty') {
    return (
      <group position={[displayPos.x, 0.05, displayPos.z]} rotation={[0, machineData.rotation.y, 0]}>
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

  return (
    <group
      ref={rootRef}
      position={[displayPos.x, displayPos.y, displayPos.z]}
      rotation={[machineData.rotation.x, (machineData.rotation.y || 0) + (machineData.modelRotation || 0), machineData.rotation.z]}
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
          useLineStore.getState().setLabelMachineId(machineData.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          useLineStore.getState().setLabelMachineId(null);
          document.body.style.cursor = 'auto';
        }}
      >
        {/* Branch: 3D Model Selection */}
        {mType === 'gerber' ? (
          <GerberParagon
            tableLength={machineData.tableLength || 17.0}
            tableWidth={machineData.tableWidth || 7.1}
            tableOnly={machineData.tableOnly || false}
            spreadingLength={machineData.spreadingLength || 0}
            operatorOnFarSide={machineData.operatorOnFarSide || false}
          />
        ) : mType === 'auto-spreader' ? (
          <AutoSpreader
            tableWidth={machineData.tableWidth || 7.1}
            status="spreading"
          />
        ) : mType === 'manual-spreader' ? (
          <ManualSpreader
            tableWidth={machineData.tableWidth || 7.1}
            fabricLength={machineData.fabricLength}
            fabricColor={machineData.fabricColor}
          />
        ) : mType.startsWith('board') ? (
          <group>
            <mesh position={[0, -1.2, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 2.5]} />
              <meshStandardMaterial color="#333" />
            </mesh>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[1.5, 0.5, 0.1]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
          </group>
        ) : mType.includes('cabin') || mType.includes('supervisor') ? (
          <Cabin3D width={targetDims.length} height={targetDims.height} depth={targetDims.width} />
        ) : (mType.includes('conveyor') || mType.includes('garment')) ? (
          <GarmentConveyor railLength={targetDims.length} railWidth={targetDims.width} />
        ) : mType === 'fusing_custom' ? (
          <FusingMachine
            L={machineData.tableLength || (targetDims.length / FT)}
            W={machineData.tableWidth || (targetDims.width / FT)}
            H={machineData.tableHeight || 5.0}
          />
        ) : mType.includes('human') ? (
          <group position={[zoneOffsetX, 0, zoneOffsetZ]}>
            <HumanOperator
              id={machineData.id}
              rotation={0}
              isStanding={!mType.includes('sitting')}
              isInspection={false}
            />
          </group>
        ) : (
          <group position={[zoneOffsetX, 0, zoneOffsetZ]}>
            <primitive object={clonedScene} castShadow receiveShadow />
          </group>
        )}

        {/* Selected Movement Controls */}
        {isSelected && isMoveMode && (
          <PivotControls
            anchor={[0, 0, 0]}
            depthTest={false}
            fixed={true}
            scale={75}
            activeAxes={[true, false, true]} // Constrain to floor (X and Z only)
            onDrag={(matrix) => {
              const position = new THREE.Vector3();
              position.setFromMatrixPosition(matrix);
              
              // Visual feedback only during drag for performance
              if (rootRef.current) {
                rootRef.current.position.x = position.x;
                rootRef.current.position.z = position.z;
              }
            }}
            onDragEnd={() => {
              if (rootRef.current) {
                const newPos = {
                  x: rootRef.current.position.x,
                  y: machineData.position.y || 0,
                  z: rootRef.current.position.z
                };
                useLineStore.getState().updateMachinePosition(machineData.id, newPos);
              }
            }}
          />
        )}

        {/* Garment Bundles for Supermarket - Hidden in Overview for performance */}
        {mType.includes('supermarket') && !isOverview && <GarmentBundles />}
      </group>

      {/* ACCESSORIES - Placed at root level to avoid being scaled by the model's computed scale */}
      {hasIronBox && (
        <group position={[0, 0.68, 0.2]} rotation={[0, Math.PI / 2, 0]}>
          <IronBox />
        </group>
      )}

      {/* Selection Highlight Ring */}
      {isSelected && (
        <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[targetDims.length / 2 + 0.2, targetDims.length / 2 + 0.35, 64]} />
          <meshBasicMaterial color={isMoveMode ? "#10b981" : "#facc15"} transparent opacity={0.6} depthWrite={false} />
        </mesh>
      )}

      {/* Info Label (Exclusive Visibility) */}
      {(() => {
        const isEditMode = isMoveMode || isRotateMode || isDeleteMode;
        const isPlacing = !!useLineStore.getState().placingMachine;
        const isModifying = isEditMode || isDraggingActive || isPlacing;
        const shouldShow = (labelMachineId === machineData.id || hovered || isSelected) && !isModifying;

        const section = machineData?.section || "";
        const mTypeLower = (machineData?.operation?.machine_type || "default").toLowerCase();
        const opNameLabel = (machineData?.operation?.op_name || "").toLowerCase();

        // 1. Resolve Display Name
        let name = machineData.operation?.op_name;
        const isGeneric = !name || name === "Unknown" || name === "default" || name === machineData.operation?.machine_type;

        if (isGeneric) {
          if (mTypeLower === 'gerber') name = opNameLabel.includes('table') ? "Spreading Table" : "Autocutter";
          else if (mTypeLower === 'auto-spreader') name = "Autospreader";
          else if (mTypeLower === 'manual-spreader') name = "Manual Spreader";
          else if (mTypeLower.includes('supermarket')) name = "Supermarket";
          else if (mTypeLower === 'snls') name = "Single Needle Lockstitch";
          else if (mTypeLower === 'overlock' || mTypeLower === 'ol') name = "Overlock Machine";
          else if (mTypeLower.includes('iron') || mTypeLower.includes('press')) name = "Iron Press Station";
          else if (mTypeLower.includes('fusing')) name = "Fusing Machine";
          else if (mTypeLower.includes('inspection')) name = "QC Station";
        }

        if (!name || name === "Unknown") name = (machineData.operation as any)?.op_name || "Equipment";

        const labelHeight = (name.toLowerCase().includes('table') || mTypeLower.includes('table')) ? 1.2 : 2.2;

        const isAssembly = section.toLowerCase().includes('assembly');
        const machineLayout = useLineStore.getState().machineLayout;
        const totalCount = machineLayout.filter(m =>
          (m.operation?.op_name || "").trim().toLowerCase() === (machineData.operation?.op_name || "").toLowerCase() &&
          (isAssembly ? (m.section || "").toLowerCase().includes('assembly') : (m.section || "") === section)
        ).length;

        return (
          <Html position={[0, labelHeight, 0]} center style={{ pointerEvents: 'none', zIndex: 1000 }}>
            <AnimatePresence>
              {shouldShow && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.98 }}
                  transition={{ type: 'spring', damping: 30, stiffness: 150, mass: 0.8 }}
                  style={{
                    background: 'rgba(7, 7, 15, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '12px',
                    padding: '8px 12px',
                    minWidth: '140px',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
                    backdropFilter: 'blur(24px)',
                    pointerEvents: isSelected ? 'auto' : 'none',
                    fontFamily: '"Outfit", system-ui, sans-serif',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '8px', fontWeight: 900, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                      {mTypeLower.replace('_custom', '').replace('-', ' ')}
                    </span>
                  </div>

                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#ffffff', lineHeight: 1.4, marginBottom: '6px' }}>
                    {isEditingName ? (
                      <input
                        autoFocus
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        onBlur={() => setIsEditingName(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateMachineName(machineData.id, tempName, machineData);
                            setIsEditingName(false);
                          }
                        }}
                        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '12px', padding: '4px 8px', borderRadius: '6px', width: '100%' }}
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{name}</span>
                        {isSelected && (
                          <button onClick={(e) => { e.stopPropagation(); setIsEditingName(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>SECTION</span>
                      <span style={{ fontSize: '8px', color: '#fff', fontWeight: 700 }}>{section}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Html>
        );
      })()}


      {/* Human Operator - RESTORED visibility for all modes */}
      {
        needsOperator && !machineData.hideOperator && (() => {
          const isRotated90 = Math.abs(machineData.rotation.y % Math.PI) > 0.1;
          const operatorOffsetZ = isRotated90 ? -0.25 : 0;
          const isStanding = (mType.includes('bandknife') || mType.includes('inspection') || mType.includes('iron') || mType.includes('press') || mType.includes('fusing') || mType.includes('rotary') || mType.includes('helper') || mType.includes('table') || mType.includes('folding') || mType.includes('macpi') || mType.includes('checking') || mType.includes('thread') || mType.includes('finishing') || mType.includes('spotwash') || mType.includes('straightknife') || mType.includes('knife')) && !mType.includes('sitting');
          const moveX = Math.sin(machineData.rotation.y) * operatorOffsetZ;
          const moveZ = Math.cos(machineData.rotation.y) * operatorOffsetZ;

          let extraLocalZ = 0;
          let extraLocalX = 0;

          // Use target dimensions (meters) to accurately offset the operator
          const machineHalfW = (targetDims.width || 0) / 2;

          const isInspection = mType.includes('inspection');

          // Standard offset for someone standing/sitting at a machine (industrial man-allowance)
          const isFusing = mType.includes('fusing') || mType.includes('rotary');
          const isSpreading = mType.includes('gerber') || mType.includes('auto-spreader');

          // For Fusing, the operator stands on the aisle side (Positive Z if rotation is 0)
          // For Fusing, the operator stands on the aisle side (Positive Z if rotation is 0)
          if (isFusing) {
            // If machine is rotated 90 degrees, we need to adjust the local coordinates 
            // so the human stays in the same effective world position (the aisle).
            if (isRotated90) {
              extraLocalX = -(machineHalfW - 0.6);
              extraLocalZ = 0;
            } else {
              extraLocalZ = machineHalfW - 0.6; // Deep intersection with the loading table
            }
          } else if (isInspection) {
            extraLocalZ = -0.2; // Very slightly back from inspection, inside yellow zone
          } else if (mType.includes('thread')) {
            extraLocalZ = 0.4;
          } else if (mType.includes('bandknife')) {
            if (isRotated90) { extraLocalZ = 0.4; } else { extraLocalX = 0.4; }
          } else if (isSpreading) {
            extraLocalZ = machineHalfW + 0.3; // Offset for spreading table workers
          } else if (mType.includes('checking')) {
            // For checking, stand at the edge of whichever side is designated as the front
            // Adjusted "just forward" based on physical floor scan
            if (machineData.rotateOperatorAxis) {
                extraLocalX = (targetDims.length / 2) + 0.2; // Moving "Forward"
                extraLocalZ = 0; // Centered
            } else {
                extraLocalZ = (targetDims.width / 2) + 0.2;
                extraLocalX = 0;
            }
          }

          if (machineData.operatorOnFarSide) {
            extraLocalZ = -extraLocalZ;
          }

          if (machineData.rotateOperatorAxis) {
            const oldX = extraLocalX;
            extraLocalX = extraLocalZ;
            extraLocalZ = oldX;
          }

          // Compute final internal rotation for the human
          let humanRotation = machineData.operatorOnFarSide ? Math.PI : 0;

          // Use either the explicit rotationOffset OR the automatic axis rotation, but avoid doubling them 
          // if they represent the same visual intent (facing the machine).
          if (machineData.rotationOffset !== undefined) {
            humanRotation += machineData.rotationOffset;
          } else if (machineData.rotateOperatorAxis) {
            humanRotation += Math.PI / 2;
          }

          return (
            <group>
              <group
                position={[zoneOffsetX + moveX + extraLocalX, -machineData.position.y, zoneOffsetZ + moveZ + extraLocalZ]}
                rotation={[0, humanRotation, 0]}>
                <HumanOperator
                  id={machineData.id}
                  rotation={0} // We handle rotation on the parent group now for clarity
                  isStanding={isStanding}
                  isInspection={isInspection}
                />
              </group>
              {mType.includes('outinspection') && (
                <group position={[zoneOffsetX - moveX - extraLocalX, 0, zoneOffsetZ - moveZ - extraLocalZ]} rotation={[0, Math.PI, 0]}>
                  <HumanOperator id={`${machineData.id}-2`} rotation={0} isStanding={isStanding} isInspection={isInspection} />
                </group>
              )}
            </group>
          );
        })()
      }

      {/* Ground Zone Area Border - Skip for pure humans */}
      {
        !(machineData as any).tableOnly && !(machineData as any).hideZone && !mType.includes('human') && (
          (() => {
            let humanMaxZ = 0;
            if (needsOperator) {
              const isRotated90 = Math.abs(machineData.rotation.y % Math.PI) > 0.1;
              const operatorOffsetZ = isRotated90 ? -0.25 : 0;
              const moveZ = Math.cos(machineData.rotation.y) * operatorOffsetZ;
              const extraLocalZ = mType.includes('inspection') ? 0.25 : 0;
              const isStanding = mType.includes('inspection') || mType.includes('iron') || mType.includes('press') || mType.includes('fusing') || mType.includes('rotary') || mType.includes('helper') || mType.includes('table') || mType.includes('checking');
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
                    [zoneLengthX / 2, machineSideZ, 0],
                    [zoneLengthX / 2, operatorSideZ, 0],
                    [-zoneLengthX / 2, operatorSideZ, 0],
                    [-zoneLengthX / 2, machineSideZ, 0],
                    [zoneLengthX / 2, machineSideZ, 0],
                  ]}
                  color={(isSelected && isMoveMode) ? "#3b82f6" : "#ffff00"}
                  lineWidth={(isSelected && isMoveMode) ? 3 : 1.5}
                />
              </group>
            );
          })()
        )
      }
    </group>
  );
};

export const Machine3D = React.memo(Machine3DInternal);
