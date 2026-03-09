import { motion } from "framer-motion";
import {
    TrendingUp,
    Users,
    Clock,
    Activity as ActivityIcon,
    Calendar,
    ChevronRight,
    Circle,
    Layout,
    ArrowUpRight,
    Layers,
    Clock3
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const LINE_DATA = [
    { id: 1, name: "Line 1", floor: "Floor 1", style: "Polo Shirt V2", startDate: "01/03/2024", endDate: "15/03/2024", status: "Active" },
    { id: 2, name: "Line 2", floor: "Floor 1", style: "Crew Neck Tee", startDate: "05/03/2024", endDate: "20/03/2024", status: "Active" },
    { id: 3, name: "Line 3", floor: "Floor 1", style: "Running Shorts", startDate: "02/03/2024", endDate: "18/03/2024", status: "Pending" },
    { id: 4, name: "Line 4", floor: "Floor 1", style: "Yoga Pants", startDate: "10/03/2024", endDate: "25/03/2024", status: "Active" },
    { id: 5, name: "Line 5", floor: "Floor 1", style: "Hoodie Basic", startDate: "08/03/2024", endDate: "22/03/2024", status: "Active" },
    { id: 6, name: "Line 6", floor: "Floor 1", style: "Cargo Shorts", startDate: "12/03/2024", endDate: "27/03/2024", status: "Maintenance" },
    { id: 7, name: "Line 7", floor: "Floor 1", style: "Denim Jacket", startDate: "15/03/2024", endDate: "30/03/2024", status: "Pending" },
    { id: 8, name: "Line 8", floor: "Floor 2", style: "Joggers Sport", startDate: "18/03/2024", endDate: "02/04/2024", status: "Active" },
    { id: 9, name: "Line 9", floor: "Floor 2", style: "Performance Shorts", startDate: "20/03/2024", endDate: "05/04/2024", status: "Pending" },
];

export default function VirtualLineOverview() {
    const navigate = useNavigate();

    const stats = [
        { label: "Total Capacity", value: "9 Lines", icon: Layers, color: "text-blue-600", bg: "bg-blue-50" },
        { label: "Active Staff", value: "324", icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
        { label: "Plant Efficiency", value: "78.4%", icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: "On Time Delivery", value: "92%", icon: Clock3, color: "text-orange-600", bg: "bg-orange-50" }
    ];

    return (
        <div className="space-y-10 p-2 max-w-[1600px] mx-auto pb-20">
            {/* Compact Header Card */}
            <div className="relative p-8 py-8 rounded-[2rem] bg-gradient-to-br from-indigo-950 via-slate-900 to-black text-white shadow-xl overflow-hidden">
                <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-purple-500/10 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2" />

                <div className="relative z-10 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[9px] font-black uppercase tracking-[0.3em]">
                            Live Dashboard
                        </div>
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight">Factory Overview</h1>
                    </div>
                </div>
            </div>

            {/* Stats Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                    >
                        <Card className="rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-500 bg-white group cursor-default">
                            <CardContent className="p-8 flex flex-col gap-6">
                                <div className={`${stat.bg} w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3`}>
                                    <stat.icon size={24} className={stat.color} />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-none">{stat.label}</p>
                                    <h3 className="text-3xl font-black text-slate-900 tracking-tight">{stat.value}</h3>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Main Production Table */}
            <div className="space-y-6">
                <div className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-separate border-spacing-y-6 px-4">
                            <thead>
                                <tr className="bg-violet-950 rounded-[2rem] shadow-2xl shadow-violet-200/50 overflow-hidden border-none text-center">
                                    <th className="px-6 py-9 text-center text-[12px] font-black text-slate-100 uppercase tracking-[0.25em] rounded-l-[2rem]">Production Line</th>
                                    <th className="px-6 py-9 text-center text-[12px] font-black text-slate-100 uppercase tracking-[0.25em]">Current Style</th>
                                    <th className="px-6 py-9 text-center text-[12px] font-black text-slate-100 uppercase tracking-[0.25em]">Start Date</th>
                                    <th className="px-6 py-9 text-center text-[12px] font-black text-slate-100 uppercase tracking-[0.25em]">End Date</th>
                                    <th className="px-6 py-9 text-center text-[12px] font-black text-slate-100 uppercase tracking-[0.25em]">Status</th>
                                    <th className="px-6 py-9 text-center text-[12px] font-black text-slate-100 uppercase tracking-[0.25em] rounded-r-[2rem]">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {LINE_DATA.map((line, i) => (
                                    <motion.tr
                                        key={line.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        onClick={() => navigate(`/virtual-line/schedule?line=Line ${line.id}`)}
                                        className="group cursor-pointer"
                                    >
                                        <td className="px-10 py-8 bg-slate-50/50 rounded-l-[2rem] border-t border-b border-l border-transparent group-hover:bg-purple-50/80 group-hover:border-purple-200 transition-all duration-300">
                                            <div className="flex items-center gap-6 justify-center">
                                                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center group-hover:border-purple-200 group-hover:shadow-purple-100/50 transition-all duration-500">
                                                    <span className="text-xl font-black text-slate-900 leading-none">{line.id}</span>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-black text-slate-900 text-lg group-hover:text-purple-700 transition-colors uppercase tracking-tight">{line.name}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-8 bg-slate-50/50 border-t border-b border-transparent group-hover:bg-purple-50/80 group-hover:border-purple-200 transition-all duration-300 text-center">
                                            <span className="text-sm font-bold text-slate-800 leading-tight">"{line.style}"</span>
                                        </td>
                                        <td className="px-8 py-8 bg-slate-50/50 border-t border-b border-transparent group-hover:bg-purple-50/80 group-hover:border-purple-200 transition-all duration-300 text-center">
                                            <span className="text-sm font-black text-slate-600 tracking-tight">{line.startDate}</span>
                                        </td>
                                        <td className="px-8 py-8 bg-slate-50/50 border-t border-b border-transparent group-hover:bg-purple-50/80 group-hover:border-purple-200 transition-all duration-300 text-center">
                                            <span className="text-sm font-black text-slate-600 tracking-tight">{line.endDate}</span>
                                        </td>
                                        <td className="px-8 py-8 bg-slate-50/50 border-t border-b border-transparent group-hover:bg-purple-50/80 group-hover:border-purple-200 transition-all duration-300 text-center">
                                            <div className={cn(
                                                "inline-flex items-center gap-2 px-5 py-2 rounded-full border transition-all duration-300",
                                                line.status === "Active" ? "bg-emerald-50 border-emerald-100 text-emerald-700 shadow-sm shadow-emerald-100" :
                                                    line.status === "Maintenance" ? "bg-amber-50 border-amber-100 text-amber-700 shadow-sm shadow-amber-100" :
                                                        "bg-slate-50 border-slate-200 text-slate-500 shadow-sm shadow-slate-100"
                                            )}>
                                                <Circle size={8} fill="currentColor" className={cn(
                                                    line.status === "Active" ? "text-emerald-500" :
                                                        line.status === "Maintenance" ? "text-amber-500" :
                                                            "text-slate-300"
                                                )} />
                                                <span className="text-[10px] font-black uppercase tracking-[0.15em]">{line.status}</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8 bg-slate-50/50 rounded-r-[2rem] border-t border-b border-r border-transparent group-hover:bg-purple-50/80 group-hover:border-purple-200 transition-all duration-300 text-right">
                                            <div className="inline-flex items-center gap-3 text-slate-300 group-hover:text-purple-600 transition-all duration-500">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation(); // Avoid triggering the row click (schedule)
                                                        navigate(`/virtual-line/floor?floor=${line.floor}&line=Line ${line.id}`);
                                                    }}
                                                    className="w-10 h-10 rounded-full bg-white border border-slate-100 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white group-hover:border-purple-600 shadow-sm transition-all duration-500 group-hover:rotate-12"
                                                >
                                                    <ArrowUpRight size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
