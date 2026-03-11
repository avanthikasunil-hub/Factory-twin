import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Factory, Brain, Database } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function HomeScreenPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eaf2ff] via-[#f5f9ff] to-[#e8f0ff] flex items-center justify-center px-6">
      <div className="max-w-6xl w-full">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          {/* Navy Blue Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-5xl md:text-6xl font-extrabold mb-6
                       text-[#123B6D] tracking-tight"
          >
            Factory Twin
          </motion.h1>

          <p className="text-gray-500 max-w-2xl mx-auto text-lg pt-4 leading-relaxed">
            Digital twin platform for garment factory planning and shopfloor
          </p>
        </motion.div>

        {/* Options */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">

          {/* Line Planner */}
          <motion.div whileHover={{ y: -10 }}>
            <Card
              className="rounded-3xl shadow-xl border-0 bg-white cursor-pointer hover:shadow-2xl transition h-full"
              onClick={() => navigate("/line-planner")}
            >
              <CardContent className="p-10 flex flex-col items-center text-center gap-5 min-h-[340px] justify-between">
                <div className="flex flex-col items-center gap-5">
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-primary to-accent industrial-glow">
                    <Factory className="w-10 h-10 text-primary-foreground" />
                  </div>
                  <h3 className="text-2xl font-semibold">Line Planner</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    Visualize and plan your garment production lines with powerful 3D layouts
                  </p>
                </div>
                <Button className="mt-6">Open Line Planner</Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Virtual Line (Module) */}
          <motion.div whileHover={{ y: -6 }}>
            <Card
              className="rounded-3xl shadow-xl border-0 bg-white cursor-pointer hover:shadow-2xl transition h-full"
              onClick={() => navigate("/virtual-line")}
            >
              <CardContent className="p-10 flex flex-col items-center text-center gap-5 min-h-[340px] justify-between">
                <div className="flex flex-col items-center gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center">
                    <Brain className="text-purple-600" size={32} />
                  </div>

                  <h3 className="text-2xl font-semibold">
                    Virtual Line
                  </h3>

                  <p className="text-gray-500 text-sm leading-relaxed px-4">
                    Digital twin view of production lines and operational status.
                  </p>
                </div>

                <Button className="mt-6">Open Virtual Line</Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Digital Twin */}
          <motion.div whileHover={{ y: -6 }}>
            <Card
              className="rounded-3xl shadow-xl border-0 bg-white cursor-pointer hover:shadow-2xl transition h-full"
              onClick={() => navigate("/digital-twin")}
            >
              <CardContent className="p-10 flex flex-col items-center text-center gap-5 min-h-[340px] justify-between">
                <div className="flex flex-col items-center gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                    <Database className="text-emerald-600" size={32} />
                  </div>

                  <h3 className="text-2xl font-semibold">
                    Digital Twin
                  </h3>

                  <p className="text-gray-500 text-sm leading-relaxed">
                    View the real-time status and 3D layout of the entire factory floor.
                  </p>
                </div>

                <Button className="mt-6">Open Digital Twin</Button>
              </CardContent>
            </Card>
          </motion.div>

        </div>

        {/* Footer */}
        <p className="mt-24 text-center text-sm text-gray-400">
          Factory Twin · v1.0
        </p>

      </div>
    </div>
  );
}
