/**
 * Normalized operation data structure
 * This is what we convert raw Excel data into
 */
export interface Operation {
  op_no: string;
  op_name: string;
  machine_type: string;
  smv: number;
  section: string;
  tool_folder?: string;
  machinist_smv?: number;
  non_machinist_smv?: number;
  no_of_machines?: number;
  seqIndex?: number;      // v165: Original index in OB sequence for staging logic
  isPreparatory?: boolean; // v165: Explicit flag for manual staging
}
export type ColumnAliases = {
  op_no: string[];
  op_name: string[];
  machine_type: string[];
  smv: string[];
  section: string[];
  tool_folder: string[];
  machinist_smv: string[];
  non_machinist_smv: string[];
};



/**
 * Machine position in 3D space
 */
export interface MachinePosition {
  id: string;
  operation: Operation;
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotation: {
    x: number;
    y: number;
    z: number;
  };
  // ✅ New fields for layout logic
  lane?: 'A' | 'B' | 'C' | 'D';
  isTrolley?: boolean;
  isInspection?: boolean;
  section?: string;
  centerModel?: boolean;
  machineIndex?: number; // 0 for first machine of this op, 1 for second, etc.
  hasManualPosition?: boolean;
  modelRotation?: number; 
  tableLength?: number;
  tableWidth?: number;
  tableOnly?: boolean;
}

export interface SectionLayout {
  id: string;
  name: string;
  width: number;
  length: number;
  position: {
    x: number;
    y: number;
    z: number;
  };
  color: string;
}

/**
 * Complete line data structure
 */
export interface LineData {
  id: string;
  lineNo: string;
  styleNo: string;
  coneNo: string;
  buyer?: string;
  createdAt: string;
  updatedAt: string;
  operations: Operation[];
  machineLayout: MachinePosition[];
  sectionLayout?: SectionLayout[];
  totalSMV: number;
  // ✅ New fields for line balancing
  targetOutput: number;
  workingHours: number;
  efficiency?: number;
  sourceSheet?: string;
  preparatoryOps?: Operation[];
}

/**
 * Machine type categories for 3D models and colors
 */
export type MachineCategory =
  | 'snls'      // Single Needle Lock Stitch
  | 'snec'      // Overlock/Edge cutting
  | 'iron'      // Iron/Pressing
  | 'button'    // Button hole/sewing
  | 'bartack'   // Bartack machine
  | 'special'   // Special ma
