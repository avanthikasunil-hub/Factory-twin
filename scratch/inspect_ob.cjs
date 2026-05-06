const XLSX = require('xlsx');
const workbook = XLSX.readFile('/Users/avanthikasunil/Downloads/LinePlanner-main-2/ob/SMV & Feasibility Checklist - PUFFIN 27.07.23.xlsx');
const sheet = workbook.Sheets['PUFFIN LS LINEN'];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
console.log(JSON.stringify(data.slice(0, 50)));
