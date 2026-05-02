// generate_atz_circles.js
// Generates accurate ATZ polygons (arc-based where needed) and appends them to airspaces_aip.json
// Run with: node generate_atz_circles.js

import { readFileSync, writeFileSync } from 'fs';

const OUTPUT = './public/data/airspaces_aip.json';
const DEG = Math.PI / 180;

function dms(raw) {
  raw = raw.trim();
  const dir = raw.slice(-1).toUpperCase();
  const d = raw.slice(0, -1);
  let deg, min, sec;
  if (dir === 'N' || dir === 'S') {
    deg = parseInt(d.slice(0,2),10); min = parseInt(d.slice(2,4),10); sec = parseInt(d.slice(4,6),10);
  } else {
    deg = parseInt(d.slice(0,3),10); min = parseInt(d.slice(3,5),10); sec = parseInt(d.slice(5,7),10);
  }
  const v = deg + min/60 + sec/3600;
  return (dir==='S'||dir==='W') ? -v : v;
}

// Angle from center to a point (in radians, bearing from north)
function bearing(cLat, cLon, pLat, pLon) {
  const dLon = (pLon - cLon) * Math.cos(cLat * DEG);
  const dLat = pLat - cLat;
  return Math.atan2(dLon, dLat); // radians, 0 = north, CW positive
}

// Generate arc points from angle startA to endA around center (lat/lon), radius in NM
// clockwise = true → increasing angle
function arcPoints(cLat, cLon, radiusNM, startA, endA, clockwise, steps = 24) {
  const dLat = (radiusNM / 60);
  const dLon = dLat / Math.cos(cLat * DEG);
  const pts = [];

  let delta = endA - startA;
  if (clockwise && delta < 0) delta += 2 * Math.PI;
  if (!clockwise && delta > 0) delta -= 2 * Math.PI;

  for (let i = 0; i <= steps; i++) {
    const a = startA + delta * (i / steps);
    pts.push([
      parseFloat((cLat + dLat * Math.cos(a)).toFixed(6)),
      parseFloat((cLon + dLon * Math.sin(a)).toFixed(6))
    ]);
  }
  return pts;
}

// ── ATIBAIA ATZ ───────────────────────────────────────────────────────────────
// "from 230536S 0463448W, then CW arc, center 230741S 0463429W, 2.1 NM, to 230942S 0463508W"
// The boundary is: start point → clockwise arc back to end point (it's essentially an arc-only boundary
// where start and end are the two termination points of the arc)
function atibaia() {
  const cLat = dms("230741S"), cLon = dms("0463429W");
  const p1Lat = dms("230536S"), p1Lon = dms("0463448W"); // arc start
  const p2Lat = dms("230942S"), p2Lon = dms("0463508W"); // arc end
  const startA = bearing(cLat, cLon, p1Lat, p1Lon);
  const endA   = bearing(cLat, cLon, p2Lat, p2Lon);
  const coords = arcPoints(cLat, cLon, 2.1, startA, endA, true, 32);
  // Close polygon
  coords.push(coords[0]);
  return coords;
}

// ── MARTE ATZ ─────────────────────────────────────────────────────────────────
// "233036S 0463442W - 232924S 0464141W - 233030S 0464155W, then CCW arc,
//  center 232635S 0463731W, 5.62 NM, to 233141S 0463455W"
function marte() {
  const straight = [
    [dms("233036S"), dms("0463442W")],
    [dms("232924S"), dms("0464141W")],
    [dms("233030S"), dms("0464155W")],
  ];
  const cLat = dms("232635S"), cLon = dms("0463731W");
  const arcStartLat = dms("233030S"), arcStartLon = dms("0464155W");
  const arcEndLat   = dms("233141S"), arcEndLon   = dms("0463455W");
  const startA = bearing(cLat, cLon, arcStartLat, arcStartLon);
  const endA   = bearing(cLat, cLon, arcEndLat,   arcEndLon);
  const arcPts = arcPoints(cLat, cLon, 5.62, startA, endA, false, 24); // CCW
  const coords = [...straight, ...arcPts];
  // Close polygon
  coords.push(coords[0]);
  return coords;
}

// ── SOROCABA ATZ ──────────────────────────────────────────────────────────────
// "Circular area centered on 232900S 0472913W, 4 NM radius" — true circle
function sorocaba() {
  const cLat = dms("232900S"), cLon = dms("0472913W");
  const dLat = 4/60, dLon = dLat / Math.cos(cLat * DEG);
  const coords = [];
  const steps = 36;
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    coords.push([
      parseFloat((cLat + dLat * Math.cos(a)).toFixed(6)),
      parseFloat((cLon + dLon * Math.sin(a)).toFixed(6))
    ]);
  }
  coords.push(coords[0]);
  return coords;
}

const atzEntries = [
  { name: "Atibaia ATZ",  type: "ATZ", coordinates: atibaia()  },
  { name: "Marte ATZ",    type: "ATZ", coordinates: marte()    },
  { name: "Sorocaba ATZ", type: "ATZ", coordinates: sorocaba() },
];

// Load existing, strip old ATZs, append new
const existing = JSON.parse(readFileSync(OUTPUT, 'utf8'));
const filtered  = existing.filter(a => a.type !== 'ATZ');
const result    = [...filtered, ...atzEntries];

writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf8');
console.log(`✅ Wrote ${result.length} airspaces (${atzEntries.length} corrected ATZs) → ${OUTPUT}`);
atzEntries.forEach(a => console.log(`   ${a.name}: ${a.coordinates.length} pts`));
