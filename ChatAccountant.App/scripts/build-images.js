/* Regenerates every PNG in assets/images from the vector artwork below.
   Run:  npm run build:images          (needs `npm install` first — it uses sharp)
   The app itself only ships the PNG files; the artwork lives here so the logo can be changed in one place. */
const sharp = require("sharp");
const path = require("path");
const OUT = path.join(__dirname, "..", "assets", "images");

const SHIELD = "M42,48 C42,40 48,36 56,36 L96,36 C104,36 110,40 110,48 L110,84 C110,105 92,118 76,118 C60,118 42,105 42,84 Z";
const CURVE = "M46,62 C62,76 90,76 106,62";
const BARS = '<rect x="60" y="66" width="6" height="26" rx="3" fill="#ffffff" opacity="0.8"/><rect x="73" y="54" width="6" height="46" rx="3" fill="#38bdf8"/><rect x="86" y="62" width="6" height="32" rx="3" fill="#ffffff" opacity="0.95"/>';
const DOT = '<circle cx="106" cy="42" r="5" fill="#10b981"/><circle cx="106" cy="42" r="2" fill="#ffffff"/>';

const svg = (inner, size, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 152 152" width="${size}" height="${size}"><defs>${defs}</defs>${inner}</svg>`;

// White outline glyph on transparent (sits on the header's blue gradient badge)
const glyph = (s) => svg(`<path d="${SHIELD}" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="60" y="66" width="8" height="26" rx="4" fill="#ffffff" opacity="0.85"/><rect x="73" y="54" width="8" height="46" rx="4" fill="#38bdf8"/><rect x="86" y="62" width="8" height="32" rx="4" fill="#ffffff"/>`, s);

// Light sapphire badge (splash screen, app icons)
const blueDefs = '<linearGradient id="sb" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient><linearGradient id="ca" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#93c5fd"/></linearGradient>';
const blueBadge = (s, rx = 42) => svg(`<rect width="152" height="152" rx="${rx}" fill="url(#sb)"/>
  <rect x="1" y="1" width="150" height="150" rx="${Math.max(rx - 1, 0)}" fill="none" stroke="#93c5fd" stroke-width="1.5" stroke-opacity="0.55"/>
  <ellipse cx="76" cy="38" rx="52" ry="24" fill="#ffffff" opacity="0.14"/>
  <path d="${SHIELD}" fill="#0b192c" stroke="#ffffff" stroke-width="2.5" stroke-opacity="0.85" stroke-linecap="round"/>
  <path d="${CURVE}" fill="none" stroke="url(#ca)" stroke-width="2.5" stroke-linecap="round"/>${BARS}${DOT}`, s, blueDefs);

// Dark navy badge (login screen)
const navyDefs = '<linearGradient id="bn" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0f2444"/><stop offset="50%" stop-color="#0b192c"/><stop offset="100%" stop-color="#071220"/></linearGradient><linearGradient id="cn" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#60a5fa"/></linearGradient>';
const navyBadge = (s) => svg(`<rect width="152" height="152" rx="42" fill="url(#bn)"/>
  <rect x="1" y="1" width="150" height="150" rx="41" fill="none" stroke="#2563eb" stroke-width="1.5" stroke-opacity="0.45"/>
  <ellipse cx="76" cy="38" rx="52" ry="24" fill="#38bdf8" opacity="0.12"/>
  <path d="${SHIELD}" fill="#142c4c" stroke="#3b82f6" stroke-width="3" stroke-linecap="round"/>
  <path d="${CURVE}" fill="none" stroke="url(#cn)" stroke-width="2.5" stroke-linecap="round"/>${BARS}${DOT}`, s, navyDefs);

const googleG = (s) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${s}" height="${s}">
  <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" fill="#4285F4"/>
  <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" fill="#34A853"/>
  <path d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.99 0 12s.45 3.83 1.25 5.42l4.03-3.15z" fill="#FBBC05"/>
  <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" fill="#EA4335"/></svg>`;

const jobs = [
  ["logo-glyph.png", glyph(304)],
  ["logo-badge-blue.png", blueBadge(456)],
  ["logo-badge-navy.png", navyBadge(456)],
  ["google-g.png", googleG(96)],
  ["favicon-32.png", blueBadge(32)],
  ["apple-touch-icon.png", blueBadge(180, 0)],   // full-bleed: iOS rounds the corners itself
  ["icon-192.png", blueBadge(192, 0)],
  ["icon-512.png", blueBadge(512, 0)]
];
(async () => {
  for (const [name, markup] of jobs) {
    await sharp(Buffer.from(markup), { density: 192 }).png().toFile(path.join(OUT, name));
    console.log("wrote", name);
  }
})();
