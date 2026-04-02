import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

const FT = 0.3048;

interface AutoSpreaderProps {
    status?: 'idle' | 'spreading' | 'error';
    tableWidth?: number; // In feet
}

const AutoSpreader: React.FC<AutoSpreaderProps> = ({ 
    status = 'spreading', 
    tableWidth = 7,
}) => {
    const carriageRef = useRef<THREE.Group>(null);
    const fabricRef = useRef<THREE.Mesh>(null);

    // --- Materials ---
    const whiteMat = useMemo(() => new THREE.MeshStandardMaterial({ 
        color: '#f8fafc', 
        roughness: 0.1, 
        metalness: 0.05 
    }), []);
    
    const darkGreyMat = useMemo(() => new THREE.MeshStandardMaterial({ 
        color: '#1e293b', 
        roughness: 0.6 
    }), []);

    const chromeMat = useMemo(() => new THREE.MeshStandardMaterial({ 
        color: '#94a3b8', 
        metalness: 0.9, 
        roughness: 0.1 
    }), []);

    const fabricMat = useMemo(() => new THREE.MeshStandardMaterial({ 
        color: '#020617', // Very dark black
        roughness: 1.0 
    }), []);

    const yellowMat = useMemo(() => new THREE.MeshStandardMaterial({ 
        color: '#eab308', 
        roughness: 0.3 
    }), []);

    const hazardMat = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#fbbf24'; // Warning Yellow
            ctx.fillRect(0, 0, 64, 64);
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(32, 0); ctx.lineTo(64, 32); ctx.lineTo(64, 64); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(0, 32); ctx.lineTo(32, 64); ctx.lineTo(0, 64); ctx.fill();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(12, 1);
        return new THREE.MeshStandardMaterial({ map: texture });
    }, []);

    // --- Animation Logic ---
    useFrame((state) => {
        if (status === 'spreading' && carriageRef.current) {
            const t = state.clock.elapsedTime * 0.15; // Slowed down from 0.35
            carriageRef.current.position.x = (Math.sin(t) * 0.5 + 0.5) * (38 * FT);
            
            // Subtle fabric wave
            if (fabricRef.current) {
                fabricRef.current.position.y = 3.0 * FT + Math.sin(t * 2) * 0.02 * FT;
            }
        }
    });

    const wHalf = (tableWidth * FT) / 2;

    return (
        <group>
            {/* STATIC FABRIC ON THE TABLE BED (Sitting on the 3ft table surface) */}
            <mesh 
                ref={fabricRef}
                position={[19 * FT, 3.03 * FT, 0]} 
                receiveShadow 
                rotation={[-Math.PI / 2, 0, 0]} 
                material={fabricMat}
            >
                <planeGeometry args={[38 * FT, tableWidth * FT - 1.2 * FT]} />
            </mesh>

            {/* SERKON MTT1 CARRIAGE UNIT (Moving) */}
            <group ref={carriageRef} position={[0, 0, 0]}>
                
                {/* 1. LOWER CHASSIS & WHEELS */}
                <group position={[0, 3.0 * FT, 0]}>
                    <mesh material={darkGreyMat}>
                        <boxGeometry args={[5 * FT, 0.3 * FT, tableWidth * FT + 0.8 * FT]} />
                    </mesh>
                    {/* Carriage Wheels sitting on table rails */}
                    {[-2, 2].map(x => [-wHalf-0.3*FT, wHalf+0.3*FT].map(z => (
                        <mesh key={`${x}-${z}`} position={[x * FT, -0.2 * FT, z]} rotation={[Math.PI/2, 0, 0]}>
                            <cylinderGeometry args={[0.1 * FT, 0.1 * FT, 0.1 * FT]} />
                            <meshStandardMaterial color="#fff" />
                        </mesh>
                    )))}
                </group>

                {/* 2. MAIN HOUSING & CONSOLE (SINGLE SIDE CONTROL) - Streamlined for single appearance */}
                <group position={[0, 4.8 * FT, (wHalf + 0.4 * FT)]}>
                    <mesh material={whiteMat} castShadow>
                        <boxGeometry args={[4.5 * FT, 2 * FT, 0.8 * FT]} />
                    </mesh>
                    <Text
                        position={[1 * FT, 0.5 * FT, 0.42 * FT]}
                        fontSize={0.2 * FT}
                        color="white"
                        fontWeight="bold"
                    >
                        SERKON
                    </Text>
                    <Text
                        position={[-1.2 * FT, -0.6 * FT, 0.41 * FT]}
                        fontSize={0.18 * FT}
                        color="#475569"
                    >
                        MTT 1
                    </Text>
                </group>

                {/* Right Balance Pivot */}
                <group position={[0, 4.8 * FT, -(wHalf + 0.4 * FT)]}>
                    <mesh material={darkGreyMat}>
                        <boxGeometry args={[1.0 * FT, 1.8 * FT, 0.2 * FT]} />
                    </mesh>
                </group>

                {/* Left Side Only Features (Console Control) */}
                <group position={[2.5 * FT, 6.5 * FT, wHalf + 0.1 * FT]}>
                    <mesh rotation={[0, 0, 0.4]} material={darkGreyMat}>
                        <cylinderGeometry args={[0.03 * FT, 0.03 * FT, 1 * FT]} />
                    </mesh>
                    <mesh position={[0.3 * FT, 0.5 * FT, 0.1 * FT]} rotation={[0, -0.3, 0]} material={whiteMat}>
                        <boxGeometry args={[0.8 * FT, 0.6 * FT, 0.05 * FT]} />
                    </mesh>
                    <mesh position={[0.3 * FT, 0.5 * FT, 0.13 * FT]} rotation={[0, -0.3, 0]}>
                        <planeGeometry args={[0.7 * FT, 0.5 * FT]} />
                        <meshStandardMaterial color="#111" emissive="#1e293b" emissiveIntensity={0.5} />
                    </mesh>
                </group>

                {/* 3. BELT-DRIVEN CRADLE SYSTEM (Top Section - Lowered to 6.5ft peak) */}
                <group position={[0, 6.5 * FT, 0]}>
                    <mesh position={[-2 * FT, -1 * FT, 0]} rotation={[0, 0, 0.4]} material={whiteMat}>
                        <boxGeometry args={[1.5 * FT, 2.5 * FT, tableWidth * FT + 0.8 * FT]} />
                    </mesh>
                    <group position={[0, -0.5 * FT, 0]}>
                        <mesh material={chromeMat}>
                            <boxGeometry args={[4 * FT, 0.2 * FT, tableWidth * FT + 0.2 * FT]} />
                        </mesh>
                        {[-wHalf, wHalf].map(z => (
                            <mesh key={z} position={[0, 0.5 * FT, z]} material={whiteMat}>
                                <boxGeometry args={[4.2 * FT, 1 * FT, 0.1 * FT]} />
                            </mesh>
                        ))}
                    </group>
                    <mesh position={[-0.2 * FT, 0.8 * FT, 0]} rotation={[Math.PI/2, 0, 0]} material={fabricMat} castShadow>
                        <cylinderGeometry args={[0.8 * FT, 0.8 * FT, tableWidth * FT - 0.6 * FT]} />
                    </mesh>
                </group>

                {/* 4. FABRIC DELIVERY FLOW (Adjusted for 2.5ft height above table) */}
                <group position={[2.1 * FT, 4.8 * FT, 0]}>
                    {/* Top Feeder (From Roll) */}
                    <mesh position={[-1.8 * FT, 1.7 * FT, 0]} material={fabricMat}>
                        <boxGeometry args={[1 * FT, 0.02 * FT, tableWidth * FT - 0.8 * FT]} />
                    </mesh>
                    {/* Steep Slant to Table (Ending at y=4ft surface from 6.5ft peak) */}
                    <mesh position={[-0.4 * FT, -0.4 * FT, 0]} rotation={[0, 0, -0.85]} material={fabricMat} castShadow>
                        <boxGeometry args={[4.5 * FT, 0.02 * FT, tableWidth * FT - 0.8 * FT]} />
                    </mesh>
                    {/* Tension Rollers remain in place */}
                    {[0, -1].map(y => (
                        <mesh key={y} position={[0, y * FT, 0]} rotation={[Math.PI/2, 0, 0]} material={chromeMat}>
                            <cylinderGeometry args={[0.08 * FT, 0.08 * FT, tableWidth * FT - 0.6 * FT]} />
                        </mesh>
                    ))}
                </group>

                {/* SAFETY BAR & KNIFE HEAD */}
                <group position={[3.5 * FT, 4.2 * FT, 0]}>
                    <mesh material={hazardMat}>
                        <boxGeometry args={[0.25 * FT, 0.4 * FT, tableWidth * FT + 0.6 * FT]} />
                    </mesh>
                    <mesh position={[0, 0.25 * FT, -wHalf + 1 * FT]} material={yellowMat}>
                        <boxGeometry args={[0.4 * FT, 0.5 * FT, 0.3 * FT]} />
                    </mesh>
                    {[-1, 1].map(side => (
                        <mesh key={side} position={[-0.5 * FT, 0, side * wHalf]} material={chromeMat}>
                            <boxGeometry args={[1 * FT, 0.1 * FT, 0.1 * FT]} />
                        </mesh>
                    ))}
                </group>

                {/* 5. OPERATOR STEP PLATFORM */}
                <group position={[0, 1.3 * FT, wHalf + 1.2 * FT]}>
                    <mesh position={[0, 2 * FT, -0.6 * FT]} material={darkGreyMat}>
                        <boxGeometry args={[2.5 * FT, 4 * FT, 0.15 * FT]} />
                    </mesh>
                    <group position={[0, 0.1 * FT, 0]}>
                        <mesh material={darkGreyMat}>
                            <boxGeometry args={[2 * FT, 0.2 * FT, 1.8 * FT]} />
                        </mesh>
                        {Array.from({length: 8}).map((_, i) => Array.from({length: 6}).map((__, j) => (
                            <mesh key={`${i}-${j}`} position={[(-1 + i*0.25)*FT, 0.11*FT, (-0.8 + j*0.3)*FT]} rotation={[0, Math.PI/4, 0]}>
                                <boxGeometry args={[0.05*FT, 0.02*FT, 0.12*FT]} />
                                <meshStandardMaterial color="#444" />
                            </mesh>
                        )))}
                    </group>
                    {[-1, 1].map(x => (
                        <mesh key={x} position={[x * FT, -1.2 * FT, -0.5 * FT]} rotation={[Math.PI/2, 0, 0]} material={ yellowMat }>
                            <cylinderGeometry args={[0.1 * FT, 0.1 * FT, 0.1 * FT]} />
                        </mesh>
                    ))}
                </group>

                {/* 6. MECHANICAL DETAILS (Hoses/Cables) */}
                <group position={[0, 5 * FT, wHalf + 0.1 * FT]}>
                    {[-0.2, 0, 0.2].map(x => (
                        <mesh key={x} position={[x * FT, 0, 0]}>
                            <cylinderGeometry args={[0.02 * FT, 0.02 * FT, 3 * FT]} />
                            <meshStandardMaterial color="#111" />
                        </mesh>
                    ))}
                </group>

            </group>
        </group>
    );
};

export default AutoSpreader;
