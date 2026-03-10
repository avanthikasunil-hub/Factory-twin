import React, { useMemo } from 'react';
import * as THREE from 'three';

interface HumanOperatorProps {
    id: string; // Used for deterministic gender/color selection
    rotation: number;
    isStanding?: boolean;
    isInspection?: boolean;
}

// Optimized Shared Materials to prevent redraw lag
const MATERIAL_CACHE: Record<string, THREE.MeshStandardMaterial> = {
    chair: new THREE.MeshStandardMaterial({ color: '#1e1e1e', roughness: 0.4 }),
    metal: new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.3, metalness: 0.8 }),
    coat: new THREE.MeshStandardMaterial({ color: '#bae6fd', roughness: 0.9 }),
    ppeBlue: new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.9 })
};

export const HumanOperator = ({ id, rotation, isStanding, isInspection }: HumanOperatorProps) => {
    // Deterministic random behavior based on ID
    const seed = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const isFemale = seed % 2 === 0;

    // Colors
    const skinColors = ['#f1c27d', '#ffdbac', '#e0ac69', '#8d5524', '#c68642'];
    const skinColor = skinColors[seed % skinColors.length];

    const maleShirtColors = ['#1e3a8a', '#047857', '#374151', '#7f1d1d', '#d97706'];
    const femaleShirtColors = ['#be185d', '#7e22ce', '#047857', '#b91c1c', '#0f766e'];
    const shirtColor = isFemale
        ? femaleShirtColors[seed % femaleShirtColors.length]
        : maleShirtColors[seed % maleShirtColors.length];

    const pantColors = ['#1e293b', '#334155', '#475569', '#0f172a'];
    const pantColor = pantColors[seed % pantColors.length];

    const hairColors = ['#0f0f0f', '#3b2f2f', '#4a3c31', '#d4af37', '#7b3f00'];
    const hairColor = hairColors[seed % hairColors.length];

    // Proportions
    const torsoWidth = isFemale ? 0.35 : 0.45;
    const torsoHeight = isFemale ? 0.55 : 0.6;
    const shoulderWidth = isFemale ? 0.4 : 0.5;

    // Instance-specific materials (Cached locally)
    const skinMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 }), [skinColor]);
    const shirtMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 }), [shirtColor]);
    const pantMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: pantColor, roughness: 0.9 }), [pantColor]);
    const hairMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.7 }), [hairColor]);

    return (
        <group position={[0, 0, 0.55]} rotation={[0, Math.PI, 0]} scale={[0.8, 0.8, 0.8]}>
            {/* --- CHAIR --- */}
            {!isStanding && (
                <group position={[0, 0, 0]}>
                    <mesh position={[0, 0.45, 0]}>
                        <boxGeometry args={[0.4, 0.05, 0.4]} />
                        <primitive object={MATERIAL_CACHE.chair} />
                    </mesh>
                    <mesh position={[0, 0.225, 0]}>
                        <cylinderGeometry args={[0.03, 0.03, 0.45]} />
                        <primitive object={MATERIAL_CACHE.metal} />
                    </mesh>
                    {[0, 1, 2, 3, 4].map(i => (
                        <mesh key={i} position={[0, 0.05, 0]} rotation={[0, (i * Math.PI * 2) / 5, 0]}>
                            <cylinderGeometry args={[0.02, 0.02, 0.4]} />
                            <primitive object={MATERIAL_CACHE.metal} />
                        </mesh>
                    ))}
                    <mesh position={[0, 0.65, -0.18]} rotation={[0.1, 0, 0]}>
                        <boxGeometry args={[0.05, 0.4, 0.02]} />
                        <primitive object={MATERIAL_CACHE.metal} />
                    </mesh>
                    <mesh position={[0, 0.8, -0.2]}>
                        <boxGeometry args={[0.35, 0.2, 0.05]} />
                        <primitive object={MATERIAL_CACHE.chair} />
                    </mesh>
                </group>
            )}

            {/* --- HUMAN BODY --- */}
            <group position={[0, isStanding ? 0.75 : 0.48, isStanding ? 0.1 : 0]}>
                <mesh position={[0, 0.08, 0]}>
                    <boxGeometry args={[torsoWidth, 0.16, 0.25]} />
                    <primitive object={pantMaterial} />
                </mesh>
                <mesh position={[0, 0.16 + torsoHeight / 2, 0]} scale={[1, 1, 0.6]}>
                    <cylinderGeometry args={[torsoWidth / 2, torsoWidth / 2.5, torsoHeight, 16]} />
                    <primitive object={shirtMaterial} />
                </mesh>
                <mesh position={[0, 0.16 + torsoHeight / 2, 0]} scale={[1, 1, 0.65]}>
                    <cylinderGeometry args={[torsoWidth / 2 + 0.02, torsoWidth / 2.5 + 0.02, torsoHeight + 0.02, 16]} />
                    <primitive object={MATERIAL_CACHE.coat} />
                </mesh>
                <mesh position={[0, 0.16 + torsoHeight + 0.05, 0]}>
                    <cylinderGeometry args={[0.06, 0.06, 0.1]} />
                    <primitive object={skinMaterial} />
                </mesh>
                <group position={[0, 0.16 + torsoHeight + 0.2, 0.02]}>
                    <mesh>
                        <sphereGeometry args={[0.13, 32, 32]} />
                        <primitive object={skinMaterial} />
                    </mesh>
                    <mesh position={[0, -0.01, 0.13]}>
                        <sphereGeometry args={[0.02, 16, 16]} />
                        <primitive object={skinMaterial} />
                    </mesh>
                    <mesh position={[0, 0.02, -0.04]} rotation={[-0.3, 0, 0]}>
                        <sphereGeometry args={[0.135, 32, 32, 0, Math.PI * 2, 0, Math.PI / 1.6]} />
                        <primitive object={MATERIAL_CACHE.ppeBlue} />
                    </mesh>
                </group>
                {/* Arms */}
                {[-1, 1].map((side) => {
                    const armRotX = isInspection ? -Math.PI / 3 : -Math.PI / 4;
                    const lowerArmRotX = isInspection ? -Math.PI / 2.5 : -Math.PI / 2;
                    const handPosZ = isInspection ? 0.6 : 0.52;
                    const handPosY = isInspection ? -0.22 : -0.28;
                    return (
                        <group key={side} position={[side * (shoulderWidth / 2 + 0.05), 0.16 + torsoHeight - 0.08, 0]}>
                            <mesh position={[0, -0.04, 0.02]} rotation={[-Math.PI / 4, 0, 0]}>
                                <capsuleGeometry args={[0.05, 0.1, 4, 16]} />
                                <primitive object={shirtMaterial} />
                            </mesh>
                            <mesh position={[0, -0.14, 0.11]} rotation={[armRotX, 0, 0]}>
                                <capsuleGeometry args={[0.04, 0.24, 4, 16]} />
                                <primitive object={skinMaterial} />
                            </mesh>
                            <mesh position={[0, handPosY, handPosZ - 0.16]} rotation={[lowerArmRotX, 0, 0]}>
                                <capsuleGeometry args={[0.035, 0.28, 4, 16]} />
                                <primitive object={skinMaterial} />
                            </mesh>
                            <mesh position={[0, handPosY, handPosZ]} rotation={[0, 0, Math.PI / 2]}>
                                <capsuleGeometry args={[0.035, 0.08, 4, 16]} />
                                <primitive object={skinMaterial} />
                            </mesh>
                        </group>
                    );
                })}
                {/* Legs */}
                {[-1, 1].map((side) => (
                    <group key={side} position={[side * (torsoWidth / 2 - 0.08), 0.08, isStanding ? 0 : 0.1]}>
                        {isStanding ? (
                            <>
                                <mesh position={[0, -0.2, 0]} rotation={[0, 0, 0]}>
                                    <capsuleGeometry args={[0.065, 0.3, 4, 16]} />
                                    <primitive object={pantMaterial} />
                                </mesh>
                                <mesh position={[0, -0.58, 0]}>
                                    <capsuleGeometry args={[0.055, 0.4, 4, 16]} />
                                    <primitive object={pantMaterial} />
                                </mesh>
                                <mesh position={[0, -0.85, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
                                    <capsuleGeometry args={[0.045, 0.12, 4, 16]} />
                                    <meshStandardMaterial color="#27272a" roughness={0.9} />
                                </mesh>
                            </>
                        ) : (
                            <>
                                <mesh position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
                                    <capsuleGeometry args={[0.065, 0.3, 4, 16]} />
                                    <primitive object={pantMaterial} />
                                </mesh>
                                <mesh position={[0, -0.25, 0.33]}>
                                    <capsuleGeometry args={[0.055, 0.35, 4, 16]} />
                                    <primitive object={pantMaterial} />
                                </mesh>
                                <mesh position={[0, -0.48, 0.38]} rotation={[Math.PI / 2, 0, 0]}>
                                    <capsuleGeometry args={[0.045, 0.12, 4, 16]} />
                                    <meshStandardMaterial color="#27272a" roughness={0.9} />
                                </mesh>
                            </>
                        )}
                    </group>
                ))}
            </group>
        </group>
    );
};
