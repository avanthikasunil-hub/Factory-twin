import React, { useMemo, useState, useEffect } from "react";
import { Scene3D } from "@/components/3d/Scene3D";
import { SectionLayout, MachinePosition } from "@/types";
import { useLineStore } from "@/store/useLineStore";
import { Layout, Settings, Edit2, Save, Undo2, Redo2, ChevronDown, Play, CheckCircle, Scissors, Ruler, Layers, Zap, Hash, Archive, Truck, Activity, ArrowRight, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/config";
import { toast } from "sonner";

const FT = 0.3048;
const Z_LENGTH = 500;

/* ───── 1. MATERIAL FLOW COMPONENT ───── */
const CUTTING_FLOW_STEPS = [
  { id: 'issue', label: 'Fabric Issue', icon: <Truck size={14} />, color: '#6366f1' },
  { id: 'relaxation', label: 'Fabric Relaxation', icon: <Activity size={14} />, color: '#818cf8' },
  { id: 'spreading', label: 'Spreading (Auto & Manual)', icon: <Layers size={14} />, color: '#a78bfa' },
  { id: 'marker', label: 'Marker Placement', icon: <Ruler size={14} />, color: '#3b82f6' },
  { id: 'cutting', label: 'Cutting (Auto/Straight/Band)', icon: <Scissors size={14} />, color: '#f43f5e' },
  { id: 'trimming', label: 'Trimming (If required)', icon: <Scissors size={14} />, color: '#fbbf24' },
  { id: 'fusing', label: 'Fusing (If required)', icon: <Zap size={14} />, color: '#f97316' },
  { id: 'bundling', label: 'Bundling & Ticketing', icon: <Hash size={14} />, color: '#ec4899' },
  { id: 'supermarket', label: 'Storage in Supermarket', icon: <Archive size={14} />, color: '#22c55e' },
];

const CuttingMaterialFlow = () => {
  return (
    <div className="absolute top-24 left-6 z-[70] w-72 bg-slate-950/80 backdrop-blur-2xl p-6 rounded-[2rem] border border-white/10 shadow-2xl animate-in fade-in slide-in-from-left-4 overflow-hidden">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-violet-500/20 rounded-xl text-violet-400">
          <ClipboardList size={18} />
        </div>
        <div className="flex flex-col">
          <h3 className="text-[11px] font-black uppercase text-white tracking-[0.2em] leading-none mb-1">Cutting Flow</h3>
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Process Lifecycle</span>
        </div>
      </div>

      <div className="relative space-y-3">
        {/* Connection Line */}
        <div className="absolute left-[15px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-violet-500/50 via-slate-700/30 to-emerald-500/50" />

        {CUTTING_FLOW_STEPS.map((step, idx) => (
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
              <span className="text-[10px] font-black uppercase text-slate-400 group-hover:text-white transition-colors tracking-widest leading-none mb-1">
                Step {idx + 1}
              </span>
              <span className="text-[11px] font-bold text-white/90 group-hover:text-white transition-colors">
                {step.label}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const CuttingView: React.FC = () => {
    const [activeFloor, setActiveFloor] = useState("Floor 1");
    const [isEditMode, setIsEditMode] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [editTool, setEditTool] = useState<"move" | "rotate" | "delete" | "add">("move");
    const [selectedAddType, setSelectedAddType] = useState("gerber");
    const [selectedAddLabel, setSelectedAddLabel] = useState("Gerber Cutter");
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
    } = useLineStore();

    // Dimensions for layout calculation
    const z0_w = 8.18, z0_l = 61.7, gap01 = 4.0;
    const z1_w = 9.7, z1_l = 57.6, gap12 = 2.7;
    const z2_w = 10.0, z2_l = 57.6, gap23 = 3.0;
    const z3_w = 10.0, z3_l = 57.6;

    const maxL = Math.max(z0_l + 4 + 109.0, z1_l + 4 + 109.0, z2_l + 4 + 109.0, z3_l);
    const startX = (Z_LENGTH / 2) - (maxL * FT) - (10 * FT);
    const baseZ = -15 * FT;

    const z0Pos = baseZ;
    const z1Pos = z0Pos + (z0_w * FT / 2) + (gap01 * FT) + (z1_w * FT / 2);
    const z2Pos = z1Pos + (z1_w * FT / 2) + (gap12 * FT) + (z2_w * FT / 2);
    const z3Pos = z2Pos + (z2_w * FT / 2) + (gap23 * FT) + (z3_w * FT / 2);

    const cuttingZones = useMemo((): SectionLayout[] => {
        const arr: SectionLayout[] = [];
        arr.push({ id: 'cutting-z0-storage', name: 'Storage Area', color: '#64748b', position: { x: startX, y: 0, z: z0Pos }, length: (57.12 - 5.4) * FT, width: z0_w * FT } as any);
        arr.push({ id: 'cutting-z0-ext', name: 'Zone 0 Extension', color: '#0ea5e9', position: { x: startX + (57.12 - 2.7) * FT, y: 0, z: z0Pos }, length: (109.0 - (57.12 - 2.7)) * FT, width: z0_w * FT } as any);
        arr.push({ id: 'cutting-z0', name: 'Cutting Zone 0', color: '#0284c7', position: { x: startX + (113 * FT), y: 0, z: z0Pos }, length: z0_l * FT, width: z0_w * FT } as any);
        arr.push({ id: 'cutting-z1-ext', name: 'Zone 1 Extension', color: '#84cc16', position: { x: startX, y: 0, z: z1Pos }, length: 109.0 * FT, width: z1_w * FT } as any);
        arr.push({ id: 'cutting-z1', name: 'Cutting Zone 1', color: '#65a30d', position: { x: startX + (113 * FT), y: 0, z: z1Pos }, length: z1_l * FT, width: z1_w * FT } as any);
        arr.push({ id: 'cutting-z2-ext', name: 'Zone 2 Extension', color: '#f97316', position: { x: startX, y: 0, z: z2Pos }, length: 109.0 * FT, width: z2_w * FT } as any);
        arr.push({ id: 'cutting-z2', name: 'Cutting Zone 2', color: '#ea580c', position: { x: startX + (113 * FT), y: 0, z: z2Pos }, length: z2_l * FT, width: z2_w * FT } as any);
        arr.push({ id: 'cutting-z3', name: 'Cutting Zone 3', color: '#c026d3', position: { x: startX + (113 * FT), y: 0, z: z3Pos }, length: z3_l * FT, width: z3_w * FT } as any);
        arr.push({ id: 'cutting-collar-zone', name: 'Collar Production', color: '#4f46e5', position: { x: startX - (30 * FT), y: 0, z: z3Pos + (5 * FT) }, length: 76 * FT, width: 13.3 * FT } as any);
        return arr;
    }, [startX, z0Pos, z1Pos, z2Pos, z3Pos]);

    const baseCuttingMachines = useMemo((): MachinePosition[] => {
        return [
            ...Array.from({ length: 5 }).map((_, idx) => ({
                id: `storage-fusing-${idx + 1}`,
                operation: { op_no: `STR-0${idx + 1}`, op_name: 'Rotary Fusing', machine_type: 'fusing', smv: 0.5, section: 'Storage Area' },
                position: { x: startX + ((2 + (idx * 4.2)) * FT), y: 0, z: z0Pos - (2 * FT) },
                rotation: { x: 0, y: 0, z: 0 },
                lane: 'A', section: 'Storage Area', tableLength: 3.0, tableWidth: 4.0, tableHeight: 5.0, rotationOffset: Math.PI / 2, rotateOperatorAxis: true, centerModel: true,
            } as any)),
            ...Array.from({ length: 6 }).map((_, idx) => {
                const realIdx = idx + 2;
                return {
                    id: `cutting-fusing-${realIdx + 1}`,
                    operation: { op_no: `CUT-F-${realIdx + 1}`, op_name: 'Special Cutting', machine_type: 'cuttingf_sitting', smv: 0.5, section: 'Storage Area' },
                    position: { x: startX + ((2 + (realIdx * 4.2)) * FT), y: 0, z: z0Pos + (2 * FT) },
                    rotation: { x: 0, y: 0, z: 0 },
                    lane: 'B', section: 'Storage Area', tableLength: 4.0, tableWidth: 2.5, tableHeight: 4.0, rotationOffset: Math.PI / 2, rotateOperatorAxis: true, operatorOnFarSide: true, centerModel: true, modelRotation: Math.PI / 2,
                };
            }) as any,
            { id: 'gerber-1', operation: { op_no: 'CUT-01', op_name: 'Gerber Cutter', machine_type: 'gerber', smv: 0, section: 'Cutting Zone 3' }, position: { x: startX + (113 * FT) + (17.0 * FT / 2) + (1.0 * FT), y: 0, z: z3Pos }, rotation: { x: 0, y: Math.PI, z: 0 }, lane: 'A', section: 'Cutting Zone 3', tableLength: 17.0, tableWidth: 7.1, operatorOnFarSide: true } as any,
            { id: 'gerber-2', operation: { op_no: 'CUT-02', op_name: 'Gerber Cutter', machine_type: 'gerber', smv: 0, section: 'Zone 1 Extension' }, position: { x: startX + (100.5 * FT), y: 0, z: z1Pos }, rotation: { x: 0, y: 0, z: 0 }, lane: 'A', section: 'Zone 1 Extension', tableWidth: 7.1, spreadingLength: 85, operatorOnFarSide: true } as any,
            { id: 'spreader-1', operation: { op_no: 'SPR-01', op_name: 'Auto Spreader', machine_type: 'auto-spreader', smv: 0, section: 'Zone 1 Extension' }, position: { x: startX + (10 * FT), y: 0, z: z1Pos }, rotation: { x: 0, y: 0, z: 0 }, lane: 'A', section: 'Zone 1 Extension', tableWidth: 7.1 } as any,
            { id: 'gerber-3', operation: { op_no: 'TAB-01', op_name: 'Relay Table', machine_type: 'gerber', smv: 0, section: 'Cutting Zone 2' }, position: { x: startX + (100.5 * FT), y: 0, z: z2Pos }, rotation: { x: 0, y: 0, z: 0 }, lane: 'A', section: 'Cutting Zone 2', tableLength: 17.0, tableWidth: 7.1, spreadingLength: 85, tableOnly: true } as any,
            { id: 'gerber-4', operation: { op_no: 'TAB-02', op_name: 'Relay and Pinning', machine_type: 'gerber', smv: 0, section: 'Cutting Zone 2' }, position: { x: startX + (113 * FT) + (17.0 * FT / 2) + (1.0 * FT), y: 0, z: z2Pos }, rotation: { x: 0, y: Math.PI, z: 0 }, lane: 'A', section: 'Cutting Zone 2', tableLength: 17.0, tableWidth: 7.1, spreadingLength: 33.9, tableOnly: true } as any,
            { id: 'gerber-5', operation: { op_no: 'TAB-03', op_name: 'Spreading Table (Medium)', machine_type: 'gerber', smv: 0, section: 'Cutting Zone 1' }, position: { x: startX + (125.6 * FT), y: 0, z: z1Pos }, rotation: { x: 0, y: Math.PI, z: 0 }, lane: 'A', section: 'Cutting Zone 1', tableLength: 17.0, tableWidth: 7.1, spreadingLength: 33.9, tableOnly: true } as any,
            { id: 'gerber-6', operation: { op_no: 'TAB-04', op_name: 'Recutting Table', machine_type: 'gerber', smv: 0, section: 'Cutting Zone 1' }, position: { x: startX + (139.4 * FT), y: 0, z: z1Pos }, rotation: { x: 0, y: Math.PI, z: 0 }, lane: 'A', section: 'Cutting Zone 1', tableLength: 17.0, tableWidth: 7.1, spreadingLength: 11.3, tableOnly: true } as any,
            { id: 'gerber-7', operation: { op_no: 'TAB-05', op_name: 'Relay and Pinning', machine_type: 'gerber', smv: 0, section: 'Cutting Zone 2' }, position: { x: (startX + (113 * FT) + (17.0 * FT / 2) + (1.0 * FT)) - (13.8 * FT), y: 0, z: z2Pos }, rotation: { x: 0, y: Math.PI, z: 0 }, lane: 'A', section: 'Cutting Zone 2', tableLength: 17.0, tableWidth: 7, spreadingLength: 11.3, tableOnly: true } as any,
            { id: 'gerber-8', operation: { op_no: 'TAB-06', op_name: 'Narrow Spreading Table', machine_type: 'gerber', smv: 0, section: 'Cutting Zone 0' }, position: { x: startX + (150.3 * FT), y: 0, z: z0Pos - (1.79 * FT) }, rotation: { x: 0, y: Math.PI, z: 0 }, lane: 'A', section: 'Cutting Zone 0', tableLength: 17.0, tableWidth: 3.2, spreadingLength: 12.2, tableOnly: true } as any,
            { id: 'supermarket-zone0-1', operation: { op_no: 'SM-01', op_name: 'Supermarket', machine_type: 'supermarket', smv: 0, section: 'Cutting Zone 0' }, position: { x: startX + (169.0 * FT), y: 0, z: z0Pos + (3.1 * FT) }, rotation: { x: 0, y: Math.PI, z: 0 }, lane: 'A', section: 'Cutting Zone 0', tableLength: 6.0, tableWidth: 2.0, tableHeight: 7.0 } as any,
            { id: 'supermarket-zone0-2', operation: { op_no: 'SM-02', op_name: 'Supermarket', machine_type: 'supermarket', smv: 0, section: 'Cutting Zone 0' }, position: { x: startX + (174.0 * FT), y: 0, z: z0Pos + (1.6 * FT) }, rotation: { x: 0, y: -Math.PI / 2, z: 0 }, lane: 'A', section: 'Cutting Zone 0', tableLength: 6.0, tableWidth: 2.0, tableHeight: 7.0 } as any,
            { id: 'gerber-9', operation: { op_no: 'TAB-07', op_name: 'Narrow Spreading Table', machine_type: 'gerber', smv: 0, section: 'Cutting Zone 0' }, position: { x: startX + (131.0 * FT), y: 0, z: z0Pos - (1.79 * FT) }, rotation: { x: 0, y: Math.PI, z: 0 }, lane: 'A', section: 'Cutting Zone 0', tableLength: 17.0, tableWidth: 3.2, spreadingLength: 12.2, tableOnly: true } as any,
            { id: 'supermarket-zone0-3', operation: { op_no: 'SM-03', op_name: 'Supermarket', machine_type: 'supermarket', smv: 0, section: 'Cutting Zone 0' }, position: { x: startX + (149.7 * FT), y: 0, z: z0Pos + (3.1 * FT) }, rotation: { x: 0, y: Math.PI, z: 0 }, lane: 'A', section: 'Cutting Zone 0', tableLength: 6.0, tableWidth: 2.0, tableHeight: 7.0 } as any,
            { id: 'supermarket-zone0-4', operation: { op_no: 'SM-04', op_name: 'Supermarket', machine_type: 'supermarket', smv: 0, section: 'Cutting Zone 0' }, position: { x: startX + (154.7 * FT), y: 0, z: z0Pos + (1.6 * FT) }, rotation: { x: 0, y: -Math.PI / 2, z: 0 }, lane: 'A', section: 'Cutting Zone 0', tableLength: 6.0, tableWidth: 2.0, tableHeight: 7.0 } as any,
            ...Array.from({ length: 10 }).map((_, i) => {
                const row = i < 5 ? 0 : 1;
                let col = i < 5 ? 4 - i : 9 - i;
                const isIron = i === 9;
                const tableL = 4.0; const tableW = 2.5; const tableH = 4.0;
                return {
                    id: `mc-zone0-${i}`,
                    operation: { op_no: `MC-${i + 1}`, op_name: isIron ? 'Iron Press' : 'SNLS', machine_type: isIron ? 'iron' : 'snls', smv: 0.5, section: 'Cutting Zone 0' },
                    position: { x: startX + (118 * FT) + (col * tableL * FT), y: 0, z: z0Pos + (row * tableW * FT) - (1.25 * FT) + (isIron ? 2 * FT : 0) },
                    rotation: { x: 0, y: row === 0 ? Math.PI : 0, z: 0 },
                    lane: row === 0 ? 'B' : 'A', section: 'Cutting Zone 0', tableWidth: tableW, tableLength: tableL, tableHeight: tableH, hideIronBox: isIron ? true : false,
                } as any;
            }),
            { id: 'gerber-11', operation: { op_no: 'TAB-09', op_name: 'Narrow Spreading Table', machine_type: 'gerber', smv: 0, section: 'Zone 0 Extension' }, position: { x: startX + (84.52 * FT), y: 0, z: z0Pos - (1.79 * FT) }, rotation: { x: 0, y: Math.PI, z: 0 }, lane: 'A', section: 'Zone 0 Extension', tableLength: 17.0, tableWidth: 3.2, spreadingLength: 12.2, tableOnly: true } as any,
            { id: 'supermarket-zone0-5', operation: { op_no: 'SM-05', op_name: 'Supermarket', machine_type: 'supermarket', smv: 0, section: 'Zone 0 Extension' }, position: { x: startX + (103.22 * FT), y: 0, z: z0Pos + (3.1 * FT) }, rotation: { x: 0, y: Math.PI, z: 0 }, lane: 'A', section: 'Zone 0 Extension', tableLength: 6.0, tableWidth: 2.0, tableHeight: 7.0 } as any,
            { id: 'supermarket-zone0-6', operation: { op_no: 'SM-06', op_name: 'Supermarket', machine_type: 'supermarket', smv: 0, section: 'Zone 0 Extension' }, position: { x: startX + (108.22 * FT), y: 0, z: z0Pos + (1.6 * FT) }, rotation: { x: 0, y: -Math.PI / 2, z: 0 }, lane: 'A', section: 'Zone 0 Extension', tableLength: 6.0, tableWidth: 2.0, tableHeight: 7.0 } as any,
            { id: 'gerber-12', operation: { op_no: 'TAB-10', op_name: 'Narrow Spreading Table', machine_type: 'gerber', smv: 0, section: 'Zone 0 Extension' }, position: { x: startX + (65.82 * FT), y: 0, z: z0Pos - (1.79 * FT) }, rotation: { x: 0, y: Math.PI, z: 0 }, lane: 'A', section: 'Zone 0 Extension', tableLength: 17.0, tableWidth: 3.2, spreadingLength: 12.2, tableOnly: true } as any,
            { id: 'supermarket-zone0-7', operation: { op_no: 'SM-07', op_name: 'Supermarket', machine_type: 'supermarket', smv: 0, section: 'Zone 0 Extension' }, position: { x: startX + (84.52 * FT), y: 0, z: z0Pos + (3.1 * FT) }, rotation: { x: 0, y: Math.PI, z: 0 }, lane: 'A', section: 'Zone 0 Extension', tableLength: 6.0, tableWidth: 2.0, tableHeight: 7.0 } as any,
            { id: 'supermarket-zone0-8', operation: { op_no: 'SM-08', op_name: 'Supermarket', machine_type: 'supermarket', smv: 0, section: 'Zone 0 Extension' }, position: { x: startX + (89.52 * FT), y: 0, z: z0Pos + (1.6 * FT) }, rotation: { x: 0, y: -Math.PI / 2, z: 0 }, lane: 'A', section: 'Zone 0 Extension', tableLength: 6.0, tableWidth: 2.0, tableHeight: 7.0 } as any,
            { id: 'gerber-13', operation: { op_no: 'TAB-11', op_name: 'Narrow Spreading Table', machine_type: 'gerber', smv: 0, section: 'Zone 0 Extension' }, position: { x: startX + (47.72 * FT), y: 0, z: z0Pos - (1.79 * FT) }, rotation: { x: 0, y: Math.PI, z: 0 }, lane: 'A', section: 'Zone 0 Extension', tableLength: 17.0, tableWidth: 3.2, spreadingLength: 12.2, tableOnly: true } as any,
            { id: 'supermarket-zone0-9', operation: { op_no: 'SM-09', op_name: 'Supermarket', machine_type: 'supermarket', smv: 0, section: 'Zone 0 Extension' }, position: { x: startX + (66.42 * FT), y: 0, z: z0Pos + (3.1 * FT) }, rotation: { x: 0, y: Math.PI, z: 0 }, lane: 'A', section: 'Zone 0 Extension', tableLength: 6.0, tableWidth: 2.0, tableHeight: 7.0 } as any,
            { id: 'supermarket-zone0-10', operation: { op_no: 'SM-10', op_name: 'Supermarket', machine_type: 'supermarket', smv: 0, section: 'Zone 0 Extension' }, position: { x: startX + (71.42 * FT), y: 0, z: z0Pos + (1.6 * FT) }, rotation: { x: 0, y: -Math.PI / 2, z: 0 }, lane: 'A', section: 'Zone 0 Extension', tableLength: 6.0, tableWidth: 2.0, tableHeight: 7.0 } as any,
            { id: 'bandknife-2', operation: { op_no: 'BK-02', op_name: 'Bandknife', machine_type: 'bandknife', smv: 0, section: 'Cutting Zone 3' }, position: { x: startX + (113 * FT) - (6.7 * FT), y: 0, z: z3Pos + (4.47 * FT) }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, lane: 'A', section: 'Cutting Zone 3', centerModel: true } as any,
            { id: 'bandknife-3', operation: { op_no: 'BK-03', op_name: 'Bandknife', machine_type: 'bandknife', smv: 0, section: 'Cutting Zone 3' }, position: { x: startX + (113 * FT) - (13.2 * FT), y: 0, z: z3Pos + (4.47 * FT) }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, lane: 'A', section: 'Cutting Zone 3', centerModel: true } as any,
            { id: 'bandknife-4', operation: { op_no: 'BK-04', op_name: 'Bandknife', machine_type: 'bandknife', smv: 0, section: 'Cutting Zone 3' }, position: { x: startX + (113 * FT) - (19.7 * FT), y: 0, z: z3Pos + (4.47 * FT) }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, lane: 'A', section: 'Cutting Zone 3', centerModel: true } as any,
            { id: 'bandknife-5', operation: { op_no: 'BK-05', op_name: 'Bandknife', machine_type: 'bandknife', smv: 0, section: 'Cutting Zone 3' }, position: { x: startX + (113 * FT) - (26.2 * FT), y: 0, z: z3Pos + (4.47 * FT) }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, lane: 'A', section: 'Cutting Zone 3', centerModel: true } as any,
            { id: 'spreading-table-1', operation: { op_no: 'SPT-01', op_name: 'Recutting Table', machine_type: 'gerber', section: 'Cutting Zone 3' }, tableOnly: true, tableLength: 17, tableWidth: 10, spreadingLength: 17, position: { x: startX + (113 * FT) - (21.96 * FT), y: 0, z: z3Pos + (4.47 * FT) }, rotation: { x: 0, y: 0, z: 0 }, lane: 'A', section: 'Cutting Zone 3', centerModel: true } as any,
            { id: 'fusing-custom-1', operation: { op_no: 'FM-01', op_name: 'Custom Fusing Machine', machine_type: 'fusing_custom', section: 'Cutting Zone 3' }, tableLength: 24.4, tableWidth: 5.7, tableHeight: 5, position: { x: startX + (113 * FT) - (89.66 * FT), y: 0, z: z3Pos + (4.47 * FT) }, rotation: { x: 0, y: 0, z: 0 }, lane: 'A', section: 'Cutting Zone 3', centerModel: true, tableOnly: true } as any,
            { id: 'fusing-custom-2', operation: { op_no: 'FM-02', op_name: 'Custom Fusing Machine', machine_type: 'fusing_custom', section: 'Cutting Zone 3' }, tableLength: 24.4, tableWidth: 5.7, tableHeight: 5, position: { x: startX + (113 * FT) - (89.66 * FT) - (24.4 * FT) - (7 * FT), y: 0, z: z3Pos + (4.47 * FT) }, rotation: { x: 0, y: 0, z: 0 }, lane: 'A', section: 'Cutting Zone 3', centerModel: true, tableOnly: true } as any,
            { id: 'straight-knife-1', operation: { op_no: 'KNIFE-01', op_name: 'Straight Knife', machine_type: 'straightknife', smv: 0.5, section: 'Cutting Zone 2' }, position: { x: startX + (85 * FT), y: 5.5 * FT, z: z2Pos }, rotation: { x: 0, y: 0, z: 0 }, lane: 'A', section: 'Cutting Zone 2', tableLength: 1.0, tableWidth: 1.0, tableHeight: 2.0, centerModel: true, hideZone: true } as any,
            { id: 'manual-spreader-1', operation: { op_no: 'MSPR-01', op_name: 'Manual Spreader', machine_type: 'manual-spreader', smv: 0, section: 'Cutting Zone 1' }, position: { x: startX + (165 * FT), y: 0, z: z1Pos }, rotation: { x: 0, y: 0, z: 0 }, lane: 'A', section: 'Cutting Zone 1', tableWidth: 7.1, fabricLength: 25, fabricColor: '#1e3a8a' } as any,
            { id: 'manual-spreader-2', operation: { op_no: 'MSPR-02', op_name: 'Manual Spreader', machine_type: 'manual-spreader', smv: 0, section: 'Cutting Zone 2' }, position: { x: startX + (90 * FT), y: 0, z: z2Pos }, rotation: { x: 0, y: Math.PI, z: 0 }, lane: 'A', section: 'Cutting Zone 2', tableWidth: 7.1, fabricLength: 25, fabricColor: '#991b1b' } as any,
            ...[3.50, 8.88, 14.41, 20.47, 26.61, 32.22, 37.89, 43.11, 48.40, 53.70].map((x, i) => ({
                id: `cutting-pillar-gap-z0z1-${i}`,
                operation: { op_no: `C-PIL-${i}`, op_name: 'Pillar', machine_type: 'pillar-1', smv: 0, section: 'Cutting Zone 0' },
                position: { x: startX + x - (14 * FT), y: 0, z: z0Pos + 6.09 * FT },
                rotation: { x: 0, y: 0, z: 0 },
                lane: 'A', section: 'Cutting Zone 0', centerModel: true
            } as any))
        ];
    }, [startX, z0Pos, z1Pos, z2Pos, z3Pos]);

    // Filter machines that belong to the cutting zone sections
    const displayMachines = useMemo(() => {
        const sections = [
            'Cutting Zone 0', 'Cutting Zone 1', 'Cutting Zone 2', 'Cutting Zone 3',
            'Zone 0 Extension', 'Zone 1 Extension', 'Zone 2 Extension',
            'Storage Area', 'Collar Production'
        ];

        return machineLayout.filter(m =>
            sections.includes(m.section as string) ||
            sections.includes(m.operation?.section as string) ||
            m.id.startsWith('gerber-') ||
            m.id.startsWith('mc-zone0-') ||
            m.id.startsWith('storage-fusing-') ||
            m.id.startsWith('manual-spreader-') ||
            m.id.startsWith('cutting-fusing-') ||
            m.id.startsWith('straight-knife-') ||
            m.id.startsWith('human-') ||
            m.id.startsWith('op-') ||
            m.operation?.machine_type === 'human'
        );
    }, [machineLayout]);

    const [serverLayoutLoaded, setServerLayoutLoaded] = useState(false);

    // ── ON MOUNT: Load layout from Firestore ──
    useEffect(() => {
        const fetchLayout = async () => {
            try {
                const { db } = await import("@/firebase");
                const { doc, getDoc } = await import("firebase/firestore");
                const layoutRef = doc(db, "modifiedLayouts", "CUTTING");
                const layoutSnap = await getDoc(layoutRef);

                if (layoutSnap.exists()) {
                    const data = layoutSnap.data();
                    const savedLayout = data.machineLayout || [];
                    
                    if (savedLayout.length > 0) {
                        // FORCE RESET TO FIX SPACING: Ignore saved layout's absolute coordinates temporarily.
                        // The user can re-save the layout from the UI to store the new correct coordinates.
                        setMachineLayout([...baseCuttingMachines]);
                    } else {
                        setMachineLayout([...baseCuttingMachines]);
                    }
                } else {
                    setMachineLayout([...baseCuttingMachines]);
                }
            } catch (err) {
                console.error("Error loading cutting layout from Firestore:", err);
                setMachineLayout([...baseCuttingMachines]);
            } finally {
                setServerLayoutLoaded(true);
            }
        };
        fetchLayout();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-save removed: layout is only saved when the user explicitly clicks Save.


    return (
        <div className="relative w-full h-full flex flex-col overflow-hidden bg-background">
            {/* SAVE SUCCESS BANNER */}
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
            <div className="w-full bg-slate-950/80 backdrop-blur-3xl border-b border-white/5 flex flex-col z-[60] shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
                <div className="h-14 px-8 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center text-white shadow-lg shadow-violet-600/30"><Layout size={18} /></div>
                            <div className="flex flex-col">
                                <h1 className="text-xs font-black uppercase tracking-[0.2em] text-white">Cutting Department</h1>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Intelligence Hub • Floor Command</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 px-4 py-1.5 bg-white/5 rounded-full border border-white/5"><div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" /><span className="text-[10px] font-black uppercase tracking-widest text-violet-400/80">System Live</span></div>
                        <button className="p-2 hover:bg-white/5 rounded-xl text-muted-foreground hover:text-white border border-transparent hover:border-white/10"><Settings size={18} /></button>
                    </div>
                </div>
                <div className="h-16 px-8 flex items-center justify-between bg-white/[0.02]">
                    <div className="flex items-center gap-10">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase text-violet-400 tracking-widest mb-1.5 opacity-80">Floor Level</span>
                            <div className="flex items-center gap-1.5">
                                {["Floor 1"].map(f => (
                                    <button key={f} onClick={() => setActiveFloor(f)} className={cn("px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all", activeFloor === f ? "bg-violet-600 text-white shadow-xl shadow-violet-600/20 scale-105" : "bg-white/5 text-muted-foreground hover:bg-white/10 border border-white/5")}>{f}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isEditMode && (
                            <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded-xl border border-white/5 mr-1 animate-in slide-in-from-right-4 fade-in">
                                <div className="flex items-center gap-1 px-2 border-r border-white/10 mr-1">
                                    <button onClick={undo} disabled={!canUndo} className={cn("p-1.5 rounded-lg transition-all", canUndo ? "text-white hover:bg-white/10" : "text-white/20 cursor-not-allowed")}><Undo2 size={12} /></button>
                                    <button onClick={redo} disabled={!canRedo} className={cn("p-1.5 rounded-lg transition-all", canRedo ? "text-white hover:bg-white/10" : "text-white/20 cursor-not-allowed")}><Redo2 size={12} /></button>
                                </div>
                                {[{ id: 'add', icon: <Play className="rotate-270" size={12} />, label: 'Add' }, { id: 'move', icon: <Edit2 size={12} />, label: 'Move' }, { id: 'rotate', icon: <Play className="rotate-90" size={12} />, label: 'Rotate' }, { id: 'delete', icon: <CheckCircle className="text-red-500" size={12} />, label: 'Del' }].map((tool: any) => (
                                    <button key={tool.id} onClick={() => { setEditTool(tool.id); setMoveMode(tool.id === 'move'); setRotateMode(tool.id === 'rotate'); setDeleteMode(tool.id === 'delete'); }} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all", editTool === tool.id ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20" : "text-muted-foreground hover:bg-white/5")}>{tool.icon}{tool.label}</button>
                                ))}
                            </div>
                        )}
                        <button 
                            onClick={() => setIsEditMode(!isEditMode)} 
                            className={cn("flex items-center gap-2 px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl", isEditMode ? "bg-amber-600 text-white shadow-amber-600/30" : "bg-white/10 text-white hover:bg-violet-600 border border-white/5")}
                        >
                            <Edit2 size={14} />{isEditMode ? "Exit" : "Modify Layout"}
                        </button>

                        <button
                          onClick={() => setShowMaterialFlow(!showMaterialFlow)}
                          className={cn(
                            "flex items-center gap-2 px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl border",
                            showMaterialFlow ? "bg-violet-600 text-white border-violet-500 shadow-violet-600/30" : "bg-white/10 text-white hover:bg-violet-600 border-white/5"
                          )}
                        >
                          <Activity size={14} />
                          Material Flow
                        </button>
                        
                        {isEditMode && (
                            <button 
                                onClick={async () => {
                                    const cuttingMachines = machineLayout.filter(m =>
                                        m.id.startsWith('gerber-') ||
                                        m.id.startsWith('mc-zone0-') ||
                                        m.id.startsWith('bandknife-') ||
                                        m.id.startsWith('spreading-table-') ||
                                        m.id.startsWith('fusing-custom-') ||
                                        m.id.startsWith('straight-knife-') ||
                                        m.id.startsWith('manual-spreader-') ||
                                        m.id.startsWith('supermarket-zone') ||
                                        m.id.startsWith('storage-fusing-') ||
                                        m.id.startsWith('cutting-fusing-') ||
                                        m.id.startsWith('human-') ||
                                        m.id.startsWith('op-') ||
                                        (m.section && m.section.toLowerCase().includes('cutting')) ||
                                        (m.operation?.section && m.operation.section.toLowerCase().includes('cutting'))
                                    );
                                    try {
                                        await useLineStore.getState().syncDigitalTwinLayout("CUTTING", cuttingMachines);
                                        setIsSaved(true);
                                        setTimeout(() => setIsSaved(false), 3000);
                                        toast.success("✅ Cutting layout saved!");
                                    } catch (err) {
                                        toast.error("❌ Save failed: " + err);
                                    }
                                }}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white shadow-2xl shadow-emerald-600/30 hover:bg-emerald-500 transition-colors text-[10px] font-black uppercase tracking-widest"
                                title="Save Layout Permanently"
                            >
                                <Save size={14} /> Save
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex-1 w-full h-full relative">
                {/* FLOATING STATUS/DONE OVERLAY */}
                {(isEditMode && (editTool === 'move' || editTool === 'rotate' || editTool === 'delete')) && (
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-4 bg-slate-950/90 backdrop-blur-2xl px-6 py-3 rounded-2xl border border-violet-500/30 shadow-2xl animate-in slide-in-from-top-4">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase text-violet-400 tracking-widest leading-none mb-1">
                                {editTool === 'move' ? 'Moving' : editTool === 'rotate' ? 'Rotating' : 'Deleting'} Units
                            </span>
                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none">
                                {selectedMachines.length > 0 
                                    ? `${selectedMachines.length} Selected: ${machineLayout.find(m => m.id === selectedMachines[0])?.operation?.op_name || 'Unit'}`
                                    : 'Select a machine to begin'}
                            </span>
                        </div>
                        <button 
                            onClick={() => {
                                setEditTool(null);
                                setMoveMode(false);
                                setRotateMode(false);
                                setDeleteMode(false);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                            Done
                        </button>
                    </div>
                )}

                {(isEditMode && editTool === 'add') && (
                    <div className="absolute top-6 left-6 z-[70] w-72 glass-card p-4 rounded-3xl border border-violet-500/30 animate-in fade-in slide-in-from-left-4 backdrop-blur-3xl shadow-2xl bg-slate-950/80">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center text-[10px] text-white"><Play className="rotate-270" size={12} /></div>
                                <h3 className="text-[10px] font-black uppercase text-violet-400 tracking-[0.2em]">Add Cutting Unit</h3>
                            </div>
                            <button 
                                onClick={() => setEditTool(null)}
                                className="text-muted-foreground hover:text-white text-[10px] font-bold uppercase"
                            >
                                Done
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div className="flex flex-col gap-1"><span className="text-[8px] font-bold text-muted-foreground ml-1 uppercase tracking-widest">Select Equipment</span>
                                <div className="relative group">
                                    <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold text-white appearance-none focus:outline-none focus:border-violet-500/50 transition-colors cursor-pointer" value={selectedAddType} onChange={(e) => { setSelectedAddType(e.target.value); setSelectedAddLabel(e.target.options[e.target.selectedIndex].text); }}>
                                        <option value="gerber">Gerber Cutter</option>
                                        <option value="recutting_table">Recutting Table (11.3x7.1ft)</option>
                                        <option value="recutting_table_big">Recutting Table Large (17x10ft)</option>
                                        <option value="spreading_table_medium">Spreading Table Medium (33.9x7.1ft)</option>
                                        <option value="narrow_spreading">Narrow Spreading Table (12.2x3.2ft)</option>
                                        <option value="relay_table">Relay Table (85x7.1ft)</option>
                                        <option value="relay_pinning">Relay &amp; Pinning Table (11.3x7.1ft)</option>
                                        <option value="fusing_custom">Custom Fusing Machine (24.4x5.7ft)</option>
                                        <option value="fusing">Rotary Fusing</option>
                                        <option value="auto-spreader">Auto Spreader</option>
                                        <option value="manual-spreader">Manual Spreader</option>
                                        <option value="straightknife">Straight Knife</option>
                                        <option value="human">Standing Worker</option>
                                        <option value="sitting-human">Sitting Worker</option>
                                        <option value="bandknife">Bandknife</option>
                                        <option value="snls">SNLS Sewing Machine</option>
                                        <option value="iron">Iron Press</option>
                                        <option value="supermarket">Supermarket Rack</option>
                                        <option value="pillar-1">Pillar 1 (2.5x1.7ft)</option>
                                        <option value="pillar-2">Pillar 2 (1.7x3.5ft)</option>
                                    </select><ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                </div>
                            </div>
                            <button onClick={() => { if (placingMachine) { setPlacingMachine(null); return; } setPlacingMachine({ type: selectedAddType, section: 'Cutting Zone 3', opName: selectedAddLabel }); }} className={cn("w-full py-3 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-[0.98]", placingMachine ? "bg-amber-600 shadow-amber-600/20" : "bg-violet-600 shadow-violet-600/20")}>{placingMachine ? "Cancel Placement" : "Place Equipment"}</button>
                        </div>
                    </div>
                )}

                {(isEditMode && editTool === 'move') && (
                    <div className="absolute top-6 left-6 z-[70] w-72 glass-card p-5 rounded-3xl border border-violet-500/30 animate-in fade-in slide-in-from-left-4 backdrop-blur-3xl shadow-2xl bg-slate-950/80">
                        <div className="flex items-center gap-2 mb-4"><div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center text-[10px] text-white"><Edit2 size={12} /></div><h3 className="text-[10px] font-black uppercase text-violet-400 tracking-[0.2em]">Move Industrial Units</h3></div>
                        <div className="flex flex-col gap-2">
                            <div className="px-3 py-3 bg-white/5 text-muted-foreground rounded-xl text-[10px] font-black uppercase tracking-widest text-center border border-white/5">
                                {selectedMachines.length > 0
                                    ? `Moving: ${machineLayout.find(m => m.id === selectedMachines[0])?.operation?.op_name || 'Selected Unit'}${selectedMachines.length > 1 ? ` + ${selectedMachines.length - 1} more` : ''}`
                                    : 'Select Machines to Move'}
                            </div>
                            {selectedMachines.length > 0 && (
                                <button onClick={() => useLineStore.getState().setSelectedMachine(null)} className="w-full py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600/30 transition-all">Done / Deselect</button>
                            )}
                        </div>
                    </div>
                )}

                {(isEditMode && editTool === 'rotate') && (
                    <div className="absolute top-6 left-6 z-[70] w-72 glass-card p-5 rounded-3xl border border-violet-500/30 animate-in fade-in slide-in-from-left-4 backdrop-blur-3xl shadow-2xl bg-slate-950/80">
                        <div className="flex items-center gap-2 mb-4"><div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center text-[10px] text-white"><Play className="rotate-90" size={12} /></div><h3 className="text-[10px] font-black uppercase text-violet-400 tracking-[0.2em]">Rotate Equipment</h3></div>
                        <div className="flex flex-col gap-3">
                            <div className="px-3 py-2 bg-white/5 text-muted-foreground rounded-xl text-[9px] font-black uppercase tracking-widest text-center">
                                {selectedMachines.length > 0
                                    ? `Rotate: ${machineLayout.find(m => m.id === selectedMachines[0])?.operation?.op_name || 'Selected'}`
                                    : 'Select Machine'}
                            </div>
                            <button onClick={() => rotateSelectedMachines(Math.PI / 2)} disabled={selectedMachines.length === 0} className={cn("w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-[0.98]", selectedMachines.length > 0 ? "bg-violet-600 text-white shadow-violet-600/20" : "bg-white/5 text-muted-foreground")}>Rotate 90°</button>
                            {selectedMachines.length > 0 && (
                                <button onClick={() => useLineStore.getState().setSelectedMachine(null)} className="w-full py-2 text-muted-foreground text-[8px] font-black uppercase tracking-widest hover:text-white transition-all">Done</button>
                            )}
                        </div>
                    </div>
                )}

                {(isEditMode && editTool === 'delete') && (
                    <div className="absolute top-6 left-6 z-[70] w-72 glass-card p-5 rounded-3xl border border-red-500/30 animate-in fade-in slide-in-from-left-4 backdrop-blur-3xl shadow-2xl bg-slate-950/80">
                        <div className="flex items-center gap-2 mb-4"><div className="w-6 h-6 rounded-lg bg-red-600 flex items-center justify-center text-[10px] text-white"><CheckCircle size={12} /></div><h3 className="text-[10px] font-black uppercase text-red-400 tracking-[0.2em]">Delete Equipment</h3></div>
                        <div className="flex flex-col gap-3">
                            <div className="px-3 py-2 bg-red-500/5 text-red-400/80 rounded-xl text-[9px] font-black uppercase tracking-widest text-center border border-red-500/10">
                                {selectedMachines.length > 0
                                    ? `Delete: ${machineLayout.find(m => m.id === selectedMachines[0])?.operation?.op_name || 'Selection'}`
                                    : 'Select Machine'}
                            </div>
                            <button onClick={deleteSelectedMachines} disabled={selectedMachines.length === 0} className={cn("w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-[0.98]", selectedMachines.length > 0 ? "bg-red-600 text-white shadow-red-600/20" : "bg-white/5 text-muted-foreground")}>Confirm Delete</button>
                        </div>
                    </div>
                )}
                {/* ── MATERIAL FLOW OVERLAY ── */}
                {showMaterialFlow && <CuttingMaterialFlow />}

                <Scene3D showMachines={true} machines={displayMachines} sections={cuttingZones} cameraPosition={[110, 100, 50]} target={[startX + (maxL * FT) / 2, 0, (z0Pos + z3Pos) / 2]} isOverview={true} hideLabels={true} />
            </div>
        </div>
    );
};
