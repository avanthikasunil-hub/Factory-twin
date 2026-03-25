import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from 'uuid';
import type { LineData, Operation, MachinePosition, SectionLayout } from "@/types";
import {
  generateLayout,
  getMachineZoneDims,
  getNextValidX,
  ZONES_AB,
  ZONES_CD,
  LANE_Z_A,
  LANE_Z_B,
  LANE_Z_C,
  LANE_Z_D,
  FIXED_ASSEMBLY_START,
  PART_BOUNDS,
  LAYOUT_LOGIC_VERSION,
  getLayoutSpecs,
  LANE_Z_CENTER_AB,
  LANE_Z_CENTER_CD,
  findOverflowSection
} from "@/utils/layoutGenerator";
import { calculateMachineRequirements } from '@/utils/lineBalancing';
import { toast } from 'sonner';
import { API_BASE_URL } from '../config';

interface LineStore {
  savedLines: LineData[];
  currentLine: LineData | null;

  machineLayout: MachinePosition[];
  sectionLayout: SectionLayout[];
  operations: Operation[];
  preparatoryOps: Operation[];

  selectedMachines: string[];
  selectedMachine: MachinePosition | null;

  createLine: (
    lineNo: string,
    styleNo: string,
    coneNo: string,
    buyer: string,
    operations: Operation[],
    efficiency?: number,
    targetOutput?: number,
    totalSMV?: number,
    workingHours?: number,
    sourceSheet?: string,
    preparatoryOps?: Operation[]
  ) => LineData;

  saveLine: (line: LineData) => void;
  loadLine: (id: string) => void;
  deleteLine: (id: string) => void;

  setOperations: (operations: Operation[]) => void;
  setPreparatoryOps: (ops: Operation[]) => void;
  generateMachineLayout: (operations: Operation[]) => void;

  targetOutput: number;
  workingHours: number;
  efficiency: number;

  setLineParameters: (targetOutput: number, workingHours: number, efficiency: number) => void;

  setSelectedMachine: (machine: MachinePosition | null) => void;
  toggleMachineSelection: (machineId: string) => void;

  visibleSection: string | null;
  setVisibleSection: (section: string | null) => void;

  layoutLogicVersion: number;
  setLayoutLogicVersion: (version: number) => void;

  deleteMachine: (machineId: string) => void;
  rotateMachine: (machineId: string) => void;
  updateMachinePosition: (machineId: string, position: { x: number, y: number, z: number }) => void;
  updateMachinesPositions: (machineIds: string[]) => void;
  moveSelectedMachines: (deltaX: number, deltaZ: number) => void;
  addMachine: (machineType: string, section: string, opName: string) => void;
  deleteSelectedMachines: () => void;
  rotateSelectedMachines: (angleRad: number) => void;

  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  past: any[];
  future: any[];
  isMoveMode: boolean;
  setMoveMode: (mode: boolean) => void;
  isDeleteMode: boolean;
  setDeleteMode: (mode: boolean) => void;
  isRotateMode: boolean;
  setRotateMode: (mode: boolean) => void;
  isDraggingActive: boolean;
  setDraggingActive: (active: boolean) => void;
  preDragLayout: Record<string, { x: number; y: number; z: number }> | null;
  layoutError: string | null;
  clearLayoutError: () => void;
  warnings: string[];
  clearWarnings: () => void;
  layoutAlerts: { id: string; type: 'green' | 'red'; message: string }[];
  dismissLayoutAlert: (id: string) => void;
  checkLayoutAlerts: () => void;
  updateLineWithNewOB: (newOperations: Operation[], sourceSheet?: string, preparatoryOps?: Operation[]) => void;
  resetLine: () => void;
  setMachineLayout: (layout: MachinePosition[]) => void;
  fetchAndApplyOB: (lineNo: string, styleNo: string, conNo: string) => Promise<void>;
  globalOverflow: boolean;
  setGlobalOverflow: (overflow: boolean) => void;
  
  isMoveGizmoVisible: boolean;
  setMoveGizmoVisible: (visible: boolean) => void;
  placingMachine: { type: string; section: string; opName: string } | null;
  setPlacingMachine: (machine: { type: string; section: string; opName: string } | null) => void;
}

const FT = 0.3048;

const getSpatialInfo = (x: number, z: number, lineNo?: string, currentSection?: string) => {
  const isAB = z < -3;
  let section = "Cuff";
  let lane: 'A' | 'B' | 'C' | 'D' = 'A';

  const specs = getLayoutSpecs(lineNo);
  const s = specs.sections as any;

  if (isAB) lane = (z < LANE_Z_CENTER_AB) ? 'B' : 'A';
  else lane = (z < LANE_Z_CENTER_CD) ? 'D' : 'C';

  if (currentSection && currentSection.toLowerCase().includes('overflow')) {
    const isSectAB = ['cuff', 'sleeve', 'back'].some(s => currentSection.toLowerCase().includes(s));
    if (isSectAB === isAB) return { section: currentSection, lane };
  }

  const assemblyStart = s.assemblyAB?.start || 114.0719 * FT;

  if (x >= assemblyStart) {
    if (lane === 'B') section = "Assembly 1";
    else if (lane === 'A') section = "Assembly 2";
    else if (lane === 'D') section = "Assembly 3";
    else if (lane === 'C') section = "Assembly 4";
    else section = "Assembly 1";
  } else if (isAB) {
    if (x < (s.cuff.end + s.sleeve.start) / 2) section = "Cuff";
    else if (x < (s.sleeve.end + s.back.start) / 2) section = "Sleeve";
    else section = "Back";
  } else {
    if (x < (s.collar.end + s.front.start) / 2) section = "Collar";
    else section = "Front";
  }

  return { section, lane };
};

export const useLineStore = create<LineStore>()(persist((set, get) => ({

  savedLines: [],
  currentLine: null,
  machineLayout: [],
  sectionLayout: [],
  operations: [],
  selectedMachines: [],
  selectedMachine: null,
  targetOutput: 1200,
  workingHours: 9,
  visibleSection: null,
  preparatoryOps: [],
  setVisibleSection: (section) => set({ visibleSection: section }),
  layoutLogicVersion: 0,
  setLayoutLogicVersion: (v) => set({ layoutLogicVersion: v }),
  efficiency: 90,
  past: [] as any[],
  future: [] as any[],
  canUndo: false,
  canRedo: false,
  isMoveMode: false,
  isDeleteMode: false,
  isRotateMode: false,
  setMoveMode: (mode) => set({ 
    isMoveMode: mode, 
    isDeleteMode: mode ? false : get().isDeleteMode, 
    isRotateMode: mode ? false : get().isRotateMode,
    isDraggingActive: false, 
    isMoveGizmoVisible: false,
    selectedMachines: [], 
    selectedMachine: null 
  }),
  setDeleteMode: (mode) => set({ 
    isDeleteMode: mode, 
    isMoveMode: mode ? false : get().isMoveMode, 
    isRotateMode: mode ? false : get().isRotateMode,
    isMoveGizmoVisible: false,
    selectedMachines: [], 
    selectedMachine: null 
  }),
  setRotateMode: (mode) => set({ 
    isRotateMode: mode, 
    isMoveMode: mode ? false : get().isMoveMode, 
    isDeleteMode: mode ? false : get().isDeleteMode,
    isMoveGizmoVisible: false,
    selectedMachines: [], 
    selectedMachine: null 
  }),
  isDraggingActive: false,
  preDragLayout: null,
  setDraggingActive: (active) => {
    if (active) {
      (get() as any).takeSnapshot();
      const snapshot: Record<string, { x: number; y: number; z: number }> = {};
      get().machineLayout.forEach(m => { snapshot[m.id] = { ...m.position }; });
      set({ isDraggingActive: true, preDragLayout: snapshot });
    } else {
      set({ isDraggingActive: false, preDragLayout: null });
    }
  },
  layoutError: null,
  clearLayoutError: () => set({ layoutError: null }),
  warnings: [],
  globalOverflow: false,
  setGlobalOverflow: (overflow) => set({ globalOverflow: overflow }),
  clearWarnings: () => set({ warnings: [] }),
  isMoveGizmoVisible: false,
  setMoveGizmoVisible: (visible) => set({ isMoveGizmoVisible: visible }),
  placingMachine: null,
  setPlacingMachine: (machine) => set({ placingMachine: machine }),

  // ─── Alerts: start empty, only populated by checkLayoutAlerts after a drag ───
  layoutAlerts: [],
  dismissLayoutAlert: (id: string) =>
    set((state: any) => ({ layoutAlerts: state.layoutAlerts.filter((a: any) => a.id !== id) })),

  setMachineLayout: (layout: MachinePosition[]) => set({ machineLayout: layout }),
  setPreparatoryOps: (ops: Operation[]) => set({ preparatoryOps: ops }),

  resetLine: () => set({
    currentLine: null,
    machineLayout: [],
    sectionLayout: [],
    operations: [],
    preparatoryOps: [],
    selectedMachine: null,
    selectedMachines: [],
    warnings: [],
    layoutAlerts: [],   // ← clear alerts on reset
    layoutError: null,
  }),

  takeSnapshot: () => {
    const state = get();
    const snapshot = {
      machineLayout: JSON.parse(JSON.stringify(state.machineLayout)),
      sectionLayout: JSON.parse(JSON.stringify(state.sectionLayout)),
      operations: JSON.parse(JSON.stringify(state.operations)),
      targetOutput: state.targetOutput,
      workingHours: state.workingHours,
      efficiency: state.efficiency,
    };
    const newPast = [...state.past, snapshot].slice(-50);
    set({ past: newPast, future: [], canUndo: true, canRedo: false });
  },

  undo: () => {
    const { past, future, machineLayout, sectionLayout, operations, targetOutput, workingHours, efficiency } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    const currentSnapshot = { machineLayout, sectionLayout, operations, targetOutput, workingHours, efficiency };
    const newFuture = [currentSnapshot, ...future].slice(0, 50);
    // Clear alerts when undoing a drag — the old layout was valid
    set({ ...previous, past: newPast, future: newFuture, canUndo: newPast.length > 0, canRedo: true, selectedMachine: null, layoutAlerts: [] });
  },

  redo: () => {
    const { past, future, machineLayout, sectionLayout, operations, targetOutput, workingHours, efficiency } = get();
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    const currentSnapshot = { machineLayout, sectionLayout, operations, targetOutput, workingHours, efficiency };
    const newPast = [...past, currentSnapshot].slice(-50);
    // Re-check after redo since the redone state might have had a violation
    set({ ...next, past: newPast, future: newFuture, canUndo: true, canRedo: newFuture.length > 0, selectedMachine: null });
    // Re-evaluate alerts for the restored state
    setTimeout(() => (get() as any).checkLayoutAlerts(), 0);
  },

  // ─── setLineParameters: layout regeneration — clear stale alerts, do NOT re-check ───
  setLineParameters: (targetOutput, workingHours, efficiency) => {
    (get() as any).takeSnapshot();
    const state = get();
    const currentOps = state.operations;

    const lineNo = state.currentLine?.lineNo || "Line 1";
    const { machines, sections, warnings } = generateLayout(currentOps, targetOutput, workingHours, efficiency, lineNo);

    const currentLine = state.currentLine;
    const updatedLine = currentLine ? {
      ...currentLine,
      targetOutput,
      workingHours,
      efficiency,
      machineLayout: machines,
      sectionLayout: sections
    } : null;

    set({
      targetOutput,
      workingHours,
      efficiency,
      currentLine: updatedLine,
      machineLayout: machines,
      sectionLayout: sections,
      selectedMachine: null,
      selectedMachines: [],
      warnings: warnings || [],
      layoutAlerts: [],   // ← clear — will be re-evaluated
    });
    // Re-evaluate alerts for the new state
    setTimeout(() => (get() as any).checkLayoutAlerts(), 0);
  },

  // ─── generateMachineLayout: clear stale alerts, do NOT re-check ───
  generateMachineLayout: (operations) => {
    (get() as any).takeSnapshot();
    const { targetOutput, workingHours, efficiency, currentLine } = get();
    const lineNo = currentLine?.lineNo || "Line 1";
    const { machines, sections, warnings } = generateLayout(operations, targetOutput, workingHours, efficiency, lineNo);

    set({
      machineLayout: machines,
      sectionLayout: sections,
      warnings: warnings || [],
      layoutAlerts: [],   // ← clear — will be re-evaluated
    });
    // Re-evaluate alerts for the new state
    setTimeout(() => (get() as any).checkLayoutAlerts(), 0);
  },

  setOperations: (operations) => {
    (get() as any).takeSnapshot();
    get().generateMachineLayout(operations);
    set({ operations, selectedMachine: null });
  },

  // ─── createLine: clear alerts — brand new layout ───
  createLine: (lineNo, styleNo, coneNo, buyer, operations, efficiency = 90, inputTargetOutput = 1200, inputTotalSMV?: number, inputWorkingHours = 9, sourceSheet = "", preparatoryOps = []) => {
    (get() as any).takeSnapshot();
    const targetOutput = inputTargetOutput;
    const workingHours = inputWorkingHours;
    const { machines, sections, warnings } = generateLayout(operations, targetOutput, workingHours, efficiency, lineNo);

    const calculatedTotal = operations.reduce((sum, op) => sum + op.smv, 0);
    const totalSMV = inputTotalSMV || calculatedTotal;

    const line: LineData = {
      id: uuidv4(), lineNo, styleNo, coneNo, buyer, operations, preparatoryOps,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      machineLayout: machines, sectionLayout: sections, totalSMV,
      targetOutput, workingHours, efficiency, sourceSheet
    };

    set({
      machineLayout: machines,
      sectionLayout: sections,
      operations,
      preparatoryOps,
      currentLine: line,
      selectedMachine: null,
      targetOutput,
      workingHours,
      efficiency,
      layoutAlerts: [],   // ← clear on create
    });

    return line;
  },

  // ─── updateLineWithNewOB: clear alerts — regenerated from scratch ───
  updateLineWithNewOB: (newOperations: Operation[], sourceSheet = "", preparatoryOpsParam?: Operation[]) => {
    (get() as any).takeSnapshot();
    const state = get();
    const preparatoryOpsToUse = preparatoryOpsParam ?? state.preparatoryOps;
    const { targetOutput, workingHours, efficiency, currentLine } = state;

    set({
      operations: [],
      machineLayout: [],
      sectionLayout: [],
      selectedMachine: null,
      selectedMachines: [],
      warnings: [],
      currentLine: null,
      preparatoryOps: preparatoryOpsToUse,
      layoutAlerts: [],   // ← clear — will be re-evaluated
    });

    if (newOperations.length === 0) return;

    const lineNo = currentLine?.lineNo || "Line 1";
    const { machines, sections, warnings } = generateLayout(
      newOperations,
      targetOutput,
      workingHours,
      efficiency,
      lineNo
    );

    const newTotalSMV = newOperations.reduce((sum, op) => sum + op.smv, 0);

    set({
      operations: newOperations,
      machineLayout: machines,
      sectionLayout: sections,
      warnings: warnings || [],
      layoutAlerts: [],   // ← keep clear after generation
      currentLine: currentLine
        ? {
          ...currentLine,
          operations: newOperations,
          preparatoryOps: preparatoryOpsToUse,
          machineLayout: machines,
          sectionLayout: sections,
          totalSMV: newTotalSMV,
          sourceSheet,
          updatedAt: new Date().toISOString(),
        }
        : null,
    });
    // Re-evaluate alerts for the new state
    setTimeout(() => (get() as any).checkLayoutAlerts(), 0);

    toast.success(`Layout updated from new OB (${sourceSheet || "default sheet"})`);
  },

  saveLine: (line) => {
    (get() as any).takeSnapshot();
    set((state) => {
      const existingIdx = state.savedLines.findIndex((l) => l.id === line.id);
      let newSavedLines = [...state.savedLines];
      const updatedLine = { ...line, updatedAt: new Date().toISOString() };
      if (existingIdx !== -1) {
        newSavedLines[existingIdx] = updatedLine;
      } else {
        newSavedLines.push(updatedLine);
      }
      return {
        savedLines: newSavedLines,
        currentLine: updatedLine,
        operations: updatedLine.operations,
        machineLayout: updatedLine.machineLayout,
        sectionLayout: updatedLine.sectionLayout || []
        // NOTE: intentionally NOT clearing layoutAlerts here — a saved line
        // retains its current alert state.
      };
    });
  },

  // ─── loadLine: clear alerts — loaded layout is considered clean ───
  loadLine: (id) => {
    (get() as any).takeSnapshot();
    const line = get().savedLines.find((l) => l.id === id) || null;
    if (!line) return;
    set({
      currentLine: line,
      operations: line.operations,
      preparatoryOps: line.preparatoryOps || [],
      machineLayout: line.machineLayout,
      sectionLayout: line.sectionLayout || [],
      targetOutput: line.targetOutput || 1200,
      workingHours: line.workingHours || 9,
      efficiency: line.efficiency || 90,
      selectedMachine: null,
      selectedMachines: [],
      warnings: [],
      layoutAlerts: [],   // ← clear — will be re-evaluated
      layoutError: null
    });
    // Re-evaluate alerts for the new state
    setTimeout(() => (get() as any).checkLayoutAlerts(), 0);
  },

  deleteLine: (id) => set((state) => ({ savedLines: state.savedLines.filter((l) => l.id !== id) })),

  setSelectedMachine: (machine) => set({ selectedMachine: machine, selectedMachines: machine ? [machine.id] : [] }),

  toggleMachineSelection: (machineId) => set((state) => {
    const isAlreadySelected = state.selectedMachines.includes(machineId);
    const newSelection = isAlreadySelected
      ? state.selectedMachines.filter(id => id !== machineId)
      : [...state.selectedMachines, machineId];
    const lastId = newSelection.length > 0 ? newSelection[newSelection.length - 1] : null;
    const lastMachine = lastId ? state.machineLayout.find(m => m.id === lastId) : null;
    return { selectedMachines: newSelection, selectedMachine: lastMachine || null, isDraggingActive: false };
  }),

  rotateMachine: (machineId) => {
    (get() as any).takeSnapshot();
    set((state) => {
      const idx = state.machineLayout.findIndex((m) => m.id === machineId);
      if (idx === -1) return { machineLayout: state.machineLayout };
      const m = state.machineLayout[idx];
      const newRotY = m.rotation.y + Math.PI / 2;
      const dims = getMachineZoneDims(m.operation.machine_type);

      const getHumanMaxZ = (mType: string, rotY: number) => {
        const isRot = Math.abs(rotY % Math.PI) > 0.1;
        const opOffsetZ = isRot ? -0.25 : 0;
        const moveZ = Math.cos(rotY) * opOffsetZ;
        const extraLocZ = mType.toLowerCase().includes('inspection') ? 0.45 : 0;
        const isStanding = mType.toLowerCase().includes('inspection') ||
          mType.toLowerCase().includes('iron') || mType.toLowerCase().includes('press') ||
          mType.toLowerCase().includes('fusing') || mType.toLowerCase().includes('rotary') ||
          mType.toLowerCase().includes('helper') || mType.toLowerCase().includes('table');
        const baseHumanDepth = isStanding ? 0.55 : 0.65;
        return moveZ + extraLocZ + baseHumanDepth;
      };

      const computeFootprint = (mType: string, dims: any, rotY: number) => {
        const humanZ = getHumanMaxZ(mType, rotY);
        const maxLocalZ = Math.max(dims.width / 2, humanZ);
        const minLocalZ = -dims.width / 2;
        const minLocalX = -dims.length / 2;
        const maxLocalX = dims.length / 2;
        const corners = [
          { x: minLocalX, z: minLocalZ }, { x: maxLocalX, z: minLocalZ },
          { x: minLocalX, z: maxLocalZ }, { x: maxLocalX, z: maxLocalZ }
        ];
        let minWorldZ = Infinity, maxWorldZ = -Infinity, minWorldX = Infinity, maxWorldX = -Infinity;
        corners.forEach((p) => {
          const wx = p.x * Math.cos(rotY) + p.z * Math.sin(rotY);
          const wz = -p.x * Math.sin(rotY) + p.z * Math.cos(rotY);
          if (wz < minWorldZ) minWorldZ = wz; if (wz > maxWorldZ) maxWorldZ = wz;
          if (wx < minWorldX) minWorldX = wx; if (wx > maxWorldX) maxWorldX = wx;
        });
        return { minWorldZ, maxWorldZ, minWorldX, maxWorldX, totalWidth: maxWorldX - minWorldX };
      };

      const oldBounds = computeFootprint(m.operation.machine_type, dims, m.rotation.y);
      const newBounds = computeFootprint(m.operation.machine_type, dims, newRotY);
      const deltaX = newBounds.totalWidth - oldBounds.totalWidth;
      const midZ = (m.lane === 'A' || m.lane === 'B') ? LANE_Z_CENTER_AB : LANE_Z_CENTER_CD;
      const newZ = (m.lane === 'A' || m.lane === 'C') ? midZ - newBounds.minWorldZ : midZ - newBounds.maxWorldZ;
      const oldLeftEdge = m.position.x + oldBounds.minWorldX;
      const machineShiftX = oldLeftEdge - newBounds.minWorldX - m.position.x;

      return {
        machineLayout: state.machineLayout.map((machine) => {
          if (machine.id === machineId)
            return { ...machine, rotation: { ...machine.rotation, y: newRotY }, position: { ...machine.position, x: machine.position.x + machineShiftX, z: newZ } };
          if (machine.lane === m.lane && machine.position.x > m.position.x)
            return { ...machine, position: { ...machine.position, x: machine.position.x + deltaX } };
          return machine;
        }),
      };
    });
  },

  updateMachinePosition: (machineId, position) => {
    (get() as any).takeSnapshot();
    const mToMove = get().machineLayout.find(m => m.id === machineId);
    if (!mToMove) return;
    const info = getSpatialInfo(position.x, position.z, get().currentLine?.lineNo, mToMove.section);
    set({
      machineLayout: get().machineLayout.map(m =>
        m.id === machineId
          ? { ...m, position, lane: info.lane, section: info.section, hasManualPosition: true }
          : m
      )
    });
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // checkLayoutAlerts
  //
  // ONLY called from updateMachinesPositions (drag commit) and redo.
  // NOT called after generateLayout, createLine, loadLine, saveLine, or
  // setLineParameters — those produce a clean layout by definition.
  //
  // A "violation" means a machine's physical X edges (length-wise along the
  // production line) have crossed OUTSIDE their labelled section's X bounds.
  // Z-axis (width-wise / aisle) overflow is intentionally IGNORED — operators
  // sticking out into the aisle is a physical reality, not a space violation.
  //
  // Rotation is accounted for: a machine rotated 90° has its X footprint
  // computed from world-space corner projection, not naive halfLen.
  //
  // The alert message names the specific section(s) involved, e.g.:
  //   "Space Violation — Assembly 1"
  //   "Space Violation — Cuff & Sleeve"
  // ═══════════════════════════════════════════════════════════════════════════
  checkLayoutAlerts: () => {
    const layout = get().machineLayout;
    if (!layout || layout.length === 0) return;

    // Tolerance: only flag overflows larger than this (metres).
    // Large enough to absorb floating-point packing drift but small enough
    // to catch a genuine drag across a section boundary (~1 machine width).
    const TOLERANCE = 0.5;

    // Human-readable section name formatter
    const cap = (s: string): string => {
      const mapping: Record<string, string> = {
        'cuff': 'Cuff',
        'sleeve': 'Sleeve',
        'back': 'Back',
        'collar': 'Collar',
        'front': 'Front',
        'assemblyab': 'Assembly AB',
        'assemblycd': 'Assembly CD',
        'assembly 1': 'Assembly 1',
        'assembly 2': 'Assembly 2',
        'assembly 3': 'Assembly 3',
        'assembly 4': 'Assembly 4',
      };
      const key = s.toLowerCase().trim();
      return mapping[key] || s.charAt(0).toUpperCase() + s.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2');
    };

    // Compute the rotation-aware X footprint (minWorldX, maxWorldX) of a machine.
    // Only the four corners of the machine body are used — no human/operator
    // depth added — because we only care about length-wise (X) overflow.
    const getWorldXFootprint = (mType: string, rotY: number): { minX: number; maxX: number } => {
      const dims = getMachineZoneDims(mType);
      const hL = dims.length / 2; // half-length along local X
      const hW = dims.width / 2; // half-width  along local Z
      // Four body corners in local space
      const corners = [
        { lx: -hL, lz: -hW },
        { lx: hL, lz: -hW },
        { lx: -hL, lz: hW },
        { lx: hL, lz: hW },
      ];
      let minX = Infinity, maxX = -Infinity;
      corners.forEach(({ lx, lz }) => {
        // World X after rotation around Y axis: wx = lx·cos(ry) + lz·sin(ry)
        const wx = lx * Math.cos(rotY) + lz * Math.sin(rotY);
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
      });
      return { minX, maxX };
    };

    const specs = getLayoutSpecs(get().currentLine?.lineNo);
    const sections = specs.sections as Record<string, { start: number; end: number }>;
    const specsAny = specs as any;

    // ── Build a robust bounds map ──────────────────────────────────────────
    // Copy all raw section keys lowercased so lookups are case-insensitive
    const boundsMap: Record<string, { start: number; end: number }> = {};
    Object.entries(sections).forEach(([k, v]) => { boundsMap[k.toLowerCase()] = v; });

    // Resolve assembly AB bounds — try every common key variant
    const abBounds: { start: number; end: number } | undefined =
      sections['assemblyAB'] ?? sections['AssemblyAB'] ??
      sections['assembly_ab'] ?? sections['assemblyab'] ??
      specsAny.assemblyAB ?? specsAny.AssemblyAB ?? specsAny.assembly_ab;

    // Resolve assembly CD bounds
    const cdBounds: { start: number; end: number } | undefined =
      sections['assemblyCD'] ?? sections['AssemblyCD'] ??
      sections['assembly_cd'] ?? sections['assemblycd'] ??
      specsAny.assemblyCD ?? specsAny.AssemblyCD ?? specsAny.assembly_cd;

    // Map all assembly sub-section label variants to the correct bounds
    if (abBounds) {
      ['assembly 1', 'assembly 2', 'assembly1', 'assembly2'].forEach(k => { boundsMap[k] = abBounds; });
    }
    if (cdBounds) {
      ['assembly 3', 'assembly 4', 'assembly3', 'assembly4'].forEach(k => { boundsMap[k] = cdBounds; });
    }

    // Generic fallback for any unrecognised "assemblyX" label
    const anyAssemblyBounds = abBounds ?? cdBounds;

    const violatingSectionNames = new Set<string>();

    layout.forEach(m => {
      // Skip non-production / structural elements
      const mType = m.operation.machine_type.toLowerCase();
      if (m.isInspection) return;
      if (mType.includes('inspection')) return;
      if (mType.includes('supermarket')) return;
      if (m.id.startsWith('board')) return;
      if (mType.includes('board')) return;

      const labelSec = (m.section || '').toLowerCase().trim();
      if (!labelSec) return;

      // Resolve bounds — never silently skip assembly machines
      let bounds = boundsMap[labelSec];
      if (!bounds && labelSec.includes('assembly') && anyAssemblyBounds) {
        bounds = anyAssemblyBounds;
      }
      if (!bounds) return;

      // Rotation-aware world X footprint of the machine body (length-wise only)
      const rotY = m.rotation?.y ?? 0;
      const { minX: footMinX, maxX: footMaxX } = getWorldXFootprint(m.operation.machine_type, rotY);

      // World-space X edges of this machine
      const machineMinX = m.position.x + footMinX;
      const machineMaxX = m.position.x + footMaxX;

      // Only flag LENGTH-WISE (X) overflow — Z (width/aisle) is intentionally ignored
      const isOutside =
        machineMaxX > bounds.end + TOLERANCE ||
        machineMinX < bounds.start - TOLERANCE;

      if (isOutside) {
        const name = labelSec.toLowerCase().includes('assembly') ? 'Assembly' : cap(labelSec);
        violatingSectionNames.add(name);
      }
    });

    if (violatingSectionNames.size === 0) {
      // No violations — clear any stale alert
      set({ layoutAlerts: [], layoutError: null });
      return;
    }

    // Build a readable message: "Cuff", "Cuff & Sleeve", "Cuff, Sleeve & Assembly 1"
    const parts = Array.from(violatingSectionNames);
    let message: string;
    if (parts.length === 1) {
      message = parts[0];
    } else if (parts.length === 2) {
      message = `${parts[0]} & ${parts[1]}`;
    } else {
      const last = parts[parts.length - 1];
      message = `${parts.slice(0, -1).join(', ')} & ${last}`;
    }

    set({
      layoutAlerts: [{ id: 'global-space-violation', type: 'red', message }],
      layoutError: null,
      warnings: [],
    });
  },

  moveSelectedMachines: (deltaX, deltaZ) => {
    const ids = get().selectedMachines;
    if (ids.length === 0) return;

    const preDrag = get().preDragLayout;

    const updatedLayout: MachinePosition[] = get().machineLayout.map(m => {
      if (ids.includes(m.id)) {
        return {
          ...m,
          position: { ...m.position, x: m.position.x + deltaX },
          hasManualPosition: true
        };
      }
      return m;
    });

    if (preDrag) {
      const draggedMachines = updatedLayout.filter(m => ids.includes(m.id));

      draggedMachines.forEach(dragged => {
        const secLower = (dragged.section || '').toLowerCase();
        if (!secLower || secLower.includes('supermarket')) return;

        const draggedDims = getMachineZoneDims(dragged.operation.machine_type);
        const dragX = dragged.position.x;
        const dragHalfW = draggedDims.length / 2;

        const stationary = updatedLayout
          .filter(m =>
            !ids.includes(m.id) &&
            (m.section || '').toLowerCase() === secLower &&
            !m.isInspection &&
            !m.operation.machine_type.toLowerCase().includes('inspection') &&
            !m.operation.machine_type.toLowerCase().includes('supermarket') &&
            !m.id.startsWith('board')
          )
          .map(m => ({ id: m.id, origX: preDrag[m.id]?.x ?? m.position.x }))
          .sort((a, b) => a.origX - b.origX);

        let insertIdx = stationary.length;
        for (let i = 0; i < stationary.length; i++) {
          if (stationary[i].origX > dragX) {
            insertIdx = i;
            break;
          }
        }

        const shiftAmount = draggedDims.length + 0.05;
        stationary.forEach(({ id, origX }, idx) => {
          const li = updatedLayout.findIndex(m => m.id === id);
          if (li === -1) return;
          const newX = idx >= insertIdx ? origX + shiftAmount : origX;
          updatedLayout[li] = { ...updatedLayout[li], position: { ...updatedLayout[li].position, x: newX } };
        });
      });
    }

    set({ machineLayout: updatedLayout });
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // updateMachinesPositions — drag COMMIT
  // This is the ONLY place (besides redo) that calls checkLayoutAlerts.
  // ═══════════════════════════════════════════════════════════════════════════
  updateMachinesPositions: (machineIds) => {
    set({ isDraggingActive: false, isMoveGizmoVisible: false });
    // Re-evaluate alerts for the new state
    setTimeout(() => (get() as any).checkLayoutAlerts(), 0);
  },

  _reLayoutSection: (currentLayout: MachinePosition[], secLower: string, isFinalCommit = true) => {
    const specs = getLayoutSpecs(get().currentLine?.lineNo);
    const isCDGroup = secLower.includes('collar') || secLower.includes('front') || secLower.includes('assembly 3') || secLower.includes('assembly 4');
    const lane1 = isCDGroup ? 'C' : 'A';
    const lane2 = isCDGroup ? 'D' : 'B';
    const midZ = isCDGroup ? LANE_Z_CENTER_CD : LANE_Z_CENTER_AB;
    const zones = isCDGroup ? specs.zonesCD : specs.zonesAB;
    const targetSpecs = (specs.sections as any)[secLower];
    const secEndX = targetSpecs?.end || (isCDGroup ? 110.0719 * FT : 109.9619 * FT);
    const movingIds = get().selectedMachines;

    const sectionMachinesRaw = currentLayout.filter(m => (m.section || "").toLowerCase() === secLower);
    const boards = sectionMachinesRaw.filter(m => m.id.startsWith('board') || m.operation.machine_type.toLowerCase().includes('board'));
    let prod = sectionMachinesRaw.filter(m => !m.id.startsWith('board') && !m.operation.machine_type.toLowerCase().includes('board'));

    const layoutOrder = new Map(currentLayout.map((m, i) => [m.id, i]));
    prod.sort((a, b) => {
      const diffX = a.position.x - b.position.x;
      if (Math.abs(diffX) < 0.01) return (layoutOrder.get(a.id) || 0) - (layoutOrder.get(b.id) || 0);
      return diffX;
    });

    const allSpecial = prod.filter(m =>
      m.isInspection ||
      m.operation.machine_type.toLowerCase().includes('inspection') ||
      m.operation.machine_type.toLowerCase().includes('supermarket')
    );

    prod = prod.filter(m =>
      !(m.isInspection || m.operation.machine_type.toLowerCase().includes('inspection')) &&
      !(m.operation.machine_type.toLowerCase().includes('supermarket'))
    ).map((m, idx) => ({ ...m, machineIndex: idx }));

    const inspectionList = allSpecial
      .filter(m => m.isInspection || m.operation.machine_type.toLowerCase().includes('inspection'))
      .map(m => ({ ...m, machineIndex: undefined }));
    const supermarketList = allSpecial
      .filter(m => m.operation.machine_type.toLowerCase().includes('supermarket'))
      .map(m => ({ ...m, machineIndex: undefined }));

    const activeZones = isCDGroup ? ZONES_CD : ZONES_AB;

    const getHumanMaxZ = (mType: string, rotY: number) => {
      const isRot = Math.abs(rotY % Math.PI) > 0.1;
      const opOffsetZ = isRot ? -0.25 : 0;
      const moveZ = Math.cos(rotY) * opOffsetZ;
      const extraLocZ = mType.toLowerCase().includes('inspection') ? 0.45 : 0;
      const isStanding = mType.toLowerCase().includes('inspection') || mType.toLowerCase().includes('iron') ||
        mType.toLowerCase().includes('press') || mType.toLowerCase().includes('fusing') ||
        mType.toLowerCase().includes('rotary') || mType.toLowerCase().includes('helper') ||
        mType.toLowerCase().includes('table');
      const baseHumanDepth = isStanding ? 0.55 : 0.65;
      return moveZ + extraLocZ + baseHumanDepth;
    };

    const computeFootprint = (mType: string, dims: any, rotY: number) => {
      const humanZ = getHumanMaxZ(mType, rotY);
      const maxLocalZ = Math.max(dims.width / 2, humanZ);
      const minLocalZ = -dims.width / 2;
      const minLocalX = -dims.length / 2;
      const maxLocalX = dims.length / 2;
      const corners = [
        { x: minLocalX, z: minLocalZ }, { x: maxLocalX, z: minLocalZ },
        { x: minLocalX, z: maxLocalZ }, { x: maxLocalX, z: maxLocalZ }
      ];
      let minWorldZ = Infinity, maxWorldZ = -Infinity, minWorldX = Infinity, maxWorldX = -Infinity;
      corners.forEach((p) => {
        const wx = p.x * Math.cos(rotY) + p.z * Math.sin(rotY);
        const wz = -p.x * Math.sin(rotY) + p.z * Math.cos(rotY);
        if (wz < minWorldZ) minWorldZ = wz; if (wz > maxWorldZ) maxWorldZ = wz;
        if (wx < minWorldX) minWorldX = wx; if (wx > maxWorldX) maxWorldX = wx;
      });
      return { minWorldZ, maxWorldZ, minWorldX, maxWorldX, totalWidth: maxWorldX - minWorldX };
    };

    const SECTION_STARTS: Record<string, number> = Object.fromEntries(
      Object.entries(PART_BOUNDS).map(([k, v]) => [k, v.start])
    );
    const realAssemblyStartAB = (specs as any).assemblyAB?.start ?? (specs as any).sections?.assemblyAB?.start ?? FIXED_ASSEMBLY_START;
    const realAssemblyStartCD = (specs as any).assemblyCD?.start ?? (specs as any).sections?.assemblyCD?.start ?? FIXED_ASSEMBLY_START;
    SECTION_STARTS['assembly 1'] = realAssemblyStartAB;
    SECTION_STARTS['assembly 2'] = realAssemblyStartAB;
    SECTION_STARTS['assembly 3'] = realAssemblyStartCD;
    SECTION_STARTS['assembly 4'] = realAssemblyStartCD;

    const isAssembly = secLower.includes('assembly') || secLower.includes('lane') || secLower.includes('line');
    const startX = SECTION_STARTS[secLower] ?? 0;
    const GAP_X = 0.0;

    const CURSOR_INIT = startX + 0.05;
    let cursor1 = CURSOR_INIT, cursor2 = CURSOR_INIT, cursorA = CURSOR_INIT, cursorB = CURSOR_INIT, cursorC = CURSOR_INIT, cursorD = CURSOR_INIT;
    const reLayouted: MachinePosition[] = [];

    for (let i = 0; i < prod.length; i++) {
      const m = prod[i];
      let lane: string;

      if (isAssembly) {
        lane = m.lane || 'A';
      } else {
        lane = (i % 2 === 0) ? lane1 : lane2;
      }

      let targetCursor = startX;
      if (isAssembly) {
        if (lane === 'A') targetCursor = cursorA;
        else if (lane === 'B') targetCursor = cursorB;
        else if (lane === 'C') targetCursor = cursorC;
        else if (lane === 'D') targetCursor = cursorD;
      } else {
        targetCursor = (lane === lane1) ? cursor1 : cursor2;
      }

      const dims = getMachineZoneDims(m.operation.machine_type);
      const isHelper = m.operation.machine_type.toLowerCase().includes('helper table');
      const isLastOp = i === prod.length - 1;

      let ry = 0;
      if (m.operation.machine_type.toLowerCase().includes('inspection')) {
        ry = -Math.PI / 2;
      } else if (isAssembly) {
        if (lane === 'A') ry = Math.PI / 2;
        else if (lane === 'B') ry = -Math.PI / 2;
        else if (lane === 'C') ry = 0;
        else if (lane === 'D') ry = Math.PI / 2;
      } else {
        ry = (lane === lane1) ? 0 : Math.PI;
      }

      if (isAssembly && isHelper && !secLower.includes('assembly 4')) {
        ry += isLastOp ? -Math.PI / 2 : Math.PI / 2;
      }

      const bounds = computeFootprint(m.operation.machine_type, dims, ry);
      const isBeingDragged = movingIds.includes(m.id);
      const currentWidth = isAssembly ? Math.max(1.2, bounds.totalWidth) : bounds.totalWidth;
      const zones = (lane === 'A' || lane === 'B') ? ZONES_AB : ZONES_CD;
      const nextX = getNextValidX(targetCursor, currentWidth, zones);
      const packedX = nextX - bounds.minWorldX;

      let calculatedZ = midZ;
      if (isAssembly && lane !== 'C') {
        if (lane === 'A') calculatedZ = LANE_Z_A;
        else if (lane === 'B') calculatedZ = LANE_Z_B;
        else if (lane === 'D') calculatedZ = LANE_Z_D;
      } else {
        if (lane === 'A' || lane === 'C') calculatedZ = midZ - bounds.minWorldZ;
        else calculatedZ = midZ - bounds.maxWorldZ;
      }

      let finalX: number;
      const finalZ = calculatedZ;

      if (!isAssembly) {
        if (isFinalCommit) {
          finalX = packedX;
        } else {
          const targetX = m.position.x;
          finalX = (m.position.x === 0 && m.position.z === 0)
            ? packedX
            : Math.max(getNextValidX(targetX, currentWidth, zones), packedX);
        }
      } else {
        if (isFinalCommit) {
          finalX = packedX;
        } else if (m.hasManualPosition || isBeingDragged) {
          const targetX = m.position.x;
          finalX = Math.max(getNextValidX(targetX, currentWidth, zones), packedX);
        } else {
          finalX = (m.position.x === 0 && m.position.z === 0) ? packedX : Math.max(m.position.x, packedX);
        }
      }

      if (isAssembly) {
        if (m.operation.machine_type.toLowerCase().includes('inspection')) ry = -Math.PI / 2;
        else if (lane === 'A') ry = Math.PI / 2;
        else if (lane === 'B') ry = -Math.PI / 2;
        else if (lane === 'C') ry = 0;
        else if (lane === 'D') ry = Math.PI / 2;
      } else {
        if (m.operation.machine_type.toLowerCase().includes('inspection')) ry = -Math.PI / 2;
        else ry = (lane === lane1) ? 0 : Math.PI;
      }

      reLayouted.push({ ...m, position: { x: finalX, y: 0, z: finalZ }, rotation: { x: 0, y: ry, z: 0 }, lane: lane as any });

      const actualWorldMinX = finalX + bounds.minWorldX;
      const advanceX = Math.max(nextX + currentWidth + GAP_X, actualWorldMinX + currentWidth + GAP_X);

      if (isAssembly) {
        if (lane === 'A') cursorA = Math.max(cursorA, advanceX);
        else if (lane === 'B') cursorB = Math.max(cursorB, advanceX);
        else if (lane === 'C') cursorC = Math.max(cursorC, advanceX);
        else if (lane === 'D') cursorD = Math.max(cursorD, advanceX);
      } else {
        if (lane === lane1) cursor1 = Math.max(cursor1, advanceX);
        else cursor2 = Math.max(cursor2, advanceX);
      }
    }

    let currentSeqX = isAssembly
      ? Math.max(cursorA, cursorB, cursorC, cursorD)
      : Math.max(cursor1, cursor2);

    const finalInspections = inspectionList.map(mRaw => {
      const inspectDims = getMachineZoneDims(mRaw.operation.machine_type);
      const spatialInfo = getSpatialInfo(mRaw.position.x, mRaw.position.z, mRaw.section);
      const lane = spatialInfo.lane;
      const ry = -Math.PI / 2;
      const bounds = computeFootprint(mRaw.operation.machine_type, inspectDims, ry);
      const gapAfterLastMachine = 0.2;
      const inspectTargetX = currentSeqX + gapAfterLastMachine;
      const finalX = getNextValidX(inspectTargetX - bounds.minWorldX, bounds.totalWidth, activeZones);
      const autoZ = midZ + 0.8;
      currentSeqX = Math.max(currentSeqX, finalX + bounds.maxWorldX) + 0.1;
      return { ...mRaw, position: { x: finalX, y: 0, z: autoZ }, rotation: { x: 0, y: ry, z: 0 }, lane, section: spatialInfo.section };
    });

    const finalSupers = supermarketList.map(mRaw => ({ ...mRaw }));

    const allFinalX = [...reLayouted, ...finalInspections, ...finalSupers].map(m => m.position.x);
    const maxSectionX = allFinalX.length > 0 ? Math.max(...allFinalX) : startX;

    const segment = activeZones.find(z => startX >= z.start && startX <= z.end);
    if (segment && maxSectionX > segment.end + 0.1) {
      const displaySec = secLower.includes('assembly') ? 'assembly' : secLower;
      const errorMsg = `No space in ${displaySec}`;
      if (isFinalCommit) {
        set({ layoutError: errorMsg });
      }
    } else {
      if (get().layoutError === `No space in ${secLower}`) set({ layoutError: null });
    }

    const others = currentLayout.filter(m => (m.section || "").toLowerCase() !== secLower);
    return [...others, ...boards, ...reLayouted, ...finalInspections, ...finalSupers];
  },

  rotateSelectedMachines: (angleRad: number) => {
    const { selectedMachines, machineLayout, past } = get();
    if (selectedMachines.length === 0) return;
    
    set({
      past: [...past, { machineLayout: [...machineLayout] }],
      future: [],
      machineLayout: machineLayout.map(m => {
        if (selectedMachines.includes(m.id)) {
          return {
            ...m,
            rotation: {
              ...m.rotation,
              y: (m.rotation.y || 0) + angleRad
            }
          };
        }
        return m;
      })
    });
  },
  deleteSelectedMachines: () => {
    const { selectedMachines, machineLayout, past } = get();
    if (selectedMachines.length === 0) return;
    
    set({
      past: [...past, { machineLayout: [...machineLayout] }],
      future: [],
      machineLayout: machineLayout.filter(m => !selectedMachines.includes(m.id)),
      selectedMachines: [],
      selectedMachine: null
    });
  },
  deleteMachine: (machineId) => {
    (get() as any).takeSnapshot();
    const state = get();
    const updatedLayout = state.machineLayout.filter(m => m.id !== machineId);
    const m = state.machineLayout.find(x => x.id === machineId);
    if (!m) return;
    const result = m.section
      ? (get() as any)._reLayoutSection(updatedLayout, m.section.toLowerCase())
      : updatedLayout;
    set({
      machineLayout: result,
      selectedMachine: state.selectedMachine?.id === machineId ? null : state.selectedMachine
    });
    // Re-evaluate alerts for the new state
    setTimeout(() => (get() as any).checkLayoutAlerts(), 0);
  },

  addMachine: (mType, section, opName) => {
    (get() as any).takeSnapshot();
    const id = uuidv4();
    const state = get();
    const newMachine: MachinePosition = {
      id,
      operation: {
        op_no: `NEW-${id.substring(0, 4)}`,
        op_name: opName || mType,
        machine_type: mType,
        smv: 0,
        section,
      },
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      lane: 'A',
      section,
    };
    const updatedLayout = [...state.machineLayout, newMachine];
    const result = (get() as any)._reLayoutSection(updatedLayout, section.toLowerCase());
    set({ machineLayout: result });
    // Re-evaluate alerts for the new state
    setTimeout(() => (get() as any).checkLayoutAlerts(), 0);
  },

  fetchAndApplyOB: async (lineNo, styleNo, conNo) => {
    try {
      const res = await fetch(`${API_BASE_URL}/get-ob?line_no=${encodeURIComponent(lineNo)}&style_no=${encodeURIComponent(styleNo)}&con_no=${encodeURIComponent(conNo)}`);
      if (!res.ok) throw new Error("OB not found");
      const data = await res.json();
      const allOps: Operation[] = data.operations || [];
      const PREP_NAMES = [
        'washing allowance', 'washing_allowance', 'right placket tape iron', 'gusset iron',
        'press sleeve placket', 'press pocket', 'right placket self fold iron',
        'left placket self fold iron', 'stitch tape to pocket', 'triangle patch ironing',
        'pocket overlock', 'pocket iron with fusing', 'pocket hem stitch',
      ];
      const layoutOps = allOps.filter(op =>
        !PREP_NAMES.some(p => op.op_name?.toLowerCase().includes(p)) &&
        !op.op_name?.toLowerCase().includes('allowance')
      );
      const prepOps = allOps.filter(op =>
        PREP_NAMES.some(p => op.op_name?.toLowerCase().includes(p)) ||
        op.op_name?.toLowerCase().includes('allowance')
      );
      get().updateLineWithNewOB(layoutOps, undefined, prepOps);
    } catch (err) {
      console.error("[Store] Error fetching OB from server:", err);
    }
  }

}), {
  name: 'line-store',
  partialize: (state) => ({
    savedLines: state.savedLines,
    currentLine: state.currentLine,
    machineLayout: state.machineLayout,
    operations: state.operations,
    preparatoryOps: state.preparatoryOps,
    sectionLayout: state.sectionLayout,
    targetOutput: state.targetOutput,
    workingHours: state.workingHours,
    efficiency: state.efficiency,
    layoutLogicVersion: state.layoutLogicVersion,
  }),
  version: 2,
  migrate: (persistedState: any, _version: number) => persistedState,
}));
