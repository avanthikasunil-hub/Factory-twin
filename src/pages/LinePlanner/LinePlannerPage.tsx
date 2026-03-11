import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, Factory, Eye, Activity, Target,
  Undo2, Redo2, Move, AlertCircle, X, ChevronDown, ChevronUp, Settings, Filter,
  Users, Scissors, TrendingUp, Info, RefreshCw
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
    layoutAlerts, dismissLayoutAlert, fetchAndApplyOB
  } = useLineStore();

  // ─── Local input state (UI only — committed on blur/Enter, NOT on every keystroke) ───
  const [localTarget, setLocalTarget] = useState(targetOutput.toString());
  const [localHours, setLocalHours] = useState(workingHours.toString());
  const [localEfficiency, setLocalEfficiency] = useState(efficiency.toString());
  const [isAssemblyExpanded, setIsAssemblyExpanded] = useState(false);

  useEffect(() => {
    if (currentLine?.lineNo && (currentLine as any).styleNo && (currentLine as any).coneNo) {
      fetchAndApplyOB(currentLine.lineNo, (currentLine as any).styleNo, (currentLine as any).coneNo);
    }
  }, [currentLine?.lineNo, (currentLine as any)?.styleNo, (currentLine as any)?.coneNo, fetchAndApplyOB]);

  // ─── HOT REFRESH: Auto-update layout when logic code changes ──────────────────
  const { layoutLogicVersion, setLayoutLogicVersion } = useLineStore();

  useEffect(() => {
    if (layoutLogicVersion !== LAYOUT_LOGIC_VERSION && operations.length > 0) {
      console.log(`[HMR] Layout Logic Upgrade detected (${layoutLogicVersion} -> ${LAYOUT_LOGIC_VERSION}). Refreshing...`);
      generateMachineLayout(operations);
      setLayoutLogicVersion(LAYOUT_LOGIC_VERSION);
    }
  }, [layoutLogicVersion, LAYOUT_LOGIC_VERSION, operations, generateMachineLayout, setLayoutLogicVersion]);

  // Keep local inputs in sync when store values change externally (e.g. load line)
  useEffect(() => {
    setLocalTarget(targetOutput.toString());
  }, [targetOutput]);
  useEffect(() => {
    setLocalHours(workingHours.toString());
  }, [workingHours]);
  useEffect(() => {
    setLocalEfficiency(efficiency.toString());
  }, [efficiency]);

  // ─── FIX 1: Remove the useEffect that called generateMachineLayout on every
  //     operations/targetOutput/workingHours change.
  //     updateLineWithNewOB (called in CreateLinePage) already runs generateLayout
  //     internally before we even arrive here, so re-running it on mount would
  //     overwrite the fresh layout with a duplicate (or worse, a stale one).
  //
  //     Layout is only regenerated when the user explicitly commits new production
  //     spec values (see commitParameters below).
  // ────────────────────────────────────────────────────────────────────────────

  // ─── FIX 2: Debounced commit — setLineParameters is only called 600 ms after
  //     the user STOPS typing, preventing rapid-fire calls like
  //     Target:9 → Target:90 → Target:900 that each regenerated the full layout. ───
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitParameters = useCallback((
    newTarget: number,
    newHours: number,
    newEfficiency: number
  ) => {
    // Guard: don't regenerate with obviously incomplete/invalid values
    if (newTarget <= 0 || newHours <= 0 || operations.length === 0) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLineParameters(newTarget, newHours, newEfficiency);
    }, 300);
  }, [operations.length, setLineParameters]);

  // Clean up on unmount
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────────
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

  // ─── Save ────────────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (currentLine) {
      saveLine(currentLine);
      toast({ title: "Line Saved", description: `Line ${currentLine.lineNo} has been saved` });
    }
  };

  // ─── Auto-dismiss layout warnings after 5 s ──────────────────────────────────
  useEffect(() => {
    if (warnings.length > 0 && !layoutError) {
      const timer = setTimeout(() => clearWarnings(), 5000);
      return () => clearTimeout(timer);
    }
  }, [warnings, layoutError, clearWarnings]);

  // ─── Production stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalStyleSMV = currentLine?.totalSMV || operations.reduce((sum, op) => sum + (op.smv || 0), 0);
    const prodMachines = machineLayout.filter(m =>
      m.operation &&
      !m.operation.machine_type.toLowerCase().includes('pathway') &&
      !m.operation.machine_type.toLowerCase().includes('supermarket') &&
      !m.id.toLowerCase().includes('board')
    );

    const effectiveTimeDaily = workingHours * 60 * (efficiency / 100);

    const opsBySection = prodMachines.reduce((acc, m) => {
      const sec = (m.section || "Other").toLowerCase().trim();
      const opKey = (m.operation.op_name || 'unknown').trim().toLowerCase();
      if (!acc[sec]) acc[sec] = {};
      if (!acc[sec][opKey]) acc[sec][opKey] = { op: m.operation, count: 0 };
      acc[sec][opKey].count++;
      return acc;
    }, {} as Record<string, Record<string, { op: Operation, count: number }>>);

    const sectionMetrics: Record<string, {
      count: number;
      maxCycleTime: number;
      actualOutput: number;
      bottleneckOpName?: string;
    }> = {};

    const allSecs = new Set([
      ...prodMachines.map(m => (m.section || "Other").toLowerCase().trim()),
      ...operations.map(op => (op.section || "Other").toLowerCase().trim())
    ]);

    allSecs.forEach(sec => {
      let minSectionOpOutput = Infinity;
      let bottleneckOpName = "";
      let maxSectionCycleTime = 0;
      let totalCount = 0;
      const isAssySec = sec.toLowerCase().includes('assembly');

      const relevantOps = operations.filter(op => {
        const opSec = (op.section || "Other").toLowerCase();
        const opNameKey = (op.op_name || '').trim().toLowerCase();
        if (isAssySec) {
          const countInThisSec = opsBySection[sec]?.[opNameKey]?.count || 0;
          return opSec.includes('assembly') && countInThisSec > 0;
        }
        return opSec === sec.toLowerCase();
      });

      if (relevantOps.length === 0 && !opsBySection[sec]) return;

      relevantOps.forEach(op => {
        const opNameKey = (op.op_name || '').trim().toLowerCase();
        const count = opsBySection[sec]?.[opNameKey]?.count || 0;
        totalCount += count;

        if (op.smv > 0) {
          const opOutput = Math.floor((effectiveTimeDaily * count) / op.smv);
          const cycleTime = count > 0 ? (op.smv / count) : Infinity;
          if (count > 0) maxSectionCycleTime = Math.max(maxSectionCycleTime, cycleTime);
          else maxSectionCycleTime = Infinity;

          if (opOutput < minSectionOpOutput) {
            minSectionOpOutput = opOutput;
            bottleneckOpName = op.op_name;
          }
        }
      });

      sectionMetrics[sec] = {
        count: totalCount,
        maxCycleTime: maxSectionCycleTime === Infinity ? 999 : maxSectionCycleTime,
        actualOutput: minSectionOpOutput === Infinity ? 0 : minSectionOpOutput,
        bottleneckOpName: bottleneckOpName || (relevantOps.length > 0 ? relevantOps[0].op_name : "")
      };
    });

    const aggregateAssemblyOutput = Object.entries(sectionMetrics)
      .filter(([name]) => name.toLowerCase().includes('assembly'))
      .reduce((sum, [_, m]) => sum + m.actualOutput, 0);

    const totalAssemblyOpsCount = Object.entries(sectionMetrics)
      .filter(([name]) => name.toLowerCase().includes('assembly'))
      .reduce((sum, [_, m]) => sum + m.count, 0);

    let minPrepOutput = Infinity;
    Object.keys(sectionMetrics).forEach(s => {
      if (!s.toLowerCase().includes('assembly')) {
        if (sectionMetrics[s].actualOutput < minPrepOutput) minPrepOutput = sectionMetrics[s].actualOutput;
      }
    });

    const hasAssembly = Object.keys(sectionMetrics).some(s => s.toLowerCase().includes('assembly'));
    const actualOutput = hasAssembly
      ? Math.min(minPrepOutput === Infinity ? 999999 : minPrepOutput, aggregateAssemblyOutput)
      : (minPrepOutput === Infinity ? 0 : minPrepOutput);

    const totalOperatorsCount = prodMachines.filter(m => !m.isInspection).length;
    const lineCapacity = totalStyleSMV > 0
      ? Math.floor((totalOperatorsCount * workingHours * 60 * (efficiency / 100)) / totalStyleSMV / 100) * 100
      : 0;

    return {
      sectionMetrics,
      aggregateAssemblyOutput,
      totalAssemblyOperatorsCount: totalAssemblyOpsCount,
      actualOutput: actualOutput === 999999 ? 0 : actualOutput,
      totalOperators: prodMachines.length,
      totalStyleSMV,
      lineCapacity
    };
  }, [operations, machineLayout, workingHours, efficiency, targetOutput]);

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

  // ─── Render ──────────────────────────────────────────────────────────────────
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
            {currentLine?.coneNo && (
              <div className="flex items-center gap-3">
                <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-black text-left">
                  {currentLine.coneNo}
                </p>
                {currentLine.buyer && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                    <Users className="w-3 h-3 text-primary" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-primary">
                      {currentLine.buyer}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
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
        {(layoutError || (warnings && warnings.length > 0)) && (
          <motion.div
            key="layout-status"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`${layoutError ? 'bg-red-600 border-red-500/50' : 'bg-emerald-600 border-emerald-500/50'} text-white px-6 py-3 flex items-center justify-between shadow-2xl z-20 border-b`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-1.5 ${layoutError ? 'bg-white/20 animate-pulse' : 'bg-white/10'} rounded-full`}>
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-black text-[11px] uppercase tracking-[0.2em]">Layout Status Alert</span>
                <p className="text-[12px] font-bold opacity-90 leading-tight">
                  {layoutError || (warnings && warnings[0])}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => clearWarnings()} className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10 rounded-full">
              <X className="w-5 h-5" />
            </Button>
          </motion.div>
        )}

        {layoutAlerts.map(alert => (
          <motion.div
            key={alert.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={
              alert.type === 'red'
                ? 'bg-red-600 text-white px-6 py-3 flex items-center justify-between shadow-xl z-20 border-b border-red-500/40'
                : 'bg-emerald-600 text-white px-6 py-3 flex items-center justify-between shadow-xl z-20 border-b border-emerald-500/40'
            }
          >
            <div className="flex items-center gap-3">
              <div className={`p-1.5 rounded-full ${alert.type === 'red' ? 'bg-white/20 animate-pulse' : 'bg-white/10'}`}>
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-black text-[11px] uppercase tracking-[0.2em]">
                  {alert.type === 'red' ? 'Space Violation' : 'Overflow Info'}
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

            {/* Production Specs
                FIX: inputs only update local state while typing.
                     setLineParameters (which calls generateLayout) fires only
                     600 ms after the user stops typing via commitParameters.   */}
            <div className="p-5 rounded-3xl bg-secondary/30 border border-border/80 text-left shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <Settings className="w-5 h-5 text-primary" />
                <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground">Production Specs</h2>
              </div>
              <div className="grid grid-cols-2 gap-5">

                {/* Target Output */}
                <div className="space-y-2">
                  <Label className="text-[9px] uppercase font-black text-muted-foreground block tracking-widest px-1">
                    Global Target
                  </Label>
                  <Input
                    type="number"
                    value={localTarget}
                    onChange={(e) => {
                      const valStr = e.target.value;
                      setLocalTarget(valStr);
                      const val = parseInt(valStr) || 0;
                      commitParameters(val, parseInt(localHours) || 0, parseInt(localEfficiency) || 0);
                    }}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      commitParameters(val, parseInt(localHours) || 0, parseInt(localEfficiency) || 0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = parseInt(localTarget) || 0;
                        commitParameters(val, parseInt(localHours) || 0, parseInt(localEfficiency) || 0);
                      }
                    }}
                    className="h-10 text-[14px] font-black bg-background border-2 border-border focus:border-primary shadow-sm"
                  />
                </div>

                {/* Hours/Shift */}
                <div className="space-y-2">
                  <Label className="text-[9px] uppercase font-black text-muted-foreground block tracking-widest px-1">
                    Hours/Shift
                  </Label>
                  <Input
                    type="number"
                    value={localHours}
                    onChange={(e) => {
                      const valStr = e.target.value;
                      setLocalHours(valStr);
                      const val = parseInt(valStr) || 0;
                      commitParameters(parseInt(localTarget) || 0, val, parseInt(localEfficiency) || 0);
                    }}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      commitParameters(parseInt(localTarget) || 0, val, parseInt(localEfficiency) || 0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = parseInt(localHours) || 0;
                        commitParameters(parseInt(localTarget) || 0, val, parseInt(localEfficiency) || 0);
                      }
                    }}
                    className="h-10 text-[14px] font-black bg-background border-2 border-border focus:border-primary shadow-sm"
                  />
                </div>

                {/* Efficiency */}
                <div className="col-span-2 space-y-2">
                  <Label className="text-[9px] uppercase font-black text-muted-foreground block tracking-widest px-1">
                    Line Efficiency (%)
                  </Label>
                  <Input
                    type="number"
                    value={localEfficiency}
                    onChange={(e) => {
                      const valStr = e.target.value;
                      setLocalEfficiency(valStr);
                      const val = parseInt(valStr) || 0;
                      commitParameters(parseInt(localTarget) || 0, parseInt(localHours) || 0, val);
                    }}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      commitParameters(parseInt(localTarget) || 0, parseInt(localHours) || 0, val);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = parseInt(localEfficiency) || 0;
                        commitParameters(parseInt(localTarget) || 0, parseInt(localHours) || 0, val);
                      }
                    }}
                    className="h-10 text-[14px] font-black bg-background border-2 border-border focus:border-primary shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Line Statistics */}
            <div className="text-left py-2">
              <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-6 px-1">Line Statistics</h2>
              <div className="space-y-3.5">

                <div className="group flex items-center gap-4 p-5 rounded-3xl bg-blue-500/10 border-2 border-blue-500/20 shadow-sm transition-all hover:scale-[1.02]">
                  <div className="p-3 rounded-2xl bg-blue-500 text-white shadow-lg shadow-blue-500/20">
                    <Users className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <span className="text-[9px] uppercase font-black text-blue-600/80 block mb-0.5 tracking-widest">Operators</span>
                    <p className="text-[26px] font-black leading-none tracking-tight">{stats.totalOperators}</p>
                  </div>
                </div>

                <div className="group flex items-center gap-4 p-5 rounded-3xl bg-amber-500/10 border-2 border-amber-500/20 shadow-sm transition-all hover:scale-[1.02]">
                  <div className="p-3 rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20">
                    <Activity className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <span className="text-[9px] uppercase font-black text-amber-600/80 block mb-0.5 tracking-widest">Total Style SMV</span>
                    <p className="text-[26px] font-black leading-none tracking-tight">{stats.totalStyleSMV.toFixed(2)}</p>
                  </div>
                </div>

                <div className={`group flex items-center gap-4 p-5 rounded-3xl border-2 transition-all hover:scale-[1.05] ${isBottlenecked ? 'bg-orange-500/10 border-orange-500/30' : 'bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/10'}`}>
                  <div className={`p-3 rounded-2xl text-white shadow-lg ${isBottlenecked ? 'bg-orange-500 shadow-orange-500/20' : 'bg-emerald-500 shadow-emerald-500/20'}`}>
                    <Target className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <span className={`text-[9px] uppercase font-black block mb-0.5 tracking-widest ${isBottlenecked ? 'text-orange-600' : 'text-emerald-600'}`}>Live Output</span>
                    <p className="text-[26px] font-black leading-none tracking-tight">{stats.actualOutput}</p>
                  </div>
                </div>

                <div className="group flex items-center gap-4 p-5 rounded-3xl bg-purple-500/10 border-2 border-purple-500/20 shadow-sm transition-all hover:scale-[1.02]">
                  <div className="p-3 rounded-2xl bg-purple-500 text-white shadow-lg shadow-purple-500/20">
                    <Target className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <span className="text-[9px] uppercase font-black text-purple-600/80 block mb-0.5 tracking-widest">Line Capacity @ 90% Eff</span>
                    <p className="text-[26px] font-black leading-none tracking-tight">1,800</p>
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
                        const isBtl = m.actualOutput < targetOutput;
                        return (
                          <div key={name} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${isBtl ? 'bg-orange-500/5 border-orange-500/30' : 'bg-card border-border/60 hover:border-primary/40 shadow-sm'}`}>
                            <div className="flex flex-col flex-1 overflow-hidden mr-2">
                              <span className="font-black text-foreground text-[13px] uppercase tracking-tight truncate">{name}</span>
                              {isBtl && <span className="text-[8px] text-orange-600 font-black uppercase tracking-widest mt-0.5 truncate">⚠️ {m.bottleneckOpName}</span>}
                            </div>
                            <div className="flex items-center gap-5 text-right flex-shrink-0">
                              <span className="font-black text-muted-foreground/30 text-[10px] uppercase tracking-tighter">{m.count} MC</span>
                              <span className={`font-black min-w-[50px] text-[18px] tracking-tighter ${m.actualOutput < targetOutput ? 'text-orange-600' : 'text-emerald-600'}`}>
                                {m.actualOutput}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      <div className="pt-3">
                        <div
                          onClick={() => setIsAssemblyExpanded(!isAssemblyExpanded)}
                          className={`flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all ${stats.aggregateAssemblyOutput < targetOutput ? 'bg-orange-500/5 border-orange-500/30' : 'bg-primary/5 border-primary/20 shadow-sm'}`}
                        >
                          <div className="flex items-center gap-3 flex-1 overflow-hidden">
                            <div className="p-1.5 rounded-lg bg-primary/10 flex-shrink-0">
                              {isAssemblyExpanded ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-primary" />}
                            </div>
                            <div className="flex flex-col text-left overflow-hidden">
                              <span className="font-black text-foreground text-[13px] uppercase tracking-tight truncate">Assembly Zone</span>
                              {stats.aggregateAssemblyOutput < targetOutput && (
                                <span className="text-[8px] text-orange-600 font-black uppercase tracking-widest mt-0.5 truncate">⚠️ Capacity Limited</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-5 text-right flex-shrink-0">
                            <span className="font-black text-muted-foreground/30 text-[10px] uppercase tracking-tighter">{stats.totalAssemblyOperatorsCount} MC</span>
                            <span className={`font-black min-w-[50px] text-[18px] tracking-tighter ${stats.aggregateAssemblyOutput < targetOutput ? 'text-orange-600' : 'text-emerald-600'}`}>
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
                                const lineTarget = Math.floor(targetOutput / (assemblyLines.length || 1));
                                const isLbtl = sm.actualOutput < lineTarget;
                                return (
                                  <div key={name} className="flex items-center justify-between p-3.5 rounded-xl bg-secondary/10 border border-border/50">
                                    <div className="flex flex-col flex-1 overflow-hidden mr-2">
                                      <span className="font-bold text-[13px] uppercase tracking-tight opacity-80 truncate">{name}</span>
                                      {isLbtl && <span className="text-[8px] text-orange-600 font-black uppercase tracking-widest truncate">⚠️ {sm.bottleneckOpName}</span>}
                                    </div>
                                    <div className="flex items-center gap-5 flex-shrink-0 text-right">
                                      <span className="text-[9px] font-black text-muted-foreground/40">{sm.count} MC</span>
                                      <span className={`font-black text-[15px] min-w-[40px] ${sm.actualOutput < lineTarget ? 'text-orange-500' : 'text-emerald-500'}`}>
                                        {sm.actualOutput}
                                      </span>
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
                  { color: 'bg-pink-500', label: 'Special M/C' }
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
