import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface GarmentConveyorProps {
  position?: [number, number, number];
  scale?: number;
}

export const GarmentConveyor: React.FC<GarmentConveyorProps & { 
  railWidth?: number; 
  railLength?: number;
  shirtColor?: string;
  pattern?: "none" | "stripes" | "checks";
}> = ({ 
  position = [0, 0, 0], 
  scale = 1,
  railWidth = 0.61,
  railLength = 10.05,
  shirtColor = "#bae6fd",
  pattern = "none"
}) => {
  const hangersRef = useRef<(THREE.Group | null)[]>([]);
  const hangerCount = 14;

  // 1. Create the U-Shaped Rail Path
  const railPath = useMemo(() => {
    const path = new THREE.CurvePath<THREE.Vector3>();
    const h_rail = 2.6; // Reduced from 3.0 to meet user request
    // Straight side 1
    path.add(new THREE.LineCurve3(new THREE.Vector3(-railLength / 2, h_rail, -railWidth / 2), new THREE.Vector3(railLength / 2, h_rail, -railWidth / 2)));
    // Curve 1 (Rounded)
    path.add(new THREE.CubicBezierCurve3(
        new THREE.Vector3(railLength / 2, h_rail, -railWidth / 2), 
        new THREE.Vector3(railLength / 2 + 0.3, h_rail, -railWidth / 2), 
        new THREE.Vector3(railLength / 2 + 0.3, h_rail, railWidth / 2), 
        new THREE.Vector3(railLength / 2, h_rail, railWidth / 2)
    ));
    // Straight side 2 (back)
    path.add(new THREE.LineCurve3(new THREE.Vector3(railLength / 2, h_rail, railWidth / 2), new THREE.Vector3(-railLength / 2, h_rail, railWidth / 2)));
    // Curve 2 (Rounded back)
    path.add(new THREE.CubicBezierCurve3(
        new THREE.Vector3(-railLength / 2, h_rail, railWidth / 2), 
        new THREE.Vector3(-railLength / 2 - 0.3, h_rail, railWidth / 2), 
        new THREE.Vector3(-railLength / 2 - 0.3, h_rail, -railWidth / 2), 
        new THREE.Vector3(-railLength / 2, h_rail, -railWidth / 2)
    ));
    return path;
  }, [railLength, railWidth]);

  // 2. Create a "Formal Full-Sleeve Fixed Shirt" Shape (Not rolled)
  const shirtGeometry = useMemo(() => {
    const s = new THREE.Shape();
    // Sharper, straight full-sleeve silhouette (LONG SLEEVES)
    s.moveTo(-0.15, 0.85); // Collar base left
    s.lineTo(0.15, 0.85);  // Collar base right
    s.lineTo(0.5, 0.75);   // Shoulder right
    s.lineTo(0.6, -0.6);   // Long Sleeve end right
    s.lineTo(0.48, -0.6);  // Long Sleeve end right inner
    s.lineTo(0.38, 0.4);   // Underarm right
    s.lineTo(0.38, -0.7); // Bottom right
    s.lineTo(-0.38, -0.7); // Bottom left
    s.lineTo(-0.38, 0.4);  // Underarm left
    s.lineTo(-0.48, -0.6); // Long Sleeve end left inner
    s.lineTo(-0.6, -0.6);  // Long Sleeve end left
    s.lineTo(-0.5, 0.75);  // Shoulder left
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false });
  }, []);

  useFrame((state) => {
    const time = state.clock.elapsedTime * 0.02; // Further reduced speed
    hangersRef.current.forEach((hanger, i) => {
      if (!hanger) return;
      // Distribute hangers along the loop
      const t = (time + i / hangerCount) % 1;
      const pos = railPath.getPointAt(t);
      const tangent = railPath.getTangentAt(t);
      
      hanger.position.copy(pos);
      // Remove orientation-to-tangent logic: the shirts now remain fixed facing forward (Z)
      hanger.rotation.set(0, 0, 0); 
      
      // Add that slight swing (on X to swing sideways)
      hanger.rotation.x = Math.sin(state.clock.elapsedTime * 0.8 + i) * 0.08;
    });
  });

  return (
    <group position={new THREE.Vector3(...position)} scale={scale}>
      {/* ================= THE U-RAIL ================= */}
      <mesh>
        <tubeGeometry args={[railPath, 100, 0.05, 8, false]} />
        <meshStandardMaterial color="#4b5563" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* ================= 2 V-SHAPED UPPER STANDS WITH CONNECTING OBJECT ================= */}
      {[-railLength / 3.5, railLength / 3.5].map((x, i) => {
        const h_bed = 0.85; // Standard Bed Height
        const h_upper = 1.6; // Reduced from 2.0 to bring rail closer to bed
        const halfWidth = railWidth / 2;
        const angle = Math.atan2(halfWidth, h_upper);
        return (
          <group key={`v-stand-${i}`} position={[x, h_bed, 0]}>
              {/* Left Arm of V */}
              <mesh position={[0, h_upper/2, -halfWidth/2]} rotation={[angle, 0, 0]}>
                  <boxGeometry args={[0.15, Math.sqrt(h_upper*h_upper + (halfWidth/2)*(halfWidth/2)), 0.15]} /> 
                  <meshStandardMaterial color="#f3f4f6" />
              </mesh>
              {/* Right Arm of V */}
              <mesh position={[0, h_upper/2, halfWidth/2]} rotation={[-angle, 0, 0]}>
                  <boxGeometry args={[0.15, Math.sqrt(h_upper*h_upper + (halfWidth/2)*(halfWidth/2)), 0.15]} />
                  <meshStandardMaterial color="#f3f4f6" />
              </mesh>
              
              {/* --- NEW: Object between the loop (Mounting Block) --- */}
              <group position={[0, h_upper + 0.05, 0]}>
                <mesh>
                    <boxGeometry args={[0.4, 0.4, railWidth + 0.1]} />
                    <meshStandardMaterial color="#d1d5db" />
                </mesh>
                {/* Central support from block to rail (Rail at 3.0, Bed 0.85+2.0=2.85, Block top 2.9) */}
                <mesh position={[0, 0.1, 0]}>
                    <boxGeometry args={[0.1, 0.1, 0.1]} />
                    <meshStandardMaterial color="#f3f4f6" />
                </mesh>
              </group>
          </group>
        );
      })}

      {/* ================= THE GREEN CONVEYOR BELT ================= */}
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[railLength, 0.05, railWidth]} />
        <meshStandardMaterial color="#166534" metalness={0.1} /> 
      </mesh>
      
      {/* Thinner Belt Frame */}
      <mesh position={[0, 0.77, 0]}>
        <boxGeometry args={[railLength + 0.1, 0.15, railWidth + 0.1]} />
        <meshStandardMaterial color="#f3f4f6" />
      </mesh>

      {/* ================= FLOOR SUPPORT LEGS (PAIRED) ================= */}
      {[-railLength / 2.5, 0, railLength / 2.5].map((x, i) => (
        <group key={`row-${i}`} position={[x, 0.425, 0]}>
            <group position={[0, 0, -railWidth / 2.2]}>
                <mesh><boxGeometry args={[0.08, 0.85, 0.08]} /><meshStandardMaterial color="#d1d5db" /></mesh>
                <mesh position={[0, -0.425, 0]}><boxGeometry args={[0.15, 0.02, 0.15]} /><meshStandardMaterial color="#374151" /></mesh>
            </group>
            <group position={[0, 0, railWidth / 2.2]}>
                <mesh><boxGeometry args={[0.08, 0.85, 0.08]} /><meshStandardMaterial color="#d1d5db" /></mesh>
                <mesh position={[0, -0.425, 0]}><boxGeometry args={[0.15, 0.02, 0.15]} /><meshStandardMaterial color="#374151" /></mesh>
            </group>
        </group>
      ))}

      {/* ================= HANGING FORMAL SHIRTS ================= */}
      {Array.from({ length: hangerCount }).map((_, i) => (
        <group key={i} ref={(el) => (hangersRef.current[i] = el)}>
          {/* Metal Hook */}
          <mesh position={[0, -0.3, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.6]} />
            <meshStandardMaterial color="#4b5563" metalness={1} />
          </mesh>
          
          {/* Formal Shirt with Details (Vibrant Sky Blue/Yellow) */}
          {/* Formal Shirt with Details and Patterns - SCALED DOWN 0.7 */}
          <group position={[0, -1.1, 0]} scale={0.7}>
            {/* Main Body with Fixed Color Prop */}
            <mesh geometry={shirtGeometry}>
                <meshStandardMaterial color={shirtColor} roughness={0.5} />
            </mesh>

            {/* Pattern Overlay: Stripes */}
            {pattern === "stripes" && (
                <group position={[0, 0, 0.051]}>
                    {[-0.3, -0.15, 0.15, 0.3].map((sx, index) => (
                        <mesh key={index} position={[sx, -0.05, 0]}>
                            <boxGeometry args={[0.02, 1.4, 0.01]} />
                            <meshStandardMaterial color="#000000" opacity={0.1} transparent />
                        </mesh>
                    ))}
                </group>
            )}

            {/* Pattern Overlay: Checks */}
            {pattern === "checks" && (
                <group position={[0, 0, 0.051]}>
                    {/* Vertical lines */}
                    {[-0.3, -0.15, 0, 0.15, 0.3].map((sx, index) => (
                        <mesh key={`v-${index}`} position={[sx, -0.05, 0]}>
                            <boxGeometry args={[0.02, 1.4, 0.01]} />
                            <meshStandardMaterial color="#000000" opacity={0.08} transparent />
                        </mesh>
                    ))}
                    {/* Horizontal lines */}
                    {[-0.6, -0.3, 0, 0.3, 0.6].map((sy, index) => (
                        <mesh key={`h-${index}`} position={[0, sy, 0]}>
                            <boxGeometry args={[0.8, 0.02, 0.01]} />
                            <meshStandardMaterial color="#000000" opacity={0.08} transparent />
                        </mesh>
                    ))}
                </group>
            )}
            
            {/* Formal Collar Detail */}
            <mesh position={[0, 0.85, 0.06]}>
              <boxGeometry args={[0.3, 0.15, 0.2]} />
              <meshStandardMaterial color={shirtColor} />
            </mesh>

            {/* Back Yoke Detail */}
            <mesh position={[0, 0.65, -0.01]}>
              <boxGeometry args={[1.0, 0.25, 0.12]} />
              <meshStandardMaterial color={shirtColor} />
            </mesh>
            
            {/* Non-Rolled Cuffs - Matching Shirt Color */}
            <mesh position={[0.54, -0.62, 0.05]}>
              <boxGeometry args={[0.15, 0.1, 0.15]} />
              <meshStandardMaterial color={shirtColor} />
            </mesh>
            <mesh position={[-0.54, -0.62, 0.05]}>
              <boxGeometry args={[0.15, 0.1, 0.15]} />
              <meshStandardMaterial color={shirtColor} />
            </mesh>

            {/* Vertical Button Placket */}
            <mesh position={[0, -0.05, 0.06]}>
              <boxGeometry args={[0.08, 1.4, 0.02]} />
              <meshStandardMaterial color="#f1f5f9" />
            </mesh>

            {/* Individual Buttons */}
            {[-0.6, -0.3, 0, 0.3, 0.6].map((by) => (
                <mesh key={by} position={[0, by, 0.075]}>
                    <sphereGeometry args={[0.02, 8, 8]} />
                    <meshStandardMaterial color="#ffffff" />
                </mesh>
            ))}
          </group>
        </group>
      ))}
    </group>
  );
};
