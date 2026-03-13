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
 * Main 3D scene container for the sewing line visualization
 */
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
    machineLayout: storeMachineLayout, sectionLayout: storeSectionLayout, selectedMachine, selectedMachines,
    isMoveMode, updateMachinesPositions, moveSelectedMachines,
    isDraggingActive, setDraggingActive
  } = useLineStore();

  const machineLayout = machinesOverride || storeMachineLayout;
  const sectionLayout = sectionsOverride || storeSectionLayout;

  const groupPivotRef = useRef<THREE.Group>(null);
  const lastPivotPos = useRef<THREE.Vector3 | null>(null);

  // Stable center for the handles during the drag session to prevent feedback loops
  const dragCenter = useMemo(() => {
    if (!isDraggingActive || selectedMachines.length === 0) return null;
    const selectedData = machineLayout.filter(m => selectedMachines.includes(m.id));
    if (selectedData.length === 0) return null;
    const avgX = selectedData.reduce((sum, m) => sum + m.position.x, 0) / selectedData.length;
    const avgZ = selectedData.reduce((sum, m) => sum + m.position.z, 0) / selectedData.length;
    return { x: avgX, z: avgZ, items: selectedData };
  }, [isDraggingActive, selectedMachines.length]);

  // Calculate the center of the factory floor to point the camera correctly
  const sceneCenter = useMemo(() => {
    if (!sectionLayout || sectionLayout.length === 0) return [0, 0, 0] as [number, number, number];

    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    sectionLayout.forEach(section => {
      const sMinX = section.position.x;
      const sMaxX = section.position.x + section.length;
      const sMinZ = section.position.z - section.width / 2;
      const sMaxZ = section.position.z + section.width / 2;

      minX = Math.min(minX, sMinX);
      maxX = Math.max(maxX, sMaxX);
      minZ = Math.min(minZ, sMinZ);
      maxZ = Math.max(maxZ, sMaxZ);
    });

    return [(minX + maxX) / 2, 0, (minZ + maxZ) / 2] as [number, number, number];
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
        onCreated={({ gl }) => {
          gl.setClearColor('#080a0f');
        }}
      >
        {/* Fog for depth effect */}
        <fog attach="fog" args={['#080a0f', 1000, 30000]} />

        {/* Lighting setup */}
        <SceneLighting />

        {/* Ground plane with grid */}
        <Ground />

        <CameraController machineLayout={machineLayout} selectedMachine={selectedMachine} target={sceneCenter} />

        <Suspense fallback={null}>
          {/* Dynamic Section Layout Boxes */}
          {sectionLayout?.map((section) => {
            const color = section.color || '#3b82f6';
            const centerX = section.position.x + section.length / 2;
            const centerZ = section.position.z;

            return (
              <group key={section.id} position={[centerX, 0.01, centerZ]} renderOrder={10}>
                {/* Section Floor Area */}
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[section.length, section.width]} />
                  <meshBasicMaterial
                    color={section.color || "#1e293b"} 
                    opacity={0.3}
                    transparent
                    polygonOffset
                    polygonOffsetFactor={-10}
                    polygonOffsetUnits={-10}
                    depthWrite={false}
                  />
                </mesh>

                {/* Section Border - Yellow for all zones */}
                <WideBorder length={section.length} width={section.width} color="#facc15" />

                {/* Section Label - Outside the zone, flat on ground */}
                {section.name.toLowerCase().includes('assembly') ? (
                  <>
                    <Text
                      position={[0, 0.02, -section.width / 2 - 0.8]}
                      rotation={[-Math.PI / 2, 0, 0]}
                      fontSize={0.8}
                      color="white"
                      anchorX="center"
                      anchorY="middle"
                      fontWeight="black"
                      fillOpacity={0.6}
                    >
                      {section.name.toLowerCase().includes('ab') ? "ASSEMBLY 1" : "ASSEMBLY 3"}
                    </Text>
                    <Text
                      position={[0, 0.02, section.width / 2 + 0.8]}
                      rotation={[-Math.PI / 2, 0, 0]}
                      fontSize={0.8}
                      color="white"
                      anchorX="center"
                      anchorY="middle"
                      fontWeight="black"
                      fillOpacity={0.6}
                    >
                      {section.name.toLowerCase().includes('ab') ? "ASSEMBLY 2" : "ASSEMBLY 4"}
                    </Text>
                  </>
                ) : (
                  <Text
                    position={[0, 0.02, centerZ < -3 ? (-section.width / 2 - 0.8) : (section.width / 2 + 0.8)]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    fontSize={0.8}
                    color="white"
                    anchorX="center"
                    anchorY="middle"
                    fontWeight="black"
                    fillOpacity={0.6}
                  >
                    {section.name
                      .replace(/Line \d+/gi, '')
                      .replace(/undefined/gi, '')
                      .replace(/cd/gi, '')
                      .trim()
                      .toUpperCase()}
                  </Text>
                )}

                {/* Line Start/End Markers - Grounded */}
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
                      {section.name.split(' ')[0] + ' ' + section.name.split(' ')[1]}
                    </Text>
                  </group>
                )}

                {section.name.toLowerCase().includes('assembly cd') && (
                  <group position={[section.length / 2 + 6, 0.02, -3]}>
                    <Text
                      rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
                      fontSize={1.8}
                      color="white"
                      fontWeight="black"
                      fillOpacity={0.4}
                    >
                      {section.name.split(' ')[0] + ' ' + section.name.split(' ')[1]}
                    </Text>
                  </group>
                )}
              </group>
            );
          })}

          {/* Machines */}
          {showMachines && (
            <group>
              {machineLayout.map((machine) => {
                if (selectedMachines.includes(machine.id) && isDraggingActive) return null;
                return (
                  <Suspense key={`suspense-${machine.id}`} fallback={null}>
                    <Machine3D key={machine.id} machineData={machine} isOverview={isOverview} />
                  </Suspense>
                );
              })}
            </group>
          )}

          {/* Multi-Selection Drag Proxy */}
          {showMachines && selectedMachines.length > 0 && isMoveMode && isDraggingActive && dragCenter && (
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

          {/* Camera controls included in the Canvas */}
        </Suspense>
      </Canvas>
    </div>
  );
};

const WideBorder = ({ length, width, thickness = 0.1, color = "#facc15" }: { length: number, width: number, thickness?: number, color?: string }) => (
  <group position={[0, 0.01, 0]}>
    <mesh position={[0, 0, -width / 2 - thickness / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[length + thickness * 2, thickness]} />
      <meshBasicMaterial color={color} />
    </mesh>
    <mesh position={[0, 0, width / 2 + thickness / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[length + thickness * 2, thickness]} />
      <meshBasicMaterial color={color} />
    </mesh>
    <mesh position={[-length / 2 - thickness / 2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[thickness, width]} />
      <meshBasicMaterial color={color} />
    </mesh>
    <mesh position={[length / 2 + thickness / 2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[thickness, width]} />
      <meshBasicMaterial color={color} />
    </mesh>
  </group>
);