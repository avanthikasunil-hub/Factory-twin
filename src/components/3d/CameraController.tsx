import { useRef, useState, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { MachinePosition } from '@/types';

interface CameraControllerProps {
  machineLayout: MachinePosition[];
  selectedMachine: MachinePosition | null;
  target?: [number, number, number];
  cameraPosition?: [number, number, number];
  cameraFov?: number;
}

export const CameraController = ({ 
  machineLayout, 
  selectedMachine, 
  target = [0, 0, 0],
  cameraPosition,
  cameraFov = 32
}: CameraControllerProps) => {
  const { camera } = useThree();
  const pCamera = camera as THREE.PerspectiveCamera;
  const controlsRef = useRef<any>(null);
  const isInteracting = useRef(false);
  const [goalPos, setGoalPos] = useState<[number, number, number] | null>(null);
  const [goalTarget, setGoalTarget] = useState<[number, number, number] | null>(null);

  // When props change, set new goals to move the camera
  useEffect(() => {
    if (cameraPosition) setGoalPos(cameraPosition);
  }, [cameraPosition?.join(',')]);

  useEffect(() => {
    if (target) setGoalTarget(target);
  }, [target?.join(',')]);
  
  // UseFrame for smooth cinematic interpolation
  useFrame((state, delta) => {
    // If user is interacting, clear any active goal to stop Fighting
    if (isInteracting.current) {
      if (goalPos) setGoalPos(null);
      if (goalTarget) setGoalTarget(null);
      return;
    }

    // 1. Move camera position smoothly if goal is set
    if (goalPos) {
      const targetVec = new THREE.Vector3(...goalPos);
      pCamera.position.lerp(targetVec, delta * 2.5);
      
      // Stop lerping when close enough
      if (pCamera.position.distanceTo(targetVec) < 0.1) {
        setGoalPos(null);
      }
    }

    // 2. Adjust FOV smoothly
    if (pCamera.fov !== cameraFov) {
        pCamera.fov = THREE.MathUtils.lerp(pCamera.fov, cameraFov, delta * 2.5);
        pCamera.updateProjectionMatrix();
    }

    // 3. Move orbit target smoothly if goal is set
    if (controlsRef.current && goalTarget) {
      const targetVec = new THREE.Vector3(...goalTarget);
      controlsRef.current.target.lerp(targetVec, delta * 3.5);
      controlsRef.current.update();

      // Stop lerping when close enough
      if (controlsRef.current.target.distanceTo(targetVec) < 0.1) {
        setGoalTarget(null);
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      zoomSpeed={0.5}
      rotateSpeed={1.0}
      panSpeed={1.5}
      minDistance={0.5}
      maxDistance={3000}
      maxPolarAngle={Math.PI / 2.2}
      onStart={() => { isInteracting.current = true; setGoalPos(null); setGoalTarget(null); }}
      onEnd={() => { isInteracting.current = false; }}
    />
  );
};
