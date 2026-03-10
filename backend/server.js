const http = require("http");
const url = require("url");

// Microsoft Graph Credentials
const tenantId = "38fbdf1b-3455-4185-9e4c-92a79558faef";
const clientId = "140dd92a-f13c-4fae-8d4c-daf6fe1eb33c";
const clientSecret = "f91429c8-6c93-43ce-9b5b-1f417b19efa7";
const personalUserPrincipalName = "ratneshkumar@yorkermedia.com";

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  try {
    const response = await fetch("https://us-central1-lagunaclothing-ishika.cloudfunctions.net/getAccessToken");
    const data = await response.json();
    if (data.access_token) {
      cachedToken = data.access_token;
      tokenExpiry = now + 3500000; // Assume ~1 hour expiry
      return cachedToken;
    }
    throw new Error("Failed to get token from cloud function");
  } catch (error) {
    console.error("Cloud Function Token Error:", error);
    return null;
  }
}

async function fetchGraphData(sheetName) {
  const token = await getAccessToken();
  if (!token) return [];

  const filePath = "Book 1.xlsx";
  const url = `https://graph.microsoft.com/v1.0/users/${personalUserPrincipalName}/drive/root:/${encodeURIComponent(filePath)}:/workbook/worksheets('${sheetName}')/usedRange?$select=values`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return data.values || [];
  } catch (error) {
    console.error(`Graph Fetch Error (${sheetName}):`, error);
    return [];
  }
}

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

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  res.setHeader("Content-Type", "application/json");

  // Get Microsoft Graph Token
  if (pathname === "/get-token") {
    const token = await getAccessToken();
    if (token) {
      return res.end(JSON.stringify({ access_token: token }));
    } else {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }
  }

  // Get all lines (fixed list)
  if (pathname === "/lines") {
    const lines = ["LINE 1", "LINE 2", "LINE 3", "LINE 4", "LINE 5", "LINE 6", "LINE 7", "LINE 8", "LINE 9"];
    return res.end(JSON.stringify(lines));
  }

  // Get styles for a line
  if (pathname === "/styles") {
    const line = query.line;
    if (!line) return res.end(JSON.stringify([]));

    const sheetData = await fetchGraphData(line);
    if (sheetData.length < 4) return res.end(JSON.stringify([]));

    // Index 4 is Style (as confirmed in StyleOB logic)
    const styles = sheetData.slice(3)
      .map(row => {
        const val = row[4];
        return val != null ? String(val).trim() : "";
      })
      .filter(s => s !== "" && s.toLowerCase() !== "style");

    return res.end(JSON.stringify([...new Set(styles)]));
  }

  // Get OC numbers for a style
  if (pathname === "/oc") {
    const line = query.line;
    const style = query.style;
    if (!line || !style) return res.end(JSON.stringify([]));

    const sheetData = await fetchGraphData(line);
    if (sheetData.length < 4) return res.end(JSON.stringify([]));

    // Index 1 is Con No (OC), Index 4 is Style
    const ocList = sheetData.slice(3)
      .filter(row => row[4] != null && String(row[4]).trim() === style)
      .map(row => row[1] != null ? String(row[1]).trim() : "")
      .filter(oc => oc !== "");

    return res.end(JSON.stringify([...new Set(ocList)]));
  }

  // Get buyer for a line/style/oc
  if (pathname === "/buyer") {
    const line = query.line;
    const style = query.style;
    const oc = query.oc;
    if (!line || !style) return res.end(JSON.stringify({ buyer: "" }));

    const sheetData = await fetchGraphData(line);
    if (sheetData.length < 4) return res.end(JSON.stringify({ buyer: "" }));

    // Find a row where Style matches (index 4)
    // If OC is provided (index 1), match both. If not, match just Style.
    const matchingRow = sheetData.slice(3)
      .find(row => {
        const styleMatch = row[4] != null && String(row[4]).trim() === style;
        const ocMatch = !oc || (row[1] != null && String(row[1]).trim() === oc);
        return styleMatch && ocMatch;
      });

    // Per user instruction: Buyer is ALWAYS in column A (index 0)
    let buyer = "";
    if (matchingRow && matchingRow[0] != null) {
      buyer = String(matchingRow[0]).trim();
    }

    // Only fallback if absolutely necessary and buyer is completely empty
    if (!buyer) {
      buyer = extractBuyerFromHeader(sheetData);
    }

    return res.end(JSON.stringify({ buyer }));
  }

  res.end(JSON.stringify({ message: "Backend is working" }));
});

server.listen(4000, () => {
  console.log("Backend running on http://localhost:4000");
});
