const XLSX = require('xlsx');
const workbook = XLSX.readFile('/Users/avanthikasunil/Downloads/LinePlanner-main-2/ob/SMV & Feasibility Checklist - PUFFIN 27.07.23.xlsx');
const sheet = workbook.Sheets['PUFFIN LS LINEN'];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

const COLUMN_ALIASES = {
  op_no: ['op no', 'op_no', 'op. no.', 'operation number', 'op id', 'id', 'sl #', 'sl', 'sl.', 's.l', 'no', 'seq', 'opseq'],
  op_name: ['operation description', 'operation', 'operations', 'op name'],
  machine_type: ['machine', 'mc type', 'm/c type', 'machine type', 'machine_type'],
  smv: ['smv', 'sam', 's m v', 's a m']
};

function normalize(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim(); }
function findIdx(headers, field) {
  const aliases = COLUMN_ALIASES[field].map(normalize);
  for (let i = 0; i < headers.length; i++) {
    if (aliases.includes(normalize(headers[i]))) return i;
  }
  return -1;
}

let headerIdx = -1;
let indices = {};
for(let i=0; i<minScan(data, 50); i++) {
  const h = data[i] || [];
  const tSmv = findIdx(h, "smv");
  if (tSmv !== -1) {
    headerIdx = i;
    indices = { opNo: findIdx(h, "op_no"), opName: findIdx(h, "op_name"), machine: findIdx(h, "machine_type"), smv: tSmv };
    break;
  }
}

function minScan(d, n) { return Math.min(d.length, n); }

const ops = [];
let currentSec = "General";
for(let i=headerIdx+1; i<data.length; i++) {
  const row = data[i];
  if(!row || row.length < 2) continue;
  const rawSMV = String(row[indices.smv] || "0");
  const smv = parseFloat(rawSMV.replace(/[^0-9.]/g, ""));
  const opName = String(row[indices.opName] || "").trim();
  
  if (smv > 0) {
    ops.push({
      op_no: String(row[indices.opNo] || ""),
      op_name: opName,
      machine_type: String(row[indices.machine] || ""),
      smv: smv,
      section: currentSec
    });
  } else if (opName && !rawSMV.trim()) {
    currentSec = opName;
  }
}
console.log(JSON.stringify(ops));
