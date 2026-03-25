import React, { useMemo } from 'react';
import * as THREE from 'three';

interface Cabin3DProps {
  width?: number;
  height?: number;
  depth?: number;
}

export const Cabin3D: React.FC<Cabin3DProps> = ({ 
    width = 2, 
    height = 2.13, 
    depth = 2 
}) => {
  const thickness = 0.05;
  const doorWidth = 0.8;

  const geometries = useMemo(() => {
    return {
        pillar: new THREE.BoxGeometry(thickness, height, thickness),
        sidePanel: new THREE.BoxGeometry(width, height / 2, 0.02),
        sideGlass: new THREE.BoxGeometry(width, height / 2, 0.01),
        // Split panels for wall with door
        doorPanel: new THREE.BoxGeometry((width - doorWidth) / 2, height / 2, 0.02),
        doorGlass: new THREE.BoxGeometry((width - doorWidth) / 2, height / 2, 0.01),
        doorLeaf: new THREE.BoxGeometry(doorWidth, height * 0.9, 0.01),
        doorHandle: new THREE.CylinderGeometry(0.01, 0.01, 0.2, 8)
    };
  }, [width, height, thickness]);

  const materials = useMemo(() => {
    return {
      frame: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.2, metalness: 0.8 }),
      panel: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transmission: 1.0, 
        thickness: 0.01, 
        roughness: 0, 
        transparent: true,
        opacity: 0.15,
        metalness: 0,
        ior: 1.1 
      }),
      handle: new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9 })
    };
  }, []);

  const pillars = [
    [-width / 2, height / 2, -depth / 2],
    [width / 2, height / 2, -depth / 2],
    [-width / 2, height / 2, depth / 2],
    [width / 2, height / 2, depth / 2]
  ];

  return (
    <group>
      {/* Interior Light */}
      <pointLight position={[0, height - 0.2, 0]} intensity={1.5} distance={5} color="#ffffff" castShadow />
      <rectAreaLight position={[0, height - 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} width={width} height={depth} intensity={1} color="#ffffff" />

      {/* Pillars */}
      {pillars.map((pos, i) => (
        <mesh key={`pillar-${i}`} position={pos as any} geometry={geometries.pillar} material={materials.frame} castShadow />
      ))}

      {/* FRONT PANEL (FULL) */}
      <mesh position={[0, height / 4, depth / 2]} geometry={geometries.sidePanel} material={materials.panel} castShadow />
      <mesh position={[0, (height * 3) / 4, depth / 2]} geometry={geometries.sideGlass} material={materials.glass} />

      {/* SIDE PANELS (LEFT & RIGHT) */}
      <mesh position={[width / 2, height / 4, 0]} rotation={[0, Math.PI / 2, 0]} geometry={geometries.sidePanel} material={materials.panel} castShadow />
      <mesh position={[width / 2, (height * 3) / 4, 0]} rotation={[0, Math.PI / 2, 0]} geometry={geometries.sideGlass} material={materials.glass} />
      
      <mesh position={[-width / 2, height / 4, 0]} rotation={[0, Math.PI / 2, 0]} geometry={geometries.sidePanel} material={materials.panel} castShadow />
      <mesh position={[-width / 2, (height * 3) / 4, 0]} rotation={[0, Math.PI / 2, 0]} geometry={geometries.sideGlass} material={materials.glass} />

      {/* REAR PANEL (WITH DOOR OPENING) */}
      <mesh position={[(-width / 2 + (width - doorWidth) / 4), height / 4, -depth / 2]} geometry={geometries.doorPanel} material={materials.panel} />
      <mesh position={[(-width / 2 + (width - doorWidth) / 4), (height * 3) / 4, -depth / 2]} geometry={geometries.doorGlass} material={materials.glass} />

      <mesh position={[(width / 2 - (width - doorWidth) / 4), height / 4, -depth / 2]} geometry={geometries.doorPanel} material={materials.panel} />
      <mesh position={[(width / 2 - (width - doorWidth) / 4), (height * 3) / 4, -depth / 2]} geometry={geometries.doorGlass} material={materials.glass} />

      {/* THE DOOR (Leaf) - CLOSED - OFFSET by 0.015 TO PREVENT TWINKLING (Z-fighting) */}
      <group position={[doorWidth / 2, 0, -depth / 2 - 0.015]} rotation={[0, 0, 0]}>
        <mesh position={[-doorWidth / 2, height * 0.45, 0]} geometry={geometries.doorLeaf} material={materials.glass} />
        <mesh position={[-doorWidth / 2, height * 0.9, 0]}>
            <boxGeometry args={[doorWidth, 0.05, 0.02]} />
            <meshStandardMaterial color={0x888888} />
        </mesh>
        <mesh position={[-doorWidth / 2, 0, 0]}>
            <boxGeometry args={[doorWidth, 0.05, 0.02]} />
            <meshStandardMaterial color={0x888888} />
        </mesh>
        <mesh position={[0, height * 0.45, 0]}>
            <boxGeometry args={[0.05, height * 0.9, 0.02]} />
            <meshStandardMaterial color={0x888888} />
        </mesh>
        <mesh position={[-doorWidth, height * 0.45, 0]}>
            <boxGeometry args={[0.05, height * 0.9, 0.02]} />
            <meshStandardMaterial color={0x888888} />
        </mesh>
        <mesh position={[-0.05, height * 0.45, -0.01]} geometry={geometries.doorHandle} material={materials.handle} />
      </group>
      
      {/* Roof */}
      <mesh position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[width + thickness*2, depth + thickness*2, 0.02]} />
        <meshStandardMaterial color={0xfafafa} roughness={0.5} />
      </mesh>
    </group>
  );
};
