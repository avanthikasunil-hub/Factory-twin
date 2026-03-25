import React, { useMemo } from 'react';
import * as THREE from 'three';

interface SpotWashBoxProps {
  width?: number;
  height?: number;
  depth?: number;
}

export const SpotWashBox: React.FC<SpotWashBoxProps> = ({ 
    width = 1.5, 
    height = 1.5, 
    depth = 2.13 
}) => {
  const thickness = 0.05;

  const geometries = useMemo(() => {
    return {
        mainBody: new THREE.BoxGeometry(width, height, depth),
        windowGlass: new THREE.BoxGeometry(width * 0.8, height * 0.4, 0.01),
        base: new THREE.BoxGeometry(width * 1.05, 0.1, depth * 1.05)
    };
  }, [width, height, depth]);

  const materials = useMemo(() => {
    return {
      body: new THREE.MeshStandardMaterial({ 
        color: 0xfafafa, 
        roughness: 0.2, 
        metalness: 0.8,
        envMapIntensity: 1
      }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transmission: 1.0,
        thickness: 0.01,
        roughness: 0,
        transparent: true,
        opacity: 0.2
      })
    };
  }, []);

  return (
    <group>
      {/* Main Enclosure - Off white metallic */}
      <mesh position={[0, height / 2, 0]} geometry={geometries.mainBody} material={materials.body} receiveShadow />
      
      {/* Base/Stand */}
      <mesh position={[0, 0.05, 0]} geometry={geometries.base} material={materials.body} />

      {/* Observation Window (Front) */}
      <mesh position={[width / 2 + 0.01, height * 0.7, 0]} rotation={[0, Math.PI / 2, 0]} geometry={geometries.windowGlass} material={materials.glass} />
      
      {/* Observation Window (Back) */}
      <mesh position={[-width / 2 - 0.01, height * 0.7, 0]} rotation={[0, Math.PI / 2, 0]} geometry={geometries.windowGlass} material={materials.glass} />

      {/* Vents / Panel details - Lighter grey */}
      {[0, 1, 2].map(i => (
        <mesh key={i} position={[0, height * 0.2 + (i * 0.1), depth/2 + 0.015]} rotation={[0, 0, 0]}>
            <boxGeometry args={[width * 0.7, 0.02, 0.02]} />
            <meshStandardMaterial color={0xcccccc} />
        </mesh>
      ))}
    </group>
  );
};
