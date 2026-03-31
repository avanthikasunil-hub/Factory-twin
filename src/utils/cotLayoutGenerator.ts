import { v4 as uuidv4 } from 'uuid';
import { calculateMachineRequirements } from './lineBalancing';
import { getLayoutSpecs, getMachineZoneDims, LANE_Z_CENTER_AB, LANE_Z_CENTER_CD, FT, ZONES_AB, ZONES_CD, PART_BOUNDS, 
       LANE_Z_A, LANE_Z_B, LANE_Z_C, LANE_Z_D, findOverflowSection, getNextValidX } from './layoutGenerator';

const ROT_FACE_FRONT = -Math.PI / 2;
const ROT_FACE_BACK = Math.PI / 2;
const INSPECTION_GAP = 1.0 * 0.3048;
const MACHINE_SPACING_X = 0;

function createDummyOp(name: string, section: string, opNo: string = ' '): any {
    return { op_no: opNo, op_name: name, machine_type: name, smv: 1.0, section };
}

export const generateCotLayout = (
    rawOperations: any[],
    targetOutput: number,
    workingHours: number,
    efficiency: number = 100,
    lineNo: string = "Line 1"
): any => {
    const layout: any[] = [];
    const sectionCounters: Record<string, number> = {};
    const { specs, sections } = getLayoutSpecs(lineNo);
    
    // Balancing
    const assemblyKeywords = ['assembly', 'joining', 'stitching', 'sewing', 'lane', 'line'];
    const isAssemblyOp = (op: any) => {
        const sec = (op.section || '').toLowerCase();
        return assemblyKeywords.some(kw => sec.includes(kw));
    };

    const assemblyOps = rawOperations.filter(isAssemblyOp);
    const prepOps = rawOperations.filter(op => !isAssemblyOp(op));

    const balancedPrep = calculateMachineRequirements(prepOps, targetOutput, workingHours, efficiency);
    const balancedAssembly = calculateMachineRequirements(assemblyOps, targetOutput, workingHours, efficiency);
    const balancedOps = [...balancedPrep, ...balancedAssembly];

    const sectionsMap = new Map<string, any[]>();
    const sectionOrder: string[] = [];

    balancedOps.forEach(item => {
        const sec = item.operation.section || 'Unknown';
        if (!sectionsMap.has(sec)) {
            sectionsMap.set(sec, []);
            sectionOrder.push(sec);
        }
        sectionsMap.get(sec)!.push(item);
    });

    const cursors = { A: 0, B: 0, C: 0, D: 0 };
    const abSections = ['cuff', 'sleeve', 'back'];
    const cdSections = ['collar', 'front'];
    const PARTS_ORDER = ['cuff', 'sleeve', 'back', 'collar', 'front'];

    const addMachine = (op: any, lane: string, xPos: number, countIdx?: number, forcedRot?: number, sectionName?: string, centerModel?: boolean) => {
        const secLower = sectionName?.toLowerCase() || '';
        let z = 0, ry = 0;
        if (lane === 'A') { z = LANE_Z_A; ry = 0; }
        else if (lane === 'B') { z = LANE_Z_B; ry = Math.PI; }
        else if (lane === 'C') { z = LANE_Z_C; ry = 0; }
        else if (lane === 'D') { z = LANE_Z_D; ry = Math.PI; }

        if (op.machine_type.toLowerCase().includes('inspection')) ry = ROT_FACE_FRONT;
        if (forcedRot !== undefined) ry = forcedRot;

        const dims = getMachineZoneDims(op.machine_type);
        const isInternal = secLower.includes('cuff') || secLower.includes('sleeve') || secLower.includes('front') || secLower.includes('back') || secLower.includes('collar');
        
        if (isInternal) {
            const midZ = (lane === 'A' || lane === 'B') ? LANE_Z_CENTER_AB : LANE_Z_CENTER_CD;
            const humanDepth = op.machine_type.toLowerCase().includes('iron') ? 0.55 : 0.65;
            const bX = dims.length, bZ = Math.max(dims.width / 2, humanDepth);
            const wZ = -(-bX/2) * Math.sin(ry) + bZ * Math.cos(ry);
            const wZ2 = -(bX/2) * Math.sin(ry) + bZ * Math.cos(ry);
            const maxWZ = Math.max(wZ, wZ2);
            z = (lane === 'A' || lane === 'C') ? midZ - (-maxWZ) : midZ - maxWZ;
        }

        if (!sectionCounters[sectionName || op.section]) sectionCounters[sectionName || op.section] = 1;
        const mIdx = countIdx ?? sectionCounters[sectionName || op.section]++;

        layout.push({
            id: `${op.op_no}-${mIdx}-${uuidv4()}`,
            operation: op,
            position: { x: xPos, y: 0, z },
            rotation: { x: 0, y: ry, z: 0 },
            lane,
            section: sectionName || op.section,
            machineIndex: mIdx - 1
        });
    };

    const processingOrder: string[] = [];
    const desiredTags = ['cuff', 'sleeve', 'back', 'collar', 'front'];
    desiredTags.forEach(tag => {
        const matches = Array.from(sectionsMap.keys()).filter(k => k.toLowerCase().includes(tag));
        matches.forEach(m => { if (!processingOrder.includes(m)) processingOrder.push(m); });
    });

    const isSpilledForward: Record<string, boolean> = {};
    const spillPending: Record<string, { ops: any[], isNext: boolean }> = {};

    for (const secName of processingOrder) {
        const secLower = secName.toLowerCase();
        const ops = sectionsMap.get(secName)!;
        const matchedTag = PARTS_ORDER.find(tag => secLower.includes(tag));
        const isAB = abSections.some(s => secLower.includes(s));
        const targetSpecs = matchedTag ? specs.sections[matchedTag as keyof typeof specs.sections] : { start: 0, end: 500 };
        const machineZoneEnd = targetSpecs.end - (secLower.includes('collar') ? (11.2 * FT) : (secLower.includes('front') || secLower.includes('back') ? (2.5 * FT) : 0));
        
        let lCX = Math.max(targetSpecs.start, isAB ? cursors.A : cursors.C);
        let rCX = Math.max(targetSpecs.start, isAB ? cursors.B : cursors.D);
        let altCtr = 0;
        const lLane = isAB ? 'A' : 'C', rLane = isAB ? 'B' : 'D';
        const currentZones = isAB ? ZONES_AB : ZONES_CD;

        const placeOps = (opsToPlace: any[], sourceSecLabel: string): any[] => {
            const overflow: any[] = [];
            for (const item of opsToPlace) {
                const dims = getMachineZoneDims(item.operation.machine_type);
                const w = dims.length;
                const isInspection = item.operation.machine_type.toLowerCase().includes('inspection');
                for (let k = 0; k < item.count; k++) {
                    // v155 Greedy Lane Choice: Place in the shorter lane first
                    const targetL = isInspection ? lLane : ((lCX <= rCX) ? lLane : rLane);
                    const currentX = (targetL === lLane) ? lCX : rCX;
                    let nextX = getNextValidX(currentX, w, currentZones);
                    
                    let finalX = nextX;
                    // v125 Fix: Mandatory 1ft gap without compression
                    if (finalX === -1 || finalX + w > machineZoneEnd) {
                        finalX = currentX; // Start at the end of the last machine
                    }
                    finalX += INSPECTION_GAP;

                    const isInternalSection = matchedTag && !sourceSecLabel.toLowerCase().includes('assembly');
                    const inspectionRoomNeeded = (isInternalSection && !isInspection) ? (6.2 * FT) : 0;
                    const effectivePlacementEnd = (isInspection) ? (finalX + w + 0.1) : (machineZoneEnd - inspectionRoomNeeded);

                    if (finalX + w > effectivePlacementEnd + 0.05) {
                        overflow.push({ ...item, count: item.count - k });
                        return overflow;
                    }
                    
                    if (targetL === lLane) {
                        lCX = finalX;
                        addMachine(item.operation, lLane, lCX + w / 2, sectionCounters[sourceSecLabel]++, isInspection ? -Math.PI / 2 : undefined, sourceSecLabel, true);
                        if (isInspection) { const m = layout[layout.length - 1]; if (m) m.isInspection = true; }
                        lCX += w + MACHINE_SPACING_X;
                    } else {
                        rCX = finalX;
                        addMachine(item.operation, rLane, rCX + w / 2, sectionCounters[sourceSecLabel]++, undefined, sourceSecLabel, true);
                        if (isInspection) { const m = layout[layout.length - 1]; if (m) m.isInspection = true; }
                        rCX += w + MACHINE_SPACING_X;
                    }
                    if (!isInspection) altCtr++;
                }
            }
            return overflow;
        };

        if (matchedTag && spillPending[matchedTag]?.isNext) {
            const p = spillPending[matchedTag];
            const sourceS = (p as any).sourceSection || (p.ops.length > 0 ? p.ops[0].operation.section : secName);
            placeOps(p.ops, sourceS);
            delete spillPending[matchedTag];
        }

        // Combined production operations into a single placement queue (NO inspection stations here)
        const combinedQueue = ops.filter(o => !o.operation.machine_type.toLowerCase().includes('inspection'));
        let inspectionOps = ops.filter(o => o.operation.machine_type.toLowerCase().includes('inspection'));
        
        // v115 Fix: Fallback ONLY if there is no inspection that BELONGS to this section
        const hasOwnInspection = inspectionOps.some(o => (o.operation.section || '').toLowerCase() === secLower);
        if (!hasOwnInspection && matchedTag && !secLower.includes('assembly')) {
            inspectionOps.push({ operation: createDummyOp(`${secName} Inspection`, secName), count: 1 });
        }

        // v140 Phased Placement: 
        // Phase A: Incoming Overflowed Stations (Place BEFORE production machines)
        const incomingStations = inspectionOps.filter(o => (o.operation.section || '').toLowerCase() !== secLower);
        for (const inspItem of incomingStations) {
            const dims = getMachineZoneDims(inspItem.operation.machine_type);
            const w = dims.length;
            const targetLane = lLane;
            const cursorVal = (targetLane === lLane) ? lCX : rCX;
            const nextX = getNextValidX(cursorVal, w, currentZones);
            let finalX = nextX === -1 ? cursorVal : nextX;
            
            addMachine(inspItem.operation, targetLane, finalX + w/2, sectionCounters[secName]++, -Math.PI / 2, secName, true);
            const m = layout[layout.length - 1]; if (m) m.isInspection = true;
            if (targetLane === lLane) lCX = finalX + w + MACHINE_SPACING_X;
            else rCX = finalX + w + MACHINE_SPACING_X;
        }

        // Phase B: Production machines
        const overflowOps = placeOps(combinedQueue, secName);

        // Phase C: Native Inspection (Place AFTER production machines)
        const nativeStations = inspectionOps.filter(o => (o.operation.section || '').toLowerCase() === secLower);
        const isLastInSectionGroup = secLower.includes('back') || secLower.includes('front');

        for (const inspItem of nativeStations) {
            const dims = getMachineZoneDims(inspItem.operation.machine_type);
            const w = dims.length;
            const targetLane = lLane;
            const cursorVal = (targetLane === lLane) ? lCX : rCX;
            const nextX = getNextValidX(cursorVal, w, currentZones);
            
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
            const m = layout[layout.length - 1]; if (m) m.isInspection = true;
            if (targetLane === lLane) lCX = finalX + w + MACHINE_SPACING_X;
            else rCX = finalX + w + MACHINE_SPACING_X;
        }

        if (overflowOps.length > 0 && matchedTag) {
            const overflowTarget = findOverflowSection(secLower, cursors, isAB);
            const nextSecName = processingOrder.find(s => s.toLowerCase().includes(overflowTarget.toLowerCase()));
            if (nextSecName && sectionsMap.has(nextSecName)) {
                sectionsMap.get(nextSecName)!.unshift(...overflowOps);
                isSpilledForward[secName] = true;
            }
        }

        if (isAB) { cursors.A = Math.max(cursors.A, lCX); cursors.B = Math.max(cursors.B, rCX); }
        else { cursors.C = Math.max(cursors.C, lCX); cursors.D = Math.max(cursors.D, rCX); }
    }

    return layout;
};
