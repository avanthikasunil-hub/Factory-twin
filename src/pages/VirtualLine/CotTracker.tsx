import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { Scene3D } from "@/components/3d/Scene3D";
import { getLayoutSpecs, LANE_Z_CENTER_AB, LANE_Z_CENTER_CD, LANE_Z_A, LANE_Z_B, LANE_Z_C, LANE_Z_D } from "@/utils/layoutGenerator";
import { generateCotLayout } from "@/utils/cotLayoutGenerator";
import { SectionLayout, MachinePosition } from "@/types";
import {
    PlayCircle,
    PauseCircle,
    Activity,
    User,
    Hash,
    ArrowUpRight,
    TrendingUp,
    Layout,
    ChevronLeft,
    CheckCircle2,
    Circle,
    ClipboardList,
    CalendarDays,
    Zap
} from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { API_BASE_URL } from "../../config";
import { db } from "@/firebase";
import { collection, query, where, getDocs, limit, orderBy } from "firebase/firestore";
import { parseOBExcel } from "@/utils/obParser";
import { toast } from "sonner";

const LINE_COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16'
];

const OPERATIONS_DATA = [
    { id: 1, name: "Side Seam Attachment", category: "Assembly" },
    { id: 2, name: "Sleeve Joining", category: "Joining" },
    { id: 3, name: "Cuff Preparation", category: "Pre-Assembly" },
    { id: 4, name: "Collar Setting", category: "Detailing" },
    { id: 5, name: "Bottom Hemming", category: "Finishing" },
    { id: 6, name: "Pocket Reinforcement", category: "Detailing" }
];

type OpStatus = {
    id: number;
    status: 'done' | 'not_done' | null;
    doneLine: string | null;
    borrowedLine: string | null;
    isInternal: boolean;
    selectingDoneLine: boolean;
    selectingBorrowLine: boolean;
};

export default function CotTracker() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeLine = searchParams.get("line");
    const activeFloor = searchParams.get("floor") || "Floor 1";

    // Complex state for operations
    const [opStatuses, setOpStatuses] = useState<OpStatus[]>(
        OPERATIONS_DATA.map(op => ({
            id: op.id,
            status: null,
            doneLine: null,
            borrowedLine: null,
            isInternal: false,
            selectingDoneLine: false,
            selectingBorrowLine: false
        }))
    );

    const updateOp = (id: number, updates: Partial<OpStatus>) => {
        setOpStatuses(prev => prev.map(op => op.id === id ? { ...op, ...updates } : op));
    };

    const doneCount = opStatuses.filter(s => s.status === 'done').length;

    const [cotData, setCotData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const getLineFloor = (lineName: string) => {
        const lineNum = parseInt(String(lineName || "").replace(/\D/g, ''));
        if (lineNum >= 1 && lineNum <= 6) return "Floor 1";
        if (lineNum >= 7 && lineNum <= 9) return "Floor 2";
        return "Floor 1";
    };

    useEffect(() => {
        const fetchCotData = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/current-styles`);
                if (res.ok) {
                    const data = await res.json();
                    if (!Array.isArray(data)) {
                        setLoading(false);
                        return;
                    }
                    // Only track Changeover styles in the COT Tracker
                    const activeStyles = data.filter((s: any) => s.status === 'Changeover');

                    const mappedData = activeStyles.map((item: any, idx: number) => ({
                        slNo: idx + 1,
                        line: item.line_no,
                        conNo: item.con_no,
                        floor: getLineFloor(item.line_no),
                        fromStyle: "---",
                        toStyle: item.style_no,
                        status: "In Progress",
                        startTime: "08:30 AM",
                        operator: "Line Supervisor"
                    }));
                    setCotData(mappedData);
                }
            } catch (err) {
                console.error("Error fetching COT data:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchCotData();
        const interval = setInterval(fetchCotData, 10000); // Polling every 10s
        return () => clearInterval(interval);
    }, []);

    const activeStyleData = useMemo(() => cotData.find(i => i.line === activeLine), [activeLine, cotData]);

    const [cotLayout, setCotLayout] = useState<{ machines: MachinePosition[], sections: SectionLayout[] } | null>(null);

    useEffect(() => {
        if (!activeLine || !activeStyleData) {
            setCotLayout(null);
            return;
        }

        const fetchStyleOB = async () => {
            try {
                const con_no = activeStyleData.conNo || '';
                const style_no = activeStyleData.toStyle;

                console.log(`[COT Tracker] Searching OB in Firebase for Style: ${style_no}, Con: ${con_no}`);

                // 1. Try to find the OB in Firebase first (User's latest uploads)
                const obMetaRef = collection(db, "styleOBmetadata");
                const q = query(
                    obMetaRef,
                    where("style", "==", style_no),
                    where("conNo", "==", con_no),
                    limit(1)
                );

                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const metaData = querySnapshot.docs[0].data();
                    if (metaData.fileUrl) {
                        console.log(`[COT Tracker] Found Firebase OB: ${metaData.originalFileName}. Fetching and parsing...`);
                        try {
                            const fileRes = await fetch(metaData.fileUrl);
                            const blob = await fileRes.blob();
                            const file = new File([blob], metaData.originalFileName || "ob_file.xlsx");
                            const parsed = await parseOBExcel(file);

                            if (parsed.operations && parsed.operations.length > 0) {
                                console.log(`[COT Tracker] Firebase OB Parsed! ${parsed.operations.length} ops. Generating layout...`);
                                const result = generateCotLayout(parsed.operations, activeLine);
                                setCotLayout(result);
                                toast.success(`Layout generated from uploaded OB: ${metaData.originalFileName}`);
                                return; // Success!
                            }
                        } catch (parseErr) {
                            console.error("[COT Tracker] Error parsing Firebase OB:", parseErr);
                        }
                    }
                }

                // 2. Fallback to local backend /get-ob
                const baseUrl = `${API_BASE_URL}/get-ob`;
                const params = new URLSearchParams({
                    line_no: activeLine,
                    style_no: style_no,
                    con_no: con_no
                });

                console.log(`[COT Tracker] Falling back to backend OB for ${activeLine}...`);
                const res = await fetch(`${baseUrl}?${params.toString()}`);

                if (res.ok) {
                    const data = await res.json();
                    if (data.operations && Array.isArray(data.operations)) {
                        console.log(`[COT Tracker] Backend OB Fetched! ${data.operations.length} ops. Generating layout...`);
                        const result = generateCotLayout(data.operations, activeLine);
                        setCotLayout(result);
                    } else {
                        console.warn("[COT Tracker] Received backend data but no operations found.");
                        setCotLayout(null);
                    }
                } else {
                    console.warn(`[COT Tracker] Failed to fetch backend OB. Status: ${res.status}`);
                    setCotLayout(null);
                }
            } catch (err) {
                console.error("[COT Tracker] Error in fetchStyleOB:", err);
                setCotLayout(null);
            }
        };

        fetchStyleOB();
    }, [activeLine, activeStyleData]);

    const floorSections = useMemo(() => {
        const data = getLayoutSpecs("Line 1");
        const { specs, sections } = data;
        const minZ = LANE_Z_CENTER_AB - (specs.widthAB / 2);
        const maxZ = LANE_Z_CENTER_CD + (specs.widthCD / 2);
        const zStep = (maxZ - minZ) + 3.7;

        const numLines = activeFloor === "Floor 1" ? 7 : 2;
        const allSections: SectionLayout[] = [];

        for (let i = 0; i < numLines; i++) {
            const zOffset = i * zStep;
            let lineLabelValue = "";
            let colorIndex = 0;

            if (activeFloor === "Floor 1") {
                lineLabelValue = `Line ${i + 1}`;
                colorIndex = i;
            } else {
                lineLabelValue = `Line ${i + 7}`;
                colorIndex = i + 6;
            }

            if (activeLine && activeLine !== "All Lines" && lineLabelValue !== activeLine) continue;

            const lineColor = LINE_COLORS[colorIndex % LINE_COLORS.length];

            allSections.push(
                { id: `${lineLabelValue}-cuff`, name: `${lineLabelValue} Cuff`, length: sections.cuff.end - sections.cuff.start, width: specs.widthAB, position: { x: sections.cuff.start, y: 0, z: LANE_Z_CENTER_AB + zOffset }, color: lineColor },
                { id: `${lineLabelValue}-sleeve`, name: `${lineLabelValue} Sleeve`, length: sections.sleeve.end - sections.sleeve.start, width: specs.widthAB, position: { x: sections.sleeve.start, y: 0, z: LANE_Z_CENTER_AB + zOffset }, color: lineColor },
                { id: `${lineLabelValue}-back`, name: `${lineLabelValue} Back`, length: sections.back.end - sections.back.start, width: specs.widthAB, position: { x: sections.back.start, y: 0, z: LANE_Z_CENTER_AB + zOffset }, color: lineColor },
                { id: `${lineLabelValue}-collar`, name: `${lineLabelValue} Collar`, length: sections.collar.end - sections.collar.start, width: specs.widthCD, position: { x: sections.collar.start, y: 0, z: LANE_Z_CENTER_CD + zOffset }, color: lineColor },
                { id: `${lineLabelValue}-front`, name: `${lineLabelValue} Front`, length: sections.front.end - sections.front.start, width: specs.widthCD, position: { x: sections.front.start, y: 0, z: LANE_Z_CENTER_CD + zOffset }, color: lineColor },
                { id: `${lineLabelValue}-assembly1`, name: `${lineLabelValue} Assembly AB`, length: sections.assemblyAB.end - sections.assemblyAB.start, width: specs.widthAB, position: { x: sections.assemblyAB.start, y: 0, z: LANE_Z_CENTER_AB + zOffset }, color: lineColor },
                { id: `${lineLabelValue}-assembly2`, name: `${lineLabelValue} Assembly CD`, length: sections.assemblyCD.end - sections.assemblyCD.start, width: specs.widthCD, position: { x: sections.assemblyCD.start, y: 0, z: LANE_Z_CENTER_CD + zOffset }, color: lineColor }
            );
        }
        return allSections;
    }, [activeFloor, activeLine]);

    const cameraConfig = useMemo(() => {
        if (!activeLine || activeLine === "All Lines") {
            return { position: [-100, 120, 25] as [number, number, number], fov: 30 };
        }
        const lineNum = parseInt(String(activeLine || "").replace(/\D/g, ''));
        let i = (lineNum <= 6) ? (lineNum - 1) : (lineNum - 7);

        const data = getLayoutSpecs("Line 1");
        const { specs } = data;
        const minZ = LANE_Z_CENTER_AB - (specs.widthAB / 2);
        const maxZ = LANE_Z_CENTER_CD + (specs.widthCD / 2);
        const zStep = (maxZ - minZ) + 3.7;
        const zOffset = i * zStep;

        return { position: [-30, 40, (LANE_Z_CENTER_AB + LANE_Z_CENTER_CD) / 2 + zOffset] as [number, number, number], fov: 25 };
    }, [activeFloor, activeLine]);

    return (
        <div className={cn(
            "flex flex-col h-full",
            (!activeLine || activeLine === "All Lines") ? "space-y-8 max-w-7xl mx-auto px-6 pb-10 overflow-y-auto" : "bg-slate-950 overflow-hidden"
        )}>
            {!activeLine || activeLine === "All Lines" ? (
                <>
                    {/* Header Section */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pt-4 shrink-0">
                        <div>
                            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2 flex items-center gap-3">
                                <Activity className="text-indigo-600 mb-1" size={32} />
                                COT Tracker
                            </h1>
                            <p className="text-slate-500 font-medium text-lg">Real-time production monitoring & changeover management</p>
                        </div>
                    </div>

                    {/* COT Schedule Section */}
                    <div className="space-y-6 flex-1 min-h-0">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                                    <CalendarDays className="text-white" size={24} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Style Transitions (COT) Today</h2>
                                    <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-0.5">March 09, 2026 • Live Schedule</p>
                                </div>
                            </div>
                            <div className="hidden md:flex items-center gap-6">
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Scheduled</span>
                                    <span className="text-xl font-black text-slate-900">{String(cotData.length).padStart(2, '0')} Transitions</span>
                                </div>
                                <div className="w-px h-8 bg-slate-200" />
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Completed</span>
                                    <span className="text-xl font-black text-emerald-600">00 / {String(cotData.length).padStart(2, '0')}</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full border-separate border-spacing-y-6 px-4">
                                    <thead>
                                        <tr className="bg-violet-950 rounded-[2rem] shadow-2xl shadow-violet-200/50 overflow-hidden border-none text-center text-white">
                                            <th className="px-6 py-9 text-center text-[12px] font-black uppercase tracking-[0.25em] rounded-l-[2rem]">SL NO</th>
                                            <th className="px-6 py-9 text-center text-[12px] font-black uppercase tracking-[0.25em]">Production Line</th>
                                            <th className="px-6 py-9 text-center text-[12px] font-black uppercase tracking-[0.25em]">From Style</th>
                                            <th className="px-6 py-9 text-center text-[12px] font-black uppercase tracking-[0.25em]">To Style</th>
                                            <th className="px-6 py-9 text-center text-[12px] font-black uppercase tracking-[0.25em] rounded-r-[2rem]">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr>
                                                <td colSpan={5} className="py-20 text-center font-black text-slate-400 uppercase tracking-widest animate-pulse">
                                                    Fetching Live Changeover Data...
                                                </td>
                                            </tr>
                                        ) : cotData.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="py-20 text-center font-black text-slate-400 uppercase tracking-widest">
                                                    No Styles in Changeover Status
                                                </td>
                                            </tr>
                                        ) : cotData.map((item, i) => (
                                            <motion.tr
                                                key={item.slNo}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: i * 0.05 }}
                                                onClick={() => setSearchParams({ floor: item.floor, line: item.line })}
                                                className="group cursor-pointer"
                                            >
                                                <td className="px-10 py-8 bg-slate-50/50 rounded-l-[2rem] border-t border-b border-l border-transparent group-hover:bg-purple-50/80 group-hover:border-purple-200 transition-all duration-300 text-center">
                                                    <span className="text-xl font-black text-slate-900 leading-none group-hover:text-purple-700">{item.slNo.toString().padStart(2, '0')}</span>
                                                </td>
                                                <td className="px-8 py-8 bg-slate-50/50 border-t border-b border-transparent group-hover:bg-purple-50/80 group-hover:border-purple-200 transition-all duration-300 text-center">
                                                    <div className="flex items-center gap-2 justify-center">
                                                        <span className="font-black text-slate-900 text-lg group-hover:text-purple-700 transition-colors uppercase tracking-tight">{item.line}</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-8 bg-slate-50/50 border-t border-b border-transparent group-hover:bg-purple-50/80 group-hover:border-purple-200 transition-all duration-300 text-center">
                                                    <Badge variant="outline" className="rounded-lg border-slate-200 bg-white px-4 py-2 font-mono text-sm text-slate-800 font-black shadow-sm group-hover:border-purple-200">
                                                        {item.fromStyle}
                                                    </Badge>
                                                </td>
                                                <td className="px-8 py-8 bg-slate-50/50 border-t border-b border-transparent group-hover:bg-purple-50/80 group-hover:border-purple-200 transition-all duration-300 text-center">
                                                    <Badge className="rounded-lg bg-slate-950 text-white px-4 py-2 font-mono text-sm shadow-xl font-black group-hover:bg-purple-900 transition-colors">
                                                        {item.toStyle}
                                                    </Badge>
                                                </td>
                                                <td className="px-10 py-8 bg-slate-50/50 rounded-r-[2rem] border-t border-b border-r border-transparent group-hover:bg-purple-50/80 group-hover:border-purple-200 transition-all duration-300 text-center">
                                                    <div className={cn(
                                                        "inline-flex items-center gap-2 px-6 py-2.5 rounded-full border transition-all duration-300",
                                                        item.status === 'Completed' ? "bg-emerald-50 border-emerald-100 text-emerald-700 shadow-sm" :
                                                            item.status === 'In Progress' ? "bg-indigo-50 border-indigo-100 text-indigo-700 shadow-sm" :
                                                                "bg-amber-50 border-amber-100 text-amber-600 shadow-sm"
                                                    )}>
                                                        <div className={cn(
                                                            "w-2 h-2 rounded-full",
                                                            item.status === 'Completed' ? "bg-emerald-500" :
                                                                item.status === 'In Progress' ? "bg-indigo-500 animate-pulse" :
                                                                    "bg-amber-500"
                                                        )} />
                                                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">{item.status}</span>
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div
                    className="relative bg-slate-950 border-t border-white/5 flex flex-col md:flex-row"
                    style={{ height: 'calc(100vh - 80px)' }}
                >
                    {/* Main 3D Viewport */}
                    <div
                        className="relative order-2 md:order-1 border-b md:border-b-0 md:border-r border-white/5 flex-1"
                        style={{ minHeight: 0 }}
                    >
                        <div style={{ width: '100%', height: '100%' }}>
                            <Scene3D
                                key={`${activeFloor}-${activeLine}`}
                                showMachines={true}
                                machines={cotLayout?.machines || []}
                                sections={cotLayout?.sections || floorSections}
                                isOverview={false}
                                cameraPosition={cameraConfig.position}
                                cameraFov={cameraConfig.fov}
                            />
                        </div>
                    </div>

                    {/* External Activity Checklist Sidebar */}
                    <div
                        className="w-full md:w-[380px] bg-slate-900/95 backdrop-blur-2xl p-6 z-20 order-1 md:order-2 flex flex-col space-y-6 border-l border-white/10 shadow-[-20px_0_60px_rgba(0,0,0,0.4)] overflow-y-auto relative"
                        style={{ maxHeight: 'calc(100vh - 80px)' }}
                    >
                        {/* Decorative Top Accent */}
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />

                        <div className="space-y-3 relative shrink-0">
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={() => navigate(-1)}
                                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group/back"
                                >
                                    <ChevronLeft size={16} className="transition-transform group-hover/back:-translate-x-1" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Back</span>
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-indigo-600/20 border border-indigo-500/30 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.15)]">
                                        <ClipboardList className="text-indigo-400" size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-white font-black uppercase tracking-[0.15em] text-[11px]">COT Operations</h3>
                                        <h3 className="text-slate-400 font-bold text-xs">External Activity Control</h3>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 space-y-4 relative">
                            {OPERATIONS_DATA.map((op) => {
                                const state = opStatuses.find(s => s.id === op.id)!;
                                const isDone = state.status === 'done';
                                const isNotDone = state.status === 'not_done';

                                return (
                                    <motion.div
                                        key={op.id}
                                        className={cn(
                                            "relative flex flex-col gap-3 p-4 rounded-xl transition-all duration-500 border",
                                            isDone
                                                ? "bg-emerald-500/5 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.05)]"
                                                : isNotDone
                                                    ? state.isInternal ? "bg-violet-500/5 border-violet-500/30 shadow-[0_0_20px_rgba(139,92,246,0.05)]" : "bg-amber-500/5 border-amber-500/30"
                                                    : "bg-slate-800/40 border-white/5"
                                        )}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={cn(
                                                "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-500 border shrink-0",
                                                isDone
                                                    ? "bg-emerald-600 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                                                    : isNotDone && state.isInternal
                                                        ? "bg-violet-600 border-violet-400 shadow-[0_0_15px_rgba(139,92,246,0.4)]"
                                                        : "bg-slate-900 border-white/10"
                                            )}>
                                                {isDone ? (
                                                    <CheckCircle2 className="text-white scale-110 transition-all" size={16} />
                                                ) : isNotDone && state.isInternal ? (
                                                    <Zap className="text-violet-400 animate-pulse" size={16} />
                                                ) : (
                                                    <Circle className="text-slate-700" size={16} />
                                                )}
                                            </div>

                                            <div className="flex-1 space-y-1">
                                                <h4 className={cn(
                                                    "text-[13px] font-bold tracking-tight leading-tight",
                                                    isDone ? "text-white" : "text-slate-300"
                                                )}>{op.name}</h4>
                                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 leading-none">{op.category}</span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 shrink-0">
                                            <Button
                                                variant="outline"
                                                onClick={() => updateOp(op.id, { selectingDoneLine: !state.selectingDoneLine, status: null, isInternal: false })}
                                                className={cn(
                                                    "h-8 rounded-lg text-[9px] font-black uppercase tracking-widest gap-2 bg-slate-900 border-white/5",
                                                    (isDone || state.selectingDoneLine) ? "border-indigo-500/50 text-indigo-400 bg-indigo-500/10" : "text-slate-400 hover:text-white"
                                                )}
                                            >
                                                Done
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={() => updateOp(op.id, { status: 'not_done', doneLine: null, selectingDoneLine: false, isInternal: false, selectingBorrowLine: true, borrowedLine: null })}
                                                className={cn(
                                                    "h-8 rounded-lg text-[9px] font-black uppercase tracking-widest gap-2 bg-slate-900 border-white/5",
                                                    isNotDone ? "border-amber-500/50 text-amber-400 bg-amber-500/10" : "text-slate-400 hover:text-white"
                                                )}
                                            >
                                                Not Done
                                            </Button>
                                        </div>

                                        {/* Done Flow: Line Selection */}
                                        {state.selectingDoneLine && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                                className="mt-1 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20 space-y-3"
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-1 h-2.5 bg-indigo-500 rounded-full" />
                                                    <span className="text-[9px] font-black text-indigo-100 uppercase tracking-widest">Mark Done in:</span>
                                                </div>
                                                <div className="grid grid-cols-5 gap-1.5">
                                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                                                        <button
                                                            key={n}
                                                            onClick={() => updateOp(op.id, { status: 'done', doneLine: `Line ${n} `, selectingDoneLine: false })}
                                                            className="h-8 rounded-lg bg-slate-950 border border-white/5 text-[9px] font-black text-slate-400 hover:border-indigo-500 hover:text-white hover:bg-indigo-600/10 transition-all flex items-center justify-center"
                                                        >
                                                            L{n}
                                                        </button>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}

                                        {/* Not Done Flow: Resource Migration */}
                                        {isNotDone && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                                className="mt-1 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 flex flex-col gap-4"
                                            >
                                                {!state.isInternal ? (
                                                    <>
                                                        <div className="space-y-3">
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="w-1 h-2.5 bg-amber-500 rounded-full" />
                                                                <span className="text-[9px] font-black text-amber-200 uppercase tracking-widest leading-none">Take idle from:</span>
                                                            </div>
                                                            <div className="grid grid-cols-5 gap-1.5">
                                                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                                                                    <button
                                                                        key={n}
                                                                        onClick={() => updateOp(op.id, { borrowedLine: `Line ${n} ` })}
                                                                        className={cn(
                                                                            "h-8 rounded-lg text-[9px] font-black transition-all border flex items-center justify-center",
                                                                            state.borrowedLine === `Line ${n} `
                                                                                ? "bg-amber-500 border-amber-400 text-slate-950"
                                                                                : "bg-slate-950 border-white/5 text-slate-500 hover:text-white"
                                                                        )}
                                                                    >
                                                                        L{n}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {state.borrowedLine && (
                                                            <Button
                                                                onClick={() => updateOp(op.id, { isInternal: true, selectingBorrowLine: false })}
                                                                className="w-full h-9 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] shadow-[0_4px_15px_rgba(245,158,11,0.2)] group"
                                                            >
                                                                <Zap className="mr-2 group-hover:animate-bounce" size={12} fill="currentColor" />
                                                                Add to Layout
                                                            </Button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="flex flex-col items-center gap-2 py-1 text-center">
                                                        <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-500/40">
                                                            <Zap className="text-amber-500" size={16} fill="currentColor" />
                                                        </div>
                                                        <div className="space-y-0.5">
                                                            <span className="text-[9px] font-black text-amber-200 uppercase tracking-[0.2em] block">Relocated</span>
                                                            <p className="text-[8px] font-bold text-slate-500">From {state.borrowedLine}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}

                                        {isDone && (
                                            <div className="mt-1 flex items-center gap-2 px-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Done in {state.doneLine}</span>
                                            </div>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>

                        <div className="pt-8 border-t border-white/10 mt-auto space-y-6 shrink-0">
                            <div className="bg-slate-900/80 rounded-3xl p-6 border border-white/5 relative overflow-hidden shadow-2xl">
                                <div className="flex items-center justify-between relative z-10">
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Completion Readiness</span>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-4xl font-black text-white tracking-tighter">
                                                {Math.round((doneCount / OPERATIONS_DATA.length) * 100)}
                                            </span>
                                            <span className="text-sm font-black text-indigo-500">%</span>
                                        </div>
                                    </div>

                                    <div className="relative w-20 h-20 flex items-center justify-center">
                                        <svg className="w-full h-full -rotate-90">
                                            <circle cx="40" cy="40" r="34" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="6" />
                                            <circle cx="40" cy="40" r="34" fill="transparent" stroke="url(#checklist-gradient)" strokeWidth="7" strokeLinecap="round"
                                                style={{
                                                    strokeDasharray: '213.6',
                                                    strokeDashoffset: 213.6 - (213.6 * (doneCount / OPERATIONS_DATA.length)),
                                                    transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)'
                                                }}
                                            />
                                            <defs>
                                                <linearGradient id="checklist-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                    <stop offset="0%" stopColor="#6366f1" />
                                                    <stop offset="100%" stopColor="#8b5cf6" />
                                                </linearGradient>
                                            </defs>
                                        </svg>
                                        <Zap className={cn("absolute text-indigo-400 transition-all duration-500", doneCount === OPERATIONS_DATA.length ? "opacity-100 scale-110" : "opacity-30")} size={24} fill={doneCount === OPERATIONS_DATA.length ? "currentColor" : "none"} />
                                    </div>
                                </div>
                            </div>

                            <Button
                                className={cn(
                                    "w-full h-14 rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] shadow-2xl transition-all duration-500",
                                    doneCount === OPERATIONS_DATA.length
                                        ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20"
                                        : "bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed"
                                )}
                                disabled={doneCount !== OPERATIONS_DATA.length}
                            >
                                Submit Activity Report
                            </Button>
                        </div>
                    </div>
                </div>
            )
            }
        </div >
    );
}
