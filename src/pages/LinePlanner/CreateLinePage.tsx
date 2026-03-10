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
  const [cons, setCons] = useState<string[]>([]);
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

  // Load buyers (Column A) for a given line
  const loadBuyers = (line: string) => {
    if (!line) return;
    fetch(`http://localhost:4000/cons?line=${encodeURIComponent(line)}`)
      .then(res => res.json())
      .then(data => setCons(data))
      .catch(() => { });
  };

  // Load Con Nos / OC (Column B) for a given line + buyer
  const loadConNos = (line: string, buyerVal: string) => {
    if (!line || !buyerVal) return;
    fetch(`http://localhost:4000/oc-by-buyer?line=${encodeURIComponent(line)}&buyer=${encodeURIComponent(buyerVal)}`)
      .then(res => res.json())
      .then(data => setCones(data))
      .catch(() => { });
  };

  // Load Styles (Column E) for a given line + Con No
  const loadStylesByConNo = (line: string, oc: string) => {
    if (!line || !oc) return;
    fetch(`http://localhost:4000/styles-by-oc?line=${encodeURIComponent(line)}&oc=${encodeURIComponent(oc)}`)
      .then(res => res.json())
      .then(data => setStyles(data))
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
    if (!lineNo || !buyer || !styleNo || !coneNo) {
      toast({ title: "Missing Fields", description: "Please select Line, Con, Style and Con No.", variant: "destructive" });
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
            {/* 1. Line Number */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Hash className="w-4 h-4" /> Line Number</Label>
              <select value={lineNo} onChange={(e) => {
                const val = e.target.value;
                setLineNo(val);
                setBuyer(""); setConeNo(""); setStyleNo("");
                setCons([]); setCones([]); setStyles([]);
                loadBuyers(val);
              }} className="w-full h-10 rounded-md border px-3 bg-white text-black">
                <option value="">Select Line</option>
                {lines.map(line => <option key={line} value={line}>{line}</option>)}
              </select>
            </div>

            {/* 2. Buyer — filtered by Line */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Users className="w-4 h-4" /> Buyer</Label>
              <select value={buyer} onChange={(e) => {
                const val = e.target.value;
                setBuyer(val);
                setConeNo(""); setStyleNo("");
                setCones([]); setStyles([]);
                loadConNos(lineNo, val);
              }} className="w-full h-10 rounded-md border px-3 bg-white text-black" disabled={!lineNo}>
                <option value="">Select Buyer</option>
                {cons.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* 3. Con No — filtered by Buyer */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Spool className="w-4 h-4" /> Con No</Label>
              <select value={coneNo} onChange={(e) => {
                const val = e.target.value;
                setConeNo(val);
                setStyleNo(""); setStyles([]);
                loadStylesByConNo(lineNo, val);
              }} className="w-full h-10 rounded-md border px-3 bg-white text-black" disabled={!buyer}>
                <option value="">Select Con No</option>
                {cones.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* 4. Style No — filtered by Con No */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Shirt className="w-4 h-4" /> Style No</Label>
              <select value={styleNo} onChange={(e) => setStyleNo(e.target.value)}
                className="w-full h-10 rounded-md border px-3 bg-white text-black" disabled={!coneNo}>
                <option value="">Select Style No</option>
                {styles.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* 5. Target Output */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Target className="w-4 h-4" /> Target Output/Day</Label>
              <input type="number" value={targetOutput} onChange={(e) => setTargetOutput(e.target.value)} className="w-full h-10 rounded-md border px-3" />
            </div>

            {/* 6. Efficiency */}
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
