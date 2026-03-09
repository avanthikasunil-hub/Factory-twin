import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Scene3D } from "@/components/3d/Scene3D";
import { getLayoutSpecs, LANE_Z_CENTER_AB, LANE_Z_CENTER_CD, LANE_Z_A, LANE_Z_B, LANE_Z_C, LANE_Z_D } from "@/utils/layoutGenerator";
import { SectionLayout } from "@/types";
import { cn } from "@/lib/utils";

const LINE_COLORS = [
    '#3b82f6', // Blue
    '#ef4444', // Red
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#f97316', // Orange
    '#84cc16'  // Lime
];

export default function VirtualFloor() {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeFloor = searchParams.get("floor") || "Floor 1";
    const activeLine = searchParams.get("line") || "All Lines";

    // Generate static sections for Virtual Floor based on layoutGenerator specs
    const floorSections = useMemo(() => {
        const data = getLayoutSpecs("Line 1");
        const { specs, sections } = data;

        const minZ = LANE_Z_CENTER_AB - (specs.widthAB / 2);
        const maxZ = LANE_Z_CENTER_CD + (specs.widthCD / 2);
        const lineGap = 3.7;
        const zStep = (maxZ - minZ) + lineGap;

        const numLines = activeFloor === "Floor 1" ? 6 : 3;
        const allSections: SectionLayout[] = [];

        for (let i = 0; i < numLines; i++) {
            const zOffset = i * zStep;
            let lineLabelValue = "";
            let colorIndex = 0;

            if (activeFloor === "Floor 1") {
                lineLabelValue = `Line ${i + 1}`;
                colorIndex = i;
            } else {
                // Floor 2 has Lines 7, 8, 9
                lineLabelValue = `Line ${i + 7}`;
                colorIndex = i + 6;
            }

            // FILTER: Skip if we are filtering for a specific line and this isn't it
            if (activeLine !== "All Lines" && lineLabelValue !== activeLine) {
                continue;
            }

            const lineColor = LINE_COLORS[colorIndex % LINE_COLORS.length];

            allSections.push(
                {
                    id: `${lineLabelValue}-cuff`,
                    name: `${lineLabelValue} Cuff`,
                    length: sections.cuff.end - sections.cuff.start,
                    width: specs.widthAB,
                    position: { x: sections.cuff.start, y: 0, z: LANE_Z_CENTER_AB + zOffset },
                    color: lineColor
                },
                {
                    id: `${lineLabelValue}-sleeve`,
                    name: `${lineLabelValue} Sleeve`,
                    length: sections.sleeve.end - sections.sleeve.start,
                    width: specs.widthAB,
                    position: { x: sections.sleeve.start, y: 0, z: LANE_Z_CENTER_AB + zOffset },
                    color: lineColor
                },
                {
                    id: `${lineLabelValue}-back`,
                    name: `${lineLabelValue} Back`,
                    length: sections.back.end - sections.back.start,
                    width: specs.widthAB,
                    position: { x: sections.back.start, y: 0, z: LANE_Z_CENTER_AB + zOffset },
                    color: lineColor
                },
                {
                    id: `${lineLabelValue}-collar`,
                    name: `${lineLabelValue} Collar`,
                    length: sections.collar.end - sections.collar.start,
                    width: specs.widthCD,
                    position: { x: sections.collar.start, y: 0, z: LANE_Z_CENTER_CD + zOffset },
                    color: lineColor
                },
                {
                    id: `${lineLabelValue}-front`,
                    name: `${lineLabelValue} Front`,
                    length: sections.front.end - sections.front.start,
                    width: specs.widthCD,
                    position: { x: sections.front.start, y: 0, z: LANE_Z_CENTER_CD + zOffset },
                    color: lineColor
                },
                {
                    id: `${lineLabelValue}-assembly1`,
                    name: `${lineLabelValue} Assembly AB`,
                    length: sections.assemblyAB.end - sections.assemblyAB.start,
                    width: specs.widthAB,
                    position: { x: sections.assemblyAB.start, y: 0, z: LANE_Z_CENTER_AB + zOffset },
                    color: lineColor
                },
                {
                    id: `${lineLabelValue}-assembly2`,
                    name: `${lineLabelValue} Assembly CD`,
                    length: sections.assemblyCD.end - sections.assemblyCD.start,
                    width: specs.widthCD,
                    position: { x: sections.assemblyCD.start, y: 0, z: LANE_Z_CENTER_CD + zOffset },
                    color: lineColor
                }
            );
        }

        return allSections;
    }, [activeFloor, activeLine]);

    // Dynamic camera for simple Floor 1 vs Floor 2 zoom
    const cameraConfig = useMemo(() => {
        if (activeLine === "All Lines") {
            if (activeFloor === "Floor 1") {
                return { position: [-90, 90, 12] as [number, number, number], fov: 32 };
            } else {
                return { position: [-60, 60, 8] as [number, number, number], fov: 28 };
            }
        } else {
            // Detailed Line view (Section Zone focus)
            const lineNum = parseInt(activeLine.split(' ')[1]);
            let i = 0;

            if (activeFloor === "Floor 1") {
                i = lineNum - 1;
            } else {
                i = lineNum - 7;
            }

            const data = getLayoutSpecs("Line 1");
            const { specs } = data;
            const minZ = LANE_Z_CENTER_AB - (specs.widthAB / 2);
            const maxZ = LANE_Z_CENTER_CD + (specs.widthCD / 2);
            const zStep = (maxZ - minZ) + 3.7;
            const zOffset = i * zStep;

            return { position: [-30, 40, (LANE_Z_CENTER_AB + LANE_Z_CENTER_CD) / 2 + zOffset] as [number, number, number], fov: 25 };
        }
    }, [activeFloor, activeLine]);

    return (
        <div className="absolute inset-0 flex flex-col bg-slate-950 overflow-hidden">
            <div className="flex-1 relative bg-[#0a0a0c]">
                <Scene3D
                    key={`${activeFloor}-${activeLine}`}
                    showMachines={false}
                    sections={floorSections}
                    isOverview={activeLine === "All Lines"}
                    cameraPosition={cameraConfig.position}
                    cameraFov={cameraConfig.fov}
                />
            </div>
        </div>
    );
}
