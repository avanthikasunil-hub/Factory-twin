import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Warehouse,
  Scissors,
  Factory,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Box,
  Home,
  Users,
  Hash,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import styled from "styled-components";
import { getLayoutSpecs, LANE_Z_CENTER_AB, LANE_Z_CENTER_CD } from "@/utils/layoutGenerator";
import { API_BASE_URL } from "../../config";
import { db } from "@/firebase";
import { collection, query, where, limit, onSnapshot } from "firebase/firestore";
import { generateCotLayout } from "@/utils/cotLayoutGenerator";
import { SectionLayout, MachinePosition } from "@/types";
import { cn } from "@/lib/utils";

import { WarehouseView } from "./WarehouseView";
import { SewingView } from "./SewingView";
import { FinishingView } from "./FinishingView";
import { CuttingView } from "./CuttingView";

/* ═══════════════════════════════════════════════════════
   STYLED COMPONENTS
═══════════════════════════════════════════════════════ */
const Wrapper = styled.div`
  width: 100%; height: 100vh; background: #0f172a; overflow: hidden; display: flex;
`;
const Sidebar = styled(motion.aside)`
  width: 280px; background: #020617; border-right: 1px solid rgba(255,255,255,0.05);
  display: flex; flex-direction: column; overflow: hidden; z-index: 20; position: relative;
`;
const Content = styled.main`
  flex: 1; display: flex; flex-direction: column; position: relative; overflow: hidden;
`;
const NavItem = styled.button<{ $active: boolean }>`
  width: 100%; display: flex; align-items: center; gap: 1rem; padding: 1.2rem 1.5rem;
  background: ${p => p.$active ? "rgba(255,255,255,0.05)" : "transparent"};
  color: ${p => p.$active ? "#fff" : "#64748b"};
  border: none; border-left: 4px solid ${p => p.$active ? "#8b5cf6" : "transparent"};
  cursor: pointer; transition: all 0.3s;
  &:hover { background: rgba(255,255,255,0.03); color: #fff; }
`;

const LINE_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#84cc16",
];

const SIDEBAR_ITEMS = [
  { id: "warehouse", label: "Warehouse", icon: Warehouse },
  { id: "cutting", label: "Cutting", icon: Scissors },
  { id: "sewing", label: "Sewing Line", icon: Factory },
  { id: "finishing", label: "Finishing", icon: CheckCircle2 },
];

export default function DigitalTwinPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("warehouse");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [lineStatuses, setLineStatuses] = useState<any[]>([]);
  const [activeMachines, setActiveMachines] = useState<MachinePosition[]>([]);

  const activeFloor = searchParams.get("floor") || "Floor 1";
  const activeLine = searchParams.get("line") || "All Lines";

  const floorSections = useMemo((): SectionLayout[] => {
    const { specs, sections } = getLayoutSpecs("Line 1");
    const minZ = LANE_Z_CENTER_AB - specs.widthAB / 2;
    const maxZ = LANE_Z_CENTER_CD + specs.widthCD / 2;
    const zStep = (maxZ - minZ) + 3.7;
    const numLines = activeFloor === "Floor 1" ? 6 : 3;
    const arr: SectionLayout[] = [];
    for (let i = 0; i < numLines; i++) {
      const lineVal = activeFloor === "Floor 1" ? `Line ${i + 1}` : `Line ${i + 7}`;
      if (activeLine !== "All Lines" && lineVal !== activeLine) continue;
      const color = LINE_COLORS[(activeFloor === "Floor 1" ? i : i + 6) % LINE_COLORS.length];
      const zo = i * zStep;
      arr.push(
        { id: `${lineVal}-marker`, name: lineVal, length: 2, width: specs.widthAB + specs.widthCD + 3.7, position: { x: sections.cuff.start - 3, y: -0.01, z: (LANE_Z_CENTER_AB + LANE_Z_CENTER_CD) / 2 + zo }, color: "transparent" },
        { id: `${lineVal}-cuff`, name: `${lineVal} Cuff`, length: sections.cuff.end - sections.cuff.start, width: specs.widthAB, position: { x: sections.cuff.start, y: 0, z: LANE_Z_CENTER_AB + zo }, color },
        { id: `${lineVal}-sleeve`, name: `${lineVal} Sleeve`, length: sections.sleeve.end - sections.sleeve.start, width: specs.widthAB, position: { x: sections.sleeve.start, y: 0, z: LANE_Z_CENTER_AB + zo }, color },
        { id: `${lineVal}-back`, name: `${lineVal} Back`, length: sections.back.end - sections.back.start, width: specs.widthAB, position: { x: sections.back.start, y: 0, z: LANE_Z_CENTER_AB + zo }, color },
        { id: `${lineVal}-collar`, name: `${lineVal} Collar`, length: sections.collar.end - sections.collar.start, width: specs.widthCD, position: { x: sections.collar.start, y: 0, z: LANE_Z_CENTER_CD + zo }, color },
        { id: `${lineVal}-front`, name: `${lineVal} Front`, length: sections.front.end - sections.front.start, width: specs.widthCD, position: { x: sections.front.start, y: 0, z: LANE_Z_CENTER_CD + zo }, color },
        { id: `${lineVal}-a1`, name: `${lineVal} Assembly AB`, length: sections.assemblyAB.end - sections.assemblyAB.start, width: specs.widthAB, position: { x: sections.assemblyAB.start, y: 0, z: LANE_Z_CENTER_AB + zo }, color },
        { id: `${lineVal}-a2`, name: `${lineVal} Assembly CD`, length: sections.assemblyCD.end - sections.assemblyCD.start, width: specs.widthCD, position: { x: sections.assemblyCD.start, y: 0, z: LANE_Z_CENTER_CD + zo }, color },
      );
    }
    return arr;
  }, [activeFloor, activeLine]);

  const cameraConfig = useMemo(() => {
    if (activeLine === "All Lines")
      return { pos: activeFloor === "Floor 1" ? [-90, 80, 12] : [-60, 50, 8], fov: activeFloor === "Floor 1" ? 32 : 28 };
    const num = parseInt(activeLine.split(" ")[1]);
    const idx = activeFloor === "Floor 1" ? num - 1 : num - 7;
    const { specs } = getLayoutSpecs("Line 1");
    const zStep = (LANE_Z_CENTER_CD + specs.widthCD / 2 - (LANE_Z_CENTER_AB - specs.widthAB / 2)) + 3.7;
    return { pos: [-30, 40, (LANE_Z_CENTER_AB + LANE_Z_CENTER_CD) / 2 + (idx * zStep)], fov: 25 };
  }, [activeFloor, activeLine]);

  // 1. Unified Sync for Line Statuses & Layouts (Backend + Firebase)
  useEffect(() => {
    let isMounted = true;
    let unsub = null;

    const syncStatus = async () => {
      try {
        // First: Fetch from Local Backend (SQLite)
        const res = await fetch(`${API_BASE_URL}/active-layouts`);
        let backendData = [];
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) backendData = data;
        }

        // Second: Setup Firestore Real-time Listener
        const q = collection(db, "changeoverData");
        unsub = onSnapshot(q, (snap) => {
          if (!isMounted) return;

          const today = new Date();
          const dStr_today = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
          const dStr_alt = dStr_today.split('/').map(p => p.padStart(2, '0')).join('/');

          const firestoreLines = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
            .filter(l => {
              const status = (l.status || "").toLowerCase();
              if (status !== 'partial' && status !== 'in_progress' && status !== 'changeover' && status !== 'running') return false;
              const dStr = l.lastUpdated || l.summaryData?.lastUpdated || "";
              return (dStr.includes(dStr_today) || dStr.includes(dStr_alt));
            });

          // Merge Backend and Firestore Statuses
          const mergedStatuses = [];
          for (let i = 1; i <= 9; i++) {
            const ln = `Line ${i}`;
            const foundCloud = firestoreLines.find(fl => (fl.line || fl.summaryData?.line) === ln);
            const foundBackend = backendData.find(s => 
              String(s.line_no || s.status_line).toUpperCase().replace(' ', '') === ln.toUpperCase().replace(' ', '')
            );

            if (foundCloud) {
              mergedStatuses.push({
                line_no: ln,
                style_no: foundCloud.style_no || foundCloud.summaryData?.toStyle || foundCloud.toStyle || '---',
                con_no: foundCloud.conNo || foundCloud.summaryData?.conNo || '---',
                buyer: foundCloud.buyer || foundCloud.summaryData?.buyer || '---',
                status: (foundCloud.status === 'partial' || foundCloud.status === 'in_progress') ? 'Changeover' : (foundCloud.status || 'Running'),
                isLive: true,
                operations: foundBackend?.operations || []
              });
            } else if (foundBackend) {
              mergedStatuses.push({
                ...foundBackend,
                line_no: ln,
                style_no: foundBackend.style_no || foundBackend.status_style || '---',
                con_no: foundBackend.con_no || foundBackend.status_con || '---',
                status: foundBackend.status || 'Running'
              });
            } else {
              mergedStatuses.push({ line_no: ln, status: 'Idle', style_no: '---', con_no: '---', buyer: '---' });
            }
          }
          setLineStatuses(mergedStatuses);

          // 2. Generate Active Machines if we're in the Sewing tab
          if (activeTab === "sewing") {
            const getN = (l: string) => { const m = String(l).match(/\d+/); return m ? parseInt(m[0]) : null; };
            let floorData = mergedStatuses.filter(s => {
              const n = getN(s.line_no);
              if (n === null) return false;
              return activeFloor === "Floor 1" ? (n >= 1 && n <= 6) : (n >= 7 && n <= 9);
            });
            if (activeLine !== "All Lines") floorData = floorData.filter(s => getN(s.line_no) === getN(activeLine));
            
            const { specs } = getLayoutSpecs("Line 1");
            const zStep = (LANE_Z_CENTER_CD + specs.widthCD / 2 - (LANE_Z_CENTER_AB - specs.widthAB / 2)) + 3.7;

            const machines = floorData.flatMap(item => {
              if (!item.operations || !Array.isArray(item.operations) || item.operations.length === 0) return [];
              const result = generateCotLayout(item.operations, item.line_no);
              const n = getN(item.line_no)!;
              const ri = n <= 6 ? n - 1 : n - 7;
              return result.machines.map(m => ({
                ...m,
                position: { ...m.position, z: m.position.z + (ri * zStep) }
              }));
            });
            setActiveMachines(machines);
          }
        });
      } catch (err) { }
    };

    syncStatus();
    return () => { isMounted = false; if (unsub) unsub(); };
  }, [activeTab, activeFloor, activeLine]);

  return (
    <Wrapper>
      <Sidebar animate={{ width: sidebarOpen ? 280 : 80 }} transition={{ type: "spring", damping: 20 }}>
        <div className="p-8 pb-12 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/20">
            <Box className="w-6 h-6 text-white" />
          </div>
          {sidebarOpen && (
            <div className="flex flex-col truncate">
              <span className="font-black text-white text-lg tracking-tight">FACTORY TWIN</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">Intelligence Hub</span>
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-1">
          {SIDEBAR_ITEMS.map(item => (
            <NavItem key={item.id} $active={activeTab === item.id} onClick={() => setActiveTab(item.id)}>
              <item.icon size={22} />
              {sidebarOpen && <span className="font-bold text-sm tracking-wide">{item.label}</span>}
            </NavItem>
          ))}
        </nav>
        <div className="p-6 border-t border-white/5">
          <NavItem $active={false} onClick={() => navigate("/")}>
            <Home size={22} />
            {sidebarOpen && <span className="font-bold text-sm tracking-wide">Back to Home</span>}
          </NavItem>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="absolute -right-3 top-24 w-6 h-6 bg-violet-600 rounded-full flex items-center justify-center text-white border-2 border-slate-950">
          {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
      </Sidebar>

      <Content>
        <div className="absolute top-8 left-8 z-10 pointer-events-none">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-1">
            <h2 className="text-4xl font-black text-white tracking-tight uppercase drop-shadow-2xl">{SIDEBAR_ITEMS.find(i => i.id === activeTab)?.label}</h2>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">Live View</span>
            </div>
          </motion.div>
        </div>

        <div className="w-full h-full flex flex-row">
          <div className="flex-1 h-full bg-[#080a0f]">
            {activeTab === "warehouse" ? (
              <WarehouseView />
            ) : activeTab === "sewing" ? (
              <SewingView activeFloor={activeFloor} activeLine={activeLine} activeMachines={activeMachines} floorSections={floorSections} cameraConfig={cameraConfig} />
            ) : activeTab === "finishing" ? (
              <FinishingView activeFloor={activeFloor} activeLine={activeLine} cameraConfig={cameraConfig} lineColors={LINE_COLORS} />
            ) : (
              <CuttingView />
            )}
          </div>

          {activeTab === "sewing" && (
            <div className="w-[340px] bg-slate-900 border-l border-white/5 flex flex-col shadow-2xl relative z-20">
              <div className="p-6 border-b border-white/5 bg-slate-900/50 backdrop-blur-md">
                <h3 className="text-white font-black text-xs uppercase tracking-[0.2em] flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />Live Status</h3>
                <div className="flex items-center gap-1 mt-4 bg-black/20 p-1 rounded-xl">
                  {["Floor 1", "Floor 2"].map(f => (
                    <button key={f} onClick={() => setSearchParams({ floor: f, line: activeLine })}
                      className={cn("flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all", activeFloor === f ? "bg-violet-600 text-white" : "text-slate-500")}>{f}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(id => {
                  const lName = `Line ${id}`;
                  const s = lineStatuses.find(st => st.line_no === lName);
                  const isActive = activeLine === lName;
                  return (
                    <div key={id} className={cn("p-4 rounded-2xl border transition-all relative overflow-hidden", isActive ? "bg-violet-600/20 border-violet-500/50 shadow-lg" : "bg-white/[0.02] border-white/5")}>
                      {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-500" />}
                      <div className="flex items-center justify-between mb-3"><span className="font-black text-xs text-slate-300">LINE {id}</span><div className={cn("px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border", s?.status === "Running" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : s?.status === "Changeover" ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" : "bg-slate-800 border-white/5 text-slate-500")}>{s?.status || "Idle"}</div></div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/[0.02]"><Users size={12} className="text-slate-500" /><div className="flex flex-col"><span className="text-[8px] text-slate-500 uppercase">Buyer</span><span className="text-[10px] text-slate-200 font-bold truncate">{s?.buyer || "---"}</span></div></div>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/[0.02]"><Hash size={12} className="text-slate-500" /><div className="flex flex-col"><span className="text-[8px] text-slate-500 uppercase">Con No</span><span className="text-[10px] text-slate-200 font-bold">{s?.con_no || "---"}</span></div></div>
                      </div>
                      <button onClick={() => { const f = id <= 6 ? "Floor 1" : "Floor 2"; setSearchParams({ floor: f, line: lName }); }} className={cn("mt-3 w-full py-2 rounded-xl flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all", isActive ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white")}>{isActive ? "Focused" : "Focus Line"}</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Content>
      <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }`}</style>
    </Wrapper>
  );
}
