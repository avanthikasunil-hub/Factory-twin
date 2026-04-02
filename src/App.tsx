import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";

/* MAIN HOME */
import HomeScreenPage from "./pages/HomeScreenPage";

/* LINE PLANNER MODULE */
import PlanHomePage from "./pages/LinePlanner/PlanHomePage";
import CreateLinePage from "./pages/LinePlanner/CreateLinePage";
import ViewLinesPage from "./pages/LinePlanner/ViewLinesPage";
import LinePlannerPage from "./pages/LinePlanner/LinePlannerPage";

/* VIRTUAL LINE MODULE */
import VirtualLineLayout from "./pages/VirtualLine/VirtualLineLayout";
import VirtualLineOverview from "./pages/VirtualLine/VirtualLineOverview";
import VirtualFloorView from "./pages/VirtualLine/VirtualFloorView";
import LineScheduleDetails from "./pages/VirtualLine/LineScheduleDetails";
import CotTracker from "./pages/VirtualLine/CotTracker";
import StyleOB from "./features/Cutting/StyleOB";
import WarRoomPage from "./pages/VirtualLine/WarRoomPage";
import { Navigate } from "react-router-dom";

/* DIGITAL TWIN MODULE */
import DigitalTwinPage from "./pages/DigitalTwin/DigitalTwinPage";

const queryClient = new QueryClient();

export default function App() {
  // Wake up the backend on app load (prevents Render cold starts)
  useEffect(() => {
    fetch("https://factory-twin-2.onrender.com/ping").catch(() => {
      // Slient fail - this is for server wakeup only
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>

            {/* HOME */}
            <Route path="/" element={<HomeScreenPage />} />

            {/* LINE PLANNER MODULE */}
            <Route path="/line-planner" element={<PlanHomePage />} />
            <Route path="/line-planner/create" element={<CreateLinePage />} />
            <Route path="/line-planner/lines" element={<ViewLinesPage />} />
            <Route path="/line-planner/planner" element={<LinePlannerPage />} />

            {/* VIRTUAL LINE MODULE */}
            <Route path="/virtual-line" element={<VirtualLineLayout />}>
              <Route index element={<VirtualLineOverview />} />
              <Route path="overview" element={<VirtualLineOverview />} />
              <Route path="floor" element={<VirtualFloorView />} />
              <Route path="schedule" element={<LineScheduleDetails />} />
              <Route path="tracker" element={<CotTracker />} />
              <Route path="ob" element={<StyleOB />} />
              <Route path="war-room" element={<WarRoomPage />} />
            </Route>

            {/* DIGITAL TWIN MODULE */}
            <Route path="/digital-twin" element={<DigitalTwinPage />} />

          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
