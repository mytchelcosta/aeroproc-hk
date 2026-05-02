import Papa from 'papaparse';

/**
 * Parses DMS (Degrees, Minutes, Seconds) coordinate format.
 * Examples:
 * - 22°39'49"S / 047°19'04"W
 * - 22°49'15''S/047°11'47''W
 * 
 * @param {string} dmsStr - The combined lat/lon string.
 * @returns {{lat: number, lon: number} | null}
 */
function parseDms(dmsStr) {
    if (!dmsStr) return null;
    
    // Clean up escaping and normalize single/double quotes for seconds
    const cleanStr = dmsStr.replace(/""/g, '"').replace(/''/g, '"');
    const parts = cleanStr.split('/').map(p => p.trim());
    if (parts.length !== 2) return null;

    const parsePart = (str) => {
        // Match degrees, minutes, and optional seconds
        // Pattern: (degrees)°(minutes)'[(seconds)"](N|S|E|W)
        const match = str.match(/(\d+)°(\d+)'(?:(\d+)")?([NSEW])/);
        if (!match) return null;
        
        const d = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const s = match[3] ? parseInt(match[3], 10) : 0;
        const dir = match[4];
        
        let dd = d + (m / 60) + (s / 3600);
        if (dir === 'S' || dir === 'W') dd = -dd;
        return dd;
    };

    const lat = parsePart(parts[0]);
    const lon = parsePart(parts[1]);
    
    if (lat === null || lon === null) return null;
    return { lat, lon };
}

/**
 * Parses DDM (Degrees, Decimal Minutes) coordinate format.
 * Example: S23 30.13, W46 41.92
 * 
 * @param {string} latStr - Latitude string (e.g., S23 30.13)
 * @param {string} lonStr - Longitude string (e.g., W46 41.92)
 * @returns {{lat: number, lon: number} | null}
 */
function parseDdm(latStr, lonStr) {
    if (!latStr || !lonStr) return null;

    const parsePart = (str) => {
        // Pattern: (N|S|E|W)(degrees) (decimal minutes)
        const match = str.trim().match(/([NSEW])(\d+)\s+([\d.]+)/);
        if (!match) return null;
        
        const dir = match[1];
        const d = parseInt(match[2], 10);
        const m = parseFloat(match[3]);
        
        let dd = d + (m / 60);
        if (dir === 'S' || dir === 'W') dd = -dd;
        return dd;
    };

    const lat = parsePart(latStr);
    const lon = parsePart(lonStr);
    
    if (lat === null || lon === null) return null;
    return { lat, lon };
}

/**
 * Loads REA (Special Aircraft Routes) waypoints from CSV.
 * @returns {Promise<Array>}
 */
export const loadReaWaypoints = async () => {
    try {
        const baseUrl = import.meta.env.BASE_URL || './';
        const response = await fetch(`${baseUrl}data/CCV/rea_waypoints.csv`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const text = await response.text();
        const result = Papa.parse(text, {
            header: true,
            skipEmptyLines: true
        });
        
        return result.data.map(row => {
            const coords = parseDdm(row.Latitude, row.Longitude);
            return {
                type: row.Type, // PORTÃO or POSIÇÃO
                name: row.Name,
                lat: coords?.lat,
                lon: coords?.lon
            };
        }).filter(wp => wp.lat !== undefined);
    } catch (err) {
        console.error('[VfrDataLoader] Failed to load REA waypoints:', err);
        return [];
    }
};

/**
 * Loads REA corridor segments from CSV.
 * @returns {Promise<Array>}
 */
export const loadReaSegments = async () => {
    try {
        const baseUrl = import.meta.env.BASE_URL || './';
        const response = await fetch(`${baseUrl}data/CCV/rea_corridors_segments.csv`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const text = await response.text();
        const result = Papa.parse(text, {
            header: true,
            skipEmptyLines: true
        });

        // Group segments by route name to build continuous paths later if needed,
        // but for now, we just return the raw segment data as requested.
        return result.data.map(row => {
            const coordsA = parseDms(row.Point_A_Coordinates);
            const coordsB = parseDms(row.Point_B_Coordinates);

            return {
                routeName: row.Route_Name,
                pointA: { 
                    name: row.Point_A_Name, 
                    lat: coordsA?.lat, 
                    lon: coordsA?.lon 
                },
                pointB: { 
                    name: row.Point_B_Name, 
                    lat: coordsB?.lat, 
                    lon: coordsB?.lon 
                },
                headingAB: row.Direction_A_to_B_Heading,
                altitudeAB: row.Direction_A_to_B_Altitudes,
                headingBA: row.Direction_B_to_A_Heading,
                altitudeBA: row.Direction_B_to_A_Altitudes
            };
        }).filter(seg => seg.pointA.lat !== undefined && seg.pointB.lat !== undefined);
    } catch (err) {
        console.error('[VfrDataLoader] Failed to load REA segments:', err);
        return [];
    }
};

/**
 * Loads REH (Helicopter Routes) fixes from CSV.
 * @returns {Promise<Array>}
 */
export const loadRehFixes = async () => {
    try {
        const baseUrl = import.meta.env.BASE_URL || './';
        const response = await fetch(`${baseUrl}data/CCV/reh_fixes_helicopter.csv`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const text = await response.text();
        const result = Papa.parse(text, {
            header: true,
            skipEmptyLines: true
        });

        return result.data.map(row => {
            const coords = parseDms(row.Coordinates);
            return {
                aerodrome: row.Aerodrome,
                gateNumber: row['Gate Number'],
                name: row['Gate Name'],
                lat: coords?.lat,
                lon: coords?.lon
            };
        }).filter(wp => wp.lat !== undefined);
    } catch (err) {
        console.error('[VfrDataLoader] Failed to load REH fixes:', err);
        return [];
    }
};

/**
 * Comprehensive VFR data loader for Phase 39.
 */
export const loadVfrData = async () => {
    const [reaWaypoints, reaSegments, rehFixes] = await Promise.all([
        loadReaWaypoints(),
        loadReaSegments(),
        loadRehFixes()
    ]);

    return {
        reaWaypoints,
        reaSegments,
        rehFixes
    };
};
