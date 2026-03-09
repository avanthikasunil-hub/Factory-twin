import * as XLSX from 'xlsx';
import type { Operation, ColumnAliases } from '@/types';

// ---------------------------------------------------------------------------
// Column aliases
// ---------------------------------------------------------------------------
const COLUMN_ALIASES = {
  op_no: ['op no', 'op_no', 'op. no.', 'operation number', 'op id', 'id', 'sl', 'sl.', 's.l', 'no', 'seq', 'opseq', 'op seq'],
  op_name: [
    'operation', 'op name', 'op_name', 'operation name', 'op description', 'description',
    'op_desc', 'operation_name', 'particulars', 'process', 'process name', 'opname', 'op name'
  ],
  machine_type: [
    'machine', 'mc type', 'm/c type', 'machine type', 'mc_type', 'm/c', 'mc', 'machine_type',
    'equipment', 'machinery', 'm/c name', 'mc name', 'machine name'
  ],
  smv: [
    'smv', 'sam', 's m v', 's a m', 'standard_minute', 'std min', 'standard minute',
    'standard time', 'cycle time', 'smv (min)', 'sam (min)', 'bpt', 'basic pitch time',
    'allocated time', 'target time', 'estimated time', 'val', 'standard val',
    'smv total', 'total smv', 'work content', 'mins', 'min', 'pitch time', 'standard minutes',
    'standard value', 'std value', 'std.min', 'smv/pc', 'smv / pc', 'machine smv',
  ],
  section: ['section', 'sect', 'department', 'dept', 'area', 'zone', 'component', 'garment part'],
  tool_folder: ['tool/folder', 'tool', 'folder', 'attachment', 'guide', 'folder/tool'],
  machinist_smv: [
    'machinist smv', 'machinist', 'operator smv', 'operator time',
    'machinist time', 'machinist_smv',
  ],
  non_machinist_smv: [
    'non-machinist', 'non machinist', 'non-machinist smv', 'helper smv',
    'helper time', 'manual smv', 'non-machinist time', 'non_machinist',
  ],
};

// ---------------------------------------------------------------------------
// Machine-type normalisation — collapses casing/punctuation variants
// ---------------------------------------------------------------------------
const MACHINE_NORMALISATION: Record<string, string> = {
  'bholem/c': 'Button Hole M/C',
  'buttonholem/c': 'Button Hole M/C',
  'buttonholemc': 'Button Hole M/C',
  'b/holem/c': 'Button Hole M/C',
  'buttonholem': 'Button Hole M/C',
  'buttonm/c': 'Button M/C',
  'buttonmc': 'Button M/C',
  'buttonsew': 'Button M/C',
  'buttonm': 'Button M/C',
  'snec': 'SNEC',
  '3to/l': 'SNEC',
  '3tol': 'SNEC',
  'overlock': 'SNEC',
  'irontable': 'Iron Table',
  'ironingtable': 'Iron Table',
  'pressingtable': 'Iron Table',
  'helpertable': 'Helper Table',
  'manualtable': 'Helper Table',
  'rotaryfusingm/c': 'Rotary Fusing M/C',
  'rotaryfusing': 'Rotary Fusing M/C',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const normalizeString = (str: string): string =>
  String(str ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

const normaliseMachineType = (raw: string): string => {
  if (!raw) return '';
  const key = normalizeString(raw);
  return MACHINE_NORMALISATION[key] ?? raw.trim();
};

/**
 * Extract header labels directly from the raw worksheet object for a given
 * 0-based row index.  This bypasses sheet_to_json's merged-cell collapse
 * problem where B10:I10 all become a single column.
 */
const extractHeadersFromWorksheet = (
  sheet: XLSX.WorkSheet,
  wsRow: number,
): string[] => {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  const headers: string[] = [];
  for (let c = 0; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: wsRow, c });
    const cell = sheet[addr];
    headers.push(cell?.v != null ? String(cell.v) : '');
  }
  return headers;
};

const findColumnIndex = (headers: string[], field: keyof ColumnAliases): number => {
  const aliases = COLUMN_ALIASES[field].map(normalizeString);

  // Pass 0 – exact raw match for critical short tokens
  if (field === 'smv') {
    for (let i = 0; i < headers.length; i++) {
      const raw = String(headers[i] ?? '').trim().toLowerCase();
      if (raw === 'smv' || raw === 'sam') return i;
    }
  }
  // Pass 1 – normalised exact match
  for (let i = 0; i < headers.length; i++) {
    const h = normalizeString(headers[i]);
    if (h && aliases.includes(h)) return i;
  }
  // Pass 2 – substring (min alias len 3)
  for (let i = 0; i < headers.length; i++) {
    const h = normalizeString(headers[i]);
    if (!h) continue;
    if (aliases.some(a => a.length >= 3 && (h.includes(a) || a.includes(h)))) return i;
  }
  // Pass 3 – SMV keyword fallback
  if (field === 'smv') {
    const kw = ['smv', 'sam', 'time', 'min'];
    for (let i = 0; i < headers.length; i++) {
      if (kw.some(k => headers[i].toLowerCase().includes(k))) return i;
    }
  }
  return -1;
};

const SECTION_MAP: [string, string][] = [
  ['collar', 'Collar'], ['cuff', 'Cuff'], ['sleeve', 'Sleeve'],
  ['front', 'Front'], ['back', 'Back'], ['assembly', 'Assembly'],
];

const isSectionHeader = (
  row: (string | number)[],
  opNoIndex?: number,
  smvIndex?: number,
): string | null => {
  if (typeof opNoIndex === 'number' && typeof smvIndex === 'number') {
    const opNo = row[opNoIndex];
    const smv = row[smvIndex];
    const hasOpNo = opNo != null && String(opNo).trim() !== '' && String(opNo).trim() !== '0';
    const hasSmv = smv != null && !isNaN(Number(smv)) && Number(smv) > 0;
    if (hasOpNo || hasSmv) return null;
  }
  const rowStr = row.join(' ').toLowerCase();
  for (const [kw, label] of SECTION_MAP) {
    if (rowStr.includes(kw)) return label;
  }
  const firstCell = String(row[0] ?? '').trim();
  const secondCell = String(row[1] ?? '').trim();
  const fl = firstCell.toLowerCase();
  if (fl.includes('total') || fl.includes('sewing') || fl.includes('sub')) return null;
  if (firstCell && !secondCell && isNaN(Number(firstCell))) {
    const emptyCount = row.filter(c => !c || String(c).trim() === '').length;
    if (emptyCount >= row.length * 0.5 && firstCell.length < 30) return firstCell;
  }
  return null;
};

const TOTAL_KW = [
  'total', 'subtotal', 'summary', 'grand total', 'sub-total', 'target', 'efficiency',
  '100%', 'ach', 'prepared by', 'approved by', 'checked by', 'date', 'rev', 'production'
];

const isOperationRow = (
  row: (string | number)[],
  opNoIndex: number,
  opNameIndex: number,
  machineIndex: number,
  smvIndex: number,
): boolean => {
  const opNo = opNoIndex >= 0 ? row[opNoIndex] : undefined;
  const opName = opNameIndex >= 0 ? row[opNameIndex] : undefined;
  const machine = machineIndex >= 0 ? row[machineIndex] : undefined;
  const smv = smvIndex >= 0 ? row[smvIndex] : undefined;

  const cn = String(opName ?? '').trim().toLowerCase();
  const hasOpName = opName != null && cn !== '' && cn !== '0' && cn !== 'n/a' && cn.length > 1;

  const mStr = String(machine ?? '').trim().toLowerCase();
  const hasMachine = machine != null && mStr !== '' && mStr !== '0' && mStr !== 'n/a';

  const smvNum = smv != null ? parseFloat(String(smv).replace(/[^\d.]/g, '')) : NaN;
  const hasSmv = !isNaN(smvNum) && smvNum > 0;

  // REJECTION LOGIC:
  // 1. Must have at least an SMV to be an operation.
  if (!hasSmv) return false;

  // 2. Must have EITHER a Machine Type OR an Operation Name.
  // If it only has an SMV and an Op No (like a subtotal row "69 | | | 5.3"), it's garbage.
  if (!hasOpName && !hasMachine) return false;

  // 3. Reject summary/total rows based on keywords
  const firstFive = row.slice(0, 5).map(c => String(c ?? '').toLowerCase());
  if (firstFive.some(cell => TOTAL_KW.some(k => cell.includes(k)))) return false;

  // 4. If name says "Total" or similar and it's not a production line
  if (cn.includes('total') || cn.includes('sum of')) return false;

  return true;
};

const parseValue = (val: unknown): number => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    if (val.startsWith('=')) return 0; // skip formula strings
    const n = parseFloat(val.replace(/[^\d.]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  return 0;
};

// ---------------------------------------------------------------------------
// Sheet-level parser
// ---------------------------------------------------------------------------
const parseSpecificSheet = (sheet: XLSX.WorkSheet) => {
  const rangeRef = sheet['!ref'];
  if (!rangeRef) return null;
  const sheetRange = XLSX.utils.decode_range(rangeRef);

  // Build ordered list of worksheet row indices that have any content
  const wsRowIndices: number[] = [];
  for (let r = sheetRange.s.r; r <= sheetRange.e.r; r++) {
    let hasContent = false;
    for (let c = sheetRange.s.c; c <= sheetRange.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (sheet[addr]?.v != null && String(sheet[addr].v).trim() !== '') {
        hasContent = true; break;
      }
    }
    if (hasContent) wsRowIndices.push(r);
  }

  if (wsRowIndices.length === 0) {
    console.log('[OB Parser] Empty sheet detected');
    return null;
  }

  // --- Locate header row via DIRECT cell reads (not sheet_to_json) ---
  let headerWsRow = -1;
  let opNoIndex = -1;
  let opNameIndex = -1;
  let machineIndex = -1;
  let smvIndex = -1;
  let sectionIndex = -1;
  let toolIndex = -1;
  let machinistSmvIndex = -1;
  let nonMachinistSmvIndex = -1;
  let bestScore = 0;

  for (let i = 0; i < Math.min(wsRowIndices.length, 500); i++) {
    const wsRow = wsRowIndices[i];
    const headers = extractHeadersFromWorksheet(sheet, wsRow);
    const rowStr = headers.join(' ').toLowerCase();
    if (rowStr.includes('total') || rowStr.includes('sum of')) continue;

    const tOpNo = findColumnIndex(headers, 'op_no');
    const tMachine = findColumnIndex(headers, 'machine_type');
    const tSmv = findColumnIndex(headers, 'smv');
    const tOpName = findColumnIndex(headers, 'op_name');
    const tSection = findColumnIndex(headers, 'section');

    let score = 0;
    if (tOpNo !== -1) score += 3;
    if (tMachine !== -1) score += 3;
    if (tSmv !== -1) score += 4;
    if (tOpName !== -1) score += 2;
    if (tSection !== -1) score += 1;

    if (score > bestScore) {
      bestScore = score;
      headerWsRow = wsRow;
      opNoIndex = tOpNo;
      opNameIndex = tOpName;
      machineIndex = tMachine;
      smvIndex = tSmv;
      sectionIndex = tSection;
      toolIndex = findColumnIndex(headers, 'tool_folder');
      machinistSmvIndex = findColumnIndex(headers, 'machinist_smv');
      nonMachinistSmvIndex = findColumnIndex(headers, 'non_machinist_smv');
    }
  }

  if (headerWsRow === -1) {
    console.log('[OB Parser] No header row found in first 500 rows');
    return null;
  }
  if (smvIndex === -1) {
    console.log('[OB Parser] Header found but MISSING SMV column');
    return null;
  }
  if (opNoIndex === -1 && opNameIndex === -1) {
    console.log('[OB Parser] Header found but MISSING Operation Name/No columns');
    return null;
  }

  // Helper to read a single cell value directly
  const readCell = (wsRow: number, colIndex: number): string | number | null => {
    if (colIndex < 0) return null;
    const addr = XLSX.utils.encode_cell({ r: wsRow, c: colIndex });
    const cell = sheet[addr];
    if (!cell || cell.v == null) return null;
    if (cell.t === 'n') return cell.v as number;
    return String(cell.v);
  };

  // --- Extract operations ---
  const operations: Operation[] = [];
  let currentSection = 'General';
  let extractedTotalSMV = 0;
  let calculatedTotalSMV = 0;
  const exactMachineTypes = new Set<string>();

  for (let wsRow = headerWsRow + 1; wsRow <= sheetRange.e.r; wsRow++) {
    // Build dense row array for helper functions — always start from index 0
    // even if the sheet range starts later, to keep column indexes stable.
    const row: (string | number)[] = [];
    for (let c = 0; c <= Math.max(sheetRange.e.c, opNameIndex, machineIndex, smvIndex); c++) {
      const v = readCell(wsRow, c);
      row[c] = v != null ? v : '';
    }
    if (row.every(c => c === '' || c == null)) continue;

    const rowStr = row.map(c => String(c).toLowerCase()).join(' ');

    // Capture total SMV
    if (rowStr.includes('grand total') || (rowStr.includes('total') && !rowStr.includes('sub'))) {
      const tv = parseValue(readCell(wsRow, smvIndex));
      if (tv > extractedTotalSMV) extractedTotalSMV = tv;
    }

    const sectionLabel = isSectionHeader(row, opNoIndex, smvIndex);
    if (sectionLabel) { currentSection = sectionLabel; continue; }
    if (!isOperationRow(row, opNoIndex, opNameIndex, machineIndex, smvIndex)) continue;

    const opNoRaw = opNoIndex >= 0 ? String(readCell(wsRow, opNoIndex) ?? '').trim() : '';
    const opName = opNameIndex >= 0 ? String(readCell(wsRow, opNameIndex) ?? '').trim() : '';
    const opNo = opNoRaw || (opName ? opName.substring(0, 10) : `OP-${operations.length + 1}`);

    if (opName.toLowerCase().includes('allowance')) continue;

    const smv = parseValue(readCell(wsRow, smvIndex));
    const machinist_smv = parseValue(machinistSmvIndex >= 0 ? readCell(wsRow, machinistSmvIndex) : null);
    const non_machinist_smv = parseValue(nonMachinistSmvIndex >= 0 ? readCell(wsRow, nonMachinistSmvIndex) : null);
    const rowSmv = smv || (machinist_smv + non_machinist_smv);

    if (rowSmv <= 0 && !opNoRaw && !opName) continue;

    calculatedTotalSMV += rowSmv;

    let machineType = normaliseMachineType(
      machineIndex >= 0 ? String(readCell(wsRow, machineIndex) ?? '').trim() : ''
    );

    const lowerName = opName.toLowerCase();
    const lowerType = machineType.toLowerCase();

    if (
      lowerType.includes('manual') || lowerType.includes('hand') || lowerType.includes('helper') ||
      lowerName.includes('manual') || lowerName.includes('helper') || lowerName.includes('hand')
    ) {
      if (!machineType || ['manual', 'helper', 'hand'].includes(lowerType)) {
        machineType = 'Helper Table';
      }
    }

    if (machineType) {
      exactMachineTypes.add(machineType);
    } else {
      if (lowerName.includes('check') || lowerName.includes('inspect')) machineType = 'Inspection';
      else if (lowerName.includes('iron') || lowerName.includes('press')) machineType = 'Iron Table';
      else if (lowerName.includes('table') || lowerName.includes('manual')) machineType = 'Helper Table';
      else machineType = opName || 'Operation';
    }

    const sectionValue = sectionIndex >= 0
      ? (String(readCell(wsRow, sectionIndex) ?? '').trim() || currentSection)
      : currentSection;

    operations.push({
      op_no: opNo,
      op_name: opName,
      machine_type: machineType,
      smv: rowSmv,
      section: sectionValue,
      tool_folder: toolIndex >= 0 ? String(readCell(wsRow, toolIndex) ?? '').trim() : '',
      machinist_smv,
      non_machinist_smv,
    });
  }

  if (operations.length === 0) return null;

  return {
    operations,
    totalSMV: extractedTotalSMV > 0 ? extractedTotalSMV : calculatedTotalSMV,
    machineTypesCount: exactMachineTypes.size,
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse an OB Excel file and return a clean set of operations.
 *
 * Required upload flow in your React component:
 *   setOperations([]);
 *   setMachineLayout([]);
 *   const parsed = await parseOBExcel(file);
 *   setOperations(parsed.operations);
 *   setMachineLayout(generateLayout(parsed.operations));
 */
const SUBOPTIMAL_SHEET_NAMES = ['base', 'template', 'master', 'demo', 'example', 'instruction'];

export const parseOBExcel = async (
  file: File,
): Promise<{ operations: Operation[]; totalSMV: number; machineTypesCount: number; sourceSheet: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, {
          type: 'array',
          cellFormula: false,
          cellNF: false,
          cellStyles: false,
        });

        let bestSheet = {
          name: '',
          data: null as { operations: Operation[]; totalSMV: number; machineTypesCount: number } | null,
          score: -1
        };

        for (const sheetName of workbook.SheetNames) {
          const result = parseSpecificSheet(workbook.Sheets[sheetName]);
          if (!result) continue;

          // Scoring logic:
          // +100 base score for having >= 5 operations (likely a production sheet)
          // -50 penalty for suboptimal names (Base, Template, etc.)
          // + result.operations.length as tie-breaker
          let score = result.operations.length;
          if (result.operations.length >= 5) score += 100;

          if (SUBOPTIMAL_SHEET_NAMES.some(sub => sheetName.toLowerCase().includes(sub))) {
            score -= 50;
          }

          console.log(`[OB Parser] Sheet "${sheetName}" candidate score: ${score} (${result.operations.length} ops)`);

          if (score > bestSheet.score) {
            bestSheet = { name: sheetName, data: result, score };
          }
        }

        if (bestSheet.data) {
          console.log(`[OB Parser] Selected Sheet: "${bestSheet.name}"`);
          console.log(`[OB Parser] Operations: ${bestSheet.data.operations.length}`);
          console.log(`[OB Parser] Machine types: ${bestSheet.data.machineTypesCount}`);
          console.log(`[OB Parser] Total SMV: ${bestSheet.data.totalSMV.toFixed(2)}`);

          resolve({
            ...bestSheet.data,
            sourceSheet: bestSheet.name
          });
        } else {
          reject(new Error('No valid operations found in any sheet of the Excel file'));
        }
      } catch (err) {
        reject(new Error(`Failed to parse Excel file: ${err instanceof Error ? err.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
};

// ---------------------------------------------------------------------------
// Machine category → 3-D model selector
// ---------------------------------------------------------------------------
export const getMachineCategory = (machineType: string): string => {
  const n = normalizeString(machineType);

  if (n.includes('snls') || n.includes('singleneedle') || n.includes('lockstitch') || n.includes('dnls')) return 'snls';
  if (n.includes('snec') || n.includes('overlock') || n.includes('edge') || n === '3tol') return 'snec';
  if (n.includes('iron') || n.includes('press') || n.includes('fusing') || n.includes('rotary')) return 'iron';
  if (n.includes('buttonhole') || n.includes('bhole') || n.includes('b/hole')) return 'button';
  if (n.includes('button') && !n.includes('hole')) return 'button';
  if (n.includes('bartack')) return 'bartack';
  if (n.includes('helper') || n.includes('table') || n.includes('manual')) return 'helper';
  if (n.includes('contour') || n.includes('turning') || n.includes('pointing') ||
    n.includes('notch') || n.includes('wrapping') || n.includes('special')) return 'special';

  return 'default';
};
