import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation, Outlet, useSearchParams } from "react-router-dom";
import {
    LayoutDashboard,
    Activity,
    ChevronLeft,
    Factory,
    Menu,
    X,
    Filter,
    BarChart3,
    Hash,
    Layout,
    PlusSquare,
    Map,
    ArrowUpRight,
    ChevronDown,
    Layers
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "../../config";

const NAV_ITEMS = [
    { id: "overview", label: 'Overview', icon: LayoutDashboard, path: '/virtual-line/overview' },
    { id: "floor", label: 'Floor View', icon: Map, path: '/virtual-line/floor' },
    { id: "tracker", label: 'COT Tracker', icon: Activity, path: '/virtual-line/tracker' },
    { id: "ob", label: 'Style OB', icon: Layers, path: '/virtual-line/ob' },
    { id: "dashboard", label: 'Dashboard', icon: Layout, path: '/' },
];

// This will be replaced by dynamic data in the component
let COT_DATA: any[] = [];

export default function VirtualLineLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [isSidebarOpen, setSidebarOpen] = useState(true);

    // Determine active tab based on path
    const currentPath = location.pathname;
    const activeFloor = searchParams.get("floor") || "Floor 1";
    const activeLine = searchParams.get("line");

    const [liveCotData, setLiveCotData] = useState<any[]>([]);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/current-styles`);
                if (res.ok) {
                    const data = await res.json();
                    setLiveCotData(data);
                }
            } catch (err) {
                console.error("Error fetching live status:", err);
            }
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 15000);
        return () => clearInterval(interval);
    }, []);

    const activeLineData = liveCotData.find(i => i.line_no === activeLine);
    const isChangeover = activeLineData?.status === 'Changeover';
    const isRunning = activeLineData?.status === 'Running';

    return (
        <div className="flex h-screen bg-[#f8fafc] overflow-hidden">

            {/* Sidebar */}
            <motion.aside
                initial={false}
                animate={{ width: isSidebarOpen ? 260 : 80 }}
                className="bg-slate-950 border-r border-white/5 flex flex-col relative z-30 shadow-2xl"
            >
                {/* Toggle Button - Modern Floating Style */}
                <button
                    onClick={() => setSidebarOpen(!isSidebarOpen)}
                    className="absolute -right-4 top-12 w-8 h-8 bg-slate-900 border border-white/10 rounded-xl flex items-center justify-center shadow-xl hover:bg-slate-800 z-50 transition-all duration-300 group"
                >
                    <ChevronLeft className={cn("w-4 h-4 text-slate-400 group-hover:text-white transition-transform duration-500", !isSidebarOpen && "rotate-180")} />
                </button>

                {/* Logo Section */}
                <div className={cn(
                    "flex items-center gap-4 overflow-hidden whitespace-nowrap transition-all duration-300",
                    isSidebarOpen ? "p-8 pb-10" : "py-8 justify-center"
                )}>
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-purple-500/20">
                        <Factory className="w-6 h-6 text-white" />
                    </div>
                    <AnimatePresence>
                        {isSidebarOpen && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex flex-col"
                            >
                                <span className="font-black text-white text-xl tracking-tight leading-none">Factory</span>
                                <span className="font-bold text-slate-500 text-[10px] uppercase tracking-widest mt-1">Intelligent Twin</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Navigation Items */}
                <nav className="flex-1 px-4 py-2 space-y-3 overflow-y-auto overflow-x-hidden">
                    {NAV_ITEMS.map((item) => {
                        const isActive = currentPath === item.path;
                        const Icon = item.icon;

                        return (
                            <button
                                key={item.id}
                                onClick={() => navigate(item.path)}
                                className={cn(
                                    "w-full flex items-center gap-4 py-4 rounded-2xl transition-all duration-300 group relative truncate",
                                    isSidebarOpen ? "px-4" : "px-0 justify-center",
                                    isActive
                                        ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                                        : "text-slate-500 hover:bg-white/5 hover:text-slate-200"
                                )}
                            >
                                <Icon className={cn("w-6 h-6 shrink-0 transition-all duration-500", isActive ? "scale-110" : "group-hover:scale-110")} />

                                <AnimatePresence mode="wait">
                                    {isSidebarOpen && (
                                        <motion.span
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -10 }}
                                            className="font-bold text-sm tracking-wide whitespace-nowrap"
                                        >
                                            {item.label}
                                        </motion.span>
                                    )}
                                </AnimatePresence>

                                {!isSidebarOpen && !isActive && (
                                    <div className="absolute left-full ml-6 px-3 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-[100] border border-white/10">
                                        {item.label}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </nav>

                {/* Back to Home */}
                <div className="p-6 border-t border-white/5">
                    <button
                        className={cn(
                            "w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-300 text-slate-500 hover:bg-white/5 hover:text-slate-200 group relative",
                            !isSidebarOpen && "justify-center px-0"
                        )}
                        onClick={() => navigate("/")}
                    >
                        <ChevronLeft className="w-5 h-5 shrink-0 transition-transform group-hover:-translate-x-1" />
                        {isSidebarOpen && <span className="font-bold text-sm tracking-wide">Back to Home</span>}

                        {!isSidebarOpen && (
                            <div className="absolute left-full ml-6 px-3 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-[100] border border-white/10 whitespace-nowrap">
                                Back to Home
                            </div>
                        )}
                    </button>
                </div>
            </motion.aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 relative z-20">
                    <div className="flex items-center gap-4">
                        {currentPath !== "/virtual-line/overview" && (
                            <button
                                onClick={() => navigate(-1)}
                                className="group flex items-center justify-center w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 hover:text-purple-600 hover:border-purple-200 hover:bg-purple-50 transition-all duration-300 shadow-sm"
                            >
                                <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                            </button>
                        )}
                        <h2 className="text-[13px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3">
                            {currentPath !== "/virtual-line/overview" && <span className="text-slate-300 font-medium">/</span>}
                            {NAV_ITEMS.find(item => item.path === currentPath)?.label ||
                                (currentPath.includes('schedule') ? "Line Schedule" : "Virtual Line")}
                        </h2>

                        {(currentPath === "/virtual-line/floor" || (currentPath === "/virtual-line/tracker" && searchParams.get("line"))) && (
                            <div className="flex items-center gap-1 ml-4 bg-slate-100/50 p-1 rounded-2xl border border-slate-200/60 shadow-inner">
                                {searchParams.get("line") && activeLineData && (
                                    <div className="flex items-center gap-1 border-r border-slate-200/60 pr-1 mr-1">
                                        {/* Current Style - Click to see Layout */}
                                        <button
                                            onClick={() => navigate(`/virtual-line/floor?${searchParams.toString()}`)}
                                            className="flex flex-col items-start px-4 py-2 rounded-xl hover:bg-white transition-all shrink-0 text-left group/run"
                                        >
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5 group-hover/run:text-slate-600 transition-colors">
                                                {isRunning ? 'Running Style' : 'Changeover Style'}
                                            </span>
                                            <div className="flex items-center gap-2.5">
                                                <div className={cn("w-1.5 h-1.5 rounded-full", isRunning ? "bg-emerald-500" : "bg-indigo-500 animate-pulse")} />
                                                <span className="text-slate-900 font-black text-[13px] tracking-tight">{activeLineData.style_no}</span>
                                            </div>
                                        </button>
                                    </div>
                                )}

                                {currentPath === "/virtual-line/floor" ? (
                                    <div className="flex items-center gap-1">
                                        {/* Floor Toggle */}
                                        <div className="flex items-center gap-1 bg-white/50 p-1 rounded-2xl border border-slate-200/50 mr-2">
                                            {["Floor 1", "Floor 2"].map((f) => (
                                                <button
                                                    key={f}
                                                    onClick={() => setSearchParams({ floor: f, line: activeLine || "All Lines" })}
                                                    className={cn(
                                                        "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                                                        activeFloor === f
                                                            ? "bg-slate-900 text-white shadow-md"
                                                            : "text-slate-500 hover:text-slate-900"
                                                    )}
                                                >
                                                    {f}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Line Filter */}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 hover:border-purple-200 text-slate-700 hover:text-purple-600 transition-all">
                                                    <Filter size={14} className="text-slate-400" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">
                                                        {searchParams.get("line") || "All Lines"}
                                                    </span>
                                                    <ChevronDown size={14} className="text-slate-400" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-[180px] rounded-2xl p-2 border-slate-200 shadow-xl overflow-hidden overscroll-contain max-h-[400px]">
                                                <DropdownMenuItem
                                                    onClick={() => {
                                                        const params = new URLSearchParams(searchParams);
                                                        params.set("line", "All Lines");
                                                        setSearchParams(params);
                                                    }}
                                                    className="rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-wider focus:bg-purple-50 focus:text-purple-600 cursor-pointer"
                                                >
                                                    All Lines
                                                </DropdownMenuItem>
                                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                                                    <DropdownMenuItem
                                                        key={num}
                                                        onClick={() => {
                                                            const floor = num <= 6 ? "Floor 1" : "Floor 2";
                                                            setSearchParams({ floor, line: `Line ${num}` });
                                                        }}
                                                        className="rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-wider focus:bg-purple-50 focus:text-purple-600 cursor-pointer"
                                                    >
                                                        Line {num}
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => {
                                            const lineName = `Line ${num}`;
                                            const isActive = searchParams.get("line") === lineName;
                                            const isCOT = liveCotData.find(d => d.line_no === lineName)?.status === 'Changeover';
                                            const floor = num <= 6 ? "Floor 1" : "Floor 2";

                                            return (
                                                <button
                                                    key={num}
                                                    onClick={() => setSearchParams({ floor, line: lineName })}
                                                    className={cn(
                                                        "relative px-3.5 py-3 rounded-xl text-[12px] font-black transition-all uppercase tracking-wider flex-shrink-0",
                                                        isActive
                                                            ? "bg-slate-900 text-white shadow-lg"
                                                            : "text-slate-500 hover:text-slate-900 hover:bg-white"
                                                    )}
                                                >
                                                    L{num}
                                                    {isCOT && !isActive && (
                                                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-indigo-500 rounded-full border border-white animate-pulse" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 shadow-sm" />
                    </div>
                </header>

                <div className={cn(
                    "flex-1 overflow-y-auto relative z-10 scroll-smooth",
                    (currentPath === "/virtual-line/floor" || (currentPath === "/virtual-line/tracker" && searchParams.get("line"))) ? "p-0" : "p-8"
                )}>
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
