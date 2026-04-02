import React, { useMemo } from 'react';
import * as THREE from 'three';

interface FusingMachineProps {
    L?: number; // Length (feet)
    W?: number; // Width (feet)
    H?: number; // Height (feet)
}

const createBranding = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();
    ctx.fillStyle = '#1e88e5';
    ctx.fillRect(0, 0, 512, 1024);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 70px Arial';
    ctx.textAlign = 'center';
    const text = "FUTURE FUSING";
    for(let i=0; i<text.length; i++) {
        ctx.fillText(text[i], 256, 150 + (i * 65));
    }
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(256, 60, 30, 0, Math.PI * 2);
    ctx.fill();
    return new THREE.CanvasTexture(canvas);
};

export const FusingMachine: React.FC<FusingMachineProps> = ({ 
    L = 24.4, 
    W = 5.7, 
    H = 5.0 
}) => {
    const FT = 0.3048;
    const brandingTex = useMemo(() => createBranding(), []);
    
    // Materials
    const whiteMat = { color: "#ffffff", roughness: 0.15, metalness: 0.05 };
    const blueMat = { color: "#1e88e5", roughness: 0.2, metalness: 0.3 };
    const darkMeshMat = { color: "#111", roughness: 1.0 };
    const chromeMat = { color: "#fff", metalness: 1.0, roughness: 0.05 };
    const safetyRedMat = { color: "#d32f2f", emissive: "#220000" };

    const chamberL = L * 0.34;
    const inputL = L * 0.46;
    const outputL = L - chamberL - inputL;

    return (
        <group scale={[FT, FT, FT]}>
            {/* 1. MAIN CHASSIS (CENTRAL HEATING BOX) */}
            <group position={[0, H/2, 0]}>
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[chamberL, H, W]} />
                    <meshStandardMaterial {...whiteMat} />
                </mesh>
                
                {/* Top Blue Cowling */}
                <mesh position={[0, H/2 + 0.15, 0]}>
                    <boxGeometry args={[chamberL + 0.2, 0.4, W + 0.2]} />
                    <meshStandardMaterial {...blueMat} />
                </mesh>

                {/* Red Circular Safety Decal */}
                <mesh position={[chamberL/2 + 0.01, H/2, W/2 - 1]} rotation={[0, Math.PI/2, 0]}>
                    <circleGeometry args={[0.25, 32]} />
                    <meshStandardMaterial {...safetyRedMat} />
                </mesh>
            </group>

            {/* 2. STANDALONE INDUSTRIAL CONTROL TOWER (ALIGNED CLOSER) */}
            <group position={[-(chamberL/4), (H + 1.2)/2, W/2 + 0.6]}>
                <mesh castShadow>
                     {/* Robust standalone pillar closer to the chassis */}
                    <boxGeometry args={[1.2, H + 1.2, 1.2]} />
                    <meshStandardMaterial map={brandingTex} />
                </mesh>
                {[...Array(5)].map((_, i) => (
                    <mesh key={i} position={[0.61, H/4 - i * 0.3, 0]}>
                        <boxGeometry args={[0.01, 0.05, 0.8]} />
                        <meshStandardMaterial color="#333" />
                    </mesh>
                ))}
                {/* Tower Screen */}
                <mesh position={[0, H/2 + 0.1, 0.61]} rotation={[-0.1, 0, 0]}>
                    <boxGeometry args={[0.9, 0.4, 0.02]} />
                    <meshStandardMaterial color="#000" />
                </mesh>
            </group>

            {/* 3. SLANTED PRIMARY CONSOLE (FRONT) */}
            <group position={[-chamberL/2, H - 0.3, 0]} rotation={[0, 0, -Math.PI/6]}>
                <mesh castShadow>
                    <boxGeometry args={[1.8, 0.6, W - 0.8]} />
                    <meshStandardMaterial {...whiteMat} />
                </mesh>
                {[...Array(8)].map((_, i) => (
                    <mesh key={i} position={[0.4, 0.32, -1.2 + i * 0.35]}>
                        <cylinderGeometry args={[0.08, 0.08, 0.05, 12]} />
                        <meshStandardMaterial color={i < 2 ? "red" : i < 4 ? "yellow" : "green"} />
                    </mesh>
                ))}
            </group>

            {/* 4. REINFORCED INTAKE CONVEYOR ASSEMBLY */}
            <group position={[-(chamberL/2 + inputL/2), 0, 0]}>
                {/* Structural Side Frames */}
                <group position={[0, 1.8, 0]}>
                    <mesh position={[0, 0, W/2 - 0.2]} castShadow><boxGeometry args={[inputL, 1.6, 0.1]} /><meshStandardMaterial {...whiteMat} /></mesh>
                    <mesh position={[0, 0, -(W/2 - 0.2)]} castShadow><boxGeometry args={[inputL, 1.6, 0.1]} /><meshStandardMaterial {...whiteMat} /></mesh>
                </group>

                {/* Pro High-Density Rollers - Strictly Bounded */}
                {Array.from({ length: 30 }).map((_, i) => {
                    const xPos = inputL/2 - 0.5 - i * 0.8;
                    if (xPos < -inputL/2 + 0.5) return null;
                    return (
                        <mesh key={i} position={[xPos, 2.22, 0]} rotation={[Math.PI/2, 0, 0]}>
                            <cylinderGeometry args={[0.08, 0.08, W - 1, 24]} /><meshStandardMaterial {...chromeMat} />
                        </mesh>
                    );
                })}

                <mesh position={[0, 2.35, 0]}>
                    <boxGeometry args={[inputL + 0.1, 0.06, W - 0.8]} />
                    <meshStandardMaterial {...darkMeshMat} />
                </mesh>
            </group>

            {/* 5. REAR DISCHARGE ASSEMBLY (CONVEYOR BED SYNCED) */}
            <group position={[chamberL/2 + outputL/2, 1.95, 0]}>
                <mesh castShadow>
                    <boxGeometry args={[outputL, 0.8, W - 0.5]} />
                    <meshStandardMaterial {...whiteMat} />
                </mesh>
                <mesh position={[0, 0.4, 0]}>
                    <boxGeometry args={[outputL - 0.1, 0.05, W - 0.7]} />
                    <meshStandardMaterial {...darkMeshMat} />
                </mesh>
            </group>

            {/* 6. INDUSTRIAL LENGTHWISE WHITE BOX (Support Chassis) */}
            <group position={[-(chamberL/2 - 0.5), 0.45, 0]}>
                <mesh castShadow receiveShadow>
                     <boxGeometry args={[L - 1, 0.9, W - 1.2]} />
                     <meshStandardMaterial {...whiteMat} />
                </mesh>
                {/* MIRRORED INDUSTRIAL BLUE ACCENTS */}
                <mesh position={[0, 0.2, (W - 1.2)/2 + 0.02]}><boxGeometry args={[L - 1.1, 0.15, 0.01]} /><meshStandardMaterial {...blueMat} /></mesh>
                <mesh position={[0, -0.2, (W - 1.2)/2 + 0.02]}><boxGeometry args={[L - 1.1, 0.15, 0.01]} /><meshStandardMaterial {...blueMat} /></mesh>
                <mesh position={[0, 0.2, -((W - 1.2)/2 + 0.02)]}><boxGeometry args={[L - 1.1, 0.15, 0.01]} /><meshStandardMaterial {...blueMat} /></mesh>
                <mesh position={[0, -0.2, -((W - 1.2)/2 + 0.02)]}><boxGeometry args={[L - 1.1, 0.15, 0.01]} /><meshStandardMaterial {...blueMat} /></mesh>
            </group>

            {/* 7. EMERGENCY STOP */}
            <group position={[chamberL/2 + 0.1, 2.2, (W/2 + 0.05)]}>
                <mesh rotation={[0, Math.PI/2, 0]}>
                    <boxGeometry args={[0.3, 0.4, 0.1]} />
                    <meshStandardMaterial {...whiteMat} />
                </mesh>
                <mesh position={[0, 0, 0.1]} rotation={[Math.PI/2, 0, 0]}>
                    <cylinderGeometry args={[0.12, 0.12, 0.1, 16]} />
                    <meshStandardMaterial color="#d32f2f" emissive="#330000" />
                </mesh>
            </group>
        </group>
    );
};
