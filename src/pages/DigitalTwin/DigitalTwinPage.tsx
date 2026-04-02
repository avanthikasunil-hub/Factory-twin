import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Warehouse,
  Scissors,
  Factory,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Box,
  Home,
  Users,
  Hash,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import styled from "styled-components";
import { getLayoutSpecs, LANE_Z_CENTER_AB, LANE_Z_CENTER_CD, generateLayout, FT } from "@/utils/layoutGenerator";
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
const PINK_COLOR = "#db2777";

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
    const S = FT;
    const minZ = LANE_Z_CENTER_AB - specs.widthAB / 2;
    const maxZ = LANE_Z_CENTER_CD + specs.widthCD / 2;
    const zStep = (maxZ - minZ) + (3.5 * S);
    const numLines = activeFloor === "Floor 1" ? 6 : 3;
    const arr: SectionLayout[] = [];
    for (let i = 0; i < numLines; i++) {
      const lineVal = activeFloor === "Floor 1" ? `Line ${i + 1}` : `Line ${i + 7}`;
      if (activeLine !== "All Lines" && lineVal !== activeLine) continue;

      // Special handling for Line 6 color
      let color = LINE_COLORS[(activeFloor === "Floor 1" ? i : i + 6) % LINE_COLORS.length];
      if (lineVal === "Line 6") color = PINK_COLOR;

      // v195: Calculate specs PER LINE to respect individual presets (Line 6 uses Preset B)
      const { specs: lSpecs, sections: lSections } = getLayoutSpecs(lineVal);

      const zo = i * zStep;
      arr.push(
        // { id: `${lineVal}-marker`, name: lineVal, length: 2, width: lSpecs.widthAB + lSpecs.widthCD + (3.5 * FT), position: { x: lSections.cuff.start - 3, y: -0.01, z: (LANE_Z_CENTER_AB + LANE_Z_CENTER_CD) / 2 + zo }, color: "transparent" },
        { id: `${lineVal}-cuff`, name: `${lineVal} Cuff`, length: lSections.cuff.end - lSections.cuff.start, width: lSpecs.widthAB, position: { x: lSections.cuff.start, y: 0, z: LANE_Z_CENTER_AB + zo }, color },
        { id: `${lineVal}-sleeve`, name: `${lineVal} Sleeve`, length: lSections.sleeve.end - lSections.sleeve.start, width: lSpecs.widthAB, position: { x: lSections.sleeve.start, y: 0, z: LANE_Z_CENTER_AB + zo }, color },
        { id: `${lineVal}-back`, name: `${lineVal} Back`, length: lSections.back.end - lSections.back.start, width: lSpecs.widthAB, position: { x: lSections.back.start, y: 0, z: LANE_Z_CENTER_AB + zo }, color },
        { id: `${lineVal}-collar`, name: `${lineVal} Collar`, length: lSections.collar.end - lSections.collar.start, width: lSpecs.widthCD, position: { x: lSections.collar.start, y: 0, z: LANE_Z_CENTER_CD + zo }, color },
        { id: `${lineVal}-front`, name: `${lineVal} Front`, length: lSections.front.end - lSections.front.start, width: lSpecs.widthCD, position: { x: lSections.front.start, y: 0, z: LANE_Z_CENTER_CD + zo }, color },
        { id: `${lineVal}-a1`, name: `${lineVal} Assembly AB`, length: lSections.assemblyAB.end - lSections.assemblyAB.start, width: lSpecs.widthAB, position: { x: lSections.assemblyAB.start, y: 0, z: LANE_Z_CENTER_AB + zo }, color },
        { id: `${lineVal}-a2`, name: `${lineVal} Assembly CD`, length: lSections.assemblyCD.end - lSections.assemblyCD.start, width: lSpecs.widthCD, position: { x: lSections.assemblyCD.start, y: 0, z: LANE_Z_CENTER_CD + zo }, color },
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
    const zStep = (LANE_Z_CENTER_CD + specs.widthCD / 2 - (LANE_Z_CENTER_AB - specs.widthAB / 2)) + (3.5 * FT);
    return { pos: [-30, 40, (LANE_Z_CENTER_AB + LANE_Z_CENTER_CD) / 2 + (idx * zStep)], fov: 25 };
  }, [activeFloor, activeLine]);

  // ── STABLE layout generation: runs once per floor/line change, never inside a timer or snapshot ──
  const layoutGeneratedKey = React.useRef("");

  useEffect(() => {
    if (activeTab !== "sewing") return;

    const key = `${activeFloor}|${activeLine}`;
    if (layoutGeneratedKey.current === key) return; // already generated for this combo
    layoutGeneratedKey.current = key;

    // Fetch OB operations from backend ONCE, then generate layout synchronously
    const generateSewingLayout = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/active-layouts`);
        let backendData: any[] = [];
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) backendData = data;
        }

        const commonOps = backendData.find((s: any) => s.operations && s.operations.length > 0)?.operations || [];
        if (commonOps.length === 0) return;

        const getN = (l: string) => { const m = String(l).match(/\d+/); return m ? parseInt(m[0]) : null; };
        const { specs } = getLayoutSpecs("Line 1");
        const zStep = (LANE_Z_CENTER_CD + specs.widthCD / 2 - (LANE_Z_CENTER_AB - specs.widthAB / 2)) + (3.5 * FT);

        const allMachines: any[] = [];
        for (let i = 1; i <= 9; i++) {
          const ln = `Line ${i}`;
          const n = getN(ln)!;
          if (activeFloor === "Floor 1" && (n < 1 || n > 6)) continue;
          if (activeFloor === "Floor 2" && (n < 7 || n > 9)) continue;
          if (activeLine !== "All Lines" && ln !== activeLine) continue;

          const result = generateLayout(commonOps, 1200, 9, 90, ln);
          const ri = n <= 6 ? n - 1 : n - 7;
          const lineMachines = result.machines.map((m: any) => ({
            ...m,
            position: { ...m.position, z: m.position.z + (ri * zStep) }
          }));
          allMachines.push(...lineMachines);
        }
        setActiveMachines(allMachines);
      } catch (err) { /* backend may be offline */ }
    };

    generateSewingLayout();
  }, [activeTab, activeFloor, activeLine]); // safe: never re-runs for the same key

  // ── Firestore-only sync: ONLY updates line statuses, never touches machine positions ──
  useEffect(() => {
    let isMounted = true;
    let unsub: any = null;

    const syncStatus = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/active-layouts`);
        let backendData: any[] = [];
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) backendData = data;
        }

        const q = collection(db, "changeoverData");
        unsub = onSnapshot(q, (snap) => {
          if (!isMounted) return;
          const mergedStatuses: any[] = [];
          for (let i = 1; i <= 9; i++) {
            const ln = `Line ${i}`;
            const foundBackend = backendData.find((s: any) =>
              String(s.line_no || s.status_line || "").toUpperCase().replace(/\s/g, "") === ln.toUpperCase().replace(/\s/g, "")
            );
            mergedStatuses.push({
              line_no: ln,
              style_no: foundBackend?.style_no || 'PUFFIN LS LINEN',
              status: 'Running',
              operations: foundBackend?.operations || []
            });
          }
          setLineStatuses(mergedStatuses); // ✅ Only updates status labels, NEVER machines
        });
      } catch (err) { }
    };

    syncStatus();
    return () => { isMounted = false; if (unsub) unsub(); };
  }, []); // ✅ Empty deps: runs ONCE on mount, never re-triggers

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
        <div className="w-full h-full flex flex-col relative">
          {/* TOP CONTROL BAR (Sewing Tab) */}
          {activeTab === "sewing" && (
            <div className="w-full bg-slate-950/80 backdrop-blur-3xl px-8 py-4 border-b border-white/5 flex items-center justify-between z-20">
              <div className="flex items-center gap-10">
                {/* Floor Toggle */}
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase text-violet-400 tracking-widest mb-1.5 opacity-80">Floor Control</span>
                  <div className="flex items-center gap-1.5">
                    {["Floor 1", "Floor 2"].map(f => (
                      <button
                        key={f}
                        onClick={() => {
                          const newParams = new URLSearchParams(searchParams);
                          newParams.set("floor", f);
                          newParams.set("line", "All Lines");
                          setSearchParams(newParams);
                        }}
                        className={cn(
                          "px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all",
                          activeFloor === f
                            ? "bg-violet-600 text-white shadow-xl shadow-violet-600/20 scale-105"
                            : "bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300 border border-white/5"
                        )}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-px h-10 bg-white/5" />

                {/* Line Filter */}
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase text-violet-400 tracking-widest mb-1.5 opacity-80">Line Selection</span>
                  <div className="relative group min-w-[180px]">
                    <div className="flex items-center justify-between gap-4 px-5 py-2.5 bg-white/5 border border-white/5 rounded-xl group-hover:border-violet-400/40 transition-all cursor-pointer">
                      <span className="text-xs font-black text-white">{activeLine}</span>
                      <ChevronDown size={14} className="text-slate-500 group-hover:text-violet-400 transition-colors" />
                    </div>
                    <select
                      className="absolute inset-0 opacity-0 cursor-pointer w-full"
                      value={activeLine}
                      onChange={(e) => {
                        const newParams = new URLSearchParams(searchParams);
                        newParams.set("line", e.target.value);
                        setSearchParams(newParams);
                      }}
                    >
                      <option value="All Lines">All Lines</option>
                      {Array.from({ length: 9 }).map((_, i) => (
                        <option key={i + 1} value={`Line ${i + 1}`}>Line {i + 1}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest leading-none mb-1">Live Intelligence Hub</span>
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{activeFloor} • {activeLine} • Production Active</span>
              </div>
            </div>
          )}

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
        </div>
      </Content>
      <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }`}</style>
    </Wrapper>
  );
}
