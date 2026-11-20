/* Tiny static file server for local use:  npm start  →  http://localhost:8000
   (Any static server works — this just avoids needing anything installed besides Node.) */
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const port = Number(process.env.PORT) || 8000;
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".woff2": "font/woff2",
  ".woff": "font/woff", ".svg": "image/svg+xml", ".sql": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8"
};

function createServer() {
  return http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split("?")[0]);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root) || file.includes(path.sep + "node_modules" + path.sep)) { res.writeHead(403); return res.end("Forbidden"); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(buf);
    });
  });
}
module.exports = { createServer };

if (require.main === module) {
  createServer().listen(port, () => console.log("Chat Accountant → http://localhost:" + port));
}
