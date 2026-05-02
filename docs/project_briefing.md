# Project Briefing: AeroProc (Hong Kong)

## 1. Project Goal & Audience
**AeroProc** is a standalone, map-based instructional tool designed for Air Traffic Controllers (ATCs). It helps them visualize and learn published aviation procedures (SID, STAR, Approach) within the Hong Kong TMA (Terminal Control Area).

---

## 2. Technical Stack
- **Core**: HTML5, Vanilla JavaScript (ES6 Modules).
- **Styling**: Vanilla CSS (Modern aesthetics, dark glassmorphism theme).
- **Mapping**: [Leaflet.js](https://leafletjs.com/) (Rendering airways, waypoints, and airspaces).
- **Build Tool**: [Vite](https://vitejs.dev/) (Local development server and bundling).
- **Data Parsing**: [SheetJS (XLSX)](https://sheetjs.com/) and [PapaParse (CSV)](https://www.papaparse.com/).

---

## 3. Project Structure
```text
/
├── public/data/            # Data sources (JSON, CSV, TXT)
├── src/
│   ├── components/         # UI Logic (sidebar, modals, context menus)
│   ├── data/               # Data loaders and LocalStorage DB management
│   ├── map/                # Leaflet logic (MapCore, MapLayers, MeasuringTool)
│   ├── traffic/            # ADS-B Live Traffic integration
│   ├── state/              # DrawingState.js (Singleton for active procedures)
│   ├── styles/             # CSS Variables and Global layout
│   ├── utils/              # Math helpers (Distances, Bearings, Magnetic Declination)
│   └── main.js             # Application entry point and orchestrator
├── index.html              # Main shell with Floating Toolbar
└── PROJECT_STATUS.md       # Current progress tracking for HK
```

---

## 4. Current Progress
The Hong Kong migration is fully functional, with:
- **Interactive Map**: Centered on VHHH (Hong Kong Intl) with customized aviation iconography.
- **Procedure Builder**: 
    - **Snap-to-Fix**: Real-time snapping to the 34 native HK waypoints.
    - **Free-Draw**: Support for custom coordinate points and draggable markers.
    - **ATC Restrictions**: Support for Altitude and Speed restrictions using standard notation.
- **Measurement Tool**: "Measuring Vector" (Ruler) with live bearing/distance telemetry.
- **Live Traffic**: Calibrated ADS-B feed focusing on VHHH, VMMC, and ZGSZ traffic.
- **Airspace Overlays**: HK TMA, CTR, and ATZ boundaries implemented in `airspaces_aip.json`.

---

## 5. Core Logic Patterns
- **`MapLayers.js`**: The main rendering engine. Dynamically generates airspace polygons and waypoint markers.
- **`DrawingState.js`**: A centralized state object that manages the sequence of points in an active procedure.
- **`DataLoader.js`**: Handles regional filtering (300NM radius from VHHH) for global airport and navaid databases.
- **Coordinate Formats**: Internal logic uses Leaflet's `[lat, lon]` (Decimal Degrees).
- **Magnetic Declination**: Hardcoded to **3° West** for the Hong Kong area (`True Bearing + 3° = Magnetic Bearing`).

---

## 6. Data Sources
- `fixes_hk.json`: Localized RNAV fixes extracted from Hong Kong charts.
- `airspaces_aip.json`: Geometric boundaries for HK TMA/CTR/ATZ zones.
- `runways.json`: Threshold coordinates for VHHH, VMMC, and ZGSZ.
- `airports.csv` & `navaids.csv`: External databases filtered to the local region.
