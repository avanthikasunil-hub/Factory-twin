import { Suspense, useRef, useMemo, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Text, PivotControls } from '@react-three/drei';
import * as THREE from 'three';
import { useLineStore } from '@/store/useLineStore';
import type { MachinePosition, SectionLayout } from '@/types';
import { Machine3D } from './Machine3D';
import { Ground } from './Ground';
import { CameraController } from './CameraController';
import { SceneLighting } from './SceneLighting';

/**
 * Derives a clean, human-readable label from a section's name.
 * Rules:
 *  - Strip the leading "Line N" prefix (e.g. "Line 2 Cuff" → "Cuff")
 *  - Strip trailing lane suffixes: "AB", "CD", "AB/CD"
 *  - Strip "undefined" artefacts
 *  - Capitalise properly
 *  - Return null for supermarket / marker / transparent sections
 *    (those are structural and should never show a label)
 */
const getSectionLabel = (section: SectionLayout): string | null => {
  const raw = section.name || '';

  // Never label structural/invisible sections
  if (
    section.color === 'transparent' ||
    raw.toLowerCase().includes('supermarket') ||
    raw.toLowerCase().includes('marker')
  ) return null;

  // Strip "Line N " prefix
  let label = raw.replace(/^Line\s+\d+\s*/i, '').trim();

  // Strip trailing lane suffixes like " AB", " CD", " AB/CD"
  label = label.replace(/\s+(AB|CD|AB\/CD)$/i, '').trim();

  // Strip stray "undefined"
  label = label.replace(/undefined/gi, '').trim();

  if (!label) return null;
  
  // Specific fix for Assembly labeling - preserve Lane Numbers 1-4
  if (label.toLowerCase().includes('assembly')) {
    if (raw.toLowerCase().includes('ab')) return 'ASSEMBLY 1 & 2';
    if (raw.toLowerCase().includes('cd')) return 'ASSEMBLY 3 & 4';
    return 'ASSEMBLY';
  }

  return label.toUpperCase();
};

/**
 * Returns true when the section is an Assembly zone (either AB or CD group).
 */
const isAssemblySection = (section: SectionLayout): boolean =>
  section.name.toLowerCase().includes('assembly');

/**
 * For assembly sections the two lanes (AB = lanes 1&2, CD = lanes 3&4)
 * share one floor rectangle. We render two labels — one per lane — on
 * opposite sides of the zone.
 * Returns [frontLabel, backLabel] where "front" is the -Z side (lane A/C)
 * and "back" is the +Z side (lane B/D).
 */
const getAssemblyLaneLabels = (section: SectionLayout): [string, string] => {
  const isAB = section.name.toLowerCase().includes('ab') ||
    (!section.name.toLowerCase().includes('cd') &&
      section.position.z < -2); // AB group is on the negative-Z side
  if (isAB) return ['ASSEMBLY 2', 'ASSEMBLY 1']; // Lane A (front) / Lane B (back)
  return ['ASSEMBLY 4', 'ASSEMBLY 3'];            // Lane C (front) / Lane D (back)
};

/* ─── Main Scene ────────────────────────────────────────────────────────── */

export const Scene3D = ({
  showMachines = true,
  machines: machinesOverride,
  sections: sectionsOverride,
  isOverview = false,
  cameraPosition,
  cameraFov,
  target: targetOverride,
  children,
  hideLabels = false
}: {
  showMachines?: boolean;
  machines?: MachinePosition[];
  sections?: SectionLayout[];
  isOverview?: boolean;
  cameraPosition?: [number, number, number];
  cameraFov?: number;
  target?: [number, number, number];
  children?: React.ReactNode;
  hideLabels?: boolean;
}) => {
  const {
    machineLayout: storeMachineLayout,
    sectionLayout: storeSectionLayout,
    selectedMachine,
    selectedMachines,
    isMoveMode,
    updateMachinesPositions,
    moveSelectedMachines,
    isDraggingActive,
    setDraggingActive,
    placingMachine,
    setPlacingMachine,
    addMachine,
    updateMachinePosition,
    isMoveGizmoVisible,
  } = useLineStore();

  const [gizmoAnchor, setGizmoAnchor] = useState<{ x: number, z: number } | null>(null);

  const machineLayout = useMemo(() => {
    if (!machinesOverride) return storeMachineLayout;
    // Prefer store-based versions for any machine IDs that match, ensuring edits (names, rotations, etc) persist
    return machinesOverride.map(mc => {
      const storeMc = storeMachineLayout.find(sm => sm.id === mc.id);
      return storeMc || mc;
    });
  }, [machinesOverride, storeMachineLayout]);

  const sectionLayout = sectionsOverride || storeSectionLayout;

  // Initialize/Sync gizmo anchor whenever selection changes and we're NOT dragging
  useEffect(() => {
    // We re-home the handle to the primary selection whenever NOT dragging
    if (!isDraggingActive && isMoveMode && selectedMachines.length > 0) {
      const leader = machineLayout.find(m => m.id === selectedMachines[0]);
      if (leader) {
        setGizmoAnchor({ x: leader.position.x, z: leader.position.z });
      }
    } else if (selectedMachines.length === 0) {
      setGizmoAnchor(null);
    }
  }, [isMoveMode, selectedMachines, isDraggingActive, machineLayout]);

  // Stable drag-centre — computed only when selection changes or move mode toggled.
  // We lock the anchor while dragging to prevent coordinate drift, but update it once 
  // the drag-drop is complete so the arrows follow the new machine position.
  const dragCenter = useMemo(() => {
    if (!isMoveMode || selectedMachines.length === 0) return null;
    const selectedData = machineLayout.filter(m => selectedMachines.includes(m.id));
    if (selectedData.length === 0) return null;
    const avgX = selectedData.reduce((sum, m) => sum + m.position.x, 0) / selectedData.length;
    const avgZ = selectedData.reduce((sum, m) => sum + m.position.z, 0) / selectedData.length;
    return { x: avgX, z: avgZ };
  }, [isMoveMode, selectedMachines, isDraggingActive ? null : machineLayout]); // Re-center ONLY when NOT dragging

  // Camera look-at target: geometric centre of the whole floor plan
  const sceneCenter = useMemo((): [number, number, number] => {
    if (!sectionLayout?.length) return [0, 0, 0];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    sectionLayout.forEach(s => {
      minX = Math.min(minX, s.position.x);
      maxX = Math.max(maxX, s.position.x + s.length);
      minZ = Math.min(minZ, s.position.z - s.width / 2);
      maxZ = Math.max(maxZ, s.position.z + s.width / 2);
    });
    return [(minX + maxX) / 2, 0, (minZ + maxZ) / 2];
  }, [sectionLayout]);

  return (
    <div className="w-full h-full">
      <Canvas
        shadows
        camera={{
          position: cameraPosition || (isOverview ? [-120, 140, 30] : [5, 8, 10]),
          fov: cameraFov || (isOverview ? 32 : 50),
          far: 30000
        }}
        gl={{ antialias: true, alpha: false, logarithmicDepthBuffer: true }}
        onCreated={({ gl }) => gl.setClearColor('#080a0f')}
      >
        <fog attach="fog" args={['#080a0f', 1000, 30000]} />
        <SceneLighting />
        <Ground />
        <CameraController
          machineLayout={machineLayout}
          selectedMachine={selectedMachine}
          target={targetOverride || sceneCenter}
          cameraPosition={cameraPosition}
          cameraFov={cameraFov}
        />

        <Suspense fallback={null}>
          {children}

          {/* ── Section floor tiles + labels ── */}
          {sectionLayout?.map((section) => {
            const centerX = section.position.x + section.length / 2;
            const centerZ = section.position.z; // world-space Z of this section's centre

            // Whether this section sits on the AB (negative-Z) group
            const isABGroup = centerZ < -2;

            // Label offset: put label on the OUTER edge of the lane
            // AB group  → label goes on the negative-Z side  (away from centre aisle)
            // CD group  → label goes on the positive-Z side
            const labelZOffset = isABGroup
              ? -(section.width / 2 + 0.9)
              : (section.width / 2 + 0.9);

            const label = getSectionLabel(section);
            const isAssembly = isAssemblySection(section);

            return (
              <group key={section.id} position={[centerX, 0.01, centerZ]} renderOrder={10}>

                {/* ── Floor fill ── */}
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[section.length, section.width]} />
                  <meshBasicMaterial
                    color={section.color || '#1e293b'}
                    opacity={0.3}
                    transparent
                    polygonOffset
                    polygonOffsetFactor={-10}
                    polygonOffsetUnits={-10}
                    depthWrite={false}
                  />
                </mesh>

                {/* ── Yellow border ── */}
                <WideBorder length={section.length} width={section.width} color="#facc15" />

                {/* ── Section Label ── */}
                {label && !hideLabels && (
                    <Text
                      position={[0, 0.05, labelZOffset]}
                      rotation={[-Math.PI / 2, 0, 0]}
                      fontSize={0.8}
                      color="#cbd5e1"
                      anchorX="center"
                      anchorY="middle"
                      outlineWidth={0.04}
                      outlineColor="#000"
                      fillOpacity={1.0}
                    >
                      {label}
                    </Text>
                  )}

              </group>
            );
          })}

          {/* ── Machines ── */}
          {showMachines && (
            <Suspense fallback={null}>
              <group>
                {machineLayout.map((machine) => (
                  <Machine3D 
                      key={machine.id} 
                      machineData={machine} 
                      isOverview={isOverview} 
                  />
                ))}
              </group>
            </Suspense>
          )}



          {/* ── Dynamic Grounded Movement Handle ── */}
          {showMachines &&
            isMoveMode &&
            gizmoAnchor && (
              <group position={[gizmoAnchor.x, 0, gizmoAnchor.z]} key={`gizmo-wrap-${gizmoAnchor.x}-${gizmoAnchor.z}`}>
                <PivotControls
                  anchor={[0, 0, 0]} // Centered on the group
                  activeAxes={[true, true, true]}
                  depthTest={false}
                  scale={60}
                  fixed={true} 
                  onDragStart={() => {
                    setDraggingActive(true);
                    (window as any)._lastX = 0;
                    (window as any)._lastZ = 0;

                    // Capture current positions so we have a 'stable origin' for absolute zero-lag move
                    const startPositions: Record<string, any> = {};
                    machineLayout.filter(m => selectedMachines.includes(m.id)).forEach(m => {
                       startPositions[m.id] = { ...m.position };
                    });
                    (window as any)._initialPositions = startPositions;
                  }}
                  onDrag={(matrix) => {
                    const translation = new THREE.Vector3();
                    const rotation = new THREE.Quaternion();
                    const scale = new THREE.Vector3();
                    matrix.decompose(translation, rotation, scale);
                    
                    // Store the matrix globally for the high-fps render loop in Machine3D
                    (window as any)._activeDragMatrix = matrix.clone();
                    
                    const dx = translation.x - ((window as any)._lastX || 0);
                    const dz = translation.z - ((window as any)._lastZ || 0);
                    
                    // Silent store update (low priority)
                    moveSelectedMachines(dx, dz);
                    
                    (window as any)._lastX = translation.x;
                    (window as any)._lastZ = translation.z;
                  }}
                  onDragEnd={() => {
                    updateMachinesPositions(selectedMachines);
                    setDraggingActive(false);
                    (window as any)._activeDragMatrix = null;
                    (window as any)._initialPositions = null;
                  }}
                >
                    <mesh visible={false}><boxGeometry args={[0.01, 0.01, 0.01]} /></mesh>
                </PivotControls>
              </group>
            )}

          {/* ── Manual Placement Ghost ── */}
          {placingMachine && (
            <PlacementGhostResolved 
              config={placingMachine} 
              onPlace={(pos) => {
                const id = THREE.MathUtils.generateUUID();
                const mTypeRaw = (placingMachine.type || '').toLowerCase();
                let actualMachineType = mTypeRaw;
                let dims: any = {};

                switch (mTypeRaw) {
                    case 'recutting_table':
                        actualMachineType = 'gerber';
                        dims = { tableOnly: true, tableLength: 17, tableWidth: 7.1, spreadingLength: 11.3 };
                        break;
                    case 'recutting_table_big':
                        actualMachineType = 'gerber';
                        dims = { tableOnly: true, tableLength: 17, tableWidth: 10, spreadingLength: 17 };
                        break;
                    case 'spreading_table_medium':
                        actualMachineType = 'gerber';
                        dims = { tableOnly: true, tableLength: 17, tableWidth: 7.1, spreadingLength: 33.9 };
                        break;
                    case 'narrow_spreading':
                        actualMachineType = 'gerber';
                        dims = { tableOnly: true, tableLength: 17, tableWidth: 3.2, spreadingLength: 12.2 };
                        break;
                    case 'relay_table':
                        actualMachineType = 'gerber';
                        dims = { tableOnly: true, tableLength: 17, tableWidth: 7.1, spreadingLength: 85 };
                        break;
                    case 'relay_pinning':
                        actualMachineType = 'gerber';
                        dims = { tableOnly: true, tableLength: 17, tableWidth: 7.1, spreadingLength: 11.3 };
                        break;
                    case 'fusing_custom':
                        actualMachineType = 'fusing_custom';
                        dims = { tableOnly: true, tableLength: 24.4, tableWidth: 5.7, tableHeight: 5, spreadingLength: 24.4 };
                        break;
                }

                const needsAutoOperator = actualMachineType.includes('bandknife') || actualMachineType.includes('rotary') || actualMachineType.includes('fusing') || actualMachineType.includes('cuttingf') || actualMachineType.includes('snls') || actualMachineType.includes('iron');

                const newMachine: MachinePosition = {
                    id,
                    operation: {
                        op_no: `NEW-${id.substring(0, 4)}`,
                        op_name: placingMachine.opName,
                        machine_type: actualMachineType,
                        smv: 0,
                        section: placingMachine.section,
                    },
                    position: pos,
                    rotation: { x: 0, y: 0, z: 0 },
                    lane: 'A',
                    section: placingMachine.section,
                    centerModel: true,
                    // If we are spawning a separate human, hide the internal one
                    hideOperator: needsAutoOperator,
                    ...dims
                } as any;
                
                const newMachines = [newMachine];

                if (needsAutoOperator) {
                    const humanId = THREE.MathUtils.generateUUID();
                    const isFusing = actualMachineType.includes('rotary') || actualMachineType.includes('fusing');
                    const isSNLS = actualMachineType.includes('snls') || actualMachineType.includes('iron');
                    const offsetZ = isFusing ? 1.0 : (isSNLS ? 1.4 : 1.2);
                    
                    newMachines.push({
                        id: humanId,
                        operation: {
                            op_no: `OP-${humanId.substring(0, 4)}`,
                            op_name: 'Human Operator',
                            machine_type: 'human',
                            smv: 0,
                            section: placingMachine.section,
                        },
                        position: { x: pos.x, y: 0, z: pos.z + offsetZ },
                        rotation: { x: 0, y: 0, z: 0 },
                        lane: 'A',
                        section: placingMachine.section,
                        centerModel: true,
                        hideOperator: true // Humans don't have operators
                    });
                }

                // We bypass the standard re-layout for manual placement in Finishing
                const currentLayout = useLineStore.getState().machineLayout;
                useLineStore.getState().setMachineLayout([...currentLayout, ...newMachines]);
                setPlacingMachine(null);
              }}
              resolvedType={(() => {
                const mTypeRaw2 = (placingMachine.type || '').toLowerCase();
                switch (mTypeRaw2) {
                  case 'recutting_table': return { type: 'gerber', dims: { tableOnly: true, tableLength: 17, tableWidth: 7.1, spreadingLength: 11.3 } };
                  case 'recutting_table_big': return { type: 'gerber', dims: { tableOnly: true, tableLength: 17, tableWidth: 10, spreadingLength: 17 } };
                  case 'spreading_table_medium': return { type: 'gerber', dims: { tableOnly: true, tableLength: 17, tableWidth: 7.1, spreadingLength: 33.9 } };
                  case 'narrow_spreading': return { type: 'gerber', dims: { tableOnly: true, tableLength: 17, tableWidth: 3.2, spreadingLength: 12.2 } };
                  case 'relay_table': return { type: 'gerber', dims: { tableOnly: true, tableLength: 17, tableWidth: 7.1, spreadingLength: 85 } };
                  case 'relay_pinning': return { type: 'gerber', dims: { tableOnly: true, tableLength: 17, tableWidth: 7.1, spreadingLength: 11.3 } };
                  case 'fusing_custom': return { type: 'fusing_custom', dims: { tableOnly: true, tableLength: 24.4, tableWidth: 5.7, tableHeight: 5, spreadingLength: 24.4 } };
                  default: return { type: mTypeRaw2, dims: {} };
                }
              })()}
            />
          )}

        </Suspense>
      </Canvas>
    </div>
  );
};

/* ─── Wide border component ─────────────────────────────────────────────── */

const WideBorder = ({
  length,
  width,
  thickness = 0.1,
  color = '#facc15',
}: {
  length: number;
  width: number;
  thickness?: number;
  color?: string;
}) => (
  <group position={[0, 0.01, 0]}>
    {/* Top edge */}
    <mesh position={[0, 0, -width / 2 - thickness / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[length + thickness * 2, thickness]} />
      <meshBasicMaterial color={color} />
    </mesh>
    {/* Bottom edge */}
    <mesh position={[0, 0, width / 2 + thickness / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[length + thickness * 2, thickness]} />
      <meshBasicMaterial color={color} />
    </mesh>
    {/* Left edge */}
    <mesh position={[-length / 2 - thickness / 2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[thickness, width]} />
      <meshBasicMaterial color={color} />
    </mesh>
    {/* Right edge */}
    <mesh position={[length / 2 + thickness / 2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[thickness, width]} />
      <meshBasicMaterial color={color} />
    </mesh>
  </group>
);

/* ─── Placement Ghost Component ────────────────────────────────────────── */

const PlacementGhostResolved = ({ 
    config, 
    onPlace,
    resolvedType
}: { 
    config: { type: string, section: string, opName: string },
    onPlace: (pos: { x: number, y: number, z: number }) => void,
    resolvedType: { type: string, dims: any }
}) => {
    const [ghostPos, setGhostPos] = useState<{ x: number, y: number, z: number } | null>(null);

    return (
        <group>
            <mesh 
                rotation={[-Math.PI / 2, 0, 0]} 
                position={[0, 0, 0]}
                onPointerMove={(e) => {
                    e.stopPropagation();
                    setGhostPos({ x: e.point.x, y: 0, z: e.point.z });
                }}
                onPointerUp={(e) => {
                    e.stopPropagation();
                    if (ghostPos) onPlace(ghostPos);
                }}
            >
                <planeGeometry args={[20000, 20000]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>

            {ghostPos && (
                <group position={[ghostPos.x, 0.1, ghostPos.z]}>
                    <Machine3D 
                        machineData={{
                            id: 'ghost',
                            operation: {
                                op_no: 'GHOST',
                                op_name: config.opName,
                                machine_type: resolvedType.type,
                                smv: 0,
                                section: config.section
                            },
                            position: { x: 0, y: 0, z: 0 },
                            rotation: { x: 0, y: 0, z: 0 },
                            lane: 'A',
                            section: config.section,
                            centerModel: true,
                            ...resolvedType.dims
                        } as any} 
                    />
                    {/* Visual indicator of placement mode */}
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
                        <ringGeometry args={[0.8, 1.0, 32]} />
                        <meshBasicMaterial color="#8b5cf6" transparent opacity={0.8} />
                    </mesh>
                </group>
            )}
        </group>
    );
};
