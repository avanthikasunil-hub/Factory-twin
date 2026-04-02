import { useRef } from 'react';
import * as THREE from 'three';

interface ManualSpreaderProps {
    tableWidth?: number;
    fabricLength?: number;
    fabricColor?: string;
}

const FT = 0.3048;

export default function ManualSpreader({ 
    tableWidth = 7.1, 
    fabricLength = 20,
    fabricColor = "#1e3a8a" // Default Denim Blue
}: ManualSpreaderProps) {
    const tableW = tableWidth * FT;
    const tableH = 3.0 * FT;
    const carriageLength = 4 * FT;
    const frameColor = "#fbbf24"; // High-vis yellow
    const steelColor = "#4b5563"; // Premium metallic grey steel
    const knobColor = "#d1d5db"; // Light metallic silver
    const wheelColor = "#ef4444"; // Industrial Red

    return (
        <group>
            {/* 1. Main Side Frames (Yellow) with Hardware */}
            <group position={[0, tableH, 0]}>
                {/* Left Side Frame */}
                <group position={[0, 0.4 * FT, -tableW / 2 - 0.1 * FT]}>
                    <mesh>
                        <boxGeometry args={[carriageLength, 0.8 * FT, 0.2 * FT]} />
                        <meshStandardMaterial color={frameColor} metalness={0.5} roughness={0.5} />
                    </mesh>
                    {/* Silver Bolts on Frame */}
                    <mesh position={[-carriageLength/3, 0.2 * FT, 0.1 * FT]} rotation={[Math.PI/2, 0, 0]}>
                        <cylinderGeometry args={[0.02 * FT, 0.02 * FT, 0.05 * FT]} />
                        <meshStandardMaterial color={knobColor} />
                    </mesh>
                    <mesh position={[carriageLength/3, 0.2 * FT, 0.1 * FT]} rotation={[Math.PI/2, 0, 0]}>
                        <cylinderGeometry args={[0.02 * FT, 0.02 * FT, 0.05 * FT]} />
                        <meshStandardMaterial color={knobColor} />
                    </mesh>
                    {/* Red Wheels at bottom */}
                    <mesh position={[-carriageLength/2.2, -0.4 * FT, 0]} rotation={[0, 0, Math.PI/2]}>
                        <cylinderGeometry args={[0.15 * FT, 0.15 * FT, 0.1 * FT]} />
                        <meshStandardMaterial color={wheelColor} />
                    </mesh>
                    <mesh position={[carriageLength/2.2, -0.4 * FT, 0]} rotation={[0, 0, Math.PI/2]}>
                        <cylinderGeometry args={[0.15 * FT, 0.15 * FT, 0.1 * FT]} />
                        <meshStandardMaterial color={wheelColor} />
                    </mesh>
                </group>

                {/* Right Side Frame */}
                <group position={[0, 0.4 * FT, tableW / 2 + 0.1 * FT]}>
                    <mesh>
                        <boxGeometry args={[carriageLength, 0.8 * FT, 0.2 * FT]} />
                        <meshStandardMaterial color={frameColor} metalness={0.5} roughness={0.5} />
                    </mesh>
                    {/* Silver Bolts */}
                    <mesh position={[-carriageLength/3, 0.2 * FT, -0.1 * FT]} rotation={[Math.PI/2, 0, 0]}>
                        <cylinderGeometry args={[0.02 * FT, 0.02 * FT, 0.05 * FT]} />
                        <meshStandardMaterial color={knobColor} />
                    </mesh>
                    <mesh position={[carriageLength/3, 0.2 * FT, -0.1 * FT]} rotation={[Math.PI/2, 0, 0]}>
                        <cylinderGeometry args={[0.02 * FT, 0.02 * FT, 0.05 * FT]} />
                        <meshStandardMaterial color={knobColor} />
                    </mesh>
                    {/* Red Wheels */}
                    <mesh position={[-carriageLength/2.2, -0.4 * FT, 0]} rotation={[0, 0, Math.PI/2]}>
                        <cylinderGeometry args={[0.15 * FT, 0.15 * FT, 0.1 * FT]} />
                        <meshStandardMaterial color={wheelColor} />
                    </mesh>
                    <mesh position={[carriageLength/2.2, -0.4 * FT, 0]} rotation={[0, 0, Math.PI/2]}>
                        <cylinderGeometry args={[0.15 * FT, 0.15 * FT, 0.1 * FT]} />
                        <meshStandardMaterial color={wheelColor} />
                    </mesh>
                </group>

                {/* 2. Vertical Notched Stands */}
                <mesh position={[0, 1.0 * FT, -tableW / 2 - 0.1 * FT]}>
                    <boxGeometry args={[0.1 * FT, 1.8 * FT, 0.1 * FT]} />
                    <meshStandardMaterial color={steelColor} metalness={0.8} />
                </mesh>
                <mesh position={[0, 1.0 * FT, tableW / 2 + 0.1 * FT]}>
                    <boxGeometry args={[0.1 * FT, 1.8 * FT, 0.1 * FT]} />
                    <meshStandardMaterial color={steelColor} metalness={0.8} />
                </mesh>

                {/* Adjustment Knobs */}
                <mesh position={[0, 1.2 * FT, -tableW / 2 - 0.18 * FT]} rotation={[Math.PI/2, 0, 0]}>
                    <cylinderGeometry args={[0.06 * FT, 0.06 * FT, 0.1 * FT]} />
                    <meshStandardMaterial color={knobColor} metalness={0.9} />
                </mesh>
                <mesh position={[0, 1.2 * FT, tableW / 2 + 0.18 * FT]} rotation={[Math.PI/2, 0, 0]}>
                    <cylinderGeometry args={[0.06 * FT, 0.06 * FT, 0.1 * FT]} />
                    <meshStandardMaterial color={knobColor} metalness={0.9} />
                </mesh>

                {/* 3. Horizontal Roller System */}
                <mesh position={[0, 1.5 * FT, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.03 * FT, 0.03 * FT, tableW + 0.6 * FT]} />
                    <meshStandardMaterial color={steelColor} metalness={0.9} />
                </mesh>
                <mesh position={[0.4 * FT, 0.8 * FT, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.025 * FT, 0.025 * FT, tableW + 0.4 * FT]} />
                    <meshStandardMaterial color={steelColor} metalness={0.8} />
                </mesh>

                {/* 4. Fabric Roll */}
                <group position={[0, 1.5 * FT, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <mesh>
                        <cylinderGeometry args={[0.4 * FT, 0.4 * FT, tableW - 0.2 * FT]} />
                        <meshStandardMaterial color={fabricColor} roughness={0.9} />
                    </mesh>
                    <mesh position={[0, tableW/2, 0]}>
                        <cylinderGeometry args={[0.05 * FT, 0.05 * FT, 0.3 * FT]} />
                        <meshStandardMaterial color={knobColor} metalness={0.9} />
                    </mesh>
                    <mesh position={[0, -tableW/2, 0]}>
                        <cylinderGeometry args={[0.05 * FT, 0.05 * FT, 0.3 * FT]} />
                        <meshStandardMaterial color={knobColor} metalness={0.9} />
                    </mesh>
                </group>

                {/* 5. Silver Tension Plate */}
                <group position={[carriageLength / 2 - 0.5 * FT, 0.05 * FT, 0]}>
                    <mesh>
                        <boxGeometry args={[0.4 * FT, 0.02 * FT, tableW - 0.4 * FT]} />
                        <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.2} />
                    </mesh>
                    {/* Handles on Plate */}
                    <mesh position={[0, 0.1 * FT, -(tableW/2 - 1 * FT)]} rotation={[Math.PI/2, 0, 0]}>
                        <cylinderGeometry args={[0.01 * FT, 0.01 * FT, 0.4 * FT]} />
                        <meshStandardMaterial color={steelColor} />
                    </mesh>
                    <mesh position={[0, 0.1 * FT, (tableW/2 - 1 * FT)]} rotation={[Math.PI/2, 0, 0]}>
                        <cylinderGeometry args={[0.01 * FT, 0.01 * FT, 0.4 * FT]} />
                        <meshStandardMaterial color={steelColor} />
                    </mesh>
                </group>
            </group>

            {/* 6. Spread Fabric */}
            <mesh position={[-fabricLength * FT / 2 + carriageLength / 2, tableH + 0.03 * FT, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[fabricLength * FT, tableW - 1.2 * FT]} />
                <meshStandardMaterial color={fabricColor} roughness={0.9} side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
}
