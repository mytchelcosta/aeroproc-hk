// convert_navaids.js
// Reads the Tabula-extracted CSV from AIP Brasil and outputs a clean navaids_aip.json
// Run with: node convert_navaids.js

import { readFileSync, writeFileSync } from 'fs';
import { calculateDistance } from '../src/utils/Helpers.js';

// ── Configuration ──────────────────────────────────────────────────────────────
const INPUT_FILE  = './public/data/tabula-navaids (AIP BRASIL)_2026-04-25.csv';
const OUTPUT_FILE = './public/data/navaids_aip.json';
const SBGR_LAT   = -23.4356;
const SBGR_LON   = -46.4731;
const MAX_NM     = 300;

// ── DMS → Decimal ──────────────────────────────────────────────────────────────
// Parses compact DDMMSS+direction strings like "224846S" or "0420543W"
function dmsToDecimal(raw) {
  raw = raw.trim();
  if (!raw || raw === 'NIL') return null;

  const dir = raw.slice(-1).toUpperCase();   // N, S, E, W
  const digits = raw.slice(0, -1);           // e.g. "224846" or "0420543"

  let deg, min, sec;
  if (dir === 'N' || dir === 'S') {
    // Latitude: DDMMSS (6 digits)
    deg = parseInt(digits.slice(0, 2), 10);
    min = parseInt(digits.slice(2, 4), 10);
    sec = parseInt(digits.slice(4, 6), 10);
  } else {
    // Longitude: DDDMMSS (7 digits)
    deg = parseInt(digits.slice(0, 3), 10);
    min = parseInt(digits.slice(3, 5), 10);
    sec = parseInt(digits.slice(5, 7), 10);
  }

  const decimal = deg + min / 60 + sec / 3600;
  return (dir === 'S' || dir === 'W') ? -decimal : decimal;
}

// ── Frequency parser ───────────────────────────────────────────────────────────
// Returns { value_mhz, raw } — NDB frequencies in KHZ are converted to MHz
function parseFrequency(raw) {
  raw = raw.trim().replace(/[\r\n]+/g, ' ');
  const mhz = raw.match(/(\d+(?:\.\d+)?)\s*MHZ/i);
  if (mhz) return parseFloat(mhz[1]);
  const khz = raw.match(/(\d+(?:\.\d+)?)\s*KHZ/i);
  if (khz) return parseFloat(khz[1]) / 1000;  // store in MHz for consistency
  return null;
}

// ── Elevation parser ───────────────────────────────────────────────────────────
function parseElevation(raw) {
  raw = raw.trim().replace(/[\r\n]+/g, ' ');
  const ft = raw.match(/(\d+(?:\.\d+)?)\s*FT/i);
  return ft ? parseFloat(ft[1]) : null;
}

// ── Type extractor ─────────────────────────────────────────────────────────────
// Extracts NAVAID type from the multi-line name cell (e.g. "VOR/DME", "NDB", "DME")
function extractType(nameLine) {
  const TYPES = ['DVOR/DME', 'VOR/DME', 'DVORDME', 'DVOME', 'VOR', 'NDB-DME', 'NDB', 'DME', 'LOC', 'GP'];
  for (const t of TYPES) {
    if (nameLine.toUpperCase().includes(t)) return t;
  }
  return 'NAVAID';
}

// ── Magnetic declination extractor ────────────────────────────────────────────
function extractDeclination(nameLine) {
  const match = nameLine.match(/\((\d+)°\s*W\)/i);
  return match ? -parseInt(match[1], 10) : null;   // West = negative
}

// ── HEADER ROW DETECTOR ───────────────────────────────────────────────────────
function isHeaderRow(cols) {
  const first = (cols[0] || '').toLowerCase();
  return (
    first.includes('nome da') ||
    first.includes('name of') ||
    first.trim() === '1'
  );
}

// ── MAIN PARSE LOOP ────────────────────────────────────────────────────────────
const raw = readFileSync(INPUT_FILE, 'utf8');

// Split into physical lines; we reconstruct CSV records manually
// because Tabula uses \r inside quoted cells but \r\n between records
const lines = raw.split(/\r?\n/);

const navaids = [];
const seen    = new Set();   // deduplicate by ident+type

for (const line of lines) {
  if (!line.trim()) continue;

  // Quick CSV split (handles simple quoted fields)
  const cols = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { cols.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cols.push(cur);

  if (cols.length < 5) continue;
  if (isHeaderRow(cols)) continue;

  const nameRaw  = (cols[0] || '').replace(/\r/g, ' ').trim();
  const ident    = (cols[1] || '').trim().toUpperCase();
  const freqRaw  = (cols[2] || '').replace(/\r/g, ' ').trim();
  const hoursRaw = (cols[3] || '').replace(/\r/g, ' ').trim();
  const coordRaw = (cols[4] || '').replace(/\r/g, '\n').trim();
  const elevRaw  = (cols[5] || '').replace(/\r/g, ' ').trim();

  if (!ident || ident.length < 2 || /^\d+$/.test(ident)) continue;

  // Coordinates are two lines: lat on first, lon on second
  const coordLines = coordRaw.split(/\n/).map(s => s.trim()).filter(Boolean);
  if (coordLines.length < 2) continue;

  const lat = dmsToDecimal(coordLines[0]);
  const lon = dmsToDecimal(coordLines[1]);
  if (lat === null || lon === null) continue;

  // Distance filter
  const dist = calculateDistance(SBGR_LAT, SBGR_LON, lat, lon);
  if (dist > MAX_NM) continue;

  const type         = extractType(nameRaw);
  const declination  = extractDeclination(nameRaw);
  const frequency    = parseFrequency(freqRaw);
  const elevation_ft = parseElevation(elevRaw);

  // Extract clean station name (first word group before the type token)
  const nameParts = nameRaw.split(/\s{2,}|\r/);
  const name      = (nameParts[0] || nameRaw).trim();

  // Deduplicate: same ident+type may appear multiple times (coverage remarks)
  const key = `${ident}|${type}`;
  if (seen.has(key)) continue;
  seen.add(key);

  navaids.push({
    ident,
    name,
    type,
    frequency_mhz: frequency,
    lat: parseFloat(lat.toFixed(6)),
    lon: parseFloat(lon.toFixed(6)),
    elevation_ft,
    mag_declination: declination,
    hours: hoursRaw || 'H24',
    source: 'AIP Brasil ENR 4.1 (Apr 2026)',
    dist_nm: parseFloat(dist.toFixed(1))
  });
}

// Sort alphabetically by ident
navaids.sort((a, b) => a.ident.localeCompare(b.ident));

writeFileSync(OUTPUT_FILE, JSON.stringify(navaids, null, 2), 'utf8');
console.log(`✅ Wrote ${navaids.length} NAVAIDs within ${MAX_NM}NM of SBGR → ${OUTPUT_FILE}`);
navaids.forEach(n =>
  console.log(`  ${n.ident.padEnd(5)} ${n.type.padEnd(8)} ${n.frequency_mhz?.toFixed(3) ?? '???'} MHz  ${n.dist_nm} NM  ${n.name}`)
);
