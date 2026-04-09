import { getLayoutSpecs, getMachineZoneDims, LANE_Z_CENTER_AB, LANE_Z_CENTER_CD, FT } from './layoutGenerator';

export const extractOpSMV = (op) => {
    if (!op) return 0;
    const candidates = [op.smv, op.sam, op.sam_value, op.work_content, op.workContent, op.std_min, op.stdMin, op.mins];
    for (const val of candidates) {
        if (val != null) {
            const parsed = parseFloat(String(val).replace(/[^\d.,]/g, '').replace(',', '.'));
            if (!isNaN(parsed) && parsed > 0 && parsed < 100) return parsed;
        }
    }
    return 0;
};

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

export const generateVirtualFloorLayout = (
    rawOperations = [],
    lineNo = "Line 1",
    forcedTarget = undefined,
    efficiency = 100,
    workingHours = 9
) => {
    const { zonesAB, zonesCD, partBounds, specs } = getLayoutSpecs(lineNo);
    const totalSMV_val = rawOperations.reduce((sum, o) => sum + (parseFloat(o.smv) || 0), 0) || 32;

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
    rawOperations.forEach(op => {
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
            zoneCap = Math.floor((segmentLen - 0.5) / stepWidth) * 3; 
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
                const tTarget = (zoneKey === 'assembly') ? Math.ceil(mid / 3) : mid;
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

    const assemblyOps = rawOperations.filter(isAssemblyOp);
    const prepOps = rawOperations.filter(op => !isAssemblyOp(op));

    const balancedPrep = calculateMachineRequirements(prepOps, targetOutput, workingHours, efficiency);
    const balancedAssembly = calculateMachineRequirements(assemblyOps, Math.ceil(targetOutput / 3), workingHours, efficiency);

    const balancedOps = [...balancedPrep, ...balancedAssembly];
    const rawSectionsMap = new Map();
    balancedOps.forEach(item => {
        const opName = item.operation.op_name?.toLowerCase() || "";
        const IGNORED_OPERATIONS = [
            'washing allowance', 'washing_allowance', 'right placket tape iron', 'gusset iron', 'press sleeve placket',
            'press pocket', 'right placket self fold iron', 'left placket self fold iron', 'stitch tape to pocket',
            'triangle patch ironing', 'pocket overlock', 'pocket iron with fusing', 'pocket hem stitch'
        ];
        if (IGNORED_OPERATIONS.some(ignored => opName.includes(ignored))) return;
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

    const addMachine = (op, lane, xPos, countIdx, forcedRot, sectionName, centerModel) => {
        const secLower = sectionName?.toLowerCase() || '';
        let z = 0, ry = 0;
        const ROT_FACE_FRONT = 0, ROT_FACE_BACK = Math.PI;
        const isAssembly = secLower.includes('assembly') || secLower.includes('lane') || secLower.includes('line') || secLower.includes('joining');

        if (op.machine_type.toLowerCase().includes('inspection')) ry = -Math.PI / 2;
        else if (forcedRot !== undefined) ry = forcedRot;
        else if (isAssembly) ry = (lane === 'A' || lane === 'D') ? ROT_FACE_BACK : ROT_FACE_FRONT;
        else if (lane === 'A' || lane === 'C') ry = ROT_FACE_FRONT;
        else ry = ROT_FACE_BACK;

        if (isAssembly && op.op_no === 'A-13') ry += Math.PI / 2;
        const dims = getMachineZoneDims(op.machine_type);

        if (secLower.includes('cuff') || secLower.includes('sleeve') || secLower.includes('front') || secLower.includes('back') || secLower.includes('collar') || isAssembly) {
            if (!isAssembly && forcedRot === undefined) { ry = (lane === 'A' || lane === 'C') ? 0 : Math.PI; }
            const needsOp = !op.machine_type.toLowerCase().includes('supermarket') && !op.machine_type.toLowerCase().includes('trolley');
            const getHumanDepth = (rY) => {
                if (!needsOp) return 0;
                const isStanding = op.machine_type.toLowerCase().includes('iron') || op.machine_type.toLowerCase().includes('table');
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
            const startX_AssemblyAB = specs.assemblyAB.start;
            const startX_AssemblyCD = specs.assemblyCD.start;
            let currentX_AB = startX_AssemblyAB;
            let currentX_CD = startX_AssemblyCD;

            ops.forEach((item) => {
                const { operation, count } = item;
                const dims = getMachineZoneDims(operation.machine_type);
                const step = dims.width + 0.15;
                for (let c = 0; c < count; c++) {
                    const xPosAB = currentX_AB + (dims.width / 2);
                    const xPosCD = currentX_CD + (dims.width / 2);
                    addMachine(operation, 'B', xPosAB, sectionCounters["Assembly 1"]++, -Math.PI / 2, "Assembly 1", true);
                    addMachine(operation, 'A', xPosAB, sectionCounters["Assembly 2"]++, Math.PI / 2, "Assembly 2", true);
                    addMachine(operation, 'D', xPosCD, sectionCounters["Assembly 3"]++, Math.PI / 2, "Assembly 3", true);
                    currentX_AB += step;
                    currentX_CD += step;
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
        const hasCollarSupermarket = (canonicalKey === 'collar');
        const collarSupermarketReserve = hasCollarSupermarket ? (4.0 * FT + sDims.length) : 0;
        const supermarketStart = targetSpecs ? (targetSpecs.end - (hasSupermarket ? sDims.width : 0) - collarSupermarketReserve) : 500;
        const machineZoneEnd = supermarketStart - iDims.length - 0.5;

        const lLane = isAB ? 'A' : 'C', rLane = isAB ? 'B' : 'D';
        let lCX = alternatingX, rCX = alternatingX, altCtr = 0;

        const placeOps = (opsToPlace, sourceSecLabel) => {
            let inspectionCount = 0;
            const existingInspection = opsToPlace.some(o => (o.operation.machine_type || '').toLowerCase().includes('inspection'));

            for (const item of opsToPlace) {
                const w = getMachineZoneDims(item.operation.machine_type).length;
                for (let k = 0; k < item.count; k++) {
                    const targetL = (altCtr % 2 === 0) ? lLane : rLane;
                    if (targetL === lLane) {
                        if (lCX + w > machineZoneEnd) break; 
                        addMachine(item.operation, lLane, lCX + w / 2, sectionCounters[sourceSecLabel]++, undefined, sourceSecLabel, true);
                        lCX += w;
                    } else {
                        if (rCX + w > machineZoneEnd) break; 
                        addMachine(item.operation, rLane, rCX + w / 2, sectionCounters[sourceSecLabel]++, undefined, sourceSecLabel, true);
                        rCX += w;
                    }
                    if ((item.operation.machine_type || '').toLowerCase().includes('inspection')) inspectionCount++;
                    altCtr++;
                }
            }
            if (inspectionCount === 0 && !existingInspection) {
                const iStart = Math.min(Math.max(lCX, rCX) + 1.0, machineZoneEnd + 0.05);
                addMachine({ op_no: ' ', op_name: 'Inspection', machine_type: 'Inspection', smv: 1.0, section: sourceSecLabel }, isAB ? 'A' : 'C', iStart + iDims.length / 2, undefined, -Math.PI / 2, sourceSecLabel, false);
                const lastM = layout[layout.length - 1]; 
                if (lastM) lastM.isInspection = true;
                cursors[isAB ? 'A' : 'C'] = iStart + iDims.length + 0.1;
                cursors[isAB ? 'B' : 'D'] = iStart + iDims.length + 0.1;
            }
        };

        placeOps(ops, secName);

        if (targetSpecs) {
            sectionLayouts.push({
                id: Math.random().toString(36).substring(2, 9), name: secName, position: { x: targetSpecs.start, y: 0, z: isAB ? LANE_Z_CENTER_AB : LANE_Z_CENTER_CD },
                length: targetSpecs.end - targetSpecs.start, width: isAB ? specs.widthAB : specs.widthCD, color: isAB ? '#f06b43' : '#14b8a6'
            });
        }
    }

    const totalSMV = rawOperations.reduce((sum, o) => sum + (parseFloat(o.smv) || 0), 0);
    const mCount = layout.filter(m => !m.isInspection).length;

    return { 
        machines: layout, sections: sectionLayouts, totalSMV, balancedOps, 
        target: targetOutput, filled: mCount, capacity: totalCapacity
    };
};