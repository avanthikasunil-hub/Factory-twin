import * as XLSX from 'xlsx';
import type { LineData } from '@/types';

export const generateMachineRequirementExcel = (line: LineData) => {
  // Calculate machine quantities
  const machines = line.machineLayout || [];
  
  // Filter for production machines only
  let prodMachines = machines.filter(
    (m) =>
      m.operation &&
      !m.operation.machine_type.toLowerCase().includes('pathway') &&
      !m.operation.machine_type.toLowerCase().includes('supermarket') &&
      !m.id.toLowerCase().includes('board') &&
      !m.operation.machine_type.toLowerCase().includes('inspection') &&
      !m.operation.machine_type.toLowerCase().includes('checking') &&
      !m.isInspection
  );

  // Remove the last 2 helper tables in assembly
  const assemblyHelperIndices: number[] = [];
  prodMachines.forEach((m, idx) => {
    const sec = (m.section || '').toLowerCase();
    const type = (m.operation?.machine_type || '').toLowerCase();
    if (sec.includes('assembly') && (type.includes('helper') || type.includes('table') || type.includes('manual'))) {
      assemblyHelperIndices.push(idx);
    }
  });

  const indicesToRemove = new Set(assemblyHelperIndices.slice(-2));
  prodMachines = prodMachines.filter((_, idx) => !indicesToRemove.has(idx));

  // Aggregate machine counts
  const machineCounts: Record<string, number> = {};
  prodMachines.forEach((m) => {
    let mType = m.operation?.machine_type || 'Unknown';
    mType = mType.toUpperCase();
    machineCounts[mType] = (machineCounts[mType] || 0) + 1;
  });

  const tableData = Object.keys(machineCounts).map((type) => ({
    type,
    qty: machineCounts[type],
  }));

  // Sort descending by quantity
  tableData.sort((a, b) => b.qty - a.qty);

  // Prepare data for Excel
  const cleanLineNo = line.lineNo.replace(/LINE\s*/i, '').trim();
  const timestamp = line.createdAt ? new Date(line.createdAt).toLocaleDateString() : new Date().toLocaleDateString();

  const excelData = [
    [`MACHINE REQUIREMENTS: LINE ${cleanLineNo}`], // 0
    [], // 1
    ['LINE DETAILS'], // 2
    ['Line No:', line.lineNo, '', 'Style:', line.styleNo || 'N/A', '', 'Buyer:', line.buyer || 'N/A'], // 3
    ['Target:', `${line.targetOutput} / Shift`, '', 'Efficiency:', `${line.efficiency}%`, '', 'Hours:', `${line.workingHours} Hrs`], // 4
    ['Date:', timestamp, '', '', '', '', '', ''], // 5
    [], // 6
    ['MACHINE BREAKDOWN'], // 7
    ['S.NO', 'MACHINE TYPE', 'QUANTITY'] // 8
  ];

  let totalQty = 0;
  tableData.forEach((item, idx) => {
    excelData.push([(idx + 1).toString(), item.type, item.qty.toString()]);
    totalQty += item.qty;
  });

  excelData.push([]);
  excelData.push(['', 'TOTAL MACHINES REQUIRED', totalQty.toString()]);

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(excelData);

  // Merge cells for aesthetics
  if (!ws['!merges']) ws['!merges'] = [];
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }); // Title
  ws['!merges'].push({ s: { r: 2, c: 0 }, e: { r: 2, c: 7 } }); // LINE DETAILS
  ws['!merges'].push({ s: { r: 7, c: 0 }, e: { r: 7, c: 7 } }); // MACHINE BREAKDOWN
  
  // Also merge the Date value cell if needed (optional)
  ws['!merges'].push({ s: { r: 5, c: 1 }, e: { r: 5, c: 2 } });

  // Set column widths
  ws['!cols'] = [
    { wch: 10 }, // S.No / Labels
    { wch: 40 }, // Machine type / Values
    { wch: 15 }, // Qty / Spacing
    { wch: 10 }, // Labels
    { wch: 25 }, // Values
    { wch: 5 },  // Spacing
    { wch: 10 }, // Labels
    { wch: 20 }, // Values
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Machine Requirements');

  const conNo = (line as any).coneNo || (line as any).conNo || (line as any).con_no || 'UNKNOWN_CON';
  const fileName = `${conNo} M-C REQ.xlsx`.toUpperCase();
  
  XLSX.writeFile(wb, fileName);
};
