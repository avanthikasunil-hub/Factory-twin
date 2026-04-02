import { useMemo, useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Scene3D } from "./Scene3DView";
import { getLayoutSpecs, getMachineZoneDims, LANE_Z_CENTER_AB, LANE_Z_CENTER_CD, FT } from "./layoutGenerator";
import { generateVirtualFloorLayout, extractOpSMV, extractOpName } from "./generatorCotLayout";
import * as XLSX from "xlsx";
import { Users, Hash, ArrowRight, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { prodDb as db } from "@/firebase";
import { collection, query, where, getDocs, limit, onSnapshot } from "firebase/firestore";
import { API_BASE_URL } from "../../config";

const MACHINE_NORMALISATION = {
    'bholemc': 'Button Hole M/C', 'buttonholemc': 'Button Hole M/C', 'bholem': 'Button Hole M/C',
    'buttonmc': 'Button M/C', 'buttonsew': 'Button M/C', 'buttonm': 'Button M/C',
    'snec': 'SNEC', '3tol': 'SNEC', 'overlock': 'SNEC',
    'irontable': 'Iron Table', 'ironingtable': 'Iron Table', 'pressingtable': 'Iron Table',
    'helpertable': 'Helper Table', 'manualtable': 'Helper Table',
    'rotaryfusingmc': 'Rotary Fusing M/C', 'rotaryfusing': 'Rotary Fusing M/C',
    'buttonholestitch': 'Button Hole M/C', 'single': 'SNLS', 'lockstitch': 'SNLS',
    '3to/l': 'SNEC', '4to/l': 'SNEC', '5to/l': 'SNEC', '3toverlock': 'SNEC',
    'ol': 'SNEC', 'ironing': 'Iron Table', 'manual': 'Helper Table', 'trolley': 'Helper Table'
};

const IGNORED_OPS = [
    'washing allowance', 'washing_allowance', 'right placket tape iron',
    'gusset iron', 'press sleeve placket', 'press pocket',
    'right placket self fold iron', 'left placket self fold iron',
    'stitch tape to pocket', 'triangle patch ironing',
    'pocket overlock', 'pocket iron with fusing', 'pocket hem stitch', 'allowance'
];

const BASE_LAYOUT_SPECS = getLayoutSpecs("Line 1");
function cn(...classes) { return classes.filter(Boolean).join(' '); }

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
            let headerIdx = -1, smvColIdx = -1, opColIdx = 1;
            for (let ri = 0; ri < Math.min(rows.length, 15); ri++) {
                const row = rows[ri];
                const cells = row.map(c => normalizeKey(c));
                const smvIdx = cells.findIndex(c => SMV_HEADER_ALIASES.includes(c));
                if (smvIdx >= 0) { headerIdx = ri; smvColIdx = smvIdx; const opIdx = cells.findIndex(c => ['operation', 'opname', 'description', 'particulars', 'process'].includes(c)); if (opIdx >= 0) opColIdx = opIdx; break; }
            }
            const startRow = headerIdx >= 0 ? headerIdx + 1 : 1;
            for (let ri = startRow; ri < rows.length; ri++) {
                const row = rows[ri];
                const colA = String(row[0] || '').trim().replace(/\.$/, '');
                if (!Number.isInteger(Number(colA)) || Number(colA) < 1) continue;
                const opName = normalizeKey(row[opColIdx]);
                if (!opName) continue;
                let smvVal = 0;
                if (smvColIdx >= 0 && row[smvColIdx] != null) { const parsed = parseFloat(String(row[smvColIdx]).replace(/[^\d.,]/g, '').replace(',', '.')); if (!isNaN(parsed) && parsed > 0 && parsed < 100) smvVal = parsed; }
                if (smvVal === 0) { for (let ci = 5; ci < row.length; ci++) { if (row[ci] != null) { const parsed = parseFloat(String(row[ci])); if (!isNaN(parsed) && parsed > 0 && parsed < 100) { smvVal = parsed; break; } } } }
                if (smvVal > 0) smvMap[opName] = smvVal;
            }
        });
        parsedSMVCache[fileUrl] = smvMap;
        return smvMap;
    } catch (err) { return null; }
}

export default function VirtualFloorView() {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeFloor = searchParams.get("floor") || "Floor 1";
    const activeLine = searchParams.get("line") || "All Lines";

    const [lineStatuses, setLineStatuses] = useState(Array.from({ length: 9 }, (_, i) => ({ line_no: `Line ${i + 1}`, status: 'Idle' })));
    const [lineMachines, setLineMachines] = useState({});
    const [lineOBData, setLineOBData] = useState({});
    const lineHistory = useRef({});
    const lastLoadedCons = useRef({});
    const metadataUnsubs = useRef({});
    const excelCache = useRef({});

    const handleTargetChange = (lineName, val) => {
        if (val === "" || /^[0-9]+$/.test(val)) {
            const numVal = Math.min(1800, parseInt(val) || 0);
            setLineOBData(prev => ({ ...prev, [lineName]: { ...prev[lineName], target: numVal } }));
            const ld = lineOBData[lineName];
            if (ld && ld.rawOps) {
                const result = generateVirtualFloorLayout(ld.rawOps, lineName, numVal, ld.efficiency || 85);
                const lineNum = parseInt(lineName.replace(/\D/g, '')) || 1;
                const relIdx = (lineNum <= 6) ? (lineNum - 1) : (lineNum - 7);
                const zStepInner = (LANE_Z_CENTER_CD + (BASE_LAYOUT_SPECS.specs.widthCD/2) - (LANE_Z_CENTER_AB - (BASE_LAYOUT_SPECS.specs.widthAB/2))) + 3.7;
                setLineMachines(prev => ({ ...prev, [lineName]: result.machines.map(m => ({ ...m, position: { ...m.position, z: m.position.z + (relIdx * zStepInner) } })) }));
            }
        }
    };

    const handleEfficiencyChange = (lineName, val) => {
        if (val === "" || /^[0-9]+$/.test(val)) {
            const numVal = Math.min(100, parseInt(val) || 0);
            setLineOBData(prev => ({ ...prev, [lineName]: { ...prev[lineName], efficiency: numVal } }));
            const ld = lineOBData[lineName];
            if (ld && ld.rawOps) {
                const result = generateVirtualFloorLayout(ld.rawOps, lineName, ld.target, numVal);
                const lineNum = parseInt(lineName.replace(/\D/g, '')) || 1;
                const relIdx = (lineNum <= 6) ? (lineNum - 1) : (lineNum - 7);
                const zStepInner = (LANE_Z_CENTER_CD + (BASE_LAYOUT_SPECS.specs.widthCD/2) - (LANE_Z_CENTER_AB - (BASE_LAYOUT_SPECS.specs.widthAB/2))) + 3.7;
                setLineMachines(prev => ({ ...prev, [lineName]: result.machines.map(m => ({ ...m, position: { ...m.position, z: m.position.z + (relIdx * zStepInner) } })) }));
            }
        }
    };

    useEffect(() => {
        let isM = true;
        let fbUnsub = null;

        const syncStatus = async () => {
            try {
                // 1. Fetch from Local Backend (SQLite) - Optional
                let backendData = [];
                try {
                    const res = await fetch(`${API_BASE_URL}/active-layouts`);
                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data)) backendData = data;
                    }
                    console.log(`[VirtualFloor] Backend data received: ${backendData.length} active sessions`);
                } catch (e) {
                    console.warn("[VirtualFloor] Backend fetch skipped (not available in this environment)");
                }


                // 2. Setup Firestore Real-time Listener (Fallback/Hybrid)
                const q = query(collection(db, 'changeoverData'), where("docType", "==", "summary"), limit(100));
                fbUnsub = onSnapshot(q, (snap) => {
                    if (!isM) return;
                    const today = new Date();
                    const todayDateStr = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
                    const todayAltDateStr = todayDateStr.split('/').map(p => p.padStart(2, '0')).join('/');

                    const firestoreLines = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    
                    // Sort by lastUpdated or timestamp descending
                    firestoreLines.sort((a, b) => {
                        const dateA = a.lastUpdated || a.summaryData?.lastUpdated || "";
                        const dateB = b.lastUpdated || b.summaryData?.lastUpdated || "";
                        // Handle DD/MM/YYYY vs ISO or anything else
                        const [dA, mA, yA] = dateA.split('/').map(Number);
                        const [dB, mB, yB] = dateB.split('/').map(Number);
                        if (yA && yB) {
                            const timeA = new Date(yA, mA - 1, dA).getTime();
                            const timeB = new Date(yB, mB - 1, dB).getTime();
                            return timeB - timeA;
                        }
                        return dateB.localeCompare(dateA);
                    });
                    
                    // Group by line to find the latest for each
                    const latestByLine = {};
                    firestoreLines.forEach(l => {
                        const ln = l.line || l.summaryData?.line;
                        if (!ln) return;
                        const match = ln.match(/\d+/);
                        const normalizedLn = match ? `Line ${match[0]}` : ln;
                        
                        // Because sorted descending, the first one seen for each line is the latest
                        if (!latestByLine[normalizedLn]) {
                             latestByLine[normalizedLn] = l;
                        }
                    });


                    const merged = [];
                    for (let i = 1; i <= 9; i++) {
                        const ln = `Line ${i}`;
                        const foundCloud = latestByLine[ln];
                        const foundBackend = backendData.find(s =>
                            String(s.line_no || s.status_line).toUpperCase().replace(' ', '') === ln.toUpperCase().replace(' ', '')
                        );

                        if (foundCloud) {
                            const statusStr = (foundCloud.status || "").toLowerCase();
                            const docDate = foundCloud.lastUpdated || foundCloud.summaryData?.lastUpdated || "";
                            const isToday = docDate.includes(todayDateStr) || docDate.includes(todayAltDateStr);
                            const isChangeover = (statusStr === 'partial' || statusStr === 'in_progress' || statusStr === 'changeover') && isToday;

                            // Firestore status takes precedence
                            merged.push({
                                line_no: ln,
                                style_no: foundCloud.style_no || foundCloud.summaryData?.toStyle || foundCloud.toStyle || '---',
                                con_no: foundCloud.conNo || foundCloud.summaryData?.conNo || '---',
                                buyer: foundCloud.buyer || foundCloud.summaryData?.buyer || '---',
                                status: isChangeover ? 'Changeover' : 'Running',
                                isLive: true,
                                source: 'firestore',
                                backendOps: foundBackend?.operations || []
                            });
                        } else if (foundBackend) {
                            // Fallback to backend
                            merged.push({
                                line_no: ln,
                                style_no: foundBackend.style_no || foundBackend.status_style || '---',
                                con_no: foundBackend.con_no || foundBackend.status_con || '---',
                                status: foundBackend.status || 'Running',
                                buyer: foundBackend.buyer || '---',
                                operations: foundBackend.operations || [],
                                source: 'backend'
                            });
                        } else {
                            merged.push({ line_no: ln, status: 'Idle' });
                        }
                    }
                    console.log(`[VirtualFloor] Final merged lines: ${merged.length}`);
                    setLineStatuses(merged);
                });

            } catch (err) {
                console.error("[VirtualFloor] Initialization error:", err);
            }
        };

        syncStatus();
        return () => { isM = false; if (fbUnsub) fbUnsub(); };
    }, []);

    useEffect(() => {
        const runLayout = (ln, ops) => {
            if (!Array.isArray(ops) || ops.length === 0) return;
            try {
                const result = generateVirtualFloorLayout(ops, ln);
                const lnNum = parseInt(ln.replace(/\D/g, '')) || 1;
                const relIdx = (lnNum <= 6) ? (lnNum - 1) : (lnNum - 7);
                const zStep = (LANE_Z_CENTER_CD + (BASE_LAYOUT_SPECS.specs.widthCD/2) - (LANE_Z_CENTER_AB - (BASE_LAYOUT_SPECS.specs.widthAB/2))) + 3.7;
                setLineMachines(prev => ({ ...prev, [ln]: result.machines.map(ma => ({ ...ma, position: { ...ma.position, z: ma.position.z + (relIdx * zStep) } })) }));
                setLineOBData(prev => ({ ...prev, [ln]: { ops: result.balancedOps, rawOps: ops, totalSMV: (result.totalSMV || 0).toFixed(2), target: prev[ln]?.target || 1800, efficiency: prev[ln]?.efficiency || 85 } }));
            } catch (e) { console.error(`[VirtualFloor] Layout gen failed for ${ln}:`, e); }
        };

        const updateLineData = async (status) => {
            const { line_no, style_no, con_no, source, operations, backendOps } = status;
            if (!line_no || status.status === 'Idle') return;

            // Priority 1: use already-attached backend operations (only if they have valid descriptions)
            const attachedOps = (source === 'firestore' && backendOps?.length > 0) ? backendOps : (operations?.length > 0 ? operations : null);
            const hasValidNames = attachedOps?.some(o => (o.op_name || o.operation || o.operation_description || o.description || o.name || o.b || o.B));
            
            if (attachedOps && hasValidNames) { 
                console.log(`[VirtualFloor] Using valid backend ops for ${line_no}`); 
                runLayout(line_no, attachedOps); 
                return; 
            }


            // Priority 2: Firestore styleOBmetadata (try conNo first, then style name)
            try {
                let styleSnap;
                if (con_no && con_no !== '---') {
                    styleSnap = await getDocs(query(collection(db, 'styleOBmetadata'), where('conNo', '==', con_no), limit(1)));
                }
                
                if ((!styleSnap || styleSnap.empty) && style_no && style_no !== '---') {
                    styleSnap = await getDocs(query(collection(db, 'styleOBmetadata'), where('uploadStyle', '==', style_no), limit(1)));
                    if (styleSnap.empty) {
                        styleSnap = await getDocs(query(collection(db, 'styleOBmetadata'), where('uploadStyleName', '==', style_no), limit(1)));
                    }
                    if (styleSnap.empty) {
                        styleSnap = await getDocs(query(collection(db, 'styleOBmetadata'), where('style', '==', style_no), limit(1)));
                    }
                }

                if (!styleSnap || styleSnap.empty) {
                    const variants = [line_no, line_no.toUpperCase(), line_no.replace(' ', ''), line_no.replace(' ', '').toUpperCase()];
                    styleSnap = await getDocs(query(collection(db, 'styleOBmetadata'), where('uploadLine', 'in', variants), limit(1)));
                }


                if (styleSnap && !styleSnap.empty) {
                    const m = styleSnap.docs[0].data();
                    const parsedOB = m.parsedOBData || {};
                    const ops = [];
                    const seenOps = new Set();
                    
                    const extractOps = (data) => {
                        if (!data) return;
                        if (Array.isArray(data)) {
                            data.forEach((item) => {
                                if (item.operations) {
                                    const sName = item.section?.trim() || "General";
                                    item.operations.forEach((op) => {
                                        const opId = op.op_no || op.a || op.A || op.operation || Math.random();
                                        if (!seenOps.has(opId)) {
                                            seenOps.add(opId);
                                            ops.push({
                                                ...op,
                                                section: sName,
                                                op_no: op.op_no || op.a || op.A || '',
                                                op_name: extractOpName(op),
                                                machine_type: op.machine_type || op.machine || "SNLS",
                                                smv: extractOpSMV(op)
                                            });
                                        }
                                    });

                                } else if (item.operation || item.op_name || item.operation_name || item.operation_description || item.description || item.name || item.b || item.B) {
                                    const opId = item.op_no || item.a || item.A || item.operation || Math.random();
                                    if (!seenOps.has(opId)) {
                                        seenOps.add(opId);
                                        ops.push({
                                            ...item,
                                            op_no: item.op_no || item.a || item.A || '',
                                            op_name: extractOpName(item),
                                            machine_type: item.machine_type || item.machine || "SNLS",
                                            smv: extractOpSMV(item)
                                        });
                                    }




                                }
                            });
                        } else if (typeof data === "object") {
                            Object.values(data).forEach((val) => extractOps(val));
                        }
                    };
                    
                    extractOps(parsedOB);
                    
                    if (ops.length === 0 && m.operations) {
                        ops.push(...(typeof m.operations === 'string' ? JSON.parse(m.operations) : m.operations));
                    }
                    
                    if (ops.length > 0) { 
                        console.log(`[VirtualFloor] Loaded Firestore OB for ${line_no} with ${ops.length} ops`); 
                        runLayout(line_no, ops); 
                        return; 
                    }
                }

            } catch (e) { /* continue to next fallback */ }


            // Priority 3: /get-ob with both line_no and style_no
            try {
                const obRes = await fetch(`${API_BASE_URL}/get-ob?line_no=${encodeURIComponent(line_no)}&style_no=${encodeURIComponent(style_no)}`);
                if (obRes.ok) { 
                    const obData = await obRes.json(); 
                    if (obData.operations?.length > 0) { 
                        runLayout(line_no, obData.operations); 
                        return; 
                    } 
                }
            } catch (e) { /* continue */ }

            // Final Resort: Use the original attachedOps if found, even if names are missing
            if (attachedOps) {
                console.log(`[VirtualFloor] Final fallback: Using backend ops for ${line_no}`);
                runLayout(line_no, attachedOps);
            }
        };


        lineStatuses.forEach(updateLineData);

        return () => { Object.values(metadataUnsubs.current).forEach(u => u()); };
    }, [lineStatuses]);

    const activeM = useMemo(() => {
        const fL = (ln) => { const n = parseInt(ln.replace(/\D/g, '')); const floorMatch = activeFloor === "Floor 1" ? (n >= 1 && n <= 6) : (n >= 7 && n <= 9); const lineMatch = activeLine === "All Lines" || ln === activeLine; return floorMatch && lineMatch; };
        const ms = []; Object.keys(lineMachines).forEach(ln => { if (fL(ln)) ms.push(...lineMachines[ln]); }); return ms;
    }, [lineMachines, activeLine, activeFloor]);

    const floorS = useMemo(() => {
        const bs = BASE_LAYOUT_SPECS;
        const zStepInner = (LANE_Z_CENTER_CD + (bs.specs.widthCD/2) - (LANE_Z_CENTER_AB - (bs.specs.widthAB/2))) + 3.7;
        const all = [];
        for (let i = 0; i < (activeFloor === "Floor 1" ? 6 : 3); i++) {
            const ln = activeFloor === "Floor 1" ? `Line ${i + 1}` : `Line ${i + 7}`;
            if (activeLine !== "All Lines" && ln !== activeLine) continue;
            const { specs: s, sections: se } = getLayoutSpecs(ln);
            const status = lineStatuses.find(ls => ls.line_no === ln);
            const color = (status?.status === "Changeover") ? '#facc15' : '#3b82f6';
            const zO = i * zStepInner;
            all.push(
                { id: `${ln}-cu`, name: `${ln} Cuff`, length: se.cuff.end - se.cuff.start, width: s.widthAB, position: { x: se.cuff.start, y: 0, z: LANE_Z_CENTER_AB + zO }, color },
                { id: `${ln}-sl`, name: `${ln} Sleeve`, length: se.sleeve.end - se.sleeve.start, width: s.widthAB, position: { x: se.sleeve.start, y: 0, z: LANE_Z_CENTER_AB + zO }, color },
                { id: `${ln}-ba`, name: `${ln} Back`, length: se.back.end - se.back.start, width: s.widthAB, position: { x: se.back.start, y: 0, z: LANE_Z_CENTER_AB + zO }, color },
                { id: `${ln}-cl`, name: `${ln} Collar`, length: se.collar.end - se.collar.start, width: s.widthCD, position: { x: se.collar.start, y: 0, z: LANE_Z_CENTER_CD + zO }, color },
                { id: `${ln}-fr`, name: `${ln} Front`, length: se.front.end - se.front.start, width: s.widthCD, position: { x: se.front.start, y: 0, z: LANE_Z_CENTER_CD + zO }, color },
                { id: `${ln}-a1`, name: `${ln} Assembly AB`, length: se.assemblyAB.end - se.assemblyAB.start, width: s.widthAB, position: { x: se.assemblyAB.start, y: 0, z: LANE_Z_CENTER_AB + zO }, color },
                { id: `${ln}-a2`, name: `${ln} Assembly CD`, length: se.assemblyCD.end - se.assemblyCD.start, width: s.widthCD, position: { x: se.assemblyCD.start, y: 0, z: LANE_Z_CENTER_CD + zO }, color }
            );
        }
        return all;
    }, [activeFloor, activeLine, lineStatuses]);

    const cameraConfig = useMemo(() => {
        if (activeLine === "All Lines") return activeFloor === "Floor 1" ? { position: [-95, 85, 12], fov: 32 } : { position: [-65, 55, 8], fov: 28 };
        const i = activeFloor === "Floor 1" ? parseInt(activeLine.split(' ')[1]) - 1 : parseInt(activeLine.split(' ')[1]) - 7;
        const zStep = (LANE_Z_CENTER_CD + (BASE_LAYOUT_SPECS.specs.widthCD/2) - (LANE_Z_CENTER_AB - (BASE_LAYOUT_SPECS.specs.widthAB/2))) + 3.7;
        return { position: [-30, 40, (LANE_Z_CENTER_AB + LANE_Z_CENTER_CD) / 2 + (i * zStep)], fov: 25 };
    }, [activeFloor, activeLine]);

    return (
        <div className="absolute inset-0 flex flex-row bg-slate-950 overflow-hidden text-white">
            <div className="flex-1 relative bg-[#0a0a0c]">
                <div className="absolute top-6 left-6 right-6 z-30 flex items-center justify-center pointer-events-none">
                    <div className="flex bg-black/60 backdrop-blur-2xl rounded-3xl p-1.5 border border-white/10 shadow-2xl pointer-events-auto gap-4 items-center px-1.5 pr-6">
                        <div className="flex bg-white/5 rounded-2xl p-1">
                            {["Floor 1", "Floor 2"].map((f) => ( <button key={f} onClick={() => setSearchParams({ floor: f, line: "All Lines" })} className={cn("px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", activeFloor === f ? "bg-violet-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-white/5")}> {f} </button> ))}
                        </div>
                        <div className="w-[1px] h-8 bg-white/10" />
                        <div className="flex flex-col gap-1">
                            <span className="text-[7px] font-black uppercase tracking-widest text-violet-400/60 ml-1 font-mono">Line Focus</span>
                            <select value={activeLine} onChange={(e) => setSearchParams({ floor: activeFloor, line: e.target.value })} className="bg-transparent text-white text-[10px] font-black uppercase tracking-widest border-none outline-none cursor-pointer hover:text-violet-400 appearance-none pr-4">
                                <option value="All Lines">All Lines</option>
                                {(activeFloor === "Floor 1" ? [1,2,3,4,5,6] : [7,8,9]).map(n => <option key={n} value={`Line ${n}`}>Line {n}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
                <Scene3D showMachines={true} machines={activeM} sections={floorS} isOverview={activeLine === "All Lines"} cameraPosition={cameraConfig.position} cameraFov={cameraConfig.fov} showStatusLights={false} />
            </div>

            <div className="w-[340px] bg-slate-900 border-l border-white/5 flex flex-col shadow-2xl overflow-y-auto">
                <div className="p-6 border-b border-white/5 bg-slate-900/50 backdrop-blur-md">
                    <h3 className="text-white font-black text-xs uppercase tracking-[0.2em] flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Live Line Status
                    </h3>
                </div>
                <div className="flex-1 p-4 space-y-4 overflow-y-auto custom-scrollbar">
                    {activeLine !== "All Lines" && (
                        <>
                            <div className="mb-6 p-4 rounded-2xl bg-violet-600/10 border border-violet-500/30">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400 mb-4 flex items-center justify-between">OB Metrics</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="p-2 rounded-lg bg-black/40 border border-white/5 text-center">
                                        <span className="text-[7px] font-black uppercase text-slate-500">Total SMV</span>
                                        <div className="text-[11px] font-black">{lineOBData[activeLine]?.totalSMV || '0.00'}</div>
                                    </div>
                                    <div className="p-2 rounded-lg bg-black/40 border border-white/5 text-center">
                                        <span className="text-[7px] font-black uppercase text-slate-500">Target</span>
                                        <div className="text-[11px] font-black">{lineOBData[activeLine]?.target || '1800'}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="mb-6">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400 mb-4 px-1">Operation Bulletin</h4>
                                <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                    {Object.entries((lineOBData[activeLine]?.ops || []).reduce((acc, op) => {
                                        const sec = op.operation.section || 'General';
                                        if (!acc[sec]) acc[sec] = [];
                                        acc[sec].push(op);
                                        return acc;
                                    }, {})).map(([section, ops], sIdx) => (
                                        <div key={section} className="space-y-2">
                                            <div className="flex items-center gap-2 px-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">{section}</span>
                                                <div className="flex-1 h-[1px] bg-white/5" />
                                                <span className="text-[7px] font-bold text-slate-600 uppercase">{ops.length} Ops</span>
                                            </div>
                                            <div className="space-y-1.5">
                                                {ops.map((op, idx) => (
                                                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/[0.02] hover:bg-white/5 transition-all">
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-[11px] font-bold text-slate-200 truncate">{op.operation.op_name || (typeof op.operation.operation === 'string' ? op.operation.operation : 'Unknown Operation')}</span>
                                                            <span className="text-[6px] text-slate-500 font-bold uppercase mt-0.5 tracking-wider">{op.operation.machine_type || "Machine"}</span>
                                                        </div>
                                                        <div className="text-right flex items-center gap-3 flex-shrink-0">
                                                            <div className="flex flex-col items-center">
                                                                <div className="text-[10px] font-black text-emerald-500/80">{op.count}x</div>
                                                                <span className="text-[5px] font-bold text-slate-600 uppercase tracking-tighter">M/C</span>
                                                            </div>
                                                            <div className="flex flex-col items-end">
                                                                <div className="text-[9px] font-black text-slate-300">{((op.operation.smv || 0)).toFixed(2)}</div>
                                                                <span className="text-[5px] font-bold text-slate-600 uppercase tracking-tighter">SMV</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    {(!lineOBData[activeLine]?.ops || lineOBData[activeLine]?.ops.length === 0) && (
                                        <div className="text-center py-8 text-[9px] text-slate-500 font-bold uppercase tracking-widest opacity-50">Loading ops...</div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                    {[1,2,3,4,5,6,7,8,9].map(id => {
                        const ln = `Line ${id}`; const status = lineStatuses.find(s => s.line_no === ln); const isActive = activeLine === ln;
                        return (
                            <motion.div key={id} className={cn("p-4 rounded-2xl border transition-all relative overflow-hidden", isActive ? "bg-violet-600/20 border-violet-500/50 shadow-lg shadow-violet-500/10" : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05]")}>
                                <div className="flex items-center justify-between mb-3 font-black uppercase">
                                    <div className="flex items-center gap-3">
                                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-[10px] border", isActive ? "bg-violet-600 border-violet-400" : "bg-slate-800 border-white/5 text-slate-400")}>L{id}</div>
                                        <span className={cn("text-xs tracking-wider", isActive ? "text-white" : "text-slate-300")}>{ln}</span>
                                    </div>
                                    <div className={cn("px-2 py-0.5 rounded-full text-[8px] border", status?.status === "Changeover" ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400" : status?.status === "Running" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-slate-800 border-white/5 text-slate-500")}>{status?.status || "Idle"}</div>
                                </div>
                                <div className="grid grid-cols-1 gap-2 text-slate-300">
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/[0.02]">
                                        <Hash size={12} className="text-slate-500" />
                                        <div className="flex flex-col min-w-0"> <span className="text-[8px] font-black uppercase text-slate-500">Style</span> <span className="text-[10px] font-bold truncate">{status?.style_no || "---"}</span> </div>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/[0.02]">
                                        <Users size={12} className="text-slate-500" />
                                        <div className="flex flex-col min-w-0"> <span className="text-[8px] font-black uppercase text-slate-500">Buyer</span> <span className="text-[10px] font-bold truncate">{status?.buyer || "---"}</span> </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/[0.02]">
                                            <TrendingUp size={12} className="text-slate-500" />
                                            <div className="flex flex-col"> <span className="text-[8px] font-black uppercase text-slate-500">Target</span> <input type="text" className="text-[10px] bg-transparent text-white font-black border-none outline-none w-full" value={lineOBData[ln]?.target || ""} onChange={(e) => handleTargetChange(ln, e.target.value)} placeholder="1800" /> </div>
                                        </div>
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/[0.02]">
                                            <div className="w-3 h-3 rounded-full border border-slate-500 flex items-center justify-center text-[7px] text-slate-500 font-bold">%</div>
                                            <div className="flex flex-col"> <span className="text-[8px] font-black uppercase text-slate-500">Eff.</span> <input type="text" className="text-[10px] bg-transparent text-white font-black border-none outline-none w-full" value={lineOBData[ln]?.efficiency || "85"} onChange={(e) => handleEfficiencyChange(ln, e.target.value)} /> </div>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => { setSearchParams({ floor: id <= 6 ? "Floor 1" : "Floor 2", line: ln }); }} className={cn("mt-3 w-full py-2 rounded-xl flex items-center justify-center gap-2 transition-all font-black text-[9px] uppercase tracking-widest", isActive ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20" : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white")}> {isActive ? "Focused" : "Focus Line"} {!isActive && <ArrowRight size={10} />} </button>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
            <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }`}</style>
        </div>
    );
}
