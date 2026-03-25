import React, { useMemo } from 'react';
import * as THREE from 'three';

/**
 * IronBox component 
 * Color: Standard Industrial Grey
 * Accessories: Power Wire (Cable)
 * Only appears on the primary helper table at the Finishing department entrance.
 */
export const IronBox: React.FC = () => {
    // 1. DIMENSIONS
    const L = 0.24;   // Length
    const B = 0.12;   // Breadth
    const H = 0.10;   // Height

    const ironElements = useMemo(() => {
        // 2. THE IRON BODY
        const ironShape = new THREE.Shape();
        ironShape.moveTo(-L/2, -B/2); 
        ironShape.lineTo(-L/2, B/2);  
        ironShape.bezierCurveTo(-L*0.1, B/2, L * 0.3, B * 0.2, L/2, 0); 
        ironShape.bezierCurveTo(L * 0.3, -B * 0.2, -L*0.1, -B/2, -L/2, -B/2);

        const extrudeSettings = {
            depth: H,           
            bevelEnabled: true, 
            bevelThickness: 0.005, 
            bevelSize: 0.005,
            curveSegments: 24
        };

        const geometry = new THREE.ExtrudeGeometry(ironShape, extrudeSettings);

        // 3. MATERIAL (Solid Neutral Industrial Grey)
        const material = new THREE.MeshStandardMaterial({
            color: '#b0b0b5',    // More neutral, lighter grey
            metalness: 0.4,      // Slightly less metallic for a more matte industrial feel
            roughness: 0.6      
        });

        // 4. POWER CABLE (WIRE)
        const cablePath = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(-L/2, 0.04, 0),       
            new THREE.Vector3(-L/2 - 0.2, 0.15, 0.1), 
            new THREE.Vector3(-L/2 - 0.5, -0.15, 0.05)   
        );
        const cableGeometry = new THREE.TubeGeometry(cablePath, 20, 0.006, 8, false);
        const cableMaterial = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 });

        return { geometry, material, cableGeometry, cableMaterial };
    }, [L, B, H]);

    return (
        <group position={[0, 0, 0]}>
            {/* The Iron Body */}
            <mesh 
                geometry={ironElements.geometry} 
                material={ironElements.material} 
                rotation={[-Math.PI / 2, 0, 0]} 
                castShadow 
                receiveShadow 
            />
            
            {/* Power Wire (Cable) */}
            <mesh geometry={ironElements.cableGeometry} material={ironElements.cableMaterial} />

            {/* Design Detail: Polished Steel base plate */}
            <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[L * 0.98, B * 0.98]} />
                <meshStandardMaterial color="#dddddd" metalness={1} roughness={0} />
            </mesh>
        </group>
    );
};
