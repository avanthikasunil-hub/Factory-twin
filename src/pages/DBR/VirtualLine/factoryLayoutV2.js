/**
 * Core utility for Factory Layout Dimensions and Spacing
 * All lengths in FEET converted to METERS (FT = 0.3048)
 * Version: 2.0.1 (Sync Push)
 */

export const FT = 0.3048;
export const LANE_Z_CENTER_AB = -3.92;
export const LANE_Z_CENTER_CD = 0.0;
export const LANE_Z_A = -5.2;
export const LANE_Z_B = -6.8;
export const LANE_Z_C = 0.75;
export const LANE_Z_D = -0.75;

export const LINE_PRESETS = {
  A: {
    cuff:        { length: 34.34, width: 9.3009, group: 'AB' },
    sleeve:      { length: 25.00, width: 9.3009, group: 'AB' },
    back:        { length: 43.69, width: 9.3009, group: 'AB' },
    collar:      { length: 62.00, width: 10.2098, group: 'CD' },
    front:       { length: 43.80, width: 10.2098, group: 'CD' },
    'assembly 1':{ length: 46.00, width: 9.3009,  group: 'AB' },
    'assembly 2':{ length: 46.00, width: 10.2098, group: 'CD' },
  },
  B: {
    cuff:        { length: 34.34, width: 9.025, group: 'AB' },
    sleeve:      { length: 25.00, width: 9.025, group: 'AB' },
    back:        { length: 43.69, width: 9.025, group: 'AB' },
    collar:      { length: 62.00, width: 9.000, group: 'CD' },
    front:       { length: 43.80, width: 9.000, group: 'CD' },
    'assembly 1':{ length: 56.03, width: 9.025, group: 'AB' },
    'assembly 2':{ length: 56.02, width: 9.000, group: 'CD' },
  },
};

export function getLayoutSpecs(lineNo = 'Line 1') {
  const num = parseInt(lineNo.replace(/\D/g, '')) || 1;
  const presetKey = num >= 7 ? 'B' : 'A';
  const p  = LINE_PRESETS[presetKey];
  const pA = LINE_PRESETS['A']; // Fixed endpoints always based on Preset A

  const cuffEnd     = (0.2719 + pA.cuff.length) * FT;
  const sleeveEnd   = (0.2719 + pA.cuff.length + 2.9319 + pA.sleeve.length) * FT;
  const backEnd     = (0.2719 + pA.cuff.length + 2.9319 + pA.sleeve.length + 4.0 + pA.back.length) * FT;

  const collarEnd   = (0.2719 + pA.collar.length) * FT;
  const frontEnd    = (0.2719 + pA.collar.length + 4.0 + pA.front.length) * FT;

  const assemblyStart = (0.2719 + pA.cuff.length + 2.9319 + pA.sleeve.length + 4.0 + pA.back.length + 4.11) * FT;

  const sections = {
    cuff:       { start: cuffEnd   - p.cuff.length   * FT, end: cuffEnd   },
    sleeve:     { start: sleeveEnd - p.sleeve.length  * FT, end: sleeveEnd },
    back:       { start: backEnd   - p.back.length    * FT, end: backEnd   },
    collar:     { start: collarEnd - p.collar.length  * FT, end: collarEnd },
    front:      { start: frontEnd  - p.front.length   * FT, end: frontEnd  },
    assemblyAB: { start: assemblyStart, end: assemblyStart + p['assembly 1'].length * FT },
    assemblyCD: { start: assemblyStart, end: assemblyStart + p['assembly 2'].length * FT },
  };

  const specs = {
    ...sections,
    widthAB: p.cuff.width   * FT,
    widthCD: p.collar.width * FT,
    preset: presetKey,
    sections,
  };

  const zonesAB = [
    { start: sections.cuff.start,       end: sections.cuff.end       },
    { start: sections.sleeve.start,     end: sections.sleeve.end     },
    { start: sections.back.start,       end: sections.back.end       },
    { start: sections.assemblyAB.start, end: sections.assemblyAB.end },
  ];

  const zonesCD = [
    { start: sections.collar.start,     end: sections.collar.end     },
    { start: sections.front.start,      end: sections.front.end      },
    { start: sections.assemblyCD.start, end: sections.assemblyCD.end },
  ];

  const partBounds = {
    cuff:   sections.cuff,
    sleeve: sections.sleeve,
    back:   sections.back,
    collar: sections.collar,
    front:  sections.front,
  };

  return { zonesAB, zonesCD, partBounds, specs, sections };
}

export const PART_BOUNDS = getLayoutSpecs().partBounds;

export const getMachineZoneDims = (type = '') => {
  const t = type.toLowerCase();
  let l = 4 * FT, w = 2.5 * FT, h = 4.0 * FT;

  if (t.includes('foa') || t.includes('feed off arm')) {
    l = 4.5 * FT; w = 2.5 * FT; h = 4.0 * FT;
  } else if (t.includes('turning')) {
    l = 4.0 * FT; w = 2.5 * FT; h = 3.0 * FT;
  } else if (t.includes('pointing')) {
    l = 3.5 * FT; w = 2.5 * FT; h = 4.0 * FT;
  } else if (t.includes('contour')) {
    l = 4.5 * FT; w = 3 * FT; h = 4.0 * FT;
  } else if (t.includes('notch')) {
    l = 4 * FT; w = 2.5 * FT; h = 3.5 * FT;
  } else if (t.includes('pressing') || (t.includes('press') && !t.includes('iron'))) {
    l = 4.72 * FT; w = 4 * FT; h = 5 * FT;
  } else if (t.includes('iron') || t.includes('press')) {
    l = 4.0 * FT; w = 3.0 * FT; h = 3.0 * FT;
  } else if (t.includes('helper') || t.includes('work table') || t.includes('table') || t.includes('trolley')) {
    l = 4.5 * FT; w = 2.5 * FT; h = 2.2 * FT;
  } else if (t.includes('inspection')) {
    l = 5.0 * FT; w = 4.0 * FT; h = 7 * FT;
  } else if (t.includes('fusing') || t.includes('rotary')) {
    l = 4.5 * FT; w = 3.0 * FT; h = 4.0 * FT;
  } else if (t.includes('blocking')) {
    l = 4 * FT; w = 2.5 * FT; h = 4.0 * FT;
  } else if (t.includes('supermarket')) {
    l = 6.5 * FT; w = 2.5 * FT; h = 7.0 * FT;
  } else if (t.includes('wrapping') || t.includes('wrap')) {
    l = 4 * FT; w = 2.5 * FT; h = 3.0 * FT;
  } else if (t.includes('button')) {
    l = 3.5 * FT; w = 2.5 * FT; h = 4.0 * FT;
  }

  return { length: l, width: w, height: h };
};

export const getNextValidX = (currentX, machineLength, zones) => {
  for (const zone of zones) {
    const potentialStart = Math.max(currentX, zone.start);
    if (potentialStart + machineLength <= zone.end) return potentialStart;
  }
  return currentX;
};

export const findOverflowSection = (currentSection) => {
  const s = currentSection.toLowerCase();
  if (s.includes('cuff'))   return 'Sleeve';
  if (s.includes('sleeve')) return 'Back';
  if (s.includes('back'))   return 'Assembly';
  if (s.includes('collar')) return 'Front';
  if (s.includes('front'))  return 'Assembly';
  return currentSection;
};

const MACHINE_NORMALISATION = {
  'bholem/c': 'Button Hole M/C',
  'buttonholem/c': 'Button Hole M/C',
  'buttonholemc': 'Button Hole M/C',
  'b/holem/c': 'Button Hole M/C',
  'buttonholem': 'Button Hole M/C',
  'bhole': 'Button Hole M/C',
  'bh': 'Button Hole M/C',
  'buttonm/c': 'Button M/C',
  'buttonmc': 'Button M/C',
  'buttonsew': 'Button M/C',
  'buttonstitch': 'Button M/C',
  'buttonm': 'Button M/C',
  'bs': 'Button M/C',
  'snec': 'SNEC',
  'single': 'SNLS',
  'snls': 'SNLS',
  'lockstitch': 'SNLS',
  '1needle': 'SNLS',
  '3to/l': 'SNEC',
  '3tol': 'SNEC',
  '4to/l': 'SNEC',
  '5to/l': 'SNEC',
  '3toverlock': 'SNEC',
  'overlock': 'SNEC',
  'ol': 'SNEC',
  'snec': 'SNEC',
  'irontable': 'Iron Table',
  'ironingtable': 'Iron Table',
  'pressingtable': 'Iron Table',
  'ironmc': 'Iron Table',
  'press': 'Iron Table',
  'helpertable': 'Helper Table',
  'manualtable': 'Helper Table',
  'worktable': 'Helper Table',
  'table': 'Helper Table',
  'rotaryfusingm/c': 'Rotary Fusing M/C',
  'rotaryfusing': 'Rotary Fusing M/C',
  'fusingmc': 'Rotary Fusing M/C',
  'fusing': 'Rotary Fusing M/C',
  'spreader': 'Spreader',
  'trolley': 'Helper Table',
  'inspecton': 'Inspection Table',
  'inspection': 'Inspection Table',
  'qc': 'Inspection Table',
  'checking': 'Inspection Table'
};

const normalizeString = (str) =>
  String(str ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

export function canonicalMachineType(raw) {
  if (!raw) return '';
  const key = normalizeString(raw);
  return MACHINE_NORMALISATION[key] ?? raw.trim();
}
