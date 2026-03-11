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

const MACHINE_SPACING_X = 0;
const SECTION_GAP_X = 0;
const INSPECTION_GAP = 0.03;

// Rotations (Radians)
const ROT_FACE_FRONT = -Math.PI / 2;
const ROT_FACE_BACK = Math.PI / 2;

const FT = 0.3048;

export const LAYOUT_LOGIC_VERSION = 56;
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
        cuff: { length: 30.94, width: 9.025, group: 'AB' },
        sleeve: { length: 24.55, width: 9.025, group: 'AB' },
        back: { length: 43.69, width: 9.025, group: 'AB' },
        collar: { length: 56.70, width: 9.000, group: 'CD' },
        front: { length: 43.80, width: 9.000, group: 'CD' },
        'assembly 1': { length: 56.03, width: 9.025, group: 'AB' },
        'assembly 2': { length: 56.02, width: 9.000, group: 'CD' }
    }
};

export function getLayoutSpecs(lineNo: string = "Line 1") {
    const num = parseInt(lineNo.replace(/\D/g, '')) || 1;
    const presetKey = num >= 6 ? 'B' : 'A';
    const p = LINE_PRESETS[presetKey];

    const S = FT;

    const pA = LINE_PRESETS['A'];

    // Fixed End Points based on Preset A starting at 0.2719
    const cuffEnd = (0.2719 + pA.cuff.length) * S;
    const sleeveEnd = (0.2719 + pA.cuff.length + 2.9319 + pA.sleeve.length) * S;
    const backEnd = (0.2719 + pA.cuff.length + 2.9319 + pA.sleeve.length + 4.0 + pA.back.length) * S;

    const collarEnd = (0.2719 + pA.collar.length) * S;
    const frontEnd = (0.2719 + pA.collar.length + 4.0 + pA.front.length) * S;

    // Assembly starts are forced to align with the AB back end + 4.11m gap
    const assemblyStart = (0.2719 + pA.cuff.length + 2.9319 + pA.sleeve.length + 4.0 + pA.back.length + 4.11) * S;

    const sections = {
        cuff: { start: cuffEnd - (p.cuff.length * S), end: cuffEnd },
        sleeve: { start: sleeveEnd - (p.sleeve.length * S), end: sleeveEnd },
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
    if (s.includes('back')) return 'Sleeve';

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
    let l = 4 * FT, w = 2.5 * FT;

    if (t.includes('foa') || t.includes('feed off arm')) { l = 4.5 * FT; }
    else if (t.includes('turning')) { l = 4.0 * FT; w = 2.5 * FT; }
    else if (t.includes('pointing')) { l = 3.5 * FT; w = 2.5 * FT; }
    else if (t.includes('contour')) { l = 4.5 * FT; w = 3 * FT; }
    else if (t.includes('iron') || t.includes('press')) { l = 4.0 * FT; w = 3.0 * FT; }
    else if (t.includes('helper') || t.includes('work table') || t.includes('table') || t.includes('trolley')) { l = 4.5 * FT; w = 2.5 * FT; }
    else if (t.includes('inspection')) { l = 5.0 * FT; w = 4.0 * FT; }
    else if (t.includes('fusing') || t.includes('rotary')) { l = 4.5 * FT; w = 3.0 * FT; }
    else if (t.includes('blocking')) { l = 4.0 * FT; w = 2.5 * FT; }
    else if (t.includes('supermarket')) { l = 7.0 * FT; w = 3.5 * FT; }

    return { length: l, width: w };
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
    const balancedAssembly = calculateMachineRequirements(assemblyOps, Math.ceil(targetOutput / 3), workingHours, efficiency);

    const balancedOps = [...balancedPrep, ...balancedAssembly];

    const { zonesAB, zonesCD, partBounds, specs } = getLayoutSpecs(lineNo);

    const sectionsMap = new Map<string, typeof balancedOps>();
    const sectionOrder: string[] = [];

    balancedOps.forEach(item => {
        const opName = item.operation.op_name.toLowerCase();
        const mType = item.operation.machine_type.toLowerCase();

        const IGNORED_OPERATIONS = [
            'washing allowance',
            'washing_allowance',
            'right placket tape iron',
            'gusset iron',
            'press sleeve placket',
            'press pocket',
            'right placket self fold iron',
            'left placket self fold iron',
            'stitch tape to pocket',
            'triangle patch ironing',
            'pocket overlock',
            'pocket iron with fusing',
            'pocket hem stitch'
        ];

        if (IGNORED_OPERATIONS.some(ignored => opName.includes(ignored))) return;

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
            centerModel: centerModel || op.machine_type.toLowerCase().includes('table')
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
    // availableLen = the X-extent of the zone minus space reserved for inspection (+supermarket for front/back)
    // usedLen = sum of machine widths (alternating lanes share same X cursor, so each machine contributes 1× its width to X)
    const sectionSpace: Record<string, { availableLen: number, usedLen: number }> = {};
    for (const tag of PARTS_ORDER) {
        // Use line-specific specs (not global PART_BOUNDS) so shorter lines calculate correctly
        const tagSpec = specs.sections[tag as keyof typeof specs.sections];
        const zoneLen = tagSpec ? (tagSpec.end - tagSpec.start) : 0;
        const iDims = getMachineZoneDims('inspection');
        const sDims = getMachineZoneDims('supermarket');
        // IMPORTANT: Use the SAME reservation formula as Phase 2 (machineZoneEnd calculation)
        let reservedX = iDims.length + 3 * INSPECTION_GAP + 0.01;
        if (tag === 'front' || tag === 'back') reservedX += sDims.width + 0.1;
        sectionSpace[tag] = { availableLen: Math.max(0, zoneLen - reservedX), usedLen: 0 };
    }

    // Calculate X-consumption per section:
    // Alternating placement means both Lane-A and Lane-B machines share the X cursor.
    // Each machine in an alternating pair advances X by 1× its width (not 0.5×).
    // We model it as: max machines in either lane × machine width.
    // For N machines alternating: ceil(N/2) per lane → X consumed = ceil(N/2) × width (use max lane).
    for (const secName of processingOrder) {
        const secLower = secName.toLowerCase();
        const ops = sectionsMap.get(secName)!;
        const matchedTag = PARTS_ORDER.find(tag => secLower.includes(tag));
        if (matchedTag && !secLower.includes('assembly')) {
            // Each pair of machines shares the same X slot. X consumed = ceil(totalCount/2) × avg_width
            // But since types may differ we sum per-machine and divide by 2 lanes.
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
            // X consumed in this section = max of the two lanes (the longer lane determines how far the cursor goes)
            sectionSpace[matchedTag].usedLen += Math.max(lane1X, lane2X);
        }
    }

    // Phase 1 ops-movement removed: overflow is now handled greedily in Phase 2.
    // Machines fill each section to machineZoneEnd, then remaining ops carry forward.

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

        // Every section ALWAYS starts from its own section border (line-specific, not global).
        let alternatingX = zoneBounds.start;

        const isAssemblySec = secLower.includes('assembly');
        if (isAssemblySec) {
            const startX_AssemblyAB = specs.assemblyAB.start;
            const startX_AssemblyCD = specs.assemblyCD.start;

            let currentX_AB = startX_AssemblyAB;
            let currentX_CD = startX_AssemblyCD;

            // Parallel Sewing Lines (Lanes B, A, D)
            ops.forEach((item) => {
                const { operation, count } = item;
                const dims = getMachineZoneDims(operation.machine_type);
                const step = dims.width + 0.4;

                for (let c = 0; c < count; c++) {
                    const xPosAB = currentX_AB + (dims.width / 2);
                    const xPosCD = currentX_CD + (dims.width / 2);

                    addMachine(operation, 'B', xPosAB, sectionCounters[secName], -Math.PI / 2, "Assembly 1", true);
                    addMachine(operation, 'A', xPosAB, sectionCounters[secName], Math.PI / 2, "Assembly 2", true);
                    addMachine(operation, 'D', xPosCD, sectionCounters[secName], Math.PI / 2, "Assembly 3", true);

                    sectionCounters[secName]++;
                    currentX_AB += step;
                    currentX_CD += step;
                }
            });

            // Permanent Assembly 4 (Lane C) - Restored Helper Tables
            const hOp = createDummyOp("Helper Table", "Assembly 4", "H-C");
            hOp.machine_type = "Helper Table";
            const hDims = getMachineZoneDims("Helper Table");
            let hX = startX_AssemblyCD;
            for (let i = 0; i < 5; i++) {
                addMachine(hOp, 'C', hX + hDims.length / 2, i, 0, "Assembly 4", true);
                hX += Math.max(1.2, hDims.length);
            }

            cursors.A = currentX_AB; cursors.B = currentX_AB;
            cursors.D = currentX_CD;
            cursors.C = hX;

            const finalX_AB = currentX_AB;
            const finalX_CD = Math.max(currentX_CD, hX);

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

        const reservation = (iDims.length + 3 * INSPECTION_GAP + 0.01);
        const machineZoneEnd = supermarketStart - reservation;

        const rawZones = isAB ? zonesAB : zonesCD;
        // Restrict placement zones to ONLY this section's physical bounds.
        // Without this, getNextValidX would silently jump machines into the
        // next section's zone when the current zone is full.
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

        // Special: Handle dynamic backward spill for Front section BEFORE generating Front Main
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

        let secColor = isAB ? '#3b82f6' : '#ec4899';
        if (secLower.includes('cuff')) secColor = '#3b82f6';
        else if (secLower.includes('sleeve')) secColor = '#4ade80';
        else if (secLower.includes('back')) secColor = '#8b5cf6';
        else if (secLower.includes('collar')) secColor = '#ec4899';
        else if (secLower.includes('front')) secColor = '#fbbf24';
        else if (isAssembly) secColor = isAB ? '#f06b43' : '#14b8a6';

        const boxLength = targetSpecs ? targetSpecs.end - targetSpecs.start : 500;

        if (targetSpecs) {
            const currentSectionLayout = {
                id: uuidv4(), name: secName, position: { x: targetSpecs.start, y: 0, z: isAB ? LANE_Z_CENTER_AB : LANE_Z_CENTER_CD },
                length: boxLength, width: isAB ? specs.widthAB : specs.widthCD, color: secColor
            };
            sectionLayouts.push(currentSectionLayout);
        }

        const addInspection = (sName: string, cur: LaneCursors, isAB_sect: boolean, _zns: any[], baseOps?: any[]) => {
            console.log(`[Layout] Placing ${baseOps?.length || 1} Inspection(s) for ${sName}`);
            const iDims = getMachineZoneDims('inspection');

            // Inspection goes DIRECTLY after the last machine — no zone-jumping.
            // We reserved space at end of section (machineZoneEnd) precisely for this.
            let iStart = Math.max(lCX, rCX) + 0.2;

            // Hard limit: must stay within section boundary
            const capTarget = (matchedTag === 'front' || matchedTag === 'back') ? supermarketStart : sectionLimit;
            const maxIStart = capTarget - iDims.length - INSPECTION_GAP;
            if (iStart > maxIStart) iStart = maxIStart;

            // Must not go before section start
            if (iStart < (targetSpecs?.start || 0)) iStart = (targetSpecs?.start || 0) + 0.01;

            let finalSection = sName;
            const midX = iStart + iDims.length / 2;
            for (const [part, bounds] of Object.entries(PART_BOUNDS)) {
                if (midX >= bounds.start && midX <= bounds.end) {
                    finalSection = part.charAt(0).toUpperCase() + part.slice(1);
                    break;
                }
            }

            const opsToUse = (baseOps && baseOps.length > 0) ? baseOps : [{ operation: createDummyOp(`${sName} Inspection`, finalSection), count: 1 }];

            for (const item of opsToUse) {
                for (let k = 0; k < item.count; k++) {
                    addMachine(
                        item.operation,
                        (isAB_sect ? 'A' : 'C'),
                        iStart + iDims.length / 2,
                        undefined,
                        -Math.PI / 2,
                        sName,
                        true
                    );
                    iStart += iDims.length + INSPECTION_GAP;
                }
            }

            const lastM = layout[layout.length - 1];
            if (lastM) {
                lastM.isInspection = true;
                lastM.id = `inspect-${sName}-${uuidv4()}`;
            }

            const iEnd = iStart + iDims.length;
            lCX = iEnd;
            rCX = iEnd;
            if (isAB_sect) { cur.A = Math.max(cur.A, iEnd); cur.B = Math.max(cur.B, iEnd); }
            else { cur.C = Math.max(cur.C, iEnd); cur.D = Math.max(cur.D, iEnd); }
        };

        // placeOps: place machines greedily; stops at machineZoneEnd and returns overflow ops
        const placeOps = (opsToPlace: any[], sourceSecLabel: string): any[] => {
            const overflow: any[] = [];
            let overflowing = false;

            for (let opIdx = 0; opIdx < opsToPlace.length; opIdx++) {
                const item = opsToPlace[opIdx];
                if (overflowing) { overflow.push({ ...item }); continue; }

                const dims = getMachineZoneDims(item.operation.machine_type);
                const w = dims.length;

                for (let k = 0; k < item.count; k++) {
                    const targetLane = (alt % 2 === 0) ? lLane : rLane;
                    const cursorVal = (targetLane === lLane) ? lCX : rCX;
                    const nextX = getNextValidX(cursorVal, w, zones);

                    if (nextX + w > machineZoneEnd + 0.01) {
                        // Zone full — collect remaining count of this op plus all subsequent ops
                        const leftover = item.count - k;
                        if (leftover > 0) overflow.push({ ...item, count: leftover });
                        overflowing = true;
                        break;
                    }

                    if (targetLane === lLane) {
                        lCX = nextX;
                        addMachine(item.operation, lLane, lCX + w / 2, sectionCounters[sourceSecLabel]++, undefined, sourceSecLabel, true);
                        lCX += w + MACHINE_SPACING_X;
                    } else {
                        rCX = nextX;
                        addMachine(item.operation, rLane, rCX + w / 2, sectionCounters[sourceSecLabel]++, undefined, sourceSecLabel, true);
                        rCX += w + MACHINE_SPACING_X;
                    }
                    alt++;
                }
            }
            return overflow;
        };

        // 1. If this section is a target for "Next" spillovers
        // Spilled machines AND their inspection are placed here (inspection follows machines)
        if (matchedTag && spillPending[matchedTag]?.isNext) {
            const pending = spillPending[matchedTag];
            const sourceSec = (pending as any).sourceSection || (pending.ops.length > 0 ? pending.ops[0].operation.section : 'Unknown');
            placeOps(pending.ops, sourceSec);
            // Inspection always follows the last spilled machine into the same target zone
            addInspection(sourceSec, cursors, isAB, zones);
            delete spillPending[matchedTag];
        }

        // 2. Separate machines for correct end-of-section placement
        const regularOps = ops.filter(o => !o.operation.machine_type.toLowerCase().includes('inspection') && !o.operation.machine_type.toLowerCase().includes('supermarket'));
        const inspectionOps = ops.filter(o => o.operation.machine_type.toLowerCase().includes('inspection'));
        const smOps = ops.filter(o => o.operation.machine_type.toLowerCase().includes('supermarket'));

        const overflowOps = placeOps(regularOps, secName);

        // Forward overflow: inject into the next same-lane section's ops BEFORE it is processed
        if (overflowOps.length > 0 && matchedTag) {
            const overflowTarget = findOverflowSection(secLower, cursors, isAB);
            const nextSecName = processingOrder.find(s =>
                s !== secName &&
                PARTS_ORDER.find(t => s.toLowerCase().includes(t)) === PARTS_ORDER.find(t => overflowTarget.toLowerCase().includes(t))
            );
            if (nextSecName && sectionsMap.has(nextSecName)) {
                sectionsMap.get(nextSecName)!.push(...overflowOps);
                isSpilledForward[secName] = true;
                warnings.unshift(`${secName}: ${overflowOps.reduce((s, o) => s + o.count, 0)} machines forwarded to ${nextSecName}`);
            }
        }

        if (matchedTag) {
            sectionTails[matchedTag] = { lTail: lCX, rTail: rCX };
        }

        if (isAB) { cursors.A = Math.max(cursors.A, lCX); cursors.B = Math.max(cursors.B, rCX); }
        else { cursors.C = Math.max(cursors.C, lCX); cursors.D = Math.max(cursors.D, rCX); }

        // --- PHASE A: INSPECTION PLACEMENT ---
        // Always place inspection in the source section regardless of overflow.
        addInspection(secName, cursors, isAB, zones, inspectionOps);

        // --- PHASE B: PLACE PENDING SPILLOVERS FROM THE END OF THE SECTION ---
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
            const exactPendingWidth = Math.max(lane1W, lane2W);
            const spillStart = zoneEnd - exactPendingWidth;

            const currentEndX = isAB ? Math.max(cursors.A, cursors.B) : Math.max(cursors.C, cursors.D);
            lCX = Math.max(currentEndX + 0.05, zoneEnd - lane1W);
            rCX = Math.max(currentEndX + 0.05, zoneEnd - lane2W);

            const sourceSecLabel = pending.ops[0].operation.section;
            placeOps(pending.ops, sourceSecLabel);

            delete spillPending[matchedTag];

            if (isAB) { cursors.A = Math.max(cursors.A, lCX); cursors.B = Math.max(cursors.B, rCX); }
            else { cursors.C = Math.max(cursors.C, lCX); cursors.D = Math.max(cursors.D, rCX); }
        }

        if (secLower.includes('front') || secLower.includes('back')) {
            const sDims = getMachineZoneDims('supermarket');
            const targetSpecs = secLower.includes('front') ? specs.front : specs.back;
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

        // --- SPACE MONITORING ---
        const AB_LIMIT = partBounds.back.end;
        const CD_LIMIT = partBounds.front.end;
        const monitoringLimitX = isAB ? AB_LIMIT : CD_LIMIT;
        const currentPos = isAB ? Math.max(cursors.A, cursors.B) : Math.max(cursors.C, cursors.D);

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
