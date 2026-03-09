import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Trash2,
  Clock,
  Layers,
  Factory,
  Calendar,
  ChevronRight,
  AlertCircle,
  Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLineStore } from '@/store/useLineStore';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { AnimatedBackground } from '@/components/ui/AnimatedBackground';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/**
 * Page to view and manage all saved production lines, segregated by Line Number (LINE 1 - LINE 9)
 */
const ViewLinesPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { savedLines, loadLine, deleteLine } = useLineStore();

  // Define fixed lines 1 to 9
  const FIXED_LINES = useMemo(() =>
    Array.from({ length: 9 }, (_, i) => `LINE ${i + 1}`),
    []);

  // Group lines by their Line Number, ensuring LINE 1-9 are always present
  const groupedLines = useMemo(() => {
    const groups: Record<string, typeof savedLines> = {};

    // Initialize groups with fixed lines
    FIXED_LINES.forEach(line => {
      groups[line] = [];
    });

    // Populate groups with saved lines
    savedLines.forEach(line => {
      const key = (line.lineNo || '').toUpperCase();
      if (groups[key]) {
        groups[key].push(line);
      } else {
        // Handle lines outside 1-9 if they exist (e.g. Unassigned)
        if (!groups[key]) groups[key] = [];
        groups[key].push(line);
      }
    });

    // Sort styles within each group by date (newest first)
    return Object.keys(groups).reduce((acc, key) => {
      acc[key] = groups[key].sort((a, b) =>
        new Date(b.updatedAt || b.createdAt || Date.now()).getTime() -
        new Date(a.updatedAt || a.createdAt || Date.now()).getTime()
      );
      return acc;
    }, {} as Record<string, typeof savedLines>);
  }, [savedLines, FIXED_LINES]);

  // Determine which lines to show in the sidebar (FIXED_LINES + any other saved lines)
  const lineKeys = useMemo(() => {
    const allFoundLines = Object.keys(groupedLines);
    const sorted = allFoundLines.sort((a, b) => {
      const aNum = parseInt(a.replace('LINE ', '')) || 999;
      const bNum = parseInt(b.replace('LINE ', '')) || 999;
      return aNum - bNum;
    });
    return sorted;
  }, [groupedLines]);

  const [selectedLineKey, setSelectedLineKey] = useState<string | null>(lineKeys[0] || null);

  const handleOpenLine = (id: string, lineNo: string) => {
    loadLine(id);
    navigate('/line-planner/planner');
    toast({
      title: "Line Loaded",
      description: `Viewing ${lineNo}`,
    });
  };

  const handleDeleteLine = (e: React.MouseEvent, id: string, lineNo: string) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete this style from ${lineNo}?`)) {
      deleteLine(id);
      toast({
        title: "Layout Deleted",
        description: `Removed from ${lineNo}`,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-background flex flex-col">
      <AnimatedBackground />

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-30 h-20 border-b border-border bg-card/40 backdrop-blur-md flex items-center px-8 flex-shrink-0"
      >
        <div className="max-w-[1600px] mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/line-planner')}
              className="hover:bg-secondary rounded-full w-10 h-10 transition-all hover:scale-110"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>

            <div className="flex flex-col">
              <h1 className="text-2xl font-black text-foreground tracking-tight uppercase italic flex items-center gap-3">
                Style Repository
                <Badge variant="outline" className="px-3 py-0.5 rounded-full bg-primary/5 border-primary/20 text-primary font-black text-xs uppercase tracking-widest">
                  {savedLines.length} Styles
                </Badge>
              </h1>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden relative z-20">

        {/* Sidebar: Line Selector */}
        <aside className="w-72 border-r border-border bg-card/20 backdrop-blur-sm p-4 flex flex-col gap-4">
          <div className="px-2 py-4">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
              <Filter className="w-3 h-3" /> Select Line
            </h2>
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-2 pr-4 pb-8">
              {lineKeys.map(key => (
                <motion.button
                  key={key}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedLineKey(key)}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-2xl transition-all border-2",
                    selectedLineKey === key
                      ? "bg-primary/10 border-primary shadow-[0_10px_30px_rgba(var(--primary),0.1)]"
                      : "bg-transparent border-transparent hover:bg-secondary/40 text-muted-foreground"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-xl transition-colors",
                      selectedLineKey === key ? "bg-primary text-primary-foreground" : "bg-card border border-border"
                    )}>
                      <Factory className="w-4 h-4" />
                    </div>
                    <span className={cn(
                      "font-black uppercase tracking-tight text-sm",
                      selectedLineKey === key ? "text-foreground" : ""
                    )}>
                      {key}
                    </span>
                  </div>
                  <Badge variant="outline" className="h-5 px-2 font-black text-[9px] border-border/50 opacity-60">
                    {groupedLines[key]?.length || 0}
                  </Badge>
                </motion.button>
              ))}
            </div>
          </ScrollArea>
        </aside>

        {/* Content: Style Cards for Selected Line */}
        <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <AnimatePresence mode="wait">
            {!selectedLineKey ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto"
              >
                <div className="w-20 h-20 rounded-full bg-secondary/30 flex items-center justify-center mb-6">
                  <AlertCircle className="w-8 h-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-bold mb-2 uppercase text-foreground">Select a line</h2>
                <p className="text-sm text-muted-foreground">
                  Choose a production line from the sidebar to manage styles.
                </p>
              </motion.div>
            ) : groupedLines[selectedLineKey].length === 0 ? (
              <motion.div
                key={`${selectedLineKey}-empty`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto"
              >
                <div className="w-16 h-16 rounded-3xl bg-secondary/20 flex items-center justify-center mb-6 border border-border/50">
                  <Factory className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <h2 className="text-xl font-bold mb-2 uppercase text-foreground">No Styles for {selectedLineKey}</h2>
                <p className="text-sm text-muted-foreground mb-8">
                  No layouts have been saved for this production line yet.
                </p>
                <Button
                  onClick={() => navigate('/line-planner/create')}
                  className="rounded-full font-black uppercase tracking-widest text-xs px-8 shadow-lg shadow-primary/20"
                >
                  Create Style
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key={selectedLineKey}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="flex flex-col gap-1 border-b border-border pb-6">
                  <h2 className="text-4xl font-black uppercase tracking-tighter italic text-foreground">
                    {selectedLineKey} <span className="text-primary not-italic">Repository</span>
                  </h2>
                  <p className="text-sm text-muted-foreground font-medium opacity-60">
                    Browse and load saved 3D layouts for this location
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
                  {groupedLines[selectedLineKey].map((line, idx) => (
                    <motion.div
                      key={line.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      whileHover={{ y: -5 }}
                      onClick={() => handleOpenLine(line.id, line.lineNo)}
                      className="group cursor-pointer"
                    >
                      <div className="relative glass-card rounded-3xl border border-white/5 overflow-hidden flex flex-col transition-all group-hover:shadow-3xl group-hover:border-primary/30 bg-card/60">
                        {/* Style Info Container */}
                        <div className="p-6">
                          <div className="flex justify-between items-start mb-6">
                            <div className="flex flex-col gap-1 min-w-0 flex-1">
                              <h3 className="text-2xl font-black text-foreground uppercase tracking-tight truncate group-hover:text-primary transition-colors">
                                {line.styleNo || "Unnamed Style"}
                              </h3>
                              <div className="flex items-center gap-2">
                                <Calendar className="w-3.5 h-3.5 text-primary" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                  {format(new Date(line.updatedAt || line.createdAt || Date.now()), 'MMMM dd, yyyy')}
                                </span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => handleDeleteLine(e, line.id, line.lineNo)}
                              className="text-muted-foreground/30 hover:text-red-500 hover:bg-red-500/10 rounded-xl flex-shrink-0 -mt-1 -mr-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>

                          {/* Snapshot Stats */}
                          <div className="flex items-center gap-6 pt-4 border-t border-white/5 mt-4">
                            <div className="flex items-center gap-2">
                              <Layers className="w-3.5 h-3.5 text-muted-foreground/60" />
                              <div className="flex flex-col">
                                <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/40 leading-none mb-0.5">Operators</span>
                                <span className="text-sm font-black text-foreground">
                                  {line.operations?.length || 0}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 text-muted-foreground/60" />
                              <div className="flex flex-col">
                                <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/40 leading-none mb-0.5">Efficiency</span>
                                <span className="text-sm font-black text-foreground">
                                  {line.efficiency || 100}%
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Action Bar */}
                        <div className="px-6 py-4 bg-primary/5 flex items-center justify-between border-t border-white/5">
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary transition-all group-hover:tracking-[0.3em]">
                            Load 3D Layout
                          </span>
                          <motion.div
                            animate={{ x: [0, 6, 0] }}
                            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                            className="text-primary"
                          >
                            <ChevronRight className="w-5 h-5 focus:animate-ping" />
                          </motion.div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

      </div>
    </div>
  );
};

export default ViewLinesPage;
