// ============================================================
// parse_sct_fixes.js - Optimized Fix Extraction with Tier Ranking
// ============================================================
// This script reads the EuroScope sector file and extracts fixes from the 
// [FIXES] section, while analyzing Airways and Procedures to assign 
// a "Tier" (importance ranking) to each waypoint.
//
// Tier 1: High Airways
// Tier 2: Low Airways
// Tier 3: SIDs/STARs (Terminal)
// Tier 4: Generic / Unused
// ============================================================

import { readFileSync, writeFileSync } from 'fs';

const SCT_FILE    = './public/data/Hong-Kong-Sector-File.sct';
const OUTPUT_FILE = './public/data/fixes_hk.json';

/**
 * Converts EuroScope DMS (N022.18.09.500) to Decimal Degrees.
 */
const _parseSctCoord = (raw) => {
  if (!raw || raw.length < 2) return null;
  const dir = raw[0].toUpperCase();
  const parts = raw.slice(1).split('.');
  if (parts.length < 3) return null;

  const deg = parseInt(parts[0], 10);
  const min = parseInt(parts[1], 10);
  const sec = parseFloat(parts.slice(2).join('.'));

  if (isNaN(deg) || isNaN(min) || isNaN(sec)) return null;

  const decimal = deg + min / 60 + sec / 3600;
  return (dir === 'S' || dir === 'W') ? -decimal : decimal;
};

/**
 * Creates a normalized string key for coordinates to allow for fuzzy matching.
 * We use 5 decimal places (approx 1.1 meter precision).
 */
const getCoordKey = (lat, lon) => {
  if (lat == null || lon == null) return null;
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
};

const run = () => {
  let content;
  try {
    content = readFileSync(SCT_FILE, 'utf8');
  } catch (err) {
    console.error(`[parse_sct_fixes] FATAL: Could not read ${SCT_FILE}: ${err.message}`);
    process.exit(1);
  }

  const lines = content.split(/\r?\n/);
  
  // Data structures
  const allFixes = new Map(); // ident -> { ident, lat, lon, tier, tipo: 'ICAO' }
  const idByCoord = new Map(); // coordKey -> ident (includes VORs/NDBs for lookup)
  
  let currentSection = '';

  console.log('[parse_sct_fixes] Phase 1: Building Coordinate Index...');

  // --- PASS 1: Build Master Index ---
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;

    if (line.startsWith('[')) {
      currentSection = line.toUpperCase();
      continue;
    }

    const parts = line.split(/\s+/);
    
    if (currentSection === '[FIXES]' && parts.length >= 3) {
      const ident = parts[0].toUpperCase();
      const lat = _parseSctCoord(parts[1]);
      const lon = _parseSctCoord(parts[2]);
      if (lat !== null && lon !== null) {
        const fix = { ident, lat: parseFloat(lat.toFixed(6)), lon: parseFloat(lon.toFixed(6)), tier: 4, tipo: 'ICAO' };
        allFixes.set(ident, fix);
        idByCoord.set(getCoordKey(lat, lon), ident);
      }
    } else if ((currentSection === '[VOR]' || currentSection === '[NDB]') && parts.length >= 4) {
      // We don't add VORs to fixes_hk.json, but we need them to resolve airway segments
      const ident = parts[0].toUpperCase();
      const lat = _parseSctCoord(parts[2]);
      const lon = _parseSctCoord(parts[3]);
      if (lat !== null && lon !== null) {
        idByCoord.set(getCoordKey(lat, lon), ident);
      }
    }
  }

  console.log(`[parse_sct_fixes] Indexed ${allFixes.size} fixes and ${idByCoord.size} total waypoints.`);
  console.log('[parse_sct_fixes] Phase 2: Analyzing usage for Tiers...');

  // --- PASS 2: Assign Tiers ---
  currentSection = '';
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;

    if (line.startsWith('[')) {
      currentSection = line.toUpperCase();
      continue;
    }

    const parts = line.split(/\s+/);

    const markTier = (ident, tier) => {
      const fix = allFixes.get(ident);
      if (fix && tier < fix.tier) {
        fix.tier = tier;
      }
    };

    const resolveAndMark = (rawCoord, tier) => {
      const lat = _parseSctCoord(rawCoord);
      if (lat === null) return;
      // We need to find the Lon too, but SCT format usually has them in pairs.
      // This is slightly complex since split(/\s+/) might have merged them or separated them.
      // But in Airways/SIDs they are always whitespace separated.
    };

    if (currentSection === '[HIGH AIRWAY]' || currentSection === '[LOW AIRWAY]') {
      const tier = currentSection === '[HIGH AIRWAY]' ? 1 : 2;
      // Format: NAME  LAT1 LON1 LAT2 LON2
      for (const p of parts) {
        const coord = _parseSctCoord(p);
        if (coord !== null) {
          // This is a coordinate. We need to match it.
          // Since we don't know if it's Lat or Lon, we check if it's Lat and then the next is Lon.
          // For simplicity, we just try to find ANY waypoint at this specific coordinate.
          // But wait, getCoordKey needs both.
          // Let's just scan all parts for potential coordinates.
        }
      }
      
      // More robust airway parsing:
      // A1  N022.36.15.001 E117.57.15.998 N022.19.59.998 E117.30.00.000
      for (let i = 1; i < parts.length; i++) {
        const lat = _parseSctCoord(parts[i]);
        const lon = _parseSctCoord(parts[i+1]);
        if (lat !== null && lon !== null) {
          const id = idByCoord.get(getCoordKey(lat, lon));
          if (id) markTier(id, tier);
          i++; // skip lon
        }
      }
    } else if (currentSection === '[SID]' || currentSection === '[STAR]') {
      // Procedures can have names OR coordinates.
      for (const p of parts) {
        const ident = p.toUpperCase();
        if (allFixes.has(ident)) {
          markTier(ident, 3);
        } else {
          // Check if it's a coordinate
          const lat = _parseSctCoord(p);
          if (lat !== null) {
            // Find lon (usually next part)
            const nextIdx = parts.indexOf(p) + 1;
            if (nextIdx < parts.length) {
              const lon = _parseSctCoord(parts[nextIdx]);
              if (lon !== null) {
                const id = idByCoord.get(getCoordKey(lat, lon));
                if (id) markTier(id, 3);
              }
            }
          }
        }
      }
    }
  }

  const results = Array.from(allFixes.values());
  const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  results.forEach(f => tierCounts[f.tier]++);

  console.log('[parse_sct_fixes] Tier Statistics:');
  console.log(`  Tier 1 (High Airways) : ${tierCounts[1]}`);
  console.log(`  Tier 2 (Low Airways)  : ${tierCounts[2]}`);
  console.log(`  Tier 3 (Procedures)   : ${tierCounts[3]}`);
  console.log(`  Tier 4 (Generic)      : ${tierCounts[4]}`);

  try {
    writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`[parse_sct_fixes] Success! Written ${results.length} fixes to ${OUTPUT_FILE}`);
  } catch (err) {
    console.error(`[parse_sct_fixes] FATAL: Could not write ${OUTPUT_FILE}: ${err.message}`);
  }
};

run();
