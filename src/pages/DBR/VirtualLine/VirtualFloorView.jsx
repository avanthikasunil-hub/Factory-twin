import { useMemo, useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Scene3D } from "./Scene3DView";
import { getLayoutSpecs, getMachineZoneDims } from "./layoutGenerator";
import { LANE_Z_CENTER_AB, LANE_Z_CENTER_CD, extractOpSMV } from "./generatorCotLayout";
import * as XLSX from "xlsx";
import { generateVirtualFloorLayout } from "./virtualFloorLayoutGenerator";
import { Users, Hash, ArrowRight, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { prodDb as db } from "@/firebase";
import { collection, query, where, getDocs, limit, onSnapshot, updateDoc } from "firebase/firestore";

const API_BASE_URL = "https://us-central1-lagunaclothing-ishika.cloudfunctions.net";

const MACHINE_NORMALISATION = {
    'bholemc': 'Button Hole M/C', 'buttonholemc': 'Button Hole M/C', 'bholem': 'Button Hole M/C',
    'buttonmc': 'Button M/C', 'buttonsew': 'Button M/C', 'buttonm': 'Button M/C',
    'snec': 'SNEC', 'pnec': 'SNEC', '3tol': 'SNEC', '4tol': 'SNEC', '5tol': 'SNEC', 'overlock': 'SNEC', '3to/l': 'SNEC', '4to/l': 'SNEC', '5to/l': 'SNEC', '3toverlock': 'SNEC', 'ol': 'SNEC',
    'snecmc': 'SNEC', 'snecm/c': 'SNEC',
    'kansai': 'Kansai', 'kansaismc': 'Kansai', 'kansaimc': 'Kansai',
    'dnls': 'DNLS', 'double': 'DNLS',
    'feedoffarm': 'FOA', 'foa': 'FOA',
    'irontable': 'Iron Table', 'ironingtable': 'Iron Table', 'pressingtable': 'Iron Table', 'ironing': 'Iron Table',
    'helpertable': 'Helper Table', 'manualtable': 'Helper Table', 'manual': 'Helper Table', 'trolley': 'Helper Table',
    'rotaryfusingmc': 'Rotary Fusing M/C', 'rotaryfusing': 'Rotary Fusing M/C',
    'buttonholestitch': 'Button Hole M/C', 'single': 'SNLS', 'lockstitch': 'SNLS', 'snls': 'SNLS'
};

const IGNORED_OPS = [
    'washing allowance', 'washing_allowance', 'thread sucking', 'allowance'
];

const BASE_LAYOUT_SPECS = getLayoutSpecs("Line 1");

// Simple helper to replace cn(...)
function cn(...classes) {
    return classes.filter(Boolean).join(' ');
}

// ─── CLIENT-SIDE SMV RE-PARSING ──────────────────────────────────────────────
const parsedSMVCache = {}; 

const SMV_HEADER_ALIASES = ['smv', 'sam', 'standardminute', 'stdmin', 'standardtime', 'cycletime', 'pitchtime', 'workcontents', 'mins', 'min'];

function normalizeKey(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

async function parseSMVFromExcel(fileUrl) {
    if (!fileUrl) return null;
    if (parsedSMVCache[fileUrl]) return parsedSMVCache[fileUrl];

    try {
        const resp = await fetch(fileUrl);
        const arrayBuf = await resp.arrayBuffer();
        const wb = XLSX.read(arrayBuf, { type: 'array' });
        const smvMap = {};

        wb.SheetNames.forEach(sheetName => {
            const ws = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            if (!rows || rows.length < 2) return;

            // Search for header row
            let headerIdx = -1, smvColIdx = -1, opColIdx = 1;
            const aliases = SMV_HEADER_ALIASES;

            for (let ri = 0; ri < Math.min(rows.length, 30); ri++) {
                const row = rows[ri].map(c => normalizeKey(c));
                const sIdx = row.findIndex(c => aliases.some(a => c === a));
                if (sIdx >= 0) {
                    headerIdx = ri;
                    smvColIdx = sIdx;
                    const oIdx = row.findIndex(c => ['operation', 'opname', 'description', 'particulars', 'process'].some(tag => c.includes(tag)));
                    if (oIdx >= 0) opColIdx = oIdx;
                    break;
                }
            }

            const startRow = headerIdx >= 0 ? headerIdx + 1 : 0;
            for (let ri = startRow; ri < rows.length; ri++) {
                const row = rows[ri];
                if (!row || row.length < 2) continue;

                // Flexible operation name and SMV detection
                const opName = normalizeKey(row[opColIdx]);
                if (!opName || opName.length < 3) continue;
                
                // CRITICAL: Block subtotal/total rows from being treated as operations
                if (opName.includes('total') || opName.includes('subtotal') || opName.includes('summary')) continue;

                let smvVal = 0;
                // Priority 1: Use detected SMV column
                if (smvColIdx >= 0 && row[smvColIdx] != null) {
                    const parsed = parseFloat(String(row[smvColIdx]).replace(/[^\d.]/g, ''));
                    if (!isNaN(parsed) && parsed > 0 && parsed < 50) smvVal = parsed;
                }
                
                // Priority 2: Fallback scan for anything that looks like a valid SMV (0.1 - 10.0 range)
                if (smvVal === 0) {
                    for (let ci = 2; ci < row.length; ci++) {
                        const val = parseFloat(String(row[ci]).replace(/[^\d.]/g, ''));
                        if (!isNaN(val) && val > 0.05 && val < 5) { smvVal = val; break; }
                    }
                }

                if (smvVal > 0) {
                    smvMap[opName] = smvVal;
                }
            }
        });

        parsedSMVCache[fileUrl] = smvMap;
        return smvMap;
    } catch (err) {
        console.warn('[VirtualFloor] Failed to parse SMV from Excel:', err);
        return null;
    }
}

async function patchFirestoreSMV(docRef, parsedOBData, smvMap) {
    if (!smvMap || Object.keys(smvMap).length === 0) return;
    try {
        const updated = JSON.parse(JSON.stringify(parsedOBData));
        const sheets = Array.isArray(updated) ? { default: updated } : updated;
        Object.values(sheets).forEach(sections => {
            if (!Array.isArray(sections)) return;
            sections.forEach(sec => {
                (sec.operations || []).forEach(op => {
                    const key = normalizeKey(op.operation || op.op_name || '');
                    if (smvMap[key] && !op.smv) {
                        op.smv = smvMap[key];
                        op.sam = smvMap[key];
                    }
                });
            });
        });
        await updateDoc(docRef, { parsedOBData: Array.isArray(updated) ? updated : sheets });
        console.log('[VirtualFloor] Patched SMV values into Firestore doc');
    } catch (err) {
        console.warn('[VirtualFloor] Could not patch Firestore SMV:', err);
    }
}

export default function VirtualFloorView() {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeFloor = searchParams.get("floor") || "Floor 1";
    const activeLine = searchParams.get("line") || "All Lines";

    const [lineStatuses, setLineStatuses] = useState(
        Array.from({ length: 9 }, (_, i) => ({ line_no: `Line ${i + 1}`, status: 'Idle' }))
    );
    const [lineMachines, setLineMachines] = useState({});
    const [lineOBData, setLineOBData] = useState({});
    const historicalCache = useRef({});
    const lineHistory = useRef({}); 
    const lastLoadedCons = useRef({}); 
    const metadataUnsubs = useRef({}); 
    const excelCache = useRef({}); 

    // Compute cumulative Z offset using same gaps as Sewing view
    const solveZOffset = (lineName) => {
        const lineNum = parseInt(lineName.replace(/\D/g, '')) || 1;
        const floorPrefix = lineNum <= 6 ? 1 : 7;
        const { specs } = getLayoutSpecs("Line 1");
        const minZ = LANE_Z_CENTER_AB - (specs.widthAB / 2);
        const maxZ = LANE_Z_CENTER_CD + (specs.widthCD / 2);
        const lineWidth = maxZ - minZ;
        const FT = 0.3048;
        let zO = 0;
        for (let i = floorPrefix; i < lineNum; i++) {
            const ln = `Line ${i + 1}`;
            let gap = 3.5 * FT;
            if (ln === "Line 3") gap = 6.29 * FT;
            if (ln === "Line 6") gap = 3.15 * FT;
            zO += lineWidth + gap;
        }
        return zO;
    };

    const handleTargetChange = (lineName, val) => {
        if (val === "" || /^[0-9]+$/.test(val)) {
            const numVal = Math.min(2500, parseInt(val) || 0);
            const lineData = lineOBData[lineName];
            if (!lineData) return;

            const newEff = lineData.efficiency || 85;
            const opsToUse = lineData.rawOps || [];
            
            // Calculate new layout immediately
            if (opsToUse.length > 0) {
                const result = generateVirtualFloorLayout(opsToUse, lineName, numVal, newEff);
                const zOffset = solveZOffset(lineName);
                const positioned = result.machines.map(m => ({
                    ...m,
                    position: { ...m.position, z: m.position.z + zOffset }
                }));

                setLineMachines(prev => ({ ...prev, [lineName]: positioned }));
                setLineOBData(prev => ({
                    ...prev,
                    [lineName]: { 
                        ...prev[lineName], 
                        target: numVal,
                        ops: result.balancedOps,
                        filled: result.filled,
                        capacity: result.capacity,
                        totalSMV: (result.totalSMV || 0).toFixed(2)
                    }
                }));
            } else {
                setLineOBData(prev => ({
                    ...prev,
                    [lineName]: { ...prev[lineName], target: numVal }
                }));
            }
        }
    };

    const handleEfficiencyChange = (lineName, val) => {
        if (val === "" || /^[0-9]+$/.test(val)) {
            const numVal = Math.min(100, parseInt(val) || 0);
            const lineData = lineOBData[lineName];
            if (!lineData) return;

            const newTarget = lineData.target || 1800;
            const opsToUse = lineData.rawOps || [];

            if (opsToUse.length > 0) {
                const result = generateVirtualFloorLayout(opsToUse, lineName, newTarget, numVal);
                const zOffset = solveZOffset(lineName);
                const positioned = result.machines.map(m => ({
                    ...m,
                    position: { ...m.position, z: m.position.z + zOffset }
                }));

                setLineMachines(prev => ({ ...prev, [lineName]: positioned }));
                setLineOBData(prev => ({
                    ...prev,
                    [lineName]: { 
                        ...prev[lineName], 
                        efficiency: numVal,
                        ops: result.balancedOps,
                        filled: result.filled,
                        capacity: result.capacity,
                        totalSMV: (result.totalSMV || 0).toFixed(2)
                    }
                }));
            } else {
                setLineOBData(prev => ({
                    ...prev,
                    [lineName]: { ...prev[lineName], efficiency: numVal }
                }));
            }
        }
    };

    useEffect(() => {
        let unsub = null;
        let isMounted = true;

        const init = async () => {
            try {
                // Remove docType filter to match War Room exactly
                const qGlobal = query(collection(db, 'changeoverData'), limit(500));
                const snap = await getDocs(qGlobal);
                
                const linesMap = {};
                snap.docs.forEach(doc => {
                    const d = { ...doc.data(), id: doc.id };
                    const rawLn = d.line || d.summaryData?.line || d.summaryData?.lineId || d.lineId;
                    if (!rawLn) return;
                    const match = String(rawLn).match(/\d+/);
                    if (!match) return;
                    const ln = `Line ${match[0]}`;
                    if (!linesMap[ln]) linesMap[ln] = [];
                    linesMap[ln].push(d);
                });

                const today = new Date();
                const todayDateStr = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
                const todayAltDateStr = todayDateStr.split('/').map(p => p.padStart(2, '0')).join('/');

                const results = [];
                for (let i = 1; i <= 9; i++) {
                    const ln = `Line ${i}`;
                    const lineDocs = linesMap[ln] || [];
                    if (lineDocs.length > 0) {
                        const sortedDocs = [...lineDocs].sort((a, b) => (b.timestamp?.seconds || b.timestamp || 0) - (a.timestamp?.seconds || a.timestamp || 0));
                        
                        const isWarRoomLive = (doc) => {
                            const status = (doc.status || "").toLowerCase();
                            if (status !== 'partial' && status !== 'in_progress') return false;
                            const dStr = doc.lastUpdated || doc.summaryData?.lastUpdated || "";
                            return (dStr.includes(todayDateStr) || dStr.includes(todayAltDateStr));
                        };

                        const activeDoc = sortedDocs.find(isWarRoomLive);
                        const summaryDoc = sortedDocs.find(d => d.docType === 'summary' || d.status?.toLowerCase() === 'running' || d.status?.toLowerCase() === 'complete');
                        const target = activeDoc || summaryDoc || sortedDocs[0];
                        
                        results.push({ 
                            line_no: ln, 
                            status: activeDoc ? 'Changeover' : 'Running', 
                            style_no: target.toStyle || target.summaryData?.toStyle || target.style || '---', 
                            con_no: target.conNumber || target.summaryData?.conNumber || target.con || '---', 
                            buyer: target.toBuyer || target.buyer || target.summaryData?.buyer || target.summaryData?.toBuyer || target.fromBuyer || '---' 
                        });
                    } else {
                        const qMetaDirect = query(collection(db, 'styleOBmetadata'), where('uploadLine', 'in', [ln, ln.toUpperCase(), ln.replace(' ', ''), String(i)]), limit(1));
                        const snapMetaDirect = await getDocs(qMetaDirect);
                        if (!snapMetaDirect.empty) {
                            const dm = snapMetaDirect.docs[0].data();
                            results.push({ line_no: ln, status: 'Running', style_no: dm.style || '---', con_no: dm.conNo || '---', buyer: dm.buyer || '---' });
                        } else results.push({ line_no: ln, status: 'Idle' });
                    }
                }
                if (!isMounted) return;
                lineHistory.current = linesMap;
                setLineStatuses(results);
                
                // Pre-populate lineOBData with defaults for non-Idle lines
                const initialOB = {};
                results.forEach(res => {
                    if (res.status !== 'Idle') {
                        initialOB[res.line_no] = { 
                            target: 1800, 
                            efficiency: 85, 
                            totalSMV: '0.00',
                            ops: [],
                            rawOps: []
                        };
                    }
                });
                setLineOBData(initialOB);

                // Real-time listener matching War Room (No summary filter)
                const qReal = collection(db, 'changeoverData');
                unsub = onSnapshot(qReal, (snap) => {
                    const lMap = {};
                    snap.docs.forEach(doc => {
                        const d = { ...doc.data(), id: doc.id };
                        const match = String(d.line || d.summaryData?.line || d.summaryData?.lineId || d.lineId).match(/\d+/);
                        if (!match) return;
                        const lnIdx = `Line ${match[0]}`;
                        if (!lMap[lnIdx]) lMap[lnIdx] = [];
                        lMap[lnIdx].push(d);
                    });

                    const merged = [];
                    for (let i = 1; i <= 9; i++) {
                        const ln = `Line ${i}`;
                        const docs = lMap[ln] || [];
                        const sorted = [...docs].sort((a, b) => (b.timestamp?.seconds || b.timestamp || 0) - (a.timestamp?.seconds || a.timestamp || 0));

                        const isWarRoomLive = (doc) => {
                            const status = (doc.status || "").toLowerCase();
                            if (status !== 'partial' && status !== 'in_progress') return false;
                            const dStr = doc.lastUpdated || doc.summaryData?.lastUpdated || "";
                            return (dStr.includes(todayDateStr) || dStr.includes(todayAltDateStr));
                        };

                        const activeDoc = sorted.find(isWarRoomLive);
                        const summaryDoc = sorted.find(d => d.docType === 'summary' || d.status?.toLowerCase() === 'running' || d.status?.toLowerCase() === 'complete');
                        const target = activeDoc || summaryDoc || sorted[0];

                        if (target) {
                            merged.push({ 
                                line_no: ln, 
                                status: activeDoc ? 'Changeover' : 'Running', 
                                style_no: target.toStyle || target.summaryData?.toStyle || target.style || '---', 
                                con_no: target.conNumber || target.summaryData?.conNumber || target.con || '---', 
                                buyer: target.toBuyer || target.buyer || target.summaryData?.buyer || target.summaryData?.toBuyer || target.fromBuyer || '---' 
                            });
                        } else {
                            merged.push({ line_no: ln, status: 'Idle' });
                        }
                    }
                    setLineStatuses(merged);
                });
            } catch (err) { console.error("[VirtualFloor] Init failed:", err); }
        };
        init();
        return () => { isMounted = false; if (unsub) unsub(); };
    }, []);

    useEffect(() => {
        const updateLineData = async (status) => {
            const { line_no, con_no: currentCon, style_no: currentStyle } = status;
            if (!line_no || status.status === 'Idle') return;

            const cacheKey = `${currentCon}-${currentStyle}`;
            if (lastLoadedCons.current[line_no] === cacheKey && currentCon !== '---' && lineMachines[line_no]) return;

            if (metadataUnsubs.current[line_no]) { metadataUnsubs.current[line_no](); delete metadataUnsubs.current[line_no]; }

            const searchList = [];
            if ((currentCon && currentCon !== '---') || (currentStyle && currentStyle !== '---')) searchList.push({ con: currentCon, style: currentStyle });
            
            const history = lineHistory.current[line_no] || [];
            history.forEach(d => {
                const c = d.conNumber || d.summaryData?.conNumber || d.con || d.conNo;
                const s = d.style || d.toStyle || d.summaryData?.toStyle;
                if ((c && c !== '---') || (s && s !== '---')) {
                    if (!searchList.some(item => item.con === c && item.style === s)) searchList.push({ con: c, style: s });
                }
            });

            const queryPromises = searchList.map(item => {
                if (item.con && item.con !== '---') return getDocs(query(collection(db, 'styleOBmetadata'), where('conNo', '==', item.con), limit(1)));
                else if (item.style && item.style !== '---') return getDocs(query(collection(db, 'styleOBmetadata'), where('style', '==', item.style), limit(1)));
                return Promise.resolve(null);
            });

            const snapshots = await Promise.all(queryPromises);
            const foundIdx = snapshots.findIndex(s => s && !s.empty);

            if (foundIdx !== -1) {
                const docRef = snapshots[foundIdx].docs[0].ref;
                lastLoadedCons.current[line_no] = cacheKey;
                metadataUnsubs.current[line_no] = onSnapshot(docRef, async (docSnap) => {
                    const metadata = docSnap.data();
                    if (!metadata) return;
                    const parsedOB = metadata.parsedOBData || {};

                    const buildOps = (smvMap) => {
                        const ops = [];
                        const data = Array.isArray(parsedOB) ? parsedOB : Object.values(parsedOB);
                        data.forEach(group => {
                            const add = (block) => {
                                const sName = block.section?.trim() || 'General';
                                (block.operations || []).forEach(op => {
                                    if (IGNORED_OPS.some(p => (op.op_name || op.operation || '').toLowerCase().includes(p))) return;
                                    
                                    // 1. Precise Match (Normalized)
                                    const key = normalizeKey(op.operation || op.op_name || '');
                                    let rawSMV = (smvMap && key) ? smvMap[key] : null;
                                    
                                    // 2. Heavy Fuzzy Match (Keyword Overlap)
                                    if (!rawSMV && smvMap) {
                                        const opName = (op.operation || op.op_name || '').toLowerCase();
                                        const opTokens = opName.split(/[\s\-_/]+/).filter(t => t.length > 3);
                                        
                                        // Try to find any key that shares at least 2 long tokens or is a substring
                                        const foundKey = Object.keys(smvMap).find(k => {
                                            if (k.length > 5 && (opName.includes(k) || k.includes(opName))) return true;
                                            const kTokens = k.split(/[\s\-_/]+/).filter(t => t.length > 3);
                                            const matches = opTokens.filter(t => k.includes(t)).length;
                                            return matches >= 2;
                                        });
                                        if (foundKey) rawSMV = smvMap[foundKey];
                                    }
                                    
                                    // 3. Last Resort: Firestore value
                                    if (!rawSMV || rawSMV === 0) rawSMV = extractOpSMV(op);
                                    
                                    // 4. Sanity Cap & Final Fallback
                                    if (rawSMV > 10.0) rawSMV = 1.0; 
                                    if (!rawSMV || rawSMV === 0) rawSMV = 1.0; 
                                    
                                    const rawMachine = op.machine_type || op.machine || '';
                                    const machineType = MACHINE_NORMALISATION[rawMachine.toLowerCase().replace(/[^a-z0-9]/g, '').trim()] || rawMachine || 'SNLS';
                                    ops.push({ ...op, section: sName, smv: rawSMV, op_name: op.op_name || op.operation || 'Unknown', machine_type: machineType });
                                });
                            };
                            if (Array.isArray(group)) group.forEach(add);
                            else if (group && typeof group === 'object' && group.operations) add(group);
                        });
                        return ops;
                    };

                    const apply = (ops) => {
                        const result = generateVirtualFloorLayout(ops, line_no);
                        const zOffset = solveZOffset(line_no);
                        const positioned = result.machines.map(m => ({ ...m, position: { ...m.position, z: m.position.z + zOffset } }));
                        setLineMachines(prev => ({ ...prev, [line_no]: positioned }));
                        setLineOBData(prev => ({ ...prev, [line_no]: { ops: result.balancedOps, rawOps: ops, totalSMV: (result.totalSMV || 0).toFixed(2), target: result.target, filled: result.filled, capacity: result.capacity, efficiency: prev[line_no]?.efficiency || 85 } }));
                    };

                    const initialOps = buildOps(null);
                    if (initialOps.every(op => !op.smv || op.smv === 0) && metadata.fileUrl) {
                        let smvMap = excelCache.current[metadata.fileUrl] || await parseSMVFromExcel(metadata.fileUrl);
                        if (smvMap) { excelCache.current[metadata.fileUrl] = smvMap; apply(buildOps(smvMap)); patchFirestoreSMV(docRef, parsedOB, smvMap); }
                        else apply(initialOps);
                    } else apply(initialOps);
                });
            }
        };
        lineStatuses.forEach(updateLineData);
        return () => { Object.values(metadataUnsubs.current).forEach(u => u()); metadataUnsubs.current = {}; };
    }, [lineStatuses]);

    const activeMachines = useMemo(() => {
        const filterLine = (ln) => {
            const num = parseInt(ln.replace(/\D/g, ''));
            const floorMatch = activeFloor === "Floor 1" ? (num >= 1 && num <= 6) : (num >= 7 && num <= 9);
            const focusMatch = activeLine === "All Lines" || ln === activeLine;
            return floorMatch && focusMatch;
        };
        const ms = [];
        Object.keys(lineMachines).forEach(ln => { if (filterLine(ln) && lineMachines[ln]) ms.push(...lineMachines[ln]); });
        return ms;
    }, [lineMachines, activeLine, activeFloor]);

    const floorSections = useMemo(() => {
        const { specs } = getLayoutSpecs("Line 1");
        const FT = 0.3048;
        const minZ = LANE_Z_CENTER_AB - (specs.widthAB / 2);
        const maxZ = LANE_Z_CENTER_CD + (specs.widthCD / 2);
        const lineWidth = maxZ - minZ;
        const numLines = activeFloor === "Floor 1" ? 6 : 3;
        const floorPrefix = activeFloor === "Floor 1" ? 1 : 7;
        const all = [];
        let zO = 0;
        for (let i = 0; i < numLines; i++) {
            const lineNum = floorPrefix + i;
            const ln = `Line ${lineNum}`;
            if (i > 0) {
                let gap = 3.5 * FT;
                if (ln === "Line 3") gap = 6.29 * FT;
                if (ln === "Line 6") gap = 3.15 * FT;
                zO += lineWidth + gap;
            }
            if (activeLine !== "All Lines" && ln !== activeLine) continue;
            const { specs: s, sections: se } = getLayoutSpecs(ln);
            const status = lineStatuses.find(st => st.line_no === ln);
            const color = status?.status === "Changeover" ? '#facc15' : '#3b82f6';
            all.push(
                { id: `${ln}-c`, name: `${ln} Cuff`, length: se.cuff.end - se.cuff.start, width: s.widthAB, position: { x: se.cuff.start, y: 0, z: LANE_Z_CENTER_AB + zO }, color },
                { id: `${ln}-s`, name: `${ln} Sleeve`, length: se.sleeve.end - se.sleeve.start, width: s.widthAB, position: { x: se.sleeve.start, y: 0, z: LANE_Z_CENTER_AB + zO }, color },
                { id: `${ln}-b`, name: `${ln} Back`, length: se.back.end - se.back.start, width: s.widthAB, position: { x: se.back.start, y: 0, z: LANE_Z_CENTER_AB + zO }, color },
                { id: `${ln}-cl`, name: `${ln} Collar`, length: se.collar.end - se.collar.start, width: s.widthCD, position: { x: se.collar.start, y: 0, z: LANE_Z_CENTER_CD + zO }, color },
                { id: `${ln}-f`, name: `${ln} Front`, length: se.front.end - se.front.start, width: s.widthCD, position: { x: se.front.start, y: 0, z: LANE_Z_CENTER_CD + zO }, color },
                { id: `${ln}-a1`, name: `${ln} Assembly AB`, length: se.assemblyAB.end - se.assemblyAB.start, width: s.widthAB, position: { x: se.assemblyAB.start, y: 0, z: LANE_Z_CENTER_AB + zO }, color },
                { id: `${ln}-a2`, name: `${ln} Assembly CD`, length: se.assemblyCD.end - se.assemblyCD.start, width: s.widthCD, position: { x: se.assemblyCD.start, y: 0, z: LANE_Z_CENTER_CD + zO }, color }
            );
        }
        return all;
    }, [activeFloor, activeLine, lineStatuses]);

    const cameraConfig = useMemo(() => {
        const FT = 0.3048;
        const { specs } = getLayoutSpecs("Line 1");
        const minZ = LANE_Z_CENTER_AB - (specs.widthAB / 2);
        const maxZ = LANE_Z_CENTER_CD + (specs.widthCD / 2);
        const lineWidth = maxZ - minZ;
        if (activeLine === "All Lines") return activeFloor === "Floor 1" ? { position: [-90, 80, 12], fov: 32 } : { position: [-60, 50, 8], fov: 28 };
        const zO = solveZOffset(activeLine);
        return { position: [-30, 40, (LANE_Z_CENTER_AB + LANE_Z_CENTER_CD) / 2 + zO], fov: 25 };
    }, [activeFloor, activeLine]);

    return (
        <div className="absolute inset-0 flex flex-row bg-slate-950 overflow-hidden">
            <div className="flex-1 relative bg-[#0a0a0c]">
                <Scene3D showMachines={true} machines={activeMachines} sections={floorSections} isOverview={activeLine === "All Lines"} cameraPosition={cameraConfig.position} cameraFov={cameraConfig.fov} showStatusLights={false} />
            </div>

            <div className="w-[340px] bg-slate-900 border-l border-white/5 flex flex-col shadow-2xl relative z-20 overflow-y-auto">
                <div className="p-6 border-b border-white/5 bg-slate-900/50 backdrop-blur-md">
                    <h3 className="text-white font-black text-xs uppercase tracking-[0.2em] flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live Line Status
                    </h3>
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-2 ml-5">Floor Overview 1-9</p>
                </div>

                <div className="flex-1 p-4 space-y-4 overflow-y-auto custom-scrollbar">
                    {activeLine !== "All Lines" && (
                        <>
                            <div className="mb-6 p-4 rounded-2xl bg-violet-600/10 border border-violet-500/30">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400 mb-4 flex items-center justify-between">
                                    Operation Bulletin
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1 bg-violet-500/20 text-violet-400 px-3 py-1 rounded-full border border-violet-500/10">
                                            <span className="text-[9px] font-black tracking-widest uppercase">Cap:</span>
                                            <span className="text-[9px] font-black text-white">{lineOBData[activeLine]?.filled || 0}/{lineOBData[activeLine]?.capacity || 0}</span>
                                        </div>
                                        <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/10">
                                            <span className="text-[8px]">Tgt:</span>
                                            <span className="text-[8px] font-black text-emerald-300">{lineOBData[activeLine]?.target || "---"}</span>
                                        </div>
                                    </div>
                                </h4>
                                <div className="grid grid-cols-2 gap-2 mb-4">
                                    <div className="p-2 rounded-lg bg-black/40 border border-white/5 flex flex-col items-center">
                                        <span className="text-[7px] font-black uppercase tracking-widest text-slate-500">Total SMV</span>
                                        <span className="text-[11px] font-black text-white">{lineOBData[activeLine]?.totalSMV || '0.00'}</span>
                                    </div>
                                    <div className="p-2 rounded-lg bg-black/40 border border-white/5 flex flex-col items-center">
                                        <span className="text-[7px] font-black uppercase tracking-widest text-slate-500">Efficiency</span>
                                        <span className="text-[11px] font-black text-emerald-400">{lineOBData[activeLine]?.efficiency || 85}%</span>
                                    </div>
                                </div>
                                <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2 pb-2">
                                    {(() => {
                                        const ops = lineOBData[activeLine]?.ops || [];
                                        const sections = {};
                                        ops.forEach(op => {
                                            const sec = op.operation.section || 'General';
                                            if (sec === 'Preparatory') return;
                                            if (!sections[sec]) sections[sec] = [];
                                            sections[sec].push(op);
                                        });
                                        return Object.entries(sections).map(([name, sOps]) => (
                                            <div key={name} className="space-y-2">
                                                <div className="flex items-center gap-2 px-1 mb-1">
                                                    <div className="h-px flex-1 bg-gradient-to-r from-violet-500/50 to-transparent" />
                                                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-violet-400/80">{name}</span>
                                                    <div className="h-px flex-1 bg-gradient-to-l from-violet-500/50 to-transparent" />
                                                </div>
                                                {sOps.map((op, oi) => (
                                                    <div key={oi} className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5 hover:border-violet-500/30 transition-all group/op">
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-[9px] font-bold text-slate-200 truncate group-hover/op:text-white">{op.operation.op_name}</span>
                                                            <span className="text-[7px] font-black uppercase tracking-tighter text-slate-500 group-hover/op:text-slate-400">{op.operation.machine_type}</span>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1">
                                                            <div className="text-[9px] font-black text-violet-400 tabular-nums bg-violet-500/10 px-2 py-0.5 rounded-md border border-violet-500/10">
                                                                {(parseFloat(op.operation.smv) || 0).toFixed(2)}
                                                            </div>
                                                            <span className="text-[7px] font-black text-emerald-400/80 uppercase">Req: {op.count || 1}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ));
                                    })()}
                                    {(!lineOBData[activeLine]?.ops || lineOBData[activeLine].ops.length === 0) && (
                                        <div className="text-center py-4 text-slate-600 text-[10px] font-bold uppercase tracking-widest italic"> Loading OB Data... </div>
                                    )}
                                </div>
                            </div>

                            {/* Preparatory Section Outside Main Box */}
                            {(() => {
                                const ops = lineOBData[activeLine]?.ops || [];
                                const prepOps = ops.filter(op => op.operation.section === 'Preparatory');
                                if (prepOps.length === 0) return null;
                                return (
                                    <div className="mb-6 p-4 rounded-2xl bg-white/[0.03] border border-white/10 shadow-xl">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 mb-4 flex items-center gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                            Preparatory
                                            <div className="flex-1 h-[1px] bg-white/5" />
                                            <span className="text-[8px] font-mono text-slate-600">Count: {prepOps.length}</span>
                                        </h4>
                                        <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                            {prepOps.map((op, oi) => (
                                                <div key={oi} className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/[0.02] hover:bg-black/40 transition-all group/prep">
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-[9px] font-bold text-slate-300 truncate group-hover/prep:text-white">{op.operation.op_name}</span>
                                                        <span className="text-[7px] font-black uppercase tracking-tighter text-slate-600">{op.operation.machine_type}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                        <div className="text-[8px] font-black text-slate-400 tabular-nums border border-white/5 px-2 py-0.5 rounded-md">
                                                            {(parseFloat(op.operation.smv) || 0).toFixed(2)}
                                                        </div>
                                                        <span className="text-[7px] font-black text-slate-500 uppercase">Req: {op.count || 1}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                        </>
                    )}

                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => {
                        const lineName = `Line ${id}`;
                        const status = lineStatuses.find(s => s.line_no === lineName);
                        const isActive = activeLine === lineName;
                        return (
                            <motion.div key={id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: id * 0.05 }} className={cn("p-4 rounded-2xl border transition-all duration-300 group relative overflow-hidden", isActive ? "bg-violet-600/20 border-violet-500/50 shadow-lg shadow-violet-500/10" : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10")}>
                                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-500" />}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] border", isActive ? "bg-violet-600 border-violet-400 text-white" : "bg-slate-800 border-white/5 text-slate-400")}> L{id} </div>
                                        <span className={cn("font-black text-xs uppercase tracking-wider", isActive ? "text-white" : "text-slate-300")}>{lineName}</span>
                                    </div>
                                    <div className={cn("px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border", status?.status === "Running" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : status?.status === "Changeover" ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400" : "bg-slate-800 border-white/5 text-slate-500")}> {status?.status || "Idle"} </div>
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/[0.02]">
                                        <Hash size={12} className="text-slate-500" />
                                        <div className="flex flex-col">
                                            <span className={cn("text-[8px] font-black uppercase tracking-tighter", status?.status === 'Changeover' ? "text-indigo-400" : "text-slate-500")}> {status?.status === 'Changeover' ? 'To Style' : 'Style'} </span>
                                            <span className={cn("text-[10px] font-bold tracking-wide truncate max-w-[180px]", status?.status === 'Changeover' ? "text-white" : "text-slate-200")}> {status?.style_no || "---"} </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/40 border border-white/5 group-hover:border-violet-500/20 transition-colors">
                                        <TrendingUp size={12} className="text-violet-400" />
                                        <div className="flex flex-col">
                                            <span className="text-[8px] text-slate-500 font-black uppercase tracking-tighter">Daily Target</span>
                                            <input 
                                                type="text" 
                                                className="text-[10px] bg-slate-950 text-white font-black tracking-wide border border-white/10 outline-none w-16 px-2 py-1 rounded-lg focus:border-violet-500 transition-all shadow-inner" 
                                                value={lineOBData[lineName]?.target ?? 1800} 
                                                onClick={(e) => e.stopPropagation()} 
                                                onChange={(e) => handleTargetChange(lineName, e.target.value)} 
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/40 border border-white/5 group-hover:border-emerald-500/20 transition-colors">
                                        <TrendingUp size={12} className="text-emerald-400" />
                                        <div className="flex flex-col">
                                            <span className="text-[8px] text-slate-500 font-black uppercase tracking-tighter">Eff (%)</span>
                                            <input 
                                                type="text" 
                                                className="text-[10px] bg-slate-950 text-white font-black tracking-wide border border-white/10 outline-none w-14 px-2 py-1 rounded-lg focus:border-emerald-500 transition-all shadow-inner" 
                                                value={lineOBData[lineName]?.efficiency ?? 85} 
                                                onClick={(e) => e.stopPropagation()} 
                                                onChange={(e) => handleEfficiencyChange(lineName, e.target.value)} 
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/[0.02]">
                                        <Users size={12} className="text-slate-500" />
                                        <div className="flex flex-col">
                                            <span className="text-[8px] text-slate-500 font-black uppercase tracking-tighter">Buyer</span>
                                            <span className="text-[10px] text-slate-200 font-bold tracking-wide truncate max-w-[150px]"> {status?.buyer || "---"} </span>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setSearchParams({ floor: id <= 6 ? "Floor 1" : "Floor 2", line: lineName })} className={cn("mt-3 w-full py-2 rounded-xl flex items-center justify-center gap-2 transition-all", isActive ? "bg-violet-600 text-white font-black text-[9px] uppercase tracking-widest" : "bg-slate-800 text-slate-400 font-bold text-[9px] uppercase tracking-widest hover:bg-slate-700 hover:text-white")}> {isActive ? "Currently Focused" : "Focus Line"} {!isActive && <ArrowRight size={10} />} </button>
                            </motion.div>
                        );
                    })}
                </div>
                <div className="p-4 border-t border-white/5 bg-slate-900/80 mt-auto">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
                        <span>Total Capacity</span>
                        <span className="text-slate-300">9 Production Lines</span>
                    </div>
                </div>
            </div>
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.1); }
            `}</style>
        </div>
    );
}
