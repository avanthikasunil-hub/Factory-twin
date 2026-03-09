
const XLSX = require('xlsx');
const path = require('path');

const filePath = path.resolve('ob/SMV & Feasibility Checklist - PUFFIN 27.07.23.xlsx');
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

let assemblyFound = false;
data.forEach((row, i) => {
    const rowStr = row.join(' ').toLowerCase();
    if (rowStr.includes('assembly')) {
        assemblyFound = true;
        console.log(`\n--- ASSEMBLY SECTION START (Row ${i}) ---`);
    }
    if (assemblyFound) {
        if (rowStr.includes('total') && !rowStr.includes('sub')) {
            assemblyFound = false;
        } else {
            console.log(JSON.stringify(row));
        }
    }
});
