import { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import * as THREE from 'three';
import type { MachinePosition } from '@/types';

interface CameraControllerProps {
  machineLayout: MachinePosition[];
  selectedMachine: MachinePosition | null;
  target?: [number, number, number];
}

/**
 * Camera controller with MapControls for RTS-style navigation
 */
export const CameraController = ({ machineLayout, selectedMachine, target = [0, 0, 0] }: CameraControllerProps) => {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  return (
    <MapControls
      ref={controlsRef}
      makeDefault
      target={new THREE.Vector3(...target)}
      enableDamping
      dampingFactor={0.1}
      zoomSpeed={0.5}
      rotateSpeed={1.0}
      panSpeed={1.5}
      minDistance={0.5}
      maxDistance={3000}
      screenSpacePanning={false}
      maxPolarAngle={Math.PI / 2.2}
    />
  );
};
