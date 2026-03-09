const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const extractOperations = () => {
    const filePath = path.join(process.cwd(), 'ob', 'SMV & Feasibility Checklist - PUFFIN 27.07.23.xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheetNum = 0; // First sheet
    const sheet = workbook.Sheets[workbook.SheetNames[sheetNum]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const operations = [];
    let currentSection = 'Front';

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const col1 = String(row[1] || '').trim().toLowerCase();
        if (['collar', 'cuff', 'sleeve', 'front', 'back', 'assembly'].includes(col1)) {
            currentSection = col1;
            continue;
        }

        const sl = row[0];
        const desc = row[1];
        const machine = row[9];
        const smv = parseFloat(row[17]);

        if (sl && typeof sl === 'number' && desc && smv > 0) {
            operations.push({
                op_no: String(sl),
                op_name: desc,
                machine_type: machine || 'Manual',
                section: currentSection,
                smv: smv
            });
        }
    }
    return operations;
};

const operations = extractOperations();
const totalTargetOutput = 1200;
const workingHours = 9;
const efficiency = 90;
const numAssemblyLines = 3;

const availableTime = workingHours * 60; // 540 mins
const effectiveTime = availableTime * (efficiency / 100); // 540 * 0.9 = 486 mins

console.log('| OP No | Operation Name | Section | Target | SMV | Takt | Calc (SMV/Takt) | Machines |');
console.log('|-------|----------------|---------|--------|-----|------|-----------------|----------|');

operations.forEach(op => {
    const isAssembly = op.section.toLowerCase().includes('assembly');
    const targetOutput = isAssembly ? (totalTargetOutput / numAssemblyLines) : totalTargetOutput;
    const takt = effectiveTime / targetOutput;

    const rawCalc = op.smv / takt;
    const required = Math.ceil(rawCalc);
    const count = Math.min(100, Math.max(1, required));
    console.log(`| ${op.op_no} | ${op.op_name.padEnd(20).substring(0, 20)}... | ${op.section} | ${targetOutput} | ${op.smv.toFixed(2)} | ${takt.toFixed(3)} | ${op.smv.toFixed(2)} / ${takt.toFixed(3)} = ${rawCalc.toFixed(2)} | **${count}** |`);
});
