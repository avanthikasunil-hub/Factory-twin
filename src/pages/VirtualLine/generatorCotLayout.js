import { getLayoutSpecs, getMachineZoneDims, LANE_Z_CENTER_AB, LANE_Z_CENTER_CD, FT, canonicalMachineType, getNextValidX, findOverflowSection } from './layoutGenerator';
export { FT, getLayoutSpecs, getMachineZoneDims, canonicalMachineType, LANE_Z_CENTER_AB, LANE_Z_CENTER_CD };

export function extractOpSMV(op) {
    if (!op) return 0;
    
    // Heuristic: check a priority list of fields including nested structures
    const fields = [
      'smv','sam','planned_smv','planned_sam','total_smv',
      'plannedSmv','plannedSam','op_smv','op_sam',
      'mch_smv','mch_sam','total_sam','totalSmv','totalSam',
      'planned_total_smv','operation_smv','theoretical_smv','theoretical_sam',
      'd', 'D', 'sam_value', 'work_content', 'workContent', 'std_min', 'stdMin', 'mins'
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
    
    const fields = [
      'op_name', 'operation', 'operation_name', 'operation_description', 'description', 
      'name', 'particulars', 'process', 'b', 'B', 'opDesc'
    ];
    
    const isValidString = (val) => val !== undefined && val !== null && typeof val === 'string' && val.trim() !== "" && val.trim().toUpperCase() !== "N/A" && val !== "[object Object]";

    for (const f of fields) {
        let val = op[f];
        if (!isValidString(val) && op.summaryData) val = op.summaryData[f];
        if (!isValidString(val) && op.operation && typeof op.operation === 'object') val = op.operation[f];
        
        if (isValidString(val)) {
            return val.trim();
        }
    }

    if (typeof op === 'object') {
        for (const key of Object.keys(op)) {
            const lowerKey = key.toLowerCase();
            if (fields.some(f => lowerKey.includes(f.toLowerCase()))) {
                const val = op[key];
                if (isValidString(val)) return val.trim();
            }
        }
    }
    
    if (op.operation && typeof op.operation === 'object' && op.operation !== op) {
        const nested = extractOpName(op.operation);
        if (isValidString(nested) && nested !== "Unknown") return nested;
    }
    
    if (typeof op === 'string' && isValidString(op)) return op.trim();
    if (typeof op.operation === 'string' && isValidString(op.operation)) return op.operation.trim();
    
    return "";
}



export const calculateMachineRequirements = (ops, targetOutput, workingHours, efficiency = 85) => {
    const availableTime = 540; // 540 minutes
    const effectiveTime = availableTime * (efficiency / 100);
    const takeTime = targetOutput > 0 ? effectiveTime / targetOutput : 0;

    return ops.map(op => {
        const opSMV = parseFloat(op.smv) || 0;
        const count = takeTime > 0 ? Math.ceil(opSMV / takeTime) : 1;
        return {
            operation: op,
            count: Math.max(1, count)
        };
    });
};

export const generateCotLayout = (...args) => generateVirtualFloorLayout(...args);

export const generateVirtualFloorLayout = (
    rawOperations = [],
    lineNo = "Line 1",
    forcedTarget = undefined,
    efficiency = 100,
    workingHours = 9
) => {
    const opsProcessed = (Array.isArray(rawOperations) ? rawOperations : []).map(o => ({
        ...o,
        smv: extractOpSMV(o),
        op_name: extractOpName(o)
    }));


    const { zonesAB, zonesCD, partBounds, specs } = getLayoutSpecs(lineNo);
    const machineSpacing = 0.05;     // small gap after placing inspection machine
    const inspectionGap = 1.0 * FT; // 1ft gap before inspection table

    const totalSMV_val = opsProcessed.reduce((sum, o) => sum + (o.smv || 0), 0) || 32;



    const CANONICAL_MAP = {
        cuff: 'cuff', cf: 'cuff',
        sleeve: 'sleeve', skeeve: 'sleeve', sklv: 'sleeve', slv: 'sleeve',
        back: 'back', bk: 'back', bck: 'back', yoke: 'back', 'bk.': 'back', 'b.': 'back', 'b/piece': 'back', 'back piece': 'back', 'b.part': 'back', 'b-piece': 'back', 'b-part': 'back',
        collar: 'collar', cllr: 'collar', cl: 'collar',
        front: 'front', frnt: 'front', fr: 'front', pocket: 'front', placket: 'front', 'f.': 'front', 'f/piece': 'front', 'front piece': 'front', 'f.part': 'front', 'f-piece': 'front', 'f-part': 'front'
    };

    const assemblyKeywords = ['assembly', 'joining', 'stitching', 'sewing', 'lane', 'line'];
    const isAssemblyOp = (op) => {
        const sec = (op.section || '').toLowerCase();
        return assemblyKeywords.some(kw => sec.includes(kw));
    };

    // 1. Precise Zone Mapping for Bottleneck Calculation
    const zoneOpsMap = {};
    opsProcessed.forEach(op => {
        const opName = (op.op_name || '').toLowerCase();
        const sec = (op.section || '').toLowerCase();
        const matchesPartTag = (s) => Object.keys(CANONICAL_MAP).find(tag => s.includes(tag.toLowerCase()));

        let targetKey = 'General';
        if (isAssemblyOp(op)) {
            targetKey = 'assembly';
        } else {
            const opTag = matchesPartTag(opName);
            const secTag = matchesPartTag(sec);
            const tag = opTag || secTag;
            if (tag) targetKey = CANONICAL_MAP[tag];
        }
        if (!zoneOpsMap[targetKey]) zoneOpsMap[targetKey] = [];
        zoneOpsMap[targetKey].push(op);
    });


    if (zoneOpsMap['General']) {
        const target = (!zoneOpsMap['front']) ? 'front' : 'back';
        if (!zoneOpsMap[target]) zoneOpsMap[target] = [];
        zoneOpsMap[target].push(...zoneOpsMap['General']);
        delete zoneOpsMap['General'];
    }

    const avgMLen = 1.22;
    const effectiveTime = 540 * (efficiency / 100);
    let bottleneckTarget = 1800;
    let totalCapacity = 0;

    // 2. Binary Search to find Max Target per Zone based on Physical Space
    Object.keys(zoneOpsMap).forEach(zoneKey => {
        const ops = zoneOpsMap[zoneKey];
        if (!ops || ops.length === 0) return;

        let zoneCap = 0;
        let overhead = 0;
        const sDims = getMachineZoneDims('supermarket');
        const iDims = getMachineZoneDims('inspection');

        if (zoneKey === 'assembly') {
            const segmentLen = (specs.sections.assemblyCD.end - specs.sections.assemblyCD.start);
            const stepWidth = getMachineZoneDims('snls').width + 0.15; // Closer packing
            zoneCap = Math.floor((segmentLen - 0.5) / stepWidth) * 4; // Uses all 4 lanes (A1-A4) as a pool
        } else if (specs.sections[zoneKey]) {
            const zoneLen = (specs.sections[zoneKey].end - specs.sections[zoneKey].start);
            const hasSupermarket = (zoneKey === 'front' || zoneKey === 'back');
            const hasCollarSupermarket = (zoneKey === 'collar');
            const collarSupermarketReserve = hasCollarSupermarket ? (4 * FT + sDims.length) : 0;
            overhead = (hasSupermarket ? sDims.width : 0) + iDims.length + collarSupermarketReserve + 0.5;
            const usableLen = Math.max(0, zoneLen - overhead);
            zoneCap = Math.floor((usableLen * 2) / avgMLen);
        }

        if (zoneCap > 0) {
            totalCapacity += zoneCap;

            // Search for max target that fits in zoneCap
            let low = 1, high = 2500, bestInZone = 1;
            while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                const tTarget = mid; // Total target for the whole assembly zone (same eq as parts)
                const mReq = ops.reduce((sum, o) => sum + Math.ceil((parseFloat(o.smv) || 0) * tTarget / effectiveTime), 0);

                if (mReq <= (zoneKey === 'assembly' ? (zoneCap / 3) : zoneCap)) {
                    bestInZone = mid;
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }
            bottleneckTarget = Math.min(bottleneckTarget, bestInZone);
        }
    });

    const rawTarget = (forcedTarget !== undefined && forcedTarget !== null && forcedTarget > 0) ? forcedTarget : bottleneckTarget;
    const targetOutput = isNaN(rawTarget) ? 1800 : Math.max(1, rawTarget);

    const layout = [];
    const sectionLayouts = [];
    const warnings = [];

    const assemblyOps = opsProcessed.filter(isAssemblyOp);
    const isPrepOp = (op) => {
        const sec = (op.section || '').toLowerCase();
        const name = (op.op_name || '').toLowerCase();
        return sec.includes('prep') || sec.includes('preparatory') || sec.includes('prepartory') ||
               name.includes('prep') || name.includes('preparatory') || name.includes('prepartory');
    };

    const prepOps = opsProcessed.filter(op => !isAssemblyOp(op));

    const balancedPrep = calculateMachineRequirements(prepOps, targetOutput, workingHours, efficiency);
    const balancedAssembly = calculateMachineRequirements(assemblyOps, targetOutput, workingHours, efficiency);


    const balancedOps = [...balancedPrep, ...balancedAssembly].map(item => {
        if (isPrepOp(item.operation)) {
            return { ...item, operation: { ...item.operation, section: 'Preparatory' } };
        }
        return item;
    });

    const rawSectionsMap = new Map();
    balancedOps.forEach(item => {
        if (isPrepOp(item.operation)) return; // Exclude from 3D layout

        const opName = item.operation.op_name?.toLowerCase() || "";

        // v185: Removed hardcoded IGNORED_OPERATIONS filter.
        // Staging is now handled dynamically via LineStore.
        if (!item.operation.machine_type || item.operation.machine_type.toLowerCase() === 'unknown') {
            item.operation.machine_type = 'Helper Table';
        }
        const sec = item.operation.section || 'Unknown';
        if (sec === 'Unknown') return;
        if (!rawSectionsMap.has(sec)) rawSectionsMap.set(sec, []);
        rawSectionsMap.get(sec).push(item);
    });

    const sectionsMap = new Map();

    // For each item in the raw section, determine its true canonical destination
    for (const [key, items] of rawSectionsMap.entries()) {
        const keyLower = key.toLowerCase();
        const matchesPartTag = (s) => Object.keys(CANONICAL_MAP).find(tag => s.includes(tag.toLowerCase()));
        const sectionMatchedTag = matchesPartTag(keyLower);
        const isAssemblySec = assemblyKeywords.some(kw => keyLower.includes(kw));

        for (const item of items) {
            const opName = (item.operation.op_name || '').toLowerCase();
            const opMatchedTag = matchesPartTag(opName);

            let finalKey;

            if (isAssemblySec) {
                finalKey = 'Assembly';
            } else if (opMatchedTag) {
                const canonicalTag = CANONICAL_MAP[opMatchedTag] || opMatchedTag;
                finalKey = canonicalTag.charAt(0).toUpperCase() + canonicalTag.slice(1);
            } else if (sectionMatchedTag) {
                const canonicalTag = CANONICAL_MAP[sectionMatchedTag] || sectionMatchedTag;
                finalKey = canonicalTag.charAt(0).toUpperCase() + canonicalTag.slice(1);
            } else {
                finalKey = 'General';
            }

            if (!sectionsMap.has(finalKey)) sectionsMap.set(finalKey, []);
            sectionsMap.get(finalKey).push(item);
        }
    }

    if (sectionsMap.has('General')) {
        const generalOps = sectionsMap.get('General');
        const hasFront = sectionsMap.has('Front');
        const hasBack = sectionsMap.has('Back');
        const target = (!hasFront) ? 'Front' : ((!hasBack) ? 'Back' : 'Back');

        if (!sectionsMap.has(target)) sectionsMap.set(target, []);
        sectionsMap.get(target).push(...generalOps);
        sectionsMap.delete('General');
    }

    const processingOrder = ['Cuff', 'Sleeve', 'Back', 'Collar', 'Front', 'Assembly'].filter(tag => sectionsMap.has(tag));
    Array.from(sectionsMap.keys()).forEach(sec => {
        if (!processingOrder.includes(sec)) processingOrder.push(sec);
    });

    const cursors = { A: 0, B: 0, C: 0, D: 0 };
    const abSections = ['cuff', 'cf', 'sleeve', 'skeeve', 'sklv', 'slv', 'back', 'bk', 'bck', 'assembly', 'joining'];
    const cdSections = ['collar', 'cllr', 'cl', 'front', 'frnt', 'fr'];

    const sectionCounters = {};
    Array.from(sectionsMap.keys()).forEach(k => sectionCounters[k] = 1);
    sectionCounters["Assembly 1"] = 1;
    sectionCounters["Assembly 2"] = 1;
    sectionCounters["Assembly 3"] = 1;
    sectionCounters["Assembly 4"] = 1;

    const addMachine = (op, lane, xPos, countIdx, forcedRot, sectionName, centerModel) => {
        const secLower = sectionName?.toLowerCase() || '';
        let z = 0, ry = 0;
        const ROT_FACE_FRONT = 0, ROT_FACE_BACK = Math.PI;
        const mType = (op.machine_type || "SNLS").toLowerCase();
        const isInspection = mType.includes('inspection');
        const isAssembly = secLower.includes('assembly') || secLower.includes('lane') || secLower.includes('line') || secLower.includes('joining');

        if (isInspection) ry = -Math.PI / 2;
        else if (forcedRot !== undefined) ry = forcedRot;
        else if (isAssembly) ry = (lane === 'A' || lane === 'D') ? ROT_FACE_BACK : ROT_FACE_FRONT;
        else if (lane === 'A' || lane === 'C') ry = ROT_FACE_FRONT;
        else ry = ROT_FACE_BACK;

        if (isAssembly && op.op_no === 'A-13') ry += Math.PI / 2;
        const dims = getMachineZoneDims(op.machine_type || "SNLS");

        if (secLower.includes('cuff') || secLower.includes('sleeve') || secLower.includes('front') || secLower.includes('back') || secLower.includes('collar') || isAssembly) {
            if (!isAssembly && forcedRot === undefined) { ry = (lane === 'A' || lane === 'C') ? 0 : Math.PI; }
            const needsOp = !mType.includes('supermarket') && !mType.includes('trolley');
            const getHumanDepth = (rY) => {
                if (!needsOp) return 0;
                const isStanding = mType.includes('iron') || mType.includes('table');
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
        }

        const mIdx = countIdx ?? sectionCounters[sectionName || op.section]++;

        layout.push({
            id: `machine-${op.op_no}-${mIdx}-${sectionName || op.section}`,
            operation: op,
            position: { x: xPos, y: 0, z },
            rotation: { x: 0, y: ry, z: 0 },
            lane,
            section: sectionName || op.section,
            machineIndex: mIdx - 1,
            centerModel: centerModel || op.machine_type.toLowerCase().includes('table')
        });
    };

    for (const secName of processingOrder) {
        const secLower = secName.toLowerCase();
        const ops = sectionsMap.get(secName);
        const matchedTag = Object.keys(CANONICAL_MAP).find(tag => secLower.includes(tag.toLowerCase()));
        const canonicalKey = matchedTag ? CANONICAL_MAP[matchedTag] : null;
        const isAB = abSections.some(s => secLower.includes(s) || (canonicalKey === 'back'));
        const targetSpecs = canonicalKey ? specs.sections[canonicalKey] : null;
        let alternatingX = targetSpecs ? targetSpecs.start : 0;
        const isAssemblySec = (secLower.includes('assembly') || secLower.includes('joining')) && !canonicalKey;

        if (isAssemblySec) {
            const ASSEMBLY_GAP = 0.05;
            const laneSections = { B: 'Assembly 1', A: 'Assembly 2', D: 'Assembly 3', C: 'Assembly 4' };

            // 1. Initialize Cursors for A1, A2, A3
            const startX_A123 = startX_AssemblyAB + (ops[0] ? getMachineZoneDims(ops[0].operation.machine_type).width / 2 : 1.2);
            const laneCursors = { 
                B: startX_A123, 
                A: startX_A123, 
                D: startX_AssemblyCD + (ops[0] ? getMachineZoneDims(ops[0].operation.machine_type).width / 2 : 1.2), 
                C: startX_AssemblyCD + (ops[0] ? getMachineZoneDims(ops[0].operation.machine_type).width / 2 : 1.2)
            };

            // 2. Assembly 4 (Lane C) Sequence: Op 3 -> Op 2 -> Op 1 -> Helpers
            const a4Ops = ops.slice(0, 3).reverse();
            a4Ops.forEach((item) => {
                const { operation, count } = item;
                const dims = getMachineZoneDims(operation.machine_type);
                const step = dims.width + ASSEMBLY_GAP;
                for (let k = 0; k < count; k++) {
                    const xPos = laneCursors.C + dims.width / 2;
                    addMachine(operation, 'C', xPos, sectionCounters[laneSections.C]++, Math.PI / 2, laneSections.C, true);
                    laneCursors.C += step;
                }
            });

            // 3. Place Helper Tables at the END of Assembly 4 (Lane C) - Standard gap
            const hDims = getMachineZoneDims("Helper Table");
            let hX = laneCursors.C; 
            for (let i = 0; i < 2; i++) {
                addMachine({ op_no: 'H-C', op_name: 'Helper Table', machine_type: 'Helper Table', smv: 0, section: 'Assembly 4' }, 'C', hX + hDims.width / 2, i + 1, 0, "Assembly 4", true);
                hX += hDims.width + ASSEMBLY_GAP;
            }
            laneCursors.C = hX;

            // 4. Main Assembly (A1, A2, A3) Sequence: Op 4 -> Op 5 -> ...
            const mainOps = ops.slice(3);
            mainOps.forEach((item) => {
                const { operation, count } = item;
                const dims = getMachineZoneDims(operation.machine_type);
                const step = dims.width + ASSEMBLY_GAP;
                for (let k = 0; k < count; k++) {
                    let bestLane = 'B';
                    if (laneCursors.A < laneCursors[bestLane]) bestLane = 'A';
                    if (laneCursors.D < laneCursors[bestLane]) bestLane = 'D';

                    const xPos = laneCursors[bestLane] + dims.width / 2;
                    addMachine(operation, bestLane, xPos, sectionCounters[laneSections[bestLane]]++, (bestLane === 'A' || bestLane === 'D') ? Math.PI / 2 : -Math.PI / 2, laneSections[bestLane], true);
                    laneCursors[bestLane] += step;
                }
            });

            sectionLayouts.push({
                id: Math.random().toString(36).substring(2, 9), name: "Assembly AB", position: { x: startX_AssemblyAB, y: 0, z: LANE_Z_CENTER_AB },
                length: specs.assemblyAB.end - specs.assemblyAB.start, width: specs.widthAB, color: '#f06b43'
            });
            sectionLayouts.push({
                id: Math.random().toString(36).substring(2, 9), name: "Assembly CD", position: { x: startX_AssemblyCD, y: 0, z: LANE_Z_CENTER_CD },
                length: specs.assemblyCD.end - specs.assemblyCD.start, width: specs.widthCD, color: '#14b8a6'
            });
            continue;
        }

        const sDims = getMachineZoneDims('supermarket');
        const iDims = getMachineZoneDims('inspection');
        const hasSupermarket = (canonicalKey === 'front' || canonicalKey === 'back');
        // Clear space for 3 supermarkets (U-shape): Deepest arm S3 is at 9.6ft centered (ends at 10.85ft)
        const hasCollarSupermarket = (canonicalKey === 'collar');
        const collarSupermarketReserve = hasCollarSupermarket ? (11.2 * FT) : 0;
        const supermarketStart = targetSpecs ? (targetSpecs.end - (hasSupermarket ? sDims.width : 0) - collarSupermarketReserve) : 500;
        
        // No static reserve here. Dynamic check in placeOps handles space.
        const machineZoneEnd = supermarketStart - 0.05;

        const lLane = isAB ? 'A' : 'C', rLane = isAB ? 'B' : 'D';

        let lCX = alternatingX, rCX = alternatingX, altCtr = 0;
        const currentZones = (isAB ? zonesAB : zonesCD).filter(z => 
            z.start < machineZoneEnd && z.end > alternatingX
        ).map(z => ({
            start: Math.max(z.start, alternatingX),
            end: Math.min(z.end, machineZoneEnd)
        }));

        const placeOps = (opsToPlace, sourceSecLabel, zones) => {
            const overflow = [];
            for (const item of opsToPlace) {
                const w = getMachineZoneDims(item.operation.machine_type).length;
                let machinesNeeded = item.count;
                let machinesPlaced = 0;

                for (let k = 0; k < item.count; k++) {
                    const mTypeInternal = (item.operation.machine_type || "SNLS").toLowerCase();
                    const isInspection = mTypeInternal.includes('inspection');
                    // v155 Greedy Lane Choice: Place in the shorter lane first

                    const targetL = (lCX <= rCX) ? lLane : rLane;
                    const currentX = (targetL === lLane) ? lCX : rCX;
                    let nextX = (typeof getNextValidX === 'function') ? getNextValidX(currentX, w, zones || []) : currentX;
                    const isCollar = matchedTag === 'collar';

                    // v95 Absolute Visibility: Force-place at end of zone if it doesn't fit
                    if (isInspection && !isCollar) {
                        // If it doesn't fit or is out of bounds, anchor to the absolute section end
                        if (nextX === -1 || nextX + w > machineZoneEnd) {
                            nextX = Math.max(machineZoneEnd - w, currentX);
                        }
                        nextX += inspectionGap;
                    } else if (isInspection && isCollar) {
                        // Collar still follows supermarket safety rules (overflow to Front)
                        if (nextX !== -1) nextX += inspectionGap;
                    }

                    const isInternalSection = matchedTag && !sourceSecLabel.toLowerCase().includes('assembly');
                    const inspectionRoomNeeded = (isInternalSection && !isInspection) ? (6.2 * FT) : 0;
                    const effectivePlacementEnd = (isInspection && !isCollar) ? (nextX + w + 0.1) : (machineZoneEnd - inspectionRoomNeeded);

                    // If it doesn't fit in this section, push to overflow
                    if (nextX + w > effectivePlacementEnd) {
                        // Correctly collect all remaining counts for this item and all subsequent items in opsToPlace
                        const remainingItemsInQueue = opsToPlace.slice(opsToPlace.indexOf(item));
                        remainingItemsInQueue.forEach((remItem, idx) => {
                            if (idx === 0) {
                                overflow.push({ ...remItem, count: machinesNeeded - machinesPlaced });
                            } else {
                                overflow.push({ ...remItem });
                            }
                        });
                        return overflow;
                    }


                    if (targetL === lLane) {
                        // Apply gap if not at startup
                        if (isInspection) lCX += inspectionGap;
                        addMachine(item.operation, lLane, lCX + w / 2, sectionCounters[sourceSecLabel]++, undefined, sourceSecLabel, true);
                        if (isInspection) { const m = layout[layout.length - 1]; if (m) m.isInspection = true; }
                        lCX += w;
                    } else {
                        // Apply gap if not at startup
                        if (isInspection) rCX += inspectionGap;
                        addMachine(item.operation, rLane, rCX + w / 2, sectionCounters[sourceSecLabel]++, undefined, sourceSecLabel, true);
                        if (isInspection) { const m = layout[layout.length - 1]; if (m) m.isInspection = true; }
                        rCX += w;
                    }
                    machinesPlaced++;
                    if (!isInspection) altCtr++;
                }
            }
            return overflow;
        };

        // 1. Combine production operations into a single placement queue (NO inspection stations here)
        const combinedQueue = ops.filter(o => !(o.operation.machine_type || "").toLowerCase().includes('inspection'));
        let inspectionOps = ops.filter(o => (o.operation.machine_type || "").toLowerCase().includes('inspection'));

        
        // v115 Fix: Fallback ONLY if there is no inspection that BELONGS to this section
        const hasOwnInspection = inspectionOps.some(o => (o.operation.section || '').toLowerCase() === secLower);
        if (!hasOwnInspection && matchedTag && !secLower.includes('assembly')) {
            inspectionOps.push({ operation: { op_no: ' ', op_name: `${secName} Inspection`, machine_type: 'Inspection Table', smv: 1.0, section: secName }, count: 1 });
        }

        // v140 Phased Placement: 
        // Phase A: Incoming Overflowed Stations (Place BEFORE production machines)
        const incomingStations = inspectionOps.filter(o => (o.operation.section || '').toLowerCase() !== secLower);
        for (const inspItem of incomingStations) {
            const w = getMachineZoneDims(inspItem.operation.machine_type).length;
            const targetLane = lLane;
            const cursorVal = (targetLane === lLane) ? lCX : rCX;
            const nextX = (typeof getNextValidX === 'function') ? getNextValidX(cursorVal, w, currentZones) : cursorVal;
            let finalX = (nextX === -1 || nextX === undefined) ? cursorVal : nextX;
            
            if (targetLane === lLane) {
                lCX = finalX;
                addMachine(inspItem.operation, lLane, lCX + w / 2, sectionCounters[secName]++, -Math.PI / 2, secName, true);
                const m = layout[layout.length - 1]; if (m) m.isInspection = true;
                lCX += w + machineSpacing;
            } else {
                rCX = finalX;
                addMachine(inspItem.operation, rLane, rCX + w / 2, sectionCounters[secName]++, -Math.PI / 2, secName, true);
                const m = layout[layout.length - 1]; if (m) m.isInspection = true;
                rCX += w + machineSpacing;
            }
        }

        // Phase B: Production machines
        let overflowOps = placeOps(combinedQueue, secName, currentZones);

        // Phase C: Native Inspection (Place AFTER production machines)
        const nativeStations = inspectionOps.filter(o => (o.operation.section || '').toLowerCase() === secLower);
        const isLastInSectionGroup = secLower.includes('back') || secLower.includes('front');

        for (const inspItem of nativeStations) {
            const w = getMachineZoneDims(inspItem.operation.machine_type).length;
            const targetLane = lLane;
            const cursorVal = (targetLane === lLane) ? lCX : rCX;
            const nextX = (typeof getNextValidX === 'function') ? getNextValidX(cursorVal, w, currentZones) : cursorVal;
            
            let finalX = (nextX === -1 || nextX === undefined) ? cursorVal : nextX;
            // v145 Fix: Flexible overflow for intermediary sections. 
            // Only force onto section if it's the last in the group (Back/Front) to ensure 5 stations.
            if (finalX === -1 || finalX + w + inspectionGap > machineZoneEnd) {
                if (!isLastInSectionGroup) {
                    if (!overflowOps) overflowOps = [];
                    overflowOps.push(inspItem);
                    continue; // Move to next section
                } else {
                    // Force into this final section (overlap) to guarantee visibility
                    finalX = cursorVal; 
                }
            }
            const finalXWithGap = finalX + inspectionGap;
            
            // Add to layout
            if (targetLane === lLane) {
                lCX = finalXWithGap;
                addMachine(inspItem.operation, lLane, lCX + w / 2, sectionCounters[secName]++, -Math.PI / 2, secName, true);
                const m = layout[layout.length - 1]; if (m) m.isInspection = true;
                lCX += w + machineSpacing;
            } else {
                rCX = finalXWithGap;
                addMachine(inspItem.operation, rLane, rCX + w / 2, sectionCounters[secName]++, -Math.PI / 2, secName, true);
                const m = layout[layout.length - 1]; if (m) m.isInspection = true;
                rCX += w + machineSpacing;
            }
        }

        if (overflowOps && overflowOps.length > 0) {
            const overflowTarget = findOverflowSection(secName);
            const nextSecName = processingOrder.find(s => s.toLowerCase() === overflowTarget.toLowerCase());
            
            if (nextSecName && sectionsMap.has(nextSecName)) {
                sectionsMap.get(nextSecName).unshift(...overflowOps);
            } else {
                // No force-placement to prevent overlap with supermarket
            }
        }

        // --- ADD INFRASTRUCTURE (Supermarket & Inspection) ---
        const sDimsLocal = getMachineZoneDims('supermarket');
        const iDimsLocal = getMachineZoneDims('inspection');
        // Front & Back Supermarkets
        if (canonicalKey === 'front' || canonicalKey === 'back') {
            const absEnd = targetSpecs.end;
            addMachine(
                { op_no: 'SM', op_name: 'Supermarket', machine_type: 'supermarket', smv: 0, section: secName },
                (isAB ? 'A' : 'C'),
                absEnd - sDimsLocal.width / 2 - 0.2,
                undefined,
                Math.PI / 2,
                secName,
                true
            );
            const sm = layout[layout.length - 1];
            if (sm) sm.position.z -= 1.2; // Adjust lateral position for Front/Back staging
        }

        // Collar Supermarkets (U-shape)
        if (canonicalKey === 'collar') {
            const anchorX = targetSpecs.end;
            const collarCenterZ = isAB ? LANE_Z_CENTER_AB : LANE_Z_CENTER_CD;
            // S1, S2, S3 similar to layoutGenerator.ts
            addMachine({ op_no: 'SM1', op_name: 'Supermarket 1', machine_type: 'supermarket', smv: 0, section: secName }, 'C', anchorX - 0.9 * FT, undefined, -Math.PI / 2, secName, true);
            const sm2 = layout[layout.length - 1]; if (sm2) sm2.position.z = collarCenterZ - 1.5 * FT;
            addMachine({ op_no: 'SM2', op_name: 'Supermarket 2', machine_type: 'supermarket', smv: 0, section: secName }, 'C', anchorX - 5.2 * FT, undefined, Math.PI, secName, true);
            const sm1 = layout[layout.length - 1]; if (sm1) sm1.position.z = collarCenterZ + 3.5 * FT;
            addMachine({ op_no: 'SM3', op_name: 'Supermarket 3', machine_type: 'supermarket', smv: 0, section: secName }, 'C', anchorX - 9.6 * FT, undefined, Math.PI / 2, secName, true);
            const sm3 = layout[layout.length - 1]; if (sm3) sm3.position.z = collarCenterZ - 1.5 * FT;
        }

        if (targetSpecs) {
            sectionLayouts.push({
                id: Math.random().toString(36).substring(2, 9), name: secName, position: { x: targetSpecs.start, y: 0, z: isAB ? LANE_Z_CENTER_AB : LANE_Z_CENTER_CD },
                length: targetSpecs.end - targetSpecs.start, width: isAB ? specs.widthAB : specs.widthCD, color: isAB ? '#f06b43' : '#14b8a6'
            });
        }
    }

    const totalSMV = opsProcessed.reduce((sum, o) => sum + (o.smv || 0), 0);
    const mCount = layout.filter(m => !m.isInspection && !m.operation.op_name.includes('Supermarket')).length;

    // Include Infrastructure in balancedOps for sidebar visibility
    const finalOpsForSidebar = [...balancedOps];
    layout.filter(m => m.isInspection || m.operation.op_name.includes('Supermarket')).forEach(m => {
        if (!finalOpsForSidebar.some(o => o.operation.op_name === m.operation.op_name && o.operation.section === m.operation.section)) {
            finalOpsForSidebar.push({ operation: m.operation, count: 1 });
        }
    });

    return {
        machines: layout, sections: sectionLayouts, totalSMV, balancedOps: finalOpsForSidebar,
        target: targetOutput, filled: mCount, capacity: totalCapacity
    };
};