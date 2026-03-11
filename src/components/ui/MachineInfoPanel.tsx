import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings, Cpu, Clock, Layers, RotateCw, Trash2, Plus, Edit3, Move, Activity } from 'lucide-react';
import { useLineStore } from '@/store/useLineStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, SelectLabel, SelectSeparator } from '@/components/ui/select';
import { getMachineCategory } from '@/utils/obParser';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MACHINE_BADGE_COLORS: Record<string, string> = {
  snls: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  snec: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  iron: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  button: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  bartack: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  helper: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
  special: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  default: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export const MachineInfoPanel = () => {
  const {
    selectedMachine,
    setSelectedMachine,
    operations,
    rotateMachine,
    deleteMachine,
    addMachine,
    isMoveMode,
    setMoveMode,
    machineLayout,
    workingHours,
    efficiency
  } = useLineStore();

  // Local state for adding a new machine within this section
  const [newOpName, setNewOpName] = useState('');
  const [newType, setNewType] = useState('SNLS');
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    setShowAddForm(false);
  }, [selectedMachine]);

  const operation = selectedMachine?.operation;
  const machineCategory = operation ? getMachineCategory(operation.machine_type || "other") : 'default';
  const badgeColor = MACHINE_BADGE_COLORS[machineCategory] || MACHINE_BADGE_COLORS.default;

  // Calculate actual output capacity for this specific operation
  let calcOutput = 0;
  let outputPerMachine = 0;
  let opMachineCount = 1;

  if (operation) {
    const exactSection = selectedMachine.section || operation.section || "";
    const opName = (operation.op_name || "").trim().toLowerCase();

    opMachineCount = machineLayout.filter(m =>
      (m.operation.op_name || "").trim().toLowerCase() === opName &&
      (m.section || m.operation.section || "") === exactSection
    ).length;

    // Fallback to 1 if none found
    if (opMachineCount === 0) opMachineCount = 1;

    if (operation.smv > 0) {
      const effectiveTime = workingHours * 60 * (efficiency / 100);
      // Calculate output for ONE machine
      calcOutput = Math.floor(effectiveTime / operation.smv);
    }
  }

  // Reactive section machine list sorted by X position (for hover panel numbered list)
  const sectionMachines = useMemo(() => {
    if (!selectedMachine?.section && !operation?.section) return [];
    const sec = (selectedMachine?.section || operation?.section || "").toLowerCase();
    return machineLayout
      .filter(m => (m.section || "").toLowerCase() === sec && !m.isInspection)
      .sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));
  }, [machineLayout, selectedMachine?.section, operation?.section]);

  return (
    <AnimatePresence>
      {selectedMachine && operation && (
        <motion.div
          key="machine-info"
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="absolute right-4 top-4 w-80 glass-card rounded-xl overflow-hidden z-20 flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-primary/20 to-accent/20 p-4 border-b border-border/50 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/20">
                  <Settings className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground tracking-tight">
                    {(() => {
                      const posIdx = sectionMachines.findIndex(m => m.id === selectedMachine.id);
                      const pos = posIdx >= 0 ? posIdx + 1 : (selectedMachine.machineIndex !== undefined ? selectedMachine.machineIndex + 1 : '?');
                      const total = sectionMachines.length || '?';
                      return `Machine ${pos} / ${total}`;
                    })()}
                  </h3>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest truncate max-w-[160px]">
                    {operation.op_name || operation.machine_type}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 px-2 flex items-center gap-1">
                      <Edit3 className="w-3 h-3" />
                      <span className="text-xs">Edit</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Machine Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => rotateMachine(selectedMachine.id)} className="cursor-pointer flex items-center">
                      <RotateCw className="w-4 h-4 mr-2" />
                      <span>Rotate 90°</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowAddForm(true)} className="cursor-pointer flex items-center">
                      <Plus className="w-4 h-4 mr-2" />
                      <span>Add Machine</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => deleteMachine(selectedMachine.id)}
                      className="cursor-pointer text-destructive focus:bg-destructive focus:text-destructive-foreground flex items-center"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      <span>Delete Machine</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedMachine(null)}
                  className="h-8 w-8 hover:bg-destructive/20 ml-1"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="p-4 space-y-6 overflow-y-auto">

            {/* Current Machine Info Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-primary/70" />
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Current Machine</h4>
              </div>

              {/* Operation Description */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Operation Name
                </label>
                <p className="text-foreground font-medium mt-1">
                  {operation.op_name || "N/A"}
                </p>
              </motion.div>

              {/* Machine Type - Only show if different from Op Name */}
              {operation.machine_type.toLowerCase() !== operation.op_name.toLowerCase() && (
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-secondary">
                    <Cpu className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Machine Type
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded-md text-sm border ${badgeColor}`}>
                        {operation.machine_type || "Unknown"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* SMV */}
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary">
                  <Clock className="w-4 h-4 text-accent" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Operation Time</span>
                  <p className="text-lg font-black text-foreground">
                    {operation.smv ? `${Number(operation.smv).toFixed(2)} min` : "N/A"}
                  </p>
                </div>
              </div>

              {/* Section Info */}
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary">
                  <Layers className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Section
                  </label>
                  <p className="text-foreground font-medium mt-1">
                    {operation.section || "N/A"}
                  </p>
                </div>
              </div>

              {/* Output Capacity */}
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary">
                  <Activity className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                    Calculated Output
                  </label>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-xl font-black text-foreground">{calcOutput}</span>
                    <span className="text-xs text-muted-foreground">total units/day</span>
                  </div>
                </div>
              </div>

              {/* No. of Machines */}
              <div className="flex items-center gap-3 mt-4">
                <div className="p-2 rounded-lg bg-secondary">
                  <Cpu className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                    No. of Machines
                  </label>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-xl font-black text-foreground">{opMachineCount}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Add New Machine in this Section */}
            {
              showAddForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="pt-4 border-t border-border/50 space-y-4 relative"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 -top-2 h-6 w-6 text-muted-foreground"
                    onClick={() => setShowAddForm(false)}
                  >
                    <X className="w-3 h-3" />
                  </Button>

                  {/* Add New Machine in this Section */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2">
                      <Plus className="w-4 h-4 text-primary" />
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Add New Machine</h4>
                    </div>

                    <div className="space-y-3 p-3 bg-primary/5 rounded-xl border border-primary/10">
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-muted-foreground uppercase font-bold px-1">Manual Operation Name</label>
                        <Input
                          placeholder="Enter Operation Name..."
                          className="h-8 text-sm"
                          value={newOpName}
                          onChange={(e) => setNewOpName(e.target.value)}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-muted-foreground uppercase font-bold px-1">Machine Required</label>
                        <Select value={newType} onValueChange={setNewType}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel className="text-[10px] opacity-50 font-bold uppercase py-1 px-2">Sewing Machines</SelectLabel>
                              <SelectItem value="SNLS">Single Needle (SNLS)</SelectItem>
                              <SelectItem value="DNLS">Double Needle (DNLS)</SelectItem>
                              <SelectItem value="SNEC">SNEC / Overlock</SelectItem>
                              <SelectItem value="Overlock">3-Thread Overlock (OL)</SelectItem>
                              <SelectItem value="FOA">Feed Off Arm (FOA)</SelectItem>
                              <SelectItem value="Bartack">Bartack M/C</SelectItem>
                            </SelectGroup>

                            <SelectSeparator className="opacity-10" />

                            <SelectGroup>
                              <SelectLabel className="text-[10px] opacity-50 font-bold uppercase py-1 px-2">Specialty</SelectLabel>
                              <SelectItem value="Label Attaching">Label Attaching</SelectItem>
                              <SelectItem value="Button Wrapping">Button Wrapping</SelectItem>
                              <SelectItem value="Button Making">Button Making</SelectItem>
                              <SelectItem value="Button Hole">Button Hole (B/H)</SelectItem>
                              <SelectItem value="Turning">Turning M/C</SelectItem>
                              <SelectItem value="Pointing">Pointing M/C</SelectItem>
                              <SelectItem value="Contour">Contour M/C</SelectItem>
                              <SelectItem value="Notch">Notch M/C</SelectItem>
                            </SelectGroup>

                            <SelectSeparator className="opacity-10" />

                            <SelectGroup>
                              <SelectLabel className="text-[10px] opacity-50 font-bold uppercase py-1 px-2">Prep & Finishing</SelectLabel>
                              <SelectItem value="Ironing">Ironing / Press</SelectItem>
                              <SelectItem value="Fusing">Fusing M/C</SelectItem>
                              <SelectItem value="Blocking">Blocking M/C</SelectItem>
                              <SelectItem value="Rotary">Rotary M/C</SelectItem>
                            </SelectGroup>

                            <SelectSeparator className="opacity-10" />

                            <SelectGroup>
                              <SelectLabel className="text-[10px] opacity-50 font-bold uppercase py-1 px-2">Helpers</SelectLabel>
                              <SelectItem value="Helper Table">Working Table</SelectItem>
                              <SelectItem value="Trolley">Transport Trolley</SelectItem>
                              <SelectItem value="Table">Generic Table</SelectItem>
                              <SelectItem value="Default">General Machine</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        className="w-full h-9 flex items-center gap-2 mt-2 font-bold"
                        size="sm"
                        onClick={() => {
                          addMachine(newType, operation.section || "Assembly", newOpName);
                          setNewOpName(''); // Reset
                          setShowAddForm(false);
                        }}
                      >
                        <Plus className="w-4 h-4" />
                        Add to {operation.section || 'Line'}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}

            {/* Section Statistics */}
            <div className="p-3 bg-secondary/30 rounded-lg border border-border/50 space-y-2 text-xs">
              <div className="flex justify-between items-center text-muted-foreground font-bold">
                <span>{operation.section || "Section"} Summary</span>
                <Layers className="w-3 h-3" />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="text-muted-foreground block">Machines</span>
                  <span className="font-bold text-foreground">
                    {useLineStore.getState().machineLayout.filter(m => (m.section || "").toLowerCase() === (operation.section || "").toLowerCase()).length}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Total SMV</span>
                  <span className="font-bold text-foreground">
                    {operations
                      .filter(op => (op.section || "").toLowerCase() === (operation.section || "").toLowerCase())
                      .reduce((sum, op) => sum + (op.smv || 0), 0)
                      .toFixed(2)}m
                  </span>
                </div>
              </div>

              {/* Machine List: 1 to X */}
              {sectionMachines.length > 0 && (
                <div className="mt-3 space-y-1 border-t border-border/40 pt-2">
                  <span className="text-muted-foreground font-bold uppercase tracking-wider text-[9px]">
                    All Machines (1 – {sectionMachines.length})
                  </span>
                  <div className="max-h-40 overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
                    {sectionMachines.map((m, i) => (
                      <div
                        key={m.id}
                        className={`flex items-center gap-1.5 py-0.5 px-1.5 rounded text-[10px] cursor-pointer transition-colors ${
                          m.id === selectedMachine?.id
                            ? 'bg-primary/20 text-primary font-black'
                            : 'hover:bg-secondary/60 text-muted-foreground'
                        }`}
                        onClick={() => setSelectedMachine(m)}
                      >
                        <span className="font-black text-[9px] min-w-[20px] text-right opacity-50">{i + 1}</span>
                        <span className="truncate font-medium">{m.operation.op_name || m.operation.machine_type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Footer gradient */}
          <div className="h-1 bg-gradient-to-r from-primary via-accent to-primary opacity-50 flex-shrink-0" />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
