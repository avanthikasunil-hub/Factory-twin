import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

/**
 * Animated ground plane with grid pattern and Lane Zones
 */
export const Ground = () => {
  const gridRef = useRef<THREE.GridHelper>(null);

  // Static opacity to prevent frame-sync flickering
  /*
  useFrame((state) => {
    if (gridRef.current) {
      gridRef.current.material.opacity = 0.15 + Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
    }
  });
  */

  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[10000, 10000]} />
        <meshStandardMaterial
          color="#1e293b"
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>

      {/* Grid helper - Uniform grid without highlighted axis */}
      <gridHelper
        ref={gridRef}
        args={[10000, 2000, '#334155', '#334155']}
        position={[0, -0.005, 0]}
      />

      {/* Lane Zones - Temporarily removed for better clarity of measured boxes */}
      {/* 
      <LaneZone label="Lane A" x={30} z={-5.2} color="#10b981" width={1.4} length={100} />
      <LaneZone label="Lane B" x={30} z={-6.8} color="#3b82f6" width={1.4} length={100} />
      <LaneZone label="Lane C" x={30} z={0.8} color="#f59e0b" width={1.4} length={100} />
      <LaneZone label="Lane D" x={30} z={-0.8} color="#ef4444" width={1.4} length={100} />
      */}
    </group>
  );
};

// Helper component for a Lane Zone
const LaneZone = ({ label, x, z, color, width, length }: { label: string, x: number, z: number, color: string, width: number, length: number }) => {
  return (
    <group position={[x, 0.015, z]}>
      {/* Zone Floor Strip */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[length, width]} />
        <meshStandardMaterial
          color={color}
          opacity={0.35}
          transparent
          emissive={color}
          emissiveIntensity={0.1}
        />
      </mesh>

      {/* Lane Label (Repeated) */}
      {Array.from({ length: Math.ceil(length / 20) }).map((_, i) => (
        <Text
          key={i}
          position={[-length / 2 + 10 + (i * 20), 0.1, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.5}
          color="#94a3b8" // Using a lighter color instead of opacity
          anchorX="center"
          anchorY="middle"
        >
          {label}
        </Text>
      ))}
    </group>
  );
};
