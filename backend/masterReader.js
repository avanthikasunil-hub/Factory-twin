const xlsx = require("xlsx");
const path = require("path");

function loadMasterData() {
  const filePath = path.join(__dirname, "master-data", "LP MASTER SHEET.xlsx");
  const workbook = xlsx.readFile(filePath);

  const masterData = {};

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet);

    masterData[sheetName] = rows.map(row => ({
      style: String(row["STYLE"]).trim(),
      oc: String(row["OC NO."]).trim()
    }));
  });

  return masterData;
}

module.exports = { loadMasterData };
