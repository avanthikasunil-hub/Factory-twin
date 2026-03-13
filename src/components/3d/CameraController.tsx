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
 * Camera controller with MapControls for RTS-style navigation.
 * The scene centre is applied ONCE on mount only — after that the user
 * has full free control over pan/orbit without automatic re-centering.
 */
export const CameraController = ({ machineLayout, selectedMachine, target = [0, 0, 0] }: CameraControllerProps) => {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const initialised = useRef(false);

  // Apply the scene centre as the orbit target only the first time the
  // controls become available and a meaningful target is known.
  useEffect(() => {
    if (!controlsRef.current || initialised.current) return;
    // Only initialise once the target is not the default [0,0,0]
    if (target[0] !== 0 || target[1] !== 0 || target[2] !== 0) {
      controlsRef.current.target.set(...target);
      controlsRef.current.update();
      initialised.current = true;
    }
  }, [target]);

  return (
    <MapControls
      ref={controlsRef}
      makeDefault
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
