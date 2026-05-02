# Project Briefing: AeroProc (São Paulo)

## 1. Project Goal & Audience
**AeroProc** is a standalone, map-based instructional tool designed for Air Traffic Controllers (ATCs). It helps them visualize and learn published aviation procedures (SID, STAR, Approach) within the São Paulo TMA (Terminal Control Area).

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
├── MEDIA/                  # Data sources (XLSX, CSV, JSON, PDF)
├── src/
│   ├── components/         # UI Logic (sidebar, modals, context menus)
│   ├── data/               # Data loaders and LocalStorage DB management
│   ├── map/                # Leaflet logic (MapCore, MapLayers, MeasuringTool)
│   ├── state/              # DrawingState.js (Singleton for active procedures)
│   ├── styles/             # CSS Variables and Global layout
│   ├── utils/              # Math helpers (Distances, Bearings, Magnetic Declination)
│   └── main.js             # Application entry point and orchestrator
├── index.html              # Main shell with Floating Toolbar
└── implementation_plan.md  # Detailed technical roadmap (Currently at Phase 10.5)
```

---

## 4. Current Progress (Phase 10.5)
We have successfully implemented:
- **Interactive Map**: Centered on SBGR (Guarulhos) with specialized aviation icons.
- **Procedure Builder**: 
    - **Snap-to-Fix**: Click existing waypoints to build a route.
    - **Free-Draw**: Drop custom coordinate markers (draggable).
    - **ATC Restrictions**: Support for Altitude (Above/Below/At) and Speed restrictions with standard ATC notation.
    - **Holding Patterns**: "H" badges and inbound bearing/side parameters.
- **Measurement Tool**: A "Measuring Vector" (Ruler) with live telemetry and keyboard shortcuts (`O` for Origin, `F` for Final).
- **Global Search**: A unified search bar that pulses and highlights matching airports, fixes, and NAVAIDs across all layers.
- **Data Currency**: A manifest-based staleness warning system (`DATA_MANIFEST.json`).
- **Airspace Overlays**: Rendering of TMA sectors, CTRs, FIZs, and ATZs from `airspaces_aip.json`.

---

## 5. Active Task: Right Toolbar & Airspace Union
We are currently refining **Phase 10.5**, focusing on:
1.  **Right Toolbar**: A vertical floating toolbar with 3 buttons (Measuring, Objects, Airspaces) that open sub-panels to their left.
2.  **Airspace Logic**: 
    - **TMA Master Boundary**: Currently uses a Convex Hull, but needs to be changed to a **Union (Dissolve)** of specific sectors (1-8, 13) to match official charts.
    - **Layer Toggles**: Structured checkboxes for individual sectors and zones.

---

## 6. Core Logic Patterns for Developers
- **`MapLayers.js`**: The main rendering engine. Functions like `renderFixes` and `renderAirspaces` return LayerGroups.
- **`DrawingState.js`**: A centralized state object. Any change here usually triggers a call to `MapLayers.updateActiveShape()` and `sidebar.refreshSequenceList()`.
- **`DataLoader.js`**: Handles async fetching of diverse data formats.
- **Coordinate Formats**: Internal logic uses Leaflet's `[lat, lon]` (Decimal Degrees).
- **Magnetic Declination**: Hardcoded to ~22° West for the São Paulo area (`True - (-22) = True + 22`).

---

## 7. Immediate "Hiccups" to Address
- **TMA Outer Boundary**: Replacing the simple `_convexHull` with a logic that "dissolves" the boundaries of sectors 1, 2, 3, 4, 5, 6, 7, 8, and 13.
- **Transition System (Phase 11)**: Preparing for a "Bifurcation" system where procedures can branch (Inbound for STARs, Outbound for SIDs).

---

## 8. Data Sources Summary
- `waypoint_aisweb.xlsx`: 5-letter RNAV fixes.
- `airspaces_aip.json`: Geometric boundaries for airspaces (polygons).
- `runways.json`: Coordinates for thresholds of SBGR, SBSP, SBKP, etc.
- `airports.csv` & `navaids.csv`: External databases filtered to 300NM radius.
