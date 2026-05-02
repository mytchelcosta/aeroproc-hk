// ============================================================
// Helpers.js - General-Purpose Utility Functions
// ============================================================
// This file contains small, reusable helper functions that don't
// logically belong to any specific module (map, data, or UI).
//
// Think of these as a toolbox — each tool does one simple job
// very well, and any other part of the app can import and use them.
// ============================================================

// This function converts a coordinate from DMS format
// (Degrees, Minutes, Seconds — how aviation data is typically expressed,
// e.g., 23°26'08"S) into a decimal number (e.g., -23.4355...)
// which is what the Leaflet map needs to place things accurately.
//
// Parameters:
//   degrees   (number): The whole-degree part, e.g. 23
//   minutes   (number): The minutes part, e.g. 26
//   seconds   (number): The seconds part, e.g. 8
//   direction (string): 'N', 'S', 'E', or 'W'
//
// Returns: A decimal number. South and West values are negative.
//          Returns null if the direction is invalid.
const convertDMSToDecimal = (degrees, minutes, seconds, direction) => {
  // Validate that the direction is one of the four compass points.
  const validDirections = ['N', 'S', 'E', 'W'];
  const dir = direction?.toUpperCase();

  if (!validDirections.includes(dir)) {
    console.error(
      `[Helpers] convertDMSToDecimal: Invalid direction "${direction}". ` +
      `Must be one of: N, S, E, W.`
    );
    return null;
  }

  // Standard formula: decimal = degrees + (minutes / 60) + (seconds / 3600)
  const decimal = degrees + minutes / 60 + seconds / 3600;

  // In the decimal coordinate system, South latitudes and West longitudes
  // are negative numbers (e.g., São Paulo is at roughly -23.43°, -46.47°).
  return (dir === 'S' || dir === 'W') ? -decimal : decimal;
};

// This function formats a radio frequency number into a readable string.
// For example: 119.1 becomes "119.100 MHz".
// Aviation frequencies are always shown with 3 decimal places.
//
// 'frequency' should be a number like 119.1 or 121.5.
// Returns a formatted string, or 'N/A' if the input is not a valid number.
const formatFrequency = (frequency) => {
  if (typeof frequency !== 'number' || isNaN(frequency)) {
    console.error(
      `[Helpers] formatFrequency: Expected a number but received "${frequency}" (type: ${typeof frequency}).`
    );
    return 'N/A';
  }

  // toFixed(3) always gives us 3 decimal places, e.g. 119.1 → "119.100"
  return `${frequency.toFixed(3)} MHz`;
};

// This function shortens a long string to fit within a maximum character limit.
// It adds "..." at the end to indicate the text was cut off.
// Useful for displaying long airport names in the compact sidebar UI.
//
// 'text' is the string to potentially shorten.
// 'maxLength' is the maximum number of characters allowed (including the "...").
// Returns the truncated string, or the original string if it's short enough.
const truncateText = (text, maxLength) => {
  if (typeof text !== 'string') {
    console.warn(
      `[Helpers] truncateText: Expected a string but received type "${typeof text}". Returning empty string.`
    );
    return '';
  }

  // If the text already fits, return it unchanged.
  if (text.length <= maxLength) return text;

  // Cut to (maxLength - 3) characters and append "..." to signal truncation.
  return text.slice(0, maxLength - 3) + '...';
};

// Calculates the great-circle distance in Nautical Miles between two geographic
// coordinates using the Haversine formula. This is the standard method used in
// aviation because it accounts for the curvature of the Earth.
//
// 'lat1', 'lon1' — start point in decimal degrees
// 'lat2', 'lon2' — end point in decimal degrees
// Returns: distance in Nautical Miles (1 NM = 1.852 km)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R    = 6371;   // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c    = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c) / 1.852;  // km → NM
};


// Calculates the initial true bearing in degrees (0–360) from point 1 to point 2.
// "True bearing" means the angle measured clockwise from true geographic North.
// This tells you: "if I stand at point 1 and look toward point 2, what direction am I facing?"
//
// Returns a number in the range [0, 360).
const calculateTrueBearing = (lat1, lon1, lat2, lon2) => {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const y  = Math.sin(Δλ) * Math.cos(φ2);
  const x  = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
};


// Converts a true bearing to a magnetic bearing by applying the local magnetic
// declination. Magnetic bearing is what a compass actually shows, and it is what
// ATC and pilots use in procedure design.
//
// Hong Kong TMA magnetic declination: approximately −3° West as of 2025.
// West declination means magnetic North is WEST of true North, so a pilot
// looking at their compass sees a higher number than the true bearing.
// Aviation memory aid: "Variation WEST, Magnetic BEST (largest)."
// Example: 074° True → 077° Magnetic (74 + 3 = 77).
//
// Phase 8.5.4 FIX — correct sign convention:
// The formula is Magnetic = True − Declination.
// With declination stored as a negative number for West (e.g. −3):
//   Magnetic = True − (−3) = True + 3  ✓
//
// 'trueBearing'  — angle from true North (0–360)
// 'declination'  — local magnetic declination in degrees (default: −3 for HK TMA,
//                  negative because it is a West declination)
// Returns: magnetic bearing in degrees (0–360)
const trueToMagnetic = (trueBearing, declination = -3) => {
  return ((trueBearing - declination) + 360) % 360;
};


export { convertDMSToDecimal, formatFrequency, truncateText, calculateDistance, calculateTrueBearing, trueToMagnetic };
