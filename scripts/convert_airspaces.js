// convert_airspaces.js
// Parses the AISWEB airspaces.csv export and outputs a clean airspaces_aip.json
// Run with: node convert_airspaces.js

import { readFileSync, writeFileSync } from 'fs';

const INPUT  = './public/data/airspaces.csv';
const OUTPUT = './public/data/airspaces_aip.json';

// ── DMS → Decimal ─────────────────────────────────────────────────────────────
// Parses DDMMSS+dir or DDDMMSS+dir strings (e.g. "234635S", "0463411W")
function dms(raw) {
  raw = raw.trim();
  const dir = raw.slice(-1).toUpperCase();
  const d   = raw.slice(0, -1);
  let deg, min, sec;
  if (dir === 'N' || dir === 'S') {
    deg = parseInt(d.slice(0,2),10); min = parseInt(d.slice(2,4),10); sec = parseInt(d.slice(4,6),10);
  } else {
    deg = parseInt(d.slice(0,3),10); min = parseInt(d.slice(3,5),10); sec = parseInt(d.slice(5,7),10);
  }
  const v = deg + min/60 + sec/3600;
  return (dir==='S'||dir==='W') ? -v : v;
}

const DEG = Math.PI / 180;

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

// ── Parse coordinate chain ─────────────────────────────────────────────────────
// Input: "234635S 0463411W - 234244S 0452542W - ..."
// Output: [[lat,lon], [lat,lon], ...]
function parseCoords(line) {
  const coords = [];
  // Refined regex: look for the coordinate immediately preceding the "depois/then" or arc keywords
  const arcRegex = /([0-9]{6}[NS]\s+[0-9]{7}[EW])\s+(?:depois|then|ao\slongo|along).*?arco.*?sentido\s+(horário|anti-horário).*?([0-9]+(?:\.[0-9]+)?)\s*NM.*?centro.*?([0-9]{6}[NS]\s+[0-9]{7}[EW])/i;
  const arcMatch = line.match(arcRegex);

  if (arcMatch) {
    const startStr = arcMatch[1].trim().split(/\s+/);
    const isCW = arcMatch[2].toLowerCase() === 'horário';
    const radius = parseFloat(arcMatch[3]);
    const centerStr = arcMatch[4].trim().split(/\s+/);

    const startPt = [dms(startStr[0]), dms(startStr[1])];
    const centerPt = [dms(centerStr[0]), dms(centerStr[1])];

    const remaining = line.slice(arcMatch.index + arcMatch[0].length);
    const nextMatch = remaining.match(/([0-9]{6}[NS]\s+[0-9]{7}[EW])/);
    
    let endPt = null;
    if (nextMatch) {
      const endStr = nextMatch[1].trim().split(/\s+/);
      endPt = [dms(endStr[0]), dms(endStr[1])];
    } else {
      const firstMatch = line.match(/([0-9]{6}[NS]\s+[0-9]{7}[EW])/);
      if (firstMatch) {
        const firstStr = firstMatch[1].trim().split(/\s+/);
        endPt = [dms(firstStr[0]), dms(firstStr[1])];
      }
    }

    if (endPt) {
      const startB = bearing(centerPt[0], centerPt[1], startPt[0], startPt[1]);
      const endB = bearing(centerPt[0], centerPt[1], endPt[0], endPt[1]);
      const generatedArc = arcPoints(centerPt[0], centerPt[1], radius, startB, endB, isCW, 32);
      coords.push(...generatedArc);
    }

    line = line.replace(arcRegex, "");
  }

  const points = line.trim().split(/\s*-\s*/);
  for (const pt of points) { 
    const m = pt.trim().match(/^(\d{6}[NS])\s+(\d{7}[EW])$/); 
    if (m) coords.push([dms(m[1]), dms(m[2])]); 
  }
  return coords;
}

// ── Classify airspace type ─────────────────────────────────────────────────────
function classifyType(name) {
  if (/\bTMA\b/i.test(name)) return 'TMA';
  if (/\bCTR\b/i.test(name)) return 'CTR';
  if (/\bATZ\b/i.test(name)) return 'ATZ';
  if (/\bFIZ\b/i.test(name)) return 'FIZ';
  if (/\bFIR\b/i.test(name)) return 'FIR';
  return 'OTHER';
}

// ── Main parser ────────────────────────────────────────────────────────────────
const raw   = readFileSync(INPUT, 'utf8');
const lines = raw.split('\n').map(l => l.replace(/\r$/, ''));

const airspaces = [];
let i = 0;

while (i < lines.length) {
  const line = lines[i];

  // Detect airspace header: a quoted name containing TMA/CTR/ATZ/FIZ/FIR
  const nameMatch = line.match(/^"((?:TMA|CTR|ATZ|FIZ|FIR)[^"]*)/i) ||
                    line.match(/^"([^"]*(?:TMA|CTR|ATZ|FIZ|FIR)[^"]*)/i);

  if (nameMatch) {
    const name = nameMatch[1].trim();
    const type = classifyType(name);

    // Scan the next few lines for coordinate chain
    let coords = [];
    for (let j = i+1; j < Math.min(i+5, lines.length); j++) {
      const candidate = lines[j];
      if (candidate.match(/\d{6}[NS]\s+\d{7}[EW]/)) {
        coords = parseCoords(candidate);
        break;
      }
    }

    if (coords.length >= 3) {
      // Skip ATZ entries — those are handled with arc geometry by generate_atz_circles.js
      if (type !== 'ATZ') airspaces.push({ name, type, coordinates: coords });
    }
  }

  i++;
}

// Re-append corrected ATZ entries from the JSON (if already generated)
try {
  const existing = JSON.parse(readFileSync(OUTPUT, 'utf8'));
  const atzEntries = existing.filter(a => a.type === 'ATZ');
  airspaces.push(...atzEntries);
  if (atzEntries.length) console.log(`  Preserved ${atzEntries.length} ATZ entries from previous generate_atz_circles.js run`);
} catch {}

writeFileSync(OUTPUT, JSON.stringify(airspaces, null, 2), 'utf8');
console.log(`✅ Wrote ${airspaces.length} airspaces → ${OUTPUT}`);
airspaces.forEach(a =>
  console.log(`  ${a.type.padEnd(5)} ${a.name.padEnd(30)} (${a.coordinates.length} pts)`)
);
