# Implementation Plan: AeroProc (São Paulo)

## 1. Foundational Architecture
Based on the reference application (AeroProc HKIA), this application will be a map-based web application for aviation procedures, specifically tailored for the São Paulo airspace. It will use the provided ICAO data files (in the `MEDIA` folder).

**Technology Stack:**
- **Core:** HTML5, Vanilla JavaScript (ES6 Modules)
- **Styling:** Vanilla CSS (CSS Variables for theming, responsive design, and dynamic aesthetics)
- **Mapping:** Leaflet.js (for rendering airway maps, waypoints, and procedures)
- **Build Tool:** Vite (for modular development and local dev server)

## 2. Folder Structure
We will adopt a modular structure to keep the codebase maintainable, separating UI logic from map rendering and data processing.

```text
/
├── index.html              # Main HTML entry point
├── package.json            # Project dependencies and scripts
├── public/                 # Static assets (Not processed by Vite)
│   └── data/              # Existing data files (ICAO txts, xlsx, etc.)
└── src/                    # Source code
    ├── main.js             # Main application bootstrapper
    ├── styles/
    │   ├── variables.css   # Design tokens (colors, fonts, shadows)
    │   └── main.css        # Global styles and layout
    ├── components/         # UI Components
    │   └── Sidebar.js      # PascalCase standardized
    ├── scripts/            # Data processing and generation scripts
    │   ├── convert_airspaces.js
    │   ├── convert_navaids.js
    │   └── generate_atz_circles.js
    ├── map/                # Leaflet map logic
    │   ├── MapCore.js      # Map initialization and tile layers
    │   └── MapLayers.js    # Logic for rendering fixes, SIDs, STARs
    ├── data/               # Data loading and parsing
    │   └── DataLoader.js   # Fetching and parsing the TXT/XLSX files
    └── utils/              # Helper functions
        └── Helpers.js      # PascalCase standardized
```

## 3. Step-by-Step Instructions to Build Foundation

1. **Initialize the Project**
   - Scaffold a Vanilla JS project using Vite.
   - Clean up default boilerplate to prepare for our custom architecture.

2. **Set up Global Styles**
   - Create `src/styles/variables.css` using the aviation-inspired color palette from the reference (e.g., `--color-sid`, `--color-star`, `--color-iac`, `--bg-primary`, etc.).
   - Create `src/styles/main.css` for the base layout (`#root`, full-screen map, sidebar container).

3. **Establish 'Hello World' HTML Shell**
   - Configure `index.html` with necessary CDN links (Leaflet CSS/JS, Google Fonts like Inter and JetBrains Mono).
   - Create a basic DOM structure: a sidebar `div` and a map `div`.

4. **Implement Map and UI Bootstrapping**
   - Create `src/map/MapCore.js` to initialize a basic Leaflet map centered on São Paulo (SBGR).
   - Create `src/main.js` to import styles, instantiate the map, and confirm the architecture is running.

5. **Migrate/Connect Data Assets**
   - Ensure the `MEDIA` folder is accessible by the application so that `DataLoader.js` can eventually fetch the ICAO databases.

## 4. Phase 2: Data Parsing & Waypoint Plotting

1. **Install Excel Parser**
   - Install the `xlsx` package via `npm install xlsx` to allow client-side parsing of the `waypoint_aisweb.xlsx` file.
   
2. **Implement Data Parsing (`DataLoader.js`)**
   - Write a function to fetch the `waypoint_aisweb.xlsx` file via the `/MEDIA` endpoint.
   - Use the `xlsx` library to parse the Excel buffer into a clean array of JavaScript objects representing the waypoints (Fixes).
   - *Optimization:* Filter the waypoints to only include those within the bounding box of the São Paulo TMA (approx Lat: -22.0 to -25.0, Lng: -45.0 to -48.0) to maintain high rendering performance.

3. **Plot Waypoints on the Map (`MapLayers.js`)**
   - Implement the `renderFixes` function to iterate through the parsed waypoints.
   - Use Leaflet `L.circleMarker` to draw them on the map.
   - Add tooltips/popups showing the Waypoint ID (e.g., `MUKUS`) when hovered or clicked.

4. **Add UI Controls (`Sidebar.js`)**
   - Add a "Layers" section in the sidebar.
   - Create a toggle switch or checkbox to turn the "Waypoints" map layer on and off.

## 5. Phase 3: Advanced Procedure & Area Builder UI

To accommodate São Paulo Area standards, we must upgrade the Builder into a multi-layered tool that handles SIDs, STARs, IACs, and Airspace Areas (CTR, FIS, TMA, ATZ) with customizable styles and restrictions.

1. **Multilayered Sidebar UI (`Sidebar.js` & `styles/main.css`)**
   - Refactor the sidebar to use a **Submenu Architecture** (e.g., Main Menu -> "Create New" -> Select Type: "Route Procedure" vs "Airspace Area").
   - **Procedure/Area Metadata Form:** Before drawing, the user must select:
     - **Type:** Dropdown (SID, STAR, IAC, CTR, FIS, TMA, ATZ, etc.).
     - **Line Pattern:** Dropdown (Continuous `solid`, Intermittent `dashed`, Dotted `dotted`).
     - **Color Scheme:** Color picker or preset buttons for standard SP Area colors.

2. **Dual-Mode Drawing System (`MapLayers.js` & `main.js`)**
   - Implement a drawing state machine with two modes:
     - **Snap-to-Fix Mode (Routes):** Clicking a rendered `L.circleMarker` adds the waypoint to the sequence.
     - **Free-Draw Mode (Areas/Custom Points):** Clicking anywhere on the map captures the Lat/Lng and adds a custom point. Include a UI input to manually type coordinates.
   - For Area types (CTR, TMA, etc.), draw an `L.polygon` that closes the shape.
   - For Procedure types (SID/STAR/IAC), draw an `L.polyline` connecting the sequence.
   - Apply the selected Line Pattern and Color to the Leaflet shape dynamically.

3. **Waypoint/Point Restrictions Prompt (`Sidebar.js` & `main.js`)**
   - Whenever a point (fix or free-click) is added to the active sequence, immediately trigger a prompt/modal.
   - **Fields to capture:** Level Restriction (e.g., "FL100", "Above 5000") and Speed Restriction (e.g., "Max 250kt").
   - Display these restrictions in the Sidebar's sequence list under the specific waypoint, similar to the HK reference draft.

4. **Export Engine (`Sidebar.js`)**
   - Add a "Save/Export" button at the bottom of the Builder UI.
   - Generate a comprehensive JSON object containing: Name, Type, Line Style (pattern/color), and the array of points (with their Lat/Lng, Fix Name, Level, and Speed restrictions).
   - Log this JSON for easy copying into the permanent database.

## 6. Phase 4: Main Menu Refactoring & Visibility Rules

1. **Top-Level Tabs (View vs Builder) (`Sidebar.js`)**
   - Redesign the root Sidebar into two primary Tabs or Main Sections:
     - **"View" Tab:** For viewing existing/saved procedures.
     - **"Builder" Tab:** For creating new procedures/areas (the UI from Phase 3).

2. **Waypoint Visibility Logic (`MapLayers.js` & `main.js`)**
   - **Default State:** Do NOT show all fixes on the map by default.
   - **View Mode:** Fixes should only appear if a currently viewed procedure explicitly references them.
   - **Builder Mode:** When the user enters the "Builder" tab (or specifically selects "Create Route"), turn the fixes layer ON so they can click them to build the route.
   - If the user switches back to "View" mode, hide the global fixes layer again.

3. **Tooltip Cleanup (`MapLayers.js`)**
   - Remove the unnecessary "ICAO" or "Terminal" text from the waypoint popups/tooltips. Only the Waypoint ID (e.g., `MUKUS`) is relevant and should be displayed.

## 7. Phase 5: Runway Thresholds & Automated Restrictions

1. **Runway Thresholds (`DataLoader.js` & `MapLayers.js`)**
   - The Architect has generated a hardcoded, precise `src/data/runways.json` file containing the exact Decimal Degree coordinates for SBGR, SBSP, and SBKP runway thresholds.
   - Import or fetch this `runways.json` file instead of parsing `ICAO_Airports.txt`.
   - Render these thresholds on the map as clickable points, styling them distinctly (e.g., as small runway icons or different colored blubs) so they can be selected as the start/end points of procedures.

2. **Automated Restrictions Formatting (`Sidebar.js`)**
   - Upgrade the Level/Speed prompt modal to include dropdowns for the *condition* (At, Above, Below, At Least, Less Than).
   - Automatically format the visual output in the sidebar (and the JSON export) based on ATC standards:
     - **Altitude Above:** Add an underline (e.g., `<u>FL100</u>`).
     - **Altitude Below:** Add an overline (e.g., `<span style="text-decoration: overline">FL100</span>`).
     - **Altitude At:** Plain text (e.g., `FL100`).
     - **Speed At Least:** Prefix with `>` (e.g., `>250kt`).
     - **Speed Less Than:** Prefix with `<` (e.g., `<250kt`).
     - **Speed At:** Prefix with `@` (e.g., `@250kt`).

3. **True Map-Click Free-Draw (`MapLayers.js` & `main.js`)**
   - Ensure the "Free-Draw Mode" explicitly uses a Leaflet map click listener (`map.on('click', ...)`).
   - Clicking anywhere on the map must instantly capture the coordinates, drop a custom point, and prompt for restrictions, rather than forcing the user to manually type coordinates into an input box.

## 8. Phase 6: Intelligent Waypoint Search & Highlighting

1. **Search Bar Integration (`Sidebar.js`)**
   - Add a real-time "Search Waypoint" input field at the top of the Procedure Builder section.
   - This search bar should actively filter the rendered waypoints on the map as the user types.

2. **Faded Default Styling (`styles/main.css` & `MapLayers.js`)**
   - Update the CSS so that when the user is in Builder mode, all waypoint markers (blubs) and their labels are displayed very faintly (low opacity, almost transparent) by default. This prevents the map from becoming visually overwhelming.
   - Ensure the waypoint names/labels are permanently visible (not just on hover), but kept faded.

3. **Dynamic Filtering & Highlighting (`MapLayers.js`)**
   - As the user types in the search bar, instantly update the opacity and styling of the map markers.
   - Waypoints that **match** the typed string should become fully opaque, bright, and highly visible (both the blub and the text label).
   - Waypoints that **do not match** should be completely hidden (or kept at the barely-visible faded state).
   - **CRITICAL FIX:** Any waypoint that has *already been added* to the active procedure sequence must ALWAYS remain fully opaque, highlighted, and have its label visible, regardless of what is typed in the search bar. This provides a clear visual trail of the procedure currently being built.

## 9. Phase 7: Database Management & UX Bug Fixes

Before building new measurement or editing tools, fix the following bugs and refine the UX based on recent tests:

1. **Duplicate Fix Warning (`Sidebar.js` & `main.js`)**
   - If the user tries to add the exact same fix consecutively or redundantly into the active sequence, trigger a warning prompt (e.g. a `confirm()` dialog) asking "Are you sure you want to add this fix again?". If they confirm, allow the addition; do not strictly block it.

2. **Permanent Fix Rendering (`MapLayers.js`)**
   - **Builder Mode:** Any fix already added to the procedure must ALWAYS show its circle marker (blub) and its name permanently on the map, overriding the faded state. The Restrictions (Level/Speed) assigned to that fix must also be displayed as a permanent label.
   - **Viewer Mode:** When a procedure is selected/displayed, BOTH the circle markers (blubs) and their permanent text labels/restrictions must become fully visible on the map. 

3. **Advanced Search Highlighting (`MapLayers.js` & `styles/main.css`)**
   - Improve the search filter: When a user types a letter (e.g., "L"), the highlighted waypoints must look distinctly different from the "already added" waypoints in the active procedure.
   - **Substring Highlighting:** The specific letters typed by the user must visually glow or be bolded *inside* the waypoint's text label on the map.

4. **Measurement Display Tweak (`MapLayers.js`)**
   - Remove the "M" after the `Âº` sign when displaying magnetic bearing.

5. **Procedure Metadata Requirement (`Sidebar.js`)**
   - **Airport & Runway Association:** When creating a new procedure, add required dropdowns/inputs for **Airport** (e.g., SBGR) and **Runway(s)** (e.g., 10L/28R). This metadata is crucial for enabling advanced filtering later.

6. **Database Management & UI Modes (`Sidebar.js` & `DataLoader.js`)**
   - **Builder Mode UI:** Below the "New Procedure" box, create a "Saved Procedures" management section. This list must include **Edit**, **Display (View/Hide)**, and **Delete** buttons for each saved procedure.
   - **Viewer Mode UI:** In the separate "View" tab, users can only Search/Filter and View/Hide procedures. **Deleting must be strictly disabled/hidden in Viewer mode.**
   - **Save State Transition:** Clicking "Save" must instantly clear the map's current drawing, reset the builder sequence, and immediately inject the new procedure into the Saved Procedures list.
   - **Map Clearing Logic (Hide & Delete):** Fix the bugs where clicking the "Hide" (eye) button in Viewer mode, or clicking "Delete" in Builder mode, fails to remove the procedure's polylines, fix labels, and markers. These actions must completely and persistently wipe the associated visual layers from the map.

## 10. Phase 7.5: Critical QA & Visual Overhaul

Based on testing feedback, execute these critical visual and logic fixes before moving to holding patterns:

1. **Airport Icons & Thresholds Database (`DataLoader.js`, `MapLayers.js`, & `styles/main.css`)**
   - Replace the default blue pin for Airports with a small, clean black airplane icon.
   - **Label Centering:** Fix the CSS/Leaflet icon alignment logic so the airport text label (e.g., "SBGR") is perfectly centered relative to its respective airplane icon.
   - Establish a robust internal data structure for the area airports. **CRITICAL DATA CORRECTIONS:**
     - SBJH is Catarina (São Roque).
     - SDOI is Boituva.
     - SDTB is Atibaia.
     - SDAI is Americana.
     - SDAM is Amarais.
     - Add SBTA (Taubate) to the database.
   - Full target list: SBGR, SBSP, SBKP, SBSJ, SBMT, SBJD, SBJH, SDCO, SDAM, SDAI, SBST, SBBP, SDTB, SDOI, SDPW, SBTA.
   - Ensure these airports and their thresholds act as selectable POIs.
   
2. **Viewer Mode Interaction & Highlighting (`MapLayers.js`)**
   - Remove the default white Leaflet popups when clicking a fix.
   - **Highlighting:** Clicking a fix should visually highlight it (e.g., a glowing effect or color change). Clicking an empty area on the map de-highlights it.
   - **Multi-Select:** Holding `Ctrl` + Clicking allows multiple fixes to be highlighted simultaneously.
   
3. **Map-Click Free-Draw UX (`Sidebar.js` & `MapLayers.js`)**
   - Add a clear "Drop Custom Point" toggle button. When active, simply clicking anywhere on the map captures the Lat/Lng and drops a point, without forcing manual coordinate typing.
   
4. **Custom Right-Click Context Menu (`MapLayers.js`)**
   - Implement a custom right-click menu in Builder mode to consolidate point actions (e.g., "Remove Point", "Edit Restrictions").
   
5. **Geometry & Ghost-Layer Bug Fixes (`MapLayers.js`)**
   - **White Rectangle Bug:** Prevent the default white rectangle geometry from rendering when clicking a drawn procedure.
   - **Ghost Lines Bug:** Ensure that deleting a procedure from the list strictly calls `map.removeLayer()` on the polylines, completely erasing them from the map.
   - **Builder Hide Bug:** Fix the logic so that toggling "Hide" on a procedure in the Builder list removes *both* the points and the lines connecting them.

## 11. Phase 8: Editing Workflows, Measurement, & Holdings

1. **Procedure Editing & Master Lock (`Sidebar.js` & `main.js`)**
   - **Master Lock:** Add a "Lock/Unlock" toggle in the UI to prevent accidental modifications to saved procedures.
   - **Edit Mode Integration:** When unlocked, allow the user to load a saved procedure into the Builder UI to modify it.
   - **Sequence Reordering:** Within the Builder's waypoint list, add "Up" and "Down" arrows (or drag-and-drop functionality) so the user can easily reorder the sequence of the procedure.
   - **Waypoint-Level Editing:** Add a small "Edit" (pencil) icon next to each waypoint in the active sequence list. Clicking this re-opens the Restriction Prompt modal.

2. **Holding Pattern Definitions (`Sidebar.js` & `MapLayers.js`)**
   - **Modal Update:** Inside the restriction prompt modal, add a "HOLDING POINT" checkbox.
   - **Holding Parameters:** If checked, dynamically show two new input fields:
     - **Inbound Leg Bearing:** (e.g., `090Âº`)
     - **Side of Turn:** Dropdown (`LEFT` or `RIGHT`)
   - **Map Rendering:** If a waypoint is designated as a holding point, render a subtly stylized "H" icon/marker on the map next to the fix, alongside the inbound bearing and turn direction (e.g., `H: 090Âº RIGHT`).

3. **Distance & Heading Measurement (`MapLayers.js`)**
   - **Calculations:** As a procedure route is drawn, calculate the magnetic heading and distance (in nautical miles) between each consecutive waypoint in the sequence.
   - **Floating Map Text:** Display this calculated data directly on the map, positioned along the polyline segments.
   - **Aesthetics:** Prioritize clean, floating text with slight transparency. **Do not use solid background boxes or heavy borders**—the text must blend smoothly with the map to prevent clutter.
   - **Toggle Visibility:** Add a toggle in the UI (perhaps in the View or Layers tab) to turn these measurement labels on and off.

4. **Draggable Custom Points (`MapLayers.js` & `main.js`)**
   - **Interactivity:** Allow any manually dropped custom point (created via Free-Draw or Drop Custom Point) to be draggable on the map while in Builder/Edit Mode.
   - **Live Updates:** As the user clicks and drags the point, dynamically update the procedure's polyline routes and any distance/heading measurement labels connected to it in real-time.
   - **State Sync:** When the drag is released (`dragend` event), update the point's new coordinates in `DrawingState` so it saves correctly. Standard fixed waypoints (like parsed intersections) must remain locked and un-draggable.

## 11.5 Phase 8.5: UX Refinements & Magnetic Declination

Before moving on to the Measuring Vector Tool, execute these critical bug fixes and enhancements based on UX feedback:

1. **Builder Default Locked State (`Sidebar.js` & `DrawingState.js`)**
   - The Builder Mode must initialize with the "Master Lock" enabled by default to prevent accidental edits.

2. **Remove CSS Geometry Outline (`styles/main.css`)**
   - Clicking a procedure line in Viewer mode causes the browser to draw a white focus rectangle around the SVG path. Add `outline: none;` to `.leaflet-interactive:focus` or the global leaflet container to prevent this.

3. **Viewer Mode Holding Redundancy (`MapLayers.js`)**
   - In Viewer Mode, the map currently displays the "H" icon badge AND the text "H: [Bearing] [Side]" inside the waypoint label. Remove the text string from the waypoint label so only the clean "H" badge is visible, avoiding visual clutter.

4. **Magnetic Declination Correction (`utils/Helpers.js`)**
   - The `trueToMagnetic` function is incorrectly calculating magnetic bearing by using `true + declination` where `declination = -22`. This results in subtracting 22 instead of adding it.
   - For a West declination (e.g., 22Â° W), the formula must be `Magnetic = True - Declination` (so `True - (-22)` becomes `True + 22`). Fix the math so `074Â° True` correctly becomes `096Â° Magnetic`.

5. **Viewer Mode Leg Measurements (`MapLayers.js`)**
   - Leg measurements (heading & distance strings floating on the polyline) currently only render in Builder mode.
   - Refactor the measurement rendering logic so that when a user selects a saved procedure in Viewer mode, its specific leg measurements are generated and drawn alongside the route lines.

6. **Magnetic Compass Rose Overlay (`MapCore.js` or `main.js`)**
   - Since the map tiles are fixed to True North, add a visual Magnetic Compass Rose overlay (e.g., in a corner of the screen) that permanently illustrates the local magnetic declination (~22Âº West tilt).
   - This provides a constant visual anchor, reminding the user that 090Âº Magnetic does not point perfectly right on the screen.

## 12. Phase 9: Measuring Vector Tool

1. **Standalone Measuring Tool (`MapLayers.js` & `main.js`)**
   - Add a global "Measuring Vector" tool toggle button, accessible in both Viewer and Builder modes.
   - When activated, it overrides standard map clicking behaviors.

2. **Dynamic Vector Drawing (`MapLayers.js`)**
   - **First Click (Origin Node):** Clicking anywhere on the map or on a waypoint drops the origin node of the vector.
   - **Cursor Tracking:** As the user moves the mouse across the map, dynamically draw a line connecting the origin node to the live cursor position.
   - **Live Telemetry:** Attach a tooltip/label to the cursor (or mid-line) that actively updates with:
     - Distance from the origin (e.g., `24.5 NM`).
     - Relative magnetic bearing from the origin (e.g., `175Âº`).
   - **Second Click (Destination Node):** Clicking a second time fixes the destination node in place, leaving the drawn vector line and its telemetry permanently visible on the map.

3. **Vector Persistence & Management (`MapLayers.js`)**
   - **Persistence:** Drawn Measuring Vectors must remain on the map even if the user toggles the MV tool off or switches between Viewer/Builder tabs.
   - **Quick Reactivation:** If the MV tool is currently off, clicking on any existing Measuring Vector line should instantly re-activate the tool.
   - **Selective Deletion:** Right-clicking an existing measuring vector should trigger a small context popup with two options:
     - **"Delete Vector"**: Removes only that specific line.
     - **"Clear All Vectors"**: Removes every measuring line from the map.

## 13. Phase 9.5: Measuring Tool Toolbar & Shortcuts

1. **Clean Up Helper Text (`Sidebar.js`)**
   - Remove the redundant string `"Type below to filter waypoints, then click one to add it."` from the builder UI.

2. **Floating Toolbar Architecture (`index.html`, `main.css`, `main.js`)**
   - Remove the Measuring Vector toggle button from the main left-hand sidebar.
   - Create a new floating toolbar on the right side (or top right) of the screen over the map.
   - Design it as a compact container for future tools. The Measuring Tool button should be a small square.
   - Use an SVG icon representing a measuring tape or ruler.
   - Add a tooltip explaining what the tool is and detailing the keyboard shortcuts.

3. **Keyboard Shortcuts (`MapLayers.js` & `main.js`)**
   - Track the user's mouse coordinates continuously while hovering over the map.
   - Listen for global keyboard events:
     - Pressing **"O"** (Origin): Automatically sets the measuring vector's starting point exactly where the cursor is hovering.
     - Pressing **"F"** (Final): Automatically sets the measuring vector's end point exactly where the cursor is hovering, completing the line.

## 14. Phase 9.6: Open-Source Data Integration & Categorization

With thousands of global airports now available in the CSVs, we must categorize and layer them so the map doesn't become visually overwhelmed, especially by the massive number of heliports in the São Paulo TMA.

1. **Dependency Injection (`package.json`)**
   - Install `papaparse` (`npm install papaparse`) to efficiently parse the massive 12MB `airports.csv` and `navaids.csv` files.

2. **Categorized Aerodrome Loader (`DataLoader.js`)**
   - Fetch `data/airports.csv` and parse it dynamically.
   - Filter the list to include only active aerodromes within exactly **300 Nautical Miles** of SBGR (`calculateDistance <= 300`).
   - Categorize each aerodrome into one of 3 tiers:
     - **Tier 1 (Major)**: Matches the 16 original major airports (SBGR, SBSP, SBKP, etc.).
     - **Tier 2 (Regional)**: Any fixed-wing airport (`small_airport`, `medium_airport`, `large_airport`) not in Tier 1.
     - **Tier 3 (Heliport)**: `type === 'heliport'`.

3. **NAVAIDs Loader (`DataLoader.js` & `main.js`)**
   - Fetch and parse `data/navaids.csv`. Filter to exactly **300 Nautical Miles** from SBGR.
   - In `main.js`, add the new `loadAirports` and `loadNavaids` functions to the global initialization sequence.

4. **Multi-Layer Rendering & Styling (`MapLayers.js`)**
   - Create 4 independent Leaflet `LayerGroup`s: Major Airports, Regional Airports, Heliports, and NAVAIDs.
   - **Styling (`styles/main.css`)**:
     - *Major*: Large blue airplane icon (current style).
     - *Regional*: Smaller, muted airplane icon (e.g., grey or amber).
     - *Heliport*: Distinct 'H' circle icon (e.g., green, small).
     - *NAVAID*: VOR (Blue hexagon/square), NDB (Magenta circle).
   - **Layer Control (`L.control.layers`)**: Add all 4 layers as separate checkboxes so they can be toggled independently.
   - **Default State**: Only "Major Airports" and "NAVAIDs" should be turned ON by default. Regional and Heliports should default to OFF to keep the initial load perfectly clean.

## 15. Phase 9.7: Data Currency Warning System

To ensure ATC trainees never unknowingly study procedures based on outdated data, the app will read `data/DATA_MANIFEST.json` at startup and display a clear data currency status.

1. **Manifest Loader (`DataLoader.js`)**
   - Create a new async `loadDataManifest()` function that fetches `data/DATA_MANIFEST.json` and parses it.
   - For each source entry, calculate **age in days** by comparing the `downloaded` date to today's date.
   - Apply staleness rules:
     - `waypoint_aisweb.xlsx` â†’ ðŸ”´ STALE if age > 28 days (AIRAC cycle)
     - `airports.csv` / `navaids.csv` â†’ ðŸŸ¡ OUTDATED if age > 60 days
     - All other sources â†’ ðŸŸ¢ OK if age â‰¤ 365 days

2. **Startup Data Currency Modal (`Modal.js` or new `DataStatusModal.js`)**
   - On app load, after the manifest is parsed, show a styled modal summarizing data currency.
   - The modal must contain a table with one row per source showing: name, description, age in days, and a colour-coded status badge (ðŸŸ¢ Current / ðŸŸ¡ Outdated / ðŸ”´ Stale).
   - Include a prominent **disclaimer banner** at the top: *"AeroProc is a training tool. Always verify procedures against current official charts from AISWEB DECEA."*
   - Add a "Do not show again this session" checkbox so it only appears once per browser session (`sessionStorage` flag).
   - If ALL sources are ðŸŸ¢, the modal can open in a collapsed/compact state by default.
   - If ANY source is ðŸ”´, the modal must open fully expanded with a red header warning.

3. **Persistent Status Badge (`index.html` & `main.css`)**
   - Add a small `â„¹ï¸` or `âš ï¸` icon button to the top navigation bar.
   - Its colour reflects the worst status of any data source: green (all OK), amber (any outdated), red (any stale).
   - Clicking it re-opens the Data Currency Modal at any time during the session.

## 16. Phase 9.8: Global Viewer Search

A unified search bar in Viewer Mode that progressively highlights any matching map object across all data layers simultaneously.

1. **Search Bar UI (`index.html` & `main.css`)**
   - Add a search input field to the Viewer Mode panel (sidebar or top bar).
   - The input field should have a magnifying glass icon and a clear (âœ•) button.
   - Style it consistently with the rest of the app's dark theme.

2. **Global Search Index (`main.js`)**
   - At startup (after all data is loaded), build a single flat in-memory search index array containing every renderable map object:
     - **Aerodromes (Tier 1, 2, 3 / Heliports)**: from `loadAerodromes()` — `{ ident, name, lat, lon, layer: 'aerodrome', tier }`
     - **RNAV Fixes**: from `loadWaypoints()` — `{ ident, lat, lon, layer: 'fix' }`
     - **NAVAIDs**: from `loadNavaids()` — `{ ident, name, type, lat, lon, layer: 'navaid' }`
   - This index is built once and reused on every keystroke.

3. **Progressive Highlighting (`MapLayers.js`)**
   - On each keystroke (debounced ~150ms), filter the search index for entries whose `ident` or `name` starts with or contains the query string (case-insensitive).
   - For each match, apply a **pulsing highlight marker** at its coordinates — identical in animation style to the builder's progressive fix highlighting (glowing ring, scale pulse animation).
   - **Layer Override:** If a matching object belongs to a currently-hidden Leaflet layer, temporarily add it to the map as a standalone highlight marker without enabling the full layer. When the search is cleared, remove the temporary marker.
   - Use distinct highlight colours per source: ðŸ”µ Aerodromes, ðŸŸ£ Fixes, ðŸŸ  NAVAIDs.
   - Display a small **result count badge** next to the search field (e.g. `3 results`).

4. **Result Interaction**
   - Clicking a highlighted marker on the map should pan/zoom the map to centre it.
   - Clicking a result should also show a **brief info tooltip**: ident, name, type, frequency (for NAVAIDs), layer source.
   - Pressing **Escape** or clearing the field removes all highlight markers instantly.

## 17. Phase 10: Airspace Overlays & Right Toolbar Redesign

### Part A — Airspace Overlays

The `data/airspaces_aip.json` file (pre-generated by `convert_airspaces.js`) contains 23 airspaces: 15 TMA sectors + 1 combined TMA + 7 CTRs. Each entry has `{ name, type, coordinates: [[lat,lon],...] }`.

1. **Data Parser (`convert_airspaces.js`)**: Robust update to handle real-world AIP complexity.
   - **Multi-line support**: Concatenate coordinate lines split across rows.
   - **Arc Support**: Detect "arco/arc" notations and generate smooth segments (32 steps) using center, radius, and start/end bearings.
   - **Circle Support**: Detect "Circular area" and generate 36-point polygons.

2. **Loader (`DataLoader.js`)**: Create `loadAirspaces()` — fetch and parse `data/airspaces_aip.json`.

3. **Rendering (`MapLayers.js`)**: Create `renderAirspaces()` with the following specifics:
   - **Naming**: Rename "SECT 01" to "T-01", "SECT 02F" to "T-02F", etc.
   - **TMA sectors**: `fill: rgba(59,130,246,0.06)`, `stroke: rgba(59,130,246,0.45)`, `weight: 1.5`, `dashArray: '6,4'`
   - **CTR**: `fill: rgba(234,179,8,0.07)`, `stroke: rgba(234,179,8,0.55)`, `weight: 1.5`, `dashArray: '4,3'`
   - **FIZ**: `fill: rgba(168,85,247,0.07)`, `stroke: rgba(168,85,247,0.5)`, `weight: 1`, `dashArray: '4,4'`
   - **ATZ**: `fill: rgba(249,115,22,0.07)`, `stroke: rgba(249,115,22,0.55)`, `weight: 1`, `dashArray: '3,3'`
   - **Master TMA Boundary**: Do NOT use convex hull for all points. Instead, implement a **Union (Dissolve)** of sectors **1, 2, 3, 4, 5, 6, 7, 8, 13**.
   - **TMA SP 2**: Treated as its own distinct boundary layer.

4. **Layer Groups**: Return separate `LayerGroup` instances for:
   - `tmaMaster` (Outer Boundary + TMA 2)
   - `tmaSectors` (Individual T-01, T-02, etc.)
   - `ctrGroup`, `fizGroup`, `atzGroup`

### Part B — Right Toolbar Redesign

Replace the current toolbar with a **3-button vertical toolbar**. Remove the native Leaflet `L.control.layers` panel entirely — all layer toggling will live in the new toolbar submenus. Remove the "Map Layers" button (no satellite/terrain needed yet).

Each button opens a **floating sub-panel** to its left on click (toggle). Only one sub-panel can be open at a time.

**Button 1 — 📏 Measuring Tool** *(existing behaviour, keep as-is)*

**Button 2 — 📏 Objects**
- Sub-panel contains checkboxes (matching current LayerGroup state):
  - ✅ Major Airports (Tier 1) — on by default
  - ☐ Regional Airports (Tier 2) — off by default
  - ☐ Heliports (Tier 3) — off by default
  - ✅ RNAV Fixes — on by default
  - ✅ NAVAIDs — on by default

**Button 3 — ✈️ Airspaces**
- Sub-panel contains structured toggles:
  - **TMA Overview**
    - [x] Outer Boundary (Master TMA)
    - [ ] TMA São Paulo 2
  - **TMA Sectors**
    - [x] All Sectors (Master Toggle)
    - [ ] Individual checkboxes: T-01, T-02, T-02F, T-03, T-04, T-05, T-06, T-07, T-08, T-09, T-10, T-11, T-12, T-13.
  - **Terminal Areas**
    - [x] CTRs (Group Toggle)
    - [ ] FIZs (Group Toggle)
    - [ ] ATZs (Group Toggle)
  - **CTR Section**:
    - ✅ Campinas CTR
    - ✅ Guarulhos CTR
    - ✅ Guará CTR
    - ✅ Jundiaí CTR
    - ✅ São José CTR
    - ✅ São Paulo CTR
    - ✅ Taubaté CTR
  - **ATZ Section**:
    - ✅ Atibaia ATZ
    - ✅ Marte ATZ
    - ✅ Sorocaba ATZ

- **No cursor-following tooltips on airspace polygons.** Only show the airspace name on click or as a static label, not as a tooltip that follows the mouse.

All sub-panels must match the app's existing dark glassmorphism theme (`main.css`).


## 18. Phase 11: Complex Procedure Branching (Bifurcations)

Aviation procedures (like STARs) often have multiple transitions (IAFs) that converge onto a single common path.

1. **Transitions Logic (`Sidebar.js`)**
   - Introduce a "Create Branch/Transition" button inside the Builder UI for the active procedure.
   - When clicked, prompt the user to select an *existing* waypoint in the active sequence to act as the "Convergence Point" (e.g., the IF).
   
2. **Branch Drawing Mode (`MapLayers.js`)**
   - The user can then click a series of waypoints to draw the new branch, which automatically terminates and connects to the selected Convergence Point.
   
3. **Data Structure Upgrade (`DataLoader.js`)**
   - Update the JSON export/save schema. Instead of a single flat `points: []` array, procedures will support `common_route: []` and an array of `transitions: [ { name: "1A", points: [] } ]`.

## 19. Phase 12: Transition System Redesign (Direction-Aware Branching)

Phase 11 introduced basic branching but the UX needs a complete overhaul. The core issue: **STAR/IAC and SID procedures branch in opposite directions**, so the interface must adapt based on procedure type.

### Aviation Logic

| | STAR / IAC (Arrivals) | SID (Departures) |
|---|---|---|
| **Flow** | Many entry points â†’ One common path | One common path â†’ Many exit points |
| **Branch direction** | INBOUND to a convergence fix | OUTBOUND from a divergence fix |
| **Common route** | The tail end (e.g. final approach segment) | The beginning (e.g. initial climb-out) |
| **Convergence/Divergence fix** | Where transitions JOIN the trunk | Where transitions LEAVE the trunk |

### Part A — Right-Click Context Menu on Fix Markers

Replace the sidebar "Create Branch/Transition" form with a **right-click context menu** on waypoint markers in the map.

1. **Context Menu (`MapLayers.js` + new `src/components/ContextMenu.js`)**
   - When in Builder Mode with an active procedure, right-clicking any fix that belongs to the current procedure's common route should display a small floating context menu at the cursor position.
   - The menu shows one option based on procedure type:
     - **STAR / IAC**: "➕ Add Inbound Transition to [FIX]" — creates a new transition that *ends* at this fix.
     - **SID**: "➕ Add Outbound Transition from [FIX]" — creates a new transition that *starts* from this fix.
   - Clicking the option enters **Transition Drawing Mode**.
   - Clicking anywhere else or pressing Escape dismisses the menu.

2. **Transition Drawing Mode**
   - **STAR/IAC (inbound)**: The user clicks a sequence of fixes that represent the transition route *leading to* the convergence fix. The convergence fix is automatically appended as the last point. The user draws "backwards" — from the IAF toward the convergence point.
   - **SID (outbound)**: The user clicks a sequence of fixes that represent the transition route *departing from* the divergence fix. The divergence fix is automatically prepended as the first point. The user draws "forward" — from the divergence point toward the exit.
   - In both cases, a **ghost line** renders the existing common route at 35% opacity so the user knows where the branch connects.
   - The transition auto-finishes when the user clicks the convergence/divergence fix itself (if they reach it by clicking), or via an "End Transition" button in the sidebar.
   - Prompt for a transition name upon completion (e.g. "Via CELSO", "Via COSMO").

### Part B — Sidebar Procedure Display Redesign

Replace the flat waypoint list with an **accordion/tree layout** that clearly separates the common route from its transitions.

1. **Collapsed view (procedure list)**
   ```
   â–¼ REDE 2A (STAR)               [Edit] [Delete]
     Common: REDE â†’ CGO â†’ GRADE â†’ DUMO
     â–¶ Trans: via CELSO (4 pts)    [âœï¸] [ðŸ—‘ï¸]
     â–¶ Trans: via COSMO (3 pts)    [âœï¸] [ðŸ—‘ï¸]
   â–¼ DUMO 7 (SID)                 [Edit] [Delete]
     Common: RWY â†’ DUMO â†’ CLICK
     â–¶ Trans: to PERES (3 pts)     [âœï¸] [ðŸ—‘ï¸]
   ```

2. **Expanded view (editing a transition)**
   - Clicking âœï¸ on a transition expands it inline to show the full waypoint sequence with the same edit controls as the main route (drag to reorder, âœ• to remove).
   - The transition's path is highlighted on the map in a distinct colour while editing.

3. **Visual distinction on map**
   - Common route: solid line (current style).
   - Transitions: dashed line in a slightly different hue per transition.
   - Active/editing transition: bright highlight with glow effect.

### Part C — Data Schema

The JSON schema for procedures with transitions:
```json
{
  "name": "REDE 2A",
  "type": "STAR",
  "common_route": [
    { "ident": "REDE", "lat": -23.891, "lon": -46.528 },
    { "ident": "CGO",  "lat": -23.627, "lon": -46.654 }
  ],
  "transitions": [
    {
      "name": "via CELSO",
      "direction": "inbound",
      "convergence_fix": "REDE",
      "points": [
        { "ident": "CELSO", "lat": -24.1, "lon": -47.2 },
        { "ident": "MIDPT", "lat": -24.0, "lon": -46.9 }
      ]
    }
  ]
}
```

- `direction`: `"inbound"` (STAR/IAC) or `"outbound"` (SID) — set automatically.
- `convergence_fix` / `divergence_fix`: the ident of the fix where the transition joins/leaves the common route.
- `points`: the transition-specific waypoints (the convergence/divergence fix itself is NOT duplicated in this array — it's implied by the connection).
- **Backward compatibility**: Existing procedures with only `points: []` and no `common_route` must still load and render correctly (treat the entire `points` array as the common route with zero transitions).

## 20. Phase 13: Critical State Management & Viewer UI Overhaul

Before proceeding to Phase 14, address the following state and UI bugs discovered during QA:

1. **State Loss on Tab Switch (`Sidebar.js` & `DrawingState.js`)**
   - **Bug:** If a saved procedure is opened in Builder Mode for editing, and the user switches to the Viewer tab without hitting "Save", the procedure is permanently deleted from the database.
   - **Fix:** Implement a strict state-preservation fallback. When navigating away from the Builder tab while an edit is active, the app must either: 
     a) Auto-save the current changes back to the array.
     b) Revert the procedure to its original saved state and discard the active edits.
   - The procedure must never be wiped from `LocalStorage` simply by changing tabs.

2. **Viewer Mode Measurement Toggle (`Sidebar.js` & `MapLayers.js`)**
   - **Bug:** Leg measurements (heading/distance strings on polylines) cannot be hidden once a procedure is displayed in Viewer Mode.
   - **Fix:** Add a dedicated "Toggle Leg Measurements" button/checkbox within the Viewer Mode UI panel. This must dynamically hide/show the measurement text overlays for the currently active viewing procedure without affecting the polyline itself.

3. **Viewer Mode Categorization & Sorting (`Sidebar.js`)**
   - **Enhancement:** Replace the flat list of saved procedures in Viewer Mode with a structured, categorized accordion layout.
   - **Default Grouping:** Group procedures by **Aerodrome**, then by **Type** (e.g., `SBGR` > `STAR` > `REDE 2A`).
   - **Sort Controls:** Add a dropdown menu at the top of the Viewer list allowing the user to change the sorting method:
     - Aerodrome > Type (Default)
     - Type > Aerodrome
     - Alphabetical (A-Z)
     - Alphabetical (Z-A)

## 21. Phase 14: Performance Optimization (Fix Virtualization)

Current Issue: In Builder Mode, rendering all ~3,000+ fixes simultaneously causes significant lag, even with low opacity.

1. **Virtualization Logic (`MapLayers.js`)**
   - Refactor `renderFixes()` to NOT add markers to the map by default.
   - Maintain a `_visibleFixMarkers` Map to track markers currently on the map.

2. **On-Demand Rendering**
   - Markers should only be instantiated and added to the map if:
     - The fix is part of the **active procedure sequence**.
     - The fix **matches the search query** typed in the sidebar.
   - When the search query changes, immediately remove markers that no longer match and are not part of the active route.

3. **Zoom-Level Culling (Optional)**
   - If the user wants to "see all fixes" without searching, only render fixes within the current `map.getBounds()` when the zoom level is > 10.

## 22. Phase 15: UX Polish & Map Fluidity
Before adding heavy real-time data, optimize the core visual experience and fix lingering search rendering bugs.

1. **Fluid Zoom Engine (`MapCore.js`)**
   - Override Leaflet's default blocky zoom. Configure the map instance to allow fractional zooming (make it at least 5x smoother).
   - *Key parameters to tweak:* Set `zoomSnap: 0.1`, `zoomDelta: 0.2`, and adjust `wheelPxPerZoomLevel` to achieve a buttery-smooth scrolling experience.
2. **Header Text Update (`index.html`)**
   - Update the top navigation header text from "São Paulo (SBGR)" to "São Paulo TMA".
3. **Aerodrome Icon Styling (`styles/main.css` & `MapLayers.js`)**
   - Adjust the CSS filter/styling for the tier 1/2 aerodrome airplane icons so they are almost black with exactly `opacity: 0.3` (30% transparency) to reduce map clutter.
4. **Viewer Mode Search Highlighting (`MapLayers.js`)**
   - **Bug Fix:** When searching in Viewer mode, hidden objects currently get a blinking circle but the object itself remains invisible. 
   - **Update:** Remove the blinking circle. Instead, force the matched object to become fully visible. Apply the exact same "contour highlight" (glowing ring) behavior used in Builder mode to *any* object found via search, whether it is a fix, heliport, aerodrome, or NAVAID.

## 23. Phase 16: Live Traffic (ADS-B) Integration
Introduce real-time aircraft tracking with color-coded logic based on origin/destination to quickly identify traffic flows within the TMA.

1. **Traffic Data Loader (`DataLoader.js` or `TrafficManager.js`)**
   - Implement a polling mechanism to fetch live ADS-B traffic data (from a provided API endpoint or local source).
2. **Dynamic Styling & Filtering (`MapLayers.js`)**
   - Render aircraft on the map using a directional icon (e.g., an arrowhead or airplane top-down view) rotated to match their actual track/heading.
   - **Color Logic:**
     - Orange/Brownish: Any aircraft departing from or arriving at **SBSP**.
     - Soft Yellow: Any aircraft departing from or arriving at **SBGR**.
     - Green: Any aircraft departing from or arriving at **SBKP**.
     - Grey: All other aircraft (overflights, other aerodromes).
3. **Transparent Aircraft Labels (`styles/main.css`)**
   - Aircraft tooltips/labels (showing Callsign, Altitude, Speed) must have completely transparent backgrounds with no borders.
   - The text should appear as clean, floating typography right next to the aircraft icon. Use a subtle text-shadow (e.g., a 1px black outline) to ensure readability over the map lines.

## 24. Phase 17: Advanced Instructional Tools
Enhance the map's interactivity for live teaching, including ephemeral drawing and a heavily upgraded vector measuring tool.

1. **Ephemeral Polygons in Viewer Mode (`MapLayers.js` & `sidebar.js`)**
   - Add a "Draw Shape" tool specifically in Viewer Mode.
   - Instructors can click to draw free-form polygons on the map to highlight specific areas during a lesson.
   - **No Persistence:** These polygons exist strictly in memory. They are not saved to the database and disappear when the page reloads.
2. **Measuring Vector Overhaul (`MapLayers.js` & `main.js`)**
   - **Aesthetics:** Make the vector line thinner. Remove the circle at the final point. Place the telemetry label (Distance/Heading) exactly at the ending point rather than the middle.
   - **Selection & State:** Vectors are now selectable. Clicking a drawn vector changes its color from Orange to Red to indicate it is "active/selected".
   - **Keyboard Shortcuts:**
     - Pressing `X` clears *all* measuring vectors.
     - Pressing `Z` clears only the *selected* (Red) vector.
3. **Vector Snapping & ETA Calculation (`MeasuringVector.js`)**
   - While drawing a vector, if the cursor passes within 3 NM of any aircraft, the ghost line snaps to it and displays an ETA in green.

## 25. Phase 18: Ephemeral Line Tool & Circle Refinement
Add a dedicated tool for drawing non-closed lines (polylines) and polish existing ephemeral tools.

1. **Ephemeral Line Tool (`EphemeralDraw.js`, `Sidebar.js`, `index.html`)**
   - Add a "Line" tool icon (pencil/line SVG) to the floating toolbar (Button 7).
   - Implement `Line` mode in `EphemeralDraw.js`: Each click adds a vertex to a **single polyline object** (the "stream").
   - The line is finalized as a single continuous path upon double-click or switching tools.
2. **Circle Radius Display (`EphemeralDraw.js`)**
   - While dragging to create a circle, dynamically display the radius in Nautical Miles (NM) next to the cursor.
3. **Interaction Buffering (UX Refinement)**
   - To solve the difficulty of right-clicking thin lines, implement an **invisible interaction buffer** (a thicker transparent polyline/hit-box) for all ephemeral lines and polygons.
   - This hit-box should have a width of ~15px to ensure right-clicking for deletion is graceful and forgiving.
4. **Persistence & Deletion**
   - Shapes are session-only (not saved to DB).
   - Right-click context menu for "Delete Shape".

## 26. Phase 19: Notation Tool (Free Text)
Add the ability for instructors and users to leave persistent (but not database-saved) free-text notes on the map for instructional purposes.

1. **Tool Integration (`Sidebar.js`)**
   - Add a "Notation" tool icon to the Drawing Tools category (Button 8).
2. **Dynamic Text Input (`MapLayers.js`)**
   - When active, clicking the map drops a temporary text cursor.
   - User can type free text (maximum of 30 notes per session).
3. **Interactivity & State (`MapLayers.js`)**
   - **Dragging:** When unlocked, users can click and drag notes to new positions.
   - **Context Menu:** Right-clicking a note allows editing text/style, deleting the note, or locking its position.

## 27. Phase 20: Drawing UX Overhaul (Coordinates & Shape Manager) - DONE (2026-04-28)
Enhance all instructional drawing tools with real-time feedback and a management interface.

1. **Cursor Coordinate Overlay (`main.js` & `EphemeralDraw.js`)**
   - When any drawing tool (Line, Poly, Circle, Note) is active, display the current Lat/Lng hovering next to the cursor.
2. **Vertex Coordinate "Engraving"**
   - For Line and Polygon tools, each click drops a temporary coordinate label on the map.
   - These labels remain visible while the shape is being drawn and are cleaned up once the shape is finalized.
3. **Unified Toolbar Styling & Consistency**
   - Ensure every tool button and sub-panel in the right-side toolbar shares the exact same CSS design tokens (glassmorphism, padding, font families, hover states).
   - The Notation tool (Phase 19) and any new sub-panels must match the layout and color palette of the existing Objects/Airspaces panels.
4. **Per-Tool Shape Management (In-Panel Lists)**
   - Instead of a global shape manager, integrate shape lists directly into each tool's sub-panel (Polygon, Circle, Line, Note).
   - When a tool sub-panel is opened:
     - **"Draw New"**: A button to initiate the drawing mode.
     - **Existing Shapes**: A list below it showing shapes specific to that tool.
     - **Controls**: Visibility toggle (eye), rename ability, and delete (trash icon).

## 28. Phase 21: Geo Point Tool (Coordinates Display)
A precision tool for identifying exact geographic locations without building a full procedure.

1. **Point Dropping Logic (`MapLayers.js`)**
   - Clicking the map while the Geo Tool is active drops a distinctive marker.
   - Automatically attach a permanent label showing the coordinates in decimal degrees (e.g., `-23.4356, -46.4731`).
2. **Management (`MapLayers.js`)**
   - Right-click context menu for deleting individual points or clearing all geo points.

## 29. Phase 22: Range Tool (DME Circles) - DONE (2026-04-28 12:50:53)
Create concentric distance rings for situational awareness and distance-from-station exercises.

1. **Circle Generation Logic (`MapLayers.js`)**
   - Input: User selects a center point (click or type) and defines the interval (NM) and count (max 20 circles).
   - Precision: Support 1NM-1NM accuracy.
2. **Visual Styling (`styles/main.css`)**
   - Render circles as very thin white lines with ~40% transparency.
3. **Lifecycle Management (`MapLayers.js`)**
   - Limit to 5 active ranges at a time.

## 30. Phase 23: Mouse Cursor Icon Sync - DONE (2026-04-28 13:03:00)
Improve UX by providing immediate visual feedback on the active tool.

1. **Dynamic Cursors (`styles/main.css` & `main.js`)**
   - When a specific tool is selected (Measuring, Note, Geo, Range, Line), update the `#map` container's cursor icon to match the tool's purpose.

## 31. Phase 24: Toolbar Categorization - DONE (2026-04-28 13:15:00)
Organize the growing list of tools into logical groups for a cleaner interface.

1. **UI Grouping (`Sidebar.js`)**
   - Separate tools into distinct brackets: [ DRAWING TOOLS ], [ DATA TOOLS ], [ LIVE TRAFFIC ].

## 32. Phase 25: Tools Review - DONE (2026-04-28)
Refine and enhance implemented tools based on initial usage feedback.

1. **Notation Tool Enhancements**
   - **Full Customization**: DONE. Added UI controls to select font size (XS to XL) and colors.
   - **Context Menu**: DONE. Right-click for Edit, Delete, Lock.
   - **Draggable Text**: DONE. Drag notes when unlocked.
   - **Commit Mechanism**: DONE. Enter to commit, Shift+Enter for new line.
   - **Global ESC De-activation**: DONE. Escape cancels any active tool.

2. **Phase 25 Correction: In-Marker Notation Styling & Lifecycle (ACTIVE)**
   Provide a floating "styling bar" directly on the map marker and refine the interaction lifecycle.
   - **In-Marker Style Bar**: Include a small glassmorphic floating bar that appears above/beside the text note ONLY during creation or when in "Edit Mode".
   - **Committed State (Read-only)**: When a user finishes typing (Enter or Blur), the `contenteditable` attribute must be disabled. Clicking/dragging the note in this state should move the marker on the map.
   - **Edit Mode (Context Menu)**: Selecting "Edit" from the right-click menu must:
     - Re-enable `contenteditable` for the text span.
     - Show the floating styling bar.
     - Disable marker dragging temporarily while editing.
   - **Context Menu Actions**:
     - **Lock Placement**: Toggles draggable state for the marker (accidental move prevention).
     - **Edit Text & Style**: Switches note back to "Edit Mode".
     - **Delete Note**: Removes the single note.
     - **Delete All Notes**: (New) Removes all notes from the map. **Requirement**: Show a `window.confirm` warning before execution.
   - **Immediate Feedback**: Style changes (size/color) must reflect in real-time on the note.

3. **Coordinate Overlay Refinement**
   - DONE. Added `mouseleave` suppression so the overlay hides when moving to the sidebar.


## 33. Phase 26: Airspace Color Theming - DONE (2026-04-28)
Align the airspace visualization with modern ATC aesthetics and future planning.

1. **Palette Update (`MapLayers.js`)**
   - **TMA Sectors**: 
     - `fillColor`: `#f1f5f9` (Slate 100) or a very light gray.
     - `strokeColor`: `rgba(148, 163, 184, 0.4)` (Slate 400).
     - `fillOpacity`: 0.05.
     - `dashArray`: '6, 4'.
   - **TMA Outer Boundary**:
     - `fillColor`: `transparent`.
     - `strokeColor`: `#ffffff` (White) or `#cbd5e1`.
     - `weight`: 2.5.
     - `opacity`: 0.7.
   - **CTR (Control Zones)**:
     - `fillColor`: `#add8e6` (Light Blue) or `#0ea5e9`.
     - `strokeColor`: `rgba(14, 165, 233, 0.5)`.
     - `fillOpacity`: 0.08.
   - **FIZ/ATZ**: Maintain existing patterns but ensure they don't clash with the new blue CTRs.

2. **UI Synchronization**: Ensure the legend/layer control text (if any) reflects the new purpose of these colors.

## 34. Phase 27: Aviation Research Tool - DONE (2026-04-28)
Leverage the bundled ICAO databases to provide instant information lookup.

1. **Information Registry (`DataLoader.js`)** — DONE. Three lazy-loading lookup functions added: `lookupAircraft(code)`, `lookupAirline(code)`, `lookupAirport(code)`. Each builds a module-level `Map` on first call for O(1) access. No startup cost.

2. **Research Interface (`index.html`)** — DONE. `btn-research` button added to the Data category. `panel-research` sub-panel added with three tab buttons (Aircraft / Airline / Airport), a text input with magnifying glass search button, and a glassmorphic result card.

3. **Search Logic (`main.js`)** — DONE. `_wireResearchPanel()` function added; called after `_wireToolbarPanels()`. Wires tab switching (updates `_activeCategory` + placeholder text), Enter key and search button (both call `_doSearch()`), and renders key-value rows for the matched record or a "not found" / error state. CSS for all new elements added to `main.css`.

## 35. Phase 28: Global Scaling Control - DONE (2026-04-28)
Allow users to customize the map's visual density to suit different screen sizes and instructional needs.

1. **Infrastructure (CSS Variables)** — DONE. `--map-label-scale: 1.0` and `--map-symbol-scale: 1.0` added to `variables.css` `:root`. `.fix-label`, `.seg-measurement-label span`, `.airport-label`, and `.airport-label-regional` font-sizes updated to use `calc(Xpx * var(--map-label-scale))`.

2. **Settings Interface (`index.html`)** — DONE. `btn-settings` (gear icon) added to a new "View" category in the toolbar. `panel-settings` sub-panel added with two range sliders (Label Size 0.5–2.0, Symbol Size 0.5–2.0), each with a live numeric readout and min/max tick labels. CSS for all slider elements added to `main.css`.

3. **Logic (`main.js` + `MapLayers.js`)** — DONE. `_wireSettingsPanel()` wires both sliders: Label Size fires `document.documentElement.style.setProperty('--map-label-scale', v)` on every `input` event for real-time reflow. Symbol Size fires the same for `--map-symbol-scale` on `input`, then on `change` (slider release) calls `applySymbolScale(scale)` exported from `MapLayers.js`, which iterates `_fixMarkerMap` and calls `marker.setRadius(Math.max(1, Math.round(baseRadius * scale)))` on each circleMarker.

## 36. Phase 29: Interface Scaling & UI Refinement - DONE (2026-04-28)
Finalize UI scaling behavior, fix encoding bugs, and improve route legibility.

1. **Fix: UI Scaling Targets & Exclusions** — DONE. `calc(Xpx * var(--ui-scale))` applied to: `.section-label` (10px), `.viewer-group-name` (11px), `.viewer-group-count` (10px), `.saved-proc-sub` (9px), `.view-search-input` (12px), `.global-search-input` (12px), `.global-search-input::placeholder` (11px), `.global-search-legend` (9px), `.gsl-dot` width/height (6px). Header and collapsible arrow font-size kept at fixed values.

2. **Fix: Mojibake Bug** — DONE. `.subpanel-collapsible-header::before` `content` changed from garbled bytes to `'\25B6'` CSS unicode escape for ▶. Font-size stays fixed at `8px`.

3. **Add: Route Tooltip on Hover** — DONE. `const fullRoute = routePts.map(p => p.ident).join(' → ')` added in `_buildProcAccordionRow` (`Sidebar.js`); `title=”${fullRoute}”` added to `.proc-common-preview` div.

4. **Symbol Slider & Tooltip Throttling** — DONE.

## 37. Phase 30: UI UX Polishing (Tool Highlighting & Scroll Fixes) - DONE (2026-04-29)
Implement clear visual feedback for the map tool lifecycle and resolve long-standing sidebar visualization issues.

1. **Dual-State Highlighting (`main.css`)** — DONE. `.active` (Cyan) for panel-open state, `.mode-active` (Violet) for armed/capturing state.

2. **Tool Lifecycle Management (`main.js`)** — DONE. Classes applied dynamically; mutual exclusion enforced; right-click clears armed state.

3. **Menu Visualization & Scroll Fixes (`main.css`)** — DONE.
   - `.toolbar-subpanel` `max-height` changed from `calc(100vh - 220px)` → `calc(100vh - 150px)`.
   - `padding-bottom: 5rem` added to `.toolbar-subpanel` and `.sidebar-content`.
   - Scrollbar styling made more visible (`.toolbar-subpanel` thumb opacity raised; `.sidebar-content` scrollbar added).
   - `@media (max-height: 700px)` query added to tighten padding and font sizes on small screens.
   - **Smart Vertical Positioning (`main.js`)**: Adjust panel `top` position dynamically to prevent bottom-clipping when opening panels from buttons near the screen edge.

## 38. Phase 31: Initial Visibility Profile - DONE (2026-04-29)
Set a logical "default state" for the São Paulo airspace upon app launch to provide immediate situational awareness.

1. **Default Layer State** — DONE.
   - **ON**: TMA Outer Boundary ✅, TMA Sectors ✅, CTR ✅, FIZ ✅ (was OFF), ATZ ✅ (was OFF), Major Airports ✅, NAVAIDs ✅.
   - **OFF**: RNAV Fixes ✅, TMA SP2 ✅, Regional Airports ✅, Heliports ✅.
   - Note: No Restricted/Prohibited areas exist in the current `airspaces_aip.json` dataset (only TMA, CTR, FIZ, ATZ).

2. **Changes**: `renderAirspaces` `defaultVisible` updated to include FIZ and ATZ; `chk-fiz-group` and `chk-atz-group` checkboxes set to `checked` in `index.html`.

## 39. Phase 32: Dynamic Measuring Follow Mode - DONE (2026-04-29)
Upgrade the measuring tool to support live interceptions and tracking of moving targets.

1. **Target Attachment (`MeasuringVector.js`)** — DONE.
   - `_finalizeVector` now accepts a `snapTarget` parameter and stores `destTargetHex` in the vector entry.
   - Vector entries extended: `{ id, line, labelMarker, originLatLng, destLatLng, destTargetHex }`.
   - `▶` prefix added to the label text when a vector is in follow mode.

2. **Real-Time Update Loop** — DONE.
   - `LiveTraffic.js`: `setPositionUpdateCallback(fn)` added. After each existing-aircraft position update in `_poll()`, calls `_positionUpdateCb(ac.id, ac.lat, ac.lon)`.
   - `MeasuringVector.js`: `updateAttachedVectors(hex, lat, lon)` exported — finds vectors with matching `destTargetHex`, updates `destLatLng`, and calls `_redrawVector()` to update the polyline and label.
   - `main.js`: `setPositionUpdateCallback(updateAttachedVectors)` wired after `initLiveTraffic()`.
   - Circular import avoided by using the callback registration pattern in `main.js`.

## 40. Phase 33: Measuring Vector Polish & Advanced Traffic Labels - DONE (2026-04-30)
Enhance situational awareness by refining the measuring vector display and updating live traffic markers.

1. **Measuring Vector Label Formatting (`MeasuringVector.js` & `styles/main.css`)**
   - Refactor the measuring vector's `DivIcon` HTML to stack its information vertically instead of in a single inline string.
   - **Line 1:** Distance (e.g., `10.5 NM`).
   - **Line 2:** Tracking/Bearing (e.g., `TRK 050°` or `BRG 050°`).
   - **Line 3:** ETA/Timing (Dynamic).
   - **Positioning:** Adjust the label's CSS anchoring (`className` or `iconAnchor`) so it is offset cleanly from the endpoint. It must not be shadowed or overlaid by the aircraft's own symbol/label (e.g., anchor it slightly above and to the right, with a distinct background or text-shadow).

2. **Advanced ETA Timing Logic (`MeasuringVector.js`)**
   - Implement a speed-based time estimation calculation for the vector's third line based on its snapping state. The time ($T = D / V$) should be formatted cleanly (e.g., `02:15` or `2m 15s`).
   - **Case A (Map Point to Aircraft):** Origin is a map point, Destination is an aircraft. Calculate time using the *destination aircraft's* current Ground Speed (GS) over the direct straight-line distance to the point.
   - **Case B (Aircraft to Aircraft):** Both points snapped to aircraft. Calculate time using the *origin aircraft's* GS over the straight-line distance to the destination aircraft.
   - **Case C (Aircraft to Map Point/Fix):** Origin is an aircraft, Destination is a map point/fix. Calculate time using the *origin aircraft's* GS over the straight-line distance to the point.
   - If no aircraft with a valid speed is involved (e.g., Map Point to Map Point), omit the third line entirely.

3. **4-Line Aircraft Labels (`LiveTraffic.js` & `styles/main.css`)**
   - Update the aircraft `DivIcon` template to explicitly place the `TRK XXX°` (Track) information on the fourth line of the label.
   - Ensure the layout remains compact (Callsign, Type/Route, Alt/Spd, TRK) and legible against the map background.

4. **Label Visibility Controls & Auto De-clutter** — DONE.
   - Added four checkboxes in the Live Traffic sub-panel: `[x] Callsign`, `[x] Type`, `[x] Alt/Spd`, `[x] Track`.
   - Updated the label rendering logic to toggle these lines on/off globally.
   - Integrated `isMeasuringVectorActive` into the global `_stopAllActiveTools` handler for ESC/Right-click deactivation.

## 41. Phase 34: Advanced Snapping & Vector Interaction - DONE (2026-04-30)
Implement a precise hierarchy for map object snapping and refine the vector selection workflow.

1. **Hierarchical Snap Engine (`MeasuringVector.js` & `main.js`)**
   - Implement `getSnap` with a priority hierarchy: **Aircraft** > **NAVAIDs** > **Fixes** > **Airports**.
   - Use a tight 1 NM snap radius for all static map objects.
   - Wire the global snap provider in `main.js` using `_searchIndex` for high-performance lookups.

2. **Shift-Key Snap Override**
   - Detect `Shift` key state during map clicks and mouse movement.
   - If `Shift` is held, bypass all snapping logic to allow free-form coordinate placement.

3. **Interactive Vector Re-snapping**
   - Enable selecting an existing vector (highlighted in Red).
   - Allow re-snapping the endpoint of a selected vector using the `F` key or by clicking a new location/object while the vector is selected.

4. **Auto-Selection Logic**
   - Ensure newly created or finalized vectors are automatically selected to facilitate immediate refinement.
   - Clicking the map while a vector is selected now correctly deselects it and initiates a new vector sequence.

## 42. Phase 35: Real-Time METAR/TAF Integration (CheckWX API) - DONE (2026-04-30)

Provide live METAR and TAF weather data for all Tier-1 Major Airports via an interactive popup card, using the CheckWX API for pre-decoded JSON responses. Weather is fetched on-demand (user clicks "Show Weather") and cached for 10 minutes to manage API quota.

---

### Step 1 — API Key Configuration (New File: `config.js`)

> **CRITICAL — Do This First.**

Create a `config.js` file at the **project root** (same level as `index.html`). This file holds the API key and must **never** be committed to GitHub.

```js
// config.js
// Obtain a free key from https://checkwx.com
// Add 'config.js' to .gitignore immediately.
export const CHECKWX_API_KEY = 'YOUR_CHECKWX_API_KEY_HERE';
```

- Add `config.js` to `.gitignore`.
- Add a `config.example.js` file (committed) with `YOUR_CHECKWX_API_KEY_HERE` as a placeholder so collaborators know the file is needed.
- Document the setup step in `README.md`.
- **Free Tier Quota:** CheckWX free plan provides 100 requests/month. The 10-minute TTL cache ensures this is sufficient for training sessions.

---

### Step 2 — Weather Service (New File: `services/MetarService.js`)

Create a self-contained ES module. No external dependencies required.

**Internal State:**
```js
const _cache = new Map(); // key: ICAO string, value: { metar, taf, fetchedAt }
const TTL_MS = 10 * 60 * 1000; // 10 minutes
```

**Exported Function: `fetchWeather(icao)`**

```
fetchWeather(icao: string) → Promise<WeatherResult | null>
```

Logic:
1. Check `_cache.get(icao)`. If entry exists AND `Date.now() - entry.fetchedAt < TTL_MS`, return cached entry immediately.
2. Otherwise, fire **two parallel** `fetch()` calls:
   - `GET https://api.checkwx.com/metar/{ICAO}/decoded` (Header: `X-API-Key`)
   - `GET https://api.checkwx.com/taf/{ICAO}/decoded` (Header: `X-API-Key`)
   - Use `Promise.allSettled()` so a TAF failure does not block the METAR from rendering.
3. Normalize both responses into a flat `WeatherResult` object (see schema below).
4. Store the result in `_cache` with `fetchedAt: Date.now()`.
5. Return the result. On network error, return `null`.

**`WeatherResult` Schema:**
```js
{
  icao: String,
  observed: String,        // e.g. "2026-04-29T23:00:00Z"
  flight_category: String, // "VFR" | "MVFR" | "IFR" | "LIFR"
  raw_metar: String,
  wind: {
    degrees: Number,
    speed_kts: Number,
    gust_kts: Number | null,
    variable: Boolean       // true if wind is VRB
  },
  visibility_sm: Number | null,
  clouds: [{ code: String, base_ft: Number }], // e.g. [{code:"FEW", base_ft:1500}]
  temperature_c: Number,
  dewpoint_c: Number,
  altimeter_hpa: Number,
  // TAF fields (null if TAF unavailable)
  taf_raw: String | null,
  taf_valid_from: String | null,
  taf_valid_to: String | null,
  taf_forecast: [{ time_from, wind, visibility_sm, clouds }] | null
}
```

---

### Step 3 — Airport Marker Popup Upgrade (`MapLayers.js`)

**Scope:** Apply to all **Tier-1 Major Airports** only (the 16 airports in the `MAJOR_AIRPORTS` constant). Tier-2/3 markers are unaffected.

**Change from Tooltip → Popup:**
- If the Tier-1 airport markers currently use `bindTooltip`, switch to `bindPopup`.
- Configure the popup with: `{ closeOnClick: false, autoClose: false, className: 'airport-wx-popup' }`.
  - `closeOnClick: false` is essential — it prevents the popup from closing when the user clicks the "Show Weather" button inside it.

**Initial Popup Content (static, renders instantly):**
```html
<div class="wx-popup-header">
  <span class="wx-icao">{ICAO}</span>
  <span class="wx-airport-name">{Airport Name}</span>
</div>
<div class="wx-popup-coords">{Lat}, {Lon}</div>
<div id="wx-body-{ICAO}" class="wx-body wx-body--idle">
  <button id="wx-btn-{ICAO}" class="wx-show-btn">🌤 Show Weather</button>
</div>
```

**After popup opens (`marker.on('popupopen', ...)`):**
- Wire `document.getElementById('wx-btn-{ICAO}').addEventListener('click', ...)`.
- On button click:
  1. Replace the button with: `<div class="wx-loading"><span class="wx-spinner"></span> Fetching weather…</div>`.
  2. Call `await MetarService.fetchWeather(icao)`.
  3. On success: replace the loading div with `_buildWeatherCard(result)`.
  4. On failure (`null` returned): replace with `<div class="wx-error">⚠ Weather unavailable</div>`.
  5. Call `popup.update()` after DOM injection so Leaflet recalculates the popup's size/position.

---

### Step 4 — Weather Card HTML Template (function in `MapLayers.js`)

Add a private helper function `_buildWeatherCard(data)` inside `MapLayers.js`:

```js
function _buildWeatherCard(data) {
  const windStr = data.wind.variable
    ? `VRB / ${data.wind.speed_kts} KT`
    : `${String(data.wind.degrees).padStart(3,'0')}° / ${data.wind.speed_kts} KT${data.wind.gust_kts ? ` G${data.wind.gust_kts}` : ''}`;

  const cloudsStr = data.clouds.length
    ? data.clouds.map(c => `${c.code} ${c.base_ft}ft`).join(' · ')
    : 'SKC';

  const tafBlock = data.taf_raw
    ? `<div class="wx-section-title">TAF</div>
       <div class="wx-taf-raw">${data.taf_raw}</div>
       <div class="wx-taf-valid">Valid: ${data.taf_valid_from} → ${data.taf_valid_to}</div>`
    : `<div class="wx-taf-na">TAF not available</div>`;

  return `
    <div class="wx-card">
      <div class="wx-flight-cat wx-cat--${data.flight_category}">${data.flight_category}</div>
      <div class="wx-section-title">METAR</div>
      <div class="wx-grid">
        <div class="wx-item"><span class="wx-icon">💨</span><span class="wx-label">Wind</span><span class="wx-value">${windStr}</span></div>
        <div class="wx-item"><span class="wx-icon">👁</span><span class="wx-label">Visibility</span><span class="wx-value">${data.visibility_sm ?? 'N/A'} SM</span></div>
        <div class="wx-item"><span class="wx-icon">☁</span><span class="wx-label">Cloud</span><span class="wx-value">${cloudsStr}</span></div>
        <div class="wx-item"><span class="wx-icon">🌡</span><span class="wx-label">Temp/Dew</span><span class="wx-value">${data.temperature_c}°C / ${data.dewpoint_c}°C</span></div>
        <div class="wx-item"><span class="wx-icon">⬇</span><span class="wx-label">QNH</span><span class="wx-value">${data.altimeter_hpa} hPa</span></div>
      </div>
      <div class="wx-raw-metar">${data.raw_metar}</div>
      <hr class="wx-divider">
      ${tafBlock}
      <div class="wx-observed">Observed: ${data.observed}</div>
    </div>`;
}
```

---

### Step 5 — CSS Additions (`styles/main.css`)

Add a new section `/* === WEATHER POPUP === */`. All styles must follow the existing dark glassmorphism theme.

| Selector | Key Properties |
|---|---|
| `.airport-wx-popup .leaflet-popup-content-wrapper` | `background: rgba(15,23,42,0.92)`, `backdrop-filter: blur(12px)`, `border: 1px solid rgba(255,255,255,0.1)`, `color: #e2e8f0`, `border-radius: 10px`, `min-width: 260px`, `max-width: 320px` |
| `.airport-wx-popup .leaflet-popup-tip` | `background: rgba(15,23,42,0.92)` |
| `.wx-popup-header` | `display: flex`, `justify-content: space-between`, `font-weight: 700`, `border-bottom: 1px solid rgba(255,255,255,0.1)`, `padding-bottom: 4px`, `margin-bottom: 6px` |
| `.wx-icao` | `font-size: 14px`, `color: #7dd3fc` |
| `.wx-airport-name` | `font-size: 10px`, `color: #94a3b8`, `text-align: right` |
| `.wx-show-btn` | Full-width button, glassmorphic border, cyan accent, hover glow. |
| `.wx-loading` | `display: flex`, `align-items: center`, `gap: 8px`, `color: #94a3b8` |
| `.wx-spinner` | CSS `border` spinner animation (the same style as other loaders in the app). |
| `.wx-flight-cat` | `font-size: 11px`, `font-weight: 700`, `border-radius: 4px`, `padding: 2px 6px`, `display: inline-block`, `margin-bottom: 6px` |
| `.wx-cat--VFR` | `background: #166534`, `color: #bbf7d0` |
| `.wx-cat--MVFR` | `background: #1e3a5f`, `color: #93c5fd` |
| `.wx-cat--IFR` | `background: #7f1d1d`, `color: #fca5a5` |
| `.wx-cat--LIFR` | `background: #581c87`, `color: #e9d5ff` |
| `.wx-section-title` | `font-size: 9px`, `text-transform: uppercase`, `letter-spacing: 0.1em`, `color: #64748b`, `margin: 8px 0 4px` |
| `.wx-grid` | `display: flex`, `flex-direction: column`, `gap: 3px` |
| `.wx-item` | `display: flex`, `align-items: center`, `gap: 6px`, `font-size: 11px` |
| `.wx-label` | `color: #94a3b8`, `width: 70px`, `flex-shrink: 0` |
| `.wx-value` | `color: #e2e8f0`, `font-family: monospace` |
| `.wx-raw-metar` | `font-family: monospace`, `font-size: 9px`, `color: #64748b`, `word-break: break-all`, `margin-top: 8px`, `border-top: 1px solid rgba(255,255,255,0.06)`, `padding-top: 6px` |
| `.wx-divider` | `border-color: rgba(255,255,255,0.08)`, `margin: 8px 0` |
| `.wx-taf-raw` | `font-family: monospace`, `font-size: 9px`, `color: #94a3b8`, `word-break: break-all` |
| `.wx-taf-valid` | `font-size: 9px`, `color: #64748b`, `margin-top: 4px` |
| `.wx-taf-na` | `font-size: 10px`, `color: #475569`, `font-style: italic` |
| `.wx-observed` | `font-size: 9px`, `color: #475569`, `margin-top: 8px`, `text-align: right` |
| `.wx-error` | `color: #f87171`, `font-size: 11px`, `text-align: center`, `padding: 8px` |

---

### Step 6 — Wiring in `main.js`

- Import `MetarService` at the top of `main.js`: `import { fetchWeather } from './services/MetarService.js';`
- Pass the `fetchWeather` function into `MapLayers.js` via the existing `initMapLayers(map, options)` call, adding it to the options object: `options.fetchWeather = fetchWeather`.
- No changes to the initialization sequence are required beyond this.

---

### Scope & Constraints Summary

| Decision | Value |
|---|---|
| **Trigger** | User clicks "Show Weather" button inside popup |
| **Airport scope** | All 16 Tier-1 Major Airports only |
| **Data** | METAR (decoded) + TAF (decoded, raw fallback) |
| **Cache TTL** | 10 minutes, in-memory (cleared on page reload) |
| **Parallelism** | METAR and TAF fetched with `Promise.allSettled` |
| **API failure** | Graceful `wx-error` state; TAF failure doesn't block METAR |
| **Key storage** | `config.js` excluded from Git via `.gitignore` |

## 43. Phase 36: Language Selection Toggle (EN/PT-BR) (COMPLETED)
Implement a robust, premium localization system that allows seamless switching between English and Portuguese-BR, ensuring the tool remains accessible to international users and professional ATCO training standards.

### Step 1 — Translation Schema (`src/data/translations.js`)
Create a central dictionary to house all UI strings. This prevents hardcoded text in components.
- **Structure**: Use a nested object structure (e.g., `ui.buttons`, `map.tooltips`).
- **Standardization**: Use English keys for semantic clarity.
- **Initial Scope**: Cover the Sidebar tabs, Toolbar tooltips, Search placeholders, and Measuring Tool labels.

### Step 2 — i18n Core Engine (`src/utils/i18n.js`)
Build a lightweight utility to manage language state and DOM updates.
- **State Management**: 
    - `currentLang`: Initialize from `LocalStorage` (key: `aeroproc_lang`), fallback to `pt`.
- **Primary Functions**:
    - `t(path)`: Recursive lookup function to retrieve strings by dot-notation (e.g., `t('sidebar.tools.draw')`).
    - `setLanguage(lang)`: Update state, save to `LocalStorage`, and dispatch a global `languageChanged` CustomEvent.
    - `updateDOM()`: A utility that scans the document for `[data-i18n]` attributes and automatically updates their `textContent` or `placeholder`.

### Step 3 — DOM Tagging (`index.html`)
Update the main shell to support dynamic translation without full page reloads.
- **Attribute Strategy**: Add `data-i18n="key"` to all static text elements.
- **Example**: `<span data-i18n="sidebar.title">São Paulo TMA</span>`.
- **Placeholders**: Support `data-i18n-placeholder="key"` for search inputs.

### Step 4 — UI Localization Toggle
Integrate a high-visibility, premium toggle into the interface.
- **Design**: A glassmorphic "Pill" toggle (Segmented Control).
- **Placement**: Top-right corner of the Sidebar or integrated into the Settings panel.
- **Visuals**:
    - Active state: Cyan glow / White text.
    - Inactive state: Dimmed slate / Transparent background.
    - Transition: Smooth 200ms CSS transform/opacity transition.

### Step 5 — Component Integration
Update existing JavaScript components to react to language changes.
- **Event Listeners**: `Sidebar.js`, `MapLayers.js`, and `MeasuringTool.js` should listen for the `languageChanged` event.
- **Dynamic Content**: Any text generated via JS (like "Distance: 15 NM") must call `t()` during its render cycle.
- **Initialization**: Call `i18n.updateDOM()` in `main.js` immediately after the DOM content is loaded.

---

## 44. Phase 37: API Security & Proxy Integration (Cloudflare Workers)
Implement a serverless gateway to protect CheckWX API keys during static hosting deployment on GitHub Pages, while maintaining a seamless local development workflow.

- **Worker Setup & Secret Management**: Create a Cloudflare Worker. Store the CheckWX X-API-Key securely as an environment secret within Cloudflare (ensure it is excluded from the source code repository).

- **Request Proxy & Header Injection**: Configure the Worker to intercept frontend requests, inject the hidden X-API-Key into the headers, and forward the request to the CheckWX endpoints.

- **CORS Configuration**: Program the Worker to return appropriate Access-Control-Allow-Origin headers in its response to prevent the browser from blocking the data on the frontend.

- **Environment-Aware Security (Domain-Locking)**: Validate the Origin header of incoming requests to the Worker. Strictly allow traffic from [https://mytchelcosta.github.io](https://mytchelcosta.github.io) for production, while whitelisting http://localhost:<PORT> (and/or 127.0.0.1) to ensure local development and testing remain unblocked.

- **Frontend Refactor**: Update MetarService.js to route all aeronautical weather data requests to the new Cloudflare Worker URL instead of the direct CheckWX API.

## 45. Phase 38: Sidebar & Map Interface Optimization (COMPLETED)
Refine the core application layout to ensure visual seamlessness, responsive stability, and high-performance map animations.

### Step 1 — Layout Architecture Fix
- **Constraint**: The toggle button as a flex sibling causes a whitespace gap between sidebar and map.
- **Action**: Move `#btn-sidebar-toggle` inside the `.sidebar` container.
- **Styling**: 
    - Set `#root` to `position: relative`.
    - Set `#btn-sidebar-toggle` to `position: absolute` with `left: calc(100% + 10px)` to dock it outside the sidebar.
    - Result: Map (`flex: 1`) now starts exactly at the sidebar boundary.

### Step 2 — Smooth Map Transition
- **Constraint**: Leaflet map "jumps" after sidebar resize because `invalidateSize()` is called only at the end.
- **Action**: Implement a `requestAnimationFrame` loop in `main.js` that calls `_map.invalidateSize()` on every frame for the 300ms transition duration.
- **Optimization**: Remove the `translateX(-10px)` transform from the sidebar to simplify the animation path.

### Step 3 — Toolbar Responsive Polish
- **Scrolling**: Apply `max-height` and `overflow-y: auto` only via `@media (max-height: 850px)`.
- **Visibility**: Hide the scrollbar thumb by default and show it only on `:hover` to prevent visual "pollution" on high-res displays.
- **Structural Integrity**: Apply `flex-shrink: 0` to all toolbar buttons and separators to prevent them becoming "flattened" when the viewport height is low.

---
## 46. Phase 39: VFR Corridors (REA/REH Layer) (COMPLETED)
Integrate the Special Aircraft Routes (REA) and Helicopter Routes (REH) as interactive, data-rich layers. Unlike standard procedures, these layers provide a permanent "visual reference" grid when active.

### Step 1 — Data Parsing & Coordinate Normalization (`CCV` Folder)
- **Service**: Create `src/services/VfrDataLoader.js`.
- **Coordinate Conversion**: Implement a converter for the two formats found in the CSVs:
    - **Format 1 (DMS)**: `22°39'49"S / 047°19'04"W` (found in `rea_corridors_segments.csv`).
    - **Format 2 (DDM)**: `S23 30.13, W46 41.92` (found in `rea_waypoints.csv`).
- **Segment Mapping**: Parse `rea_corridors_segments.csv` to build a list of paths. Each path includes:
    - `Route_Name` (e.g., "REA ALFA")
    - `Altitude` (A->B and B->A)
    - `Heading` (A->B and B->A)

### Step 2 — Layer Architecture & "Global Fix" Visibility
- **Layer Groups**: Add `reaGroup` and `rehGroup` to `MapLayers.js`.
- **Conditional Visibility**: 
    - **Rule**: When the REA or REH layer is toggled ON, the application must force the rendering of all fixes defined in `rea_waypoints.csv` and `reh_fixes_helicopter.csv`.
    - **Aesthetics**: Use distinct icons for VFR waypoints (e.g., Magenta triangles for REA Gates, Yellow circles for REH Fixes) to distinguish them from standard RNAV waypoints.

### Step 3 — Corridor Rendering & Path Labels
- **Polyline Styling**:
    - **REA**: Solid Cyan/Blue lines with a slight glow.
    - **REH**: Dashed lines or distinct color (e.g., Orange).
- **Metadata Visualization**: 
    - Implement labels along the segments (or centered tooltips) showing the route name and altitude restrictions (e.g., "ALFA: 4000ft / 3200ft").
    - Add popups to segments detailing the bidirectional headings and altitudes.

### Step 4 — UI Integration (Airspaces Panel)
- **Toolbar Update**: Expand the "Airspaces" sub-panel in `index.html`.
- **New Section**: "Corredores VFR (CCV)".
- **Controls**:
    - `[ ] REA (Aeronaves)`
    - `[ ] REH (Helicópteros)`
- **Logic**: Wire the checkboxes to `MapLayers.renderREA()` and `MapLayers.renderREH()`.

### Step 5 — Localization & Polish
- Update `translations.js` with VFR-specific terms.
- Ensure Z-index layering: Airspaces (Bottom) -> VFR Corridors -> RNAV Fixes -> Procedures (Top).

## 47. Phase 40: Persistent Database (Master-Only Cloud)
1. **Supabase Integration**: Move from LocalStorage to Cloud.
2. **Admin Access**: Authenticated editing for instructors, read-only for students.
3. **State Syncing (main.js)**: Fetch saved procedures and lock UI for students.

## 49. Phase 42: Hong Kong FIR & Sector Integration (DONE)
1. **Regional Setup**: Centered the map on Hong Kong and updated magnetic declination constants.
2. **Airspace Modeling**: Implemented the HK FIR, overlapping ACC/FIS sectors (Southern Sector), and Central FIS (beneath TMA).
3. **UCARA**: Integrated Uncontrolled Airspace Reporting Areas with dedicated amber styling.

## 50. Phase 43: EuroScope Sector Data Extraction (DONE)
1. **SCT Parsing**: Created a specialized parser (`scripts/parse_sct.js`) to extract data from industry-standard EuroScope `.sct` files.
2. **Bulk Fix Import**: Successfully extracted 884 high-precision waypoints and 21 NAVAIDs for the HK region, significantly increasing the fidelity of the environment.
3. **Coordinate Normalization**: Implemented DD.MM.SS.SSS to Decimal Degree conversion logic.

## 51. Phase 44: Airway Network Extraction (FUTURE)
1. **Airway Parser**: Expand the SCT parser to read the `[AIRWAY]` section.
2. **Dynamic Routing**: Render the high-altitude route network as thin, selectable lines on the map.
3. **Route Telemetry**: Display magnetic bearing and distance (NM) for each airway segment.





