import { Suspense, useRef, useMemo } from 'react';
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
  cameraFov
}: {
  showMachines?: boolean;
  machines?: MachinePosition[];
  sections?: SectionLayout[];
  isOverview?: boolean;
  cameraPosition?: [number, number, number];
  cameraFov?: number;
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
    setDraggingActive
  } = useLineStore();

  const machineLayout = machinesOverride || storeMachineLayout;
  const sectionLayout = sectionsOverride || storeSectionLayout;

  const groupPivotRef = useRef<THREE.Group>(null);
  const lastPivotPos = useRef<THREE.Vector3 | null>(null);

  // Stable drag-centre — computed once when drag starts, not every frame
  const dragCenter = useMemo(() => {
    if (!isDraggingActive || selectedMachines.length === 0) return null;
    const selectedData = machineLayout.filter(m => selectedMachines.includes(m.id));
    if (selectedData.length === 0) return null;
    const avgX = selectedData.reduce((sum, m) => sum + m.position.x, 0) / selectedData.length;
    const avgZ = selectedData.reduce((sum, m) => sum + m.position.z, 0) / selectedData.length;
    return { x: avgX, z: avgZ, items: selectedData };
  }, [isDraggingActive, selectedMachines.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
          target={sceneCenter}
        />

        <Suspense fallback={null}>

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

                {/* ── Labels ── */}
                {isAssembly ? (
                  /* Assembly zones get TWO labels — one per lane */
                  (() => {
                    const [frontLabel, backLabel] = getAssemblyLaneLabels(section);
                    return (
                      <>
                        {/* Front lane label (negative-Z side of the zone) */}
                        <Text
                          position={[0, 0.02, -(section.width / 2 + 0.9)]}
                          rotation={[-Math.PI / 2, 0, 0]}
                          fontSize={0.8}
                          color="white"
                          anchorX="center"
                          anchorY="middle"
                          fontWeight="black"
                          fillOpacity={0.6}
                        >
                          {frontLabel}
                        </Text>
                        {/* Back lane label (positive-Z side of the zone) */}
                        <Text
                          position={[0, 0.02, section.width / 2 + 0.9]}
                          rotation={[-Math.PI / 2, 0, 0]}
                          fontSize={0.8}
                          color="white"
                          anchorX="center"
                          anchorY="middle"
                          fontWeight="black"
                          fillOpacity={0.6}
                        >
                          {backLabel}
                        </Text>
                      </>
                    );
                  })()
                ) : label ? (
                  /* All other labelled sections: single label on the outer edge */
                  <Text
                    position={[0, 0.02, labelZOffset]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    fontSize={0.8}
                    color="white"
                    anchorX="center"
                    anchorY="middle"
                    fontWeight="black"
                    fillOpacity={0.6}
                  >
                    {label}
                  </Text>
                ) : null}

                {/* ── Line-start marker (shown on the Cuff section only) ── */}
                {section.name.toLowerCase().includes('cuff') && (
                  <group position={[-section.length / 2 - 6, 0.02, 3]}>
                    <Text
                      rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
                      fontSize={1.8}
                      color="white"
                      fontWeight="black"
                      anchorX="center"
                      fillOpacity={0.4}
                    >
                      {/* e.g. "Line 2" extracted from "Line 2 Cuff" */}
                      {section.name.match(/^(Line\s+\d+)/i)?.[1] ?? ''}
                    </Text>
                  </group>
                )}

                {/* ── Line-end marker (shown on the Assembly CD section only) ── */}
                {section.name.toLowerCase().includes('assembly cd') && (
                  <group position={[section.length / 2 + 6, 0.02, -3]}>
                    <Text
                      rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
                      fontSize={1.8}
                      color="white"
                      fontWeight="black"
                      fillOpacity={0.4}
                    >
                      {section.name.match(/^(Line\s+\d+)/i)?.[1] ?? ''}
                    </Text>
                  </group>
                )}

              </group>
            );
          })}

          {/* ── Machines ── */}
          {showMachines && (
            <group>
              {machineLayout.map((machine) => {
                // Hide machines that are currently being dragged (shown in proxy instead)
                if (selectedMachines.includes(machine.id) && isDraggingActive) return null;
                return (
                  <Suspense key={`suspense-${machine.id}`} fallback={null}>
                    <Machine3D key={machine.id} machineData={machine} isOverview={isOverview} />
                  </Suspense>
                );
              })}
            </group>
          )}

          {/* ── Multi-machine drag proxy ── */}
          {showMachines &&
            selectedMachines.length > 0 &&
            isMoveMode &&
            isDraggingActive &&
            dragCenter && (
              <group position={[dragCenter.x, 0.05, dragCenter.z]}>
                <PivotControls
                  activeAxes={[true, false, true]}
                  depthTest={false}
                  scale={3}
                  onDragStart={() => {
                    setDraggingActive(true);
                    if (groupPivotRef.current) {
                      lastPivotPos.current = new THREE.Vector3();
                      groupPivotRef.current.getWorldPosition(lastPivotPos.current);
                    }
                  }}
                  onDrag={() => {
                    if (groupPivotRef.current && lastPivotPos.current) {
                      const currentPos = new THREE.Vector3();
                      groupPivotRef.current.getWorldPosition(currentPos);
                      const dx = currentPos.x - lastPivotPos.current.x;
                      const dz = currentPos.z - lastPivotPos.current.z;
                      if (Math.abs(dx) > 0.0001 || Math.abs(dz) > 0.0001) {
                        moveSelectedMachines(dx, dz);
                        lastPivotPos.current.copy(currentPos);
                      }
                    }
                  }}
                  onDragEnd={() => {
                    lastPivotPos.current = null;
                    updateMachinesPositions(selectedMachines);
                    setDraggingActive(false);
                  }}
                >
                  <group ref={groupPivotRef}>
                    {dragCenter.items.map(m => (
                      <Machine3D
                        key={`proxy-${m.id}`}
                        machineData={m}
                        relativePosition={{
                          x: m.position.x - dragCenter.x,
                          y: 0,
                          z: m.position.z - dragCenter.z
                        }}
                      />
                    ))}
                  </group>
                </PivotControls>
              </group>
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
