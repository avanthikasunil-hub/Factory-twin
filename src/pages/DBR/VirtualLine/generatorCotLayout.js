import { v4 as uuidv4 } from 'uuid';
import {
    getLayoutSpecs,
    getMachineZoneDims,
    findOverflowSection,
    getNextValidX,
    PART_BOUNDS,
    LINE_PRESETS,
    canonicalMachineType
} from './layoutGenerator';

export { getMachineZoneDims, canonicalMachineType, PART_BOUNDS, getLayoutSpecs };

/**
 * calculateMachineRequirements
 */
export const calculateMachineRequirements = (ops, targetOutput, workingHours, efficiency = 100) => {
    const wtSecs = workingHours * 3600;
    const takeTime = targetOutput > 0 ? (wtSecs / targetOutput) * (efficiency / 100) : 0;
    
    return ops.map(op => {
        const opSMV = parseFloat(op.smv) || 0;
        const count = takeTime > 0 ? Math.ceil(opSMV / takeTime) : 1;
        return {
            operation: op,
            count: Math.max(1, count)
        };
    });
};

export const LANE_Z_CENTER_AB = -3.92;
export const LANE_Z_CENTER_CD = 0.0;

export const LANE_Z_A = -5.2;
export const LANE_Z_B = -6.8;
export const LANE_Z_C = 0.75;
export const LANE_Z_D = -0.75;

const MACHINE_SPACING_X = 0;
const SECTION_GAP_X = 0;
const INSPECTION_GAP = 0.03;

const ROT_FACE_FRONT = -Math.PI / 2;
const ROT_FACE_BACK = Math.PI / 2;

export const FT = 0.3048;

const PARTS_ORDER = ['cuff', 'cf', 'sleeve', 'slv', 'back', 'bk', 'bck', 'collar', 'cllr', 'cl', 'front', 'frnt', 'fr'];

function createDummyOp(name, section, opNo = ' ') {
    return { op_no: opNo, op_name: name, machine_type: name, smv: 1.0, section };
}

export function extractOpSMV(op) {
    if (!op) return 0;
    
    // Heuristic: check a priority list of fields including nested structures
    const fields = [
      'smv','sam','planned_smv','planned_sam','total_smv',
      'plannedSmv','plannedSam','op_smv','op_sam',
      'mch_smv','mch_sam','total_sam','totalSmv','totalSam',
      'planned_total_smv','operation_smv','theoretical_smv','theoretical_sam',
      'sam_value', 'work_content', 'workContent', 'std_min', 'stdMin', 'mins'
    ];
    
    for (const f of fields) {
        let val = op[f];
        if (val === undefined || val === null || val === "") val = op.summaryData?.[f];
        if (val === undefined || val === null || val === "") val = op.operation?.[f];
        
        if (val !== undefined && val !== null && val !== "" && val !== 0 && val !== "0" && val !== "0.00" && val !== "N/A" && val !== "-") {
            if (typeof val === 'number') return val;
            const cleaned = String(val).replace(/[^0-9.]/g, '');
            const parsed = parseFloat(cleaned);
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
    }
    
    // Deeper recursion if operation is nested
    if (op.operation && typeof op.operation === 'object' && op.operation !== op) {
        const nested = extractOpSMV(op.operation);
        if (nested > 0) return nested;
    }
    
    return 0;
}

export function extractOpName(op) {
    if (!op) return "";
    const fields = ['op_name', 'operation', 'operation_name', 'operation_description', 'description', 'name', 'particulars', 'process', 'b', 'B', 'opDesc'];
    const isValidString = (val) => val !== undefined && val !== null && typeof val === 'string' && val.trim() !== "" && val.trim().toUpperCase() !== "N/A" && val !== "[object Object]";
    for (const f of fields) {
        let val = op[f];
        if (!isValidString(val) && op.summaryData) val = op.summaryData[f];
        if (!isValidString(val) && op.operation && typeof op.operation === 'object') val = op.operation[f];
        if (isValidString(val)) return val.trim();
    }
    if (op.operation && typeof op.operation === 'object') {
        const nested = extractOpName(op.operation);
        if (isValidString(nested)) return nested;
    }
    return "";
}

const assemblyKeywords = ['assembly', 'joining', 'stitching', 'sewing', 'lane', 'line'];

export const generateCotLayout = (
    rawOperations = [],
    lineNo = "Line 1"
) => {
    const lineValNum = parseInt(lineNo.replace(/\D/g, '')) || 0;
    const layout = [];
    const sectionLayouts = [];
    const warnings = [];

    const opsArray = (Array.isArray(rawOperations) ? rawOperations : []).map(o => ({
        ...o,
        smv: extractOpSMV(o),
        op_name: extractOpName(o)
    }));
    
    const totalSMV = opsArray.reduce((acc, op) => acc + (op.smv || 0), 0);

    // Global Capacity Constants Formula
    const availableTime = 540;
    const manpower = 110;
    const efficiency = 0.85;
    const STANDARD_SMV = 32;

    const targetValue = Math.round((availableTime * manpower * efficiency) / STANDARD_SMV) || 1578;

    const isAssemblyOp = (op) => {
        const sec = (op.section || '').toLowerCase();
        return assemblyKeywords.some(kw => sec.includes(kw));
    };

    const assemblyOps = opsArray.filter(isAssemblyOp);
    const prepOps = opsArray.filter(op => !isAssemblyOp(op));

    const balancedPrep = calculateMachineRequirements(prepOps, targetValue, 9, 90);
    const balancedAssembly = calculateMachineRequirements(assemblyOps, targetValue, 9, 90);

    const balancedOps = [...balancedPrep, ...balancedAssembly].filter(item => {
        const opNameRaw = item.operation.op_name || "";
        const opName = opNameRaw.toLowerCase();
        const IGNORED = ['washing allowance', 'washing_allowance', 'gusset iron', 'press sleeve placket', 'press pocket'];
        return !IGNORED.some(ignored => opName.includes(ignored));
    });

    const { zonesAB, zonesCD, specs } = getLayoutSpecs(lineNo);

    const sectionsMap = new Map();
    const sectionOrder = [];

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
        sectionsMap.get(sec).push(item);
    });

    const assemblyKeys = Array.from(sectionsMap.keys()).filter(k =>
        assemblyKeywords.some(kw => k.toLowerCase().includes(kw))
    );

    const mergedAssemblyOps = [];
    assemblyKeys.forEach(k => {
        mergedAssemblyOps.push(...sectionsMap.get(k));
        sectionsMap.delete(k);
        const idx = sectionOrder.indexOf(k);
        if (idx !== -1) sectionOrder.splice(idx, 1);
    });

    if (mergedAssemblyOps.length > 0) {
        sectionsMap.set("Assembly", mergedAssemblyOps);
        if (!sectionOrder.includes("Assembly")) sectionOrder.push("Assembly");
    }

    const cursors = { A: 0, B: 0, C: 0, D: 0 };
    const abSections = ['cuff', 'cf', 'sleeve', 'slv', 'back', 'bk', 'bck'];

    const sectionCounters = {};
    Array.from(sectionsMap.keys()).forEach(k => sectionCounters[k] = 1);
    sectionCounters["Assembly 1"] = 1;
    sectionCounters["Assembly 2"] = 1;
    sectionCounters["Assembly 3"] = 1;
    sectionCounters["Assembly 4"] = 1;

    const addMachine = (op, lane, xPos, countIdx, forcedRot, sectionName, paramCenterModel) => {
        const secLower = sectionName?.toLowerCase() || '';
        let z = 0, ry = 0;
        if (lane === 'A') z = LANE_Z_A;
        else if (lane === 'B') z = LANE_Z_B;
        else if (lane === 'C') z = LANE_Z_C;
        else if (lane === 'D') z = LANE_Z_D;

        const ROT_FACE_FRONT = 0, ROT_FACE_BACK = Math.PI;
        const ASSY_FRONT = -Math.PI / 2, ASSY_BACK = Math.PI / 2;

        const mTypeInternal = (op.machine_type || "SNLS").toLowerCase();
        const isInspection = mTypeInternal.includes('inspection');
        const isAssembly = secLower.includes('assembly') || secLower.includes('lane') || secLower.includes('line') || secLower.includes('joining');
        const centerModel = isInspection || paramCenterModel;

        if (isInspection) ry = -Math.PI / 2.0;
        else if (forcedRot !== undefined) ry = forcedRot;
        else if (isAssembly) ry = (lane === 'B' || lane === 'C') ? ASSY_FRONT : ASSY_BACK;
        else if (lane === 'A' || lane === 'C') ry = ROT_FACE_FRONT;
        else ry = ROT_FACE_BACK;

        const dims = getMachineZoneDims(op.machine_type);
        const needsOp = !mTypeInternal.includes('supermarket') && !mTypeInternal.includes('trolley');
        
        const getHumanDepth = (rY) => {
            if (!needsOp) return 0;
            if (isInspection) return dims.width / 2 + 0.1;
            const isStanding = mTypeInternal.includes('iron') || mTypeInternal.includes('table');
            return isStanding ? 0.55 : 0.65;
        };

        const computeBounds = (rY) => {
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

        const mIdx = countIdx ?? sectionCounters[sectionName || op.section]++;
        const finalSMV = op.smv || 0;

        layout.push({
            id: `machine-${op.op_no}-${mIdx}-${sectionName || op.section}`,
            operation: { ...op, smv: finalSMV },
            smv: finalSMV,
            position: { x: xPos, y: 0, z },
            rotation: { x: 0, y: ry, z: 0 },
            lane,
            section: sectionName || op.section,
            machineIndex: mIdx - 1,
            centerModel: centerModel || mTypeInternal.includes('table')
        });
    };

    const CANONICAL_MAP = {
        cuff: 'cuff', cf: 'cuff',
        sleeve: 'sleeve', slv: 'sleeve',
        back: 'back', bk: 'back', bck: 'back',
        collar: 'collar', cllr: 'collar', cl: 'collar',
        front: 'front', frnt: 'front', fr: 'front'
    };

    const processingOrder = [];
    const desiredTags = ['cuff', 'cf', 'sleeve', 'slv', 'back', 'bk', 'bck', 'collar', 'cllr', 'cl', 'front', 'frnt', 'fr', 'assembly'];
    desiredTags.forEach(tag => {
        const matches = Array.from(sectionsMap.keys()).filter(k => k.toLowerCase().includes(tag));
        matches.forEach(m => { if (!processingOrder.includes(m)) processingOrder.push(m); });
    });
    Array.from(sectionsMap.keys()).forEach(sec => { if (!processingOrder.includes(sec)) processingOrder.push(sec); });

    for (const secName of processingOrder) {
        const secLower = secName.toLowerCase();
        const ops = sectionsMap.get(secName);

        const isAB = abSections.some(s => secLower.includes(s));
        const rawMatchedTag = PARTS_ORDER.find(tag => secLower.includes(tag));
        const matchedTag = CANONICAL_MAP[rawMatchedTag] || rawMatchedTag;
        const targetSpecs = matchedTag ? specs.sections[matchedTag] : null;

        let alternatingX = targetSpecs ? targetSpecs.start : 0;

        const isAssemblySec = (secLower.includes('assembly') || secLower.includes('joining')) && !matchedTag;
        if (isAssemblySec) {
            const startX_AssemblyAB = specs.assemblyAB.start;
            const startX_AssemblyCD = specs.assemblyCD.start;
            const ASSEMBLY_GAP = 0.05;

            const laneCursors = { 
                B: startX_AssemblyAB + (ops[0] ? getMachineZoneDims(ops[0].operation.machine_type).length / 2 : 0.6), 
                A: startX_AssemblyAB + (ops[0] ? getMachineZoneDims(ops[0].operation.machine_type).length / 2 : 0.6), 
                D: startX_AssemblyCD + (ops[0] ? getMachineZoneDims(ops[0].operation.machine_type).length / 2 : 0.6), 
                C: startX_AssemblyCD + (ops[0] ? getMachineZoneDims(ops[0].operation.machine_type).length / 2 : 0.6)
            };
            const laneSections = { B: 'Assembly 1', A: 'Assembly 2', D: 'Assembly 3', C: 'Assembly 4' };

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

            const mainOps = ops.slice(3);
            mainOps.forEach((item) => {
                const { operation, count } = item;
                const dims = getMachineZoneDims(operation.machine_type);
                const step = dims.length + ASSEMBLY_GAP;

                for (let k = 0; k < count; k++) {
                    let bestLane = 'B';
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

            const currentX_AB = Math.max(laneCursors.A, laneCursors.B);
            const currentX_CD = Math.max(laneCursors.D, laneCursors.C);

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
        const hasSupermarket = (matchedTag === 'front' || matchedTag === 'back');
        const supermarketStart = targetSpecs ? (targetSpecs.end - (hasSupermarket ? sDims.width : 0)) : 500;

        let lCX = alternatingX, rCX = alternatingX;
        let altCtr = 0;
        const lLane = isAB ? 'A' : 'C', rLane = isAB ? 'B' : 'D';

        const placeOps = (opsToPlace, sourceSecLabel) => {
            for (const item of opsToPlace) {
                const w = getMachineZoneDims(item.operation.machine_type).length;
                for (let k = 0; k < 1; k++) { // ONLY 1 MACHINE ALWAYS
                    const targetL = (altCtr % 2 === 0) ? lLane : rLane;
                    if (targetL === lLane) {
                        addMachine(item.operation, lLane, lCX + w / 2, sectionCounters[sourceSecLabel]++, undefined, sourceSecLabel, true);
                        lCX += w;
                    } else {
                        addMachine(item.operation, rLane, rCX + w / 2, sectionCounters[sourceSecLabel]++, undefined, sourceSecLabel, true);
                        rCX += w;
                    }
                    altCtr++;
                }
            }
            const iW = getMachineZoneDims('inspection').length;
            const iStart = Math.max(lCX, rCX) + 0.5;
            addMachine(createDummyOp('Inspection', sourceSecLabel), isAB ? 'A' : 'C', iStart + iW / 2, undefined, undefined, sourceSecLabel, true);
            const lastM = layout[layout.length - 1]; if (lastM) lastM.isInspection = true;
            lCX = iStart + iW + 0.1;
            rCX = iStart + iW + 0.1;
        };

        placeOps(ops, secName);

        if (targetSpecs) {
            sectionLayouts.push({
                id: Math.random().toString(36).substring(2, 9),
                name: secName,
                position: { x: targetSpecs.start, y: 0, z: isAB ? LANE_Z_CENTER_AB : LANE_Z_CENTER_CD },
                length: targetSpecs.end - targetSpecs.start,
                width: isAB ? specs.widthAB : specs.widthCD,
                color: isAB ? '#f06b43' : '#14b8a6'
            });
        }

        // Supermarkets removed as per request
    }

    return { machines: layout, sections: sectionLayouts, warnings, totalSMV, balancedOps, target: targetValue };
};