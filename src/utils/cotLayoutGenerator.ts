import { v4 as uuidv4 } from 'uuid';
import type { Operation, MachinePosition, SectionLayout } from '@/types';

// Constants (Units: Approx Meters)
export const LANE_Z_CENTER_AB = -3.92;
export const LANE_Z_CENTER_CD = 0.0;

export const LANE_Z_A = -3.12;
export const LANE_Z_B = -4.72;
export const LANE_Z_C = 0.75;
export const LANE_Z_D = -0.75;

const MACHINE_SPACING_X = 0;
const SECTION_GAP_X = 0;
const INSPECTION_GAP = 0.03;

// Rotations (Radians)
const ROT_FACE_FRONT = -Math.PI / 2;
const ROT_FACE_BACK = Math.PI / 2;

const FT = 0.3048;

/**
 * Re-import helper from the main layout generator to maintain consistency.
 * We'll re-implement or export if needed, but for COT we want exact logic clones.
 */
import {
    getLayoutSpecs,
    getMachineZoneDims,
    findOverflowSection,
    getNextValidX,
    PART_BOUNDS,
    LINE_PRESETS,
    LayoutResult
} from './layoutGenerator';
import { calculateMachineRequirements } from './lineBalancing';

interface LaneCursors {
    A: number;
    B: number;
    C: number;
    D: number;
}

const PARTS_ORDER = ['cuff', 'sleeve', 'back', 'collar', 'front'];

function createDummyOp(name: string, section: string, opNo: string = ' '): Operation {
    return { op_no: opNo, op_name: name, machine_type: name, smv: 1.0, section };
}

const assemblyKeywords = ['assembly', 'joining', 'stitching', 'sewing', 'lane', 'line'];

/**
 * generateCotLayout
 * 
 * Cloned from layoutGenerator.ts:generateLayout.
 * Difference: Uses op.no_of_machines directly instead of calculateMachineRequirements.
 */
export const generateCotLayout = (
    rawOperations: Operation[],
    lineNo: string = "Line 1"
): LayoutResult => {
    const layout: MachinePosition[] = [];
    const sectionLayouts: SectionLayout[] = [];
    const warnings: string[] = [];

    // ─── ⚠️ COT SPECIFIC DATA MAPPING ⚠️ ───
    // We calculate machine requirements based on Target 1200 and Eff 90 for the Floor View.
    const isAssemblyOp = (op: Operation) => {
        const sec = (op.section || '').toLowerCase();
        return assemblyKeywords.some(kw => sec.includes(kw));
    };

    const assemblyOps = rawOperations.filter(isAssemblyOp);
    const prepOps = rawOperations.filter(op => !isAssemblyOp(op));

    const balancedPrep = calculateMachineRequirements(prepOps, 1200, 9, 90);
    const balancedAssembly = calculateMachineRequirements(assemblyOps, Math.ceil(1200 / 3), 9, 90);

    const balancedOps = [...balancedPrep, ...balancedAssembly].filter(item => {
        const opName = item.operation.op_name.toLowerCase();

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

        return !IGNORED_OPERATIONS.some(ignored => opName.includes(ignored));
    });

    const { zonesAB, zonesCD, partBounds, specs } = getLayoutSpecs(lineNo);

    const sectionsMap = new Map<string, typeof balancedOps>();
    const sectionOrder: string[] = [];

    balancedOps.forEach(item => {
        if (!item.operation.machine_type || item.operation.machine_type.toLowerCase() === 'unknown') {
            item.operation.machine_type = 'Helper Table';
        }

        const sec = item.operation.section || 'Unknown';
        if (sec === 'Unknown') return;

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
    const zonesMapping = { AB: zonesAB, CD: zonesCD };
    const abSections = ['cuff', 'sleeve', 'back'];

    const sectionCounters: Record<string, number> = {};
    Array.from(sectionsMap.keys()).forEach(k => sectionCounters[k] = 1);

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

    const sectionSpaceViolators: string[] = [];

    const sectionTails: Record<string, { lTail: number, rTail: number }> = {};
    const spillPending: Record<string, { ops: any[], isNext: boolean, sourceSection?: string }> = {};
    const isSpilledForward: Record<string, boolean> = {};

    const sectionSpace: Record<string, { availableLen: number, usedLen: number }> = {};
    for (const tag of PARTS_ORDER) {
        const zoneBounds = PART_BOUNDS[tag as keyof typeof PART_BOUNDS];
        const zoneLen = zoneBounds.end - zoneBounds.start;
        const iDims = getMachineZoneDims('inspection');
        const sDims = getMachineZoneDims('supermarket');
        let reservedX = iDims.length + 0.2 + 0.1;
        if (tag === 'front' || tag === 'back') reservedX += sDims.width + 0.1;
        sectionSpace[tag] = { availableLen: (zoneLen - reservedX), usedLen: 0 };
    }

    for (const secName of processingOrder) {
        const secLower = secName.toLowerCase();
        const ops = sectionsMap.get(secName)!;
        const matchedTag = PARTS_ORDER.find(tag => secLower.includes(tag));
        if (matchedTag && !secLower.includes('assembly')) {
            let lane1X = 0, lane2X = 0;
            let altCtr = 0;
            for (const item of ops) {
                const mType = item.operation.machine_type.toLowerCase();
                if (mType.includes('inspection') || mType.includes('supermarket')) continue;
                const w = getMachineZoneDims(item.operation.machine_type).length;
                for (let k = 0; k < item.count; k++) {
                    if (altCtr % 2 === 0) lane1X += w;
                    else lane2X += w;
                    altCtr++;
                }
            }
            sectionSpace[matchedTag].usedLen += Math.max(lane1X, lane2X);
        }
    }

    for (const secName of processingOrder) {
        const secLower = secName.toLowerCase();
        const ops = sectionsMap.get(secName)!;
        const matchedTag = PARTS_ORDER.find(tag => secLower.includes(tag));
        const isAB = abSections.some(s => secLower.includes(s));

        if (matchedTag && !secLower.includes('assembly')) {
            const spaceInfo = sectionSpace[matchedTag];
            if (spaceInfo.usedLen > spaceInfo.availableLen) {
                const excess = spaceInfo.usedLen - spaceInfo.availableLen;
                const overflowTarget = findOverflowSection(secLower, cursors, isAB);

                if (overflowTarget.toLowerCase() !== secLower && !overflowTarget.toLowerCase().includes('assembly')) {
                    const targetTag = PARTS_ORDER.find(t => overflowTarget.toLowerCase().includes(t));
                    if (targetTag && sectionSpace[targetTag]) {
                        const targetSpace = sectionSpace[targetTag];
                        const targetAvailableSpace = Math.max(0, targetSpace.availableLen - targetSpace.usedLen);

                        if (targetAvailableSpace >= excess) {
                            targetSpace.usedLen += excess;
                            spaceInfo.usedLen -= excess;

                            const targetIdx = PARTS_ORDER.indexOf(targetTag);
                            const sourceIdx = PARTS_ORDER.indexOf(matchedTag);
                            const isNext = targetIdx > sourceIdx;

                            const movedOps: any[] = [];
                            let remainingExcess = excess;
                            while (ops.length > 0 && remainingExcess > 0) {
                                const item = isNext ? ops[ops.length - 1] : ops[0];
                                const machineWidth = getMachineZoneDims(item.operation.machine_type).length;
                                const lenPerMachine = machineWidth;

                                let countToMove = 0;
                                while (countToMove < item.count && (countToMove * lenPerMachine) < remainingExcess) {
                                    countToMove++;
                                }

                                if (countToMove >= item.count) {
                                    if (isNext) movedOps.unshift(ops.pop()!);
                                    else movedOps.push(ops.shift()!);
                                    remainingExcess -= item.count * lenPerMachine;
                                } else {
                                    const splitItem = { ...item, count: countToMove };
                                    item.count -= countToMove;
                                    if (isNext) movedOps.unshift(splitItem);
                                    else movedOps.push(splitItem);
                                    remainingExcess -= countToMove * lenPerMachine;
                                }
                            }
                            if (isNext) isSpilledForward[secName] = true;
                            spillPending[targetTag] = { ops: movedOps, isNext: isNext, sourceSection: secName };
                        }
                    }
                }
            }
        }
    }

    const pendingInspection: Record<string, { ops: any[], sectionName: string }> = {};

    for (const secName of processingOrder) {
        const secLower = secName.toLowerCase();
        const ops = sectionsMap.get(secName)!;

        const isAB = abSections.some(s => secLower.includes(s));
        const matchedTag = PARTS_ORDER.find(tag => secLower.includes(tag));
        const zoneBounds = matchedTag ? PART_BOUNDS[matchedTag] : { start: 0, end: 500 };

        let alternatingX = zoneBounds.start;

        const isAssemblySec = secLower.includes('assembly');
        if (isAssemblySec) {
            const startX_AssemblyAB = specs.assemblyAB.start;
            const startX_AssemblyCD = specs.assemblyCD.start;
            let currentX_AB = startX_AssemblyAB;
            let currentX_CD = startX_AssemblyCD;

            ops.forEach((item) => {
                const { operation, count } = item;
                const dims = getMachineZoneDims(operation.machine_type);
                const step = Math.max(dims.width + 0.4, 1.3);
                for (let c = 0; c < count; c++) {
                    const xPosAB = currentX_AB + 0.65;
                    const xPosCD = currentX_CD + 0.65;
                    addMachine(operation, 'B', xPosAB, sectionCounters[secName], -Math.PI / 2, "Assembly 1", true);
                    addMachine(operation, 'A', xPosAB, sectionCounters[secName], Math.PI / 2, "Assembly 2", true);
                    addMachine(operation, 'D', xPosCD, sectionCounters[secName], Math.PI / 2, "Assembly 3", true);
                    sectionCounters[secName]++;
                    currentX_AB += step;
                    currentX_CD += step;
                }
            });

            const hOp = createDummyOp("Helper Table", "Assembly 4", "H-C");
            hOp.machine_type = "Helper Table";
            const hDims = getMachineZoneDims("Helper Table");
            let hX = startX_AssemblyCD;
            for (let i = 0; i < 5; i++) {
                addMachine(hOp, 'C', hX + hDims.length / 2, i, 0, "Assembly 4", true);
                hX += Math.max(1.2, hDims.length);
            }

            cursors.A = currentX_AB; cursors.B = currentX_AB;
            cursors.D = currentX_CD; cursors.C = hX;

            const LINE_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16'];
            const lineNumAtAssembly = parseInt(String(lineNo || "").replace(/\D/g, '')) || 1;
            const lineSectionColor = LINE_COLORS[(lineNumAtAssembly - 1) % LINE_COLORS.length];

            sectionLayouts.push({
                id: uuidv4(), name: "Assembly AB", position: { x: startX_AssemblyAB, y: 0, z: LANE_Z_CENTER_AB },
                length: specs.assemblyAB.end - specs.assemblyAB.start, width: specs.widthAB, color: lineSectionColor
            });
            sectionLayouts.push({
                id: uuidv4(), name: "Assembly CD", position: { x: startX_AssemblyCD, y: 0, z: LANE_Z_CENTER_CD },
                length: specs.assemblyCD.end - specs.assemblyCD.start, width: specs.widthCD, color: lineSectionColor
            });
            continue;
        }

        const sDims = getMachineZoneDims('supermarket');
        const iDims = getMachineZoneDims('inspection');
        const targetSpecs = matchedTag ? specs.sections[matchedTag as keyof typeof specs.sections] : null;
        const sectionLimit = targetSpecs?.end || Infinity;
        const hasSupermarket = (matchedTag === 'front' || matchedTag === 'back');
        const supermarketStart = sectionLimit - (hasSupermarket ? sDims.width : 0);

        const hasCollarSupermarkets = matchedTag === 'collar';
        const collarSupermarketReserve = hasCollarSupermarkets ? (sDims.width + sDims.length + 0.3) : 0;

        const reservation = (iDims.length + 0.2 + 0.1);
        const machineZoneEnd = supermarketStart - reservation - collarSupermarketReserve;

        const currentZones = [{
            start: targetSpecs ? targetSpecs.start : 0,
            end: machineZoneEnd
        }];

        let lCX = alternatingX, rCX = alternatingX;
        let altCtr = 0;
        const lLane = isAB ? 'A' : 'C', rLane = isAB ? 'B' : 'D';

        if (matchedTag === 'front' && spillPending['collar'] && !spillPending['collar'].isNext) {
            const pending = spillPending['collar'];
            const zoneEndO = PART_BOUNDS['collar'].end;
            let lane1WO = 0, lane2WO = 0;
            let tempAltO = 0;
            for (const item of pending.ops) {
                const w = getMachineZoneDims(item.operation.machine_type).length;
                for (let k = 0; k < item.count; k++) {
                    if (tempAltO % 2 === 0) lane1WO += w;
                    else lane2WO += w;
                    tempAltO++;
                }
            }
            const maxWO = Math.max(lane1WO, lane2WO);
            const collarTail = isAB ? Math.max(cursors.A, cursors.B) : Math.max(cursors.C, cursors.D);
            const startX_O = Math.max(collarTail + 0.05, zoneEndO - maxWO);
            let lCX_O = startX_O, rCX_O = startX_O;
            let alt_O = 0;
            const collarZones = zonesMapping.CD.filter(z => z.start < zoneEndO);
            for (const item of pending.ops) {
                const w = getMachineZoneDims(item.operation.machine_type).length;
                for (let k = 0; k < item.count; k++) {
                    const targetL = (alt_O % 2 === 0) ? lLane : rLane;
                    let nextX = getNextValidX(targetL === lLane ? lCX_O : rCX_O, w, collarZones);
                    nextX = Math.max(nextX, (collarTail || 0) + 0.5);
                    if (targetL === lLane) { lCX_O = nextX; addMachine(item.operation, lLane, lCX_O + w / 2, sectionCounters['Front Overflow']++, undefined, 'Front Overflow', true); lCX_O += w + MACHINE_SPACING_X; }
                    else { rCX_O = nextX; addMachine(item.operation, rLane, rCX_O + w / 2, sectionCounters['Front Overflow']++, undefined, 'Front Overflow', true); rCX_O += w + MACHINE_SPACING_X; }
                    alt_O++;
                }
            }
            delete spillPending['collar'];
            alternatingX = Math.max(alternatingX, Math.max(lCX_O, rCX_O));
        }

        const LINE_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16'];
        const lineNum = parseInt(String(lineNo || "").replace(/\D/g, '')) || 1;
        const lineSectionColor = LINE_COLORS[(lineNum - 1) % LINE_COLORS.length];

        if (targetSpecs) {
            sectionLayouts.push({
                id: uuidv4(), name: secName, position: { x: targetSpecs.start, y: 0, z: isAB ? LANE_Z_CENTER_AB : LANE_Z_CENTER_CD },
                length: targetSpecs.end - targetSpecs.start, width: isAB ? specs.widthAB : specs.widthCD, color: lineSectionColor
            });
        }

        const addInspection = (sName: string, cur: LaneCursors, isAB_sect: boolean, _zns: any[], baseOps?: any[]) => {
            const idmsLocal = getMachineZoneDims('inspection');
            let iStart = Math.max(lCX, rCX) + 0.2;
            const capTarget = (matchedTag === 'front' || matchedTag === 'back') ? supermarketStart : sectionLimit;
            if (iStart + idmsLocal.length > capTarget) return false;
            if (iStart < (targetSpecs?.start || 0)) iStart = (targetSpecs?.start || 0) + 0.01;
            const opsToUse = (baseOps && baseOps.length > 0) ? [{ ...baseOps[0], count: 1 }] : [{ operation: createDummyOp(`${sName} Inspection`, sName), count: 1 }];
            for (const item of opsToUse) {
                addMachine(item.operation, (isAB_sect ? 'A' : 'C'), iStart + idmsLocal.length / 2, undefined, -Math.PI / 2, sName, true);
                iStart += idmsLocal.length + INSPECTION_GAP;
            }
            const lastM = layout[layout.length - 1];
            if (lastM) { lastM.isInspection = true; lastM.id = `inspect-${sName}-${uuidv4()}`; }
            lCX = iStart; rCX = iStart;
            if (isAB_sect) { cur.A = Math.max(cur.A, iStart); cur.B = Math.max(cur.B, iStart); }
            else { cur.C = Math.max(cur.C, iStart); cur.D = Math.max(cur.D, iStart); }
            return true;
        };

        const placeOps = (opsToPlace: any[], sourceSecLabel: string) => {
            for (const item of opsToPlace) {
                const w = getMachineZoneDims(item.operation.machine_type).length;
                for (let k = 0; k < item.count; k++) {
                    const targetL = (altCtr % 2 === 0) ? lLane : rLane;
                    if (targetL === lLane) {
                        const nX = getNextValidX(lCX, w, currentZones);
                        lCX = nX;
                        addMachine(item.operation, lLane, lCX + w / 2, sectionCounters[sourceSecLabel]++, undefined, sourceSecLabel, true);
                        lCX += w + MACHINE_SPACING_X;
                    } else {
                        const nX = getNextValidX(rCX, w, currentZones);
                        rCX = nX;
                        addMachine(item.operation, rLane, rCX + w / 2, sectionCounters[sourceSecLabel]++, undefined, sourceSecLabel, true);
                        rCX += w + MACHINE_SPACING_X;
                    }
                    altCtr++;
                }
            }
        };

        if (matchedTag && pendingInspection[matchedTag]) {
            addInspection(pendingInspection[matchedTag].sectionName, cursors, isAB, currentZones, pendingInspection[matchedTag].ops);
            delete pendingInspection[matchedTag];
        }

        if (matchedTag && spillPending[matchedTag]?.isNext) {
            const p = spillPending[matchedTag];
            const sourceS = (p as any).sourceSection || (p.ops.length > 0 ? p.ops[0].operation.section : secName);
            placeOps(p.ops, sourceS);
            if ((p as any).inspectionOpsToFollow) {
                if (!addInspection(sourceS, cursors, isAB, currentZones, (p as any).inspectionOpsToFollow)) {
                    const iT = findOverflowSection(secLower, cursors, isAB);
                    const iTag = PARTS_ORDER.find(t => iT.toLowerCase().includes(t));
                    if (iTag) pendingInspection[iTag] = { ops: (p as any).inspectionOpsToFollow, sectionName: sourceS };
                }
            }
            delete spillPending[matchedTag];
        }

        const regularOps = ops.filter(o => !o.operation.machine_type.toLowerCase().includes('inspection') && !o.operation.machine_type.toLowerCase().includes('supermarket'));
        const inspectionOps = ops.filter(o => o.operation.machine_type.toLowerCase().includes('inspection'));
        placeOps(regularOps, secName);

        if (isAB) { cursors.A = Math.max(cursors.A, lCX); cursors.B = Math.max(cursors.B, rCX); }
        else { cursors.C = Math.max(cursors.C, lCX); cursors.D = Math.max(cursors.D, rCX); }

        if (isSpilledForward[secName]) {
            const nT = findOverflowSection(secLower, cursors, isAB);
            const nTag = PARTS_ORDER.find(t => nT.toLowerCase().includes(t));
            if (nTag && spillPending[nTag]) (spillPending[nTag] as any).inspectionOpsToFollow = (inspectionOps.length > 0 ? inspectionOps : [{ operation: createDummyOp(`${secName} Inspection`, secName), count: 1 }]);
        } else {
            if (!addInspection(secName, cursors, isAB, currentZones, inspectionOps) && matchedTag) {
                const iT = findOverflowSection(secLower, cursors, isAB);
                const iTag = PARTS_ORDER.find(t => iT.toLowerCase().includes(t));
                if (iTag && iTag !== matchedTag) pendingInspection[iTag] = { ops: (inspectionOps.length > 0 ? inspectionOps : [{ operation: createDummyOp(`${secName} Inspection`, secName), count: 1 }]), sectionName: secName };
            }
        }

        if (matchedTag && spillPending[matchedTag]) {
            const p = spillPending[matchedTag];
            const sourceL = p.ops[0].operation.section;
            placeOps(p.ops, sourceL);
            delete spillPending[matchedTag];
            if (isAB) { cursors.A = Math.max(cursors.A, lCX); cursors.B = Math.max(cursors.B, rCX); }
            else { cursors.C = Math.max(cursors.C, lCX); cursors.D = Math.max(cursors.D, rCX); }
        }

        if (secLower.includes('front') || secLower.includes('back')) {
            addMachine(createDummyOp('Supermarket', secName), (isAB ? 'A' : 'C'), targetSpecs!.end - sDims.width / 2 - 0.2, undefined, undefined, secName, true);
            const sm = layout[layout.length - 1]; if (sm) { sm.rotation.y = ROT_FACE_FRONT + Math.PI; sm.id = `super-${lineNo}-${secName}-${uuidv4()}`; }
            const eX = targetSpecs!.end;
            if (isAB) { cursors.A = Math.max(cursors.A, eX); cursors.B = Math.max(cursors.B, eX); }
            else { cursors.C = Math.max(cursors.C, eX); cursors.D = Math.max(cursors.D, eX); }
        }

        if (secLower.includes('collar')) {
            const targetSpecs = specs.collar;
            const sDims = getMachineZoneDims('supermarket');

            // Anchor to the far end of the Collar section
            const anchorX = targetSpecs.end - (3.5 * FT);
            const collarCenterZ = isAB ? LANE_Z_CENTER_AB : LANE_Z_CENTER_CD;

            // S2: Base of the U (Vertical pillar on the right edge)
            addMachine(createDummyOp('Supermarket', secName), 'C', anchorX + 2.3 * FT, undefined, - Math.PI / 2, secName, true);
            const sm2 = layout[layout.length - 1]; if (sm2) { sm2.position.z = collarCenterZ - 1.5 * FT; sm2.id = `super2-${lineNo}-${secName}-${uuidv4()}`; }

            // S1: Top Arm (Horizontal bar extending left)
            addMachine(createDummyOp('Supermarket', secName), 'C', anchorX - 2.4 * FT, undefined, Math.PI, secName, true);
            const sm1 = layout[layout.length - 1]; if (sm1) { sm1.position.z = collarCenterZ + 3.5 * FT; sm1.id = `super1-${lineNo}-${secName}-${uuidv4()}`; }

            // S3: Bottom Arm (Horizontal bar extending left)
            addMachine(createDummyOp('Supermarket', secName), 'C', anchorX - 7 * FT, undefined, Math.PI / 2, secName, true);
            const sm3 = layout[layout.length - 1]; if (sm3) { sm3.position.z = collarCenterZ - 1.5 * FT; sm3.id = `super3-${lineNo}-${secName}-${uuidv4()}`; }

            const eX = targetSpecs.end;
            if (isAB) { cursors.A = Math.max(cursors.A, eX); cursors.B = Math.max(cursors.B, eX); }
            else { cursors.C = Math.max(cursors.C, eX); cursors.D = Math.max(cursors.D, eX); }
        }
    }

    return { machines: layout, sections: sectionLayouts, warnings };
};
