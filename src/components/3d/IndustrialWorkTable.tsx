import React, { useMemo } from "react";
import * as THREE from "three";

interface IndustrialWorkTableProps {
  position?: [number, number, number];
}

export const IndustrialWorkTable: React.FC<IndustrialWorkTableProps> = ({ position = [0, 0, 0] }) => {
  // Dimensions
  const L = 4; // Length (x)
  const B = 2; // Breadth (z)
  const H = 4; // Total Height (y)
  const thick = 0.05; // Panel thickness
  const tableTopH = 2.2; // Height of the main packing surface
  const hutchH = H - tableTopH; // Height of the hutch section (1.8)

  return (
    <group position={position}>
      {/* ================= MAIN TABLE STRUCTURE ================= */}
      
      {/* 1. Main Table Top Surface */}
      <mesh position={[0, tableTopH, 0]}>
        <boxGeometry args={[L, thick, B]} />
        <meshStandardMaterial color="#f3f4f6" roughness={0.8} metalness={0.1} />
      </mesh>

      {/* 2. Base Structure: Bottom Plate */}
      <mesh position={[0, thick / 2, 0]}>
        <boxGeometry args={[L, thick, B]} />
        <meshStandardMaterial color="#f3f4f6" roughness={0.8} metalness={0.1} />
      </mesh>

      {/* 3. Base Structure: Outer Side Walls (Left & Right) */}
      {[-(L / 2 - thick / 2), L / 2 - thick / 2].map((x, i) => (
        <mesh key={i} position={[x, tableTopH / 2, 0]}>
          <boxGeometry args={[thick, tableTopH, B]} />
          <meshStandardMaterial color="#f3f4f6" roughness={0.8} metalness={0.1} />
        </mesh>
      ))}

      {/* 4. Base Structure: Back Wall (Lower section) */}
      <mesh position={[0, tableTopH / 2, -(B / 2 - thick / 2)]}>
        <boxGeometry args={[L - thick * 2, tableTopH, thick]} />
        <meshStandardMaterial color="#f3f4f6" roughness={0.8} metalness={0.1} />
      </mesh>

      {/* ================= LOWER STORAGE BAYS ================= */}

      {/* 5. Center Vertical Divider */}
      <mesh position={[0, tableTopH / 2, 0]}>
        <boxGeometry args={[thick, tableTopH, B - thick]} />
        <meshStandardMaterial color="#f3f4f6" roughness={0.8} metalness={0.1} />
      </mesh>

      {/* 6. Left Bay Shelf */}
      <mesh position={[-(L / 4), tableTopH / 2, 0]}>
        <boxGeometry args={[L / 2 - thick, thick, B - thick]} />
        <meshStandardMaterial color="#f3f4f6" roughness={0.8} metalness={0.1} />
      </mesh>

      {/* ================= UPPER PIGEONHOLE HUTCH ================= */}

      {/* 7. Hutch Top and Bottom Panels */}
      {[tableTopH + thick / 2, H - thick / 2].map((y, i) => (
        <mesh key={`hutch-horiz-${i}`} position={[0, y, 0]}>
          <boxGeometry args={[L, thick, B]} />
          <meshStandardMaterial color="#f3f4f6" roughness={0.8} metalness={0.1} />
        </mesh>
      ))}

      {/* 8. Hutch Back Wall */}
      <mesh position={[0, tableTopH + hutchH / 2, -(B / 2 - thick / 2)]}>
        <boxGeometry args={[L, hutchH, thick]} />
        <meshStandardMaterial color="#f3f4f6" roughness={0.8} metalness={0.1} />
      </mesh>

      {/* 9. Hutch Dividers: Horizontal (3 rows) */}
      {Array.from({ length: 2 }).map((_, i) => (
        <mesh key={`hutch-shelf-${i}`} position={[0, tableTopH + (hutchH / 3) * (i + 1), 0]}>
          <boxGeometry args={[L - thick * 2, thick, B - thick]} />
          <meshStandardMaterial color="#f3f4f6" roughness={0.8} metalness={0.1} />
        </mesh>
      ))}

      {/* 10. Hutch Dividers: Vertical (8 columns) */}
      {Array.from({ length: 7 }).map((_, i) => (
        <mesh key={`hutch-vert-${i}`} position={[-(L / 2) + (L / 8) * (i + 1), tableTopH + hutchH / 2, 0]}>
          <boxGeometry args={[thick, hutchH - thick * 2, B - thick]} />
          <meshStandardMaterial color="#f3f4f6" roughness={0.8} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
};
