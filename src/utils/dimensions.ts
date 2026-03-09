
// Conversion factor: 1 ft = 0.3048 meters
const FT_TO_M = 0.3048;

export interface Dimension {
  width: number;
  length: number;
}

/**
 * Machine Dimensions (Length x Width in Meters)
 * Based on user input in feet
 * NOTE: User provided Length x Width. We store fitting dimensions.
 */
export const MACHINE_DIMENSIONS: Record<string, Dimension> = {
  // Standard Stitching Machines (4' x 2.5')
  'SNLS': { length: 4 * FT_TO_M, width: 2.5 * FT_TO_M },
  'DNLS': { length: 4 * FT_TO_M, width: 2.5 * FT_TO_M },
  'Overlock': { length: 4 * FT_TO_M, width: 2.5 * FT_TO_M },
  'SNEC': { length: 4 * FT_TO_M, width: 2.5 * FT_TO_M },
  'Bartack': { length: 4 * FT_TO_M, width: 2.5 * FT_TO_M },
  'Button Hole': { length: 4 * FT_TO_M, width: 2.5 * FT_TO_M },
  'Button Stitch': { length: 4 * FT_TO_M, width: 2.5 * FT_TO_M },
  'Notch mc': { length: 4 * FT_TO_M, width: 2.5 * FT_TO_M },

  // Specialized Machines
  'FOA': { length: 4.5 * FT_TO_M, width: 2.5 * FT_TO_M }, // Feed Off Arm
  'Turning Machine': { length: 4.0 * FT_TO_M, width: 3.0 * FT_TO_M },
  'Pointing Machine': { length: 4.0 * FT_TO_M, width: 3.0 * FT_TO_M },
  'Contour Machine': { length: 4.5 * FT_TO_M, width: 3.0 * FT_TO_M },

  // Tables
  'Iron Press Table': { length: 5 * FT_TO_M, width: 3.5 * FT_TO_M },
  'Inspection Table': { length: 6 * FT_TO_M, width: 4.0 * FT_TO_M },

  // Default
  'DEFAULT': { length: 1.2, width: 0.8 }
};

/**
 * Section Dimensions (Width x Length in Meters)
 * User Format: "Cuff 9.3009 x 34.34"
 * Assuming: Width x Length (or vice-versa, but usually along-line is longer)
 * 34 ft is clearly Length (along the line flow).
 * 9 ft is Width (across the factory floor).
 */
export const SECTION_DIMENSIONS: Record<string, Record<string, Dimension>> = {
  // Lines 1 to 5 (Default)
  'DEFAULT': {
    cuff: { width: 9.3009 * FT_TO_M, length: 34.34 * FT_TO_M },
    sleeve: { width: 9.3009 * FT_TO_M, length: 25.0 * FT_TO_M },
    back: { width: 9.3009 * FT_TO_M, length: 43.6927 * FT_TO_M },
    collar: { width: 10.2098 * FT_TO_M, length: 62.0 * FT_TO_M },
    front: { width: 10.2098 * FT_TO_M, length: 43.8055 * FT_TO_M },
    assembly: { width: 10.2098 * FT_TO_M, length: 56.03 * FT_TO_M },
  },
  // Line 6
  'LINE 6': {
    cuff: { width: 9.025 * FT_TO_M, length: 30.9498 * FT_TO_M },
    sleeve: { width: 9.025 * FT_TO_M, length: 24.5510 * FT_TO_M },
    collar: { width: 9.0 * FT_TO_M, length: 56.7096 * FT_TO_M },
    // Fallbacks will be handled in logic
  }
};

export const getMachineDimensions = (machineType: string): Dimension => {
  const normType = machineType.toLowerCase();

  // Keyword matching
  if (normType.includes('snls')) return MACHINE_DIMENSIONS['SNLS'];
  if (normType.includes('dnls')) return MACHINE_DIMENSIONS['DNLS'];
  if (normType.includes('overlock')) return MACHINE_DIMENSIONS['Overlock'];
  if (normType.includes('snec')) return MACHINE_DIMENSIONS['SNEC'];
  if (normType.includes('bartack')) return MACHINE_DIMENSIONS['Bartack'];
  if (normType.includes('button hole')) return MACHINE_DIMENSIONS['Button Hole'];
  if (normType.includes('button')) return MACHINE_DIMENSIONS['Button Stitch']; // Matches 'button m/c'
  if (normType.includes('notch')) return MACHINE_DIMENSIONS['Notch mc'];
  if (normType.includes('foa') || normType.includes('feed off')) return MACHINE_DIMENSIONS['FOA'];
  if (normType.includes('turning')) return MACHINE_DIMENSIONS['Turning Machine'];
  if (normType.includes('pointing')) return MACHINE_DIMENSIONS['Pointing Machine'];
  if (normType.includes('contour')) return MACHINE_DIMENSIONS['Contour Machine'];
  if (normType.includes('iron') || normType.includes('press')) return MACHINE_DIMENSIONS['Iron Press Table'];
  if (normType.includes('inspection')) return MACHINE_DIMENSIONS['Inspection Table'];

  return MACHINE_DIMENSIONS['DEFAULT'];
};

export const getSectionDimensions = (lineNo: string, sectionName: string): Dimension | null => {
  const lineKey = lineNo.toUpperCase().includes('LINE 6') ? 'LINE 6' : 'DEFAULT';
  const secKey = sectionName.toLowerCase();

  // Try specific line
  let dim = SECTION_DIMENSIONS[lineKey][secKey];

  // Fallback to default line if not found
  if (!dim && lineKey !== 'DEFAULT') {
    dim = SECTION_DIMENSIONS['DEFAULT'][secKey];
  }

  return dim || null;
};
