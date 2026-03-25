import React, { useMemo, useState, useEffect } from "react";
import { Scene3D } from "@/components/3d/Scene3D";
import { getLayoutSpecs, LANE_Z_CENTER_AB, LANE_Z_CENTER_CD } from "@/utils/layoutGenerator";
import { SectionLayout, MachinePosition } from "@/types";
import { GarmentConveyor } from "@/components/3d/GarmentConveyor";
import { Layout, Filter, Settings, ChevronDown, Edit2, Save, Play, CheckCircle, Search, Bell, Undo2, Redo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLineStore } from "@/store/useLineStore";

interface FinishingViewProps {
  activeFloor: string;
  activeLine: string;
  cameraConfig: { pos: number[]; fov: number };
  lineColors: string[];
  onFloorChange?: (floor: string) => void;
  onLineChange?: (line: string) => void;
}

export const FinishingView: React.FC<FinishingViewProps> = ({ 
    activeFloor: propFloor, 
    activeLine: propLine, 
    cameraConfig, 
    lineColors,
    onFloorChange,
    onLineChange
}) => {
  const [activeFloor, setActiveFloor] = useState(propFloor);
  const [activeLine, setActiveLine] = useState(propLine);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedAddType, setSelectedAddType] = useState("Iron");
  const [selectedAddLabel, setSelectedAddLabel] = useState("Ironing M/C");

  const { 
    machineLayout, 
    setMachineLayout, 
    setPlacingMachine, 
    placingMachine,
    isMoveMode,
    setMoveMode,
    isDeleteMode,
    setDeleteMode,
    isRotateMode,
    setRotateMode,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedMachines,
    deleteSelectedMachines,
    rotateSelectedMachines,
    isDraggingActive,
    setDraggingActive,
    isMoveGizmoVisible,
    setMoveGizmoVisible
  } = useLineStore();

  useEffect(() => { setActiveFloor(propFloor); }, [propFloor]);
  useEffect(() => { setActiveLine(propLine); }, [propLine]);

  const numLines = activeFloor === "Floor 1" ? 6 : 3;
  const { specs } = getLayoutSpecs("Line 1");
  const zStep = (LANE_Z_CENTER_CD + specs.widthCD / 2 - (LANE_Z_CENTER_AB - specs.widthAB / 2)) + 3.7;

  const lines = useMemo(() => {
    const list = ["All Lines"];
    for (let i = 0; i < numLines; i++) {
        const lineNum = activeFloor === "Floor 1" ? i + 1 : i + 7;
        list.push(`Line ${lineNum}`);
    }
    return list;
  }, [activeFloor, numLines]);

  const conveyors = useMemo(() => {
    const arr: any[] = [];
    const PALETTE = ["#bae6fd", "#fef9c3", "#bbf7d0", "#e9d5ff", "#ffedd5", "#fef3c7"]; 
    for (let i = 0; i < numLines; i++) {
        const lineNum = activeFloor === "Floor 1" ? i + 1 : i + 7;
        const lineVal = `Line ${lineNum}`;
        if (activeLine !== "All Lines" && lineVal !== activeLine) continue;

        const zo = i * zStep;
        const centerZ = ((LANE_Z_CENTER_AB + LANE_Z_CENTER_CD) / 2 + zo) + 1.3;
        const machineX = 55.0;

        arr.push({
            id: `conveyor-l${lineNum}`,
            position: [machineX + 6.0, 0, centerZ - 0.85],
            shirtColor: PALETTE[i % PALETTE.length], // Unique color per line
            pattern: "none"
        });
    }
    return arr;
  }, [activeFloor, activeLine, numLines, zStep]);

  const finishingSections = useMemo((): SectionLayout[] => {
    const arr: SectionLayout[] = [];
    const FT = 0.3048;
    const FL = 45.17 * FT;
    const FW = 22.63 * FT;

    for (let i = 0; i < numLines; i++) {
      const lineNum = activeFloor === "Floor 1" ? i + 1 : i + 7;
      const lineVal = `Line ${lineNum}`;
      if (activeLine !== "All Lines" && lineVal !== activeLine) continue;

      const color = lineColors[(activeFloor === "Floor 1" ? i : i + 6) % lineColors.length];
      const zo = i * zStep;

      arr.push({
        id: `finishing-section-${lineNum}`,
        name: `${lineVal} - Finishing`,
        color,
        position: { x: 55.0, y: 0, z: zo },
        length: FL, 
        width: FW 
      } as any);
    }
    return arr;
  }, [activeFloor, activeLine, lineColors, numLines, zStep]);

  const finishingMachines = useMemo((): MachinePosition[] => {
    const arr: MachinePosition[] = [];

    for (let i = 0; i < numLines; i++) {
        const lineNum = activeFloor === "Floor 1" ? i + 1 : i + 7;
        const lineVal = `Line ${lineNum}`;
        if (activeLine !== "All Lines" && lineVal !== activeLine) continue;

        const zo = i * zStep;
        const machineX = 55.0;
        const centerZ = ((LANE_Z_CENTER_AB + LANE_Z_CENTER_CD) / 2 + zo) + 1.3;

        for (let j = 0; j < 5; j++) {
            arr.push({
                id: `finishing-folding-l${lineNum}-${j}`,
                operation: { op_no: `F-FOLD-${j}`, op_name: 'Folding M/C', machine_type: 'Folding', smv: 0.5, section: 'Finishing' },
                position: { x: machineX + 0.6 + (j * 1.1), z: centerZ - 2.2, y: 0 },
                rotation: { x: 0, y: -Math.PI / 2, z: 0 },
                lane: 'A', section: 'Finishing', machineIndex: j, centerModel: true
            } as any);

            if (j === 4) {
                const smX = machineX + 13.0; 
                arr.push({
                    id: `finishing-supermarket-l${lineNum}`,
                    operation: { op_no: `F-SM-1`, op_name: 'Supermarket', machine_type: 'Supermarket', smv: 1.0, section: 'Finishing' },
                    position: { x: smX, z: centerZ - 1.8, y: 0 },
                    rotation: { x: 0, y: -Math.PI / 2, z: 0 },
                    lane: 'B', section: 'Finishing', centerModel: true
                } as any);

                const tableFrontX = machineX + 6.2; 
                 for (let k = 0; k < 2; k++) {
                    const isPressing = k === 0;
                    const opName = isPressing ? 'Presentation Pressing' : 'Checking Table';
                    // ALL PRESSING STATIONS AUTOMATICALLY GET THE IRON + TABLE ACCESSORY
                    const needsIron = opName.includes("Pressing") || opName.includes("Ironing");

                    arr.push({
                        id: `finishing-helper-l${lineNum}-${k}`,
                        operation: { 
                            op_no: `F-HELP-${k}`, 
                            op_name: opName, 
                            machine_type: 'Helper Table', 
                            smv: 0.2, 
                            section: 'Finishing' 
                        },
                        position: { x: tableFrontX + (k * 1.4), z: centerZ - 2.2, y: 0 },
                        rotation: { x: 0, y: 0, z: 0 },
                        lane: 'B', section: 'Finishing', centerModel: true,
                        showIronBox: needsIron 
                    } as any);
                }

                arr.push({
                    id: `finishing-checking-l${lineNum}`,
                    operation: { op_no: `F-CHECK-1`, op_name: 'Tag Attaching Area', machine_type: 'Checking', smv: 0.4, section: 'Finishing' },
                    position: { x: tableFrontX + 3.1, z: centerZ - 2.2, y: 0 },
                    rotation: { x: 0, y: 0, z: 0 },
                    modelRotation: Math.PI * 1.5, lane: 'B', section: 'Finishing', centerModel: true
                } as any);

                arr.push({
                    id: `finishing-helper-l${lineNum}-final`,
                    operation: { op_no: `F-HELP-FINAL`, op_name: 'Packing', machine_type: 'Helper Table', smv: 0.1, section: 'Finishing' },
                    position: { x: tableFrontX + 5.0, z: centerZ - 2.2, y: 0 },
                    rotation: { x: 0, y: 0, z: 0 }, // Same orientation
                    lane: 'B', section: 'Finishing', centerModel: true
                } as any);

                for (let n = 1; n <= 4; n++) {
                    const isThirdRow = n > 2;
                    const colIndex = n > 2 ? n - 3 : n - 1;
                    const rowZ = n > 2 ? centerZ + 3.2 : centerZ + 0.8;
                    arr.push({
                        id: `finishing-out-insp-l${lineNum}-${n}`,
                        operation: { op_no: `F-OUT-${n}`, op_name: 'Outside Checking', machine_type: 'outinspection', smv: 0.6, section: 'Finishing' },
                        position: { x: machineX + 0.5 + (colIndex * 1.1), z: rowZ, y: 0 },
                        rotation: { x: 0, y: Math.PI, z: 0 },
                        lane: 'B', section: 'Finishing', centerModel: true
                    } as any);
                }

                for (let n = 1; n < 3; n++) {
                    let zPos = n === 1 ? centerZ + 0.8 : centerZ + 3.2;
                    let xPos = n === 1 ? machineX + 3.2 : machineX + 3.3;
                    arr.push({
                        id: `finishing-inspect-l${lineNum}-${n}`,
                        operation: { op_no: `F-INSP-${n}`, op_name: 'EOL Inspection', machine_type: 'Inspection', smv: 0.5, section: 'Finishing' },
                        position: { x: xPos, z: zPos, y: 0 },
                        rotation: { x: 0, y: n === 1 ? -Math.PI / 2 : 0, z: 0 },
                        lane: 'B', section: 'Finishing', centerModel: true
                    } as any);
                }

                arr.push({
                    id: `finishing-thread-l${lineNum}`,
                    operation: { op_no: `F-THRD-1`, op_name: 'Suction Cleaning', machine_type: 'thread', smv: 0.2, section: 'Finishing' },
                    position: { x: machineX + 4.6, z: centerZ + 3.2, y: 0 },
                    rotation: { x: 0, y: 0, z: 0 },
                    lane: 'B', section: 'Finishing', centerModel: true
                } as any);

                for (let n = 1; n <= 2; n++) {
                    arr.push({
                        id: `finishing-iron-l${lineNum}-extra-${n}`,
                        operation: { op_no: `F-IRON-EXTRA-${n}`, op_name: 'Collar Pressing', machine_type: 'Iron', smv: 0.3, section: 'Finishing' },
                        position: { x: machineX + 5.7 + ((n - 1) * 1.2), z: centerZ + 3.2, y: 0 },
                        rotation: { x: 0, y: 0, z: 0 },
                        lane: 'B', section: 'Finishing', centerModel: true
                    } as any);
                }

                for (let n = 1; n <= 2; n++) {
                    arr.push({
                        id: `finishing-mc-l${lineNum}-extra-${n}`,
                        operation: { op_no: `F-FIN-EXTRA-${n}`, op_name: 'Buttoning', machine_type: 'finishing', smv: 0.5, section: 'Finishing' },
                        position: { x: machineX + (n === 1 ? 8.1 : 9.1), z: centerZ + 3.2, y: 0 },
                        rotation: { x: 0, y: 0, z: 0 },
                        lane: 'B', section: 'Finishing', centerModel: true
                    } as any);
                }

                arr.push({
                    id: `finishing-cabin-l${lineNum}`,
                    operation: { op_no: `F-CABIN`, op_name: 'Supervisor Cabin', machine_type: 'Cabin', smv: 0, section: 'Finishing' },
                    position: { x: machineX + 11.0, z: centerZ + 2.9, y: 0 }, 
                    rotation: { x: 0, y: 0, z: 0 },
                    lane: 'B', section: 'Finishing', centerModel: true
                } as any);

                arr.push({
                    id: `finishing-spotwash-l${lineNum}`,
                    operation: { op_no: `F-SWASH`, op_name: 'Spot Wash', machine_type: 'spotwash', smv: 0.5, section: 'Finishing' },
                    position: { x: machineX + 10.8, z: centerZ + 2.9, y: 0 }, 
                    rotation: { x: 0, y: -Math.PI / 2, z: 0 },
                    lane: 'B', section: 'Finishing', centerModel: true
                } as any);

                const macpiX = machineX + 8.5;
                arr.push({
                    id: `finishing-macpi-l${lineNum}`,
                    operation: { op_no: `F-MAC-1`, op_name: 'Body Press M/C', machine_type: 'Macpi', smv: 0.4, section: 'Finishing' },
                    position: { x: macpiX, z: centerZ + 0.5, y: 0 },
                    rotation: { x: 0, y: 0, z: 0 },
                    lane: 'B', section: 'Finishing', centerModel: true
                } as any);

                for (let n = 0; n < 3; n++) {
                    arr.push({
                        id: `finishing-iron-l${lineNum}-${n}`,
                        operation: { op_no: `F-IRON-${n}`, op_name: 'Ironing M/C', machine_type: 'Iron', smv: 0.3, section: 'Finishing' },
                        position: { x: machineX + 4.5 + (n * 1.2), z: centerZ + 0.5, y: 0 },
                        rotation: { x: 0, y: -Math.PI / 2, z: 0 },
                        lane: 'B', section: 'Finishing', centerModel: true
                    } as any);
                }
            }
        }
    }
    return arr;
  }, [activeFloor, activeLine, numLines, zStep]);

  const [editTool, setEditTool] = useState<"move" | "rotate" | "delete" | "add">("move");

  const displayMachines = useMemo(() => {
    // If the store already has finishing machines for this view, use them
    const storeFinishing = machineLayout.filter(m => m.section === 'Finishing');
    if (storeFinishing.length > 0) return storeFinishing;
    return finishingMachines;
  }, [machineLayout, finishingMachines]);

  // Sync store with default finishing machines when entering edit mode if empty
  useEffect(() => {
    if (isEditMode && machineLayout.filter(m => m.section === 'Finishing').length === 0) {
        setMachineLayout([...machineLayout, ...finishingMachines]);
    }
  }, [isEditMode, finishingMachines, setMachineLayout]); // eslint-disable-line react-hooks/exhaustive-deps

  const finalCamera = useMemo(() => {
    if (activeLine === "All Lines") return { pos: cameraConfig.pos, fov: cameraConfig.fov };
    // Zoom in for individual lines
    return {
        pos: [cameraConfig.pos[0] + 5, cameraConfig.pos[1] - 8, cameraConfig.pos[2]],
        fov: cameraConfig.fov - 12
    };
  }, [activeLine, cameraConfig]);

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-background">
        {/* VIOLET COMMAND HEADER */}
        <div className="w-full bg-slate-950/80 backdrop-blur-3xl border-b border-white/5 flex flex-col z-[60] shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
            {/* Top Bar: Branding & Status */}
            <div className="h-14 px-8 flex items-center justify-between border-b border-white/5">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center text-white shadow-lg shadow-violet-600/30">
                            <Layout size={18} />
                        </div>
                        <div className="flex flex-col">
                            <h1 className="text-xs font-black uppercase tracking-[0.2em] text-white">Finishing Department</h1>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Intelligence Hub • Floor Command</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 px-4 py-1.5 bg-white/5 rounded-full border border-white/5">
                        <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-violet-400/80">System Live</span>
                    </div>
                    <button className="p-2 hover:bg-white/5 rounded-xl transition-colors text-muted-foreground hover:text-white border border-transparent hover:border-white/10"><Settings size={18} /></button>
                </div>
            </div>

            {/* Bottom Bar: Layout Control Center */}
            <div className="h-16 px-8 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-10">
                    {/* Floor Level Group */}
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase text-violet-400 tracking-widest mb-1.5 opacity-80">Floor Level</span>
                        <div className="flex items-center gap-1.5">
                            {["Floor 1", "Floor 2"].map(f => (
                                <button 
                                    key={f}
                                    onClick={() => { setActiveFloor(f); onFloorChange?.(f); }}
                                    className={cn(
                                        "px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all",
                                        activeFloor === f 
                                            ? "bg-violet-600 text-white shadow-xl shadow-violet-600/20 scale-105" 
                                            : "bg-white/5 text-muted-foreground hover:bg-white/10 border border-white/5"
                                    )}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="w-px h-10 bg-white/5" />

                    {/* Line Filter Group */}
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase text-violet-400 tracking-widest mb-1.5 opacity-80">Line Filter</span>
                        <div className="relative group min-w-[180px]">
                            <div className="flex items-center justify-between gap-4 px-5 py-2.5 bg-white/5 border border-white/5 rounded-xl group-hover:border-violet-400/40 transition-all cursor-pointer">
                                <span className="text-xs font-black text-white">{activeLine}</span>
                                <ChevronDown size={14} className="text-muted-foreground group-hover:text-violet-400 transition-colors" />
                            </div>
                            <select 
                                className="absolute inset-0 opacity-0 cursor-pointer w-full"
                                value={activeLine}
                                onChange={(e) => { setActiveLine(e.target.value); onLineChange?.(e.target.value); }}
                            >
                                {lines.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {isEditMode && (
                        <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded-xl border border-white/5 mr-1 animate-in slide-in-from-right-4 fade-in">
                            <div className="flex items-center gap-1 px-2 border-r border-white/10 mr-1">
                                <button 
                                    onClick={undo} 
                                    disabled={!canUndo}
                                    className={cn(
                                        "p-1.5 rounded-lg transition-all",
                                        canUndo ? "text-white hover:bg-white/10" : "text-white/20 cursor-not-allowed"
                                    )}
                                >
                                    <Undo2 size={12} />
                                </button>
                                <button 
                                    onClick={redo} 
                                    disabled={!canRedo}
                                    className={cn(
                                        "p-1.5 rounded-lg transition-all",
                                        canRedo ? "text-white hover:bg-white/10" : "text-white/20 cursor-not-allowed"
                                    )}
                                >
                                    <Redo2 size={12} />
                                </button>
                            </div>
                            {[
                                { id: 'add', icon: <Play className="rotate-270" size={12} />, label: 'Add' },
                                { id: 'move', icon: <Edit2 size={12} />, label: 'Move' },
                                { id: 'rotate', icon: <Play className="rotate-90" size={12} />, label: 'Rotate' },
                                { id: 'delete', icon: <CheckCircle className="text-red-500" size={12} />, label: 'Del' }
                            ].map((tool: any) => (
                                <button
                                    key={tool.id}
                                    onClick={() => {
                                        setEditTool(tool.id);
                                        // Synchronize with store
                                        setMoveMode(tool.id === 'move');
                                        setRotateMode(tool.id === 'rotate');
                                        setDeleteMode(tool.id === 'delete');
                                    }}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                                        editTool === tool.id ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20" : "text-muted-foreground hover:bg-white/5"
                                    )}
                                >
                                    {tool.icon}
                                    {tool.label}
                                </button>
                            ))}
                        </div>
                    )}
                    <button 
                        onClick={() => setIsEditMode(!isEditMode)}
                        className={cn(
                            "flex items-center gap-2 px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all transform active:scale-95 shadow-xl",
                            isEditMode 
                                ? "bg-amber-600 text-white shadow-amber-600/30" 
                                : "bg-white/10 text-white hover:bg-violet-600 hover:shadow-violet-600/30 border border-white/5"
                        )}
                    >
                        <Edit2 size={14} />
                        {isEditMode ? "Exit" : "Modify Layout"}
                    </button>
                    {isEditMode && (
                        <button className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-600 text-white shadow-2xl shadow-emerald-600/30 animate-in fade-in zoom-in-75 hover:bg-emerald-500 transition-colors">
                            <Save size={16} />
                        </button>
                    )}
                </div>
            </div>
        </div>

        <div className="flex-1 w-full h-full relative">
            {/* ADD MACHINE SELECTOR OVERLAY - FULL DROPDOWN VERSION */}
            {(isEditMode && editTool === 'add') && (
                <div className="absolute top-6 left-6 z-[70] w-72 glass-card p-4 rounded-3xl border border-violet-500/30 animate-in fade-in slide-in-from-left-4 backdrop-blur-3xl shadow-2xl bg-slate-950/80">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center text-[10px] text-white">
                            <Play className="rotate-270" size={12} />
                        </div>
                        <h3 className="text-[10px] font-black uppercase text-violet-400 tracking-[0.2em]">Add Production Unit</h3>
                    </div>
                    
                    <div className="space-y-3">
                        
                        <div className="flex flex-col gap-1">
                            <span className="text-[8px] font-bold text-muted-foreground ml-1 uppercase tracking-widest">Select Equipment Category</span>
                            <div className="relative group">
                                <select 
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold text-white appearance-none focus:outline-none focus:border-violet-500/50 transition-colors cursor-pointer"
                                    value={selectedAddType}
                                    onChange={(e) => {
                                        setSelectedAddType(e.target.value);
                                        setSelectedAddLabel(e.target.options[e.target.selectedIndex].text);
                                    }}
                                >
                                    <optgroup label="Industrial Machines" className="bg-slate-900">
                                        <option value="Iron">Ironing M/C</option>
                                        <option value="Iron">Collar Pressing</option>
                                        <option value="Macpi">Body Press M/C</option>
                                        <option value="Folding">Folding M/C</option>
                                        <option value="finishing">Buttoning</option>
                                        <option value="spotwash">Spot Wash</option>
                                        <option value="Thread">Thread Sucking</option>
                                        <option value="Inspection">EOL Inspection</option>
                                    </optgroup>
                                    <optgroup label="Production Infrastructure" className="bg-slate-900">
                                        <option value="Supermarket">Supermarket Rack</option>
                                        <option value="Helper Table">Presentation Pressing</option>
                                        <option value="Helper Table">Checking Table</option>
                                        <option value="Checking">Tag Attaching Area</option>
                                        <option value="Helper Table">Packing Station</option>
                                    </optgroup>
                                </select>
                                <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => {
                                    if (placingMachine) {
                                        setPlacingMachine(null);
                                        return;
                                    }
                                    
                                    setPlacingMachine({ 
                                        type: selectedAddType, 
                                        section: 'Finishing', 
                                        opName: selectedAddLabel
                                    });
                                }}
                                className={cn(
                                    "flex-1 py-3 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-[0.98]",
                                    placingMachine 
                                        ? "bg-amber-600 hover:bg-amber-500 shadow-amber-600/20" 
                                        : "bg-violet-600 hover:bg-violet-500 shadow-violet-600/20"
                                )}
                            >
                                {placingMachine ? "Cancel Placement" : "Place Equipment"}
                            </button>
                            {!placingMachine && (
                                <button 
                                    onClick={() => {
                                        setEditTool('move');
                                        setMoveMode(true);
                                        setRotateMode(false);
                                        setDeleteMode(false);
                                    }}
                                    className="px-4 py-3 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
                                >
                                    Done
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MOVE MACHINE OVERLAY */}
            {(isEditMode && editTool === 'move') && (
                <div className="absolute top-6 left-6 z-[70] w-72 glass-card p-5 rounded-3xl border border-violet-500/30 animate-in fade-in slide-in-from-left-4 backdrop-blur-3xl shadow-2xl bg-slate-950/80">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center text-[10px] text-white">
                            <Edit2 size={12} />
                        </div>
                        <h3 className="text-[10px] font-black uppercase text-violet-400 tracking-[0.2em]">Move Production Units</h3>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                             <div className="flex-1 px-3 py-3 bg-white/5 text-muted-foreground rounded-xl text-[10px] font-black uppercase tracking-widest text-center border border-white/5">
                                {selectedMachines.length > 0 ? `Selected (${selectedMachines.length})` : 'Move Select'}
                            </div>

                            {selectedMachines.length > 0 && (
                                <button 
                                    onClick={() => setMoveGizmoVisible(true)}
                                    className={cn(
                                        "flex-1 py-3 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-[0.98]",
                                        isMoveGizmoVisible 
                                            ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20" 
                                            : "bg-violet-600 hover:bg-violet-500 shadow-violet-600/20"
                                    )}
                                >
                                    {isMoveGizmoVisible ? "Moving Ready" : "Move"}
                                </button>
                            )}

                            <button 
                                onClick={() => {
                                    setIsEditMode(false);
                                    setEditTool('move');
                                    setMoveMode(true);
                                    setRotateMode(false);
                                    setDeleteMode(false);
                                    setDraggingActive(false);
                                    setMoveGizmoVisible(false);
                                }}
                                className="px-4 py-3 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ROTATE MACHINE OVERLAY */}
            {(isEditMode && editTool === 'rotate') && (
                <div className="absolute top-6 left-6 z-[70] w-72 glass-card p-5 rounded-3xl border border-violet-500/30 animate-in fade-in slide-in-from-left-4 backdrop-blur-3xl shadow-2xl bg-slate-950/80">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center text-[10px] text-white">
                            <Play className="rotate-90" size={12} />
                        </div>
                        <h3 className="text-[10px] font-black uppercase text-violet-400 tracking-[0.2em]">Rotate Production Units</h3>
                    </div>
                    
                    <div className="space-y-4">

                        <div className="flex items-center gap-2">
                             {selectedMachines.length > 0 ? (
                                <button 
                                    onClick={() => rotateSelectedMachines(Math.PI / 2)}
                                    className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-violet-600/20 active:scale-[0.98]"
                                >
                                    Rotate 90° ({selectedMachines.length})
                                </button>
                            ) : (
                                <div className="flex-1 py-3 bg-white/5 text-muted-foreground rounded-xl text-[10px] font-black uppercase tracking-widest text-center border border-white/5">
                                    Select Units
                                </div>
                            )}
                            <button 
                                onClick={() => {
                                    setEditTool('move');
                                    setMoveMode(true);
                                    setRotateMode(false);
                                    setDeleteMode(false);
                                }}
                                className="px-4 py-3 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* DELETE MACHINE OVERLAY */}
            {(isEditMode && editTool === 'delete') && (
                <div className="absolute top-6 left-6 z-[70] w-72 glass-card p-5 rounded-3xl border border-red-500/30 animate-in fade-in slide-in-from-left-4 backdrop-blur-3xl shadow-2xl bg-slate-950/80">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-6 h-6 rounded-lg bg-red-600 flex items-center justify-center text-[10px] text-white">
                            <CheckCircle size={12} />
                        </div>
                        <h3 className="text-[10px] font-black uppercase text-red-400 tracking-[0.2em]">Delete Production Units</h3>
                    </div>
                    
                    <div className="space-y-4">

                        <div className="flex items-center gap-2">
                             {selectedMachines.length > 0 ? (
                                <button 
                                    onClick={deleteSelectedMachines}
                                    className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-red-600/20 active:scale-[0.98]"
                                >
                                    Delete {selectedMachines.length} Unit{selectedMachines.length > 1 ? 's' : ''}
                                </button>
                            ) : (
                                <div className="flex-1 py-3 bg-white/5 text-muted-foreground rounded-xl text-[10px] font-black uppercase tracking-widest text-center border border-white/5">
                                    Select Units
                                </div>
                            )}
                            <button 
                                onClick={() => {
                                    setEditTool('move');
                                    setMoveMode(true);
                                    setRotateMode(false);
                                    setDeleteMode(false);
                                }}
                                className="px-4 py-3 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <Scene3D
                key={"finishing" + activeFloor + activeLine}
                showMachines={true}
                machines={displayMachines}
                sections={finishingSections}
                isOverview={activeLine === "All Lines"}
                cameraPosition={finalCamera.pos as any}
                cameraFov={finalCamera.fov}
            >
                {conveyors.map((c: any) => (
                    <GarmentConveyor 
                    key={c.id} 
                    position={c.position} 
                    railLength={12}
                    shirtColor={c.shirtColor} 
                    pattern={c.pattern} 
                    />
                ))}
            </Scene3D>
            
        </div>
    </div>
  );
};
