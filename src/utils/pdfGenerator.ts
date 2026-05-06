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
  else if (t.includes('blocking')) { l = 2.5 * FT; w = 4.0 * FT; }
  else if (t.includes('supermarket')) { l = 6.0 * FT; w = 2.5 * FT; }

  return { length: l, width: w };
};

export const generateLinePDF = (line: LineData, mode: 'whole' | 'sections' = 'whole') => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a2' 
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 5;
  const headerHeight = 58;
  
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

  const drawHeader = (docInstance: jsPDF, title: string = "ENGINEERING FLOOR LAYOUT SPECIFICATION") => {
    docInstance.setDrawColor(0);
    docInstance.setLineWidth(0.8);
    docInstance.rect(margin, margin, pageWidth - margin * 2, headerHeight);
    docInstance.line(margin + 160, margin, margin + 160, margin + headerHeight);
    docInstance.line(margin + 360, margin, margin + 360, margin + headerHeight);

    docInstance.setFont('helvetica', 'bold');
    docInstance.setFontSize(48);
    const cleanLineNo = line.lineNo.replace(/LINE\s*/i, '').trim();
    docInstance.text(`LINE ${cleanLineNo}`, margin + 10, margin + 25);
    docInstance.setFontSize(16);
    docInstance.text(title, margin + 10, margin + 40);
    docInstance.setFontSize(12);
    docInstance.setFont('helvetica', 'normal');
    const timestamp = line.createdAt ? new Date(line.createdAt).toLocaleString() : new Date().toLocaleString();
    docInstance.text(`CONTROL DATE: ${timestamp.toUpperCase()}`, margin + 10, margin + 52);

    docInstance.setFontSize(14);
    docInstance.text(`BUYER: ${line.buyer || 'N/A'}`, margin + 170, margin + 15);
    docInstance.text(`STYLE: ${line.styleNo || 'N/A'}`, margin + 170, margin + 25);
    docInstance.text(`CONE: ${line.coneNo || 'N/A'}`, margin + 170, margin + 35);
    docInstance.text(`EFFICIENCY: ${line.efficiency}%`, margin + 170, margin + 45);
    docInstance.text(`TOTAL MACHINES: ${machines.length}`, margin + 170, margin + 55);

    docInstance.setFontSize(14);
    docInstance.text(`TARGET: ${line.targetOutput} / SHIFT`, margin + 370, margin + 12);
    docInstance.text(`HOURS: ${line.workingHours} HRS`, margin + 370, margin + 22);
    docInstance.setFont('helvetica', 'bold');
    docInstance.text("PREPARATORY PROCESSES:", margin + 370, margin + 35);
    docInstance.setFontSize(10);
    docInstance.setFont('helvetica', 'normal');
    (line.preparatoryOps || []).slice(0, 4).forEach((op, i) => {
      const opName = op.op_name || op.operation || '';
      const cleanOp = opName.length > 35 ? opName.substring(0, 32) + '...' : opName;
      docInstance.text(`${i + 1}. ${cleanOp.toUpperCase()} (${op.smv.toFixed(2)})`, margin + 370, margin + 43 + (i * 5));
    });
  };

  const drawMachine = (docInstance: jsPDF, m: MachinePosition, mMinX: number, mMinZ: number, mScale: number, mOffsetX: number, mOffsetY: number, mPadding: number, pfx: string, counter: number) => {
    const dims = getMachineDims(m.operation.machine_type);
    
    const worldToPage = (wx: number, wz: number) => ({
        px: mOffsetX + (wx - mMinX + mPadding) * mScale,
        py: mOffsetY + (wz - mMinZ + mPadding) * mScale
    });

    const center = worldToPage(m.position.x, m.position.z);
    const angle = m.rotation.y;
    const hL = (dims.length / 2) * mScale;
    const hW = (dims.width / 2) * mScale;
    
    const rot = (lx: number, lz: number) => {
      const rx = lx * Math.cos(angle) + lz * Math.sin(angle);
      const rz = -lx * Math.sin(angle) + lz * Math.cos(angle);
      return { x: center.px + rx, y: center.py + rz };
    };

    const q1 = rot(-hL, -hW), q2 = rot(hL, -hW), q3 = rot(hL, hW), q4 = rot(-hL, hW);
    docInstance.setDrawColor(40);
    docInstance.setLineWidth(0.15);
    docInstance.line(q1.x, q1.y, q2.x, q2.y); docInstance.line(q2.x, q2.y, q3.x, q3.y);
    docInstance.line(q3.x, q3.y, q4.x, q4.y); docInstance.line(q4.x, q4.y, q1.x, q1.y);

    const mcShort = (m.operation.machine_type || '')
      .replace(/Single Needle/i, 'SNLS')
      .replace(/Overlock/i, 'O/L')
      .replace(/Safety Stitch/i, 'SNSS')
      .replace(/Flat Lock/i, 'F/L');

    const op = (m.operation.op_name || '').toLowerCase();
    const type = (m.operation.machine_type || '').toLowerCase();
    const isSpec = type.includes('inspection') || type.includes('supermarket') || op.includes('inspection') || op.includes('supermarket');

    let labelText = isSpec ? mcShort : `${pfx} ${counter}: ${mcShort}`;

    docInstance.setFontSize(mode === 'sections' ? 7 : 3.0); 
    docInstance.setFont('helvetica', 'bold');
    docInstance.text(labelText.toUpperCase(), center.px, center.py - (mode === 'sections' ? 3.5 : 1.8), { align: 'center', maxWidth: hL * 1.9 });
    
    if (!isSpec && !type.includes('helper')) {
      docInstance.setFontSize(mode === 'sections' ? 7.5 : 3.5);
      docInstance.setFont('helvetica', 'normal');
      const opName = m.operation.op_name || '';
      const cleanOp = opName.length > 50 ? opName.substring(0, 47) + '...' : opName;
      docInstance.text(cleanOp, center.px, center.py + 0.6, { align: 'center', maxWidth: hL * 1.95 });
      
      docInstance.setFontSize(mode === 'sections' ? 6 : 2.4);
      docInstance.setFont('helvetica', 'bold');
      const smvVal = m.operation.smv || 0;
      docInstance.text(`${smvVal.toFixed(2)} MIN`, center.px, center.py + (mode === 'sections' ? 7 : 3.8), { align: 'center' });
    }
  };

  if (mode === 'whole') {
    drawHeader(doc);
    
    // Bounds for whole layout
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
    const worldPadding = 0.4;
    const totalWorldWidth = worldWidth + worldPadding * 2;
    const totalWorldHeight = worldHeight + worldPadding * 2;
    const drawWidth = pageWidth - margin * 2;
    const drawHeight = pageHeight - margin * 2 - headerHeight;
    const scale = Math.min(drawWidth / totalWorldWidth, drawHeight / totalWorldHeight);
    const offsetX = margin + (drawWidth - totalWorldWidth * scale) / 2;
    const offsetY = margin + headerHeight + (drawHeight - totalWorldHeight * scale) / 2;

    const assemblyABMachines = machines.filter(m => (m.section || '').toLowerCase().includes('assembly') && (m.lane === 'A' || m.lane === 'B') && !isSpecialMachine(m));
    const assemblyCDMachines = machines.filter(m => (m.section || '').toLowerCase().includes('assembly') && (m.lane === 'C' || m.lane === 'D') && !isSpecialMachine(m));

    const countForSection = (sName: string): number => {
        const lower = sName.toLowerCase().trim();
        if (lower.includes('assembly')) {
            if (lower.includes('ab') || lower.includes('1') || lower.includes('2')) return assemblyABMachines.length;
            if (lower.includes('cd') || lower.includes('3') || lower.includes('4')) return assemblyCDMachines.length;
        }
        return (machines.filter(m => m.section === sName && !isSpecialMachine(m)).length);
    };

    sectionLayouts.forEach(s => {
      const nameLower = s.name.toLowerCase().trim();
      
      // Determine if we should draw this section or skip/merge
      // We will draw TWO assembly boxes: AB (1+2) and CD (3+4)
      const isAss1_2 = nameLower.includes('assembly 1') || nameLower.includes('assembly 2');
      const isAss3_4 = nameLower.includes('assembly 3') || nameLower.includes('assembly 4');
      
      if (isAss1_2) {
          if ((doc as any)._ass12Drawn) return;
          (doc as any)._ass12Drawn = true;
      } else if (isAss3_4) {
          if ((doc as any)._ass34Drawn) return;
          (doc as any)._ass34Drawn = true;
      }

      const secMachines = machines.filter(m => {
          const mSec = (m.section || '').toLowerCase();
          if (isAss1_2) return mSec.includes('assembly 1') || mSec.includes('assembly 2');
          if (isAss3_4) return mSec.includes('assembly 3') || mSec.includes('assembly 4');
          return m.section === s.name;
      });

      let minX_draw = s.position.x;
      let maxX_draw = s.position.x + s.length;
      let minZ_draw = s.position.z - s.width/2;
      let maxZ_draw = s.position.z + s.width/2;

      // Expand to cover sister assembly section
      if (isAss1_2 || isAss3_4) {
          const targets = isAss1_2 ? ['assembly 1', 'assembly 2'] : ['assembly 3', 'assembly 4'];
          sectionLayouts.filter(sl => targets.some(t => sl.name.toLowerCase().includes(t))).forEach(as => {
              minX_draw = Math.min(minX_draw, as.position.x);
              maxX_draw = Math.max(maxX_draw, as.position.x + as.length);
              minZ_draw = Math.min(minZ_draw, as.position.z - as.width/2);
              maxZ_draw = Math.max(maxZ_draw, as.position.z + as.width/2);
          });
      }

      secMachines.forEach(m => {
          const d = getMachineDims(m.operation.machine_type);
          maxX_draw = Math.max(maxX_draw, m.position.x + d.length/2);
          minZ_draw = Math.min(minZ_draw, m.position.z - d.width/2);
          maxZ_draw = Math.max(maxZ_draw, m.position.z + d.width/2);
      });

      const worldToPage = (wx: number, wz: number) => ({
        px: offsetX + (wx - minX + worldPadding) * scale,
        py: offsetY + (wz - minZ + worldPadding) * scale
      });

      const sw = (maxX_draw - minX_draw) * scale;
      const sh = (maxZ_draw - minZ_draw) * scale;
      const { px, py } = worldToPage(minX_draw, minZ_draw);

      doc.setDrawColor(180);
      doc.setLineWidth(0.3);
      doc.rect(px, py, sw, sh);

      // Label Placement Logic
      let isCD_lane = nameLower.includes('collar') || nameLower.includes('front') || nameLower.includes('assembly cd') || isAss3_4;
      
      const labelX = px + sw / 2;
      let labelY = isCD_lane ? (py + sh + 12) : (py - 6);

      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(150);
      
      let displayLabel = s.name.toUpperCase();
      if (isAss1_2) displayLabel = "ASSEMBLY AB";
      if (isAss3_4) displayLabel = "ASSEMBLY CD";
      
      const count = countForSection(s.name);
      doc.text(`${displayLabel} (${count})`, labelX, labelY, { align: 'center' });
    });
    
    // Cleanup temporary flags
    delete (doc as any)._ass12Drawn;
    delete (doc as any)._ass34Drawn;

    doc.setTextColor(0);
    const counters: Record<string, number> = {};
    machines.forEach(m => {
        const sec = m.section || 'Other';
        let gk = sec.toLowerCase().includes('assembly') ? 'ASSEMBLY' : sec;
        
        if (!counters[gk]) counters[gk] = 1;
        const pfx = gk === 'ASSEMBLY' ? 'C' : gk.charAt(0).toUpperCase();
        
        // Use a slightly larger scale factor for text in whole mode if possible
        drawMachine(doc, m, minX, minZ, scale, offsetX, offsetY, worldPadding, pfx, counters[gk]);
        
        const type = (m.operation.machine_type || '').toLowerCase();
        const op = (m.operation.op_name || '').toLowerCase();
        const isSpec = type.includes('inspection') || type.includes('supermarket') || op.includes('inspection') || op.includes('supermarket');
        if (!isSpec && !type.includes('helper')) counters[gk]++;
    });

  } else {
    // -------------------------------------------------------------------------
    // SECTION-WISE MULTI-PAGE PDF
    // -------------------------------------------------------------------------
    
    // 1. Group by "logical" page sections
    const logicalSections: { name: string, subSections: string[] }[] = [];
    sectionLayouts.forEach(s => {
        const nl = s.name.toLowerCase();
        if (nl.includes('assembly')) {
            const isAB = nl.includes('1') || nl.includes('2') || nl.includes('ab');
            const groupName = isAB ? 'ASSEMBLY AB' : 'ASSEMBLY CD';
            
            if (!logicalSections.find(ls => ls.name === groupName)) {
                logicalSections.push({ 
                    name: groupName, 
                    subSections: sectionLayouts.filter(sl => {
                        const snl = sl.name.toLowerCase();
                        if (!snl.includes('assembly')) return false;
                        const sab = snl.includes('1') || snl.includes('2') || snl.includes('ab');
                        return isAB ? sab : !sab;
                    }).map(sl => sl.name)
                });
            }
        } else {
            logicalSections.push({ name: s.name.toUpperCase(), subSections: [s.name] });
        }
    });

    logicalSections.forEach((ls, idx) => {
        if (idx > 0) doc.addPage();
        drawHeader(doc, `SECTION LAYOUT: ${ls.name}`);

        const secMachines = machines.filter(m => {
            const mSec = (m.section || '').toLowerCase().trim();
            const isAssPage = ls.name.includes('ASSEMBLY');
            if (isAssPage) {
                const isABPage = ls.name.includes('AB');
                const mIsAB = mSec.includes('1') || mSec.includes('2') || mSec.includes('ab');
                if (mSec.includes('assembly')) {
                    return isABPage ? mIsAB : !mIsAB;
                }
            }
            return ls.subSections.some(ss => ss.toLowerCase().trim() === mSec);
        });
        
        // Local bounds: Cover the area of ALL sections in this logical group
        const groupLayouts = sectionLayouts.filter(sl => {
            const slName = sl.name.toLowerCase().trim();
            const isAssPage = ls.name.includes('ASSEMBLY');
            if (isAssPage) {
                const isABPage = ls.name.includes('AB');
                const sIsAB = slName.includes('1') || slName.includes('2') || slName.includes('ab');
                if (slName.includes('assembly')) {
                    return isABPage ? sIsAB : !sIsAB;
                }
            }
            return ls.subSections.some(ss => ss.toLowerCase().trim() === slName);
        });
        
        let minX_local = Infinity, maxX_local = -Infinity;
        let minZ_local = Infinity, maxZ_local = -Infinity;

        groupLayouts.forEach(at => {
            minX_local = Math.min(minX_local, at.position.x);
            maxX_local = Math.max(maxX_local, at.position.x + at.length);
            minZ_local = Math.min(minZ_local, at.position.z - at.width / 2);
            maxZ_local = Math.max(maxZ_local, at.position.z + at.width / 2);
        });

        // Also account for machines that might bleed out
        secMachines.forEach(m => {
            const d = getMachineDims(m.operation.machine_type);
            minX_local = Math.min(minX_local, m.position.x - d.length);
            maxX_local = Math.max(maxX_local, m.position.x + d.length);
            minZ_local = Math.min(minZ_local, m.position.z - d.width);
            maxZ_local = Math.max(maxZ_local, m.position.z + d.width);
        });

        const worldWidth = maxX_local - minX_local;
        const worldHeight = maxZ_local - minZ_local;
        const worldPadding = 0.2; // Drastically reduced for maximum zoom
        const totalWorldWidth = worldWidth + worldPadding * 2;
        const totalWorldHeight = worldHeight + worldPadding * 2;
        
        const drawWidth = pageWidth - margin * 2;
        const drawHeight = pageHeight - margin * 2 - headerHeight;
        const scale = Math.min(drawWidth / totalWorldWidth, drawHeight / totalWorldHeight);
        
        const offsetX = margin + (drawWidth - totalWorldWidth * scale) / 2;
        const offsetY = margin + headerHeight + (drawHeight - totalWorldHeight * scale) / 2;

        const worldToPage = (wx: number, wz: number) => ({
            px: offsetX + (wx - minX_local + worldPadding) * scale,
            py: offsetY + (wz - minZ_local + worldPadding) * scale
        });

        // Draw Zone Borders on this zoomed page
        groupLayouts.forEach(gl => {
            const borderW = gl.length * scale;
            const borderH = gl.width * scale;
            const { px, py } = worldToPage(gl.position.x, gl.position.z - gl.width/2);
            doc.setDrawColor(200);
            doc.setLineWidth(0.4);
            doc.rect(px, py, borderW, borderH);
        });

        // Draw Machines
        const pfx = ls.name === 'ASSEMBLY' ? 'C' : ls.name.charAt(0).toUpperCase();
        let counter = 1;
        secMachines.forEach(m => {
            drawMachine(doc, m, minX_local, minZ_local, scale, offsetX, offsetY, worldPadding, pfx, counter);
            const type = (m.operation.machine_type || '').toLowerCase();
            const op = (m.operation.op_name || '').toLowerCase();
            const isSpec = type.includes('inspection') || type.includes('supermarket') || op.includes('inspection') || op.includes('supermarket');
            if (!isSpec && !type.includes('helper')) counter++;
        });

        doc.setDrawColor(0);
        doc.setLineWidth(0.4);
        doc.rect(5, 5, pageWidth - 10, pageHeight - 10);
    });
  }

  const suffix = mode === 'whole' ? 'FULL_LAYOUT' : 'SECTION_WISE';
  const fileName = `${line.lineNo}_${line.styleNo || 'N-A'}_${suffix}.pdf`.replace(/\s+/g, '_').toUpperCase();
  doc.save(fileName);
};
