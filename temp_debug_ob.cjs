const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = path.join(process.cwd(), 'ob/SMV & Feasibility Checklist - PUFFIN 27.07.23.xlsx');

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // console.log("Sheet:", sheetName);

    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // PARSE WITH KNOWN STRUCTURE
    const headerRowIdx = 0;
    const idx = { sl: 0, desc: 1, machine: 9, smv: 17 };

    let currentSection = 'Unknown';
    let collarMachines = [];

    for (let i = headerRowIdx + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const rowStr = row.join(' ').toLowerCase();

        // Check columns for explicit section headers
        const col1 = String(row[1] || '').trim().toLowerCase(); // Column B often has section name

        if (col1 === 'collar') currentSection = 'Collar';
        else if (col1 === 'cuff') currentSection = 'Cuff';
        else if (col1 === 'sleeve') currentSection = 'Sleeve';
        else if (col1 === 'front') currentSection = 'Front';
        else if (col1 === 'back') currentSection = 'Back';
        else if (col1 === 'assembly') currentSection = 'Assembly';

        if (currentSection === 'Collar') {
            const sl = row[idx.sl];
            const desc = row[idx.desc];
            const mc = row[idx.machine];

            // Valid OP? Must have SL and Desc and NOT be the header row itself
            if ((sl && desc) && String(sl).toLowerCase() !== 'sl #') {
                collarMachines.push({ sl, desc, mc: mc });
            }
        }
    }

    console.log("COLLAR SECTION MACHINES:");
    collarMachines.forEach(m => {
        // Output format: SL. DESC [MACHINE]
        console.log(`${m.sl}. ${m.desc} [${m.mc || 'Manual'}]`);
    });

} catch (err) {
    console.error("Error:", err.message);
}
