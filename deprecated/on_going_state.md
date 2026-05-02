# AeroProc Development Log & On-Going State

## [2026-05-01] Current Status
**Active Phase**: Phase 40 — Persistent Database (Supabase)
**Last Implementation**: Finalized VFR Corridors (REA/REH) with parallel axis rendering and 2.0 NM thickness.

---

## Implementation History

### Phase 39 — VFR Corridors (REA/REH Layer) (2026-05-01)
- **Status**: COMPLETED.
- **VfrDataLoader Service**:
    - Created `src/services/VfrDataLoader.js` to handle specialized VFR data parsing.
    - **Coordinate Normalization**:
        - Implemented `parseDms()` and `parseDdm()` to handle multiple CSV coordinate formats.
- **Rendering Engine (`MapLayers.js`)**:
    - **Parallel Axis Architecture**: Implemented a "tube" style corridor using `turf.lineOffset` on chained LineStrings.
    - **Geometric Sanitization**: Added sharp-turn angle detection (>45°) and zero-length filtering to prevent "shooting lines" artifacts.
    - **Aesthetic Refinement**: Finalized thickness at **2.0 NM** (1.0 NM offset) with a clean slate-gray aesthetic.
    - **Visibility Rules**: Synchronized REA/REH toggles to automatically render mandatory VFR waypoints (triangles/circles) while layers are active.
- **Optimization**: Removed directional arrows and information popups from the final view to prioritize map legibility and a professional "radar screen" feel.

### Phase 38 — Sidebar & Map Interface Optimization (2026-05-01, 05:48:00)
- **Status**: COMPLETED.
- **Sidebar & Map Layout**:
    - Resolved the "black gap" issue between the sidebar and the map by moving the toggle button inside the sidebar container, removing it from the `#root` flex flow.
    - Set the toggle button to `position: absolute` with high specificity (`#btn-sidebar-toggle`) to prevent interference from global button styles.
    - Adjusted button offsets to `calc(100% + 10px)` for symmetry with the top margin.
- **Animation Synchronization**:
    - Implemented a `requestAnimationFrame` loop in `main.js` that continuously calls `_map.invalidateSize()` during the 300ms sidebar transition. This eliminates "jumps" by smoothly re-centering the map as the sidebar moves.
    - Simplified the sidebar transition by removing the `translateX(-10px)` transform, resulting in a cleaner "drawer" animation.
- **Toolbar Refinement**:
    - Restricted toolbar scrollability to viewports with `height <= 850px` via media queries.
    - Implemented a "hover-to-show" scrollbar thumb to keep the interface clean on high-resolution (4K) screens.
    - Added `flex-shrink: 0` to all toolbar components (buttons, separators, labels) to prevent "flattening" or resizing on small screens.

### UI Restoration & Stabilization Phase (2026-05-01, 03:35:00)
- **Status**: COMPLETED.
- **Context**: Resolved catastrophic UI failure introduced during modularization.
- **Initialization Fix**: Restored the application bootloader sequence in `main.js`, ensuring all UI managers receive correct state dependencies.
- **Tool Mutual Exclusion**: Implemented `_stopAllToolsBefore` in `ToolbarManager.js` to prevent state conflicts between drawing, notation, and measuring tools.
- **Interaction Logic**: Fixed map click handlers to prevent premature panel collapse while tools are armed.
- **CSS Sanitization**: Implemented `.hidden` utility and removed redundant rulesets in `main.css`.
- **i18n Key Correction**: Fixed malformed translation keys for aircraft labels (`units.ft`, `units.kt`, `units.gnd`) and simplified the Track label to `"TRK"`.
- **Styling Refinement**: Applied premium typography (Inter/JetBrains Mono) and layout to Notation and GeoPoint lists and empty states.

### Project Organization — Step 2 (2026-05-01, 02:51:10)
- **Status**: COMPLETED.
- **Action**: Created `docs/references/` to house non-operational reference materials.
- **Files Moved**: 
    - `REFERENCE_FOR_LIVE_TRAFFIC_NTEGRATION.html`
    - `config.example.js`

### Project Organization — Step 1 (2026-05-01, 02:50:45)
- **Status**: COMPLETED.
- **Action**: Created a dedicated `docs/` folder to declutter the root directory.
- **Files Moved**: 
    - `implementation_plan.md`
    - `on_going_state.md`
    - `project_briefing.md`
    - `GEMINI.md`
    - `CLAUDE.md`

### Project Sanitization & Security Audit (2026-05-01, 02:48:15)
- **Status**: COMPLETED.
- **Cleanup**: Permanently removed deprecated API keys from `.env`.
- **Hygiene**: Expanded `.gitignore` to exclude log files (`*.log`), Cloudflare cache (`.wrangler/`), and AI-specific scratch files (`.claude/`, `scratch/`).
- **Audit**: Verified that all scripts, parsers, and public data folders are free of sensitive credentials or private information.

### Phase 37.5 — Frontend Refactor (2026-05-01, 02:33:30)
- **Status**: COMPLETED.
- **Environment**: Updated `.env` to use `VITE_WEATHER_PROXY_URL` and deprecated `VITE_CHECKWX_API_KEY` on the client side.
- **MetarService.js**: 
    - Refactored `_checkwxFetch` to remove manual `X-API-Key` header injection.
    - Updated `BASE_URL` to route all requests through the secure Cloudflare Worker proxy.
- **Security**: The application now makes zero direct calls to CheckWX and exposes no sensitive keys in the browser's Network tab.

### Phase 37.2, 37.3, 37.4 — Cloudflare Worker Logic, CORS & Security (2026-05-01)
- **Status**: COMPLETED.
- **Proxy Engine**: Implemented `fetch()` handler to intercept `/metar/` and `/taf/` requests and forward them to `api.checkwx.com`.
- **Header Injection**: Hidden API key (`env.CHECKWX_API_KEY`) is now safely injected into the outgoing request's headers, preventing exposure on the frontend.
- **CORS Configuration**: Handles `OPTIONS` preflight requests and appends `Access-Control-Allow-Origin` dynamically based on allowed origins.
- **Domain-Locking Security**: Strict origin validation. Only permits requests from `https://mytchelcosta.github.io` (production) and local development ports (`http://localhost:*` or `http://127.0.0.1:*`). All other origins return a 403 Forbidden.

### Phase 37.1 — Worker Setup & Secret Management (2026-05-01, 02:29:45)- **Status**: COMPLETED.
- **Project Structure**: Created `weather-proxy/` directory as a standalone Cloudflare Worker project.
- **Configuration**:
    - Created `wrangler.toml` configured for the `aeroproc-weather-proxy` service.
    - Created `package.json` with scripts for local development and deployment.
- **Bootstrap**: Initialized `src/index.js` with a placeholder entry point.
- **Secret Management**: Prepared instructions for adding the `CHECKWX_API_KEY` secret.

### Phase 36.5 — ESC Interaction Polish & ICAO Localization (2026-04-30, 11:55:00)
- **Status**: COMPLETED.
- **Interaction Logic (ESC Key)**:
    - **Dual-Functionality**: Refined the `ESC` key to prioritize cancellation. If a drawing is in progress (>= 1 point), `ESC` now discards the shape and **re-arms** the tool instantly. If no drawing is active, `ESC` stops the tool and **closes the sub-panel**.
    - **Bug Fix**: Resolved a critical race condition where a redundant `ESC` listener was forcing auto-finalization (consolidating the form) instead of discarding it.
    - **Clean Interface**: Ensured that right-clicking or pressing `ESC` unconditionally closes any open toolbar panel (Airspaces, Objects, etc.).
- **Localization (Research Tool)**:
    - **Category-Aware Placeholders**: Added specific ICAO placeholders for Aircraft (B738), Airline (GLO), and Airport (SBGR) in both English and Portuguese.
    - **Dynamic Reactivity**: Wired the research input and empty-state card to the `languageChanged` event. Placeholders and messages now update instantly without needing to re-open the panel.
    - **Hardcode Cleanup**: Removed all remaining English search strings from `main.js`.

### Phase 36 — Application Localization (2026-04-30, 10:55:00)
- **Status**: COMPLETED.
- **Architecture**:
    - Created `src/utils/i18n.js` (translation engine) and `src/data/translations.js` (dictionary).
    - Added `data-i18n` / `data-i18n-placeholder` / `data-i18n-title` support to the entire `index.html`.
    - Integrated a Language Toggle (EN/PT) in the Sidebar header.
- **Dynamic Updates**:
    - Implemented `languageChanged` event listener in `main.js` to refresh toolbar highlights and dynamic JS strings.
    - Localized all map markers, tooltips, and procedural metadata.

### Phase 35.5 — Weather Interface Polish & Final Stability (2026-04-30, 02:40:00)
- **Status**: COMPLETED.
- **UI/UX Polishing**:
    - **Fixed "Ghost Element" Bug**: Resolved a detached DOM reference issue where Leaflet's `update()` cycle was overwriting manual DOM changes. Now using a synchronized `e.popup._content` update strategy.
    - **Restored Lost CSS**: Re-injected the comprehensive weather popup CSS (glassmorphism, typography, badges) which had been partially lost in a previous update.
    - **API Security**: Verified `.env` integration and `.gitignore` status for the CheckWX API key.
- **Interface Interaction**: Confirmed "Show Weather" buttons successfully transition from idle → loading → weather card without being reset by Leaflet's internal render loop.

### Phase 35 — Real-Time METAR/TAF Integration (2026-04-30, 00:10:00)
- **Status**: COMPLETED.
- **Architecture**:
    - Created `src/services/MetarService.js` — a self-contained module that fetches decoded METAR and TAF from the **CheckWX API**. Results are cached per-ICAO with a **10-minute TTL**.
    - **Environment Variables**: Migrated from `config.js` to Vite's native environment variable system. Created `.env` (git-ignored) and `.env.example`. Used `import.meta.env.VITE_CHECKWX_API_KEY`.
- **UI Changes** (`MapLayers.js`):
    - Upgraded Tier-1 airport markers to interactive **Leaflet popups** with a **"🌤 Show Weather"** button.
    - Implemented `_buildWeatherCard()` for glassmorphic data display including color-coded flight category badges.
    - Implemented `setFetchWeatherFn(fn)` for dependency injection, resolving circular dependency risks.
- **Stability Fixes**:
    - Resolved `ReferenceError: _fetchWeatherFn is not defined` by correctly initializing the module-level state variable.
    - Fixed `SyntaxError` caused by duplicate declarations and export conflicts in `MapLayers.js`.
    - Restored full interface functionality after server restart.

### Phase 34.5 — View Mode UX & Visual Decluttering (2026-04-30, 01:06:00)
- **Status**: COMPLETED.
- **Architectural Update**: Refined map interaction and visual clarity for co-located objects.
    - **Interaction**: Removed click popups from Airports, NAVAIDs, and Fixes in View Mode.
    - **Delayed Info**: Implemented a 2-second hover delay for detailed info tooltips/popups, ensuring they only appear when no drawing tool is active.
    - **Hitbox Optimization**: Integrated Navaid labels directly into the `divIcon` HTML, expanding the hover/click hitbox to include the text label.
    - **Hover Highlights**: Added CSS-driven hover effects for Fixes (glow/white stroke) and Navaids (symbol and label highlight).
    - **Hardcoded Decluttering**: Applied a 10px visual offset to **SBSP, SBSJ, SBKP, and SBTA** to separate them from their respective co-located NAVAIDs while preserving exact geographic coordinates for logic/snapping.

### Phase 34 — Advanced Snapping & Vector Interaction (2026-04-30, 00:39:00)
- **Status**: COMPLETED.
- **Architectural Update**: Implemented a global snapping provider and refined vector lifecycle.
    - Expanded snap logic to include Navaids, Fixes, and Airports with a strict hierarchy (Aircraft > Navaid > Fix > Airport).
    - Tightened snap radius to 1 NM for static map objects to prevent accidental snapping.
    - Implemented Shift-key override to allow free placement anywhere on the map.
    - Added support for re-snapping selected vectors via direct map clicks or the 'F' keyboard shortcut.
    - Integrated `isMeasuringVectorActive` into the global `_stopAllActiveTools` handler to fix the ESC key deactivation bug.
    - Configured the last created/modified vector to be automatically selected upon creation or re-snap.
    - Fixed interaction logic so clicking the map or pressing 'O' while a vector is selected correctly deselects it and starts a new one.

### Phase 33 — Vector Polish & Traffic Labels (2026-04-30, 00:20:00)
- **Status**: COMPLETED.
- **Architectural Update**: Refined the `LiveTraffic` and `MeasuringVector` tools visual representation.
    - Vertically aligned the measuring vector labels using a flex column and right-side accent border (`.mv-lbl-inner`).
    - Added the 4th line (Track `TRK XXX°`) on the aircraft marker labels with CSS class `.ac-trk`.
    - Wired `setLabelState` and `setAutoDeclutter` through `LiveTraffic.js` to individual sub-checkboxes in `index.html` and `main.js`.
    - Repositioned the Vector Label anchor (`[80, -5]`) to prevent overlap with aircraft icons and callsign labels.
    - Added intuitive drag-and-drop capability to measuring vector labels, allowing users to dynamically "re-snap" or move the endpoint of finalized vectors.

### Phase 32 — Dynamic Measuring Follow Mode (2026-04-29)
- **Status**: COMPLETED.
- **Architecture**: Callback pattern used to avoid circular import (MeasuringVector → LiveTraffic already existed; LiveTraffic cannot import back).
- **MeasuringVector.js**:
    - `_finalizeVector` extended with `snapTarget` param; stores `destTargetHex` in each vector entry.
    - `_buildLabelText()` / `_buildLabelIcon()` helpers extracted (DRY — used at finalize and on each redraw).
    - `_redrawVector(entry)` updates polyline LatLngs + rebuilds the label icon with fresh telemetry.
    - `updateAttachedVectors(hex, lat, lon)` exported — moves destination and redraws for all matching vectors.
    - `▶` prefix in label text signals active follow mode to the user.
- **LiveTraffic.js**: `setPositionUpdateCallback(fn)` exported; `_positionUpdateCb` fired for each existing aircraft after `setLatLng` in `_poll()`.
- **main.js**: `setPositionUpdateCallback(updateAttachedVectors)` wired immediately after `initLiveTraffic(_map)`.

### Phase 31 — Initial Visibility Profile (2026-04-29)
- **Status**: COMPLETED.
- **Changes**:
    - `MapLayers.js` (`renderAirspaces`): `defaultVisible` condition updated from `TMA || CTR` to `TMA || CTR || FIZ || ATZ` so all four types render on the map at startup.
    - `index.html`: `chk-fiz-group` and `chk-atz-group` checkboxes set to `checked` so the Airspaces panel reflects the correct ON state immediately.
    - No Restricted/Prohibited areas exist in `airspaces_aip.json` — dataset only contains TMA, CTR, FIZ, ATZ.

### Phase 30 — UI UX Polishing (Tool Highlighting & Scroll Fixes) (2026-04-29)
- **Status**: COMPLETED.
- **Features Implemented**:
    - **Dual-State Highlighting** (`main.css`): `.active` (Cyan glow) for panel-open state; `.mode-active` (Violet glow) for armed/capturing state. Both follow the glassmorphic style.
    - **Tool Lifecycle** (`main.js`): Classes applied dynamically on panel toggle and tool arm; right-click and ESC clear the armed state; mutual exclusion enforced.
    - **Scroll Clipping Fix**: `.toolbar-subpanel` `max-height` raised from `calc(100vh - 220px)` to `calc(100vh - 150px)` so Objects/Airspaces/Research panels are no longer cut off.
    - **Bottom Buffer**: `padding-bottom: 5rem` added to both `.toolbar-subpanel` (sub-panel bottom) and `.sidebar-content` (viewer list bottom).
    - **Scrollbar Visibility**: `.sidebar-content` now has a thin styled scrollbar; `.toolbar-subpanel` thumb opacity raised so overflow is clearly signalled.
    - **Smart Vertical Positioning** (`main.js`): Panels now calculate available viewport space and shift their `top` position upwards if they would overflow the bottom of the screen.
    - **Small Screen Media Query**: `@media (max-height: 700px)` reduces padding and font sizes to maximize data density on shorter viewports.

### Phase 29 — Interface Scaling & UI Refinement (2026-04-28, 23:59:00)
- **Status**: COMPLETED. Finalized the global scaling system and resolved UI regressions.
- **Features Implemented**:
    - **Interface Scaling**: Applied `--ui-scale` to search inputs, color legends, procedure metadata ("SBGR · 10L"), and group headers.
    - **Branding Protection**: Reverted "AeroProc" and "São Paulo TMA" headers to fixed sizes to ensure brand integrity.
    - **Bug Fix**: Resolved the "weird vertical text" bug in the Airspaces menu by fixing the Mojibake triangle arrow (`\25B6`).
    - **Route Tooltip**: Added `title` tooltips to procedure route previews in `Sidebar.js` to show the full sequence of fixes on hover.
    - **Symbol Fix**: (Verified) "Symbol Size" slider now correctly scales SVG icons (Navaids/Airports) via CSS transforms.

### Phase 28 — Global Scaling Control (2026-04-28, 23:33:00)
- **Status**: COMPLETED. Added user-facing sliders to control map visual density.
- **Features Implemented**:
    - **UI**: Added a "Settings" gear button in a new "View" category on the toolbar.
    - **Scaling Interface**: Created a `#panel-settings` sub-panel with sliders for **Label Size** and **Symbol Size** (0.5x to 2.0x).
    - **Real-Time Label Scaling**: Wired `--map-label-scale` CSS variable to all aeronautical and measurement labels for immediate font-size reflow.
    - **Symbol Scaling**: Implemented `applySymbolScale` in `MapLayers.js` to dynamically resize circleMarkers (Fixes, Navaids) upon slider adjustment.
    - **UX**: Added live numeric readouts for both sliders.

### Phase 27 — Aviation Research Tool (2026-04-28, 23:21:00)
- **Status**: COMPLETED. A high-performance, searchable database lookup for aviation data.
- **Features Implemented**:
    - **Backend Service**: Added `lookupAircraft`, `lookupAirline`, and `lookupAirport` to `DataLoader.js` using lazy-loading `Map` caching for O(1) retrieval speed.
    - **UI Interface**: Added a magnifying glass "Research" button in the sidebar (Data category).
    - **Sub-panel**: Built a dedicated search panel with tabbed filtering (Aircraft/Airline/Airport) and real-time result cards.
    - **UX**: Implemented clean, glassmorphic result displays in `main.js` with "Not Found" error handling.

### Phase 26 — Airspace Color Theming (2026-04-28, 23:10:00)
- **Status**: COMPLETED. Modernized the map palette for better legibility.
- **Outcome**: 
    - **CTRs**: Sky Blue (`#0ea5e9`).
    - **TMA Sectors**: Neutral Slate Gray/White (`#f1f5f9`).
    - **Outer Boundary**: White/Slate perimeter line (`#cbd5e1`) with no fill.

### Phase 25 Correction — In-Marker Notation Styling (2026-04-28, 23:05:00)
- **Status**: COMPLETED. Transitioned notation styling from the sidebar to the markers themselves.
- **Outcome**: 
    - **In-Marker Style Bar**: Size/Color controls now appear directly above the active note during editing.
    - **Interaction Lifecycle**: Notes are draggable by default when "Committed" and editable only when triggered via the right-click context menu.
    - **Event Propagation**: Fixed regressions that were blocking the context menu and dragging functionality.

### UI & Engine Refinements (2026-04-28, 22:45:00)
- **Fluid Zoom Engine** (`MapCore.js`): Added `zoomSnap: 0.1`, `zoomDelta: 0.2`, `wheelPxPerZoomLevel: 120` to the Leaflet map constructor. Fractional zoom levels and reduced wheel sensitivity produce buttery-smooth scroll-to-zoom.
- **Header Text** (`index.html`): Changed sidebar subtitle from "São Paulo (SBGR)" to "São Paulo TMA".
- **Aerodrome Icon Opacity** (`main.css`): Tier 1 (`.airport-icon-inner`) and Tier 2 (`.airport-icon-inner-regional`) now render at `opacity: 0.3` by default. On hover, full opacity is restored. Reduces visual clutter without hiding the airports entirely.
- **Viewer Mode Search Highlighting** (`MapLayers.js`): Completely redesigned `renderGlobalSearchHighlights()`. Removed the pulsing/blinking `gsh-ring` animation. Now renders the actual icon for each result type with a static glowing contour ring.

### Emergency Fix — Interface Restoration (2026-04-28, 22:30:00)
- **Diagnosis**: Identified that the `base: '/aeroproc-sp/'` setting in `vite.config.js` broke local development at the root URL.
- **Fix**: Updated `vite.config.js` to use a conditional base path: `/` for development and `/aeroproc-sp/` for production builds.

### Phase 25 — Tools Review & Optimization (2026-04-28, 15:40:00)
- **Notation Tool**: Implemented `Enter` to commit, added sidebar edit button (✎), and fixed tool deactivation.
- **Shift+Enter**: Added support for multi-line notes.
- **Right-Click to Stop**: Any active tool can now be deactivated by right-clicking on the map.
- **Two-Level Highlights**: Buttons show Cyan when the panel is open and Violet when active.
- **Visual Instructions**: Added a "Right-click to stop" hint to the cursor coordinate overlay.
- **Global ESC De-activation**: Pressing Escape now stops any active tool and refreshes the UI.
- **Airspace Transparency**: Set all airspace polygons to non-interactive to prevent interaction blocking.

### Phase 23 — Mouse Cursor Icon Sync (2026-04-28, 13:03:00)
- **Status**: COMPLETED. Map cursor dynamically updates based on the active tool.
- **Implementation**: Added `.cursor-draw`, `.cursor-text`, `.cursor-crosshair`, and `.cursor-range` classes to `main.css`.

### Phase 22 — Range Tool (DME Circles) (2026-04-28, 12:50:53)
- **Status**: COMPLETED. Concentric NM distance rings from any center point on the map.
- **Features**: Interval (NM) and Ring Count (max 20) configuration, manual Lat/Lon entry, floating "X NM" labels.

### Phase 21 — Geo Point Tool (2026-04-28, 12:11:35)
- **Status**: COMPLETED. Precision coordinate markers with decimal labels and management list.

### Phase 20 — Drawing UX Overhaul (2026-04-28, 11:30:00)
- **Features**: Cursor coordinate overlay, vertex engraving, and per-tool management panels.

### Phase 18/19 — Ephemeral Line & Notation Tools (2026-04-28, 07:41:00)
- **Status**: COMPLETED. Added single-object polylines with 15px hitboxes and free-text annotations.

### Phase 17 — Advanced Instructional Tools (2026-04-27)
- **Features**: EphemeralDraw.js (Polygons/Circles), MeasuringVector.js (Aircraft Snap + ETA), and Automated Deployment Pipeline via GitHub Actions.

### Phase 16 — Traffic Route Lookup (2026-04-27)
- **Status**: COMPLETED. Integrated adsbdb.com for live route (ORIG→DEST) lookup and coloring based on arrival/departure airport.

### Phase 15 — Live ADS-B Traffic Integration (2026-04-26)
- **Status**: COMPLETED. Multi-source ADS-B feed integration with direction-based coloring and real-time telemetry labels.

### Phase 36 — Application Localization (2026-04-30)
- **Status**: COMPLETED.
- **Features**: Implemented a comprehensive `i18n.js` utility, `translations.js` schema dictionary, complete DOM tagging using `data-i18n` attributes, and built a segmented-pill Language Toggle in the Sidebar.

### Phase 37 — API Security & Proxy Integration (2026-05-01)
- **Status**: COMPLETED.
- **Features**: Implemented a serverless Cloudflare Worker gateway to securely proxy CheckWX API requests, protecting secrets and enforcing domain-locking for deployment stability.

---

1.  **Phase 39 - VFR Corridors (REA/REH)**: Integrate CCV data with bidirectional altitudes and mandatory fix visibility.
2.  **Phase 40 - Persistent Database**: Move to Supabase for multi-user procedure syncing.
3.  **Phase 41 - Engine Migration & Magnetic North**: Transition to MapLibre for 22-degree radar rotation.
