import React, { useState, useEffect, useMemo, useRef } from "react";
import { Scene3D } from "@/components/3d/Scene3D";
import { MachinePosition, SectionLayout } from "@/types";
import { useLineStore } from "@/store/useLineStore";
import { Edit2, Save, Undo2, Redo2, ChevronDown, Play, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SewingViewProps {
  activeFloor: string;
  activeLine: string;
  activeMachines: MachinePosition[];
  floorSections: SectionLayout[];
  cameraConfig: { pos: number[]; fov: number };
}

export const SewingView: React.FC<SewingViewProps> = ({
  activeFloor,
  activeLine,
  activeMachines: propMachines,
  floorSections,
  cameraConfig,
}) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editTool, setEditTool] = useState<"move" | "rotate" | "delete" | "add">("move");
  const [selectedAddType, setSelectedAddType] = useState("snls");
  const [selectedAddLabel, setSelectedAddLabel] = useState("SNLS");

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
    fetch("http://localhost:4000/api/sewing/get-layout")
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data) && data.length > 0) {
          setLoadedMachines(data);
          const current = useLineStore.getState().machineLayout;
          const otherMachines = current.filter((m: any) =>
            m.section !== "Cuff" && m.section !== "Sleeve" && m.section !== "Back" &&
            m.section !== "Collar" && m.section !== "Front" && !m.section?.includes("Assembly")
          );
          useLineStore.getState().setMachineLayout([...otherMachines, ...data]);
          storeInitRef.current = true;
        }
      })
      .catch(e => console.error("Failed to load sewing layout:", e));
  }, []);

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
    if (isEditMode) {
      const storeMachines = machineLayout.filter((m: any) =>
        m.section === "Cuff" || m.section === "Sleeve" || m.section === "Back" ||
        m.section === "Collar" || m.section === "Front" || m.section?.includes("Assembly")
      );
      return storeMachines.length > 0 ? storeMachines : (loadedMachines || propMachines);
    }
    return loadedMachines || propMachines;
  }, [isEditMode, machineLayout, propMachines, loadedMachines]);

  const handleSave = async () => {
    const sewingMachines = machineLayout.filter((m: any) =>
      m.section === "Cuff" || m.section === "Sleeve" || m.section === "Back" ||
      m.section === "Collar" || m.section === "Front" || m.section?.includes("Assembly")
    );
    try {
      const res = await fetch("http://localhost:4000/api/sewing/save-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sewingMachines),
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Sewing layout saved! (${data.count} machines)`);
      } else {
        alert("❌ Save failed: " + (data.error || "Unknown error"));
      }
    } catch {
      alert("❌ Could not reach server. Make sure the backend is running.");
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden">

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
                <option value="human">Human Operator</option>
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
      />
    </div>
  );
};
