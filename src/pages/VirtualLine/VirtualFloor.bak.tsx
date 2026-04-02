import { useMemo, useEffect, useState } from "react";
import { useLineStore } from "@/store/useLineStore";
import { useSearchParams } from "react-router-dom";
import { Scene3D } from "@/components/3d/Scene3D";
import { getLayoutSpecs, LANE_Z_CENTER_AB, LANE_Z_CENTER_CD, getMachineZoneDims } from "@/utils/layoutGenerator";
import { generateCotLayout } from "@/utils/cotLayoutGenerator";
import { SectionLayout, MachinePosition } from "@/types";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "../../config";
import { Users, Hash, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { db } from "@/firebase";
import { collection, query, where, getDocs, limit, orderBy } from "firebase/firestore";
import { parseOBExcel } from "@/utils/obParser";

const LINE_COLORS = [
    '#3b82f6', // Blue
    '#ef4444', // Red
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#f97316', // Orange
    '#84cc16'  // Lime
];

export default function VirtualFloor() {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeFloor = searchParams.get("floor") || "Floor 1";
    const activeLine = searchParams.get("line") || "All Lines";

    const [lineStatuses, setLineStatuses] = useState<any[]>([]);
    const [activeMachines, setActiveMachines] = useState<MachinePosition[]>([]);
    const { setVisibleSection } = useLineStore();

    // Reset visible section when entering Floor View
    useEffect(() => {
        setVisibleSection(null);
    }, []);

    // Fetch line statuses for the sidebar
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/current-styles`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        setLineStatuses(data);
                    }
                }
            } catch (err) {
                console.error("Error fetching statuses:", err);
            }
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 15000);
        return () => clearInterval(interval);
    }, []);

    // Generate static sections for Virtual Floor based on layoutGenerator specs
    const floorSections = useMemo(() => {
        const data = getLayoutSpecs("Line 1");
        const { specs, sections } = data;

        const minZ = LANE_Z_CENTER_AB - (specs.widthAB / 2);
        const maxZ = LANE_Z_CENTER_CD + (specs.widthCD / 2);
        const lineGap = 3.7;
        const zStep = (maxZ - minZ) + lineGap;

        const numLines = activeFloor === "Floor 1" ? 6 : 3;
        const allSections: SectionLayout[] = [];

        for (let i = 0; i < numLines; i++) {
            const zOffset = i * zStep;
            let lineLabelValue = "";
            let colorIndex = 0;

            if (activeFloor === "Floor 1") {
                lineLabelValue = `Line ${i + 1}`;
                colorIndex = i;
            } else {
                // Floor 2 has Lines 7, 8, 9
                lineLabelValue = `Line ${i + 7}`;
                colorIndex = i + 6;
            }

            // FILTER: Skip if we are filtering for a specific line and this isn't it
            if (activeLine !== "All Lines" && lineLabelValue !== activeLine) {
                continue;
            }

            // FIXED: Use line-specific specs instead of hardcoded "Line 1"
            const { specs, sections } = getLayoutSpecs(lineLabelValue);

            const lineColor = LINE_COLORS[colorIndex % LINE_COLORS.length];

            allSections.push(
                {
                    id: `${lineLabelValue}-cuff`,
                    name: `${lineLabelValue} Cuff`,
                    length: sections.cuff.end - sections.cuff.start,
                    width: specs.widthAB,
                    position: { x: sections.cuff.start, y: 0, z: LANE_Z_CENTER_AB + zOffset },
                    color: lineColor
                },
                {
                    id: `${lineLabelValue}-sleeve`,
                    name: `${lineLabelValue} Sleeve`,
                    length: sections.sleeve.end - sections.sleeve.start,
                    width: specs.widthAB,
                    position: { x: sections.sleeve.start, y: 0, z: LANE_Z_CENTER_AB + zOffset },
                    color: lineColor
                },
                {
                    id: `${lineLabelValue}-back`,
                    name: `${lineLabelValue} Back`,
                    length: sections.back.end - sections.back.start,
                    width: specs.widthAB,
                    position: { x: sections.back.start, y: 0, z: LANE_Z_CENTER_AB + zOffset },
                    color: lineColor
                },
                {
                    id: `${lineLabelValue}-collar`,
                    name: `${lineLabelValue} Collar`,
                    length: sections.collar.end - sections.collar.start,
                    width: specs.widthCD,
                    position: { x: sections.collar.start, y: 0, z: LANE_Z_CENTER_CD + zOffset },
                    color: lineColor
                },
                {
                    id: `${lineLabelValue}-front`,
                    name: `${lineLabelValue} Front`,
                    length: sections.front.end - sections.front.start,
                    width: specs.widthCD,
                    position: { x: sections.front.start, y: 0, z: LANE_Z_CENTER_CD + zOffset },
                    color: lineColor
                },
                {
                    id: `${lineLabelValue}-assembly1`,
                    name: `${lineLabelValue} Assembly AB`,
                    length: sections.assemblyAB.end - sections.assemblyAB.start,
                    width: specs.widthAB,
                    position: { x: sections.assemblyAB.start, y: 0, z: LANE_Z_CENTER_AB + zOffset },
                    color: lineColor
                },
                {
                    id: `${lineLabelValue}-assembly2`,
                    name: `${lineLabelValue} Assembly CD`,
                    length: sections.assemblyCD.end - sections.assemblyCD.start,
                    width: specs.widthCD,
                    position: { x: sections.assemblyCD.start, y: 0, z: LANE_Z_CENTER_CD + zOffset },
                    color: lineColor
                }
            );
        }

        return allSections;
    }, [activeFloor, activeLine]);

    // Dynamic camera for simple Floor 1 vs Floor 2 zoom
    const cameraConfig = useMemo(() => {
        if (activeLine === "All Lines") {
            if (activeFloor === "Floor 1") {
                return { position: [-90, 80, 12] as [number, number, number], fov: 32 };
            } else {
                return { position: [-60, 50, 8] as [number, number, number], fov: 28 };
            }
        } else {
            // Detailed Line view (Section Zone focus)
            const lineNum = parseInt(activeLine.split(' ')[1]);
            let i = 0;

            if (activeFloor === "Floor 1") {
                i = lineNum - 1;
            } else {
                i = lineNum - 7;
            }

            const data = getLayoutSpecs("Line 1");
            const { specs } = data;
            const minZ = LANE_Z_CENTER_AB - (specs.widthAB / 2);
            const maxZ = LANE_Z_CENTER_CD + (specs.widthCD / 2);
            const zStep = (maxZ - minZ) + 3.7;
            const zOffset = i * zStep;

            return { position: [-30, 40, (LANE_Z_CENTER_AB + LANE_Z_CENTER_CD) / 2 + zOffset] as [number, number, number], fov: 25 };
        }
    }, [activeFloor, activeLine]);

    useEffect(() => {
        const fetchActiveLayouts = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/active-layouts`);
                if (!res.ok) return;
                const activeData = await res.json();
                if (!Array.isArray(activeData)) return;

                const getLineNum = (lineStr: string) => {
                    if (!lineStr) return null;
                    const match = String(lineStr).match(/\d+/);
                    return match ? parseInt(match[0]) : null;
                };

                let floorData = activeData.filter((s: any) => {
                    const lNum = getLineNum(s.line_no);
                    if (lNum === null) return false;
                    if (activeFloor === "Floor 1") return lNum >= 1 && lNum <= 6;
                    if (activeFloor === "Floor 2") return lNum >= 7 && lNum <= 9;
                    return false;
                });

                if (activeLine && activeLine !== "All Lines") {
                    const targetLNum = getLineNum(activeLine);
                    floorData = floorData.filter(s => getLineNum(s.line_no) === targetLNum);
                }

                const data = getLayoutSpecs("Line 1");
                const { specs } = data;
                const minZ = LANE_Z_CENTER_AB - (specs.widthAB / 2);
                const maxZ = LANE_Z_CENTER_CD + (specs.widthCD / 2);
                const zStep = (maxZ - minZ) + 3.7;

                // Track if we actually need to update the global machine list
                let hasChanges = false;
                const newStyles: Record<string, string> = {};

                // 1. Process data from Backend
                const updatedMachines: MachinePosition[] = [];
                floorData.forEach((item: any) => {
                    const lineNum = getLineNum(item.line_no)!;
                    const styleId = `${item.style_no}_${item.con_no}`;
                    newStyles[item.line_no] = styleId;

                    // If we have it in cache, use it
                    if (styleCache.has(styleId)) {
                        const cached = styleCache.get(styleId)!;
                        const relativeIdx = (lineNum <= 6) ? (lineNum - 1) : (lineNum - 7);
                        const zOffset = relativeIdx * zStep;
                        updatedMachines.push(...cached.map(m => ({ ...m, position: { ...m.position, z: m.position.z + zOffset } })));
                    } else {
                        // Otherwise generate it and cache it (if ops exist)
                        try {
                            const ops = item.operations;
                            if (!ops || ops.length === 0) return;
                            const result = generateCotLayout(ops, item.line_no);
                            styleCache.set(styleId, result.machines);

                            const relativeIdx = (lineNum <= 6) ? (lineNum - 1) : (lineNum - 7);
                            const zOffset = relativeIdx * zStep;
                            updatedMachines.push(...result.machines.map(m => ({
                                ...m,
                                position: { ...m.position, z: m.position.z + zOffset }
                            })));
                        } catch (e) {
                            console.error(`[VirtualFloor] Layout generation failed for ${item.line_no}:`, e);
                        }
                    }
                });

                // 2. Background Enrichment for empty lines (Firestore Fallback)
                let linesToCheck = [...floorData];
                if (linesToCheck.length === 0) {
                    const obMetaRef = collection(db, "styleOBmetadata");
                    const q = query(obMetaRef, limit(20)); // Lower limit for speed
                    const querySnapshot = await getDocs(q);
                    const floorLines = activeFloor === "Floor 1" ? [1, 2, 3, 4, 5, 6] : [7, 8, 9];
                    
                    querySnapshot.forEach(doc => {
                        const data = doc.data();
                        const lNum = getLineNum(data.uploadLine);
                        if (lNum && floorLines.includes(lNum)) {
                            if (!linesToCheck.find(s => getLineNum(s.line_no) === lNum)) {
                                linesToCheck.push({ line_no: data.uploadLine, style_no: data.style, con_no: data.conNo, operations: [] });
                            }
                        }
                    });
                }

                // If a specific line is requested but not in our list, add it as a shell
                if (activeLine && activeLine !== "All Lines" && !linesToCheck.find(l => getLineNum(l.line_no) === getLineNum(activeLine))) {
                    linesToCheck.push({ line_no: activeLine, style_no: '', con_no: '' });
                }

                // Collect all tasks to run in parallel
                const tasks = linesToCheck.map(async (item: any) => {
                    const styleId = `${item.style_no}_${item.con_no}`;
                    if (!item.style_no || styleCache.has(styleId)) return null;

                    const obMetaRef = collection(db, "styleOBmetadata");
                    const q = query(obMetaRef, where("style", "==", item.style_no), where("conNo", "==", item.con_no || ""), limit(1));

                    try {
                        const qSnap = await getDocs(q);
                        if (!qSnap.empty) {
                            const meta = qSnap.docs[0].data();
                            if (meta.fileUrl) {
                                const fileRes = await fetch(meta.fileUrl);
                                const blob = await fileRes.blob();
                                const file = new File([blob], "ob.xlsx");
                                const parsed = await parseOBExcel(file);
                                if (parsed.operations?.length > 0) {
                                    const result = generateCotLayout(parsed.operations, item.line_no);
                                    styleCache.set(styleId, result.machines);
                                    return { line_no: item.line_no, machines: result.machines };
                                }
                            }
                        }
                    } catch (e) { console.error(`[VirtualFloor] Firebase background enrichment failed for ${item.line_no}:`, e); }
                    return null;
                });

                const results = await Promise.all(tasks);
                results.forEach(res => {
                    if (res) {
                        const lineNum = getLineNum(res.line_no)!;
                        const relativeIdx = (lineNum <= 6) ? (lineNum - 1) : (lineNum - 7);
                        const zOffset = relativeIdx * zStep;
                        const offsetMachines = res.machines.map(m => ({ ...m, position: { ...m.position, z: m.position.z + zOffset } }));
                        updatedMachines.push(...offsetMachines);
                    }
                });

                // Only update state if the layout actually changed or it's a new style set
                const styleSignature = JSON.stringify(newStyles);
                if (styleSignature !== JSON.stringify(lineStyles)) {
                    setLineStyles(newStyles);
                    setActiveMachines(updatedMachines);
                }
            } catch (err) {
                console.error("[VirtualFloor] Error:", err);
            }
        };

        fetchActiveLayouts();
        const interval = setInterval(fetchActiveLayouts, 20000); // Relaxed interval (20s)
        return () => clearInterval(interval);
    }, [activeFloor, activeLine, lineStyles, styleCache]);

    return (
        <div className="absolute inset-0 flex flex-row bg-slate-950 overflow-hidden">
            {/* Main Content Area */}
            <div className="flex-1 relative bg-[#0a0a0c]">
                <Scene3D
                    key={`${activeFloor}-${activeLine}`}
                    showMachines={true}
                    machines={activeMachines}
                    sections={floorSections}
                    isOverview={activeLine === "All Lines"}
                    cameraPosition={cameraConfig.position}
                    cameraFov={cameraConfig.fov}
                />
            </div>

            {/* Live Status Sidebar */}
            <div className="w-[340px] bg-slate-900 border-l border-white/5 flex flex-col shadow-2xl relative z-20">
                <div className="p-6 border-b border-white/5 bg-slate-900/50 backdrop-blur-md">
                    <h3 className="text-white font-black text-xs uppercase tracking-[0.2em] flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Live Line Status
                    </h3>
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-2 ml-5">Floor Overview 1-9</p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => {
                        const lineName = `Line ${id}`;
                        const status = lineStatuses.find(s => s.line_no === lineName);
                        const isActive = activeLine === lineName;

                        return (
                            <motion.div
                                key={id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: id * 0.05 }}
                                className={cn(
                                    "p-4 rounded-2xl border transition-all duration-300 group relative overflow-hidden",
                                    isActive
                                        ? "bg-violet-600/20 border-violet-500/50 shadow-lg shadow-violet-500/10"
                                        : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10"
                                )}
                            >
                                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-500" />}

                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] border",
                                            isActive ? "bg-violet-600 border-violet-400 text-white" : "bg-slate-800 border-white/5 text-slate-400"
                                        )}>
                                            L{id}
                                        </div>
                                        <span className={cn(
                                            "font-black text-xs uppercase tracking-wider",
                                            isActive ? "text-white" : "text-slate-300"
                                        )}>{lineName}</span>
                                    </div>

                                    <div className={cn(
                                        "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border",
                                        status?.status === "Running" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                                            status?.status === "Changeover" ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" :
                                                "bg-slate-800 border-white/5 text-slate-500"
                                    )}>
                                        {status?.status || "Idle"}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-2">
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/[0.02]">
                                        <Users size={12} className="text-slate-500" />
                                        <div className="flex flex-col">
                                            <span className="text-[8px] text-slate-500 font-black uppercase tracking-tighter">Buyer</span>
                                            <span className="text-[10px] text-slate-200 font-bold tracking-wide truncate max-w-[180px]">
                                                {status?.buyer || "---"}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/[0.02]">
                                        <Hash size={12} className="text-slate-500" />
                                        <div className="flex flex-col">
                                            <span className="text-[8px] text-slate-500 font-black uppercase tracking-tighter">Con No</span>
                                            <span className="text-[10px] text-slate-200 font-bold tracking-wide">
                                                {status?.con_no || "---"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => {
                                        const floor = id <= 6 ? "Floor 1" : "Floor 2";
                                        setSearchParams({ floor, line: lineName });
                                    }}
                                    className={cn(
                                        "mt-3 w-full py-2 rounded-xl flex items-center justify-center gap-2 transition-all duration-300",
                                        isActive
                                            ? "bg-violet-600 text-white font-black text-[9px] uppercase tracking-widest"
                                            : "bg-slate-800 text-slate-400 font-bold text-[9px] uppercase tracking-widest hover:bg-slate-700 hover:text-white"
                                    )}
                                >
                                    {isActive ? "Currently Focused" : "Focus Line"}
                                    {!isActive && <ArrowRight size={10} />}
                                </button>
                            </motion.div>
                        );
                    })}
                </div>

                <div className="p-4 border-t border-white/5 bg-slate-900/80">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
                        <span>Total Capacity</span>
                        <span className="text-slate-300">9 Production Lines</span>
                    </div>
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.1);
                }
            `}</style>
        </div>
    );
}
