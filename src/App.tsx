import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";

/* MAIN HOME */
import HomeScreenPage from "./pages/HomeScreenPage";

/* DBR FACTORY MODULES */
import DBRLinePlannerHome from "./pages/DBR/LinePlanner/PlanHomePage";
import DBRCreateLine from "./pages/DBR/LinePlanner/CreateLinePage";
import DBRViewLines from "./pages/DBR/LinePlanner/ViewLinesPage";
import DBRLinePlanner from "./pages/DBR/LinePlanner/LinePlannerPage";
import DBRVirtualLineLayout from "./pages/DBR/VirtualLine/VirtualLineLayout";
import DBRVirtualLineOverview from "./pages/DBR/VirtualLine/VirtualLineOverview";
import DBRVirtualFloorView from "./pages/DBR/VirtualLine/VirtualFloorView";
import DBRLineScheduleDetails from "./pages/DBR/VirtualLine/LineScheduleDetails";
import DBRCotTracker from "./pages/DBR/VirtualLine/CotTracker";
import DBRWarRoom from "./pages/DBR/VirtualLine/WarRoomPage";
import DBRDigitalTwin from "./pages/DBR/DigitalTwin/DigitalTwinPage";

/* KPR FACTORY MODULES */
import KPRLinePlannerHome from "./pages/KPR/LinePlanner/PlanHomePage";
import KPRCreateLine from "./pages/KPR/LinePlanner/CreateLinePage";
import KPRViewLines from "./pages/KPR/LinePlanner/ViewLinesPage";
import KPRLinePlanner from "./pages/KPR/LinePlanner/LinePlannerPage";

/* COMMON MODULES */
import StyleOB from "./features/Cutting/StyleOB";

const queryClient = new QueryClient();

export default function App() {
  useEffect(() => {
    fetch("https://factory-twin-2.onrender.com/ping").catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<HomeScreenPage />} />

            {/* DBR ROUTES */}
            <Route path="/dbr">
               <Route path="line-planner" element={<DBRLinePlannerHome />} />
               <Route path="line-planner/create" element={<DBRCreateLine />} />
               <Route path="line-planner/lines" element={<DBRViewLines />} />
               <Route path="line-planner/planner" element={<DBRLinePlanner />} />
               
               <Route path="virtual-line" element={<DBRVirtualLineLayout />}>
                 <Route index element={<DBRVirtualLineOverview />} />
                 <Route path="overview" element={<DBRVirtualLineOverview />} />
                 <Route path="floor" element={<DBRVirtualFloorView />} />
                 <Route path="schedule" element={<DBRLineScheduleDetails />} />
                 <Route path="tracker" element={<DBRCotTracker />} />
                 <Route path="ob" element={<StyleOB />} />
                 <Route path="war-room" element={<DBRWarRoom />} />
               </Route>
               
               <Route path="digital-twin" element={<DBRDigitalTwin />} />
            </Route>

            {/* KPR ROUTES */}
            <Route path="/kpr">
               <Route path="line-planner" element={<KPRLinePlannerHome />} />
               <Route path="line-planner/create" element={<KPRCreateLine />} />
               <Route path="line-planner/lines" element={<KPRViewLines />} />
               <Route path="line-planner/planner" element={<KPRLinePlanner />} />
            </Route>

            {/* BACKWARDS COMPATIBILITY REDIRECTS */}
            <Route path="/line-planner/*" element={<Navigate to="/dbr/line-planner" replace />} />
            <Route path="/virtual-line/*" element={<Navigate to="/dbr/virtual-line" replace />} />
            <Route path="/digital-twin/*" element={<Navigate to="/dbr/digital-twin" replace />} />

          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
