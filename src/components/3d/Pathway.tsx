import React from 'react';

interface PathwayProps {
    position: [number, number, number];
    width: number;
    length: number;
    label?: string;
}

export const Pathway = ({ position, width, length, label }: PathwayProps) => {
    return (
        <group position={position}>
            {/* Visual representation of the pathway */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[length, width]} />
                <meshStandardMaterial
                    color="#334155"
                    roughness={0.8}
                    transparent
                    opacity={0.6}
                    polygonOffset
                    polygonOffsetFactor={1}
                />
            </mesh>

            {/* Border/Markings */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, width / 2]}>
                <planeGeometry args={[length, 0.1]} />
                <meshStandardMaterial color="#fcd34d" />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, -width / 2]}>
                <planeGeometry args={[length, 0.1]} />
                <meshStandardMaterial color="#fcd34d" />
            </mesh>

            {/* Label */}
            {label && (
                <group position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    {/* We could add Text here if needed, but for now simple visual */}
                </group>
            )}
        </group>
    );
};
