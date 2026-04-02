import { MachinePosition } from "@/types";

const FT = 0.3048;
const Z_LENGTH = 500; 

export const getCuttingLayout = (startX: number, z0Pos: number, z1Pos: number, z2Pos: number, z3Pos: number): MachinePosition[] => [
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
            x: startX + ((2 + (idx * 4.2)) * FT), 
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
        centerModel: true,
    } as any)),
    ...Array.from({ length: 6 }).map((_, idx) => {
        const realIdx = idx + 2; 
        return {
            id: `cutting-fusing-${realIdx + 1}`,
            operation: {
                op_no: `CUT-F-${realIdx + 1}`,
                op_name: 'Special Cutting',
                machine_type: 'cuttingf_sitting',
                smv: 0.5,
                section: 'Storage Area',
            },
            position: { 
                x: startX + ((2 + (realIdx * 4.2)) * FT), 
                y: 0, 
                z: z0Pos + (2 * FT)
            },
            rotation: { x: 0, y: 0, z: 0 },
            lane: 'B',
            section: 'Storage Area',
            tableLength: 4.0,
            tableWidth: 2.5,
            tableHeight: 4.0,
            rotationOffset: Math.PI / 2,
            rotateOperatorAxis: true,
            operatorOnFarSide: true,
            centerModel: true,
            modelRotation: Math.PI / 2,
        };
    }) as any,
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
            x: startX + (10 * FT), 
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
            op_name: 'Relay Table',
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
            op_name: 'Relay and Pinning',
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
            op_name: 'Relay and Pinning',
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
            op_name: 'Supermarket',
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
            op_name: 'Supermarket',
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
            op_name: 'Supermarket',
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
            op_name: 'Supermarket',
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
    ...Array.from({ length: 10 }).map((_, i) => {
        const row = i < 5 ? 0 : 1;
        let col = i < 5 ? 4 - i : 9 - i; 
        const isIron = i === 9; 
        const tableL = 4.0;
        const tableW = 2.5;
        const tableH = 4.0;
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
            op_name: 'Supermarket',
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
            op_name: 'Supermarket',
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
            op_name: 'Supermarket',
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
            op_name: 'Supermarket',
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
            op_name: 'Supermarket',
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
            op_name: 'Supermarket',
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
    } as any,
    {
        id: 'straight-knife-1',
        operation: {
            op_no: 'KNIFE-01',
            op_name: 'Straight Knife',
            machine_type: 'straightknife',
            smv: 0.5,
            section: 'Cutting Zone 2',
        },
        position: { 
            x: startX + (85 * FT), 
            y: 5.5 * FT, 
            z: z2Pos 
        },
        rotation: { x: 0, y: 0, z: 0 },
        lane: 'A',
        section: 'Cutting Zone 2',
        tableLength: 1.0,
        tableWidth: 1.0,
        tableHeight: 2.0,
        centerModel: true,
        hideZone: true,
    } as any,
    {
        id: 'manual-spreader-1',
        operation: {
            op_no: 'MSPR-01',
            op_name: 'Manual Spreader',
            machine_type: 'manual-spreader',
            smv: 0,
            section: 'Cutting Zone 1',
        },
        position: { 
            x: startX + (165 * FT), 
            y: 0, 
            z: z1Pos 
        },
        rotation: { x: 0, y: 0, z: 0 }, 
        lane: 'A',
        section: 'Cutting Zone 1',
        tableWidth: 7.1,
        fabricLength: 25,
        fabricColor: '#1e3a8a' 
    } as any,
    {
        id: 'manual-spreader-2',
        operation: {
            op_no: 'MSPR-02',
            op_name: 'Manual Spreader',
            machine_type: 'manual-spreader',
            smv: 0,
            section: 'Cutting Zone 2',
        },
        position: { 
            x: startX + (90 * FT), 
            y: 0, 
            z: z2Pos 
        },
        rotation: { x: 0, y: Math.PI, z: 0 },
        lane: 'A',
        section: 'Cutting Zone 2',
        tableWidth: 7.1,
        fabricLength: 25,
        fabricColor: '#991b1b' 
    } as any
];
