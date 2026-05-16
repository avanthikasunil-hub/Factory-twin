import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Factory, Brain, Database, ArrowLeft, Building2, MapPin, Activity, Box, Workflow } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function HomeScreenPage() {
  const navigate = useNavigate();
  const [selectedFactory, setSelectedFactory] = useState<string | null>(() => {
    return sessionStorage.getItem("selectedFactory");
  });

  const handleSetFactory = (factory: string | null) => {
    setSelectedFactory(factory);
    if (factory) {
      sessionStorage.setItem("selectedFactory", factory);
    } else {
      sessionStorage.removeItem("selectedFactory");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eaf2ff] via-[#f5f9ff] to-[#e8f0ff] flex items-center justify-center px-4 py-8 md:px-6 md:py-12">
      <div className="max-w-6xl w-full">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          {selectedFactory && (
            <motion.button
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={() => handleSetFactory(null)}
              className="flex items-center gap-2 text-[#123B6D] font-bold text-sm uppercase tracking-widest hover:opacity-70 transition-colors mb-8 mx-auto"
            >
              <ArrowLeft size={16} />
              Switch Factory
            </motion.button>
          )}

           <motion.h1
             initial={{ opacity: 0, y: 25 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ duration: 0.8, ease: "easeOut" }}
             className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-6 text-[#123B6D] tracking-tight"
           >
             Factory Twin
           </motion.h1>

          <p className="text-gray-500 max-w-2xl mx-auto text-lg pt-4 leading-relaxed">
            {selectedFactory === "DBR" 
              ? "Doddaballapur Production Dashboard" 
              : selectedFactory === "KPR"
              ? "Kanakapura Production Dashboard"
              : "Digital twin platform for garment factory planning and shopfloor"}
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {!selectedFactory ? (
            <motion.div
              key="factory-select"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-4xl mx-auto"
            >
              {/* DBR */}
              <motion.div whileHover={{ y: -10 }} transition={{ type: "spring", stiffness: 300 }}>
                <Card
                  className="rounded-[2.5rem] shadow-xl border-0 bg-white cursor-pointer hover:shadow-2xl transition h-full group"
                  onClick={() => handleSetFactory("DBR")}
                >
                  <CardContent className="p-6 md:p-12 flex flex-col items-center text-center gap-4 md:gap-6 min-h-[300px] md:min-h-[400px] justify-between">
                    <div className="flex flex-col items-center gap-6">
                      <div className="p-6 rounded-[2rem] bg-indigo-600 text-white shadow-xl group-hover:scale-105 transition-transform duration-300">
                        <Building2 size={48} />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-3xl font-extrabold text-[#123B6D] tracking-tight">DBR</h3>
                        <p className="text-indigo-600 font-bold text-xs uppercase tracking-widest">Doddaballapur</p>
                      </div>
                      <p className="text-gray-500 text-sm leading-relaxed px-4">
                        Access Line Planner, C/O Monitor, and FactoryView for the DBR facility.
                      </p>
                    </div>
                    <Button className="w-full bg-[#123B6D] hover:bg-[#1a4a84] py-6 rounded-2xl">Enter DBR</Button>
                  </CardContent>
                </Card>
              </motion.div>

              {/* KPR */}
              <motion.div whileHover={{ y: -10 }} transition={{ type: "spring", stiffness: 300 }}>
                <Card
                  className="rounded-[2.5rem] shadow-xl border-0 bg-white cursor-pointer hover:shadow-2xl transition h-full group"
                  onClick={() => handleSetFactory("KPR")}
                >
                  <CardContent className="p-6 md:p-12 flex flex-col items-center text-center gap-4 md:gap-6 min-h-[300px] md:min-h-[400px] justify-between">
                    <div className="flex flex-col items-center gap-6">
                      <div className="p-6 rounded-[2rem] bg-emerald-600 text-white shadow-xl group-hover:scale-105 transition-transform duration-300">
                        <Building2 size={48} />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-3xl font-extrabold text-[#123B6D] tracking-tight">KPR</h3>
                        <p className="text-emerald-600 font-bold text-xs uppercase tracking-widest">Kanakapura</p>
                      </div>
                      <p className="text-gray-500 text-sm leading-relaxed px-4">
                        Access Line Planner and Style Repository for the KPR facility.
                      </p>
                    </div>
                    <Button className="w-full bg-emerald-700 hover:bg-emerald-800 py-6 rounded-2xl">Enter KPR</Button>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="module-select"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-12"
            >
              {selectedFactory === "DBR" ? (
                <>
                  {/* Line Planner */}
                  <motion.div whileHover={{ y: -10 }}>
                    <Card
                      className="rounded-3xl shadow-xl border-0 bg-white cursor-pointer hover:shadow-2xl transition h-full"
                      onClick={() => navigate(`/${selectedFactory?.toLowerCase()}/line-planner`)}
                    >
                      <CardContent className="p-10 flex flex-col items-center text-center gap-5 min-h-[340px] justify-between">
                        <div className="flex flex-col items-center gap-5">
                          <div className="p-4 rounded-2xl bg-gradient-to-br from-primary to-accent industrial-glow">
                            <Workflow className="w-10 h-10 text-primary-foreground" />
                          </div>
                          <h3 className="text-2xl font-semibold">Line Planner</h3>
                          <p className="text-gray-500 text-sm leading-relaxed">
                            Advanced tool for the layout generation and planning of new styles.
                          </p>
                        </div>
                        <Button className="mt-6">Open Line Planner</Button>
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* C/O Monitor */}
                  <motion.div whileHover={{ y: -6 }}>
                    <Card
                      className="rounded-3xl shadow-xl border-0 bg-white cursor-pointer hover:shadow-2xl transition h-full"
                      onClick={() => navigate(`/${selectedFactory?.toLowerCase()}/virtual-line`)}
                    >
                      <CardContent className="p-10 flex flex-col items-center text-center gap-5 min-h-[340px] justify-between">
                        <div className="flex flex-col items-center gap-5">
                          <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center">
                            <Activity className="text-purple-600" size={32} />
                          </div>
                          <h3 className="text-2xl font-semibold">C/O Monitor</h3>
                          <p className="text-gray-500 text-sm leading-relaxed px-4">
                            Live interface for real-time changeover monitoring and execution tracking.
                          </p>
                        </div>
                        <Button className="mt-6">Open C/O Monitor</Button>
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* FactoryView */}
                  <motion.div whileHover={{ y: -6 }}>
                    <Card
                      className="rounded-3xl shadow-xl border-0 bg-white cursor-pointer hover:shadow-2xl transition h-full"
                      onClick={() => navigate(`/${selectedFactory?.toLowerCase()}/digital-twin`)}
                    >
                      <CardContent className="p-10 flex flex-col items-center text-center gap-5 min-h-[340px] justify-between">
                        <div className="flex flex-col items-center gap-5">
                          <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                            <Box className="text-emerald-600" size={32} />
                          </div>
                          <h3 className="text-2xl font-semibold">FactoryView</h3>
                          <p className="text-gray-500 text-sm leading-relaxed">
                            Interactive 3D environment for viewing the complete factory floor.
                          </p>
                        </div>
                        <Button className="mt-6">Open FactoryView</Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                </>
              ) : (
                <div className="col-span-3 flex justify-center">
                  {/* KPR ONLY: Line Planner */}
                  <motion.div whileHover={{ y: -10 }} className="max-w-md w-full">
                    <Card
                      className="rounded-3xl shadow-xl border-0 bg-white cursor-pointer hover:shadow-2xl transition h-full"
                      onClick={() => navigate("/kpr/line-planner")}
                    >
                      <CardContent className="p-10 flex flex-col items-center text-center gap-5 min-h-[340px] justify-between">
                        <div className="flex flex-col items-center gap-5">
                          <div className="p-4 rounded-2xl bg-gradient-to-br from-primary to-accent industrial-glow">
                            <Workflow className="w-10 h-10 text-primary-foreground" />
                          </div>
                          <h3 className="text-2xl font-semibold">Line Planner</h3>
                          <p className="text-gray-500 text-sm leading-relaxed">
                            Advanced tool for the layout generation and planning of new styles.
                          </p>
                        </div>
                        <Button className="mt-6">Open KPR Line Planner</Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <p className="mt-24 text-center text-sm text-gray-400">
          Factory Twin · v1.0
        </p>

      </div>
    </div>
  );
}
