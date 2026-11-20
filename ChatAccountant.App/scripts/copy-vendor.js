/* Copies the third-party browser libraries from node_modules into assets/vendor so the app runs without any CDN.
   Run:  npm run vendor        (after `npm install`)  — the copied files are committed, so you only need this to upgrade. */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const nm = (p) => path.join(root, "node_modules", p);
const out = (p) => path.join(root, "assets", "vendor", p);
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); console.log("vendor:", path.relative(root, to)); };

copy(nm("jquery/dist/jquery.min.js"), out("jquery/jquery-3.7.1.min.js"));
copy(nm("html2canvas/dist/html2canvas.min.js"), out("html2canvas/html2canvas.min.js"));
copy(nm("jspdf/dist/jspdf.umd.min.js"), out("jspdf/jspdf.umd.min.js"));

// Phosphor icon fonts (regular = "ph", bold = "ph-bold"). Only woff2 + woff are shipped, so drop the ttf/svg fallbacks from the CSS.
for (const [weight, file] of [["regular", "Phosphor"], ["bold", "Phosphor-Bold"]]) {
  const dir = nm("@phosphor-icons/web/src/" + weight);
  let css = fs.readFileSync(path.join(dir, "style.css"), "utf8");
  css = css.replace(/src:\s*url\("\.\/[^)]*\.woff2"\)[\s\S]*?;/, `src: url("./${file}.woff2") format("woff2"),\n    url("./${file}.woff") format("woff");`);
  fs.mkdirSync(out("phosphor/" + weight), { recursive: true });
  fs.writeFileSync(out("phosphor/" + weight + "/style.css"), css);
  copy(path.join(dir, file + ".woff2"), out("phosphor/" + weight + "/" + file + ".woff2"));
  copy(path.join(dir, file + ".woff"), out("phosphor/" + weight + "/" + file + ".woff"));
}
