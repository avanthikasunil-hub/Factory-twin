import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Factory, Hash, Shirt, Spool, Activity, Target, Clock, Users, RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadZone } from "@/components/ui/FileUploadZone";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";
import { useLineStore } from "@/store/useLineStore";
import { parseOBExcel } from "@/utils/obParser";
import { useToast } from "@/hooks/use-toast";
import type { Operation } from "@/types";
import { API_BASE_URL } from "../../../config";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db, prodDb } from "@/firebase";

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
  const [efficiency, setEfficiency] = useState("90");
  const [targetOutput, setTargetOutput] = useState("1200");
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
    fetch(`${API_BASE_URL}/lines`)
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
    fetch(`${API_BASE_URL}/cons?line=${encodeURIComponent(line)}`)
      .then(res => res.json())
      .then(data => {
        setCons(data);
        if (data.length === 1) {
          setBuyer(data[0]);
          loadConNos(line, data[0]);
        }
      })
      .catch(() => { });
  };

  // Load Con Nos / OC (Column B) for a given line + buyer
  const loadConNos = (line: string, buyerVal: string) => {
    if (!line || !buyerVal) return;
    fetch(`${API_BASE_URL}/oc-by-buyer?line=${encodeURIComponent(line)}&buyer=${encodeURIComponent(buyerVal)}`)
      .then(res => res.json())
      .then(data => {
        setCones(data);
        if (data.length === 1) {
          setConeNo(data[0]);
          loadStylesByConNo(line, data[0]);
          checkAndAutoUploadOB(data[0], buyerVal);
        }
      })
      .catch(() => { });
  };

  // Load Styles (Column E) for a given line + Con No
  const loadStylesByConNo = (line: string, oc: string) => {
    if (!line || !oc) return;
    fetch(`${API_BASE_URL}/styles-by-oc?line=${encodeURIComponent(line)}&oc=${encodeURIComponent(oc)}`)
      .then(res => res.json())
      .then(data => {
        setStyles(data);
        if (data.length === 1) {
          setStyleNo(data[0]);
        }
      })
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
      const { operations, preparatoryOps, buyer: parsedBuyer, totalSMV, machineTypesCount, sourceSheet: sheetName } = await parseOBExcel(file);

      if (!operations || operations.length === 0) {
        throw new Error("No operations found in the uploaded Excel file.");
      }

      updateLineWithNewOB(operations, sheetName);
      useLineStore.getState().setPreparatoryOps(preparatoryOps || []);

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

  // ── Auto OB Lookup ─────────────────────────────────────────────────────────
  const checkAndAutoUploadOB = useCallback(async (selectedConNo: string, selectedBuyer: string) => {
    if (!selectedConNo) return;
    const cleanCon = selectedConNo.trim();
    console.log("[Auto-Upload] Starting lookup. Con:", cleanCon, "Buyer:", selectedBuyer);

    const checkDb = async (targetDb: any, dbName: string) => {
      console.log(`[Auto-Upload] Checking ${dbName}...`);
      
      const fieldVariations = [
        "conNo", 
        "summaryData.conNo", 
        "con_no", 
        "summaryData.con_no",
        "conNumber",
        "ocNo",
        "OC"
      ];

      // Run all variations in PARALLEL for speed
      const promises = fieldVariations.map(field => {
        const q = query(collection(targetDb, "styleOBmetadata"), where(field, "==", cleanCon), limit(1));
        return getDocs(q);
      });

      const results = await Promise.all(promises);
      const snap = results.find(s => !s.empty);

      if (snap) {
        console.log(`[Auto-Upload] Match found in ${dbName}`);
        return snap;
      }

      // 2. Fallback to 'styles' collection
      console.log(`[Auto-Upload] No match in ${dbName} styleOBmetadata. Trying 'styles' collection...`);
      const qStyles = query(collection(targetDb, "styles"), where("conNo", "==", cleanCon), limit(1));
      const stylesSnap = await getDocs(qStyles);
      
      return stylesSnap;
    };

    try {
      setIsLoading(true);
      
      // Query both databases in PARALLEL
      const [primaryRes, prodRes] = await Promise.all([
        checkDb(db, "Primary DB"),
        checkDb(prodDb, "Ishika DB")
      ]);

      const querySnapshot = !primaryRes.empty ? primaryRes : prodRes;

      if (!querySnapshot.empty) {
        console.log(`[Auto-Upload] Found match in database.`);
        const docData = querySnapshot.docs[0].data();
        
        // Deep extract fileUrl and other metadata
        const fileUrl = docData.fileUrl || docData.obFileUrl || docData.summaryData?.fileUrl;
        const originalFileName = docData.originalFileName || docData.fileName || docData.summaryData?.fileName || "ob.xlsx";
        const style = docData.style || docData.styleCode || docData.summaryData?.style || "";

        console.log("[Auto-Upload] Match data:", { style, fileName: originalFileName, hasUrl: !!fileUrl });

        if (fileUrl) {
          toast({
            title: "OB Found",
            description: `Found OB for ${selectedConNo}. Auto-uploading...`,
          });

          try {
            const response = await fetch(fileUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const blob = await response.blob();
            const file = new File([blob], originalFileName, { 
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
            });

            if (style) setStyleNo(style);
            await handleFileSelect(file);
          } catch (fetchErr) {
            console.error("[Auto-Upload] Fetch error:", fetchErr);
            toast({
              title: "Auto-upload Blocked",
              description: "Found OB but browser blocked the download (CORS). Please upload manually.",
              variant: "destructive"
            });
          }
        } else {
            console.log("[Auto-Upload] Found entry but no fileUrl exists.");
            toast({ title: "OB Found (No File)", description: "Record exists but no file URL was found.", variant: "destructive" });
        }
      } else {
        console.log("[Auto-Upload] No OB found in any database (Checked all variations and fallbacks).");
      }
    } catch (error) {
      console.error("[Auto-Upload] Error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [handleFileSelect, toast]);

  // ── Create line ────────────────────────────────────────────────────────────
  const handleCreateLine = useCallback(() => {
    console.log("[CreateLinePage] handleCreateLine triggered", { lineNo, styleNo, coneNo, buyer, parsedOperationsLen: parsedOperations.length });
    
    if (!lineNo || !buyer || !styleNo || !coneNo) {
      toast({ title: "Missing Fields", description: "Please select Line, Con, Style and Con No.", variant: "destructive" });
      return;
    }

    if (parsedOperations.length === 0) {
      toast({ title: "No Operations", description: "Please upload an OB Excel sheet first.", variant: "destructive" });
      return;
    }

    try {
      setIsLoading(true);
      const line = createLine(
        lineNo,
        styleNo,
        coneNo,
        buyer,
        parsedOperations,
        parseFloat(efficiency || "90"),
        parseFloat(targetOutput || "1200"),
        parsedTotalSMV,
        parseFloat(workingHours || "9"),
        sourceSheet,
        useLineStore.getState().preparatoryOps || [],
        'dbr'
      );

      console.log("[CreateLinePage] Line created successfully", line);
      saveLine(line, 'dbr');
      toast({ title: "Line Created Successfully", description: `${lineNo} created.` });
      
      // Delay navigation slightly to allow store state to propagate
      setTimeout(() => navigate('/dbr/line-planner/planner'), 100);
    } catch (err) {
      console.error("[CreateLinePage] Error in handleCreateLine:", err);
      toast({ title: "Generation Error", description: "Failed to generate 3D layout. See console for details.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [lineNo, styleNo, coneNo, buyer, parsedOperations, parsedTotalSMV, efficiency, targetOutput, workingHours, sourceSheet, createLine, saveLine, navigate, toast]);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 min-h-screen p-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dbr/line-planner')}><ArrowLeft className="w-5 h-5" /></Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10"><Factory className="w-6 h-6 text-primary" /></div>
            <div>
              <h1 className="text-2xl font-bold">Create New Line</h1>
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">Configure your production line</p>
                <span className="px-1.5 py-0.5 rounded bg-primary/20 text-[8px] font-bold text-primary animate-pulse uppercase">Auto-OB v2.1 Active</span>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="max-w-2xl mx-auto glass-card rounded-2xl p-8 space-y-8">
          <div className="flex flex-col gap-6">
            {/* 1. Line Number */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Hash className="w-4 h-4" /> Line Number</Label>
              <Select value={lineNo} onValueChange={(val) => {
                setLineNo(val);
                setBuyer(""); setConeNo(""); setStyleNo("");
                setCons([]); setCones([]); setStyles([]);
                loadBuyers(val);
              }}>
                <SelectTrigger className="w-full h-10 bg-white text-black">
                  <SelectValue placeholder="Select Line" />
                </SelectTrigger>
                <SelectContent>
                  {lines.map(line => <SelectItem key={line} value={line}>{line}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* 2. Buyer — filtered by Line */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Users className="w-4 h-4" /> Buyer</Label>
              <Select value={buyer} disabled={!lineNo} onValueChange={(val) => {
                setBuyer(val);
                setConeNo(""); setStyleNo("");
                setCones([]); setStyles([]);
                loadConNos(lineNo, val);
              }}>
                <SelectTrigger className="w-full h-10 bg-white text-black">
                  <SelectValue placeholder="Select Buyer" />
                </SelectTrigger>
                <SelectContent>
                  {cons.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* 3. Con No — filtered by Buyer */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Spool className="w-4 h-4" /> Con No</Label>
              <Select value={coneNo} disabled={!buyer} onValueChange={(val) => {
                setConeNo(val);
                setStyleNo(""); setStyles([]);
                loadStylesByConNo(lineNo, val);
                checkAndAutoUploadOB(val, buyer);
              }}>
                <SelectTrigger className="w-full h-10 bg-white text-black">
                  <SelectValue placeholder="Select Con No" />
                </SelectTrigger>
                <SelectContent>
                  {cones.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* 4. Style No — filtered by Con No */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Shirt className="w-4 h-4" /> Style No</Label>
              <Select value={styleNo} disabled={!coneNo} onValueChange={(val) => setStyleNo(val)}>
                <SelectTrigger className="w-full h-10 bg-white text-black">
                  <SelectValue placeholder="Select Style No" />
                </SelectTrigger>
                <SelectContent>
                  {styles.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
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

          <Button 
            type="button" 
            onClick={handleCreateLine} 
            className="w-full h-12 relative overflow-hidden group shadow-lg shadow-primary/20"
            disabled={isLoading || !uploadSuccess}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-white/60" />
                <span>Generating Layout...</span>
              </div>
            ) : (
              <span className="flex items-center gap-2 font-black uppercase tracking-widest text-[11px]">
                Generate 3D Line Layout
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateLinePage;
