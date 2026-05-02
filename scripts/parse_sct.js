import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const SCT_FILE = './public/data/Hong-Kong-Sector-File.sct';
const FIXES_OUTPUT = './public/data/fixes_hk.json';
const NAVAIDS_OUTPUT = './public/data/navaids_aip.json';

/**
 * Converts EuroScope format (N022.34.04.912) to Decimal Degrees.
 */
function parseSctCoord(raw) {
  if (!raw) return null;
  const dir = raw[0];
  const parts = raw.slice(1).split('.');
  if (parts.length < 3) return null;

  const deg = parseInt(parts[0], 10);
  const min = parseInt(parts[1], 10);
  const sec = parseFloat(parts.slice(2).join('.'));

  const decimal = deg + min / 60 + sec / 3600;
  return (dir === 'S' || dir === 'W') ? -decimal : decimal;
}

function parseSct() {
  console.log(`[SCT Parser] Reading ${SCT_FILE}...`);
  const content = readFileSync(SCT_FILE, 'utf8');
  const lines = content.split(/\r?\n/);

  const fixes = [];
  const navaids = [];
  let currentSection = '';

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith(';')) continue;

    if (line.startsWith('[')) {
      currentSection = line.toUpperCase();
      continue;
    }

    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;

    if (currentSection === '[FIXES]') {
      const ident = parts[0];
      const lat = parseSctCoord(parts[1]);
      const lon = parseSctCoord(parts[2]);
      if (lat !== null && lon !== null) {
        fixes.push({
          ident,
          lat: parseFloat(lat.toFixed(6)),
          lon: parseFloat(lon.toFixed(6)),
          tipo: "ICAO"
        });
      }
    } else if (currentSection === '[VOR]' || currentSection === '[NDB]') {
      if (parts.length < 4) continue;
      const ident = parts[0];
      const freq = parts[1];
      const lat = parseSctCoord(parts[2]);
      const lon = parseSctCoord(parts[3]);

      if (lat !== null && lon !== null) {
        navaids.push({
          ident,
          name: ident,
          type: currentSection === '[VOR]' ? "VOR/DME" : "NDB",
          frequency_mhz: currentSection === '[VOR]' ? parseFloat(freq) : parseFloat(freq) / 1000,
          lat: parseFloat(lat.toFixed(6)),
          lon: parseFloat(lon.toFixed(6)),
          source: "Hong-Kong-Sector-File.sct"
        });
      }
    }
  }

  // Deduplicate fixes (sometimes SCT files repeat fixes in different sections)
  const uniqueFixes = Array.from(new Map(fixes.map(f => [f.ident, f])).values());
  const uniqueNavaids = Array.from(new Map(navaids.map(n => [`${n.ident}|${n.type}`, n])).values());

  writeFileSync(FIXES_OUTPUT, JSON.stringify(uniqueFixes, null, 2));
  writeFileSync(NAVAIDS_OUTPUT, JSON.stringify(uniqueNavaids, null, 2));

  console.log(`✅ Extracted ${uniqueFixes.length} fixes to ${FIXES_OUTPUT}`);
  console.log(`✅ Extracted ${uniqueNavaids.length} NAVAIDs to ${NAVAIDS_OUTPUT}`);
}

parseSct();
