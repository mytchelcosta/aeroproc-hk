// ============================================================
// DrawingState.js - The Procedure Builder State Machine
// ============================================================
// This module stores the complete state of whatever procedure
// or airspace area the user is currently building. It works
// like a shopping cart: the user adds points one by one, and
// at the end, toJSON() produces the finished data object.
//
// Because this is an ES module singleton, importing it from
// multiple files always gives the SAME shared object — there
// is only ever ONE active build session at a time.
//
// Phase 12 — Direction-Aware Branching:
// Transitions now have a DIRECTION field that reflects how the
// procedure flows:
//
//   STAR / IAC (arrivals): transitions are INBOUND — they start
//   from an Initial Approach Fix (IAF) and converge onto the
//   common route at a shared CONVERGENCE FIX. The user draws
//   "backward" (IAF → convergence fix). The convergence fix is
//   NOT stored in transition.points — it is stored separately
//   as 'convergence_fix'.
//
//   SID (departures): transitions are OUTBOUND — they depart
//   from a point on the common route (DIVERGENCE FIX) toward
//   different exit waypoints. The user draws "forward" (divergence
//   fix → exit). The divergence fix is stored as 'divergence_fix'.
//
// Data structure produced by toJSON():
//   {
//     common_route: [ ...points... ],
//     transitions: [
//       {
//         name:            "via CELSO",
//         direction:       "inbound",
//         convergence_fix: "REDE",
//         points:          [ CELSO, MIDPT ]   // NOT including REDE
//       },
//       {
//         name:           "to PERES",
//         direction:      "outbound",
//         divergence_fix: "DUMO",
//         points:         [ PERES ]           // NOT including DUMO
//       }
//     ]
//   }
//
// Backward compatibility: old transitions without a 'direction' field
// are treated as un-directed and rendered as raw point sequences.
// ============================================================

// Procedure types that produce a connected line (L.polyline) on the map.
const ROUTE_TYPES = ['SID', 'STAR', 'IAC'];

// Airspace types that produce a closed area shape (L.polygon) on the map.
const AREA_TYPES = ['CTR', 'FIS', 'TMA', 'ATZ'];

// Default map colors per type, matching the CSS color palette.
const COLOR_PRESETS = {
  SID:  '#3b9eff',  // blue  — matches --color-sid
  STAR: '#ffb547',  // amber — matches --color-star
  IAC:  '#4ddb8d',  // green — matches --color-iac
  CTR:  '#ff6b6b',  // red   — matches --color-ctr
  FIS:  '#c084fc',  // purple— matches --color-fis
  TMA:  '#fb923c',  // orange— matches --color-tma
  ATZ:  '#facc15'   // yellow— matches --color-atz
};


// Private helper: converts a live point object from the DrawingState 'points' array
// into the plain, JSON-serializable format used in toJSON() output. Kept as a
// module-level function so both common_route and transition branch exports use
// identical formatting without duplicating the field list.
//
// 'p' — a point object from DrawingState.points with all live fields
const _serializePoint = (p) => ({
  ident:          p.ident,
  lat:            parseFloat(p.lat.toFixed(6)),
  lon:            parseFloat(p.lon.toFixed(6)),
  levelCondition: p.levelCondition || null,
  levelValue:     p.levelValue     || null,
  speedCondition: p.speedCondition || null,
  speedValue:     p.speedValue     || null,
  isFix:          p.isFix,
  isHolding:      p.isHolding      || false,
  holdingBearing: p.isHolding ? (p.holdingBearing || null) : null,
  holdingSide:    p.isHolding ? (p.holdingSide    || 'RIGHT') : null
});


// The one shared state object. Every module that imports this
// file reads and writes to the same instance in memory.
const DrawingState = {

  // Whether the user is actively building a procedure right now.
  isActive: false,

  // The options the user selected in the metadata form before drawing.
  metadata: {
    name:    '',
    type:    'SID',          // one of the 7 recognized types
    pattern: 'solid',        // 'solid', 'dashed', or 'dotted'
    color:   COLOR_PRESETS.SID,
    airport: '',             // ICAO airport identifier (e.g. 'SBGR')
    runway:  ''              // runway designation (e.g. '10L/28R')
  },

  // The currently active editing buffer.
  //
  // In NORMAL (common route) mode:
  //   'points' holds the main route data. This is what gets saved as common_route.
  //
  // In TRANSITION mode (after startTransition() is called):
  //   'points' is REPLACED with a fresh empty array for the new branch.
  //   The original common route is saved in 'common_route' (see below).
  //
  // All addPoint / removePoint / movePoint / updatePoint calls always operate on
  // this array regardless of mode, so the rest of the app needs no changes.
  //
  // Each entry has this exact shape:
  //   {
  //     ident:          'ASPAT',    fix name OR 'Runway Threshold' OR 'Custom Point'
  //     lat:            -23.45,     decimal latitude
  //     lon:            -46.30,     decimal longitude
  //     levelCondition: 'Above',    '' | 'At' | 'Above' | 'Below'
  //     levelValue:     'FL100',    the altitude value; empty string if no restriction
  //     speedCondition: 'At Least', '' | 'At' | 'At Least' | 'Less Than'
  //     speedValue:     '250kt',    the speed value; empty string if no restriction
  //     isFix:          true        false for map-click / manual / threshold points
  //     isHolding:      false       true when this point is designated as a holding fix
  //     holdingBearing: '090',      inbound leg bearing in degrees (string); '' if not holding
  //     holdingSide:    'RIGHT'     'LEFT' or 'RIGHT' — the side of the turn in the hold
  //   }
  points: [],

  // ── Phase 12: Transition / Branching state ───────────────────────────────────

  // Snapshot of the common route points, saved when startTransition() is called.
  // When NOT in transition mode, the live common route is in 'points' instead.
  // When IN transition mode, 'points' has been replaced by the transition buffer,
  // so we read the common route from here (e.g. to draw it as a ghost on the map).
  common_route: [],

  // Array of COMPLETED (finalized) transition branches.
  // Each element: { name, direction, convergence_fix|divergence_fix, points }
  // Grows by one each time finishTransition() is called successfully.
  transitions: [],

  // True while the user is drawing a branch, false while drawing the common route.
  _inTransitionMode: false,

  // The user-chosen label for the transition currently being drawn (set at start).
  // In Phase 12 this is kept for internal use but the user is prompted for the name
  // at COMPLETION (not upfront), so this defaults to '' until finishTransition().
  _activeTransitionName: '',

  // 'inbound' when drawing a STAR/IAC transition (IAF → convergence fix).
  // 'outbound' when drawing a SID transition (divergence fix → exit).
  // null when not in transition mode.
  _transitionDirection: null,

  // The IDENT of the key fix for this transition:
  //   • inbound:  the CONVERGENCE FIX where the transition terminates
  //   • outbound: the DIVERGENCE FIX where the transition originates
  // Used by the auto-finish logic in main.js (_triggerPointAdded).
  convergencePointIdent: null,

  // ── End Phase 12 fields ──────────────────────────────────────────────────────

  // The live Leaflet shape (L.polyline or L.polygon) currently on the map.
  // null when no session is active.
  activeShape: null,

  // Returns true if the current type should draw as a closed area (polygon).
  // Returns false if it should draw as a route line (polyline).
  isAreaType() {
    return AREA_TYPES.includes(this.metadata.type);
  },

  // Start a fresh build session with the user's chosen metadata.
  // Wipes any data left over from a previous session — including all transition state.
  //
  // 'name'    — user-typed label (e.g. 'ASPAT1A')
  // 'type'    — one of: SID, STAR, IAC, CTR, FIS, TMA, ATZ
  // 'pattern' — one of: solid, dashed, dotted
  // 'color'   — a hex string (e.g. '#3b9eff')
  start(name, type, pattern, color, airport = '', runway = '') {
    this.isActive              = true;
    this.metadata              = { name, type, pattern, color, airport, runway };
    this.points                = [];
    this.common_route          = [];
    this.transitions           = [];
    this._inTransitionMode     = false;
    this._activeTransitionName = '';
    this.convergencePointIdent = null;
    this.activeShape           = null;
    console.log(`[DrawingState] Session started: ${type} "${name}" | ${airport} ${runway} | ${pattern} | ${color}`);
  },

  // Append a fully-formed point object to the end of the active sequence.
  // In normal mode this adds to the common route; in transition mode it adds
  // to the current branch. The rest of the app doesn't need to care which.
  //
  // 'pointData' must include: ident, lat, lon, levelCondition, levelValue,
  // speedCondition, speedValue, and isFix.
  addPoint(pointData) {
    if (!this.isActive) {
      console.warn('[DrawingState] addPoint: no active session. Call start() first.');
      return;
    }
    this.points.push(pointData);
    const mode = this._inTransitionMode ? `transition "${this._activeTransitionName}"` : 'common route';
    console.log(`[DrawingState] Added "${pointData.ident}" to ${mode} — ${this.points.length} pts.`);
  },

  // Remove the point at the given index, shifting subsequent points up.
  removePoint(index) {
    if (index < 0 || index >= this.points.length) {
      console.error(
        `[DrawingState] removePoint: index ${index} is out of range ` +
        `(${this.points.length} points exist).`
      );
      return;
    }
    const [removed] = this.points.splice(index, 1);
    console.log(`[DrawingState] Removed "${removed.ident}" at index ${index}.`);
  },

  // Moves a point one position up or down in the sequence.
  // 'direction' must be 'up' (towards index 0) or 'down' (towards end).
  // Does nothing if the point is already at the boundary in that direction.
  movePoint(index, direction) {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= this.points.length) {
      console.warn(`[DrawingState] movePoint: index ${index} is already at the ${direction} boundary.`);
      return;
    }
    const [removed] = this.points.splice(index, 1);
    this.points.splice(targetIndex, 0, removed);
    console.log(`[DrawingState] Moved "${removed.ident}" from index ${index} to ${targetIndex}.`);
  },

  // Updates the restriction and holding data of the point at 'index'.
  // Never changes the point's ident, tipo, or isFix — only the user-editable fields.
  // 'changes' is an object with any subset of the allowed keys below.
  updatePoint(index, changes) {
    if (index < 0 || index >= this.points.length) {
      console.error(`[DrawingState] updatePoint: index ${index} is out of range.`);
      return;
    }
    const allowed = [
      'levelCondition', 'levelValue',
      'speedCondition', 'speedValue',
      'isHolding', 'holdingBearing', 'holdingSide'
    ];
    allowed.forEach((key) => {
      if (key in changes) this.points[index][key] = changes[key];
    });
    console.log(
      `[DrawingState] Updated point at index ${index}: ` +
      `level=${this.points[index].levelCondition} ${this.points[index].levelValue}, ` +
      `speed=${this.points[index].speedCondition} ${this.points[index].speedValue}, ` +
      `holding=${this.points[index].isHolding ? `${this.points[index].holdingBearing}° ${this.points[index].holdingSide}` : 'no'}.`
    );
  },

  // Updates only the lat/lon coordinates of the point at 'index'.
  // Called during dragging of custom coordinate points so the DrawingState
  // stays in sync with the marker position as the user moves it on the map.
  updatePointCoords(index, lat, lon) {
    if (index < 0 || index >= this.points.length) {
      console.error(`[DrawingState] updatePointCoords: index ${index} is out of range.`);
      return;
    }
    this.points[index].lat = lat;
    this.points[index].lon = lon;
    // Intentionally NOT logging here — this fires on every mouse-move during drag.
  },


  // ── Phase 12: Transition management ─────────────────────────────────────────


  // Begins drawing a new transition branch.
  //
  // Phase 12 changes: the name is NO LONGER required upfront — it is prompted
  // at COMPLETION (via finishTransition(name)). The direction determines how
  // the branch connects to the common route:
  //   'inbound'  → STAR/IAC: user draws IAF → ... → convergence fix (auto-finish on click)
  //   'outbound' → SID:      user draws from divergence fix → exit (manual End button)
  //
  // What this does:
  //   1. Snapshots 'points' as 'common_route' (locked until this transition ends).
  //   2. Replaces 'points' with a fresh empty array for the new branch.
  //   3. Records the key fix and direction for rendering and auto-finish logic.
  //
  // 'fixIdent'  — for inbound: the convergence fix; for outbound: the divergence fix
  // 'direction' — 'inbound' or 'outbound'
  startTransition(fixIdent, direction) {
    if (!this.isActive) {
      console.warn('[DrawingState] startTransition: no active session. Cannot start a transition.');
      return;
    }
    if (this._inTransitionMode) {
      console.warn('[DrawingState] startTransition: already in transition mode. Finish the current one first.');
      return;
    }

    // Lock the common route and switch the editing buffer to a fresh empty branch.
    this.common_route          = this.points.slice();  // snapshot; the original stays untouched
    this._transitionDirection  = direction;            // 'inbound' or 'outbound'
    this.convergencePointIdent = fixIdent;             // the key fix ident (for auto-finish + schema)
    this._inTransitionMode     = true;
    this._activeTransitionName = '';                   // name is assigned at completion
    this.points                = [];                   // fresh buffer for the new branch
    this.activeShape           = null;                 // old shape ref is stale

    console.log(
      `[DrawingState] ${direction} transition started. ` +
      `Common route locked at ${this.common_route.length} pts. ` +
      `Key fix: "${fixIdent}".`
    );
  },

  // Finalizes the active transition branch and adds it to the 'transitions' array.
  //
  // Phase 12 changes: accepts a 'name' parameter (prompted at completion), and
  // includes the direction and convergence/divergence fix in the saved entry.
  //
  // 'name' — user-chosen label for this branch (e.g. "via CELSO"); optional,
  //           defaults to "T{n}" if not provided or the user cancelled the prompt.
  finishTransition(name) {
    if (!this._inTransitionMode) {
      console.warn('[DrawingState] finishTransition: not in transition mode. Nothing to finish.');
      return;
    }

    const resolvedName = (name && name.trim()) || `T${this.transitions.length + 1}`;

    // Build the entry object. The direction-specific key fix is stored separately from
    // 'points' so rendering code can look up the fix's coordinates from the common route
    // and connect the line without duplicating the fix in the points array.
    const entry = {
      name:      resolvedName,
      direction: this._transitionDirection,  // 'inbound', 'outbound', or null (old format)
      points:    this.points.slice()          // snapshot — does NOT include convergence/divergence fix
    };

    if (this._transitionDirection === 'inbound') {
      entry.convergence_fix = this.convergencePointIdent;  // fix where branch terminates
    } else if (this._transitionDirection === 'outbound') {
      entry.divergence_fix = this.convergencePointIdent;   // fix where branch originates
    }

    this.transitions.push(entry);

    console.log(
      `[DrawingState] Transition "${resolvedName}" (${this._transitionDirection || 'undirected'}) finalized ` +
      `(${entry.points.length} pts, key fix: "${this.convergencePointIdent}"). ` +
      `Total transitions: ${this.transitions.length}.`
    );

    // Return to common-route editing mode.
    this._inTransitionMode     = false;
    this._transitionDirection  = null;
    this._activeTransitionName = '';
    this.convergencePointIdent = null;
    this.points                = this.common_route.slice();  // restore the editing buffer
    this.activeShape           = null;                        // main.js will recreate the shape
  },

  // End the session and wipe all data, ready for the next build.
  reset() {
    this.isActive              = false;
    this.metadata              = { name: '', type: 'SID', pattern: 'solid', color: COLOR_PRESETS.SID, airport: '', runway: '' };
    this.points                = [];
    this.common_route          = [];
    this.transitions           = [];
    this._inTransitionMode     = false;
    this._activeTransitionName = '';
    this._transitionDirection  = null;
    this.convergencePointIdent = null;
    this.activeShape           = null;
    console.log('[DrawingState] Session reset. Ready for next build.');
  },

  // Produce a plain, JSON-serializable object for the finished procedure.
  //
  // Phase 12 output schema:
  //   {
  //     name, type, airport, runway,
  //     lineStyle: { pattern, color },
  //     common_route: [ ...serialized points... ],
  //     transitions: [
  //       { name, direction, convergence_fix, points: [...] },  // inbound
  //       { name, direction, divergence_fix,  points: [...] }   // outbound
  //     ]
  //   }
  //
  // The convergence/divergence fix is NOT duplicated inside 'points'.
  // If the user is mid-transition when they save, the in-progress branch is NOT exported.
  toJSON() {
    // When in transition mode, this.points holds the unfinished branch buffer.
    // The real common-route data is in this.common_route.
    // When NOT in transition mode, this.points IS the common route.
    const routePoints = this._inTransitionMode ? this.common_route : this.points;

    if (this._inTransitionMode) {
      console.warn(
        '[DrawingState] toJSON() called while in transition mode. ' +
        'The in-progress transition will not be included in the export.'
      );
    }

    return {
      name:    this.metadata.name || '(unnamed)',
      type:    this.metadata.type,
      airport: this.metadata.airport || '',
      runway:  this.metadata.runway  || '',
      lineStyle: {
        pattern: this.metadata.pattern,
        color:   this.metadata.color
      },
      common_route: routePoints.map(_serializePoint),
      // Serialize each transition preserving its direction-aware schema.
      // Old-format transitions (no direction) pass through unchanged.
      transitions: this.transitions.map((t) => {
        const entry = {
          name:      t.name,
          direction: t.direction || null,
          points:    t.points.map(_serializePoint)
        };
        if (t.direction === 'inbound'  && t.convergence_fix) entry.convergence_fix = t.convergence_fix;
        if (t.direction === 'outbound' && t.divergence_fix)  entry.divergence_fix  = t.divergence_fix;
        return entry;
      })
    };
  }
};

export { DrawingState, ROUTE_TYPES, AREA_TYPES, COLOR_PRESETS };
