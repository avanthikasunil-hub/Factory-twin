
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Path to the file
const filePath = path.resolve('ob/SMV & Feasibility Checklist - PUFFIN 27.07.23.xlsx');

// Check if file exists
if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

// Read the file
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

// Helper to normalize strings
const normalize = (str) => String(str || '').toLowerCase().trim();

// Find headers
let headers = [];
let headerRowIndex = -1;
for (let i = 0; i < 20; i++) {
    const row = data[i];
    // Check for "Operation Description" or "Machine" or "SL"
    if (row && (row.includes('Operation Description') || row.includes('Machine') || row.includes('SL #'))) {
        headers = row;
        headerRowIndex = i;
        break;
    }
}

if (headerRowIndex === -1) {
    console.error('Could not find header row. Printing first 20 rows for debugging:');
    for (let i = 0; i < 20; i++) {
        console.log(`Row ${i}:`, JSON.stringify(data[i]));
    }
    process.exit(1);
}

const getColIndex = (keyword) => headers.findIndex(h => normalize(h).includes(normalize(keyword)));

const opNoIdx = headers.findIndex(h => h === 'SL #' || normalize(h).includes('sl'));
const opNameIdx = headers.findIndex(h => h === 'Operation Description' || normalize(h).includes('description'));
const machineIdx = headers.findIndex(h => h === 'Machine' || normalize(h).includes('machine'));
const sectionIdx = -1; // No explicit section column seen

// Parse
let sleeveOps = [];
let currentSection = '';

// DEBUG: Dump rows 20 to 40 for Front Section
console.log("\n--- DEBUG DUMP ROWS 20-40 ---");
for (let i = 20; i < 40; i++) {
    console.log(`Row ${i}:`, JSON.stringify(data[i]));
}

// Scan sections
console.log("--- SCANNING FOR SECTIONS ---");
let detectedSection = '';

for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const firstCell = String(row[0] || '').trim().toLowerCase();
    const secondCell = String(row[1] || '').trim().toLowerCase();
    const thirdCell = String(row[2] || '').trim().toLowerCase(); // Sometimes deep indentation

    let newSection = '';

    // Check obvious section headers
    if (secondCell.includes('collar') || firstCell.includes('collar')) newSection = 'Collar';
    else if (secondCell.includes('cuff') || firstCell.includes('cuff')) newSection = 'Cuff';
    else if (secondCell.includes('sleeve') || firstCell.includes('sleeve')) newSection = 'Sleeve';
    else if (secondCell.includes('front') || firstCell.includes('front')) newSection = 'Front';
    else if (secondCell.includes('back') && !secondCell.includes('neck') || firstCell.includes('back')) newSection = 'Back';
    else if (secondCell.includes('assembly') || firstCell.includes('assembly')) newSection = 'Assembly';

    if (newSection && newSection !== detectedSection) {
        console.log(`Row ${i}: Detected Section "${newSection}" (Row Content: ${JSON.stringify(row)})`);
        detectedSection = newSection;
    }
}

// Re-run sleeve extraction based on correct start
console.log("\n--- EXTRACTING ACTUAL SLEEVE OPS ---");
detectedSection = '';
sleeveOps = [];

for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const firstCell = String(row[0] || '').trim().toLowerCase();
    const secondCell = String(row[1] || '').trim().toLowerCase();

    if (secondCell.includes('collar') || firstCell.includes('collar')) detectedSection = 'collar';
    else if (secondCell.includes('cuff') || firstCell.includes('cuff')) detectedSection = 'cuff';
    else if (secondCell.includes('placket') || firstCell.includes('placket')) detectedSection = 'placket'; // Possible confusion?
    else if (secondCell.includes('sleeve') || firstCell.includes('sleeve')) detectedSection = 'sleeve';
    else if (secondCell.includes('front') || firstCell.includes('front')) detectedSection = 'front';
    else if (secondCell.includes('back') || firstCell.includes('back')) detectedSection = 'back';
    else if (secondCell.includes('assembly') || firstCell.includes('assembly')) detectedSection = 'assembly';

    if (detectedSection === 'back') {
        const opNo = row[opNoIdx];
        const opName = opNameIdx !== -1 ? row[opNameIdx] : 'Unknown';
        let machine = machineIdx !== -1 ? row[machineIdx] : 'Manual';

        // Skip header row itself
        if (String(opName).toLowerCase() === 'back') continue;
        if (String(secondCell).toLowerCase() === 'back') continue;

        // Check for Sub Total
        if ((opName && String(opName).toLowerCase().includes('sub total')) || (secondCell && String(secondCell).toLowerCase().includes('sub total'))) {
            console.log(`[BACK SECTION TOTAL FOUND]: ${JSON.stringify(row)}`);
            continue;
        }

        // Skip totals
        if (opName && String(opName).toLowerCase().includes('total')) continue;
        if (!opNo && !opName) continue;

        if (!machine) machine = "Manual";

        sleeveOps.push({ opNo, opName, machine, row });
    }
}

console.log("\n--- BACK SECTION OPERATIONS & SMV ---");
if (sleeveOps.length === 0) {
    console.log("No Back operations found.");
} else {
    sleeveOps.forEach(op => {
        const smv = op.row[17];
        console.log(`${op.opNo} | ${op.opName} | ${op.machine} | SMV: ${smv}`);
    });
}
