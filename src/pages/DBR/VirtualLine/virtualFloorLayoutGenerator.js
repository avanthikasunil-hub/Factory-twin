import { v4 as uuidv4 } from 'uuid';

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

export const LAYOUT_LOGIC_VERSION = 57;
export const FIXED_ASSEMBLY_START = 0;

export const LINE_PRESETS = {
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

export function getLayoutSpecs(lineNo = "Line 1") {
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

const PARTS_ORDER = ['cuff', 'cf', 'sleeve', 'slv', 'back', 'bk', 'bck', 'collar', 'cllr', 'cl', 'front', 'frnt', 'fr'];

export function findOverflowSection(currentSection, cursors, isAB) {
    const s = currentSection.toLowerCase();

    // Explicit User Flow Rules
    if (s.includes('cuff')) return 'Sleeve';
    if (s.includes('sleeve')) return 'Back';
    if (s.includes('back')) return 'Assembly';
    if (s.includes('collar')) return 'Front';
    if (s.includes('front')) return 'Assembly';

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
        const secNameTag = PARTS_ORDER[i];
        const secIsAB = ['cuff', 'sleeve', 'back'].includes(secNameTag);
        if (secIsAB === isAB) return secNameTag.charAt(0).toUpperCase() + secNameTag.slice(1);
    }

    return currentSection;
}

export const getNextValidX = (currentX, machineLength, zones) => {
    let x = currentX;
    for (const zone of zones) {
        const potentialStart = Math.max(x, zone.start);
        if (potentialStart + machineLength <= zone.end) {
            return potentialStart;
        }
    }
    return x;
};

export const getMachineZoneDims = (type) => {
    const t = (type || '').toLowerCase();
    const FT = 0.3048;
    let l = 4 * FT, w = 2.5 * FT;

    if (t.includes('foa') || t.includes('feed off arm')) { l = 4.5 * FT; }
    else if (t.includes('turning')) { l = 4.0 * FT; w = 2.5 * FT; }
    else if (t.includes('pointing')) { l = 3.5 * FT; w = 2.5 * FT; }
    else if (t.includes('contour')) { l = 4.5 * FT; w = 3 * FT; }
    else if (t.includes('pressing') || (t.includes('press') && !t.includes('iron'))) { l = 4.72 * FT; w = 4.0 * FT; }
    else if (t.includes('iron') || t.includes('press')) { l = 4.0 * FT; w = 3.0 * FT; }
    else if (t.includes('helper') || t.includes('work table') || t.includes('table') || t.includes('trolley')) { l = 4.5 * FT; w = 2.5 * FT; }
    else if (t.includes('inspection')) { l = 5.0 * FT; w = 3.0 * FT; }
    else if (t.includes('fusing') || t.includes('rotary')) { l = 4.5 * FT; w = 3.0 * FT; }
    else if (t.includes('blocking')) { l = 4.0 * FT; w = 2.5 * FT; }
    else if (t.includes('supermarket')) { l = 6.0 * FT; w = 2.5 * FT; }

    return { length: l, width: w };
};

export const generateVirtualFloorLayout = (
    rawOperations = [],
    lineNo = "Line 1",
    forcedTarget = undefined,
    efficiency = 100,
    workingHours = 9
) => {
    const lineValNum = parseInt(lineNo.replace(/\D/g, '')) || 0;
    const { specs } = getLayoutSpecs(lineNo);
    
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
        const opName = (op.op_name || op.operation || '').toLowerCase();
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
            let low = 1000, high = 1800, bestInZone = 1000;
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
    const targetOutput = isNaN(rawTarget) ? 1800 : Math.min(1800, Math.max(1000, rawTarget));

    const layout = [];
    const sectionLayouts = [];
    const warnings = [];

    const assemblyOps = rawOperations.filter(isAssemblyOp);
    const prepOps = rawOperations.filter(op => !isAssemblyOp(op));

    const balancedPrep = calculateMachineRequirements(prepOps, targetOutput, workingHours, efficiency);
    const balancedAssembly = calculateMachineRequirements(assemblyOps, targetOutput, workingHours, efficiency);

    const isPrepOp = (op) => {
        const sec = (op.section || '').toLowerCase();
        const name = (op.op_name || op.operation || '').toLowerCase();
        
        const PREP_KEYWORDS = [
            'prep', 'preparatory', 'prepartory', 'allowance', 'thread sucking',
            'washing allowance', 'washing_allowance', 'right placket tape iron', 'gusset iron',
            'press sleeve placket', 'press pocket', 'right placket self fold iron',
            'left placket self fold iron', 'stitch tape to pocket', 'triangle patch ironing',
            'pocket overlock', 'pocket iron with fusing', 'pocket hem stitch'
        ];

        return PREP_KEYWORDS.some(kw => sec.includes(kw) || name.includes(kw));
    };

    const balancedOps = [...balancedPrep, ...balancedAssembly].map(item => {
        if (isPrepOp(item.operation)) {
            return { ...item, operation: { ...item.operation, section: 'Preparatory' } };
        }
        return item;
    });

    const rawSectionsMap = new Map();
    balancedOps.forEach(item => {
        if (isPrepOp(item.operation)) return; // Exclude from 3D layout

        const opName = (item.operation.op_name || item.operation.operation || '').toLowerCase();
        const IGNORED_OPERATIONS = ['washing allowance', 'washing_allowance', 'thread sucking', 'allowance'];
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
            const opName = (item.operation.op_name || item.operation.operation || '').toLowerCase();
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
        if (lane === 'A') z = LANE_Z_A;
        else if (lane === 'B') z = LANE_Z_B;
        else if (lane === 'C') z = LANE_Z_C;
        else if (lane === 'D') z = LANE_Z_D;

        const ROT_FACE_FRONT_INTERNAL = 0, ROT_FACE_BACK_INTERNAL = Math.PI;
        const isAssembly = secLower.includes('assembly') || secLower.includes('lane') || secLower.includes('line') || secLower.includes('joining');

        if (op.machine_type.toLowerCase().includes('inspection')) ry = -Math.PI / 2;
        else if (forcedRot !== undefined) ry = forcedRot;
        else if (isAssembly) ry = (lane === 'A' || lane === 'D') ? ROT_FACE_BACK_INTERNAL : ROT_FACE_FRONT_INTERNAL;
        else if (lane === 'A' || lane === 'C') ry = ROT_FACE_FRONT_INTERNAL;
        else ry = ROT_FACE_BACK_INTERNAL;

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
            id: `machine-${op.id || uuidv4()}-${mIdx}`,
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
        const isCD = cdSections.some(s => secLower.includes(s) || (canonicalKey === 'front' || canonicalKey === 'collar'));
        const finalIsAB = isAB && !isCD;
        const targetSpecs = canonicalKey ? specs.sections[canonicalKey] : null;
        let alternatingX = targetSpecs ? targetSpecs.start : 0;

        const isAssemblySec = (secLower.includes('assembly') || secLower.includes('joining')) && !canonicalKey;
        if (isAssemblySec) {
            const startX_AssemblyAB = specs.assemblyAB.start;
            const startX_AssemblyCD = specs.assemblyCD.start;
            const ASSEMBLY_GAP = 0.05;
            const laneCursors = { 
                B: startX_AssemblyAB + (ops[0] ? getMachineZoneDims(ops[0].operation.machine_type).length / 2 : 2 * FT), 
                A: startX_AssemblyAB + (ops[0] ? getMachineZoneDims(ops[0].operation.machine_type).length / 2 : 2 * FT), 
                D: startX_AssemblyCD + (ops[0] ? getMachineZoneDims(ops[0].operation.machine_type).length / 2 : 2 * FT), 
                C: startX_AssemblyCD + (ops[0] ? getMachineZoneDims(ops[0].operation.machine_type).length / 2 : 2 * FT)
            };
            const laneSections = { B: 'Assembly 1', A: 'Assembly 2', D: 'Assembly 3', C: 'Assembly 4' };
            const a4Ops = ops.slice(0, 3).reverse(); 
            a4Ops.forEach((item) => {
                const { operation, count } = item;
                const dims = getMachineZoneDims(operation.machine_type);
                for (let k = 0; k < count; k++) {
                    const xPos = laneCursors.C;
                    addMachine(operation, 'C', xPos, sectionCounters[laneSections.C]++, Math.PI / 2, laneSections.C, true);
                    laneCursors.C += dims.length + ASSEMBLY_GAP;
                }
            });
            const hDims = getMachineZoneDims("Helper Table");
            for (let i = 0; i < 2; i++) {
                addMachine({ op_no: 'H-C', op_name: 'Helper Table', machine_type: 'Helper Table', smv: 0, section: 'Assembly 4' }, 'C', laneCursors.C + hDims.length / 2, i + 1, 0, "Assembly 4", true);
                laneCursors.C += hDims.length + ASSEMBLY_GAP;
            }
            const mainOps = ops.slice(3);
            mainOps.forEach((item) => {
                const { operation, count } = item;
                const dims = getMachineZoneDims(operation.machine_type);
                for (let k = 0; k < count; k++) {
                    let bestLane = 'B';
                    if (laneCursors.A < laneCursors[bestLane]) bestLane = 'A';
                    if (laneCursors.D < laneCursors[bestLane]) bestLane = 'D';
                    addMachine(operation, bestLane, laneCursors[bestLane], sectionCounters[laneSections[bestLane]]++, (bestLane === 'A' || bestLane === 'D') ? Math.PI / 2 : -Math.PI / 2, laneSections[bestLane], true);
                    laneCursors[bestLane] += dims.length + ASSEMBLY_GAP;
                }
            });
            cursors.A = Math.max(laneCursors.A, laneCursors.B); cursors.B = cursors.A; cursors.D = laneCursors.D; cursors.C = laneCursors.C;
            sectionLayouts.push({ id: uuidv4(), name: "Assembly AB", position: { x: startX_AssemblyAB, y: 0, z: LANE_Z_CENTER_AB }, length: specs.assemblyAB.end - specs.assemblyAB.start, width: specs.widthAB, color: '#f06b43' });
            sectionLayouts.push({ id: uuidv4(), name: "Assembly CD", position: { x: startX_AssemblyCD, y: 0, z: LANE_Z_CENTER_CD }, length: specs.assemblyCD.end - specs.assemblyCD.start, width: specs.widthCD, color: '#14b8a6' });
            continue;
        }

        const sDims = getMachineZoneDims('supermarket');
        const iDims = getMachineZoneDims('inspection');
        const hasSupermarket = (canonicalKey === 'front' || canonicalKey === 'back');
        const hasCollarSupermarket = (canonicalKey === 'collar');
        const collarSupermarketReserve = hasCollarSupermarket ? (4.0 * FT + sDims.length) : 0;
        const supermarketStart = targetSpecs ? (targetSpecs.end - (hasSupermarket ? sDims.width : 0) - collarSupermarketReserve) : 500;
        const machineZoneEnd = supermarketStart - iDims.length - 0.5;
        const lLane = finalIsAB ? 'A' : 'C', rLane = finalIsAB ? 'B' : 'D';
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
                        lCX += w; cursors[lLane] = lCX;
                    } else {
                        if (rCX + w > machineZoneEnd) break;
                        addMachine(item.operation, rLane, rCX + w / 2, sectionCounters[sourceSecLabel]++, undefined, sourceSecLabel, true);
                        rCX += w; cursors[rLane] = rCX;
                    }
                    if ((item.operation.machine_type || '').toLowerCase().includes('inspection')) inspectionCount++;
                    altCtr++;
                }
            }
            if (inspectionCount === 0 && !existingInspection) {
                const iStart = Math.min(Math.max(lCX, rCX) + 0.4, machineZoneEnd + 0.05);
                addMachine(createDummyOp('Inspection', sourceSecLabel), finalIsAB ? 'A' : 'C', iStart + iDims.length / 2, undefined, -Math.PI / 2, sourceSecLabel, false);
                const lastM = layout[layout.length - 1]; if (lastM) lastM.isInspection = true;
                cursors[finalIsAB ? 'A' : 'C'] = iStart + iDims.length + 0.1; cursors[finalIsAB ? 'B' : 'D'] = iStart + iDims.length + 0.1;
            }
        };
        placeOps(ops, secName);

        if (targetSpecs) {
            sectionLayouts.push({ id: Math.random().toString(36).substring(2, 9), name: secName, position: { x: targetSpecs.start, y: 0, z: finalIsAB ? LANE_Z_CENTER_AB : LANE_Z_CENTER_CD }, length: targetSpecs.end - targetSpecs.start, width: finalIsAB ? specs.widthAB : specs.widthCD, color: finalIsAB ? '#f06b43' : '#14b8a6' });
        }

        const isFloor1_Support = lineValNum <= 6;
        if (isFloor1_Support) {
            if (secLower.includes('collar') && specs.collar) {
                const targetSpecsLocal = specs.collar;
                const anchorX = targetSpecsLocal.end;
                const collarCenterZ = finalIsAB ? LANE_Z_CENTER_AB : LANE_Z_CENTER_CD;
                addMachine(createDummyOp('Supermarket', secName), 'C', anchorX - 0.9 * FT, undefined, - Math.PI / 2, secName, true);
                const sm2 = layout[layout.length - 1]; if (sm2) { sm2.position.z = collarCenterZ - 1.5 * FT; sm2.id = `super2-${secName}`; }
                addMachine(createDummyOp('Supermarket', secName), 'C', anchorX - 5.2 * FT, undefined, Math.PI, secName, true);
                const sm1 = layout[layout.length - 1]; if (sm1) { sm1.position.z = collarCenterZ + 3.5 * FT; sm1.id = `super1-${secName}`; }
                addMachine(createDummyOp('Supermarket', secName), 'C', anchorX - 9.6 * FT, undefined, Math.PI / 2, secName, true);
                const sm3 = layout[layout.length - 1]; if (sm3) { sm3.position.z = collarCenterZ - 1.5 * FT; sm3.id = `super3-${secName}`; }
                cursors.C = Math.max(cursors.C, anchorX); cursors.D = Math.max(cursors.D, anchorX);
            }
            if (secLower.includes('front') && specs.front) {
                const tSpecs = specs.front;
                if (tSpecs) {
                    addMachine(createDummyOp('Supermarket', secName), (finalIsAB ? 'A' : 'C'), tSpecs.end - sDims.width / 2 - 0.2, undefined, undefined, secName, true);
                    const superM = layout[layout.length - 1]; if (superM) { superM.rotation.y = ROT_FACE_FRONT + Math.PI; superM.id = `super-${secName}`; }
                    if (finalIsAB) { cursors.A = Math.max(cursors.A, tSpecs.end); cursors.B = Math.max(cursors.B, tSpecs.end); }
                    else { cursors.C = Math.max(cursors.C, tSpecs.end); cursors.D = Math.max(cursors.D, tSpecs.end); }
                }
            }
        }
    }

    const totalSMV = rawOperations.reduce((sum, o) => sum + (parseFloat(o.smv) || 0), 0);
    const mCount = layout.filter(m => !m.isInspection).length;

    return { machines: layout, sections: sectionLayouts, warnings, totalSMV, balancedOps, target: targetOutput, filled: mCount, capacity: totalCapacity };
};

function createDummyOp(name, section, opNo = ' ') {
    return { op_no: opNo, op_name: name, machine_type: name, smv: 1.0, section };
}
