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

interface LineStore {
  savedLines: LineData[];
  currentLine: LineData | null;

  machineLayout: MachinePosition[];
  sectionLayout: SectionLayout[];
  operations: Operation[];

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
    sourceSheet?: string
  ) => LineData;

  saveLine: (line: LineData) => void;
  loadLine: (id: string) => void;
  deleteLine: (id: string) => void;

  setOperations: (operations: Operation[]) => void;
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
  updateLineWithNewOB: (newOperations: Operation[], sourceSheet?: string) => void;
  resetLine: () => void;
  setMachineLayout: (layout: MachinePosition[]) => void;
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
  targetOutput: 1000,
  workingHours: 9,
  visibleSection: null,
  setVisibleSection: (section) => set({ visibleSection: section }),
  layoutLogicVersion: 0,
  setLayoutLogicVersion: (v) => set({ layoutLogicVersion: v }),
  efficiency: 100,
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

  resetLine: () => set({
    currentLine: null,
    machineLayout: [],
    sectionLayout: [],
    operations: [],
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

    if (warnings && warnings.length > 0) {
      warnings.forEach(w => toast.error(w));
    }

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

    if (warnings && warnings.length > 0) {
      warnings.forEach(w => toast.error(w));
    }

    set({ machineLayout: machines, sectionLayout: sections, warnings: warnings || [] });
    setTimeout(() => (get() as any).checkLayoutAlerts(), 0);
  },

  setOperations: (operations) => {
    (get() as any).takeSnapshot();
    get().generateMachineLayout(operations);
    set({ operations, selectedMachine: null });
  },

  createLine: (lineNo, styleNo, coneNo, buyer, operations, efficiency = 100, inputTargetOutput = 1000, inputTotalSMV?: number, inputWorkingHours = 9, sourceSheet = "") => {
    (get() as any).takeSnapshot();
    const targetOutput = inputTargetOutput;
    const workingHours = inputWorkingHours;
    const { machines, sections, warnings } = generateLayout(operations, targetOutput, workingHours, efficiency, lineNo);

    if (warnings && warnings.length > 0) {
      warnings.forEach(w => toast.error(w));
    }

    const calculatedTotal = operations.reduce((sum, op) => sum + op.smv, 0);
    const totalSMV = inputTotalSMV || calculatedTotal;

    const line: LineData = {
      id: uuidv4(), lineNo, styleNo, coneNo, buyer, operations,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      machineLayout: machines, sectionLayout: sections, totalSMV,
      targetOutput, workingHours, efficiency, sourceSheet
    };

    set({
      machineLayout: machines,
      sectionLayout: sections,
      operations,
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
  updateLineWithNewOB: (newOperations: Operation[], sourceSheet = "") => {
    (get() as any).takeSnapshot();
    const { targetOutput, workingHours, efficiency, currentLine } = get();

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

    if (warnings?.length > 0) {
      warnings.forEach(w => toast.error(w));
    }

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
      machineLayout: line.machineLayout,
      sectionLayout: line.sectionLayout || [],
      targetOutput: line.targetOutput || 1000,
      workingHours: line.workingHours || 9,
      efficiency: line.efficiency || 100,
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
    const lastMachine = state.machineLayout.find(m => m.id === (newSelection[newSelection.length - 1]));
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

  updateMachinesPositions: (machineIds) => {
    (get() as any).takeSnapshot();

    const affectedSections = new Set<string>();
    let workLayout = get().machineLayout.map(m => {
      if (machineIds.includes(m.id)) {
        const info = getSpatialInfo(m.position.x, m.position.z, get().currentLine?.lineNo, m.section);
        if (m.section) affectedSections.add(m.section.toLowerCase());
        affectedSections.add(info.section.toLowerCase());
        return { ...m, section: info.section, lane: info.lane, hasManualPosition: true };
      }
      return m;
    });

    const applyPhysicsToLane = (laneMachines: MachinePosition[], zones: any[], sectionStart: number, sectionEnd: number, laneKey: string, fixZ: (m: MachinePosition, minWZ: number, maxWZ: number) => number) => {
      if (laneMachines.length === 0) return [];

      let items = laneMachines.map(m => {
        const dims = getMachineZoneDims(m.operation.machine_type);
        const ry = m.rotation.y;
        const cosR = Math.cos(ry), sinR = Math.sin(ry);
        const hw = dims.length / 2, hd = dims.width / 2;
        const corners = [{ x: -hw, z: -hd }, { x: hw, z: -hd }, { x: -hw, z: hd }, { x: hw, z: hd }];
        let minWX = Infinity, maxWX = -Infinity, minWZ = Infinity, maxWZ = -Infinity;
        corners.forEach(p => {
          const wx = p.x * cosR + p.z * sinR;
          const wz = -p.x * sinR + p.z * cosR;
          if (wx < minWX) minWX = wx; if (wx > maxWX) maxWX = wx;
          if (wz < minWZ) minWZ = wz; if (wz > maxWZ) maxWZ = wz;
        });
        const totalWidth = maxWX - minWX + 0.15; // padding
        const leftX = m.position.x + minWX;
        const targetZ = fixZ ? fixZ(m, minWZ, maxWZ) : m.position.z;

        return { m, isAnchor: machineIds.includes(m.id), x: leftX, w: totalWidth, id: m.id, minWX, targetZ };
      });

      const safeZones = zones.map((z: any) => ({
        start: Math.max(z.start, sectionStart),
        end: Math.min(z.end, sectionEnd)
      })).filter((z: any) => z.end > z.start);

      for (let i = 0; i < safeZones.length - 1; i++) {
        const gapStart = safeZones[i].end;
        const gapEnd = safeZones[i + 1].start;
        if (gapEnd > gapStart) {
          items.push({ isAnchor: true, x: gapStart, w: gapEnd - gapStart, id: `gap-${i}`, minWX: 0, targetZ: 0, m: null as any });
        }
      }

      items.sort((a, b) => a.x - b.x);

      let changed = true;
      let iters = 0;
      while (changed && iters < 300) {
        changed = false;
        for (let i = 0; i < items.length - 1; i++) {
          const left = items[i]; const right = items[i + 1];
          const overlap = (left.x + left.w) - right.x;
          if (overlap > 0.001) {
            changed = true;
            if (left.isAnchor && right.isAnchor) right.x += overlap;
            else if (left.isAnchor) right.x += overlap;
            else if (right.isAnchor) left.x -= overlap;
            else { left.x -= overlap / 2; right.x += overlap / 2; }
          }
        }

        for (const item of items) {
          if (!item.isAnchor || !item.id.startsWith('gap-')) {
            if (item.x < sectionStart) { item.x = sectionStart; changed = true; }
            if (item.x + item.w > sectionEnd) { item.x = sectionEnd - item.w; changed = true; }
          }
        }
        items.sort((a, b) => a.x - b.x);
        iters++;
      }

      const repacked: MachinePosition[] = [];
      items.forEach(item => {
        if (item.m) {
          const finalX = item.x - item.minWX;
          repacked.push({ ...item.m, position: { ...item.m.position, x: finalX, z: item.targetZ }, lane: laneKey as any });
        }
      });
      return repacked;
    };

    affectedSections.forEach(sec => {
      const isAssembly = sec.includes('assembly') || sec.includes('lane') || sec.includes('line');
      const specs = getLayoutSpecs(get().currentLine?.lineNo);

      const isSpecial = (m: MachinePosition) =>
        m.isInspection || m.operation.machine_type.toLowerCase().includes('inspection') ||
        m.operation.machine_type.toLowerCase().includes('supermarket') ||
        m.id.startsWith('board') || m.operation.machine_type.toLowerCase().includes('board');

      if (isAssembly) {
        const isCDGroup = sec.includes('assembly 3') || sec.includes('assembly 4');
        const zones = isCDGroup ? specs.zonesCD : specs.zonesAB;
        const ASSEMBLY_START = 114.0719 * FT;
        const targetSpecs = (specs.sections as any)[sec] || (isCDGroup ? specs.sections.assemblyCD : specs.sections.assemblyAB);
        const secEndX = targetSpecs?.end || (ASSEMBLY_START + 500);
        const assemblyLanes = ['A', 'B', 'C', 'D'] as const;

        const sectionMachines = workLayout.filter(m => (m.section || '').toLowerCase() === sec);
        const repackedAssembly: MachinePosition[] = [];

        assemblyLanes.forEach(laneKey => {
          const LANE_Z: Record<string, number> = { A: -5.2, B: -6.8, C: 0.75, D: -0.75 };
          const laneZ = LANE_Z[laneKey];
          const laneMachines = sectionMachines
            .filter(m => (m.lane || '').toUpperCase() === laneKey && !isSpecial(m));

          const repacked = applyPhysicsToLane(laneMachines, zones, ASSEMBLY_START, secEndX, laneKey, () => laneZ);
          repackedAssembly.push(...repacked);
        });

        const specials = sectionMachines.filter(isSpecial);
        const others = workLayout.filter(m => (m.section || '').toLowerCase() !== sec);
        workLayout = [...others, ...repackedAssembly, ...specials];
        return;
      }

      const isCDGroup = sec.includes('collar') || sec.includes('front');
      const lane1 = isCDGroup ? 'C' : 'A';
      const lane2 = isCDGroup ? 'D' : 'B';
      const midZ = isCDGroup ? LANE_Z_CENTER_CD : LANE_Z_CENTER_AB;
      const zones = isCDGroup ? specs.zonesCD : specs.zonesAB;

      const targetTag = Object.keys(specs.sections).find(k => sec.includes(k.toLowerCase()));
      const targetSpecs = targetTag ? (specs.sections as any)[targetTag] : null;

      const secStartX = targetSpecs?.start || 0;
      const secEndX = targetSpecs?.end || (isCDGroup ? 110.0719 * FT : 109.9619 * FT);

      const sectionMachines = workLayout.filter(m => (m.section || '').toLowerCase() === sec);
      const prodMachines = sectionMachines.filter(m => !isSpecial(m));

      // Look for capacity overload
      const capacityPx = secEndX - secStartX;
      const requiredPxLength = prodMachines.reduce((sum, m) => {
        return sum + getMachineZoneDims(m.operation.machine_type).length / 2.0;
      }, 0);

      const hasAnchors = prodMachines.some(m => machineIds.includes(m.id));
      if (hasAnchors && requiredPxLength > capacityPx) {
        // Boot the edge machine
        const unanchored = prodMachines.filter(m => !machineIds.includes(m.id));
        if (unanchored.length > 0) {
          const overflowTarget = findOverflowSection(sec, undefined, !isCDGroup);
          if (overflowTarget !== sec.toLowerCase() && !overflowTarget.includes('assembly')) {
            const targetSpecsRef = (specs.sections as any)[overflowTarget];
            const targetStart = targetSpecsRef?.start || 0;
            const bootForward = targetStart > secStartX;

            unanchored.sort((a, b) => a.position.x - b.position.x);
            const machineToBoot = bootForward ? unanchored[unanchored.length - 1] : unanchored[0];

            machineToBoot.section = overflowTarget;
            // It will be picked up by the other section's loop if it was early, or we must ensure we add it to affectedSections
            if (!affectedSections.has(overflowTarget)) {
              affectedSections.add(overflowTarget);
            }

            // Remove it from this section's list for the physics solver
            const idx = sectionMachines.findIndex(m => m.id === machineToBoot.id);
            if (idx !== -1) sectionMachines.splice(idx, 1);
          }
        }
      }

      const repackedAll: MachinePosition[] = [];

      [lane1, lane2].forEach(laneKey => {
        const laneMachines = sectionMachines.filter(m => m.lane === laneKey && !isSpecial(m));
        const repacked = applyPhysicsToLane(laneMachines, zones, secStartX, secEndX, laneKey, (m, minWZ, maxWZ) => {
          return (laneKey === 'A' || laneKey === 'C') ? (midZ - minWZ) : (midZ - maxWZ);
        });
        repackedAll.push(...repacked);
      });

      const specials = sectionMachines.filter(isSpecial);
      const others = workLayout.filter(m => (m.section || '').toLowerCase() !== sec);
      workLayout = [...others, ...repackedAll, ...specials];
    });

    set({ machineLayout: workLayout, isDraggingActive: false });
    setTimeout(() => (get() as any).checkLayoutAlerts(), 0);
  },

  checkLayoutAlerts: () => {
    const layout = get().machineLayout;
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const newAlerts: { id: string; type: 'green' | 'red'; message: string }[] = [];

    const PART_BOUNDS_LOCAL = PART_BOUNDS as Record<string, { start: number; end: number }>;
    const overflowPairs = new Set<string>();
    layout.forEach(m => {
      if (m.isInspection || m.operation.machine_type.toLowerCase().includes('inspection')) return;
      if (m.operation.machine_type.toLowerCase().includes('supermarket')) return;

      const labelSec = (m.section || '').toLowerCase().trim();
      if (!labelSec) return;

      const machineX = m.position.x;

      // Find which physical section the machine is actually in (by X position)
      let physicalSec = labelSec;
      for (const [part, bounds] of Object.entries(PART_BOUNDS_LOCAL)) {
        if (machineX >= bounds.start - 1.0 && machineX <= bounds.end + 1.0) {
          physicalSec = part.toLowerCase();
          break;
        }
      }

      // If physical section differs from label section, this machine has overflowed
      const normLabel = labelSec.includes('assembly') ? 'assembly' : labelSec;
      const normPhys = physicalSec.includes('assembly') ? 'assembly' : physicalSec;
      if (normLabel !== normPhys) {
        overflowPairs.add(`${normLabel}→${normPhys}`);
      }

      // Also detect by operation.section vs m.section (old method, fallback)
      const origSec = (m.operation.section || '').toLowerCase().trim();
      const curSec = (m.section || '').toLowerCase().trim();
      if (origSec && curSec && origSec !== curSec) {
        const normOrig = origSec.includes('assembly') ? 'assembly' : origSec;
        const normCur = curSec.includes('assembly') ? 'assembly' : curSec;
        if (normOrig !== normCur) overflowPairs.add(`${normOrig}→${normCur}`);
      }
    });

    overflowPairs.forEach(pair => {
      const [orig = '', cur = ''] = pair.split('→');
      const id = `overflow-${pair}`;
      const displayOrig = orig === 'assembly' ? 'Assembly' : cap(orig);
      const displayCur = cur === 'assembly' ? 'Assembly' : cap(cur);
      newAlerts.push({
        id,
        type: 'green',
        message: `${displayOrig} overflow handled – machines placed in ${displayCur} section`
      });
    });


    const allSections = new Set<string>(layout.map(m => (m.section || '').toLowerCase()).filter(Boolean) as string[]);
    let assemblyViolated = false;

    allSections.forEach(sec => {
      const specs = getLayoutSpecs(get().currentLine?.lineNo);
      const targetSpecs = specs.sections[sec as keyof typeof specs.sections];
      const sectionEnd = targetSpecs?.end || 500 * FT;
      if (!sectionEnd) return;

      const violated = layout.some(m => {
        if ((m.section || '').toLowerCase() !== sec) return false;
        if (m.isInspection || m.operation.machine_type.toLowerCase().includes('inspection')) return false;
        if (m.operation.machine_type.toLowerCase().includes('supermarket')) return false;
        // If a machine is physically outside sectionEnd check if it really belongs here
        // (machines that overflowed cleanly into the next section are tagged with the original
        // source section name, so their X position will be beyond sectionEnd — that is NOT
        // a violation, it is handled as a green overflow info).
        const halfLen = getMachineZoneDims(m.operation.machine_type).length / 2;
        const isOverSectionEnd = (m.position.x + halfLen) > (sectionEnd + 0.1);
        if (!isOverSectionEnd) return false;
        // Determine if this machine is an expected overflow (green) — if any overflow alert
        // covers this sec→*, it means the system moved it intentionally.
        const isIntentionalOverflow = newAlerts.some(
          a => a.type === 'green' && a.id.startsWith(`overflow-${sec}→`)
        );
        return !isIntentionalOverflow;
      });

      if (violated) {
        if (sec.includes('assembly')) {
          assemblyViolated = true;
        } else {
          newAlerts.push({
            id: `violation-${sec}`,
            type: 'red',
            message: `Space limit exceeded – ${cap(sec)} section`
          });
        }
      }
    });

    if (assemblyViolated) {
      newAlerts.push({
        id: `violation-assembly`,
        type: 'red',
        message: `Space limit exceeded – Assembly section`
      });
    }

    const prev = get().layoutAlerts;
    const dismissedGreenIds = new Set(prev.filter((a: any) => a.type === 'green').map((a: any) => a.id));

    const merged = newAlerts.filter(a => {
      if (a.type === 'green' && dismissedGreenIds.has(a.id)) return false;
      return true;
    });

    set({ layoutAlerts: merged });

    merged.filter(a => a.type === 'green').forEach(a => {
      setTimeout(() => {
        set((state: any) => ({ layoutAlerts: state.layoutAlerts.filter((x: any) => x.id !== a.id) }));
      }, 5000);
    });
  },

  moveSelectedMachines: (deltaX, deltaZ) => {
    const ids = get().selectedMachines;
    if (ids.length === 0) return;

    const preDrag = get().preDragLayout;

    const withMovedMachines = get().machineLayout.map(m => {
      if (ids.includes(m.id)) {
        const newX = m.position.x + deltaX;
        const newZ = m.position.z + deltaZ;
        const info = getSpatialInfo(newX, newZ, m.section);
        return { ...m, section: info.section, lane: info.lane, position: { ...m.position, x: newX, z: newZ }, hasManualPosition: true };
      }
      return m;
    });

    if (!preDrag) {
      set({ machineLayout: withMovedMachines });
      return;
    }

    const draggedMachines = withMovedMachines.filter(m => ids.includes(m.id));
    const sectionsWithDrag = new Set<string>();
    draggedMachines.forEach(m => { if (m.section) sectionsWithDrag.add(m.section.toLowerCase()); });

    let finalLayout = withMovedMachines;

    sectionsWithDrag.forEach(secLower => {
      const isAssembly = secLower.includes('assembly') || secLower.includes('lane') || secLower.includes('line');

      if (isAssembly) {
        const dragged = draggedMachines.find(m => (m.section || '').toLowerCase() === secLower);
        if (!dragged) return;
        const draggedLane = (dragged.lane || 'A').toUpperCase();
        const draggedX = dragged.position.x;
        const draggedWidth = getMachineZoneDims(dragged.operation.machine_type).length;

        const peers = finalLayout
          .filter(m =>
            !ids.includes(m.id) &&
            (m.section || '').toLowerCase() === secLower &&
            (m.lane || 'A').toUpperCase() === draggedLane &&
            !m.isInspection &&
            !m.operation.machine_type.toLowerCase().includes('inspection') &&
            !m.operation.machine_type.toLowerCase().includes('supermarket') &&
            !m.id.startsWith('board') &&
            !m.operation.machine_type.toLowerCase().includes('board')
          )
          .map(m => ({ ...m, preDragX: preDrag[m.id]?.x ?? m.position.x }))
          .sort((a, b) => a.preDragX - b.preDragX);

        const insertIdx = peers.findIndex(o => o.preDragX >= draggedX);
        const peerIds = new Set(peers.map(o => o.id));
        const specs = getLayoutSpecs(get().currentLine?.lineNo);
        const secEndX = (specs.sections as any)[secLower]?.end ?? (114.0719 * FT);

        finalLayout = finalLayout.map(m => {
          if (ids.includes(m.id)) return m;
          if ((m.section || '').toLowerCase() !== secLower) return m;
          if (!peerIds.has(m.id)) return m;

          const anchor = peers.find(o => o.id === m.id)!;
          const idx = peers.indexOf(anchor);
          if (insertIdx === -1 || idx < insertIdx) {
            return { ...m, position: { ...m.position, x: anchor.preDragX } };
          } else {
            const peerWidth = getMachineZoneDims(m.operation.machine_type).length;
            const pushedX = Math.min(anchor.preDragX + draggedWidth, secEndX - peerWidth);
            return { ...m, position: { ...m.position, x: pushedX } };
          }
        });
        return;
      }

      const dragged = draggedMachines.find(m => (m.section || '').toLowerCase() === secLower);
      if (!dragged) return;

      const draggedX = dragged.position.x;
      const draggedWidth = getMachineZoneDims(dragged.operation.machine_type).length;
      const draggedOpSec = (dragged.operation.section || secLower).toLowerCase();

      const peers = finalLayout
        .filter(m =>
          !ids.includes(m.id) &&
          (m.section || '').toLowerCase() === secLower &&
          (m.operation.section || secLower).toLowerCase() === draggedOpSec &&
          !m.isInspection &&
          !m.operation.machine_type.toLowerCase().includes('inspection') &&
          !m.operation.machine_type.toLowerCase().includes('supermarket') &&
          !m.id.startsWith('board') &&
          !m.operation.machine_type.toLowerCase().includes('board')
        )
        .map(m => ({ ...m, preDragX: preDrag[m.id]?.x ?? m.position.x }))
        .sort((a, b) => a.preDragX - b.preDragX);

      const insertIdx = peers.findIndex(o => o.preDragX >= draggedX);
      const peerIds = new Set(peers.map(o => o.id));

      const specialIds = new Set(
        finalLayout.filter(m =>
          !ids.includes(m.id) &&
          (m.section || '').toLowerCase() === secLower &&
          (m.isInspection || m.operation.machine_type.toLowerCase().includes('inspection') ||
            m.operation.machine_type.toLowerCase().includes('supermarket') ||
            m.id.startsWith('board') || m.operation.machine_type.toLowerCase().includes('board'))
        ).map(m => m.id)
      );

      finalLayout = finalLayout.map(m => {
        if (ids.includes(m.id)) return m;
        if ((m.section || '').toLowerCase() !== secLower) return m;

        if (specialIds.has(m.id)) {
          const savedX = preDrag[m.id]?.x;
          return savedX !== undefined ? { ...m, position: { ...m.position, x: savedX } } : m;
        }

        if (!peerIds.has(m.id)) {
          const savedX = preDrag[m.id]?.x;
          return savedX !== undefined ? { ...m, position: { ...m.position, x: savedX } } : m;
        }

        const anchor = peers.find(o => o.id === m.id)!;
        const idx = peers.indexOf(anchor);

        if (insertIdx === -1 || idx < insertIdx) {
          return { ...m, position: { ...m.position, x: anchor.preDragX } };
        } else {
          const peerWidth = getMachineZoneDims(m.operation.machine_type).length;
          const layoutSpecs = getLayoutSpecs(get().currentLine?.lineNo);
          const targetSpecs = (layoutSpecs.sections as any)[secLower];
          const secEndX = targetSpecs?.end || (114.0719 * FT);
          const pushedX = Math.min(anchor.preDragX + draggedWidth, secEndX - peerWidth);
          return { ...m, position: { ...m.position, x: pushedX } };
        }
      });
    });

    set({ machineLayout: finalLayout });
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
    SECTION_STARTS['assembly 1'] = FIXED_ASSEMBLY_START;
    SECTION_STARTS['assembly 2'] = FIXED_ASSEMBLY_START;
    SECTION_STARTS['assembly 3'] = FIXED_ASSEMBLY_START;
    SECTION_STARTS['assembly 4'] = FIXED_ASSEMBLY_START;

    const ASSEMBLY_START_X = FIXED_ASSEMBLY_START;
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
          let targetX = Math.min(m.position.x, ASSEMBLY_START_X - currentWidth - 0.5);
          finalX = (m.position.x === 0 && m.position.z === 0)
            ? packedX
            : Math.max(getNextValidX(targetX, currentWidth, zones), packedX);
        }
      } else {
        finalX = (m.position.x === 0 && m.position.z === 0) ? packedX : Math.max(m.position.x, packedX);
        if (m.hasManualPosition || (isBeingDragged && !isFinalCommit)) {
          let targetX = m.position.x;
          finalX = Math.max(getNextValidX(targetX, currentWidth, zones), packedX);
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
      const isBeingDragged = movingIds.includes(mRaw.id);
      const superDims = getMachineZoneDims('supermarket');
      const spatialAtStart = getSpatialInfo(mRaw.position.x, mRaw.position.z, mRaw.section);
      const laneAtStart = spatialAtStart.lane;
      let ry = -Math.PI / 2;
      if (isAssembly) {
        if (laneAtStart === 'B') ry = -Math.PI / 2;
        else if (laneAtStart === 'A') ry = Math.PI / 2;
        else if (laneAtStart === 'D') ry = Math.PI / 2;
        else if (laneAtStart === 'C') ry = 0;
      } else {
        ry = (laneAtStart === 'A' || laneAtStart === 'C') ? 0 : Math.PI;
      }
      const bounds = computeFootprint('supermarket', superDims, ry);
      const superXStart = getNextValidX(currentSeqX + 0.5, superDims.width, activeZones);
      const autoX = superXStart - bounds.minWorldX;
      const autoZ = midZ + 0.8;
      const isFresh = mRaw.position.x === 0 && mRaw.position.z === 0;
      let targetX = isFresh ? autoX : Math.max(mRaw.position.x, autoX);
      if (!isAssembly) targetX = Math.min(targetX, ASSEMBLY_START_X - bounds.totalWidth - 0.5);
      const finalX = getNextValidX(targetX, bounds.totalWidth, activeZones);
      currentSeqX = (isFresh || isFinalCommit || isBeingDragged)
        ? (Math.max(currentSeqX, finalX + bounds.maxWorldX) + 0.5)
        : (currentSeqX + superDims.width);
      const spatialFinal = getSpatialInfo(finalX, isFresh ? autoZ : mRaw.position.z, mRaw.section);
      return {
        ...mRaw,
        position: { x: finalX, y: 0, z: isFresh ? autoZ : mRaw.position.z },
        rotation: { x: 0, y: ry, z: 0 },
        lane: spatialFinal.lane,
        section: spatialFinal.section
      };
    });

    const allFinalX = [...reLayouted, ...finalInspections, ...finalSupers].map(m => m.position.x);
    const maxSectionX = allFinalX.length > 0 ? Math.max(...allFinalX) : startX;

    const segment = activeZones.find(z => startX >= z.start && startX <= z.end);
    if (segment && maxSectionX > segment.end + 0.1) {
      const errorMsg = `No space in ${secLower}`;
      if (isFinalCommit && get().layoutError !== errorMsg) {
        toast.error(`Architecture Alert: This is not possible because no space in ${secLower}!`);
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

}), {
  name: 'line-store',

  // Only persist user preferences — never layout or operations data.
  // Now persisting layout and operations data.
  partialize: (state) => ({
    savedLines: state.savedLines,
    currentLine: state.currentLine,
    machineLayout: state.machineLayout,
    operations: state.operations,
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
