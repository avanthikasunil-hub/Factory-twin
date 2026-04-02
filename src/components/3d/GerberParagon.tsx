import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';

const FT = 0.3048;

interface GerberParagonProps {
    tableLength?: number;
    tableWidth?: number;
    tableOnly?: boolean;
    spreadingLength?: number;
    operatorOnFarSide?: boolean;
}

export const GerberParagon: React.FC<GerberParagonProps> = ({
    tableOnly = false,
    tableWidth = 7.1,
    spreadingLength = 33.9,
    operatorOnFarSide = false
}) => {
    // Exact Machine Footprint Parameters
    const tableLength = 17.0; // 17.0 ft total length
    const FT = 0.3048; // 1 Foot in meters
    const gantryRef = useRef<THREE.Group>(null);
    const headRef = useRef<THREE.Group>(null);
    const cutState = useRef({
        targetX: 0,
        targetZ: 0,
        startX: 0,
        startZ: 0,
        startTime: 0,
        duration: 0.1
    });

    // --- High Realism Materials ---
    const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#cbd5e1', // Lighter Industrial Grey
        roughness: 0.3,
        metalness: 0.5
    }), []);

    const metalMat = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#94a3b8',
        metalness: 0.9,
        roughness: 0.1
    }), []);

    const screenTexture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 384;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, 512, 384);
            // Header
            ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, 512, 40);
            ctx.fillStyle = '#ffffff'; ctx.font = '16px bold sans-serif'; ctx.fillText('NESTING LAYOUT - ACTIVE', 20, 26);

            // NESTING LAYOUT (Colorful garment pieces)
            const colors = ['#ef4444', '#22c55e', '#3b82f6', '#eab308', '#ec4899', '#8b5cf6'];
            for (let i = 0; i < 40; i++) {
                ctx.fillStyle = colors[i % colors.length];
                const x = 50 + (i % 8) * 50;
                const y = 60 + Math.floor(i / 8) * 60;
                ctx.fillRect(x + Math.sin(i) * 10, y + Math.cos(i) * 10, 30, 40);
            }
            // Footer status
            ctx.fillStyle = '#22c55e'; ctx.fillRect(400, 350, 80, 20);
        }
        return new THREE.CanvasTexture(canvas);
    }, []);

    const screenMat = useMemo(() => new THREE.MeshStandardMaterial({
        map: screenTexture,
        emissive: '#ffffff',
        emissiveIntensity: 0.1,
        roughness: 0.1
    }), [screenTexture]);

    const trayMat = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#78350f', // Wooden/Brown Tray
        roughness: 0.8
    }), []);

    const fabricMat = useMemo(() => {
        const mat = new THREE.MeshStandardMaterial({
            color: '#cbd5e1',
            transparent: true,
            opacity: 0.9,
            roughness: 0.9,
            metalness: 0.05
        });
        // Create fabric texture
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#cbd5e1'; ctx.fillRect(0, 0, 64, 64);
            for (let i = 0; i < 200; i++) {
                ctx.fillStyle = 'rgba(0,0,0,0.05)';
                ctx.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
            }
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(10, 10);
        mat.map = tex;
        return mat;
    }, []);

    const gunmetalMat = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#475569',
        metalness: 0.8,
        roughness: 0.4
    }), []);

    const plasticWrapMat = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.25,
        metalness: 0.6,
        roughness: 0.05
    }), []);

    const cardboardCoreMat = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#78350f',
        roughness: 0.9
    }), []);

    const conveyerMat = useMemo(() => {
        const mat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.9 });
        const canvas = document.createElement('canvas');
        canvas.width = 16; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, 16, 128);
            ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, 0, 16, 2);
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1, 40);
        mat.map = tex;
        return mat;
    }, []);

    // Gantry & Head Animation Loop
    useFrame((state) => {
        if (tableOnly || !gantryRef.current || !headRef.current) return;
        const time = state.clock.getElapsedTime();

        // 1. Slow overall base progression down the bed length
        const baseProgressionX = Math.sin(time * 0.05) * (tableLength * FT / 2 - 3 * FT);

        // 2. Procedural Block-Cutting Logic (Constantly changing, never repeats)
        const s = cutState.current;
        if (time - s.startTime > s.duration) {
            // Move current to start
            s.startX = s.targetX;
            s.startZ = s.targetZ;
            s.startTime = time;

            // 75% chance to do a straight geometric cut, 25% chance to pause/pivot
            if (Math.random() < 0.75) {
                s.duration = 1.0 + Math.random() * 2.0; // Cut takes 1-3 seconds

                // Pick ONE axis to cut along to maintain strict 90-degree blocky corners
                if (Math.random() < 0.5) {
                    // Cut along X axis (up/down bed locally)
                    s.targetX = (Math.random() - 0.5) * 3 * FT; // Random local span limit
                    s.targetZ = s.startZ;
                } else {
                    // Cut along Z axis (across width)
                    s.targetX = s.startX;
                    s.targetZ = (Math.random() - 0.5) * (tableWidth * FT - 2 * FT);
                }
            } else {
                // Pause for 0.5 to 1 seconds (Blade lifting / turning corner)
                s.duration = 0.5 + Math.random() * 0.5;
                s.targetX = s.startX;
                s.targetZ = s.startZ;
            }
        }

        // Interpolate exactly between points linearly to simulate blocky machine movement
        const progress = Math.min((time - s.startTime) / s.duration, 1);
        const localX = THREE.MathUtils.lerp(s.startX, s.targetX, progress);
        const localZ = THREE.MathUtils.lerp(s.startZ, s.targetZ, progress);

        // Apply combined translation
        gantryRef.current.position.x = baseProgressionX + localX;
        headRef.current.position.z = localZ;
    });

    return (
        <group>
            {/* 1. LAYERED BODY PANELS */}
            {!tableOnly && (
                <group position={[0, 1.45 * FT, 0]}>
                    {/* ... body details ... */}
                    {[-1, 0, 1].map((i) => (
                        <mesh key={i} position={[i * (tableLength * FT / 3), 0, 0]} material={bodyMat} castShadow>
                            <boxGeometry args={[tableLength * FT / 3 - 0.02, 2.9 * FT, tableWidth * FT]} />
                            <mesh position={[0, -0.4, tableWidth * FT / 2 + 0.01]}><boxGeometry args={[tableLength * FT / 3, 0.02, 0.01]} /><meshStandardMaterial color="#334155" /></mesh>
                        </mesh>
                    ))}
                    <group position={[0, -0.2, 0]}>
                        <Text position={[0, 0, tableWidth * FT / 2 + 0.18 * FT]} rotation={[0, 0, 0]} fontSize={0.45 * FT} color="#1e293b" fontWeight="bold">GERBER CUTTER</Text>
                        <Text position={[0, 0, -tableWidth * FT / 2 - 0.18 * FT]} rotation={[0, Math.PI, 0]} fontSize={0.45 * FT} color="#1e293b" fontWeight="bold">GERBER CUTTER</Text>
                    </group>
                </group>
            )}

            {/* 2. CONVEYOR BED & BORDERS */}
            {!tableOnly && (
                <group position={[0, 2.95 * FT, 0]}>
                    <mesh material={conveyerMat} receiveShadow>
                        <boxGeometry args={[tableLength * FT, 0.1 * FT, tableWidth * FT - 0.1]} />
                    </mesh>
                    {/* GREY BED END BORDERS */}
                    <mesh position={[tableLength * FT / 2, 0, 0]} material={gunmetalMat}>
                        <boxGeometry args={[0.2 * FT, 0.2 * FT, tableWidth * FT]} />
                    </mesh>
                    <mesh position={[-tableLength * FT / 2, 0, 0]} material={gunmetalMat}>
                        <boxGeometry args={[0.2 * FT, 0.2 * FT, tableWidth * FT]} />
                    </mesh>
                </group>
            )}

            {/* 3. HARDWARE TRACKS (Low Profile Gunmetal) */}
            {!tableOnly && (
                <>
                    {/* Left Track (Flat Profile) */}
                    <mesh position={[0, 3.0 * FT, tableWidth * FT / 2 - 0.2]} material={gunmetalMat}>
                        <boxGeometry args={[tableLength * FT, 0.02 * FT, 0.25 * FT]} />
                    </mesh>
                    {/* Right Track (Flat Profile) */}
                    <mesh position={[0, 3.0 * FT, -tableWidth * FT / 2 + 0.2]} material={gunmetalMat}>
                        <boxGeometry args={[tableLength * FT, 0.02 * FT, 0.25 * FT]} />
                    </mesh>
                </>
            )}

            {/* 4. OPERATOR CONSOLE (Physically Connected to Machine) */}
            {!tableOnly && (
                <group
                    position={[-2 * FT, 3.1 * FT, operatorOnFarSide ? -(tableWidth * FT / 2 + 0.8 * FT) : (tableWidth * FT / 2 + 0.8 * FT)]}
                    rotation={[0, operatorOnFarSide ? Math.PI : 0, 0]}
                >
                    {/* ... console details ... */}
                    <mesh position={[0, 0.4 * FT, -0.4 * FT]} material={gunmetalMat}><boxGeometry args={[0.2 * FT, 0.2 * FT, 0.8 * FT]} /></mesh>
                    <mesh position={[0, -0.35 * FT, 0]} material={bodyMat}><cylinderGeometry args={[0.08 * FT, 0.1 * FT, 5.5 * FT, 8]} /></mesh>
                    <group position={[0, 1.35 * FT, 0.1 * FT]}>
                        <mesh material={gunmetalMat}><boxGeometry args={[0.4 * FT, 0.3 * FT, 0.1 * FT]} /></mesh>
                        <mesh position={[-0.1 * FT, 0, 0.06 * FT]} material={new THREE.MeshStandardMaterial({ color: '#22c55e', emissive: '#22c55e', emissiveIntensity: 2 })}><sphereGeometry args={[0.03 * FT]} /></mesh>
                        <mesh position={[0.1 * FT, 0, 0.06 * FT]} rotation={[Math.PI / 2, 0, 0]} material={new THREE.MeshStandardMaterial({ color: '#1e293b' })}><cylinderGeometry args={[0.03 * FT, 0.03 * FT, 0.02 * FT]} /></mesh>
                    </group>
                    <group position={[0, 1.3 * FT, 0.35 * FT]}>
                        <mesh material={trayMat}><boxGeometry args={[2.2 * FT, 0.04 * FT, 0.8 * FT]} /></mesh>
                        <mesh position={[1.05 * FT, 0.05 * FT, 0]} rotation={[0, 0, 0.2]} material={trayMat}><boxGeometry args={[0.12 * FT, 0.25 * FT, 0.8 * FT]} /></mesh>
                        <mesh position={[-1.05 * FT, 0.05 * FT, 0]} rotation={[0, 0, -0.2]} material={trayMat}><boxGeometry args={[0.12 * FT, 0.25 * FT, 0.8 * FT]} /></mesh>
                        <mesh position={[0, 0.04 * FT, 0.05 * FT]} material={new THREE.MeshStandardMaterial({ color: '#111827' })}><boxGeometry args={[1.2 * FT, 0.02 * FT, 0.35 * FT]} /></mesh>
                        <mesh position={[0.7 * FT, 0.04 * FT, 0.15 * FT]} material={new THREE.MeshStandardMaterial({ color: '#1f2937' })}><sphereGeometry args={[0.04 * FT]} /></mesh>
                    </group>
                    <mesh position={[0, 2.3 * FT, 0.1 * FT]} material={gunmetalMat}><boxGeometry args={[0.1 * FT, 1.2 * FT, 0.1 * FT]} /></mesh>
                    <mesh position={[0, 3.25 * FT, 0.2 * FT]} rotation={[-0.1, 0, 0]} material={bodyMat}><boxGeometry args={[2.0 * FT, 1.5 * FT, 0.08 * FT]} /></mesh>
                    <mesh position={[0, 3.25 * FT, 0.26 * FT]} rotation={[-0.1, 0, 0]} material={screenMat}><planeGeometry args={[1.9 * FT, 1.4 * FT]} /></mesh>
                </group>
            )}

            {/* 6. REALISTIC FABRIC ROLLS & FDM UNIT */}
            {!tableOnly && (
                <>
                    {/* FDM SUPPORT UNIT */}
                    <group position={[-tableLength * FT / 2 + 1.5 * FT, 0, tableWidth * FT / 2 + 1 * FT]}>
                        {/* ... FDM details ... */}
                        <mesh position={[0, 0.1 * FT, 0]} material={bodyMat}><cylinderGeometry args={[0.6 * FT, 0.6 * FT, 0.2 * FT]} /></mesh>
                        <mesh position={[0, 0.7 * FT, 0]} material={new THREE.MeshStandardMaterial({ color: '#bfdbfe', emissive: '#60a5fa', emissiveIntensity: 2 })}><cylinderGeometry args={[0.5 * FT, 0.45 * FT, 1.0 * FT]} /></mesh>
                        <mesh position={[0, 3.95 * FT, 0]} material={new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.3, metalness: 0.5 })}><cylinderGeometry args={[0.5 * FT, 0.5 * FT, 5.5 * FT]} /></mesh>
                        <mesh position={[0, 7.2 * FT, 0]} material={new THREE.MeshStandardMaterial({ color: '#bfdbfe', emissive: '#60a5fa', emissiveIntensity: 2 })}><cylinderGeometry args={[0.45 * FT, 0.5 * FT, 1.0 * FT]} /></mesh>
                        <group position={[0, 7.85 * FT, 0]}>
                            <mesh material={gunmetalMat}><cylinderGeometry args={[0.1 * FT, 0.1 * FT, 0.3 * FT]} /></mesh>
                            <mesh position={[0, 0.15 * FT, 0]} rotation={[0, 0, Math.PI / 2]} material={gunmetalMat}><cylinderGeometry args={[0.1 * FT, 0.1 * FT, 0.8 * FT]} /></mesh>
                        </group>
                    </group>

                    {/* Back Horizontal Feed Roll */}
                    <group position={[tableLength * FT / 2 + 0.5 * FT, 5.1 * FT, 0]} rotation={[Math.PI / 2, 0, 0]}>
                        <mesh material={metalMat}><cylinderGeometry args={[0.05 * FT, 0.05 * FT, tableWidth * FT + 1 * FT]} /></mesh>
                        <mesh material={cardboardCoreMat}><cylinderGeometry args={[0.1 * FT, 0.1 * FT, tableWidth * FT + 0.1 * FT]} /></mesh>
                        <mesh material={new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.9 })}><cylinderGeometry args={[0.25 * FT, 0.25 * FT, tableWidth * FT]} /></mesh>
                        <mesh material={new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.1 })}><cylinderGeometry args={[0.28 * FT, 0.28 * FT, tableWidth * FT + 0.05 * FT]} /></mesh>
                        {[-1, 1].map(side => (
                            <mesh key={side} position={[0, side * (tableWidth * FT / 2 + 0.2 * FT), 0.575 * FT]}>
                                <boxGeometry args={[0.1 * FT, 0.1 * FT, 1.15 * FT]} />
                                <meshStandardMaterial color="#334155" />
                            </mesh>
                        ))}
                    </group>
                </>
            )}

            {/* 7. MOVING GANTRY (Matching Factory Image) */}
            {!tableOnly && (
                <group ref={gantryRef} position={[0, 3.1 * FT, 0]}>
                    {/* Bridge Beam (Industrial Rectangular Profile) */}
                    <mesh material={gunmetalMat} castShadow>
                        <boxGeometry args={[0.35 * FT, 0.3 * FT, tableWidth * FT + 0.5 * FT]} />
                    </mesh>

                    {/* SLEEK GANTRY SUPPORTS (Both Ends) */}
                    {[1, -1].map((side) => (
                        <group key={side} position={[0, -0.1 * FT, side * (tableWidth * FT / 2 + 0.05 * FT)]}>
                            <mesh material={gunmetalMat}>
                                <boxGeometry args={[0.2 * FT, 0.6 * FT, 0.1 * FT]} />
                            </mesh>
                        </group>
                    ))}

                    {/* Actual Cutting Head (Refined "Curved Box" Housing) */}
                    <group ref={headRef} position={[0, 0.4 * FT, 0]}>
                        {/* Main Wide Housing (Chunky Curved Box) */}
                        <group>
                            <mesh material={bodyMat} castShadow>
                                <boxGeometry args={[1.0 * FT, 0.9 * FT, 1.4 * FT]} />
                            </mesh>
                            {/* Seam line */}
                            <mesh position={[0, 0, 0.01]} material={gunmetalMat}>
                                <boxGeometry args={[0.02 * FT, 0.9 * FT, 1.41 * FT]} />
                            </mesh>
                        </group>

                        {/* Machine Top (Flat Sleek Design - No Domes) */}
                        <mesh position={[0, 0.45 * FT, 0]} material={bodyMat} castShadow>
                            <boxGeometry args={[1.05 * FT, 0.15 * FT, 1.45 * FT]} />
                        </mesh>

                        {/* WARNING LABELS */}
                        <mesh position={[0.51 * FT, 0.1 * FT, 0.3 * FT]} rotation={[0, Math.PI / 2, 0]}>
                            <planeGeometry args={[0.25 * FT, 0.15 * FT]} />
                            <meshBasicMaterial color="#facc15" />
                        </mesh>
                        <mesh position={[0.51 * FT, 0.1 * FT, -0.3 * FT]} rotation={[0, Math.PI / 2, 0]}>
                            <planeGeometry args={[0.25 * FT, 0.15 * FT]} />
                            <meshBasicMaterial color="#facc15" />
                        </mesh>

                        {/* Internal Knife/Head Assembly */}
                        <mesh position={[0, -0.6 * FT, 0]} material={gunmetalMat}>
                            <cylinderGeometry args={[0.06 * FT, 0.02 * FT, 0.6 * FT]} />
                        </mesh>
                    </group>
                </group>
            )}

            {/* 8. INTEGRATED SPREADING TABLE (Only if spreadingLength > 0) */}
            {spreadingLength > 0 && (
                <group position={[-tableLength * FT / 2 - (spreadingLength * FT / 2) + 0.1 * FT, 0, 0]}>
                    {/* Spreading Table Legs & Underbed (Normal Metal Table Structure) */}
                    <group position={[0, 1.45 * FT, 0]}>
                        {/* Generate leg pairs every 5.5ft along the spreading length */}
                        {Array.from({ length: Math.ceil(spreadingLength / 5.5) + 1 }).map((_, i, arr) => {
                            const segmentWidth = (spreadingLength - 0.5) * FT / (arr.length - 1);
                            const posX = (i - (arr.length - 1) / 2) * segmentWidth;
                            return (
                                <group key={i} position={[posX, 0, 0]}>
                                    {/* Front Leg */}
                                    <mesh position={[0, 0, tableWidth * FT / 2 - 0.1 * FT]} material={new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 })} castShadow>
                                        <boxGeometry args={[0.2 * FT, 2.9 * FT, 0.2 * FT]} />
                                    </mesh>
                                    {/* Back Leg */}
                                    <mesh position={[0, 0, -tableWidth * FT / 2 + 0.1 * FT]} material={new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 })} castShadow>
                                        <boxGeometry args={[0.2 * FT, 2.9 * FT, 0.2 * FT]} />
                                    </mesh>
                                    {/* Lower Crossbar (Underbed lateral) */}
                                    <mesh position={[0, -1.5 * FT, 0]} material={new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 })}>
                                        <boxGeometry args={[0.1 * FT, 0.1 * FT, tableWidth * FT - 0.4 * FT]} />
                                    </mesh>
                                </group>
                            );
                        })}
                    </group>

                    {/* Long horizontal underbed framing (connecting the legs lengthwise) */}
                    <group position={[0, 0.45 * FT, 0]}>
                        <mesh position={[0, 0, tableWidth * FT / 2 - 0.1 * FT]} material={new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 })}>
                            <boxGeometry args={[spreadingLength * FT, 0.1 * FT, 0.1 * FT]} />
                        </mesh>
                        <mesh position={[0, 0, -tableWidth * FT / 2 + 0.1 * FT]} material={new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 })}>
                            <boxGeometry args={[spreadingLength * FT, 0.1 * FT, 0.1 * FT]} />
                        </mesh>
                        {/* Solid Under-Shelf for Storage */}
                        <mesh position={[0, 0, 0]} material={new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 })} receiveShadow castShadow>
                            <boxGeometry args={[spreadingLength * FT, 0.05 * FT, tableWidth * FT - 0.2 * FT]} />
                        </mesh>
                    </group>

                    {/* Spreading Table Surface (Full White, No Borders) */}
                    <group position={[0, 2.95 * FT, 0]}>
                        <mesh receiveShadow material={new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1 })}>
                            <boxGeometry args={[spreadingLength * FT, 0.1 * FT, tableWidth * FT]} />
                        </mesh>
                    </group>
                </group>
            )}
        </group>
    );
};
