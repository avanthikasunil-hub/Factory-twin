import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Factory, Hash, Shirt, Spool, Activity, Target, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileUploadZone } from "@/components/ui/FileUploadZone";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";
import { useLineStore } from "@/store/useLineStore";
import { parseOBExcel } from "@/utils/obParser";
import { useToast } from "@/hooks/use-toast";
import type { Operation } from "@/types";

const DEFAULT_LINES = [
  "LINE 1", "LINE 2", "LINE 3", "LINE 4", "LINE 5",
  "LINE 6", "LINE 7", "LINE 8", "LINE 9"
];

const CreateLinePage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // ── Store ──────────────────────────────────────────────────────────────────
  const { createLine, saveLine, updateLineWithNewOB, resetLine } = useLineStore();

  // ── Form state ─────────────────────────────────────────────────────────────
  const [lineNo, setLineNo] = useState("");
  const [styleNo, setStyleNo] = useState("");
  const [coneNo, setConeNo] = useState("");
  const [buyer, setBuyer] = useState("");
  const [efficiency, setEfficiency] = useState("100");
  const [targetOutput, setTargetOutput] = useState("1000");
  const [workingHours, setWorkingHours] = useState("9");

  const [lines, setLines] = useState<string[]>(DEFAULT_LINES);
  const [styles, setStyles] = useState<string[]>([]);
  const [cones, setCones] = useState<string[]>([]);

  // ── Upload state ───────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [parsedOperations, setParsedOperations] = useState<Operation[]>([]);
  const [parsedTotalSMV, setParsedTotalSMV] = useState<number>(0);
  const [exactMachineCount, setExactMachineCount] = useState<number>(0);
  const [sourceSheet, setSourceSheet] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── On mount: wipe any previous line ──────────────────────────────────────
  useEffect(() => {
    resetLine();
  }, [resetLine]);

  // ── Backend data loaders ───────────────────────────────────────────────────
  useEffect(() => {
    fetch("http://localhost:4000/lines")
      .then(res => res.json())
      .then(data => {
        const merged = Array.from(new Set([...DEFAULT_LINES, ...data]));
        setLines(merged);
      })
      .catch(() => { });
  }, []);

  const loadStyles = (line: string) => {
    if (!line) return;
    fetch(`http://localhost:4000/styles?line=${line}`)
      .then(res => res.json())
      .then(data => setStyles(data))
      .catch(() => { });
  };

  const loadCones = (line: string, style: string) => {
    if (!line || !style) return;
    fetch(`http://localhost:4000/oc?line=${line}&style=${encodeURIComponent(style)}`)
      .then(res => res.json())
      .then(data => setCones(data))
      .catch(() => { });
  };

  // ── OB Upload handler ──────────────────────────────────────────────────────
  const handleFileSelect = useCallback(async (file: File) => {
    setIsLoading(true);
    setUploadError(null);
    setUploadSuccess(false);
    setParsedOperations([]);
    setParsedTotalSMV(0);
    setExactMachineCount(0);
    setSourceSheet("");

    // Clear the store's layout immediately so the old OB is "deleted" visually
    updateLineWithNewOB([], "");

    try {
      const { operations, buyer: parsedBuyer, totalSMV, machineTypesCount, sourceSheet: sheetName } = await parseOBExcel(file);

      if (!operations || operations.length === 0) {
        throw new Error("No operations found in the uploaded Excel file.");
      }

      updateLineWithNewOB(operations, sheetName);

      setParsedOperations(operations);
      if (parsedBuyer) setBuyer(parsedBuyer);
      setParsedTotalSMV(totalSMV);
      setExactMachineCount(machineTypesCount);
      setSourceSheet(sheetName);
      setUploadSuccess(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to parse file.";
      setUploadError(message);
      setUploadSuccess(false);
      toast({ title: "Parsing Error", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [updateLineWithNewOB, toast]);

  // ── Create line ────────────────────────────────────────────────────────────
  const handleCreateLine = useCallback(() => {
    if (!lineNo || !styleNo || !coneNo || !buyer) {
      toast({ title: "Missing Fields", description: "Please select Line, Style, Cone number and Buyer.", variant: "destructive" });
      return;
    }

    if (parsedOperations.length === 0) {
      toast({ title: "No Operations", description: "Please upload an OB Excel sheet first.", variant: "destructive" });
      return;
    }

    const line = createLine(
      lineNo,
      styleNo,
      coneNo,
      buyer,
      parsedOperations,
      parseFloat(efficiency || "100"),
      parseFloat(targetOutput || "1000"),
      parsedTotalSMV,
      parseFloat(workingHours || "9"),
      sourceSheet
    );
    saveLine(line);
    toast({ title: "Line Created Successfully", description: `${lineNo} created.` });
    navigate("/line-planner/planner");
  }, [lineNo, styleNo, coneNo, buyer, parsedOperations, parsedTotalSMV, efficiency, targetOutput, workingHours, sourceSheet, createLine, saveLine, navigate, toast]);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 min-h-screen p-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate("/line-planner")}><ArrowLeft className="w-5 h-5" /></Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10"><Factory className="w-6 h-6 text-primary" /></div>
            <div>
              <h1 className="text-2xl font-bold">Create New Line</h1>
              <p className="text-sm text-muted-foreground">Configure your production line</p>
            </div>
          </div>
        </motion.div>

        <div className="max-w-2xl mx-auto glass-card rounded-2xl p-8 space-y-8">
          <div className="flex flex-col gap-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Hash className="w-4 h-4" /> Line Number</Label>
              <select value={lineNo} onChange={(e) => { setLineNo(e.target.value); setStyleNo(""); setConeNo(""); loadStyles(e.target.value); }} className="w-full h-10 rounded-md border px-3 bg-white text-black">
                <option value="">Select Line</option>
                {lines.map(line => <option key={line} value={line}>{line}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Shirt className="w-4 h-4" /> Style Number</Label>
              <input
                list="styleList"
                value={styleNo}
                onChange={(e) => {
                  const val = e.target.value;
                  setStyleNo(val);
                  setConeNo("");
                  if (lineNo && val) {
                    loadCones(lineNo, val);
                    // Also attempt to fetch buyer for this style
                    fetch(`http://localhost:4000/buyer?line=${lineNo}&style=${encodeURIComponent(val)}`)
                      .then(res => res.json())
                      .then(data => {
                        if (data.buyer) setBuyer(data.buyer);
                      })
                      .catch(() => { });
                  }
                }}
                className="w-full h-10 rounded-md border px-3"
              />
              <datalist id="styleList">{styles.map(style => <option key={style} value={style} />)}</datalist>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Spool className="w-4 h-4" /> Cone Number</Label>
              <input
                list="coneList"
                value={coneNo}
                onChange={(e) => {
                  const val = e.target.value;
                  setConeNo(val);
                  if (lineNo && styleNo && val) {
                    fetch(`http://localhost:4000/buyer?line=${lineNo}&style=${encodeURIComponent(styleNo)}&oc=${val}`)
                      .then(res => res.json())
                      .then(data => {
                        if (data.buyer) setBuyer(data.buyer);
                      })
                      .catch(() => { });
                  }
                }}
                className="w-full h-10 rounded-md border px-3"
              />
              <datalist id="coneList">{cones.map(cone => <option key={cone} value={cone} />)}</datalist>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Target className="w-4 h-4" /> Target Output/Day</Label>
              <input type="number" value={targetOutput} onChange={(e) => setTargetOutput(e.target.value)} className="w-full h-10 rounded-md border px-3" />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Activity className="w-4 h-4" /> Efficiency (%)</Label>
              <input type="number" value={efficiency} onChange={(e) => setEfficiency(e.target.value)} className="w-full h-10 rounded-md border px-3" />
            </div>
          </div>

          <FileUploadZone onFileSelect={handleFileSelect} isLoading={isLoading} error={uploadError} success={uploadSuccess} />

          {uploadSuccess && parsedOperations.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="p-4 rounded-xl bg-accent/10 border border-accent/30">
              <h3 className="font-medium text-foreground mb-1 text-center">Parsed Operations Summary</h3>
              <p className="text-[10px] text-muted-foreground text-center mb-3">Source Sheet: <span className="font-bold text-primary">{sourceSheet}</span></p>
              <div className="grid grid-cols-3 gap-4 text-sm text-center">
                <div className="flex flex-col items-center p-3 rounded-lg bg-white/50 border border-black/5">
                  <p className="text-muted-foreground">Total Operations</p>
                  <p className="text-xl font-bold">{parsedOperations.length}</p>
                </div>
                <div className="flex flex-col items-center p-3 rounded-lg bg-white/50 border border-black/5">
                  <p className="text-muted-foreground">Machine Types</p>
                  <p className="text-xl font-bold text-primary">{exactMachineCount}</p>
                </div>
                <div className="flex flex-col items-center p-3 rounded-lg bg-white/50 border border-black/5">
                  <p className="text-muted-foreground">Total SMV</p>
                  <p className="text-xl font-bold text-emerald-600">{parsedTotalSMV.toFixed(2)}</p>
                </div>
              </div>
            </motion.div>
          )}

          <Button type="button" onClick={handleCreateLine} className="w-full h-12">Generate 3D Line Layout</Button>
        </div>
      </div>
    </div>
  );
};

export default CreateLinePage;
