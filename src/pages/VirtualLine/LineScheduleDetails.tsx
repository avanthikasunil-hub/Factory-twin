import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    ChevronLeft,
    Upload,
    FileSpreadsheet,
    Calendar,
    Clock,
    Zap,
    FileText,
    TrendingUp,
    MoreHorizontal,
    PlayCircle,
    CheckCircle2,
    RefreshCw,
    Check
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { API_BASE_URL } from "../../config";

// Mock data for the styles in a specific line for the month
const STYLE_SCHEDULE = [
    { id: 1, no: "ORD-001", style: "Polo Shirt V2", con: "450", buyer: "Nike", startDate: "01/03/2024", endDate: "12/03/2024", smv: "14.5" },
    { id: 2, no: "ORD-042", style: "Slim Fit Tee", con: "600", buyer: "Adidas", startDate: "13/03/2024", endDate: "18/03/2024", smv: "10.2" },
    { id: 3, no: "ORD-089", style: "Crew Neck V3", con: "400", buyer: "Puma", startDate: "19/03/2024", endDate: "25/03/2024", smv: "12.8" },
    { id: 4, no: "ORD-112", style: "Performance Polo", con: "350", buyer: "Nike", startDate: "26/03/2024", endDate: "02/04/2024", smv: "15.4" },
];

export default function LineScheduleDetails() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const lineId = searchParams.get("line") || "LINE 1";
    const [schedule, setSchedule] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`${API_BASE_URL}/schedule?line=${encodeURIComponent(lineId)}`)
            .then(res => res.json())
            .then(data => {
                setSchedule(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error fetching schedule:", err);
                setLoading(false);
            });
    }, [lineId]);

    const handleStatusChange = async (style_no: string, con_no: string, nextStatus: string) => {
        try {
            const res = await fetch(`${API_BASE_URL}/update-status`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    line_no: lineId,
                    style_no,
                    con_no,
                    status: nextStatus
                })
            });
            if (res.ok) {
                setSchedule(prev => prev.map(s =>
                    (s.style === style_no && s.conNo === con_no) ? { ...s, status: nextStatus } : s
                ));
            }
        } catch (err) {
            console.error("Error updating status:", err);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, style: string, conNo: string, buyer: string) => {
        const file = e.target.files?.[0];
        if (file) {
            console.log("Uploading OB file for style:", style);
            const formData = new FormData();
            formData.append("file", file);
            formData.append("line_no", lineId);
            formData.append("style_no", style);
            formData.append("con_no", conNo);

            try {
                const res = await fetch(`${API_BASE_URL}/upload-ob`, {
                    method: "POST",
                    body: formData
                });
                if (res.ok) {
                    const data = await res.json();
                    alert(`OB Uploaded successfully! ${data.count} operations parsed.`);
                    // Refresh schedule to show green check
                    const refreshRes = await fetch(`${API_BASE_URL}/schedule?line=${encodeURIComponent(lineId)}`);
                    const refreshData = await refreshRes.json();
                    setSchedule(refreshData);
                } else {
                    const err = await res.json();
                    alert(`Upload failed: ${err.error}`);
                }
            } catch (err) {
                console.error("Error uploading OB:", err);
                alert("Upload failed. Check console for details.");
            }
        }
    };

    const getStatusStyles = (status: string) => {
        switch (status) {
            case "Changeover": return "bg-amber-100 text-amber-600 border-amber-200";
            case "Running": return "bg-emerald-100 text-emerald-600 border-emerald-200";
            case "Completed": return "bg-slate-200 text-slate-600 border-slate-300";
            default: return "bg-blue-100 text-blue-600 border-blue-200";
        }
    };

    return (
        <div className="max-w-[1600px] mx-auto space-y-8 pb-20">
            {/* Header / Navigation */}
            <div className="flex flex-col gap-6">
                <Button
                    variant="ghost"
                    onClick={() => navigate(-1)}
                    className="w-fit gap-2 -ml-2 text-slate-500 hover:text-purple-600 hover:bg-purple-50 transition-all rounded-xl"
                >
                    <ChevronLeft size={18} />
                    <span className="font-bold text-xs uppercase tracking-widest">Back to Overview</span>
                </Button>

                <div className="flex items-end justify-between">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-violet-950 flex items-center justify-center shadow-xl shadow-purple-200/50">
                                <FileText className="text-white" size={24} />
                            </div>
                            <div>
                                <h1 className="text-3xl font-black text-slate-900 tracking-tight">{lineId} Schedule</h1>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: "Planned Styles", value: "04", icon: FileSpreadsheet, color: "text-blue-600", bg: "bg-blue-50" },
                    { label: "Target Eff.", value: "84%", icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
                    { label: "Active Month", value: "MAR '24", icon: Calendar, color: "text-emerald-600", bg: "bg-emerald-50" },
                ].map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 flex items-center gap-6"
                    >
                        <div className={cn("w-14 h-14 rounded-3xl flex items-center justify-center", stat.bg)}>
                            <stat.icon size={26} className={stat.color} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{stat.label}</p>
                            <p className="text-3xl font-black text-slate-900 mt-1">
                                {stat.label === "Planned Styles" ? String(schedule.length).padStart(2, '0') : stat.value}
                            </p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Styles Table */}
            <div className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-y-4 px-6">
                        <thead>
                            <tr className="bg-violet-950 rounded-[2rem] overflow-hidden shadow-xl text-center">
                                <th className="px-4 py-8 text-sm font-black text-slate-100 uppercase tracking-[0.25em] rounded-l-[2rem]">SL NO</th>
                                <th className="px-4 py-8 text-sm font-black text-slate-100 uppercase tracking-[0.25em]">Buyer</th>
                                <th className="px-4 py-8 text-sm font-black text-slate-100 uppercase tracking-[0.25em]">Con No</th>
                                <th className="px-4 py-8 text-sm font-black text-slate-100 uppercase tracking-[0.25em]">Style</th>
                                <th className="px-4 py-8 text-sm font-black text-slate-100 uppercase tracking-[0.25em]">Color</th>
                                <th className="px-4 py-8 text-sm font-black text-slate-100 uppercase tracking-[0.25em]">Quantity</th>
                                <th className="px-4 py-8 text-sm font-black text-slate-100 uppercase tracking-[0.25em]">Status</th>
                                <th className="px-4 py-8 text-sm font-black text-slate-100 uppercase tracking-[0.25em] rounded-r-[2rem]">Upload OB</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="py-20 text-center font-bold text-slate-400 uppercase tracking-widest animate-pulse">
                                        Loading Schedule Data...
                                    </td>
                                </tr>
                            ) : schedule.map((item, i) => (
                                <motion.tr
                                    key={item.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.3 + i * 0.05 }}
                                    className="group text-center"
                                >
                                    <td className="px-4 py-8 bg-slate-50/50 rounded-l-[2rem] group-hover:bg-purple-50 transition-all duration-300 text-sm font-bold text-slate-700">
                                        {i + 1}
                                    </td>
                                    <td className="px-4 py-8 bg-slate-50/50 group-hover:bg-purple-50 transition-all duration-300 text-sm font-bold text-slate-700">
                                        {item.buyer}
                                    </td>
                                    <td className="px-4 py-8 bg-slate-50/50 group-hover:bg-purple-50 transition-all duration-300 text-sm font-bold text-slate-700">
                                        {item.conNo}
                                    </td>
                                    <td className="px-4 py-8 bg-slate-50/50 group-hover:bg-purple-50 transition-all duration-300 text-sm font-bold text-slate-900">
                                        {item.style}
                                    </td>
                                    <td className="px-4 py-8 bg-slate-50/50 group-hover:bg-purple-50 transition-all duration-300 text-xs font-bold text-slate-600">
                                        {item.color}
                                    </td>
                                    <td className="px-4 py-8 bg-slate-50/50 group-hover:bg-purple-50 transition-all duration-300 text-sm font-black text-slate-900">
                                        {Number(item.quantity).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-8 bg-slate-50/50 group-hover:bg-purple-50 transition-all duration-300">
                                        <div className="flex justify-center">
                                            <Select
                                                value={item.status}
                                                onValueChange={(val) => handleStatusChange(item.style, item.conNo, val)}
                                            >
                                                <SelectTrigger className={cn(
                                                    "w-[140px] rounded-xl border text-[10px] font-black uppercase tracking-widest shadow-sm",
                                                    getStatusStyles(item.status)
                                                )}>
                                                    <SelectValue placeholder="Status" />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl border-slate-100 shadow-xl font-bold text-[10px] uppercase tracking-widest">
                                                    <SelectItem value="Planned" className="hover:bg-blue-50 focus:bg-blue-50 text-blue-600">Planned</SelectItem>
                                                    <SelectItem value="Changeover" className="hover:bg-amber-50 focus:bg-amber-50 text-amber-600">Changeover</SelectItem>
                                                    <SelectItem value="Running" className="hover:bg-emerald-50 focus:bg-emerald-50 text-emerald-600">Running</SelectItem>
                                                    <SelectItem value="Completed" className="hover:bg-slate-100 focus:bg-slate-100 text-slate-600">Completed</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </td>
                                    <td className="px-4 py-8 bg-slate-50/50 rounded-r-[2rem] group-hover:bg-purple-50 transition-all duration-300">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="flex justify-center items-center gap-3">
                                                {item.hasOB && (
                                                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm" title="OB Uploaded">
                                                        <Check size={16} />
                                                    </div>
                                                )}
                                                <input
                                                    type="file"
                                                    id={`ob-upload-${item.id}`}
                                                    className="hidden"
                                                    accept=".xlsx, .xls, .csv"
                                                    onChange={(e) => handleFileUpload(e, item.style, item.conNo, item.buyer)}
                                                />
                                                <Button
                                                    asChild
                                                    variant="outline"
                                                    className={cn(
                                                        "rounded-full px-6 py-2 border-purple-200 text-purple-600 font-black text-[10px] uppercase tracking-widest hover:bg-purple-600 hover:text-white hover:border-purple-600 transition-all duration-300 shadow-sm h-auto",
                                                        item.hasOB && "border-emerald-200 text-emerald-600 hover:bg-emerald-600 hover:border-emerald-600"
                                                    )}
                                                >
                                                    <label htmlFor={`ob-upload-${item.id}`} className="cursor-pointer flex items-center gap-2">
                                                        <Upload size={14} />
                                                        {item.hasOB ? "RE-UPLOAD OB" : "UPLOAD OB"}
                                                    </label>
                                                </Button>
                                            </div>
                                            {item.obFileName && (
                                                <p className="text-[9px] font-bold text-slate-400 mt-1 truncate max-w-[150px]" title={item.obFileName}>
                                                    {item.obFileName}
                                                </p>
                                            )}
                                        </div>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
