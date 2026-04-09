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
    Clock3,
    Package
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../../config";

const LINE_DATA = [
    { id: 1, name: "Line 1", floor: "Floor 1", style: "Polo Shirt V2", buyer: "Nike", startDate: "01/03/2024", endDate: "15/03/2024", status: "Active" },
    { id: 2, name: "Line 2", floor: "Floor 1", style: "Crew Neck Tee", buyer: "Adidas", startDate: "05/03/2024", endDate: "20/03/2024", status: "Active" },
    { id: 3, name: "Line 3", floor: "Floor 1", style: "Running Shorts", buyer: "Puma", startDate: "02/03/2024", endDate: "18/03/2024", status: "Pending" },
    { id: 4, name: "Line 4", floor: "Floor 1", style: "Yoga Pants", buyer: "Nike", startDate: "10/03/2024", endDate: "25/03/2024", status: "Active" },
    { id: 5, name: "Line 5", floor: "Floor 1", style: "Hoodie Basic", buyer: "Uniqlo", startDate: "08/03/2024", endDate: "22/03/2024", status: "Active" },
    { id: 6, name: "Line 6", floor: "Floor 1", style: "Cargo Shorts", buyer: "Gap", startDate: "12/03/2024", endDate: "27/03/2024", status: "Maintenance" },
    { id: 7, name: "Line 7", floor: "Floor 1", style: "Denim Jacket", buyer: "Levi's", startDate: "15/03/2024", endDate: "30/03/2024", status: "Pending" },
    { id: 8, name: "Line 8", floor: "Floor 2", style: "Joggers Sport", buyer: "Nike", startDate: "18/03/2024", endDate: "02/04/2024", status: "Active" },
    { id: 9, name: "Line 9", floor: "Floor 2", style: "Performance Shorts", buyer: "Adidas", startDate: "20/03/2024", endDate: "05/04/2024", status: "Pending" },
];

import { db } from "@/firebase";
import { collection, query, onSnapshot, where, limit, getDocs } from "firebase/firestore";

export default function VirtualLineOverview() {
    const navigate = useNavigate();
    const [lineStatuses, setLineStatuses] = useState<any[]>([]);

    useEffect(() => {
        let isMounted = true;
        let unsub = null;

        const syncAllStatus = async () => {
            try {
                // 1. Fetch from Local Backend (SQLite) - Optional
                let backendData = [];
                try {
                    const res = await fetch(`${API_BASE_URL}/current-styles`);
                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data)) backendData = data;
                    }
                } catch (e) {
                    console.warn("[Overview] Backend fetch skipped (using only Firestore)");
                }


                // 2. Setup Firestore Real-time Listener
                const q = collection(db, "changeoverData");
                unsub = onSnapshot(q, async (snap) => {
                    if (!isMounted) return;

                    const firestoreLines = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
                    
                    // Group by line to find the latest
                    const latestByLine: Record<string, any> = {};
                    firestoreLines.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)).forEach(l => {
                        const ln = l.line || l.summaryData?.line;
                        if (!ln) return;
                        const match = ln.match(/\d+/);
                        const normalizedLn = match ? `Line ${match[0]}` : ln;
                        
                        if (!latestByLine[normalizedLn]) {
                            latestByLine[normalizedLn] = l;
                        }
                    });


                    // Prepare merged statuses for all 9 lines
                    const merged = [];
                    for (let i = 1; i <= 9; i++) {
                        const ln = `Line ${i}`;
                        const foundCloud = latestByLine[ln];
                        const foundBackend = backendData.find(s => 
                            String(s.line_no).toUpperCase().replace(' ', '') === ln.toUpperCase().replace(' ', '')
                        );

                        if (foundCloud) {
                            const style = foundCloud.toStyle || foundCloud.styleCode || foundCloud.summaryData?.toStyle || foundCloud.summaryData?.styleCode || '---';
                            const con = foundCloud.conNo || foundCloud.summaryData?.conNo || foundCloud.conNumber || foundCloud.summaryData?.conNumber || '---';
                            const buyer = foundCloud.buyer || foundCloud.summaryData?.buyer || foundCloud.toBuyer || foundCloud.summaryData?.toBuyer || '---';

                            merged.push({
                                line_no: ln,
                                style_no: style,
                                con_no: con,
                                buyer: buyer,
                                status: (foundCloud.status === 'partial' || foundCloud.status === 'in_progress' || foundCloud.status === 'Changeover') ? 'Changeover' : (foundCloud.status || 'Running'),
                                isLive: true
                            });
                        } else if (foundBackend) {
                            merged.push(foundBackend);
                        } else {
                            merged.push({ line_no: ln, status: 'Idle', style_no: '---', con_no: '---', buyer: '---' });
                        }
                    }

                    // ─── Post-process missing metadata ───
                    const updatedWithMeta = await Promise.all(merged.map(async (item) => {
                        if (item.style_no !== '---' || item.con_no !== '---') {
                            try {
                                // 1. Try finding by Con No (most reliable for order details)
                                let searchVal = item.con_no !== '---' ? item.con_no : item.style_no;
                                let metaQ = query(
                                    collection(db, "styleOBmetadata"),
                                    where("conNo", "==", searchVal),
                                    limit(1)
                                );
                                let metaSnap = await getDocs(metaQ);
                                
                                // 2. Fallback: Try by Style Code
                                if (metaSnap.empty && item.style_no !== '---') {
                                    metaQ = query(
                                        collection(db, "styleOBmetadata"),
                                        where("style", "==", item.style_no),
                                        limit(1)
                                    );
                                    metaSnap = await getDocs(metaQ);
                                }

                                if (!metaSnap.empty) {
                                    const metaData = metaSnap.docs[0].data();
                                    
                                    // Robust Quantity Check (checking top-level and nested)
                                    const rawQty = 
                                        metaData.quantity || metaData.orderQty || metaData.totalQty || 
                                        metaData.orderQuantity || metaData.order_quantity || metaData.qty ||
                                        metaData.summaryData?.quantity || metaData.summaryData?.orderQty ||
                                        metaData.metadata?.quantity || metaData.metadata?.orderQty ||
                                        '---';

                                    const readableStyle = 
                                        metaData.styleName || metaData.uploadStyle || 
                                        metaData.summaryData?.styleName || metaData.style || '---';

                                    return {
                                        ...item,
                                        style_name: readableStyle,
                                        con_no: (metaData.conNo && metaData.conNo !== '---') ? metaData.conNo : item.con_no,
                                        buyer: (metaData.buyer && metaData.buyer !== '---') ? metaData.buyer : (metaData.summaryData?.buyer || item.buyer),
                                        quantity: rawQty,
                                        status: item.line_no === "Line 1" ? "Changeover" : "Running"
                                    };
                                }
                            } catch (e) {
                                console.warn(`[Overview] Failed to fetch metadata for ${item.style_no}`);
                            }
                        }
                        
                        // Default status override: Only Line 1 is changeover
                        return {
                            ...item,
                            status: item.line_no === "Line 1" ? "Changeover" : (item.status === "Idle" ? "Idle" : "Running")
                        };
                    }));

                    setLineStatuses(updatedWithMeta);
                });
            } catch (err) {
                console.error("Error syncing status:", err);
            }
        };

        syncAllStatus();
        return () => { isMounted = false; if (unsub) unsub(); };
    }, []);

    const mergedLineData = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(id => {
        const lineName = `Line ${id}`;
        const statusData = Array.isArray(lineStatuses) ? lineStatuses.find(s => s.line_no === lineName) : null;
        const floor = id <= 6 ? "Floor 1" : "Floor 2";

        return {
            id,
            name: lineName,
            floor,
            style: statusData?.style_no || "---",
            styleName: statusData?.style_name || "",
            buyer: statusData?.buyer || "---",
            status: statusData?.status || "Idle",
            con_no: statusData?.con_no || "---",
            quantity: statusData?.quantity || "---"
        };
    }).filter(line => line); // Show All lines including Idle

    return (
        <div className="space-y-10 p-2 max-w-[1600px] mx-auto pb-20">
            {/* Main Production Table */}
            <div className="space-y-6">
                <div className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-separate border-spacing-y-6 px-4">
                            <thead>
                                <tr className="bg-violet-950 rounded-[2rem] shadow-2xl shadow-violet-200/50 overflow-hidden border-none text-center">
                                    <th className="px-6 py-9 text-center text-[12px] font-black text-slate-100 uppercase tracking-[0.25em] rounded-l-[2rem]">Production Line</th>
                                    <th className="px-6 py-9 text-center text-[12px] font-black text-slate-100 uppercase tracking-[0.25em]">Current Style</th>
                                    <th className="px-6 py-9 text-center text-[12px] font-black text-slate-100 uppercase tracking-[0.25em]">Buyer</th>
                                    <th className="px-6 py-9 text-center text-[12px] font-black text-slate-100 uppercase tracking-[0.25em]">Con No</th>
                                    <th className="px-6 py-9 text-center text-[12px] font-black text-slate-100 uppercase tracking-[0.25em] rounded-r-[2rem]">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {mergedLineData.map((line, i) => (
                                    <motion.tr
                                        key={line.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className="group"
                                    >
                                        <td className="px-10 py-8 bg-slate-50/50 rounded-l-[2rem] border-t border-b border-l border-transparent group-hover:bg-purple-50/80 group-hover:border-purple-200 transition-all duration-300">
                                            <div className="flex items-center gap-6 justify-center">
                                                <div className="space-y-1 text-center">
                                                    <span className="font-black text-slate-900 text-lg group-hover:text-purple-700 transition-colors uppercase tracking-tight">{line.name}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-8 bg-slate-50/50 border-t border-b border-transparent group-hover:bg-purple-50/80 group-hover:border-purple-200 transition-all duration-300 text-center">
                                            <div className="flex flex-col gap-2 items-center">
                                                <span className="text-sm font-black text-slate-900 leading-tight">
                                                    {line.styleName && line.styleName !== '---' ? line.styleName : line.style}
                                                </span>
                                                {line.quantity && line.quantity !== "---" && (
                                                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                                        <Package size={10} className="text-blue-600" />
                                                        <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider">Order Qty: {Number(line.quantity).toLocaleString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-8 py-8 bg-slate-50/50 border-t border-b border-transparent group-hover:bg-purple-50/80 group-hover:border-purple-200 transition-all duration-300 text-center">
                                            <span className="text-sm font-black text-slate-600 tracking-tight uppercase">{line.buyer}</span>
                                        </td>
                                        <td className="px-8 py-8 bg-slate-50/50 border-t border-b border-transparent group-hover:bg-purple-50/80 group-hover:border-purple-200 transition-all duration-300 text-center">
                                            <span className="text-sm font-black text-slate-600 tracking-tight uppercase">{line.con_no}</span>
                                        </td>
                                        <td className="px-8 py-8 bg-slate-50/50 rounded-r-[2rem] border-t border-b border-transparent group-hover:bg-purple-50/80 group-hover:border-purple-200 transition-all duration-300 text-center">
                                            <div className={cn(
                                                "inline-flex items-center gap-2 px-5 py-2 rounded-full border transition-all duration-300",
                                                line.status === "Running" ? "bg-emerald-50 border-emerald-100 text-emerald-700 shadow-sm shadow-emerald-100" :
                                                    line.status === "Changeover" ? "bg-indigo-50 border-indigo-100 text-indigo-700 shadow-sm shadow-indigo-100" :
                                                        "bg-slate-50 border-slate-200 text-slate-500 shadow-sm shadow-slate-100"
                                            )}>
                                                <Circle size={8} fill="currentColor" className={cn(
                                                    line.status === "Running" ? "text-emerald-500" :
                                                        line.status === "Changeover" ? "text-indigo-500 animate-pulse" :
                                                            "text-slate-300"
                                                )} />
                                                <span className="text-[10px] font-black uppercase tracking-[0.15em]">{line.status}</span>
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
