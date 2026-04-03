import { jsPDF } from 'jspdf';
import type { LineData, MachinePosition, SectionLayout } from '@/types';

/**
 * Calculates machine dimensions based on type (consistent with 3D engine)
 */
const getMachineDims = (type: string = '') => {
  const t = type.toLowerCase();
  const FT = 0.3048;
  let l = 4 * FT, w = 2.5 * FT;

  if (t.includes('foa') || t.includes('feed off arm')) { l = 4.5 * FT; }
  else if (t.includes('turning')) { l = 4.0 * FT; w = 2.5 * FT; }
  else if (t.includes('pointing')) { l = 3.5 * FT; w = 2.5 * FT; }
  else if (t.includes('contour')) { l = 4.5 * FT; w = 3 * FT; }
  else if (t.includes('pressing') || (t.includes('press') && !t.includes('iron'))) { l = 4.72 * FT; w = 4.0 * FT; }
  else if (t.includes('iron') || t.includes('press')) { l = 4.0 * FT; w = 3.0 * FT; }
  else if (t.includes('helper') || t.includes('work table') || t.includes('table') || t.includes('trolley')) { l = 4.5 * FT; w = 2.5 * FT; }
  else if (t.includes('outinspection') || t.includes('outsideinspection') || t.includes('outside inspection')) { l = 5.0 * FT; w = 4.0 * FT; }
  else if (t.includes('inspection')) { l = 5.0 * FT; w = 4.0 * FT; }
  else if (t.includes('checking')) { l = 5.0 * FT; w = 4.0 * FT; }
  else if (t.includes('fusing') || t.includes('rotary')) { l = 4.5 * FT; w = 3.0 * FT; }
  else if (t.includes('blocking')) { l = 4.0 * FT; w = 2.5 * FT; }
  else if (t.includes('supermarket')) { l = 6.0 * FT; w = 2.5 * FT; }

  return { length: l, width: w };
};

export const generateLinePDF = (line: LineData) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a2' 
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 5; // Balanced margins
  const headerHeight = 58; // Substantial header for high-impact labels
  
  const machines = line.machineLayout;
  const sectionLayouts = line.sectionLayout || [];
  if (machines.length === 0) return;

  const isSpecialMachine = (m: MachinePosition) => {
    const type = (m.operation.machine_type || '').toLowerCase();
    const op = (m.operation.op_name || '').toLowerCase();
    const isHelper = type.includes('helper') || type.includes('table') || type.includes('work table') || op.includes('helper') || op.includes('table');
    const isInsp = type.includes('inspection') || op.includes('inspection');
    const isSuper = type.includes('supermarket') || op.includes('supermarket');
    return isHelper || isInsp || isSuper;
  };

  // Group machines for counting: Global Assembly groups
  const assemblyABMachines = machines.filter(m => (m.section || '').toLowerCase().includes('assembly') && (m.lane === 'A' || m.lane === 'B') && !isSpecialMachine(m));
  const assemblyCDMachines = machines.filter(m => (m.section || '').toLowerCase().includes('assembly') && (m.lane === 'C' || m.lane === 'D') && !isSpecialMachine(m));

  const countForSection = (sName: string): number => {
    const lower = sName.toLowerCase();
    if (lower.includes('assembly')) {
        if (lower.includes('ab') || lower.includes('1') || lower.includes('2')) return assemblyABMachines.length;
        if (lower.includes('cd') || lower.includes('3') || lower.includes('4')) return assemblyCDMachines.length;
    }
    return (machines.filter(m => m.section === sName && !isSpecialMachine(m)).length);
  };

  // Calculate World Bounds
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  sectionLayouts.forEach(s => {
    minX = Math.min(minX, s.position.x);
    maxX = Math.max(maxX, s.position.x + s.length);
    minZ = Math.min(minZ, s.position.z - s.width / 2);
    maxZ = Math.max(maxZ, s.position.z + s.width / 2);
  });

  machines.forEach(m => {
    const dims = getMachineDims(m.operation.machine_type);
    const span = Math.max(dims.length, dims.width);
    minX = Math.min(minX, m.position.x - span);
    maxX = Math.max(maxX, m.position.x + span);
    minZ = Math.min(minZ, m.position.z - span);
    maxZ = Math.max(maxZ, m.position.z + span);
  });

  const worldWidth = maxX - minX;
  const worldHeight = maxZ - minZ;
  const worldPadding = 0.8; // Maintain high zoom
  const totalWorldWidth = worldWidth + worldPadding * 2;
  const totalWorldHeight = worldHeight + worldPadding * 2;

  const drawWidth = pageWidth - margin * 2;
  const drawHeight = pageHeight - margin * 2 - headerHeight;
  const scale = Math.min(drawWidth / totalWorldWidth, drawHeight / totalWorldHeight);
  
  const offsetX = margin + (drawWidth - totalWorldWidth * scale) / 2;
  const offsetY = margin + headerHeight + (drawHeight - totalWorldHeight * scale) / 2;

  const worldToPage = (x: number, z: number) => ({
    px: offsetX + (x - minX + worldPadding) * scale,
    py: offsetY + (z - minZ + worldPadding) * scale
  });

  // AEC Header Block
  doc.setDrawColor(0);
  doc.setLineWidth(0.8);
  doc.rect(margin, margin, pageWidth - margin * 2, headerHeight);
  doc.line(margin + 160, margin, margin + 160, margin + headerHeight);
  doc.line(margin + 360, margin, margin + 360, margin + headerHeight);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(48); // High-impact branding for Line No
  const cleanLineNo = line.lineNo.replace(/LINE\s*/i, '').trim();
  doc.text(`LINE : ${cleanLineNo}`, margin + 10, margin + 25);
  doc.setFontSize(16);
  doc.text("ENGINEERING FLOOR LAYOUT SPECIFICATION", margin + 10, margin + 40);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  const timestamp = line.createdAt ? new Date(line.createdAt).toLocaleString() : new Date().toLocaleString();
  doc.text(`CONTROL DATE: ${timestamp.toUpperCase()}`, margin + 10, margin + 52);

  doc.setFontSize(14);
  doc.text(`BUYER: ${line.buyer || 'N/A'}`, margin + 170, margin + 15);
  doc.text(`STYLE: ${line.styleNo || 'N/A'}`, margin + 170, margin + 25);
  doc.text(`CONE: ${line.coneNo || 'N/A'}`, margin + 170, margin + 35);
  doc.text(`EFFICIENCY: ${line.efficiency}%`, margin + 170, margin + 45);
  doc.text(`TOTAL MACHINES: ${machines.length}`, margin + 170, margin + 55);

  doc.setFontSize(14);
  doc.text(`TARGET: ${line.targetOutput} / SHIFT`, margin + 370, margin + 12);
  doc.text(`HOURS: ${line.workingHours} HRS`, margin + 370, margin + 22);
  doc.setFont('helvetica', 'bold');
  doc.text("PREPARATORY PROCESSES:", margin + 370, margin + 35);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  (line.preparatoryOps || []).slice(0, 4).forEach((op, i) => {
    const opName = op.op_name || op.operation || '';
    const cleanOp = opName.length > 35 ? opName.substring(0, 32) + '...' : opName;
    doc.text(`${i + 1}. ${cleanOp.toUpperCase()} (${op.smv.toFixed(2)})`, margin + 370, margin + 43 + (i * 5));
  });

  // Calculate common Y for Top and Bottom labels to keep them all on "the same line"
  // AB Lane Center is typically negative Z, CD Lane is positive/zero Z.
  const abLabelY = worldToPage(0, -9).py; // High above everything
  const cdLabelY = worldToPage(0, 2).py;  // Deep below everything

  // 4. Draw Sections
  sectionLayouts.forEach(s => {
    const nameLower = s.name.toLowerCase();
    const isAss2 = nameLower.includes('assembly 2');
    const isAss4 = nameLower.includes('assembly 4');
    if (isAss2 || isAss4) return; // Only draw combined boxes for assembly

    // Adaptive Boundary - Group Assembly 1+2 (AB) and 3+4 (CD)
    const isAB = nameLower.includes('assembly 1') || nameLower.includes('assembly 2');
    const isCD_lane = nameLower.includes('assembly 3') || nameLower.includes('assembly 4');
    
    const secMachines = machines.filter(m => {
        const mSec = (m.section || '').toLowerCase();
        if (isAB) return mSec.includes('assembly 1') || mSec.includes('assembly 2');
        if (isCD_lane) return mSec.includes('assembly 3') || mSec.includes('assembly 4');
        return m.section === s.name;
    });
    let maxMachineX = s.position.x + s.length;
    let minZ_actual = s.position.z - s.width/2;
    let maxZ_actual = s.position.z + s.width/2;

    secMachines.forEach(m => {
        const d = getMachineDims(m.operation.machine_type);
        maxMachineX = Math.max(maxMachineX, m.position.x + d.length/2);
        minZ_actual = Math.min(minZ_actual, m.position.z - d.width/2);
        maxZ_actual = Math.max(maxZ_actual, m.position.z + d.width/2);
    });

    const sw = (maxMachineX - s.position.x) * scale;
    const sh = (maxZ_actual - minZ_actual) * scale;
    const { px, py } = worldToPage(s.position.x, minZ_actual);

    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.rect(px, py, sw, sh);

    // Label Placement
    const isCD = nameLower.includes('collar') || nameLower.includes('front') || nameLower.includes('assembly cd') || nameLower.includes('assembly 3') || nameLower.includes('assembly 4');
    const finalLabelY = isCD ? doc.internal.pageSize.getHeight() - margin - 20 : margin + headerHeight + 5; 
    
    // Improved logic for "Same line" as requested
    // Instead of fixed page numbers, let's use a very deep offset from the box bottom
    const labelX = px + sw / 2;
    const labelY = isCD ? (py + sh + 15) : (py - 8);

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180);
    
    let displayLabel = s.name.toUpperCase();
    if (displayLabel.includes('ASSEMBLY 1')) displayLabel = "ASSEMBLY AB";
    if (displayLabel.includes('ASSEMBLY 3')) displayLabel = "ASSEMBLY CD";

    const count = countForSection(s.name);
    doc.text(`${displayLabel} (${count})`, labelX, labelY, { align: 'center' });
  });

  // 5. Draw Machines
  doc.setTextColor(0);
  const sectionCounters: Record<string, number> = {};

  machines.forEach((m) => {
    const sec = m.section || 'Other';
    let groupKey = sec;
    if (sec.toLowerCase().includes('assembly')) {
        groupKey = (m.lane === 'A' || m.lane === 'B') ? 'ASSEMBLY AB' : 'ASSEMBLY CD';
    }
    if (!sectionCounters[groupKey]) sectionCounters[groupKey] = 1;

    const op = (m.operation.op_name || '').toLowerCase();
    const type = (m.operation.machine_type || '').toLowerCase();
    const isSpec = type.includes('inspection') || type.includes('supermarket') || op.includes('inspection') || op.includes('supermarket');

    const dims = getMachineDims(m.operation.machine_type);
    const center = worldToPage(m.position.x, m.position.z);
    const angle = m.rotation.y;
    const hL = (dims.length / 2) * scale;
    const hW = (dims.width / 2) * scale;
    
    const rot = (lx: number, lz: number) => {
      const rx = lx * Math.cos(angle) + lz * Math.sin(angle);
      const rz = -lx * Math.sin(angle) + lz * Math.cos(angle);
      return { x: center.px + rx, y: center.py + rz };
    };

    const q1 = rot(-hL, -hW), q2 = rot(hL, -hW), q3 = rot(hL, hW), q4 = rot(-hL, hW);
    doc.setDrawColor(40);
    doc.setLineWidth(0.15);
    doc.line(q1.x, q1.y, q2.x, q2.y); doc.line(q2.x, q2.y, q3.x, q3.y);
    doc.line(q3.x, q3.y, q4.x, q4.y); doc.line(q4.x, q4.y, q1.x, q1.y);

    const mcShort = (m.operation.machine_type || '')
      .replace(/Single Needle/i, 'SNLS')
      .replace(/Overlock/i, 'O/L')
      .replace(/Safety Stitch/i, 'SNSS')
      .replace(/Flat Lock/i, 'F/L');

    const pfx = groupKey.includes('ASSEMBLY AB') ? 'C' : groupKey.includes('ASSEMBLY CD') ? 'C' : groupKey.charAt(0).toUpperCase();
    let labelText = isSpec ? mcShort : `${pfx} ${sectionCounters[groupKey]}: ${mcShort}`;
    if (!isSpec && !type.includes('helper')) sectionCounters[groupKey]++;

    // 1. Machine Type / ID Line - Shifted higher for clearance
    doc.setFontSize(3.0); 
    doc.setFont('helvetica', 'bold');
    doc.text(labelText.toUpperCase(), center.px, center.py - 1.8, { align: 'center', maxWidth: hL * 1.9 });
    
    // 2. Operation Name Line - Reduced size slightly to accommodate wrapping without overlap
    if (!isSpec && !type.includes('helper')) {
      doc.setFontSize(3.5);
      doc.setFont('helvetica', 'normal');
      const opName = m.operation.op_name || '';
      const cleanOp = opName.length > 50 ? opName.substring(0, 47) + '...' : opName;
      doc.text(cleanOp, center.px, center.py + 0.6, { align: 'center', maxWidth: hL * 1.95 });
      
      // 3. SMV Line - Shifted much lower to clear potential wrapped operation lines
      doc.setFontSize(2.4);
      doc.setFont('helvetica', 'bold');
      const smvVal = m.operation.smv || 0;
      doc.text(`${smvVal.toFixed(2)} MIN`, center.px, center.py + 3.8, { align: 'center' });
    }
  });

  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.rect(5, 5, pageWidth - 10, pageHeight - 10);
  doc.save(`${line.coneNo || 'N-A'}_${line.lineNo}.pdf`);
};
