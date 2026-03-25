import React from "react";
import { Scene3D } from "@/components/3d/Scene3D";
import { MachinePosition, SectionLayout } from "@/types";

interface SewingViewProps {
  activeFloor: string;
  activeLine: string;
  activeMachines: MachinePosition[];
  floorSections: SectionLayout[];
  cameraConfig: { pos: number[]; fov: number };
}

export const SewingView: React.FC<SewingViewProps> = ({
  activeFloor,
  activeLine,
  activeMachines,
  floorSections,
  cameraConfig,
}) => {
  return (
    <Scene3D
      key={activeFloor + activeLine}
      showMachines={true}
      machines={activeMachines}
      sections={floorSections}
      isOverview={activeLine === "All Lines"}
      cameraPosition={cameraConfig.pos as any}
      cameraFov={cameraConfig.fov}
    />
  );
};
