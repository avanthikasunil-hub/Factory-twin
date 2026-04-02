const express = require("express");
const dns = require("node:dns");
dns.setDefaultResultOrder("ipv4first");

const cors = require("cors");
const multer = require("multer");
const XLSX = require("xlsx");
const db = require("./db");
const url = require("url");
const path = require("path");

const app = express();
const fs = require("fs");
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Microsoft Graph Credentials
const tenantId = "38fbdf1b-3455-4185-9e4c-92a79558faef";
const clientId = "140dd92a-f13c-4fae-8d4c-daf6fe1eb33c";
const clientSecret = "f91429c8-6c93-43ce-9b5b-1f417b19efa7";
const personalUserPrincipalName = "ratneshkumar@yorkermedia.com";

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken(retries = 3) {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[Token] Fetching access token (Attempt ${i + 1}/${retries})...`);
      const response = await fetch("https://us-central1-lagunaclothing-ishika.cloudfunctions.net/getAccessToken", {
        signal: AbortSignal.timeout(15000) // 15-second timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.access_token) {
        cachedToken = data.access_token;
        tokenExpiry = now + 3500000; // Assume ~1 hour expiry
        console.log("[Token] Successfully fetched access token.");
        return cachedToken;
      }
      throw new Error("Failed to get token from cloud function: No access_token in response");
    } catch (error) {
      console.error(`[Token] Cloud Function Token Error (Attempt ${i + 1}):`, error.message);
      if (i === retries - 1) return null;
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
}


const graphCache = new Map();
const pendingRequests = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // Increase cache to 5 minutes for better performance

async function fetchGraphData(sheetName) {
  const now = Date.now();
  
  // 1. Check cache
  if (graphCache.has(sheetName)) {
    const { data, expiry } = graphCache.get(sheetName);
    if (now < expiry) {
      console.log(`[Cache] Returning cached data: ${sheetName}`);
      return data;
    }
  }

  // 2. Check if a request is already in progress
  if (pendingRequests.has(sheetName)) {
    console.log(`[Coalesce] Waiting for in-flight request: ${sheetName}`);
    return pendingRequests.get(sheetName);
  }

  // 3. Start a new request and track it
  const fetchPromise = (async () => {
    try {
      const token = await getAccessToken();
      if (!token) return [];

      const filePath = "Book 1.xlsx";
      const graphUrl = `https://graph.microsoft.com/v1.0/users/${personalUserPrincipalName}/drive/root:/${encodeURIComponent(filePath)}:/workbook/worksheets('${sheetName}')/usedRange?$select=values`;

      console.log(`[API] Fetching from Graph: ${sheetName}`);
      const res = await fetch(graphUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      const values = data.values || [];
      
      graphCache.set(sheetName, { data: values, expiry: Date.now() + CACHE_DURATION });
      return values;
    } catch (error) {
      console.error(`Graph Fetch Error (${sheetName}):`, error);
      return [];
    } finally {
      pendingRequests.delete(sheetName);
    }
  })();

  pendingRequests.set(sheetName, fetchPromise);
  return fetchPromise;
}

// Reuse the extraction logic from server.js
function extractBuyerFromHeader(sheetData) {
  if (!sheetData || sheetData.length === 0) return "";
  const searchLimit = Math.min(sheetData.length, 20);
  for (let r = 0; r < searchLimit; r++) {
    const row = sheetData[r];
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || "").toLowerCase();
      if (cell.includes("buyer")) {
        if (cell.includes(":")) {
          return cell.split(":")[1].trim();
        } else if (c + 1 < row.length && row[c + 1]) {
          return String(row[c + 1]).trim();
        }
      }
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// OB Parsing logic (ported from obParser.ts)
// ---------------------------------------------------------------------------
const COLUMN_ALIASES = {
  op_no: ['op no', 'op_no', 'op. no.', 'operation number', 'op id', 'id', 'sl', 'sl.', 's.l', 'no', 'seq', 'opseq', 'op seq', 'a', 'A'],
  op_name: [
    'operation', 'operations', 'op name', 'op_name', 'operation name', 'op description', 'description',
    'op_desc', 'operation_name', 'particulars', 'process', 'process name', 'opname', 'task', 'task name', 'element', 'b', 'B', 'c', 'C'
  ],
  machine_type: [
    'machine', 'mc type', 'm/c type', 'machine type', 'mc_type', 'm/c', 'mc', 'machine_type',
    'equipment', 'machinery', 'm/c name', 'mc name', 'machine name', 'c', 'C'
  ],
  smv: [
    'smv', 'sam', 's m v', 's a m', 'standard_minute', 'std min', 'standard minute',
    'standard time', 'cycle time', 'smv (min)', 'sam (min)', 'bpt', 'basic pitch time',
    'allocated time', 'target time', 'estimated time', 'val', 'standard val',
    'smv total', 'total smv', 'work content', 'mins', 'min', 'pitch time', 'standard minutes',
    'standard value', 'std value', 'std.min', 'smv/pc', 'smv / pc', 'machine smv',
    'target smv', 'm/c smv', 'manual smv', 'cycle_time', 'pitch_time', 'smv_total', 'total_smv', 'd', 'D'
  ],

  section: ['section', 'sect', 'department', 'dept', 'area', 'zone', 'component', 'garment part'],
  tool_folder: ['tool/folder', 'tool', 'folder', 'attachment', 'guide', 'folder/tool'],
  machinist_smv: ['machinist smv', 'machinist', 'operator smv', 'operator time', 'machinist time', 'machinist_smv'],
  non_machinist_smv: ['non-machinist', 'non machinist', 'non-machinist smv', 'helper smv', 'helper time', 'manual smv', 'non-machinist time', 'non_machinist'],
  no_of_machines: ['no of machines', 'no. of machines', 'machine count', 'mc count', 'm/c count', 'no of mc', 'no of m/c']
};

function normalizeString(str) {
  return String(str ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function findColumnIndex(headers, field) {
  const aliases = COLUMN_ALIASES[field].map(normalizeString);
  if (field === 'smv') {
    for (let i = 0; i < headers.length; i++) {
      const raw = String(headers[i] ?? '').trim().toLowerCase();
      if (raw === 'smv' || raw === 'sam') return i;
    }
  }
  for (let i = 0; i < headers.length; i++) {
    const h = normalizeString(headers[i]);
    if (h && aliases.includes(h)) return i;
  }
  return -1;
}

function parseValue(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const s = String(val).trim();
  const n = parseFloat(s.replace(/[^\d.,]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

const SECTION_MAP = [
  ['collar', 'Collar'], ['cuff', 'Cuff'], ['sleeve', 'Sleeve'],
  ['front', 'Front'], ['back', 'Back'], ['assembly', 'Assembly'],
];

function isSectionHeader(row, opNoIndex, smvIndex) {
  if (typeof opNoIndex === 'number' && typeof smvIndex === 'number') {
    const opNo = row[opNoIndex];
    const smv = row[smvIndex];
    if ((opNo != null && String(opNo).trim() !== '' && String(opNo).trim() !== '0') || (smv != null && parseValue(smv) > 0)) return null;
  }
  const rowStr = row.join(' ').toLowerCase();
  for (const [kw, label] of SECTION_MAP) {
    if (rowStr.includes(kw)) return label;
  }
  return null;
}

function parseSpecificSheet(sheet) {
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  if (data.length === 0) return null;

  let headerRowIdx = -1;
  let buyer = "";
  let color = "";
  let quantity = 0;

  // 1. Metadata Extraction (Heuristic Search)
  try {
    const maxScan = Math.min(data.length, 60);
    for (let r = 0; r < maxScan; r++) {
      const row = data[r];
      if (!row || !Array.isArray(row)) continue;

      row.forEach((cell, idx) => {
        if (!cell) return;
        const cellStr = String(cell).toLowerCase().trim();

        const getVal = (keywords) => {
          const match = keywords.find(kw => cellStr.startsWith(kw));
          if (match) {
            // Case 1: "Buyer: Nike" in same cell
            let remainder = cellStr.substring(match.length).trim();
            if (remainder.startsWith(':')) remainder = remainder.substring(1).trim();
            if (remainder.length > 1) return String(cell).substring(String(cell).toLowerCase().indexOf(remainder)).trim();

            // Case 2: "Buyer" in this cell, "Nike" in next
            const nextCell = row[idx + 1];
            if (nextCell) {
              const nextVal = String(nextCell).trim();
              if (nextVal && nextVal !== ":" && nextVal.length > 0) return nextVal;
            }
          }
          return null;
        };

        if (!buyer) {
          const b = getVal(['buyer', 'customer', 'brand', 'client']);
          if (b) buyer = b;
        }
        if (!color) {
          const c = getVal(['color', 'colour', 'shade', 'fabric', 'fabric color']);
          if (c) color = c;
        }
        if (!quantity) {
          const qVal = getVal(['quantity', 'qty', 'order size', 'po qty', 'total qty', 'order qty']);
          if (qVal) {
            const num = parseInt(qVal.replace(/\D/g, ''));
            if (!isNaN(num)) quantity = num;
          }
        }
      });
    }
  } catch (e) { console.error("[Metadata Parse Error]", e); }

  // 2. Find Header Row for Operations
  let bestScore = 0;
  let indices = {};

  for (let i = 0; i < Math.min(data.length, 100); i++) {
    const headers = (data[i] || []).map(h => String(h || '').toLowerCase());
    const tOpNo = findColumnIndex(headers, 'op_no');
    const tOpName = findColumnIndex(headers, 'op_name');
    const tMachine = findColumnIndex(headers, 'machine_type');
    const tSmv = findColumnIndex(headers, 'smv');
    const tMcCount = findColumnIndex(headers, 'no_of_machines');

    let score = 0;
    if (tOpNo !== -1) score += 3;
    if (tOpName !== -1) score += 2;
    if (tMachine !== -1) score += 3;
    if (tSmv !== -1) score += 4;
    if (tMcCount !== -1) score += 2;

    if (score > bestScore) {
      bestScore = score;
      headerRowIdx = i;
      indices = {
        opNo: tOpNo,
        opName: tOpName,
        machine: tMachine,
        smv: tSmv,
        section: findColumnIndex(headers, 'section'),
        mcCount: tMcCount
      };
    }
  }

  if (headerRowIdx === -1 || indices.smv === -1) return null;

  // 3. Parse Operations
  const operations = [];
  let currentSection = 'General';
  let totalSMV = 0;

  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const secH = isSectionHeader(row, indices.opNo, indices.smv);
    if (secH) {
      currentSection = secH;
      continue;
    }

    const smv = parseValue(row[indices.smv]);
    const opName = indices.opName !== -1 ? String(row[indices.opName] || '').trim() : '';
    const opNo = indices.opNo !== -1 ? String(row[indices.opNo] || '').trim() : '';
    const machine = indices.machine !== -1 ? String(row[indices.machine] || '').trim() : '';

    if (smv > 0 && (opName || machine)) {
      operations.push({
        op_no: opNo || `OP-${operations.length + 1}`,
        op_name: opName,
        machine_type: machine,
        smv: smv,
        section: (indices.section !== -1 && row[indices.section]) ? String(row[indices.section]).trim() : currentSection,
        no_of_machines: indices.mcCount !== -1 ? parseValue(row[indices.mcCount]) : 0
      });
      totalSMV += smv;
    }
  }

  return { operations, totalSMV, buyer, color, quantity };
}    // ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

app.get("/lines", (req, res) => {
  res.json(["LINE 1", "LINE 2", "LINE 3", "LINE 4", "LINE 5", "LINE 6", "LINE 7", "LINE 8", "LINE 9"]);
});

app.get("/schedule", async (req, res) => {
  const line = req.query.line;
  if (!line) return res.json([]);

  const sheetData = await fetchGraphData(line);
  console.log(`[Schedule] Line: ${line}, Rows found: ${sheetData.length}`);
  if (sheetData.length < 4) return res.json([]);

  const schedule = await Promise.all(sheetData.slice(3)
    .filter(row => row[0])
    .map(async (row, idx) => {
      const style_no = row[4] ? String(row[4]).trim() : "";
      const con_no = row[1] ? String(row[1]).trim() : "";

      const dbStatus = await new Promise((resolve) => {
        db.get(`SELECT status FROM style_status WHERE line_no = ? AND style_no = ? AND con_no = ?`, [line, style_no, con_no], (err, row) => resolve(row ? row.status : "Planned"));
      });

      // Check if OB exists and get filename
      const obData = await new Promise(resolve => {
        db.get(`SELECT ob_file_name FROM style_ob WHERE line_no = ? AND style_no = ? AND con_no = ?`, [line, style_no, con_no], (err, row) => resolve(row));
      });

      return {
        id: idx + 1,
        buyer: row[0] ? String(row[0]).trim() : "",
        conNo: con_no,
        color: row[2] ? String(row[2]).trim() : "",
        quantity: row[3] ? String(row[3]).trim() : "",
        style: style_no,
        status: dbStatus,
        hasOB: !!obData,
        obFileName: obData ? obData.ob_file_name : null
      };
    }));

  res.json(schedule);
});

app.post("/update-status", (req, res) => {
  const { line_no, style_no, con_no, status } = req.body;
  db.run(`INSERT OR REPLACE INTO style_status (line_no, style_no, con_no, status) VALUES (?, ?, ?, ?)`, [line_no, style_no, con_no, status], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post("/upload-ob", upload.single("file"), (req, res) => {
  const { line_no, style_no, con_no } = req.body;
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    let bestResult = null;
    let maxOps = 0;

    for (const name of workbook.SheetNames) {
      const resData = parseSpecificSheet(workbook.Sheets[name]);
      if (resData && resData.operations.length > maxOps) {
        maxOps = resData.operations.length;
        bestResult = resData;
      }
    }

    if (!bestResult) return res.status(400).json({ error: "No valid operations found" });

    db.run(`INSERT OR REPLACE INTO style_ob (line_no, style_no, con_no, operations, total_smv, ob_file_name, buyer, color, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [line_no, style_no, con_no, JSON.stringify(bestResult.operations), bestResult.totalSMV, req.file.originalname, bestResult.buyer, bestResult.color, bestResult.quantity],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, count: bestResult.operations.length });
      }
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/get-ob", (req, res) => {
  const { line_no, style_no, con_no } = req.query;
  const query = `
    SELECT * FROM style_ob 
    WHERE LOWER(TRIM(line_no)) = LOWER(TRIM(?)) 
    AND LOWER(TRIM(style_no)) = LOWER(TRIM(?))
    ${con_no ? 'AND (COALESCE(con_no,"") = COALESCE(?,"") OR con_no IS NULL)' : ''}
  `;
  const params = con_no ? [line_no, style_no, con_no] : [line_no, style_no];

  db.get(query, params, (err, row) => {
    if (err) {
      console.error("[Backend] /get-ob Error:", err);
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      console.warn(`[Backend] /get-ob NOT FOUND: Line=${line_no}, Style=${style_no}`);
      return res.status(404).json({ error: "OB not found" });
    }

    // Ensure operations is parsed if it's stored as a string
    try {
      if (row.operations && typeof row.operations === 'string') {
        row.operations = JSON.parse(row.operations);
      }
    } catch (e) {
      console.error("[Backend] Error parsing operations for /get-ob:", e);
    }

    res.json(row);
  });
});

app.get("/current-styles", async (req, res) => {
  const query = `
    SELECT ss.*, so.buyer, so.color, so.quantity 
    FROM style_status ss
    LEFT JOIN style_ob so ON 
      LOWER(TRIM(ss.line_no)) = LOWER(TRIM(so.line_no)) AND 
      LOWER(TRIM(ss.style_no)) = LOWER(TRIM(so.style_no)) AND
      (COALESCE(LOWER(TRIM(ss.con_no)), '') = COALESCE(LOWER(TRIM(so.con_no)), '') OR ss.con_no IS NULL OR so.con_no IS NULL)
  `;

  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(query, [], (err, rows) => err ? reject(err) : resolve(rows));
    });

    // Resolve Fallbacks (Enrich from Google Sheets if SQLite is missing data)
    const enriched = await Promise.all(rows.map(async (row) => {
      // If we have data from style_ob, use it.
      if (row.buyer && row.color && (row.quantity && row.quantity > 0)) {
        return row;
      }

      // Otherwise, fallback to schedule data
      const sheetData = await fetchGraphData(row.line_no);
      if (sheetData && sheetData.length > 3) {
        // Search schedule (skipping first 3 rows) for the match
        const match = sheetData.slice(3).find(sRow => {
          const sStyle = sRow[4] ? String(sRow[4]).trim().toLowerCase() : "";
          const sCon = sRow[1] ? String(sRow[1]).trim().toLowerCase() : "";
          const targetStyle = String(row.style_no).trim().toLowerCase();
          const targetCon = String(row.con_no || "").trim().toLowerCase();

          return (sStyle === targetStyle) && (!targetCon || sCon === targetCon);
        });

        if (match) {
          return {
            ...row,
            buyer: row.buyer || (match[0] ? String(match[0]).trim() : "---"),
            color: row.color || (match[2] ? String(match[2]).trim() : "---"),
            quantity: (row.quantity && row.quantity > 0) ? row.quantity : parseInt(String(match[3] || "0").replace(/\D/g, '')) || 0
          };
        }
      }
      return row;
    }));

    res.json(enriched);
  } catch (err) {
    console.error("[Backend] Error enriching styles:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/active-layouts", (req, res) => {
  // Use a more permissive JOIN to find the OB for active styles
  const query = `
    SELECT 
      ss.line_no as status_line, 
      ss.style_no as status_style, 
      ss.con_no as status_con, 
      ss.status,
      so.*
    FROM style_status ss
    LEFT JOIN style_ob so ON 
      LOWER(TRIM(ss.line_no)) = LOWER(TRIM(so.line_no)) AND 
      LOWER(TRIM(ss.style_no)) = LOWER(TRIM(so.style_no))
    WHERE LOWER(ss.status) IN ('changeover', 'running')
  `;
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error("[Backend] Error in /active-layouts:", err);
      return res.status(500).json({ error: err.message });
    }

    const parsedRows = rows.map(row => {
      let ops = [];
      try {
        if (row.operations) {
          ops = typeof row.operations === 'string' ? JSON.parse(row.operations) : row.operations;
        }
      } catch (e) {
        console.error(`[Backend] JSON Parse error for ${row.status_line}:`, e);
      }
      return {
        ...row,
        line_no: row.status_line, // Ensure the line_no from status is kept
        style_no: row.status_style,
        con_no: row.status_con,
        operations: ops
      };
    });

    console.log(`[Backend] /active-layouts sent ${parsedRows.length} rows. Matches: ${parsedRows.filter(r => r.operations.length > 0).length}`);
    res.json(parsedRows);
  });
});

app.get("/cons", async (req, res) => {
  const line = req.query.line;
  if (!line) return res.json([]);
  const sheetData = await fetchGraphData(line);
  if (sheetData.length < 4) return res.json([]);
  
  const buyers = new Set();
  sheetData.slice(3).forEach(row => {
    if (row[0]) buyers.add(String(row[0]).trim());
  });
  res.json(Array.from(buyers));
});

app.get("/oc-by-buyer", async (req, res) => {
  const { line, buyer } = req.query;
  if (!line || !buyer) return res.json([]);
  const sheetData = await fetchGraphData(line);
  if (sheetData.length < 4) return res.json([]);
  
  const ocs = new Set();
  sheetData.slice(3).forEach(row => {
    if (row[0] && String(row[0]).trim() === buyer) {
      if (row[1]) ocs.add(String(row[1]).trim());
    }
  });
  res.json(Array.from(ocs));
});

app.get("/styles-by-oc", async (req, res) => {
  const { line, oc } = req.query;
  if (!line || !oc) return res.json([]);
  const sheetData = await fetchGraphData(line);
  if (sheetData.length < 4) return res.json([]);
  
  const styles = new Set();
  sheetData.slice(3).forEach(row => {
    if (row[1] && String(row[1]).trim() === oc) {
      if (row[4]) styles.add(String(row[4]).trim());
    }
  });
  res.json(Array.from(styles));
});

// --- Layout Persistence ---
const LAYOUT_DIR = path.join(__dirname, "data");
const CUTTING_LAYOUT_FILE = path.join(LAYOUT_DIR, "cutting_layout.json");
const SEWING_LAYOUT_FILE = path.join(LAYOUT_DIR, "sewing_layout.json");
const WAREHOUSE_LAYOUT_FILE = path.join(LAYOUT_DIR, "warehouse_layout.json");
const FINISHING_LAYOUT_FILE = path.join(LAYOUT_DIR, "finishing_layout.json");

// Ensure the data directory exists
if (!fs.existsSync(LAYOUT_DIR)) {
  fs.mkdirSync(LAYOUT_DIR, { recursive: true });
}

// Helpers for generic read/write
const readLayout = (file, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (fs.existsSync(file)) {
    try {
      const data = fs.readFileSync(file, "utf-8");
      return res.json(JSON.parse(data));
    } catch (e) {
      return res.json([]);
    }
  }
  res.json([]);
};

const writeLayout = (file, req, res, name) => {
  const layout = req.body;
  try {
    fs.writeFileSync(file, JSON.stringify(layout, null, 2));
    console.log(`[${name}] Layout saved: ${layout.length} items → ${file}`);
    res.json({ success: true, count: layout.length });
  } catch (err) {
    console.error(`[${name}] Save layout error:`, err);
    res.status(500).json({ error: "Failed to write layout file" });
  }
};

// Cutting Routes
app.get("/api/cutting/get-layout", (req, res) => readLayout(CUTTING_LAYOUT_FILE, res));
app.post("/api/cutting/save-layout", (req, res) => writeLayout(CUTTING_LAYOUT_FILE, req, res, "Cutting"));

// Sewing Routes
app.get("/api/sewing/get-layout", (req, res) => readLayout(SEWING_LAYOUT_FILE, res));
app.post("/api/sewing/save-layout", (req, res) => writeLayout(SEWING_LAYOUT_FILE, req, res, "Sewing"));

// Warehouse Routes
app.get("/api/warehouse/get-layout", (req, res) => readLayout(WAREHOUSE_LAYOUT_FILE, res));
app.post("/api/warehouse/save-layout", (req, res) => writeLayout(WAREHOUSE_LAYOUT_FILE, req, res, "Warehouse"));

// Finishing Routes
app.get("/api/finishing/get-layout", (req, res) => readLayout(FINISHING_LAYOUT_FILE, res));
app.post("/api/finishing/save-layout", (req, res) => writeLayout(FINISHING_LAYOUT_FILE, req, res, "Finishing"));


app.use(express.static(path.join(__dirname, "../dist")));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
