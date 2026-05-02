// ============================================================
// MapCore.js - The Map Engine Initializer
// ============================================================
// This file is responsible for ONE thing: creating and configuring
// the Leaflet map with its initial view, tile layer (background
// imagery), and zoom controls.
//
// It does NOT render procedures, waypoints, or aviation data layers.
// That work belongs to MapLayers.js, keeping concerns separated.
// ============================================================


// This private helper builds and appends a Magnetic Compass Rose overlay to the
// map container. The rose is a raw DOM element (not a Leaflet control) so it
// stays in a fixed corner regardless of map pan or zoom.
//
// It shows two arrows originating from a shared centre:
//   TN (True North) — dim blue-white, pointing straight up, matching the tile grid.
//   MN (Magnetic North) — amber, rotated 3° counter-clockwise, representing
//       Hong Kong's ~3°W magnetic declination.
//
// A small arc and "3°W" label between the arrows communicate the angular gap.
// This gives pilots and procedure designers a constant visual anchor so they never
// forget that 090° magnetic does not point perfectly right on the map.
//
// 'mapElement' — the #map DOM node that Leaflet has been attached to.
//   The rose div is appended directly to it; CSS (bottom-right corner) handles
//   positioning. pointer-events:none on the wrapper ensures it never blocks clicks.
const _addCompassRose = (mapElement) => {
  const rose = document.createElement('div');
  rose.className = 'compass-rose';

  // The SVG uses a coordinate system centred at (0,0).
  // viewBox="-45 -45 90 90" gives ±45 units in every direction from centre.
  // Both arrows start at (0,0) and point toward (0,−34) before any rotation.
  //
  // SVG rotate(-3) in screen space (where +y points DOWN) rotates the MN arrow
  // 3° counter-clockwise, i.e. toward the west — correct for a 3°W declination.
  //
  // Computed absolute position of MN arrow tip after rotate(-3) applied to (0,−34):
  //   x′ = −34 × sin(3°) ≈ −1.8
  //   y′ = −34 × cos(3°) ≈ −33.9
  // The "MN" text label is placed just beyond that point.
  //
  // The small arc (radius 19) traces the angular gap from TN (0,−19) to the
  // rotated equivalent (−1.0, −19.0), drawn counter-clockwise (sweep-flag=0).
  rose.innerHTML = `
    <svg viewBox="-45 -45 90 90" width="88" height="88" xmlns="http://www.w3.org/2000/svg">

      <!-- Translucent dark background disc with a faint border -->
      <circle r="43" fill="rgba(5,8,14,0.82)" stroke="rgba(255,255,255,0.13)" stroke-width="0.8"/>

      <!-- Cardinal tick marks around the ring.
           North tick is longer and brighter to reinforce the up=North orientation. -->
      <line x1="0"   y1="-43" x2="0"   y2="-37" stroke="rgba(255,255,255,0.30)" stroke-width="1.2"/>
      <line x1="43"  y1="0"   x2="37"  y2="0"   stroke="rgba(255,255,255,0.13)" stroke-width="0.7"/>
      <line x1="0"   y1="43"  x2="0"   y2="37"  stroke="rgba(255,255,255,0.13)" stroke-width="0.7"/>
      <line x1="-43" y1="0"   x2="-37" y2="0"   stroke="rgba(255,255,255,0.13)" stroke-width="0.7"/>

      <!-- TRUE NORTH arrow — dim blue-white, pointing straight up.
           Matches the tile grid orientation (geographic / True North). -->
      <line x1="0" y1="3" x2="0" y2="-27" stroke="rgba(180,210,255,0.50)" stroke-width="1.5"/>
      <polygon points="0,-34 -3.5,-26 3.5,-26" fill="rgba(180,210,255,0.50)"/>
      <!-- "TN" label — nudged right so it does not collide with the MN label -->
      <text x="6" y="-35"
            font-family="JetBrains Mono,monospace" font-size="7" font-weight="700"
            fill="rgba(180,210,255,0.78)">TN</text>

      <!-- MAGNETIC NORTH arrow — amber, rotated 22° CCW to depict 22°W declination.
           The entire arrow (shaft + head) lives inside the rotate group so both
           elements transform together without any coordinate arithmetic. -->
      <g transform="rotate(-3)">
        <line x1="0" y1="3" x2="0" y2="-27" stroke="#ffb547" stroke-width="1.8"/>
        <polygon points="0,-34 -4,-25 4,-25" fill="#ffb547"/>
      </g>
      <!-- "MN" label at the absolute position of the rotated arrow tip (~-1.8, -33.9).
           Placed outside the rotate group so the text itself stays upright. -->
      <text x="-12" y="-35"
            font-family="JetBrains Mono,monospace" font-size="7" font-weight="700"
            fill="#ffb547">MN</text>

      <!-- Small arc that traces the angular gap between the two arrow directions.
           From TN direction (0,−19) to MN direction (−7.1,−17.6) counter-clockwise.
           Sweep-flag=0 = CCW in SVG; large-arc-flag=0 = take the short 22° arc. -->
      <path d="M 0,-19 A 19,19 0 0,0 -1.0,-19.0"
            stroke="rgba(255,181,71,0.40)" stroke-width="0.9" fill="none"/>

      <!-- Angular gap label in the wedge between the two arrows -->
      <text x="-4" y="-10"
            font-family="JetBrains Mono,monospace" font-size="5.5"
            fill="rgba(255,181,71,0.75)">3&#xB0;W</text>

      <!-- Centre anchor dot -->
      <circle r="2.2" fill="rgba(255,255,255,0.38)"/>

      <!-- Footer legend -->
      <text x="0" y="42" text-anchor="middle"
            font-family="JetBrains Mono,monospace" font-size="5.5" letter-spacing="0.8"
            fill="rgba(255,255,255,0.28)">MAG DEC</text>

    </svg>`;

  mapElement.appendChild(rose);
};


// This function creates and returns the Leaflet map object.
// It must be called AFTER the HTML page has loaded, because Leaflet
// needs to find the '#map' div in the DOM to attach itself to.
//
// Returns: the Leaflet map instance, or null if setup fails.
const initMap = () => {
  // Safety check: confirm the #map div exists before Leaflet tries to use it.
  // If it's missing (typo in HTML, wrong ID, etc.), we get a clear error
  // instead of a cryptic Leaflet crash.
  const mapElement = document.getElementById('map');
  if (!mapElement) {
    console.error(
      '[MapCore] Cannot initialize map: No element with id="map" found in the HTML. ' +
      'Check that index.html contains <div id="map"></div>.'
    );
    return null;
  }

  // Create the Leaflet map object, centered on VHHH (Hong Kong International Airport).
  // Coordinates: Latitude 22.3089° North, Longitude 113.9146° East.
  // Zoom level 10 shows a good overview of the Hong Kong TMA (Terminal Maneuvering Area).
  // We disable the default zoom control here so we can reposition it below.
  //
  // Fluid zoom settings (Phase 15):
  //   zoomSnap: 0.1       — allows fractional zoom levels (0.1 increments) so the map
  //                          settles at any fine-grained level rather than snapping to integers.
  //   zoomDelta: 0.2      — each +/- button press moves only 0.2 zoom levels, giving very
  //                          incremental, controllable zoom steps.
  //   wheelPxPerZoomLevel — how many pixels of scroll wheel travel equals 1 full zoom level.
  //                          120px (double the 60px default) means the user must scroll further
  //                          per step, producing a slower, buttery-smooth zoom feel.
  const map = L.map('map', {
    zoomControl:        false,
    zoomSnap:           0.1,
    zoomDelta:          0.2,
    wheelPxPerZoomLevel: 120
  }).setView([22.3089, 113.9146], 10);

  // Add the background tile layer — this is the imagery you see behind the procedures.
  // We use CartoDB "Dark Matter" tiles for a sleek dark-mode aesthetic that makes
  // our blue SIDs, amber STARs, and green IAC overlays stand out clearly.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  // Re-add the zoom control positioned to the top-right corner.
  // This avoids visual overlap with the sidebar on the left side.
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Airport icons are rendered by MapLayers.renderAerodromes() during the startup
  // sequence in main.js, using real data from DataLoader.loadAerodromes().

  // Inject the magnetic compass rose into the bottom-right corner of the map.
  // This permanently reminds users that the map is oriented to True North while
  // all aviation bearings (headings, radials, procedure tracks) use Magnetic North.
  _addCompassRose(mapElement);

  return map;
};

export { initMap };
