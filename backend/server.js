const http = require("http");
const url = require("url");
const { loadMasterData } = require("./masterReader");

const masterData = loadMasterData();

console.log("Master Sheet Loaded:", Object.keys(masterData));

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  // Get all lines
  if (pathname === "/lines") {
    return res.end(JSON.stringify(Object.keys(masterData)));
  }

  // Get styles for a line
  if (pathname === "/styles") {
    const line = query.line;
    if (!masterData[line]) return res.end(JSON.stringify([]));

    const styles = [...new Set(masterData[line].map(r => r.style))];
    return res.end(JSON.stringify(styles));
  }

  // Get OC numbers for a style
  if (pathname === "/oc") {
    const line = query.line;
    const style = query.style;

    if (!masterData[line]) return res.end(JSON.stringify([]));

    const ocList = masterData[line]
      .filter(r => r.style === style)
      .map(r => r.oc);

    return res.end(JSON.stringify([...new Set(ocList)]));
  }

  res.end(JSON.stringify({ message: "Backend is working" }));
});

server.listen(4000, () => {
  console.log("Backend running on http://localhost:4000");
});
