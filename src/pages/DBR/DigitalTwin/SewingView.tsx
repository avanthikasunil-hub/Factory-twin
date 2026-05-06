import React, { useState, useEffect, useMemo, useRef } from "react";
import { Scene3D } from "@/components/3d/Scene3D";
import { MachinePosition, SectionLayout } from "@/types";
import { useLineStore } from "@/store/useLineStore";
import { Edit2, Save, Undo2, Redo2, ChevronDown, Play, CheckCircle, LogIn, Settings2, SearchCheck, Layers, ShieldCheck, CheckCircle2, WashingMachine, LogOut, Activity, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/config";
import { toast } from "sonner";

interface SewingViewProps {
  activeFloor: string;
  activeLine: string;
  activeMachines: MachinePosition[];
  floorSections: SectionLayout[];
  cameraConfig: { pos: number[]; fov: number };
}

/* ───── 1. SEWING PRODUCTION FLOW COMPONENT ───── */
const SEWING_FLOW_STEPS = [
  { id: 'input', label: 'Bundle Input to Line', icon: <LogIn size={14} />, color: '#6366f1' },
  { id: 'setup', label: 'Line Setup / Changeover', icon: <Settings2 size={14} />, color: '#818cf8' },
  { id: 'collar', label: 'Collar Operation → Inspection', icon: <SearchCheck size={14} />, color: '#a78bfa' },
  { id: 'cuff', label: 'Cuff Operation → Inspection', icon: <SearchCheck size={14} />, color: '#3b82f6' },
  { id: 'sleeve', label: 'Sleeve Operation → Inspection', icon: <SearchCheck size={14} />, color: '#0ea5e9' },
  { id: 'front', label: 'Front Part Assembly → Inspection', icon: <Layers size={14} />, color: '#fbbf24' },
  { id: 'back', label: 'Back Part Assembly → Inspection', icon: <Layers size={14} />, color: '#f97316' },
  { id: 'final', label: 'Final Assembly → Inspection', icon: <ShieldCheck size={14} />, color: '#ec4899' },
  { id: 'endline', label: 'End-line Inspection', icon: <CheckCircle2 size={14} />, color: '#2dd4bf' },
  { id: 'washing', label: 'Send to Washing (if req)', icon: <WashingMachine size={14} />, color: '#94a3b8' },
  { id: 'output', label: 'Output from Line', icon: <LogOut size={14} />, color: '#22c55e' },
];

const SewingMaterialFlow = () => {
  return (
    <div className="absolute top-24 left-6 z-[70] w-72 bg-slate-950/80 backdrop-blur-2xl p-6 rounded-[2rem] border border-white/10 shadow-2xl animate-in fade-in slide-in-from-left-4 overflow-hidden flex flex-col">
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <div className="p-2 bg-violet-500/20 rounded-xl text-violet-400">
          <Activity size={18} />
        </div>
        <div className="flex flex-col">
          <h3 className="text-[11px] font-black uppercase text-white tracking-[0.2em] leading-none mb-1">Production Flow</h3>
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Sewing Lifecycle</span>
        </div>
      </div>

      <div className="relative space-y-2.5">
        {/* Connection Line */}
        <div className="absolute left-[15px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-violet-500/50 via-slate-700/30 to-emerald-500/50" />

        {SEWING_FLOW_STEPS.map((step, idx) => (
          <div key={step.id} className="group relative flex items-center gap-4 cursor-pointer">
            {/* Step Node */}
            <div 
              className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110"
              style={{ background: `${step.color}20`, border: `2px solid ${step.color}` }}
            >
              <div className="text-white" style={{ color: step.color }}>
                {step.icon}
              </div>
              {/* Glow effect */}
              <div className="absolute inset-0 rounded-full blur-[8px] opacity-20 group-hover:opacity-40 transition-opacity" style={{ background: step.color }} />
            </div>

            {/* Step Label */}
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase text-slate-400 group-hover:text-white transition-colors tracking-widest leading-none mb-0.5">
                Step {idx + 1}
              </span>
              <span className="text-[10.5px] font-bold text-white/90 group-hover:text-white transition-colors">
                {step.label}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const SewingView: React.FC<SewingViewProps> = ({
  activeFloor,
  activeLine,
  activeMachines: propMachines,
  floorSections,
  cameraConfig,
}) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [editTool, setEditTool] = useState<"move" | "rotate" | "delete" | "add">("move");
  const [selectedAddType, setSelectedAddType] = useState("snls");
  const [selectedAddLabel, setSelectedAddLabel] = useState("SNLS");
  const [showMaterialFlow, setShowMaterialFlow] = useState(true);

  const {
    machineLayout,
    setMachineLayout,
    setPlacingMachine,
    placingMachine,
    setMoveMode,
    setDeleteMode,
    setRotateMode,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedMachines,
    deleteSelectedMachines,
    rotateSelectedMachines,
    setSelectedMachine,
  } = useLineStore();

  const storeInitRef = useRef(false);
  const [loadedMachines, setLoadedMachines] = useState<MachinePosition[] | null>(null);

  useEffect(() => {
    // We already have processed machines from the parent (DigitalTwinPage),
    // but we check if we need to sync them to the store for editing.
    if (!storeInitRef.current && propMachines.length > 0) {
      storeInitRef.current = true;
      const current = useLineStore.getState().machineLayout;
      const otherMachines = current.filter((m: any) =>
        m.section !== "Cuff" && m.section !== "Sleeve" && m.section !== "Back" &&
        m.section !== "Collar" && m.section !== "Front" && !m.section?.includes("Assembly")
      );
      useLineStore.getState().setMachineLayout([...otherMachines, ...propMachines]);
    }
  }, [propMachines]);

  const enterEditMode = (value: boolean) => {
    setIsEditMode(value);
    if (value && !storeInitRef.current) {
      storeInitRef.current = true;
      const current = useLineStore.getState().machineLayout;
      const otherMachines = current.filter((m: any) =>
        m.section !== "Cuff" && m.section !== "Sleeve" && m.section !== "Back" &&
        m.section !== "Collar" && m.section !== "Front" && !m.section?.includes("Assembly")
      );
      setMachineLayout([...otherMachines, ...propMachines]);
    }
    if (!value) {
      setMoveMode(false);
      setRotateMode(false);
      setDeleteMode(false);
      setPlacingMachine(null);
    } else {
      setMoveMode(true);
      setEditTool("move");
    }
  };

  const displayMachines = useMemo(() => {
    if (activeLine !== "All Lines") {
      const lineSections = floorSections.filter(s => s.id.startsWith(activeLine + "-"));
      const lineZs = lineSections.map(s => s.position.z);
      if (lineZs.length > 0) {
        const minZ = Math.min(...lineZs) - 5;
        const maxZ = Math.max(...lineZs) + 5;
        
        const storeMachines = machineLayout.filter((m: any) => {
          const isSewingSection = m.section === "Cuff" || m.section === "Sleeve" || m.section === "Back" ||
            m.section === "Collar" || m.section === "Front" || m.section?.includes("Assembly") ||
            (m.section && m.section.startsWith(activeLine + " ")) ||
            (m.operation?.machine_type?.startsWith("pillar"));
            
          if (!isSewingSection) return false;
          
          if (m.id.startsWith("Line ")) {
            return m.id.startsWith(activeLine + "-");
          }
          
          return m.position && m.position.z >= minZ && m.position.z <= maxZ;
        });
        
        return storeMachines.length > 0 ? storeMachines : propMachines;
      }
    }
    
    const storeMachines = machineLayout.filter((m: any) =>
      m.section === "Cuff" || m.section === "Sleeve" || m.section === "Back" ||
      m.section === "Collar" || m.section === "Front" || m.section?.includes("Assembly") ||
      m.id.startsWith("Line ") || m.operation?.machine_type?.startsWith("pillar")
    );
    return storeMachines.length > 0 ? storeMachines : (loadedMachines || propMachines);
  }, [machineLayout, propMachines, loadedMachines, activeLine, floorSections]);

  const [serverLayoutLoaded, setServerLayoutLoaded] = useState(false);

  useEffect(() => {
    const fetchLayout = async () => {
      try {
        const { db } = await import("@/firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const layoutRef = doc(db, "modifiedLayouts", "SEWING");
        const layoutSnap = await getDoc(layoutRef);

        if (layoutSnap.exists()) {
          const data = layoutSnap.data();
          const savedMachines = data.machineLayout || [];
          
          // Auto-align crooked Line 1 pillars from Firestore perfectly
          savedMachines.forEach((m: any) => {
            if (m.operation?.machine_type?.startsWith("pillar") && m.position?.z > -3.0 && m.position?.z < -2.0) {
              m.position.z = -2.5; // Perfect straight line
            }
          });

          console.log("=== FIRESTORE PILLARS ===", savedMachines.filter((m: any) => m.operation?.machine_type?.startsWith("pillar")));
          if (savedMachines.length > 0) {
            setLoadedMachines(savedMachines);
            const current = useLineStore.getState().machineLayout;
            const otherMachines = current.filter((m: any) =>
              m.section !== "Cuff" && m.section !== "Sleeve" && m.section !== "Back" &&
              m.section !== "Collar" && m.section !== "Front" && !m.section?.includes("Assembly")
            );
            const savedMap = new Map(savedMachines.map((m: any) => [m.id, m]));
            const merged = propMachines.map(base =>
              savedMap.has(base.id) ? { ...base, ...savedMap.get(base.id) } : base
            );
            const baseIds = new Set(propMachines.map(m => m.id));
            savedMachines.forEach((m: any) => {
              if (!baseIds.has(m.id)) merged.push(m);
            });
            useLineStore.getState().setMachineLayout([...otherMachines, ...merged]);
          }
        }
      } catch (err) {
        console.error("Error loading sewing layout from Firestore:", err);
      } finally {
        setServerLayoutLoaded(true);
      }
    };
    fetchLayout();
  }, [propMachines]);

  const handleSave = async () => {
    const sewingMachines = machineLayout.filter((m: any) =>
      m.section === "Cuff" || m.section === "Sleeve" || m.section === "Back" ||
      m.section === "Collar" || m.section === "Front" || m.section?.includes("Assembly") ||
      m.operation?.machine_type?.startsWith("pillar")
    );
    try {
      await useLineStore.getState().syncDigitalTwinLayout("SEWING", sewingMachines);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
      toast.success("✅ Sewing layout saved!");
    } catch (err) {
      toast.error("❌ Save failed: " + err);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden">

      {/* ── SAVE SUCCESS BANNER ── */}
      {isSaved && (
        <div className="absolute inset-x-0 top-0 z-[100] flex items-center justify-center pt-4 pointer-events-none animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3 bg-emerald-600 text-white px-8 py-3.5 rounded-2xl shadow-2xl shadow-emerald-600/40 border border-emerald-400/50">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-black uppercase tracking-[0.15em]">Layout Saved — Changes Persisted</span>
          </div>
        </div>
      )}

      {/* ── TOP-RIGHT TOOLBAR ── */}
      <div className="absolute top-6 right-6 z-[60] flex items-center gap-3">

        {/* Tool Pills (only when in edit mode) */}
        {isEditMode && (
          <div className="flex items-center gap-1 bg-slate-950/80 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10 shadow-2xl animate-in slide-in-from-right-4">
            {/* Undo / Redo */}
            <div className="flex items-center gap-1 px-2 border-r border-white/10 mr-1">
              <button onClick={undo} disabled={!canUndo} className={cn("p-2 rounded-xl transition-all", canUndo ? "text-white hover:bg-white/10" : "text-white/20 cursor-not-allowed")}>
                <Undo2 size={14} />
              </button>
              <button onClick={redo} disabled={!canRedo} className={cn("p-2 rounded-xl transition-all", canRedo ? "text-white hover:bg-white/10" : "text-white/20 cursor-not-allowed")}>
                <Redo2 size={14} />
              </button>
            </div>

            {/* Add / Move / Rotate / Delete */}
            {([
              { id: "add",    icon: <Play className="rotate-270" size={14} />,           label: "Add"    },
              { id: "move",   icon: <Edit2 size={14} />,                                  label: "Move"   },
              { id: "rotate", icon: <Play className="rotate-90" size={14} />,             label: "Rotate" },
              { id: "delete", icon: <CheckCircle className="text-red-500" size={14} />,   label: "Del"    },
            ] as const).map((tool) => (
              <button
                key={tool.id}
                onClick={() => {
                  setEditTool(tool.id as any);
                  setMoveMode(tool.id === "move");
                  setRotateMode(tool.id === "rotate");
                  setDeleteMode(tool.id === "delete");
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  editTool === tool.id
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                {tool.icon}
                {tool.label}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setShowMaterialFlow(!showMaterialFlow)}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all shadow-2xl border",
            showMaterialFlow
              ? "bg-violet-600 text-white border-violet-500 shadow-violet-600/30"
              : "bg-slate-900/80 backdrop-blur-md text-white hover:bg-violet-600 border-white/10 hover:border-violet-500"
          )}
        >
          <Activity size={14} />
          Material Flow
        </button>

        {/* Modify Layout toggle */}
        <button
          onClick={() => enterEditMode(!isEditMode)}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all shadow-2xl border",
            isEditMode
              ? "bg-amber-600 text-white border-amber-500 shadow-amber-600/30"
              : "bg-slate-900/80 backdrop-blur-md text-white hover:bg-violet-600 border-white/10 hover:border-violet-500"
          )}
        >
          <Edit2 size={14} />
          {isEditMode ? "Exit Edit" : "Modify Layout"}
        </button>

        {/* Save button (only in edit mode) */}
        {isEditMode && (
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 text-white shadow-2xl shadow-emerald-600/30 hover:bg-emerald-500 transition-colors text-[11px] font-black uppercase tracking-widest border border-emerald-500"
            title="Save Layout Permanently"
          >
            <Save size={14} /> Save
          </button>
        )}
      </div>

      {/* ── ADD PANEL ── */}
      {isEditMode && editTool === "add" && (
        <div className="absolute top-24 right-6 z-[60] w-72 bg-slate-950/90 backdrop-blur-2xl p-5 rounded-3xl border border-white/10 shadow-2xl animate-in fade-in slide-in-from-top-4">
          <h3 className="text-[10px] font-black uppercase text-violet-400 tracking-[0.2em] mb-4 flex items-center gap-2">
            <Play size={12} className="rotate-270" /> Add Sewing Machine
          </h3>
          <div className="space-y-4">
            <div className="relative group">
              <select
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold text-white appearance-none focus:outline-none focus:border-violet-500 transition-colors cursor-pointer"
                value={selectedAddType}
                onChange={(e) => {
                  setSelectedAddType(e.target.value);
                  setSelectedAddLabel(e.target.options[e.target.selectedIndex].text);
                }}
              >
                <option value="snls">SNLS</option>
                <option value="dnls">DNLS</option>
                <option value="overlock">Overlock</option>
                <option value="flatlock">Flatlock</option>
                <option value="buttonhole">Button Hole</option>
                <option value="buttonattach">Button Attach</option>
                <option value="bar-tack">Bar-tack</option>
                <option value="fusing">Rotary Fusing</option>
                <option value="iron">Iron</option>
                <option value="Inspection">Inspection Table</option>
                <option value="Helper Table">Helper Table</option>
                <option value="supermarket">Supermarket</option>
                <option value="human">Standing Worker</option>
                <option value="sitting-human">Sitting Worker</option>
                <option value="pillar-1">Pillar 1 (2.5x1.7ft)</option>
                <option value="pillar-2">Pillar 2 (1.7x3.5ft)</option>
              </select>
              <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
            <button
              onClick={() => {
                if (placingMachine) {
                  setPlacingMachine(null);
                } else {
                  setPlacingMachine({ type: selectedAddType, section: "Assembly 1", opName: selectedAddLabel });
                }
              }}
              className={cn(
                "w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                placingMachine ? "bg-amber-600 text-white shadow-lg" : "bg-violet-600 text-white shadow-lg hover:bg-violet-500"
              )}
            >
              {placingMachine ? "Cancel Placement" : "Place Machine"}
            </button>
          </div>
        </div>
      )}

      {/* ── SELECTION STATUS FOOTER ── */}
      {isEditMode && selectedMachines.length > 0 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[60] bg-slate-950/90 backdrop-blur-2xl px-8 py-4 rounded-3xl border border-violet-500/30 shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-violet-400 tracking-widest leading-none mb-1">Active Selection</span>
            <span className="text-white font-bold text-sm">{selectedMachines.length} Machine{selectedMachines.length > 1 ? "s" : ""} Selected</span>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            {editTool === "rotate" && (
              <button onClick={() => rotateSelectedMachines(Math.PI / 2)} className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                Rotate 90°
              </button>
            )}
            {editTool === "delete" && (
              <button onClick={deleteSelectedMachines} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                Delete Selected
              </button>
            )}
            <button onClick={() => setSelectedMachine(null)} className="text-slate-400 hover:text-white text-[10px] font-black uppercase tracking-widest px-4 py-2">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ── 3D SCENE ── */}
      <Scene3D
        showMachines={true}
        machines={displayMachines}
        sections={floorSections}
        isOverview={activeLine === "All Lines"}
        cameraPosition={cameraConfig.pos as any}
        cameraFov={cameraConfig.fov}
        hideLabels={activeLine === "All Lines"}
      />

      {/* ── MATERIAL FLOW OVERLAY ── */}
      {showMaterialFlow && <SewingMaterialFlow />}
    </div>
  );
};
