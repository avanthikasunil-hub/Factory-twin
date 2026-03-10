import React, { useState } from "react";
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
    MoreHorizontal
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    const lineId = searchParams.get("line") || "Line 1";

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            console.log("Uploading OB file:", file.name);
            // In a real app, you'd parse Excel here
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
                            <p className="text-3xl font-black text-slate-900 mt-1">{stat.value}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Styles Table */}
            <div className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-y-4 px-6">
                        <thead>
                            <tr className="bg-violet-950 rounded-[2rem] overflow-hidden shadow-xl">
                                <th className="px-6 py-8 text-center text-sm font-black text-slate-100 uppercase tracking-[0.25em] rounded-l-[2rem]">SL NO</th>
                                <th className="px-6 py-8 text-center text-sm font-black text-slate-100 uppercase tracking-[0.25em]">Style Name</th>
                                <th className="px-6 py-8 text-center text-sm font-black text-slate-100 uppercase tracking-[0.25em]">OC NO.</th>
                                <th className="px-6 py-8 text-center text-sm font-black text-slate-100 uppercase tracking-[0.25em]">Buyer</th>
                                <th className="px-6 py-8 text-center text-sm font-black text-slate-100 uppercase tracking-[0.25em]">Start Date</th>
                                <th className="px-6 py-8 text-center text-sm font-black text-slate-100 uppercase tracking-[0.25em]">End Date</th>
                                <th className="px-6 py-8 text-center text-sm font-black text-slate-100 uppercase tracking-[0.25em] rounded-r-[2rem]">Upload OB</th>
                            </tr>
                        </thead>
                        <tbody>
                            {STYLE_SCHEDULE.map((item, i) => (
                                <motion.tr
                                    key={item.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.3 + i * 0.05 }}
                                    className="group"
                                >
                                    <td className="px-8 py-8 bg-slate-50/50 rounded-l-[2rem] group-hover:bg-purple-50 transition-all duration-300 text-center text-sm font-bold text-slate-700">
                                        {i + 1}
                                    </td>
                                    <td className="px-8 py-8 bg-slate-50/50 group-hover:bg-purple-50 transition-all duration-300 text-center text-sm font-bold text-slate-700">
                                        "{item.style}"
                                    </td>
                                    <td className="px-8 py-8 bg-slate-50/50 group-hover:bg-purple-50 transition-all duration-300 text-center text-sm font-bold text-slate-700">
                                        {item.con}
                                    </td>
                                    <td className="px-8 py-8 bg-slate-50/50 group-hover:bg-purple-50 transition-all duration-300 text-center text-sm font-bold text-slate-700">
                                        {item.buyer}
                                    </td>
                                    <td className="px-8 py-8 bg-slate-50/50 group-hover:bg-purple-50 transition-all duration-300 text-center text-sm font-bold text-slate-700 uppercase tracking-widest">
                                        {item.startDate}
                                    </td>
                                    <td className="px-8 py-8 bg-slate-50/50 group-hover:bg-purple-50 transition-all duration-300 text-center text-sm font-bold text-slate-700 uppercase tracking-widest">
                                        {item.endDate}
                                    </td>
                                    <td className="px-8 py-8 bg-slate-50/50 rounded-r-[2rem] group-hover:bg-purple-50 transition-all duration-300 text-center">
                                        <div className="flex justify-center">
                                            <input
                                                type="file"
                                                id={`ob-upload-${item.id}`}
                                                className="hidden"
                                                accept=".xlsx, .xls, .csv"
                                                onChange={handleFileUpload}
                                            />
                                            <Button
                                                asChild
                                                variant="outline"
                                                className="rounded-full px-6 py-2 border-purple-200 text-purple-600 font-black text-[10px] uppercase tracking-widest hover:bg-purple-600 hover:text-white hover:border-purple-600 transition-all duration-300 shadow-sm"
                                            >
                                                <label htmlFor={`ob-upload-${item.id}`} className="cursor-pointer flex items-center gap-2">
                                                    <Upload size={14} />
                                                    UPLOAD OB
                                                </label>
                                            </Button>
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
