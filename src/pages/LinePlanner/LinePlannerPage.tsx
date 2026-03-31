import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, Factory, Eye, Activity, Target,
  Undo2, Redo2, Move, AlertCircle, X, ChevronDown, ChevronUp, Settings, Filter,
  Users, Scissors, TrendingUp, Info, RefreshCw, Plus, Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Scene3D } from '@/components/3d/Scene3D';
import { MachineInfoPanel } from '@/components/ui/MachineInfoPanel';
import { useLineStore } from '@/store/useLineStore';
import { LAYOUT_LOGIC_VERSION } from '@/utils/layoutGenerator';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Operation } from '@/types';

const LinePlannerPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const {
    currentLine, machineLayout, operations, saveLine, setSelectedMachine,
    generateMachineLayout, targetOutput, workingHours, efficiency,
    setLineParameters, visibleSection, setVisibleSection, undo, redo,
    canUndo, canRedo, isMoveMode, setMoveMode, selectedMachines,
    isDraggingActive, setDraggingActive, layoutError, warnings, clearWarnings,
    layoutAlerts, dismissLayoutAlert, fetchAndApplyOB, preparatoryOps, moveToLayout
  } = useLineStore();

  const [localTarget, setLocalTarget] = useState(targetOutput.toString());
  const [localHours, setLocalHours] = useState(workingHours.toString());
  const [localEfficiency, setLocalEfficiency] = useState(efficiency.toString());
  const [isAssemblyExpanded, setIsAssemblyExpanded] = useState(false);

  useEffect(() => {
    if (currentLine?.lineNo && (currentLine as any).styleNo && (currentLine as any).coneNo) {
      if (operations.length === 0) {
        fetchAndApplyOB(currentLine.lineNo, (currentLine as any).styleNo, (currentLine as any).coneNo);
      }
    }
  }, [currentLine?.lineNo, (currentLine as any)?.styleNo, (currentLine as any)?.coneNo, fetchAndApplyOB, operations.length]);

  const { layoutLogicVersion, setLayoutLogicVersion } = useLineStore();
  useEffect(() => {
    if (layoutLogicVersion !== LAYOUT_LOGIC_VERSION && operations.length > 0) {
      generateMachineLayout(operations);
      setLayoutLogicVersion(LAYOUT_LOGIC_VERSION);
    }
  }, [layoutLogicVersion, LAYOUT_LOGIC_VERSION, operations, generateMachineLayout, setLayoutLogicVersion]);

  useEffect(() => { setLocalTarget(targetOutput.toString()); }, [targetOutput]);
  useEffect(() => { setLocalHours(workingHours.toString()); }, [workingHours]);
  useEffect(() => { setLocalEfficiency(efficiency.toString()); }, [efficiency]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitParameters = useCallback((t: number, h: number, e: number) => {
    if (t <= 0 || h <= 0 || operations.length === 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setLineParameters(t, h, e), 300);
  }, [operations.length, setLineParameters]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) redo(); else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handleSave = () => {
    if (currentLine) {
      saveLine(currentLine);
      toast({ title: "Line Saved", description: `Line ${currentLine.lineNo} has been saved` });
    }
  };

  useEffect(() => {
    if (warnings.length > 0 && !layoutError) {
      const timer = setTimeout(() => clearWarnings(), 5000);
      return () => clearTimeout(timer);
    }
  }, [warnings, layoutError, clearWarnings]);

  // ─────────────────────────────────────────────────────────────────────────
  // FIXED stats calculation
  //
  // Root causes of Live Output = 0:
  //
  // 1. opsBySection used m.section raw (mixed case) as key, then relevantOps
  //    looked it up with .toLowerCase() — case mismatch dropped all counts.
  //
  // 2. When count === 0 (op in OB but no machine placed yet), the old code set
  //    opOutput = 0, pulling minSectionOpOutput to 0 → actualOutput = 0.
  //    Fix: skip ops with count === 0 entirely — they have no machines yet.
  //
  // 3. Assembly relevantOps filter used opSec.includes('assembly') which
  //    matched ALL assembly sub-sections for every assembly section, inflating
  //    counts and producing wrong output numbers.
  //    Fix: match exact section key per assembly sub-section.
  //
  // 4. The aggregate assembly output summed per-sub-section outputs, but each
  //    sub-section only sees a fraction of the total ops.
  //    Fix: compute assembly output as min over all assembly machines, treating
  //    all assembly lanes together.
  // ─────────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalStyleSMV = currentLine?.totalSMV ||
      operations.reduce((sum, op) => sum + (op.smv || 0), 0);

    // Production machines only (no inspection, supermarket, board)
    const prodMachines = machineLayout.filter(m =>
      m.operation &&
      !m.operation.machine_type.toLowerCase().includes('pathway') &&
      !m.operation.machine_type.toLowerCase().includes('supermarket') &&
      !m.id.toLowerCase().includes('board')
    );

    const effectiveTimeDaily = workingHours * 60 * (efficiency / 100);

    // ── Step 1: count how many machines are assigned to each (section, opName) ──
    // Key: sectionLower → opNameLower → count
    // Use .toLowerCase() consistently everywhere to avoid case-mismatch bugs.
    const opsBySection: Record<string, Record<string, number>> = {};
    prodMachines.forEach(m => {
      const sec = (m.section || 'other').toLowerCase().trim();
      const opKey = (m.operation.op_name || 'unknown').toLowerCase().trim();
      if (!opsBySection[sec]) opsBySection[sec] = {};
      opsBySection[sec][opKey] = (opsBySection[sec][opKey] || 0) + 1;
    });

    // ── Step 2: per-section metrics ──
    const sectionMetrics: Record<string, {
      count: number;
      maxCycleTime: number;
      actualOutput: number;
      bottleneckOpName?: string;
    }> = {};

    // Collect every unique section name present in both machines and operations
    const allSecs = new Set<string>([
      ...prodMachines.map(m => (m.section || 'other').toLowerCase().trim()),
      ...operations.map(op => (op.section || 'other').toLowerCase().trim()),
    ]);

    allSecs.forEach(sec => {
      // Skip assembly sub-sections here — they are handled together below
      if (sec.includes('assembly')) return;

      const opsForSection = operations.filter(op =>
        (op.section || 'other').toLowerCase().trim() === sec
      );

      if (opsForSection.length === 0) return;

      let minOutput = Infinity;
      let maxCycleTime = 0;
      let bottleneckOpName = '';
      let totalCount = 0;

      opsForSection.forEach(op => {
        const opKey = (op.op_name || '').toLowerCase().trim();
        const count = opsBySection[sec]?.[opKey] || 0;
        totalCount += count;

        // Skip ops with no machines placed — they don't constrain output yet
        if (count === 0 || op.smv <= 0) return;

        const opOutput = Math.floor((effectiveTimeDaily * count) / op.smv);
        const cycleTime = op.smv / count;

        maxCycleTime = Math.max(maxCycleTime, cycleTime);

        if (opOutput < minOutput) {
          minOutput = opOutput;
          bottleneckOpName = op.op_name;
        }
      });

      sectionMetrics[sec] = {
        count: totalCount,
        maxCycleTime: maxCycleTime,
        actualOutput: minOutput === Infinity ? 0 : minOutput,
        bottleneckOpName: bottleneckOpName,
      };
    });

    // ── Step 3: Assembly — treat all assembly lanes as ONE pool ──
    // Collect all assembly machines and operations regardless of sub-section name
    const assemblyMachines = prodMachines.filter(m =>
      (m.section || '').toLowerCase().includes('assembly')
    );
    const assemblyOps = operations.filter(op =>
      (op.section || '').toLowerCase().includes('assembly')
    );

    // Build per-opName machine count across ALL assembly lanes
    const assemblyOpCount: Record<string, number> = {};
    assemblyMachines.forEach(m => {
      const opKey = (m.operation.op_name || '').toLowerCase().trim();
      assemblyOpCount[opKey] = (assemblyOpCount[opKey] || 0) + 1;
    });

    // Collect all unique assembly sub-section names that actually have machines
    const assemblySubSecs = new Set(
      assemblyMachines.map(m => (m.section || '').toLowerCase().trim())
    );

    let assemblyMinOutput = Infinity;
    let assemblyBottleneck = '';
    let assemblyMaxCycle = 0;
    let assemblyTotalCount = assemblyMachines.length;

    assemblyOps.forEach(op => {
      const opKey = (op.op_name || '').toLowerCase().trim();
      const count = assemblyOpCount[opKey] || 0;
      if (count === 0 || op.smv <= 0) return;

      const opOutput = Math.floor((effectiveTimeDaily * count) / op.smv);
      const cycleTime = op.smv / count;
      assemblyMaxCycle = Math.max(assemblyMaxCycle, cycleTime);

      if (opOutput < assemblyMinOutput) {
        assemblyMinOutput = opOutput;
        assemblyBottleneck = op.op_name;
      }
    });

    const aggregateAssemblyOutput = assemblyMinOutput === Infinity ? 0 : assemblyMinOutput;

    // Populate sectionMetrics for each assembly sub-section (for the health panel display)
    // Each sub-section shows the SAME aggregated output since they share the same bottleneck
    assemblySubSecs.forEach(sec => {
      const subCount = assemblyMachines.filter(
        m => (m.section || '').toLowerCase().trim() === sec
      ).length;
      sectionMetrics[sec] = {
        count: subCount,
        maxCycleTime: assemblyMaxCycle,
        actualOutput: aggregateAssemblyOutput,
        bottleneckOpName: assemblyBottleneck,
      };
    });

    // ── Step 4: Overall line output = min of all prep sections + assembly ──
    let minPrepOutput = Infinity;
    Object.entries(sectionMetrics).forEach(([name, m]) => {
      if (!name.includes('assembly') && m.actualOutput > 0) {
        minPrepOutput = Math.min(minPrepOutput, m.actualOutput);
      }
    });

    const hasAssembly = assemblyTotalCount > 0;
    const actualOutput = hasAssembly
      ? Math.min(
        minPrepOutput === Infinity ? aggregateAssemblyOutput : minPrepOutput,
        aggregateAssemblyOutput
      )
      : (minPrepOutput === Infinity ? 0 : minPrepOutput);

    return {
      sectionMetrics,
      aggregateAssemblyOutput,
      totalAssemblyOperatorsCount: assemblyTotalCount,
      actualOutput: actualOutput === Infinity ? 0 : actualOutput,
      totalOperators: prodMachines.filter(m => !m.isInspection).length,
      totalStyleSMV,
      lineCapacity: 1800,
    };
  }, [operations, machineLayout, workingHours, efficiency, targetOutput, currentLine]);

  const sectionOrder = ['cuff', 'sleeve', 'back', 'collar', 'front', 'assembly'];
  const sortedSections = Object.entries(stats.sectionMetrics).sort((a, b) => {
    const idxA = sectionOrder.findIndex(s => a[0].toLowerCase().includes(s));
    const idxB = sectionOrder.findIndex(s => b[0].toLowerCase().includes(s));
    if (idxA !== -1 && idxB !== -1) {
      if (idxA === idxB) return a[0].localeCompare(b[0]);
      return idxA - idxB;
    }
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a[0].localeCompare(b[0]);
  });

  const isBottlenecked = stats.actualOutput < targetOutput;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden text-[13.5px]">

      {/* Header */}
      <header className="flex-shrink-0 h-16 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-6 z-30">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="hover:bg-secondary">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold leading-tight uppercase tracking-tight">
              {currentLine ? `${currentLine.lineNo}` : 'Factory Twin'}
            </h1>
            <div className="flex items-center gap-3">
              {currentLine?.coneNo && (
                <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-black text-left">
                  {currentLine.coneNo}
                </p>
              )}
              {currentLine?.buyer && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                  <Users className="w-3 h-3 text-primary" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-primary">
                    {currentLine.buyer}
                  </span>
                </div>
              )}
            </div>
          </div>
          
          {/* Space Violation Alert in Header */}
          {(layoutAlerts.length > 0 || layoutError) && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="ml-6 px-4 py-1.5 rounded-xl bg-red-600 border border-red-500 shadow-[0_0_20px_rgba(220,38,38,0.4)] flex items-center gap-2 animate-pulse"
            >
              <AlertCircle className="w-4 h-4 text-white" />
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-white uppercase tracking-widest leading-tight">
                  Space Violation
                </span>
                <span className="text-[8px] font-bold text-white/80 uppercase tracking-tighter leading-none">
                  Capacity Exceeded
                </span>
              </div>
            </motion.div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-secondary/50 rounded-xl p-1 border border-primary/20 gap-1.5 px-2">
            <Button variant={canUndo ? "default" : "outline"} size="icon" onClick={undo} disabled={!canUndo} className="h-8 w-8">
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button variant={canRedo ? "default" : "outline"} size="icon" onClick={redo} disabled={!canRedo} className="h-8 w-8">
              <Redo2 className="w-4 h-4" />
            </Button>
            <Button
              variant={isMoveMode ? "default" : "outline"} size="icon"
              onClick={() => setMoveMode(!isMoveMode)}
              className={`h-8 w-8 ${isMoveMode ? 'bg-primary text-primary-foreground' : ''}`}
            >
              <Move className="w-4 h-4" />
            </Button>
          </div>
          <Button size="sm" onClick={handleSave} className="text-[13px] px-4 font-bold shadow-lg">
            <Save className="w-4 h-4 mr-2" />SAVE PLAN
          </Button>
        </div>
      </header>

      {/* Status banners */}
      <AnimatePresence>
        {layoutAlerts.map(alert => (
          <motion.div
            key={alert.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-600 text-white px-6 py-3 flex items-center justify-between shadow-xl z-20 border-b border-red-500/40"
          >
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-full bg-white/20 animate-pulse">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-black text-[11px] uppercase tracking-[0.2em]">
                  Space Violation
                </span>
                <p className="text-[12px] font-bold opacity-90 leading-tight">{alert.message}</p>
              </div>
            </div>
            <Button
              variant="ghost" size="icon"
              onClick={() => dismissLayoutAlert(alert.id)}
              className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10 rounded-full"
            >
              <X className="w-5 h-5" />
            </Button>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="flex-1 flex overflow-hidden">

        {/* Sidebar */}
        <aside className="w-[340px] border-r border-border bg-card p-6 flex-shrink-0 hidden lg:block overflow-y-auto custom-scrollbar shadow-2xl relative z-10">
          <div className="space-y-8">

            {/* View Controls */}
            <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <Filter className="w-5 h-5 text-primary" />
                <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground">View Controls</h2>
              </div>
              <div className="space-y-3">
                <Label className="text-[10px] text-muted-foreground uppercase font-black text-left block ml-1">Focus Section</Label>
                <Select value={visibleSection || 'all'} onValueChange={(val) => setVisibleSection(val === 'all' ? null : val)}>
                  <SelectTrigger className="h-11 bg-background border-border shadow-sm text-[13px] font-bold hover:border-primary/50 transition-colors">
                    <SelectValue placeholder="All Sections View" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections View</SelectItem>
                    {['Cuff', 'Sleeve', 'Collar', 'Front', 'Back', 'Assembly 1', 'Assembly 2', 'Assembly 3', 'Assembly 4'].map(sec => (
                      <SelectItem key={sec} value={sec.toLowerCase()}>{sec}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Production Specs */}
            <div className="p-5 rounded-3xl bg-secondary/30 border border-border/80 text-left shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <Settings className="w-5 h-5 text-primary" />
                <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground">Production Specs</h2>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-[9px] uppercase font-black text-muted-foreground block tracking-widest px-1">Global Target</Label>
                  <Input
                    type="number" value={localTarget}
                    onChange={(e) => { setLocalTarget(e.target.value); commitParameters(parseInt(e.target.value) || 0, parseInt(localHours) || 0, parseInt(localEfficiency) || 0); }}
                    onBlur={(e) => commitParameters(parseInt(e.target.value) || 0, parseInt(localHours) || 0, parseInt(localEfficiency) || 0)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitParameters(parseInt(localTarget) || 0, parseInt(localHours) || 0, parseInt(localEfficiency) || 0); }}
                    className="h-10 text-[14px] font-black bg-background border-2 border-border focus:border-primary shadow-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[9px] uppercase font-black text-muted-foreground block tracking-widest px-1">Hours/Shift</Label>
                  <Input
                    type="number" value={localHours}
                    onChange={(e) => { setLocalHours(e.target.value); commitParameters(parseInt(localTarget) || 0, parseInt(e.target.value) || 0, parseInt(localEfficiency) || 0); }}
                    onBlur={(e) => commitParameters(parseInt(localTarget) || 0, parseInt(e.target.value) || 0, parseInt(localEfficiency) || 0)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitParameters(parseInt(localTarget) || 0, parseInt(localHours) || 0, parseInt(localEfficiency) || 0); }}
                    className="h-10 text-[14px] font-black bg-background border-2 border-border focus:border-primary shadow-sm"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label className="text-[9px] uppercase font-black text-muted-foreground block tracking-widest px-1">Line Efficiency (%)</Label>
                  <Input
                    type="number" value={localEfficiency}
                    onChange={(e) => { setLocalEfficiency(e.target.value); commitParameters(parseInt(localTarget) || 0, parseInt(localHours) || 0, parseInt(e.target.value) || 0); }}
                    onBlur={(e) => commitParameters(parseInt(localTarget) || 0, parseInt(localHours) || 0, parseInt(e.target.value) || 0)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitParameters(parseInt(localTarget) || 0, parseInt(localHours) || 0, parseInt(localEfficiency) || 0); }}
                    className="h-10 text-[14px] font-black bg-background border-2 border-border focus:border-primary shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Preparatory Processes */}
            {preparatoryOps && preparatoryOps.length > 0 && (
              <div className="rounded-3xl overflow-hidden border border-amber-500/20 shadow-sm text-left">
                <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/5 px-5 py-3.5 flex items-center gap-3 border-b border-amber-500/15">
                  <Scissors className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground">Preparatory Processes</span>
                  <span className="ml-auto text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-black shadow-sm shadow-amber-500/30">{preparatoryOps.length}</span>
                </div>
                <div className="p-3 space-y-1.5 max-h-48 overflow-y-auto">
                  {preparatoryOps.map((op, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl hover:bg-amber-500/5 transition-colors group">
                      <span className="text-[11px] font-black text-amber-500/50 min-w-[20px] text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-foreground/90 truncate">{op.op_name}</p>
                        <p className="text-[10px] font-medium text-muted-foreground/60 mt-0.5">{op.machine_type} · {op.smv?.toFixed(2)} min</p>
                      </div>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => moveToLayout(i)}
                        className="h-8 w-8 text-amber-500 hover:bg-amber-500/20 opacity-0 group-hover:opacity-100 transition-all rounded-lg"
                        title="Move to Layout (Sequential Position)"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Line Statistics */}
            <div className="text-left py-2">
              <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-6 px-1">Line Statistics</h2>
              <div className="space-y-3.5">

                <div className="group flex items-center gap-4 p-5 rounded-3xl bg-blue-500/10 border-2 border-blue-500/20 shadow-sm transition-all hover:scale-[1.02]">
                  <div className="p-3 rounded-2xl bg-blue-500 text-white shadow-lg shadow-blue-500/20"><Users className="w-6 h-6" /></div>
                  <div className="flex-1">
                    <span className="text-[9px] uppercase font-black text-blue-600/80 block mb-0.5 tracking-widest">Operators</span>
                    <p className="text-[26px] font-black leading-none tracking-tight">{stats.totalOperators}</p>
                  </div>
                </div>

                <div className="group flex items-center gap-4 p-5 rounded-3xl bg-amber-500/10 border-2 border-amber-500/20 shadow-sm transition-all hover:scale-[1.02]">
                  <div className="p-3 rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20"><Activity className="w-6 h-6" /></div>
                  <div className="flex-1">
                    <span className="text-[9px] uppercase font-black text-amber-600/80 block mb-0.5 tracking-widest">Total Style SMV</span>
                    <p className="text-[26px] font-black leading-none tracking-tight">{stats.totalStyleSMV.toFixed(2)}</p>
                  </div>
                </div>

                <div className="group flex items-center gap-4 p-5 rounded-3xl bg-blue-500/10 border-2 border-blue-500/20 shadow-sm transition-all hover:scale-[1.02]">
                  <div className="p-3 rounded-2xl bg-blue-500 text-white shadow-lg shadow-blue-500/20"><Target className="w-6 h-6" /></div>
                  <div className="flex-1">
                    <span className="text-[9px] uppercase font-black text-blue-600/80 block mb-0.5 tracking-widest">Live Output</span>
                    <p className="text-[26px] font-black leading-none tracking-tight">{stats.actualOutput}</p>
                  </div>
                </div>

                <div className="group flex items-center gap-4 p-5 rounded-3xl bg-purple-500/10 border-2 border-purple-500/20 shadow-sm transition-all hover:scale-[1.02]">
                  <div className="p-3 rounded-2xl bg-purple-500 text-white shadow-lg shadow-purple-500/20"><Target className="w-6 h-6" /></div>
                  <div className="flex-1">
                    <span className="text-[9px] uppercase font-black text-purple-600/80 block mb-0.5 tracking-widest">Line Capacity</span>
                    <p className="text-[26px] font-black leading-none tracking-tight">{stats.lineCapacity.toLocaleString()}</p>
                  </div>
                </div>

              </div>
            </div>

            {/* Section Health */}
            <div className="pt-4 text-left border-t border-border/50">
              <h3 className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-6 px-1">Section Health</h3>
              <div className="space-y-3.5">
                {(() => {
                  const assemblyLines = sortedSections.filter(([n]) => n.toLowerCase().includes('assembly'));
                  const prepSections = sortedSections.filter(([n]) => !n.toLowerCase().includes('assembly'));

                  return (
                    <>
                      {prepSections.map(([name]) => {
                        const m = stats.sectionMetrics[name];
                        return (
                          <div key={name} className="flex items-center justify-between p-4 rounded-2xl border-2 bg-card border-border/60 hover:border-primary/40 shadow-sm transition-all">
                            <div className="flex flex-col flex-1 overflow-hidden mr-2">
                              <span className="font-black text-foreground text-[13px] uppercase tracking-tight truncate">{name}</span>
                            </div>
                            <div className="flex items-center gap-5 text-right flex-shrink-0">
                              <span className="font-black text-muted-foreground/30 text-[10px] uppercase tracking-tighter">{m.count} MC</span>
                              <span className="font-black min-w-[50px] text-[18px] tracking-tighter text-foreground">{m.actualOutput}</span>
                            </div>
                          </div>
                        );
                      })}

                      {/* Assembly collapsed/expanded */}
                      <div className="pt-3">
                        <div
                          onClick={() => setIsAssemblyExpanded(!isAssemblyExpanded)}
                          className="flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all bg-primary/5 border-primary/20 shadow-sm"
                        >
                          <div className="flex items-center gap-3 flex-1 overflow-hidden">
                            <div className="p-1.5 rounded-lg bg-primary/10 flex-shrink-0">
                              {isAssemblyExpanded
                                ? <ChevronUp className="w-4 h-4 text-primary" />
                                : <ChevronDown className="w-4 h-4 text-primary" />}
                            </div>
                            <span className="font-black text-foreground text-[13px] uppercase tracking-tight">Assembly Zone</span>
                          </div>
                          <div className="flex items-center gap-5 text-right flex-shrink-0">
                            <span className="font-black text-muted-foreground/30 text-[10px] uppercase tracking-tighter">
                              {stats.totalAssemblyOperatorsCount} MC
                            </span>
                            <span className="font-black min-w-[50px] text-[18px] tracking-tighter text-foreground">
                              {stats.aggregateAssemblyOutput}
                            </span>
                          </div>
                        </div>

                        <AnimatePresence>
                          {isAssemblyExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden mt-3 ml-4 space-y-2 border-l-4 border-primary/20 pl-5"
                            >
                              {assemblyLines.map(([name]) => {
                                const sm = stats.sectionMetrics[name];
                                return (
                                  <div key={name} className="flex items-center justify-between p-3.5 rounded-xl bg-secondary/10 border border-border/50">
                                    <div className="flex flex-col flex-1 overflow-hidden mr-2">
                                      <span className="font-bold text-[13px] uppercase tracking-tight opacity-80 truncate">{name}</span>
                                    </div>
                                    <div className="flex items-center gap-5 flex-shrink-0 text-right">
                                      <span className="text-[9px] font-black text-muted-foreground/40">{sm.count} MC</span>
                                      <span className="font-black text-[15px] min-w-[40px] text-foreground">{sm.actualOutput}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Legend */}
            <div className="pt-8 border-t border-border/50 text-left pb-10">
              <h3 className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                <Info className="w-4 h-4" /> 3D Legend
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { color: 'bg-blue-500', label: 'Single Needle' },
                  { color: 'bg-purple-500', label: 'Overlock' },
                  { color: 'bg-orange-500', label: 'Iron/Table' },
                  { color: 'bg-pink-500', label: 'Special M/C' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3 text-[12px] text-muted-foreground font-bold italic">
                    <div className={`w-3.5 h-3.5 rounded shadow-inner ${item.color}`} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-8 p-4 rounded-3xl bg-primary/5 text-[11px] text-muted-foreground font-medium leading-relaxed border border-primary/10 italic">
                Pro-Tip: Use Efficiency to simulate real-world conditions on your current floor layout.
              </p>
            </div>

          </div>
        </aside>

        {/* 3D Scene */}
        <main className="flex-1 relative bg-neutral-900 z-0">
          <Scene3D />
          {!isMoveMode && <MachineInfoPanel />}

          <AnimatePresence>
            {isMoveMode && selectedMachines.length > 0 && (
              <motion.div
                initial={{ y: 20, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 20, opacity: 0, scale: 0.95 }}
                className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-xl border border-primary/20 p-3 pl-4 rounded-xl shadow-[0_15px_40px_rgba(0,0,0,0.5)] z-50 flex items-center gap-6 min-w-[340px]"
              >
                <div className="flex items-center gap-3 border-r border-border/50 pr-6">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                    <Move className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-[9px] font-black uppercase tracking-[0.1em] text-primary/70">Selection</span>
                    <h3 className="text-[13px] font-bold uppercase tracking-tight text-foreground leading-none">{selectedMachines.length} Items</h3>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!isDraggingActive ? (
                    <Button
                      size="sm"
                      onClick={() => setDraggingActive(true)}
                      className="bg-primary text-primary-foreground font-black px-4 h-8 rounded-lg shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all text-[11px] uppercase tracking-wider"
                    >
                      MOVE
                    </Button>
                  ) : (
                    <div className="flex items-center px-3 bg-primary/10 border border-primary/20 rounded-lg text-[10px] font-black text-primary uppercase tracking-widest animate-pulse">
                      Dragging...
                    </div>
                  )}
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => { setDraggingActive(false); setMoveMode(false); }}
                    className="font-black px-4 h-8 rounded-lg border border-border/30 bg-secondary/30 text-[11px] uppercase tracking-wider hover:bg-secondary/50"
                  >
                    DONE
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

      </div>
    </div>
  );
};

export default LinePlannerPage;
