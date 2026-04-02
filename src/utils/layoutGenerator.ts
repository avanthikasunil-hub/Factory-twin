import { v4 as uuidv4 } from 'uuid';
import type { Operation, MachinePosition, SectionLayout } from '@/types';
import { calculateMachineRequirements } from './lineBalancing';

// Constants (Units: Approx Meters)
export const LANE_Z_CENTER_AB = -3.92;
export const LANE_Z_CENTER_CD = 0.0;

export const LANE_Z_A = -5.2;
export const LANE_Z_B = -6.8;
export const LANE_Z_C = 0.75;
export const LANE_Z_D = -0.75;

export const MACHINE_SPACING_X = 0;
export const SECTION_GAP_X = 0;
export const INSPECTION_GAP = 1.0 * 0.3048; // 1ft gap between last machine and inspection

// Rotations (Radians)
export const ROT_FACE_FRONT = -Math.PI / 2;
export const ROT_FACE_BACK = Math.PI / 2;
export const ROT_ROTARY_FUSING = -Math.PI / 2; // Exactly -90 degrees

export const FT = 0.3048;

export const LAYOUT_LOGIC_VERSION = 185;
export const FIXED_ASSEMBLY_START = 0;

export interface SectionPreset {
    length: number;
    width: number;
    group: 'AB' | 'CD';
}

export const LINE_PRESETS: Record<'A' | 'B', Record<string, SectionPreset>> = {
    A: {
        cuff: { length: 34.34, width: 9.3009, group: 'AB' },
        sleeve: { length: 25.00, width: 9.3009, group: 'AB' },
        back: { length: 43.69, width: 9.3009, group: 'AB' },
        collar: { length: 62.00, width: 10.2098, group: 'CD' },
        front: { length: 43.80, width: 10.2098, group: 'CD' },
        'assembly 1': { length: 56.03, width: 9.3009, group: 'AB' },
        'assembly 2': { length: 56.02, width: 10.2098, group: 'CD' }
    },
    B: {
        cuff: { length: 30.9, width: 9.025, group: 'AB' },
        sleeve: { length: 25.00, width: 9.025, group: 'AB' },
        back: { length: 43.69, width: 9.025, group: 'AB' },
        collar: { length: 58.70, width: 9.000, group: 'CD' },
        front: { length: 43.80, width: 9.000, group: 'CD' },
        'assembly 1': { length: 56.03, width: 9.025, group: 'AB' },
        'assembly 2': { length: 56.02, width: 9.000, group: 'CD' }
    }
};

export function getLayoutSpecs(lineNo: string = "Line 1") {
    const num = parseInt(lineNo.replace(/\D/g, '')) || 1;
    // Yorker Request: Preset B is for Line 6 AND Lines 7-9. Lines 1-5 use Preset A.
    const presetKey = (num >= 6) ? 'B' : 'A';
    const p = JSON.parse(JSON.stringify(LINE_PRESETS[presetKey])); // Clone to avoid mutating global
    const pA = JSON.parse(JSON.stringify(LINE_PRESETS['A']));

    // Yorker Request v195: Assembly L=46 in Line 1-6, L=56 in Line 7-9
    const assLen = num >= 7 ? 56 : 46;
    p['assembly 1'].length = assLen;
    p['assembly 2'].length = assLen;
    pA['assembly 1'].length = assLen;
    pA['assembly 2'].length = assLen;

    const S = FT;

    // Fixed End Points always based on Preset A for visual consistency on the floor
    const cuffEnd = (0.2719 + pA.cuff.length) * S;
    const sleeveEnd = (cuffEnd + 2.9319 * S + pA.sleeve.length * S);
    const backEnd = (sleeveEnd + 4.0 * S + pA.back.length * S);

    const collarEnd = (0.2719 + pA.collar.length) * S;
    const frontEnd = (collarEnd + 4.0 * S + pA.front.length * S);

    // Assembly starts are forced to align with the AB back end + 4.11m gap
    const assemblyStart = (backEnd + 4.11 * S);

    const sections = {
        cuff: { start: cuffEnd - (p.cuff.length * S), end: cuffEnd },
        sleeve: { start: cuffEnd, end: sleeveEnd }, 
        back: { start: backEnd - (p.back.length * S), end: backEnd },
        collar: { start: collarEnd - (p.collar.length * S), end: collarEnd },
        front: { start: frontEnd - (p.front.length * S), end: frontEnd },
        assemblyAB: { start: assemblyStart, end: assemblyStart + (p['assembly 1'].length * S) },
        assemblyCD: { start: assemblyStart, end: assemblyStart + (p['assembly 2'].length * S) }
    };

    const specs = {
        ...sections,
        widthAB: p.cuff.width * S,
        widthCD: p.collar.width * S,
        preset: presetKey,
        sections // For easier indexing
    };

    const zonesAB = [
        { start: sections.cuff.start, end: sections.cuff.end },
        { start: sections.sleeve.start, end: sections.sleeve.end },
        { start: sections.back.start, end: sections.back.end },
        { start: sections.assemblyAB.start, end: sections.assemblyAB.end }
    ];

    const zonesCD = [
        { start: sections.collar.start, end: sections.collar.end },
        { start: sections.front.start, end: sections.front.end },
        { start: sections.assemblyCD.start, end: sections.assemblyCD.end }
    ];

    const partBounds = {
        cuff: specs.cuff,
        sleeve: specs.sleeve,
        back: specs.back,
        collar: specs.collar,
        front: specs.front
    };

    return { zonesAB, zonesCD, partBounds, specs, sections };
}

export const ZONES_AB = getLayoutSpecs().zonesAB;
export const ZONES_CD = getLayoutSpecs().zonesCD;
export const PART_BOUNDS = getLayoutSpecs().partBounds;

const PARTS_ORDER = ['cuff', 'sleeve', 'back', 'collar', 'front'];

export function findOverflowSection(currentSection: string, cursors?: LaneCursors, isAB?: boolean) {
    const s = currentSection.toLowerCase();

    // Explicit User Flow Rules
    if (s.includes('front')) return 'Collar';
    if (s.includes('sleeve')) return 'Back';
    if (s.includes('cuff')) return 'Sleeve';
    if (s.includes('collar')) return 'Front';
    if (s.includes('back')) return 'Sleeve'; // Allow spill backward if needed in AB group

    const idx = PARTS_ORDER.findIndex(tag => s.includes(tag));
    if (idx === -1) return currentSection;

    // Fallback search within the same group (AB or CD)
    // Primary: Forward search
    for (let i = idx + 1; i < PARTS_ORDER.length; i++) {
        const secName = PARTS_ORDER[i];
        const secIsAB = ['cuff', 'sleeve', 'back'].includes(secName);
        if (secIsAB === isAB) return secName.charAt(0).toUpperCase() + secName.slice(1);
    }

    // Secondary: Backward search
    for (let i = idx - 1; i >= 0; i--) {
        const secName = PARTS_ORDER[i];
        const secIsAB = ['cuff', 'sleeve', 'back'].includes(secName);
        if (secIsAB === isAB) return secName.charAt(0).toUpperCase() + secName.slice(1);
    }

    return currentSection;
}

export const getNextValidX = (currentX: number, machineLength: number, zones: { start: number, end: number }[]): number => {
    let x = currentX;
    for (const zone of zones) {
        const potentialStart = Math.max(x, zone.start);
        if (potentialStart + machineLength <= zone.end) {
            return potentialStart;
        }
    }
    return x;
};

interface LaneCursors {
    A: number;
    B: number;
    C: number;
    D: number;
}

export interface LayoutResult {
    machines: MachinePosition[];
    sections: SectionLayout[];
    warnings?: string[];
}

export const getMachineZoneDims = (type: string) => {
    const t = type.toLowerCase();
    const FT = 0.3048;
    let l = 4 * FT, w = 2.5 * FT, h = 3.5 * FT; // Added default h

    if (t.includes('foa') || t.includes('feed off arm')) { l = 4.5 * FT; }
    else if (t.includes('turning')) { l = 4.0 * FT; w = 2.5 * FT; }
    else if (t.includes('pointing')) { l = 3.5 * FT; w = 2.5 * FT; }
    else if (t.includes('contour')) { l = 4.5 * FT; w = 3 * FT; }
    else if (t.includes('pressing') || (t.includes('press') && !t.includes('iron'))) { l = 4.72 * FT; w = 4.0 * FT; }
    else if (t.includes('iron') || t.includes('press')) { l = 4.0 * FT; w = 3.0 * FT; }
    else if (t.includes('helper') || t.includes('work table') || t.includes('table') || t.includes('trolley')) { l = 4.5 * FT; w = 2.5 * FT; }
    else if (t.includes('outinspection') || t.includes('outsideinspection') || t.includes('outside inspection')) { l = 5.0 * FT; w = 4.0 * FT; h = 8.5 * FT; }
    else if (t.includes('inspection')) { l = 5.0 * FT; w = 4.0 * FT; h = 8.5 * FT; }
    else if (t.includes('checking')) { l = 5.0 * FT; w = 4.0 * FT; h = 8.5 * FT; }
    else if (t.includes('fusing') || t.includes('rotary')) { l = 4.5 * FT; w = 3.0 * FT; }
    else if (t.includes('blocking')) { l = 4.0 * FT; w = 2.5 * FT; }
    else if (t.includes('supermarket')) { l = 6.0 * FT; w = 2.5 * FT; }

    return { length: l, width: w, height: h };
};

export const generateLayout = (
    rawOperations: Operation[],
    targetOutput: number,
    workingHours: number,
    efficiency: number = 100,
    lineNo: string = "Line 1"
): LayoutResult => {
    const layout: MachinePosition[] = [];
    const sectionLayouts: SectionLayout[] = [];
    const warnings: string[] = [];

    // ─── Parallel Balancing ───
    const assemblyKeywords = ['assembly', 'joining', 'stitching', 'sewing', 'lane', 'line'];
    const isAssemblyOp = (op: Operation) => {
        const sec = (op.section || '').toLowerCase();
        return assemblyKeywords.some(kw => sec.includes(kw));
    };

    const assemblyOps = rawOperations.filter(isAssemblyOp);
    const prepOps = rawOperations.filter(op => !isAssemblyOp(op));

    const balancedPrep = calculateMachineRequirements(prepOps, targetOutput, workingHours, efficiency);
    // Use the FULL target output for assembly — the placement logic handles the per-line distribution
    const balancedAssembly = calculateMachineRequirements(assemblyOps, targetOutput, workingHours, efficiency);

    const balancedOps = [...balancedPrep, ...balancedAssembly];

    const { zonesAB, zonesCD, partBounds, specs } = getLayoutSpecs(lineNo);
    const S = FT;

    const sectionsMap = new Map<string, typeof balancedOps>();
    const sectionOrder: string[] = [];

    balancedOps.forEach(item => {
        const opName = item.operation.op_name.toLowerCase();
        const mType = item.operation.machine_type.toLowerCase();

        // v185: Removed hardcoded IGNORED_OPERATIONS filter. 
        // Staging (Preparatory) logic is now handled dynamically by the LineStore/OB Parser
        // through the operations/preparatoryOps lists.

        if (!item.operation.machine_type || item.operation.machine_type.toLowerCase() === 'unknown') {
            item.operation.machine_type = 'Helper Table';
        }

        const sec = item.operation.section || 'Unknown';
        if (sec === 'Unknown') {
            console.warn('[layoutGenerator] Skipping op with Unknown section:', item.operation.op_name);
            return;
        }

        if (!sectionsMap.has(sec)) {
            sectionsMap.set(sec, []);
            sectionOrder.push(sec);
        }
        sectionsMap.get(sec)!.push(item);
    });

    const assemblyKeys = Array.from(sectionsMap.keys()).filter(k =>
        assemblyKeywords.some(kw => k.toLowerCase().includes(kw))
    );

    const mergedAssemblyOps: typeof balancedOps = [];
    assemblyKeys.forEach(k => {
        mergedAssemblyOps.push(...sectionsMap.get(k)!);
        sectionsMap.delete(k);
        const idx = sectionOrder.indexOf(k);
        if (idx !== -1) sectionOrder.splice(idx, 1);
    });

    if (mergedAssemblyOps.length > 0) {
        sectionsMap.set("Assembly", mergedAssemblyOps);
        if (!sectionOrder.includes("Assembly")) sectionOrder.push("Assembly");
    }

    const cursors: LaneCursors = { A: 0, B: 0, C: 0, D: 0 };
    const zones = { AB: zonesAB, CD: zonesCD };
    const abSections = ['cuff', 'sleeve', 'back'];
    const cdSections = ['collar', 'front'];

    const addMachine = (op: Operation, lane: 'A' | 'B' | 'C' | 'D', xPos: number, countIdx?: number, forcedRot?: number, sectionName?: string, centerModel?: boolean) => {
        const secLower = sectionName?.toLowerCase() || '';
        let z = 0, ry = 0;
        if (lane === 'A') { z = LANE_Z_A; ry = 0; }
        else if (lane === 'B') { z = LANE_Z_B; ry = Math.PI; }
        else if (lane === 'C') { z = LANE_Z_C; ry = 0; }
        else if (lane === 'D') { z = LANE_Z_D; ry = Math.PI; }

        if (op.machine_type.toLowerCase().includes('inspection')) ry = ROT_FACE_FRONT;
        if (op.machine_type.toLowerCase().includes('rotary')) ry = ROT_ROTARY_FUSING;
        if (forcedRot !== undefined) ry = forcedRot;
        if (secLower.includes('assembly') && op.op_no === 'A-13') ry += Math.PI / 2;

        const isAssembly = secLower.includes('assembly') || secLower.includes('lane') || secLower.includes('line') || secLower.includes('joining');
        if (secLower.includes('cuff') || secLower.includes('sleeve') || secLower.includes('front') || secLower.includes('back') || secLower.includes('collar') || isAssembly) {
            if (isAssembly) { if (forcedRot === undefined) ry = (lane === 'B' || lane === 'C') ? ROT_FACE_FRONT : ROT_FACE_BACK; }
            else if (forcedRot === undefined) { ry = (lane === 'A' || lane === 'C') ? 0 : Math.PI; }

            const dims = getMachineZoneDims(op.machine_type);
            const needsOp = !op.machine_type.toLowerCase().includes('supermarket') && !op.machine_type.toLowerCase().includes('trolley');
            const getHumanDepth = (rY: number) => {
                if (!needsOp) return 0;
                const isStanding = op.machine_type.toLowerCase().includes('iron') || op.machine_type.toLowerCase().includes('table');
                return isStanding ? 0.55 : 0.65;
            };

            const computeBounds = (rY: number) => {
                const humanZ = getHumanDepth(rY);
                const maxLZ = Math.max(dims.width / 2, humanZ);
                const minLZ = -dims.width / 2;
                const minLX = -dims.length / 2;
                const maxLX = dims.length / 2;
                const corners = [{ x: minLX, z: minLZ }, { x: maxLX, z: minLZ }, { x: minLX, z: maxLZ }, { x: maxLX, z: maxLZ }];
                let minWZ = Infinity, maxWZ = -Infinity;
                corners.forEach(p => {
                    const wz = -p.x * Math.sin(rY) + p.z * Math.cos(rY);
                    if (wz < minWZ) minWZ = wz;
                    if (wz > maxWZ) maxWZ = wz;
                });
                return { minWZ, maxWZ };
            };

            const b = computeBounds(ry);
            const midZ = (lane === 'A' || lane === 'B') ? LANE_Z_CENTER_AB : LANE_Z_CENTER_CD;
            z = (lane === 'A' || lane === 'C') ? midZ - b.minWZ : midZ - b.maxWZ;
        }

        if (!sectionCounters[sectionName || op.section]) {
            sectionCounters[sectionName || op.section] = 1;
        }
        const mIdx = countIdx ?? sectionCounters[sectionName || op.section]++;

        layout.push({
            id: `${op.op_no}-${mIdx}-${uuidv4()}`,
            operation: op,
            position: { x: xPos, y: 0, z },
            rotation: { x: 0, y: ry, z: 0 },
            lane,
            section: sectionName || op.section,
            machineIndex: mIdx - 1,
            centerModel: centerModel || op.machine_type.toLowerCase().includes('table'),
            showOperator: true // Every machine should have an operator
        });
    };

    const processingOrder: string[] = [];
    const desiredTags = ['cuff', 'sleeve', 'back', 'collar', 'front', 'assembly'];
    desiredTags.forEach(tag => {
        const matches = Array.from(sectionsMap.keys()).filter(k => k.toLowerCase().includes(tag));
        matches.forEach(m => { if (!processingOrder.includes(m)) processingOrder.push(m); });
    });
    Array.from(sectionsMap.keys()).forEach(sec => { if (!processingOrder.includes(sec)) processingOrder.push(sec); });

    const alignmentOffset = 0.2719 * FT;
    const sectionSpaceViolators: string[] = [];

    const sectionTails: Record<string, { lTail: number, rTail: number }> = {};
    const spillPending: Record<string, { ops: any[], isNext: boolean, sourceSection?: string }> = {};
    const isSpilledForward: Record<string, boolean> = {};

    // --- PHASE 1: PRE-CALCULATE SPILLS ---
    const sectionSpace: Record<string, { availableLen: number, usedLen: number }> = {};
    for (const tag of PARTS_ORDER) {
        const tagSpec = specs.sections[tag as keyof typeof specs.sections];
        const zoneLen = tagSpec ? (tagSpec.end - tagSpec.start) : 0;
        const iDims = getMachineZoneDims('inspection');
        const sDims = getMachineZoneDims('supermarket');
        let reservedX = iDims.length + 3 * INSPECTION_GAP + 0.01;
        if (tag === 'front' || tag === 'back') reservedX += sDims.width + 0.1;
        // Reserve space for 3 collar supermarkets
        if (tag === 'collar') reservedX += sDims.width * 3 + 0.3;
        sectionSpace[tag] = { availableLen: Math.max(0, zoneLen - reservedX), usedLen: 0 };
    }

    for (const secName of processingOrder) {
        const secLower = secName.toLowerCase();
        const ops = sectionsMap.get(secName)!;
        const matchedTag = PARTS_ORDER.find(tag => secLower.includes(tag));
        if (matchedTag && !secLower.includes('assembly')) {
            let lane1X = 0, lane2X = 0;
            let alt = 0;
            for (const item of ops) {
                const w = getMachineZoneDims(item.operation.machine_type).length;
                for (let k = 0; k < item.count; k++) {
                    if (alt % 2 === 0) lane1X += w;
                    else lane2X += w;
                    alt++;
                }
            }
            sectionSpace[matchedTag].usedLen += Math.max(lane1X, lane2X);
        }
    }

    const sectionCounters: Record<string, number> = {};
    Array.from(sectionsMap.keys()).forEach(k => sectionCounters[k] = 1);

    // --- PHASE 2: PLACEMENT LOOP ---
    for (const secName of processingOrder) {
        const secLower = secName.toLowerCase();
        const ops = sectionsMap.get(secName)!;

        const isAB = abSections.some(s => secLower.includes(s));
        const matchedTag = PARTS_ORDER.find(tag => secLower.includes(tag));
        const targetSpecsEarly = matchedTag ? specs.sections[matchedTag as keyof typeof specs.sections] : null;
        const zoneBounds = targetSpecsEarly || (matchedTag ? PART_BOUNDS[matchedTag] : { start: 0, end: 500 });

        // v195: Move machines back to follow natural sequence, avoiding forced forward drift.
        let alternatingX = isAB ? Math.max(cursors.A, cursors.B) : Math.max(cursors.C, cursors.D);
        if (alternatingX < 0.3 * S) alternatingX = 0.2719 * S; // Initial start for first section

        const isAssemblySec = secLower.includes('assembly');
        if (isAssemblySec) {
            const startX_AssemblyAB = specs.assemblyAB.start;
            const startX_AssemblyCD = specs.assemblyCD.start;
            const ASSEMBLY_GAP = 0.05;

            // 1. Initialize cursors for A1, A2, A3 at the transition point
            const laneCursors = { 
                B: startX_AssemblyAB + (ops[0] ? getMachineZoneDims(ops[0].operation.machine_type).length / 2 : 2 * FT), 
                A: startX_AssemblyAB + (ops[0] ? getMachineZoneDims(ops[0].operation.machine_type).length / 2 : 2 * FT), 
                D: startX_AssemblyCD + (ops[0] ? getMachineZoneDims(ops[0].operation.machine_type).length / 2 : 2 * FT), 
                C: startX_AssemblyCD + (ops[0] ? getMachineZoneDims(ops[0].operation.machine_type).length / 2 : 2 * FT)
            };
            const laneSections: Record<string, string> = { B: 'Assembly 1', A: 'Assembly 2', D: 'Assembly 3', C: 'Assembly 4' };

            const a4Ops = ops.slice(0, 3).reverse(); 
            a4Ops.forEach((item) => {
                const { operation, count } = item;
                const dims = getMachineZoneDims(operation.machine_type);
                const step = dims.length + ASSEMBLY_GAP;

                for (let k = 0; k < count; k++) {
                    const xPos = laneCursors.C;
                    addMachine(operation, 'C', xPos, sectionCounters[laneSections.C]++, Math.PI / 2, laneSections.C, true);
                    laneCursors.C += step;
                }
            });

            // v190: Place Assembly 4 (Lane C) Helpers at the VERY END
            const hDims = getMachineZoneDims("Helper Table");
            for (let i = 0; i < 2; i++) {
                addMachine(
                    { op_no: 'H-C', op_name: 'Helper Table', machine_type: 'Helper Table', smv: 0, section: 'Assembly 4' },
                    'C',
                    laneCursors.C + hDims.length / 2,
                    i + 1,
                    0,
                    "Assembly 4",
                    true
                );
                laneCursors.C += hDims.length + ASSEMBLY_GAP;
            }

            // 4. Main Assembly (A1, A2, A3) Sequence: Op 4 -> Op 5 -> ...
            const mainOps = ops.slice(3);
            mainOps.forEach((item) => {
                const { operation, count } = item;
                const dims = getMachineZoneDims(operation.machine_type);
                const step = dims.length + ASSEMBLY_GAP;

                for (let k = 0; k < count; k++) {
                    // Greedy choice among A1, A2, A3
                    let bestLane: 'B' | 'A' | 'D' = 'B';
                    if (laneCursors.A < laneCursors[bestLane]) bestLane = 'A';
                    if (laneCursors.D < laneCursors[bestLane]) bestLane = 'D';

                    const xPos = laneCursors[bestLane];
                    addMachine(
                        operation, 
                        bestLane, 
                        xPos, 
                        sectionCounters[laneSections[bestLane]]++, 
                        (bestLane === 'A' || bestLane === 'D') ? Math.PI / 2 : -Math.PI / 2, 
                        laneSections[bestLane], 
                        true
                    );
                    laneCursors[bestLane] += step;
                }
            });

            // v150 Fix: Assembly boundary check
            const currentX_AB = Math.max(laneCursors.A, laneCursors.B);
            const currentX_CD = Math.max(laneCursors.D, laneCursors.C);
            const isAssABOverflow = currentX_AB > specs.assemblyAB.end;
            const isAssCDOverflow = currentX_CD > specs.assemblyCD.end;
            if (isAssABOverflow || isAssCDOverflow) {
                warnings.unshift(`${secName}: Assembly machines going out of zone`);
            }

            cursors.A = currentX_AB; cursors.B = currentX_AB;
            cursors.D = currentX_CD;
            cursors.C = laneCursors.C;

            sectionLayouts.push({
                id: uuidv4(), name: "Assembly AB", position: { x: startX_AssemblyAB, y: 0, z: LANE_Z_CENTER_AB },
                length: specs.assemblyAB.end - specs.assemblyAB.start, width: specs.widthAB, color: '#f06b43'
            });
            sectionLayouts.push({
                id: uuidv4(), name: "Assembly CD", position: { x: startX_AssemblyCD, y: 0, z: LANE_Z_CENTER_CD },
                length: specs.assemblyCD.end - specs.assemblyCD.start, width: specs.widthCD, color: '#14b8a6'
            });
            continue;
        }

        const sDims = getMachineZoneDims('supermarket');
        const iDims = getMachineZoneDims('inspection');
        const targetSpecs = matchedTag ? specs.sections[matchedTag as keyof typeof specs.sections] : null;
        const sectionLimit = targetSpecs?.end || Infinity;

        const hasSupermarket = (matchedTag === 'front' || matchedTag === 'back');
        const supermarketStart = sectionLimit - (hasSupermarket ? sDims.width : 0);

        // Clear space for 3 supermarkets (U-shape): Deepest arm S3 is at 9.6ft centered (ends at 10.85ft)
        const hasCollarSupermarkets = matchedTag === 'collar';
        const collarSupermarketReserve = hasCollarSupermarkets ? (11.2 * FT) : 0;
        
        // No static reserve here. The dynamic look-ahead in placeOps handles the 6.2ft inspection slot.
        const machineZoneEnd = supermarketStart - collarSupermarketReserve;

        const rawZones = isAB ? zonesAB : zonesCD;
        const thisSectionBounds = targetSpecs
            ? { start: targetSpecs.start, end: Math.min(targetSpecs.end, machineZoneEnd) }
            : { start: alternatingX, end: machineZoneEnd };
        const zones = rawZones
            .filter(z => z.start < thisSectionBounds.end && z.end > thisSectionBounds.start)
            .map(z => ({
                start: Math.max(z.start, thisSectionBounds.start),
                end: Math.min(z.end, thisSectionBounds.end)
            }));

        let lCX = alternatingX, rCX = alternatingX;
        let alt = 0;
        const lLane = isAB ? 'A' : 'C', rLane = isAB ? 'B' : 'D';

        if (matchedTag === 'front' && spillPending['collar'] && !spillPending['collar'].isNext) {
            const pending = spillPending['collar'];
            const zoneEnd = PART_BOUNDS['collar'].end;
            let lane1W = 0, lane2W = 0;
            let tempAlt = 0;
            for (const item of pending.ops) {
                const w = getMachineZoneDims(item.operation.machine_type).length;
                for (let k = 0; k < item.count; k++) {
                    if (tempAlt % 2 === 0) lane1W += w;
                    else lane2W += w;
                    tempAlt++;
                }
            }
            const maxW = Math.max(lane1W, lane2W);
            const collarTail = isAB ? Math.max(cursors.A, cursors.B) : Math.max(cursors.C, cursors.D);
            const startX_O = Math.max(collarTail + 0.05, zoneEnd - maxW);

            let lCX_O = startX_O;
            let rCX_O = startX_O;
            let alt_O = 0;
            const collarZones = ZONES_CD.filter(z => z.start < zoneEnd);

            for (let i = 0; i < pending.ops.length; i++) {
                const item = pending.ops[i];
                const dims = getMachineZoneDims(item.operation.machine_type);
                const w = dims.length;
                for (let k = 0; k < item.count; k++) {
                    const targetLane = (alt_O % 2 === 0) ? lLane : rLane;
                    let nextX = getNextValidX(targetLane === lLane ? lCX_O : rCX_O, w, collarZones);
                    const minFloor = (collarTail || 0) + 0.5;
                    nextX = Math.max(nextX, minFloor);
                    if (targetLane === lLane) {
                        lCX_O = nextX;
                        addMachine(item.operation, lLane, lCX_O + w / 2, sectionCounters['Front Overflow']++, undefined, 'Front Overflow', true);
                        lCX_O += w + MACHINE_SPACING_X;
                    } else {
                        rCX_O = nextX;
                        addMachine(item.operation, rLane, rCX_O + w / 2, sectionCounters['Front Overflow']++, undefined, 'Front Overflow', true);
                        rCX_O += w + MACHINE_SPACING_X;
                    }
                    alt_O++;
                }
            }
            delete spillPending['collar'];

            alternatingX = Math.max(alternatingX, Math.max(lCX_O, rCX_O));
        }

        lCX = alternatingX;
        rCX = alternatingX;

        const isAssembly = secLower.includes('assembly') || secLower.includes('lane') || secLower.includes('line') || secLower.includes('joining');

        const isLine6 = lineNo.includes('Line 6');
        let secColor = isLine6 ? '#db2777' : (isAB ? '#3b82f6' : '#ec4899');
        if (secLower.includes('cuff')) secColor = isLine6 ? '#db2777' : '#3b82f6';
        else if (secLower.includes('sleeve')) secColor = isLine6 ? '#db2777' : '#4ade80';
        else if (secLower.includes('back')) secColor = isLine6 ? '#db2777' : '#8b5cf6';
        else if (secLower.includes('collar')) secColor = isLine6 ? '#db2777' : '#ec4899';
        else if (secLower.includes('front')) secColor = isLine6 ? '#db2777' : '#fbbf24';
        else if (isAssembly) secColor = isLine6 ? '#db2777' : (isAB ? '#f06b43' : '#14b8a6');

        const boxLength = targetSpecs ? targetSpecs.end - targetSpecs.start : 500;

        if (targetSpecs) {
            const currentSectionLayout = {
                id: uuidv4(), name: secName, position: { x: targetSpecs.start, y: 0, z: isAB ? LANE_Z_CENTER_AB : LANE_Z_CENTER_CD },
                length: boxLength, width: isAB ? specs.widthAB : specs.widthCD, color: secColor
            };
            sectionLayouts.push(currentSectionLayout);
        }

        const addInspection = (sName: string, cur: LaneCursors, isAB_sect: boolean, _zns: any[], baseOps?: any[]) => {
            const iDims = getMachineZoneDims('inspection');

            const hasCollarSM = sName.toLowerCase().includes('collar');
            const smReserve = hasCollarSM ? (sDims.width * 2 + 0.1) : sDims.width;
            const capTarget = (matchedTag === 'front' || matchedTag === 'back' || matchedTag === 'collar')
                ? (sectionLimit - (hasCollarSM ? smReserve : sDims.width))
                : sectionLimit;

            const reservedStart = capTarget - iDims.length - INSPECTION_GAP;

            const cursorPos = Math.max(lCX, rCX) + INSPECTION_GAP;
            let iStart = cursorPos; // Always placed after the last machine of the section

            const secStart = targetSpecs?.start || 0;
            if (iStart < secStart + 0.01) iStart = secStart + 0.01;

            console.log(`[Layout] Inspection for ${sName}: iStart=${iStart.toFixed(2)}, limit=${capTarget.toFixed(2)}, lCX=${lCX.toFixed(2)}`);

            let finalSection = sName;
            const midX = iStart + iDims.length / 2;
            for (const [part, bounds] of Object.entries(PART_BOUNDS)) {
                if (midX >= bounds.start && midX <= bounds.end) {
                    finalSection = part.charAt(0).toUpperCase() + part.slice(1);
                    break;
                }
            }

            const opsToUse = (baseOps && baseOps.length > 0) ? baseOps : [{ operation: createDummyOp(`${sName} Inspection`, finalSection), count: 1 }];

            let runX = iStart;
            for (const item of opsToUse) {
                for (let k = 0; k < item.count; k++) {
                    addMachine(
                        item.operation,
                        (isAB_sect ? 'A' : 'C'),
                        runX + iDims.length / 2,
                        undefined,
                        -Math.PI / 2,
                        sName,
                        true
                    );
                    runX += iDims.length + INSPECTION_GAP;
                }
            }

            const lastM = layout[layout.length - 1];
            if (lastM) {
                lastM.isInspection = true;
                lastM.id = `inspect-${sName}-${uuidv4()}`;
            }

            const iEnd = runX;
            lCX = iEnd;
            rCX = iEnd;
            if (isAB_sect) { cur.A = Math.max(cur.A, iEnd); cur.B = Math.max(cur.B, iEnd); }
            else { cur.C = Math.max(cur.C, iEnd); cur.D = Math.max(cur.D, iEnd); }
        };

        const placeOps = (opsToPlace: any[], sourceSecLabel: string): any[] => {
            const overflow: any[] = [];
            let overflowing = false;

            for (let opIdx = 0; opIdx < opsToPlace.length; opIdx++) {
                const item = opsToPlace[opIdx];
                if (overflowing) { overflow.push({ ...item }); continue; }

                const dims = getMachineZoneDims(item.operation.machine_type);
                const w = dims.length;
                const isInspection = item.operation.machine_type.toLowerCase().includes('inspection');

                for (let k = 0; k < item.count; k++) {
                    // Inspections always go to lLane (A or C) to match standard layout
                    // v155 Greedy Lane Choice: Place in the shorter lane first
                    const targetLane = isInspection ? lLane : ((lCX <= rCX) ? lLane : rLane);
                    const cursorVal = (targetLane === lLane) ? lCX : rCX;
                    const nextX = getNextValidX(cursorVal, w, zones);
                    const isCollar = matchedTag === 'collar';
                    
                    // v95 Absolute Visibility: Force-place at end of zone if it doesn't fit
                    let finalX = nextX;
                    if (isInspection && !isCollar) {
                        // If it doesn't fit or is out of bounds, anchor to the absolute section end
                        if (finalX === -1 || finalX + w > machineZoneEnd) {
                            finalX = Math.max(machineZoneEnd - w, cursorVal);
                        }
                        finalX += INSPECTION_GAP;
                    } else if (isInspection && isCollar) {
                        // Collar still follows supermarket safety rules (overflow to Front)
                        if (finalX !== -1) finalX += INSPECTION_GAP;
                    }

                    // For non-collar inspections, we use a massive boundary to prevent any overflow.
                    const effectivePlacementEnd = (isInspection && !isCollar) ? (finalX + w + 0.1) : machineZoneEnd;

                    if (finalX + w > effectivePlacementEnd + 0.01) {
                        const leftover = item.count - k;
                        if (leftover > 0) overflow.push({ ...item, count: leftover });
                        overflowing = true;
                        break;
                    }

                    const actualSec = item.operation.section || sourceSecLabel;
                    if (targetLane === lLane) {
                        lCX = finalX;
                        addMachine(item.operation, lLane, lCX + w / 2, sectionCounters[actualSec]++, isInspection ? -Math.PI / 2 : undefined, actualSec, true);
                        lCX += w + MACHINE_SPACING_X;
                    } else {
                        rCX = finalX;
                        addMachine(item.operation, rLane, rCX + w / 2, sectionCounters[actualSec]++, undefined, actualSec, true);
                        rCX += w + MACHINE_SPACING_X;
                    }
                    if (!isInspection) alt++;
                }
            }
            return overflow;
        };

        if (matchedTag && spillPending[matchedTag]?.isNext) {
            const pending = spillPending[matchedTag];
            const sourceSec = (pending as any).sourceSection || (pending.ops.length > 0 ? pending.ops[0].operation.section : 'Unknown');
            placeOps(pending.ops, sourceSec);
            delete spillPending[matchedTag];
        }

        // Combined production operations into a single placement queue (NO inspection stations here)
        const combinedQueue = ops.filter(o => !o.operation.machine_type.toLowerCase().includes('inspection'));
        let inspectionOps = ops.filter(o => o.operation.machine_type.toLowerCase().includes('inspection'));
        
        // v115 Fix: Fallback ONLY if there is no inspection that BELONGS to this section
        const lineValNum = parseInt(lineNo.replace(/\D/g, '')) || 0;
        const isFloor1 = lineValNum <= 6;

        const hasOwnInspection = inspectionOps.some(o => (o.operation.section || '').toLowerCase() === secLower);
        if (isFloor1 && !hasOwnInspection && matchedTag && !secLower.includes('assembly')) {
            inspectionOps.push({ operation: createDummyOp(`${secName} Inspection`, secName), count: 1 });
        }

        // v140 Phased Placement: 
        // Phase A: Incoming Overflowed Stations (Place BEFORE production machines)
        const incomingStations = inspectionOps.filter(o => (o.operation.section || '').toLowerCase() !== secLower);
        for (const inspItem of incomingStations) {
            const w = getMachineZoneDims(inspItem.operation.machine_type).length;
            const targetLane = lLane;
            const cursorVal = (targetLane === lLane) ? lCX : rCX;
            const nextX = getNextValidX(cursorVal, w, zones);
            let finalX = nextX === -1 ? cursorVal : nextX;
            
            addMachine(inspItem.operation, targetLane, finalX + w/2, sectionCounters[secName]++, -Math.PI / 2, secName, true);
            if (targetLane === lLane) lCX = finalX + w + MACHINE_SPACING_X;
            else rCX = finalX + w + MACHINE_SPACING_X;
        }

        // Phase B: Production machines
        const overflowOps = placeOps(combinedQueue, secName);

        // Phase C: Native Inspection (Place AFTER production machines)
        const nativeStations = inspectionOps.filter(o => (o.operation.section || '').toLowerCase() === secLower);
        const isLastInSectionGroup = secLower.includes('back') || secLower.includes('front');

        for (const inspItem of nativeStations) {
            const w = getMachineZoneDims(inspItem.operation.machine_type).length;
            const targetLane = lLane;
            const cursorVal = (targetLane === lLane) ? lCX : rCX;
            const nextX = getNextValidX(cursorVal, w, zones);
            
            let finalX = nextX;
            // v145 Fix: Flexible overflow for intermediary sections. 
            // Only force onto section if it's the last in the group (Back/Front) to ensure 5 stations.
            if (finalX === -1 || finalX + w + INSPECTION_GAP > machineZoneEnd) {
                if (!isLastInSectionGroup) {
                    overflowOps.push(inspItem);
                    continue; // Move to next section
                } else {
                    // Force into this final section (overlap) to guarantee visibility
                    finalX = cursorVal; 
                }
            }
            finalX += INSPECTION_GAP;
            
            addMachine(inspItem.operation, targetLane, finalX + w/2, sectionCounters[secName]++, -Math.PI / 2, secName, true);
            if (targetLane === lLane) lCX = finalX + w + MACHINE_SPACING_X;
            else rCX = finalX + w + MACHINE_SPACING_X;
        }

        if (overflowOps.length > 0 && matchedTag) {
            const overflowTarget = findOverflowSection(secLower, cursors, isAB);
            const nextSecName = processingOrder.find(s => 
                s !== secName && 
                PARTS_ORDER.find(t => s.toLowerCase().includes(t)) === PARTS_ORDER.find(t => overflowTarget.toLowerCase().includes(t))
            );
            
            if (nextSecName && sectionsMap.has(nextSecName)) {
                sectionsMap.get(nextSecName)!.unshift(...overflowOps);
                isSpilledForward[secName] = true;
                
                // v160 Fix: Identify exactly which sections are contributing to the overflow
                const originalSections = [...new Set(overflowOps.map(o => o.operation.section || secName))];
                const sectionsStr = originalSections.length > 0 ? ` (caused by: ${originalSections.join(', ')})` : "";

                // v150 Fix: Only alert for critical terminal overflows (Back, Front)
                const isTerminal = secLower.includes('back') || secLower.includes('front');
                if (isTerminal) {
                    warnings.unshift(`${secName}: Overlapping supermarket or out of zone${sectionsStr}`);
                }
            } else {
                // If no next section, it's truly out of bounds
                const originalSections = [...new Set(overflowOps.map(o => o.operation.section || secName))];
                const sectionsStr = originalSections.length > 0 ? ` (caused by: ${originalSections.join(', ')})` : "";
                warnings.unshift(`${secName}: Out of zone${sectionsStr}`);
            }
        }

        if (matchedTag) {
            sectionTails[matchedTag] = { lTail: lCX, rTail: rCX };
        }

        if (isAB) { cursors.A = Math.max(cursors.A, lCX); cursors.B = Math.max(cursors.B, rCX); }
        else { cursors.C = Math.max(cursors.C, lCX); cursors.D = Math.max(cursors.D, rCX); }

        // --- PHASE B: PENDING SPILLOVERS ---
        if (matchedTag && spillPending[matchedTag]) {
            const pending = spillPending[matchedTag];
            const zoneEnd = PART_BOUNDS[matchedTag].end;

            let lane1W = 0, lane2W = 0;
            let tempAlt = alt;
            for (const item of pending.ops) {
                const w = getMachineZoneDims(item.operation.machine_type).length;
                for (let k = 0; k < item.count; k++) {
                    if (tempAlt % 2 === 0) lane1W += w;
                    else lane2W += w;
                    tempAlt++;
                }
            }
            const currentEndX = isAB ? Math.max(cursors.A, cursors.B) : Math.max(cursors.C, cursors.D);
            lCX = Math.max(currentEndX + 0.05, zoneEnd - lane1W);
            rCX = Math.max(currentEndX + 0.05, zoneEnd - lane2W);

            const sourceSecLabel = pending.ops[0].operation.section;
            placeOps(pending.ops, sourceSecLabel);

            delete spillPending[matchedTag];

            if (isAB) { cursors.A = Math.max(cursors.A, lCX); cursors.B = Math.max(cursors.B, rCX); }
            else { cursors.C = Math.max(cursors.C, lCX); cursors.D = Math.max(cursors.D, rCX); }
        }

        // --- SPACE MONITORING ---
        const AB_LIMIT = partBounds.back.end;
        const CD_LIMIT = partBounds.front.end;
        const monitoringLimitX = isAB ? AB_LIMIT : CD_LIMIT;
        const currentPos = isAB ? Math.max(cursors.A, cursors.B) : Math.max(cursors.C, cursors.D);

        // --- SECTION OVERFLOW & SUPERMARKETS ---
        // Support units (Supermarkets/Inspections) are only added for Line 1-6 as requested.
        const isFloor1_Support = lineValNum <= 6;

        if (isFloor1_Support) {
            if (secLower.includes('collar') && specs.collar) {
                const targetSpecsLocal = specs.collar;
                const anchorX = targetSpecsLocal.end;
                const collarCenterZ = isAB ? LANE_Z_CENTER_AB : LANE_Z_CENTER_CD;

                // S2: Base of the U (Vertical pillar on the right edge)
                addMachine(createDummyOp('Supermarket', secName), 'C', anchorX - 0.9 * FT, undefined, - Math.PI / 2, secName, true);
                const sm2 = layout[layout.length - 1]; if (sm2) { sm2.position.z = collarCenterZ - 1.5 * FT; sm2.id = `super2-${secName}`; }

                // S1: Top Arm (Horizontal bar extending left)
                addMachine(createDummyOp('Supermarket', secName), 'C', anchorX - 5.2 * FT, undefined, Math.PI, secName, true);
                const sm1 = layout[layout.length - 1]; if (sm1) { sm1.position.z = collarCenterZ + 3.5 * FT; sm1.id = `super1-${secName}`; }

                // S3: Bottom Arm (Horizontal bar extending left)
                addMachine(createDummyOp('Supermarket', secName), 'C', anchorX - 9.6 * FT, undefined, Math.PI / 2, secName, true);
                const sm3 = layout[layout.length - 1]; if (sm3) { sm3.position.z = collarCenterZ - 1.5 * FT; sm3.id = `super3-${secName}`; }

                const eX = targetSpecsLocal.end;
                cursors.C = Math.max(cursors.C, eX);
                cursors.D = Math.max(cursors.D, eX);
            }

            if ((secLower.includes('front') || secLower.includes('back')) && (specs.front || specs.back)) {
                const sDims = getMachineZoneDims('supermarket');
                const targetSpecs = secLower.includes('front') ? specs.front : specs.back;
                if (targetSpecs) {
                    const absEnd = targetSpecs.end;
                    addMachine(
                        createDummyOp('Supermarket', secName),
                        (isAB ? 'A' : 'C'),
                        absEnd - sDims.width / 2 - 0.2,
                        undefined,
                        undefined,
                        secName,
                        true
                    );
                    const superM = layout[layout.length - 1];
                    if (superM) {
                        superM.rotation.y = ROT_FACE_FRONT + Math.PI;
                        superM.id = `super-${secName}`;
                    }
                    const eX = absEnd;
                    if (isAB) { cursors.A = Math.max(cursors.A, eX); cursors.B = Math.max(cursors.B, eX); }
                    else { cursors.C = Math.max(cursors.C, eX); cursors.D = Math.max(cursors.D, eX); }
                }
            }
        }

        const monitoringTag = Object.keys(specs).find(tag => secLower.includes(tag));

        if (monitoringTag) {
            const standardLen = (specs as any)[monitoringTag]?.length * FT || (specs as any)[monitoringTag]?.end - (specs as any)[monitoringTag]?.start || 0;
            const consumed = currentPos - alternatingX;
            if (consumed > standardLen + 0.1) {
                sectionSpaceViolators.push(secName);
            }
        }

        if (currentPos > monitoringLimitX + 0.1) {
            sectionSpaceViolators.forEach(culprit => {
                const msg = `${culprit} section overflow.`;
                if (!warnings.includes(msg)) warnings.push(msg);
            });
        }
    }

    return { machines: layout, sections: sectionLayouts, warnings };
};

function createDummyOp(name: string, section: string, opNo: string = ' '): Operation {
    return { op_no: opNo, op_name: name, machine_type: name, smv: 1.0, section };
}
