import React, { useMemo } from "react";
import { Scene3D } from "@/components/3d/Scene3D";
import { SectionLayout, MachinePosition } from "@/types";

const FT = 0.3048;
const Z_LENGTH = 500; // Floor boundary reference

export const CuttingView: React.FC = () => {
    // Dimensions in Feet (converted to meters using FT)
    const z0_w = 8.18, z0_l = 61.7, gap01 = 2.4;
    const z1_w = 9.7, z1_l = 57.6, gap12 = 2.7;
    const z2_w = 10.0, z2_l = 57.6, gap23 = 3.0;
    const z3_w = 10.0, z3_l = 57.6;

    const maxL = Math.max(z0_l + 4 + 109.0, z1_l + 4 + 109.0, z2_l + 4 + 109.0, z3_l);
    const startX = (Z_LENGTH / 2) - (maxL * FT) - (10 * FT);
    const baseZ = -15 * FT;

    // Derived Z Positions (meters)
    const z0Pos = baseZ;
    const z1Pos = z0Pos + (z0_w * FT / 2) + (gap01 * FT) + (z1_w * FT / 2);
    const z2Pos = z1Pos + (z1_w * FT / 2) + (gap12 * FT) + (z2_w * FT / 2);
    const z3Pos = z2Pos + (z2_w * FT / 2) + (gap23 * FT) + (z3_w * FT / 2);

    const cuttingZones = useMemo((): SectionLayout[] => {
        const arr: SectionLayout[] = [];

        arr.push({
            id: 'cutting-z0-storage',
            name: 'Storage Area',
            color: '#94a3b8',
            position: { x: startX, y: 0, z: z0Pos },
            length: (57.12 - 5.4) * FT, // (original gap 2.7 + additional 2.7)
            width: z0_w * FT
        } as any);

        // --- LINE 0 (Front Extension) ---
        arr.push({
            id: 'cutting-z0-ext',
            name: 'Zone 0 Extension',
            color: '#f59e0b',
            position: { x: startX + (57.12 - 2.7) * FT, y: 0, z: z0Pos },
            length: (109.0 - (57.12 - 2.7)) * FT,
            width: z0_w * FT
        } as any);

        arr.push({
            id: 'cutting-z0',
            name: 'Cutting Zone 0',
            color: '#0f172a',
            position: { x: startX + (113 * FT), y: 0, z: z0Pos },
            length: z0_l * FT,
            width: z0_w * FT
        } as any);

        // --- LINE 1 (Front Extension) ---
        arr.push({
            id: 'cutting-z1-ext',
            name: 'Zone 1 Extension',
            color: '#f59e0b',
            position: { x: startX, y: 0, z: z1Pos },
            length: 109.0 * FT,
            width: z1_w * FT
        } as any);

        arr.push({
            id: 'cutting-z1',
            name: 'Cutting Zone 1',
            color: '#1e293b',
            position: { x: startX + (113 * FT), y: 0, z: z1Pos },
            length: z1_l * FT,
            width: z1_w * FT
        } as any);

        // --- LINE 2 (Front Extension) ---
        arr.push({
            id: 'cutting-z2-ext',
            name: 'Zone 2 Extension',
            color: '#f59e0b',
            position: { x: startX, y: 0, z: z2Pos },
            length: 109.0 * FT,
            width: z2_w * FT
        } as any);

        arr.push({
            id: 'cutting-z2',
            name: 'Cutting Zone 2',
            color: '#334155',
            position: { x: startX + (113 * FT), y: 0, z: z2Pos },
            length: z2_l * FT,
            width: z2_w * FT
        } as any);

        // Zone 3: 10ft x 57.6ft (Aligned next to Zone 2 core)
        arr.push({
            id: 'cutting-z3',
            name: 'Cutting Zone 3',
            color: '#475569',
            position: { x: startX + (113 * FT), y: 0, z: z3Pos },
            length: z3_l * FT,
            width: z3_w * FT
        } as any);

        // Collar Production Zone (76ft x 13.3ft) - Aligned with Fusing Station
        arr.push({
            id: 'cutting-collar-zone',
            name: 'Collar Production',
            color: '#1e293b',
            position: { 
                x: startX - (30 * FT), // Move 2ft in X instead of 5ft (-32 + 2)
                y: 0, 
                z: z3Pos + (5 * FT) 
            },
            length: 76 * FT,
            width: 13.3 * FT
        } as any);

        return arr;
    }, [startX, z0Pos, z1Pos, z2Pos, z3Pos]);

    const cuttingMachines = useMemo((): MachinePosition[] => {
        return [
            ...Array.from({ length: 5 }).map((_, idx) => ({
                id: `storage-fusing-${idx + 1}`,
                operation: {
                    op_no: `STR-0${idx + 1}`,
                    op_name: 'Rotary Fusing',
                    machine_type: 'fusing',
                    smv: 0.5,
                    section: 'Storage Area',
                },
                position: { 
                    x: startX + ((2 + (idx * 5.5)) * FT), 
                    y: 0, 
                    z: z0Pos - (2 * FT)
                },
                rotation: { x: 0, y: 0, z: 0 },
                lane: 'A',
                section: 'Storage Area',
                tableLength: 3.0,
                tableWidth: 4.0,
                tableHeight: 5.0,
                rotationOffset: Math.PI / 2,
                rotateOperatorAxis: true,
            } as any)),
            {
                id: 'gerber-1',
                operation: {
                    op_no: 'CUT-01',
                    op_name: 'Gerber Cutter',
                    machine_type: 'gerber',
                    smv: 0,
                    section: 'Cutting Zone 3',
                },
                position: { 
                    x: startX + (113 * FT) + (17.0 * FT / 2) + (1.0 * FT), 
                    y: 0, 
                    z: z3Pos 
                },
                rotation: { x: 0, y: Math.PI, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 3',
                tableLength: 17.0,
                tableWidth: 7.1,
                operatorOnFarSide: true
            } as any,
            {
                id: 'gerber-2',
                operation: {
                    op_no: 'CUT-02',
                    op_name: 'Gerber Cutter',
                    machine_type: 'gerber',
                    smv: 0,
                    section: 'Zone 1 Extension',
                },
                position: { 
                    x: startX + (100.5 * FT), 
                    y: 0, 
                    z: z1Pos 
                },
                rotation: { x: 0, y: 0, z: 0 },
                lane: 'A',
                section: 'Zone 1 Extension',
                tableWidth: 7.1,
                spreadingLength: 85,
                operatorOnFarSide: true
            } as any,
            {
                id: 'spreader-1',
                operation: {
                    op_no: 'SPR-01',
                    op_name: 'Auto Spreader',
                    machine_type: 'auto-spreader',
                    smv: 0,
                    section: 'Zone 1 Extension',
                },
                position: { 
                    x: startX + (50 * FT), 
                    y: 0, 
                    z: z1Pos 
                },
                rotation: { x: 0, y: 0, z: 0 },
                lane: 'A',
                section: 'Zone 1 Extension',
                tableWidth: 7.1
            } as any,
            {
                id: 'gerber-3',
                operation: {
                    op_no: 'TAB-01',
                    op_name: 'Spreading Table',
                    machine_type: 'gerber',
                    smv: 0,
                    section: 'Cutting Zone 2',
                },
                position: { 
                    x: startX + (100.5 * FT), 
                    y: 0, 
                    z: z2Pos 
                },
                rotation: { x: 0, y: 0, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 2',
                tableLength: 17.0,
                tableWidth: 7.1,
                spreadingLength: 85,
                tableOnly: true
            } as any,
            {
                id: 'gerber-4',
                operation: {
                    op_no: 'TAB-02',
                    op_name: 'Spreading Table (Medium)',
                    machine_type: 'gerber',
                    smv: 0,
                    section: 'Cutting Zone 2',
                },
                position: { 
                    x: startX + (113 * FT) + (17.0 * FT / 2) + (1.0 * FT), 
                    y: 0, 
                    z: z2Pos 
                },
                rotation: { x: 0, y: Math.PI, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 2',
                tableLength: 17.0,
                tableWidth: 7.1,
                spreadingLength: 33.9,
                tableOnly: true
            } as any,
            {
                id: 'gerber-5',
                operation: {
                    op_no: 'TAB-03',
                    op_name: 'Spreading Table (Medium)',
                    machine_type: 'gerber',
                    smv: 0,
                    section: 'Cutting Zone 1',
                },
                position: { 
                    x: startX + (125.6 * FT), 
                    y: 0, 
                    z: z1Pos 
                },
                rotation: { x: 0, y: Math.PI, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 1',
                tableLength: 17.0,
                tableWidth: 7.1,
                spreadingLength: 33.9,
                tableOnly: true
            } as any,
            {
                id: 'gerber-7',
                operation: {
                    op_no: 'TAB-05',
                    op_name: 'Spreading Table (Small)',
                    machine_type: 'gerber',
                    smv: 0,
                    section: 'Cutting Zone 2',
                },
                position: { 
                    x: (startX + (113 * FT) + (17.0 * FT / 2) + (1.0 * FT)) - (13.8 * FT), 
                    y: 0, 
                    z: z2Pos 
                },
                rotation: { x: 0, y: Math.PI, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 2',
                tableLength: 17.0,
                tableWidth: 7,
                spreadingLength: 11.3,
                tableOnly: true
            } as any,
            {
                id: 'gerber-8',
                operation: {
                    op_no: 'TAB-06',
                    op_name: 'Narrow Spreading Table',
                    machine_type: 'gerber',
                    smv: 0,
                    section: 'Cutting Zone 0',
                },
                position: { 
                    x: startX + (150.3 * FT), 
                    y: 0, 
                    z: z0Pos - (1.79 * FT) 
                },
                rotation: { x: 0, y: Math.PI, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 0',
                tableLength: 17.0,
                tableWidth: 3.2,
                spreadingLength: 12.2,
                tableOnly: true
            } as any,
            {
                id: 'supermarket-zone0-1',
                operation: {
                    op_no: 'SM-01',
                    op_name: 'Zone 0 Supermarket',
                    machine_type: 'supermarket',
                    smv: 0,
                    section: 'Cutting Zone 0',
                },
                position: { 
                    x: startX + (169.0 * FT), 
                    y: 0, 
                    z: z0Pos + (3.1 * FT)
                },
                rotation: { x: 0, y: Math.PI, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 0',
                tableLength: 6.0,
                tableWidth: 2.0,
                tableHeight: 7.0,
            } as any,
            {
                id: 'supermarket-zone0-2',
                operation: {
                    op_no: 'SM-02',
                    op_name: 'Zone 0 Supermarket',
                    machine_type: 'supermarket',
                    smv: 0,
                    section: 'Cutting Zone 0',
                },
                position: { 
                    x: startX + (174.0 * FT), 
                    y: 0, 
                    z: z0Pos + (1.6 * FT)
                },
                rotation: { x: 0, y: -Math.PI / 2, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 0',
                tableLength: 6.0,
                tableWidth: 2.0,
                tableHeight: 7.0,
            } as any,
            {
                id: 'gerber-9',
                operation: {
                    op_no: 'TAB-07',
                    op_name: 'Narrow Spreading Table',
                    machine_type: 'gerber',
                    smv: 0,
                    section: 'Cutting Zone 0',
                },
                position: { 
                    x: startX + (131.0 * FT), 
                    y: 0, 
                    z: z0Pos - (1.79 * FT) 
                },
                rotation: { x: 0, y: Math.PI, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 0',
                tableLength: 17.0,
                tableWidth: 3.2,
                spreadingLength: 12.2,
                tableOnly: true
            } as any,
            {
                id: 'supermarket-zone0-3',
                operation: {
                    op_no: 'SM-03',
                    op_name: 'Zone 0 Supermarket',
                    machine_type: 'supermarket',
                    smv: 0,
                    section: 'Cutting Zone 0',
                },
                position: { 
                    x: startX + (149.7 * FT), 
                    y: 0, 
                    z: z0Pos + (3.1 * FT)
                },
                rotation: { x: 0, y: Math.PI, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 0',
                tableLength: 6.0,
                tableWidth: 2.0,
                tableHeight: 7.0,
            } as any,
            {
                id: 'supermarket-zone0-4',
                operation: {
                    op_no: 'SM-04',
                    op_name: 'Zone 0 Supermarket',
                    machine_type: 'supermarket',
                    smv: 0,
                    section: 'Cutting Zone 0',
                },
                position: { 
                    x: startX + (154.7 * FT), 
                    y: 0, 
                    z: z0Pos + (1.6 * FT)
                },
                rotation: { x: 0, y: -Math.PI / 2, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 0',
                tableLength: 6.0,
                tableWidth: 2.0,
                tableHeight: 7.0,
            } as any,
            // 10x PRODUCTION BLOCK (9x SNLS + 1x IRON PRESS) - Rotated 180 Sets
            ...Array.from({ length: 10 }).map((_, i) => {
                const row = i < 5 ? 0 : 1;
                // Reverse Row 0 (0-4) and Row 1 (5-9) correctly
                let col = i < 5 ? 4 - i : 9 - i; 
                
                const isIron = i === 9; 
                
                const tableL = 4.0;
                const tableW = 2.5;
                const tableH = 4.0;
                
                // Add shifts for Iron only
                const xShift = isIron ? 0 : 0;
                const zShift = isIron ? 2 * FT : 0;
                
                return {
                    id: `mc-zone0-${i}`,
                    operation: {
                        op_no: `MC-${i+1}`,
                        op_name: isIron ? 'Iron Press' : 'SNLS',
                        machine_type: isIron ? 'iron' : 'snls',
                        smv: 0.5,
                        section: 'Cutting Zone 0',
                    },
                    position: { 
                        x: startX + (118 * FT) + (col * tableL * FT) + xShift, 
                        y: 0, 
                        z: z0Pos + (row * tableW * FT) - (1.25 * FT) + zShift
                    },
                    rotation: { x: 0, y: row === 0 ? Math.PI : 0, z: 0 }, 
                    lane: row === 0 ? 'B' : 'A',
                    section: 'Cutting Zone 0',
                    tableWidth: tableW,
                    tableLength: tableL,
                    tableHeight: tableH,
                    hideIronBox: isIron ? true : false,
                } as any;
            }),
            {
                id: 'gerber-11',
                operation: {
                    op_no: 'TAB-09',
                    op_name: 'Narrow Spreading Table',
                    machine_type: 'gerber',
                    smv: 0,
                    section: 'Zone 0 Extension',
                },
                position: { 
                    x: startX + (84.52 * FT), 
                    y: 0, 
                    z: z0Pos - (1.79 * FT) 
                },
                rotation: { x: 0, y: Math.PI, z: 0 },
                lane: 'A',
                section: 'Zone 0 Extension',
                tableLength: 17.0,
                tableWidth: 3.2,
                spreadingLength: 12.2,
                tableOnly: true
            } as any,
            {
                id: 'supermarket-zone0-5',
                operation: {
                    op_no: 'SM-05',
                    op_name: 'Zone 0 Supermarket',
                    machine_type: 'supermarket',
                    smv: 0,
                    section: 'Zone 0 Extension',
                },
                position: { 
                    x: startX + (103.22 * FT), 
                    y: 0, 
                    z: z0Pos + (3.1 * FT)
                },
                rotation: { x: 0, y: Math.PI, z: 0 },
                lane: 'A',
                section: 'Zone 0 Extension',
                tableLength: 6.0,
                tableWidth: 2.0,
                tableHeight: 7.0,
            } as any,
            {
                id: 'supermarket-zone0-6',
                operation: {
                    op_no: 'SM-06',
                    op_name: 'Zone 0 Supermarket',
                    machine_type: 'supermarket',
                    smv: 0,
                    section: 'Zone 0 Extension',
                },
                position: { 
                    x: startX + (108.22 * FT), 
                    y: 0, 
                    z: z0Pos + (1.6 * FT)
                },
                rotation: { x: 0, y: -Math.PI / 2, z: 0 },
                lane: 'A',
                section: 'Zone 0 Extension',
                tableLength: 6.0,
                tableWidth: 2.0,
                tableHeight: 7.0,
            } as any,
            {
                id: 'gerber-12',
                operation: {
                    op_no: 'TAB-10',
                    op_name: 'Narrow Spreading Table',
                    machine_type: 'gerber',
                    smv: 0,
                    section: 'Zone 0 Extension',
                },
                position: { 
                    x: startX + (65.82 * FT), 
                    y: 0, 
                    z: z0Pos - (1.79 * FT) 
                },
                rotation: { x: 0, y: Math.PI, z: 0 },
                lane: 'A',
                section: 'Zone 0 Extension',
                tableLength: 17.0,
                tableWidth: 3.2,
                spreadingLength: 12.2,
                tableOnly: true
            } as any,
            {
                id: 'supermarket-zone0-7',
                operation: {
                    op_no: 'SM-07',
                    op_name: 'Zone 0 Supermarket',
                    machine_type: 'supermarket',
                    smv: 0,
                    section: 'Zone 0 Extension',
                },
                position: { 
                    x: startX + (84.52 * FT), 
                    y: 0, 
                    z: z0Pos + (3.1 * FT)
                },
                rotation: { x: 0, y: Math.PI, z: 0 },
                lane: 'A',
                section: 'Zone 0 Extension',
                tableLength: 6.0,
                tableWidth: 2.0,
                tableHeight: 7.0,
            } as any,
            {
                id: 'supermarket-zone0-8',
                operation: {
                    op_no: 'SM-08',
                    op_name: 'Zone 0 Supermarket',
                    machine_type: 'supermarket',
                    smv: 0,
                    section: 'Zone 0 Extension',
                },
                position: { 
                    x: startX + (89.52 * FT), 
                    y: 0, 
                    z: z0Pos + (1.6 * FT)
                },
                rotation: { x: 0, y: -Math.PI / 2, z: 0 },
                lane: 'A',
                section: 'Zone 0 Extension',
                tableLength: 6.0,
                tableWidth: 2.0,
                tableHeight: 7.0,
            } as any,
            {
                id: 'gerber-13',
                operation: {
                    op_no: 'TAB-11',
                    op_name: 'Narrow Spreading Table',
                    machine_type: 'gerber',
                    smv: 0,
                    section: 'Zone 0 Extension',
                },
                position: { 
                    x: startX + (47.72 * FT), 
                    y: 0, 
                    z: z0Pos - (1.79 * FT) 
                },
                rotation: { x: 0, y: Math.PI, z: 0 },
                lane: 'A',
                section: 'Zone 0 Extension',
                tableLength: 17.0,
                tableWidth: 3.2,
                spreadingLength: 12.2,
                tableOnly: true
            } as any,
            {
                id: 'supermarket-zone0-9',
                operation: {
                    op_no: 'SM-09',
                    op_name: 'Zone 0 Supermarket',
                    machine_type: 'supermarket',
                    smv: 0,
                    section: 'Zone 0 Extension',
                },
                position: { 
                    x: startX + (66.42 * FT), 
                    y: 0, 
                    z: z0Pos + (3.1 * FT)
                },
                rotation: { x: 0, y: Math.PI, z: 0 },
                lane: 'A',
                section: 'Zone 0 Extension',
                tableLength: 6.0,
                tableWidth: 2.0,
                tableHeight: 7.0,
            } as any,
            {
                id: 'supermarket-zone0-10',
                operation: {
                    op_no: 'SM-10',
                    op_name: 'Zone 0 Supermarket',
                    machine_type: 'supermarket',
                    smv: 0,
                    section: 'Zone 0 Extension',
                },
                position: { 
                    x: startX + (71.42 * FT), 
                    y: 0, 
                    z: z0Pos + (1.6 * FT)
                },
                rotation: { x: 0, y: -Math.PI / 2, z: 0 },
                lane: 'A',
                section: 'Zone 0 Extension',
                tableLength: 6.0,
                tableWidth: 2.0,
                tableHeight: 7.0,
            } as any,
            {
                id: 'bandknife-2',
                operation: {
                    op_no: 'BK-02',
                    op_name: 'Bandknife',
                    machine_type: 'bandknife',
                    smv: 0,
                    section: 'Cutting Zone 3',
                },
                position: { 
                    x: startX + (113 * FT) - (6.7 * FT), 
                    y: 0, 
                    z: z3Pos + (4.47 * FT) 
                },
                rotation: { x: 0, y: Math.PI / 2, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 3',
                centerModel: true
            } as any,
            {
                id: 'bandknife-3',
                operation: {
                    op_no: 'BK-03',
                    op_name: 'Bandknife',
                    machine_type: 'bandknife',
                    smv: 0,
                    section: 'Cutting Zone 3',
                },
                position: { 
                    x: startX + (113 * FT) - (13.2 * FT), 
                    y: 0, 
                    z: z3Pos + (4.47 * FT) 
                },
                rotation: { x: 0, y: Math.PI / 2, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 3',
                centerModel: true
            } as any,
            {
                id: 'bandknife-4',
                operation: {
                    op_no: 'BK-04',
                    op_name: 'Bandknife',
                    machine_type: 'bandknife',
                    smv: 0,
                    section: 'Cutting Zone 3',
                },
                position: { 
                    x: startX + (113 * FT) - (19.7 * FT), 
                    y: 0, 
                    z: z3Pos + (4.47 * FT) 
                },
                rotation: { x: 0, y: Math.PI / 2, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 3',
                centerModel: true
            } as any,
            {
                id: 'bandknife-5',
                operation: {
                    op_no: 'BK-05',
                    op_name: 'Bandknife',
                    machine_type: 'bandknife',
                    smv: 0,
                    section: 'Cutting Zone 3',
                },
                position: { 
                    x: startX + (113 * FT) - (26.2 * FT), 
                    y: 0, 
                    z: z3Pos + (4.47 * FT) 
                },
                rotation: { x: 0, y: Math.PI / 2, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 3',
                centerModel: true
            } as any,
            {
                id: 'spreading-table-1',
                operation: {
                    op_no: 'SPT-01',
                    op_name: 'Spreading Table',
                    machine_type: 'gerber',
                    section: 'Cutting Zone 3',
                },
                tableOnly: true,
                tableLength: 17,
                tableWidth: 10,
                position: { 
                    x: startX + (113 * FT) - (21.96 * FT), 
                    y: 0, 
                    z: z3Pos + (4.47 * FT) 
                },
                rotation: { x: 0, y: 0, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 3',
                centerModel: true
            } as any,
            {
                id: 'fusing-custom-1',
                operation: {
                    op_no: 'FM-01',
                    op_name: 'Custom Fusing Machine',
                    machine_type: 'fusing_custom',
                    section: 'Cutting Zone 3',
                },
                tableLength: 24.4,
                tableWidth: 5.7,
                tableHeight: 5,
                position: { 
                    x: startX + (113 * FT) - (89.66 * FT), 
                    y: 0, 
                    z: z3Pos + (4.47 * FT) 
                },
                rotation: { x: 0, y: 0, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 3',
                centerModel: true,
                tableOnly: true
            } as any,
            {
                id: 'fusing-custom-2',
                operation: {
                    op_no: 'FM-02',
                    op_name: 'Custom Fusing Machine',
                    machine_type: 'fusing_custom',
                    section: 'Cutting Zone 3',
                },
                tableLength: 24.4,
                tableWidth: 5.7,
                tableHeight: 5,
                position: { 
                    x: startX + (113 * FT) - (89.66 * FT) - (24.4 * FT) - (7 * FT), 
                    y: 0, 
                    z: z3Pos + (4.47 * FT) 
                },
                rotation: { x: 0, y: 0, z: 0 },
                lane: 'A',
                section: 'Cutting Zone 3',
                centerModel: true,
                tableOnly: true
            } as any
        ];
    }, [startX, z0Pos, z1Pos, z2Pos, z3Pos]);

    return (
        <Scene3D
            showMachines={true}
            machines={cuttingMachines}
            sections={cuttingZones}
            cameraPosition={[110, 100, 50]}
            target={[startX + (maxL * FT) / 2, 0, (z0Pos + z3Pos) / 2]}
            isOverview={true}
        />
    );
};
