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

  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  past: any[];
  future: any[];
  isMoveMode: boolean;
  setMoveMode: (mode: boolean) => void;
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
  setMoveMode: (mode) => set({ isMoveMode: mode, isDraggingActive: false, selectedMachines: [], selectedMachine: null }),
  isDraggingActive: false,
  preDragLayout: null,
  setDraggingActive: (active) => {
    if (active) {
      // Snapshot BEFORE drag starts so Ctrl-Z restores the clean pre-drag state,
      // not an intermediate live-preview state.
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
  clearWarnings: () => set({ warnings: [] }),
  layoutAlerts: [],
  dismissLayoutAlert: (id: string) => set((state: any) => ({ layoutAlerts: state.layoutAlerts.filter((a: any) => a.id !== id) })),

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
    layoutAlerts: [],
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
    set({ ...previous, past: newPast, future: newFuture, canUndo: newPast.length > 0, canRedo: true, selectedMachine: null });
  },

  redo: () => {
    const { past, future, machineLayout, sectionLayout, operations, targetOutput, workingHours, efficiency } = get();
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    const currentSnapshot = { machineLayout, sectionLayout, operations, targetOutput, workingHours, efficiency };
    const newPast = [...past, currentSnapshot].slice(-50);
    set({ ...next, past: newPast, future: newFuture, canUndo: true, canRedo: newFuture.length > 0, selectedMachine: null });
  },

  setLineParameters: (targetOutput, workingHours, efficiency) => {
    (get() as any).takeSnapshot();
    const state = get();
    const currentOps = state.operations;

    console.log(`[Store] Dynamic Update - Target: ${targetOutput}, Ops: ${currentOps.length}`);
    const lineNo = state.currentLine?.lineNo || "Line 1";
    const { machines, sections, warnings } = generateLayout(currentOps, targetOutput, workingHours, efficiency, lineNo);

    // Toasts removed to comply with 'alerts should only come from border violations' rule

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
      warnings: warnings || []
    });

    console.log(`[Store] Layout updated dynamically with ${machines.length} machines.`);
    setTimeout(() => (get() as any).checkLayoutAlerts(), 0);
  },

  generateMachineLayout: (operations) => {
    (get() as any).takeSnapshot();
    const { targetOutput, workingHours, efficiency, currentLine } = get();
    const lineNo = currentLine?.lineNo || "Line 1";
    const { machines, sections, warnings } = generateLayout(operations, targetOutput, workingHours, efficiency, lineNo);

    // Toasts removed

    set({ machineLayout: machines, sectionLayout: sections, warnings: warnings || [] });
    setTimeout(() => (get() as any).checkLayoutAlerts(), 0);
  },

  setOperations: (operations) => {
    (get() as any).takeSnapshot();
    get().generateMachineLayout(operations);
    set({ operations, selectedMachine: null });
  },

  createLine: (lineNo, styleNo, coneNo, buyer, operations, efficiency = 90, inputTargetOutput = 1200, inputTotalSMV?: number, inputWorkingHours = 9, sourceSheet = "", preparatoryOps = []) => {
    (get() as any).takeSnapshot();
    const targetOutput = inputTargetOutput;
    const workingHours = inputWorkingHours;
    const { machines, sections, warnings } = generateLayout(operations, targetOutput, workingHours, efficiency, lineNo);

    // Toasts removed

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
    });

    setTimeout(() => (get() as any).checkLayoutAlerts(), 0);
    return line;
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FIX: updateLineWithNewOB now calls generateLayout() from scratch.
  // Previously it remapped old machine positions to new operation labels,
  // which meant the 3D layout never changed after the first OB upload.
  // ─────────────────────────────────────────────────────────────────────────
  updateLineWithNewOB: (newOperations: Operation[], sourceSheet = "", preparatoryOpsParam?: Operation[]) => {
    (get() as any).takeSnapshot();
    const state = get();
    // Default to the argument array, or fallback to the store's current preparatoryOps
    const preparatoryOpsToUse = preparatoryOpsParam ?? state.preparatoryOps;
    const { targetOutput, workingHours, efficiency, currentLine } = state;

    console.log(`[Store] updateLineWithNewOB — ${newOperations.length} operations received`);

    // Step 1: clear previous layout state immediately (user requested explicit deletion)
    set({
      operations: [],
      machineLayout: [],
      sectionLayout: [],
      selectedMachine: null,
      selectedMachines: [],
      warnings: [],
      currentLine: null,
      preparatoryOps: preparatoryOpsToUse,
    });

    if (newOperations.length === 0) return;
    console.log(`[Store] updateLineWithNewOB — regenerating layout for ${newOperations.length} ops...`);

    // Step 2: regenerate layout for the new OB operations
    const lineNo = currentLine?.lineNo || "Line 1";
    const { machines, sections, warnings } = generateLayout(
      newOperations,
      targetOutput,
      workingHours,
      efficiency,
      lineNo
    );

    // Toasts removed

    const newTotalSMV = newOperations.reduce((sum, op) => sum + op.smv, 0);

    // Step 3: commit everything at once
    set({
      operations: newOperations,
      machineLayout: machines,
      sectionLayout: sections,
      warnings: warnings || [],
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

    console.log(`[Store] OB updated — ${newOperations.length} ops, ${machines.length} machines regenerated`);
    toast.success(`Layout updated from new OB (${sourceSheet || "default sheet"})`);
    setTimeout(() => (get() as any).checkLayoutAlerts(), 0);
  },

  saveLine: (line) => {
    (get() as any).takeSnapshot();
    set((state) => {
      const existingIdx = state.savedLines.findIndex((l) => l.id === line.id);
      let newSavedLines = [...state.savedLines];

      const updatedLine = {
        ...line,
        updatedAt: new Date().toISOString()
      };

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
      };
    });
    setTimeout(() => (get() as any).checkLayoutAlerts(), 0);
  },

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
      layoutAlerts: [],
      layoutError: null
    });
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


  checkLayoutAlerts: () => {
    const layout = get().machineLayout;
    if (!layout || layout.length === 0) return;

    const cap = (s: string) => {
      const mapping: Record<string, string> = {
        'cuff': 'Cuff',
        'sleeve': 'Sleeve',
        'back': 'Back',
        'collar': 'Collar',
        'front': 'Front',
        'assemblyAB': 'Assembly AB',
        'assemblyCD': 'Assembly CD'
      };
      return mapping[s] || s.charAt(0).toUpperCase() + s.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2');
    };

    const specs = getLayoutSpecs(get().currentLine?.lineNo);
    const sections = specs.sections;
    const newAlerts: { id: string; type: 'red'; message: string }[] = [];
    const violationKeys = new Set<string>();

    layout.forEach(m => {
      if (m.isInspection || m.operation.machine_type.toLowerCase().includes('inspection')) return;
      if (m.operation.machine_type.toLowerCase().includes('supermarket')) return;

      const labelSec = (m.section || '').toLowerCase().trim();
      if (!labelSec) return;

      const machineX = m.position.x;
      const dims = getMachineZoneDims(m.operation.machine_type);
      const halfLen = dims.length / 2;

      let targetSecKey = labelSec;
      if (labelSec.includes('assembly') || labelSec.includes('a1') || labelSec.includes('a2')) {
        targetSecKey = m.position.z < -2 ? 'assemblyAB' : 'assemblyCD';
      }

      const targetBounds = (sections as any)[targetSecKey];
      if (!targetBounds) return;

      const isOutside = (machineX + halfLen > targetBounds.end + 0.1) || (machineX - halfLen < targetBounds.start - 0.1);

      if (isOutside) {
        let actualSecKey = null;
        for (const [sKey, sBounds] of Object.entries(sections)) {
          if (machineX >= (sBounds as any).start - 0.5 && machineX <= (sBounds as any).end + 0.5) {
            actualSecKey = sKey;
            break;
          }
        }

        if (actualSecKey && actualSecKey !== targetSecKey) {
          const pair = [targetSecKey, actualSecKey].sort().join('&');
          violationKeys.add(pair);
        } else {
          violationKeys.add(targetSecKey);
        }
      }
    });

    const allViolatingSections = new Set<string>();
    violationKeys.forEach(key => {
      if (key.includes('&')) {
        key.split('&').forEach(k => allViolatingSections.add(cap(k)));
      } else {
        allViolatingSections.add(cap(key));
      }
    });

    if (allViolatingSections.size > 0) {
      const sectionsArray = Array.from(allViolatingSections);
      let message = "";
      if (sectionsArray.length === 1) {
        message = `${sectionsArray[0]}`;
      } else if (sectionsArray.length === 2) {
        message = `${sectionsArray[0]} & ${sectionsArray[1]}`;
      } else {
        const last = sectionsArray.pop();
        message = `${sectionsArray.join(", ")} & ${last}`;
      }

      newAlerts.push({
        id: 'global-space-violation',
        type: 'red',
        message
      });
    }

    set({ layoutAlerts: newAlerts, layoutError: null, warnings: [] });
  },

  moveSelectedMachines: (deltaX, deltaZ) => {
    const ids = get().selectedMachines;
    if (ids.length === 0) return;

    const preDrag = get().preDragLayout;

    // ── STEP 1: move the dragged machine(s) ──────────────────────────────────
    // Lock Z for ALL machines during drag: movement is only along X.
    // This prevents lane-jumping (AB vs CD group is Z-based).
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

    // ── STEP 2: live "make-space" preview (ALL sections including Assembly) ──
    // For every dragged machine, slide stationary peers in the same section
    // away from the drag position so the user can see exactly where it will land.
    // Threshold: shift when the dragged machine's HALF-WIDTH reaches the
    // stationary machine's centre — this starts sliding before physical overlap.
    if (preDrag) {
      const draggedMachines = updatedLayout.filter(m => ids.includes(m.id));

      draggedMachines.forEach(dragged => {
        const secLower = (dragged.section || '').toLowerCase();
        if (!secLower || secLower.includes('supermarket')) return;

        const draggedDims = getMachineZoneDims(dragged.operation.machine_type);
        const dragX = dragged.position.x;
        const dragHalfW = draggedDims.length / 2;

        // Stationary regular machines in this section, sorted by original X
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

        // Insertion point: find the FIRST machine (sorted ascending X) whose
        // original centre is to the RIGHT of the dragged machine's current centre.
        // Only machines at this index and beyond shift right to create space.
        // Machines to the LEFT of the dragged machine are never touched.
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


  updateMachinesPositions: (machineIds) => {
    // NOTE: snapshot is taken at setDraggingActive(true) — drag START.
    // Taking it here (drag end) would snapshot live-preview positions,
    // causing undo to restore an intermediate dragged state instead of
    // the clean pre-drag layout.
    const state = get();

    if (machineIds.length === 0) {
      set({ isDraggingActive: false });
      return;
    }

    // ── STEP 1: Identify affected sections ─────────────────────────────────
    const affectedSections = new Set<string>();
    let finalLayout = [...state.machineLayout];

    finalLayout = finalLayout.map(m => {
      if (machineIds.includes(m.id)) {
        const secLow = (m.section || '').toLowerCase();
        // Always preserve section and lane — never call getSpatialInfo.
        // Reason: getSpatialInfo uses Z thresholds that don't match actual
        // machine Z positions (which are offset by bounds.minWorldZ), so it
        // would misclassify the lane and cause the machine to jump sections.
        // Machines can only be reordered within their current section via drag.
        if (m.section) affectedSections.add(secLow);
        return { ...m, hasManualPosition: false };
      }
      return m;
    });

    // ── STEP 2: Insert-and-Shift for every affected section ────────────────
    // This runs for ALL section types including Assembly.
    // For Assembly, _reLayoutSection snaps Z and rotation to the lane-fixed
    // values and packs machines from the real assembly start position.
    affectedSections.forEach(secLower => {
      if (secLower.includes('supermarket')) return;

      const sectionMachines = finalLayout.filter(m =>
        (m.section || '').toLowerCase() === secLower &&
        !m.isInspection &&
        !m.operation.machine_type.toLowerCase().includes('inspection') &&
        !m.operation.machine_type.toLowerCase().includes('supermarket') &&
        !m.id.startsWith('board') &&
        !m.operation.machine_type.toLowerCase().includes('board')
      );

      // Separate the dragged machine(s) from the rest
      const dragged = sectionMachines.filter(m => machineIds.includes(m.id));
      const stationary = sectionMachines.filter(m => !machineIds.includes(m.id));

      // Sort stationary machines by their current (pre-drag) X position
      stationary.sort((a, b) => a.position.x - b.position.x);

      // For each dragged machine, find the correct insertion index into the
      // stationary list by comparing drop X to each stationary machine's midX.
      dragged.forEach(draggedMachine => {
        const dropX = draggedMachine.position.x;

        // Find insertion index: insert before the first stationary machine whose
        // center X is greater than the dropped X.
        let insertIdx = stationary.length; // default: append at end
        for (let i = 0; i < stationary.length; i++) {
          if (dropX < stationary[i].position.x) {
            insertIdx = i;
            break;
          }
        }

        // Insert the dragged machine at the computed index
        stationary.splice(insertIdx, 0, draggedMachine);
      });

      // `stationary` is now the full reordered list for this section.
      // Stamp a temporary sequential X on each machine so _reLayoutSection
      // sorts them in the exact order we just computed.
      // IMPORTANT: spacing must exceed the 0.01 tiebreaker threshold in
      // _reLayoutSection's sort, so we use 1.0m gaps.
      const EPSILON = 1.0;
      const specs = getLayoutSpecs(get().currentLine?.lineNo);
      // Map section name to the correct specs key.
      // Assembly 1 & 2 → assemblyAB (Lane B, Lane A)
      // Assembly 3 & 4 → assemblyCD (Lane D, Lane C)
      let sectionStartX: number;
      if (secLower.includes('assembly')) {
        const isCD = secLower.includes('3') || secLower.includes('4');
        const specsKey = isCD ? 'assemblyCD' : 'assemblyAB';
        sectionStartX = (specs.sections as any)[specsKey]?.start ?? (specs as any)[specsKey]?.start ?? 0;
      } else {
        sectionStartX = (specs.sections as any)[secLower]?.start ?? 0;
      }

      stationary.forEach((m, idx) => {
        m = { ...m, position: { ...m.position, x: sectionStartX + idx * EPSILON } };
        // Update the machine in finalLayout so _reLayoutSection sees the new order
        const li = finalLayout.findIndex(fm => fm.id === m.id);
        if (li !== -1) finalLayout[li] = m;
      });

      // Now run _reLayoutSection with isFinalCommit = true; it will sort by X
      // (which is now our pre-computed sequential order) and pack perfectly.
      finalLayout = (get() as any)._reLayoutSection(finalLayout, secLower, true);
    });

    set({ machineLayout: finalLayout, isDraggingActive: false });
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
    // Use the real assembly start from layout specs, not FIXED_ASSEMBLY_START (which is 0).
    // Lanes 1 & 2 are on the AB group; Lanes 3 & 4 on the CD group.
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
        // Assembly section
        if (isFinalCommit) {
          // Tight-pack: same as non-assembly on commit so insert-and-shift works
          // (without this, machines can't move to an earlier X position)
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
      // Always place inspection exactly 0.2m after last production machine — same as layout generator.
      // Never use stale mRaw.position: always recompute from live cursor so all sections are consistent.
      const gapAfterLastMachine = 0.2;
      const inspectTargetX = currentSeqX + gapAfterLastMachine;
      const finalX = getNextValidX(inspectTargetX - bounds.minWorldX, bounds.totalWidth, activeZones);
      const autoZ = midZ + 0.8;
      currentSeqX = Math.max(currentSeqX, finalX + bounds.maxWorldX) + 0.1;
      return { ...mRaw, position: { x: finalX, y: 0, z: autoZ }, rotation: { x: 0, y: ry, z: 0 }, lane, section: spatialInfo.section };
    });
    const finalSupers = supermarketList.map(mRaw => {
      return { ...mRaw };
    });

    const allFinalX = [...reLayouted, ...finalInspections, ...finalSupers].map(m => m.position.x);
    const maxSectionX = allFinalX.length > 0 ? Math.max(...allFinalX) : startX;

    const segment = activeZones.find(z => startX >= z.start && startX <= z.end);
    if (segment && maxSectionX > segment.end + 0.1) {
      const errorMsg = `No space in ${secLower}`;
      if (isFinalCommit) {
        set({ layoutError: errorMsg });
      }
    } else {
      if (get().layoutError === `No space in ${secLower}`) set({ layoutError: null });
    }

    const others = currentLayout.filter(m => (m.section || "").toLowerCase() !== secLower);
    return [...others, ...boards, ...reLayouted, ...finalInspections, ...finalSupers];
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
  },

  fetchAndApplyOB: async (lineNo, styleNo, conNo) => {
    try {
      const res = await fetch(`${API_BASE_URL}/get-ob?line_no=${encodeURIComponent(lineNo)}&style_no=${encodeURIComponent(styleNo)}&con_no=${encodeURIComponent(conNo)}`);
      if (!res.ok) throw new Error("OB not found"); const data = await res.json();
      console.log(`[Store] Applying custom OB from server for ${styleNo}`);
      const allOps: Operation[] = data.operations || [];
      // Split into layout ops and preparatory ops (same filter as obParser)
      const PREP_NAMES = [
        'washing allowance', 'washing_allowance', 'right placket tape iron', 'gusset iron',
        'press sleeve placket', 'press pocket', 'right placket self fold iron',
        'left placket self fold iron', 'stitch tape to pocket', 'triangle patch ironing',
        'pocket overlock', 'pocket iron with fusing', 'pocket hem stitch',
      ];
      const layoutOps = allOps.filter(op => !PREP_NAMES.some(p => op.op_name?.toLowerCase().includes(p)) && !op.op_name?.toLowerCase().includes('allowance'));
      const prepOps = allOps.filter(op => PREP_NAMES.some(p => op.op_name?.toLowerCase().includes(p)) || op.op_name?.toLowerCase().includes('allowance'));
      get().updateLineWithNewOB(layoutOps, undefined, prepOps);
    } catch (err) {
      console.error("[Store] Error fetching OB from server:", err);
    }
  }

}), {
  name: 'line-store',

  // Only persist user preferences — never layout or operations data.
  // Now persisting layout and operations data.
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

  // Version bump forces a one-time migration on existing browsers that still
  // have the old schema (which included machineLayout / operations / currentLine).
  version: 2, // Bump version to indicate schema change
  migrate: (persistedState: any, version: number) => {
    return persistedState; // No removal needed anymore
  },
}));
