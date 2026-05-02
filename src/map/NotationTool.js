// ============================================================
// NotationTool.js - Session-Only Free Text Notes
// ============================================================
// Lets instructors leave temporary text annotations directly on
// the map during a live teaching session. Notes are purely
// in-memory — they are NOT saved to any database, and vanish on
// page reload.
//
// Drawing flow:
//   1. Enable notation mode (btn-notation enable checkbox or enableNotationTool()).
//   2. Click anywhere on the map to drop a text cursor.
//   3. Type the note text. Tab or click elsewhere to confirm.
//   4. If left empty, the note is automatically removed.
//   5. Right-click any note for: Edit / Lock Position / Delete.
//
// Style controls (set via sub-panel BEFORE placing notes):
//   - Font size: XS (10px) / S (12px) / M (14px) / L (18px) / XL (24px)
//   - Color palette: White, Yellow, Cyan, Lime, Orange, Red
//
// Interactivity:
//   - Drag to reposition (disabled while typing; re-enabled on blur).
//   - Right-click → "Lock Position" prevents accidental dragging.
//   - "Delete All Notes" button with confirmation prompt.
//
// Hard limit: _MAX_NOTES = 30 per session.
//
// Public API:
//   initNotationTool(mapInstance)  — call once at startup
//   enableNotationTool()           — activate placement mode
//   disableNotationTool()          — deactivate (notes remain on map)
//   clearAllNotes()                — remove all notes (with confirmation)
//   isNotationActive()             — true when notation mode is on
//   setNotationFontSize(sizeKey)   — set default size for new notes ('XS'|'S'|'M'|'L'|'XL')
//   setNotationColor(colorValue)   — set default color for new notes (hex string)
// ============================================================


// ── Style constants ───────────────────────────────────────────────────────────

// Default note style — white text at a medium size, legible on dark map tiles.
const _DEFAULT_FONT_SIZE = '14px';
const _DEFAULT_COLOR     = '#ffffff';

// Maximum notes allowed simultaneously (session-level cap).
const _MAX_NOTES = 30;


// ── Module-level state ────────────────────────────────────────────────────────
let _map           = null;   // Leaflet map instance (set by initNotationTool)
let _mode          = null;   // null | 'notation'
let _notes         = [];     // Array of { id, marker, text, fontSize, color, locked, visible }
let _nextId        = 1;
let _clickHandler  = null;   // map 'click' handler (detached on disable)
let _contextMenuEl = null;   // reused DOM element for the right-click menu

// Current style settings for NEW notes.
let _currentFontSize = _DEFAULT_FONT_SIZE;
let _currentColor    = _DEFAULT_COLOR;

// Callback invoked whenever the notes collection changes (add, delete, visibility toggle).
// Registered by main.js via setNoteChangeCallback() to keep the Notation sub-panel in sync.
let _onNoteChange = null;

// Phase 25: Callback invoked when a note is focused/selected for styling updates.
let _onNoteSelected = null;


// ── Public API ────────────────────────────────────────────────────────────────


// Stores the map reference and builds the shared context-menu DOM element.
// Must be called once before any other function. Does NOT activate notation mode.
//
// 'mapInstance' — the Leaflet map returned by MapCore.initMap()
const initNotationTool = (mapInstance) => {
  _map = mapInstance;

  // Single context-menu element reused on every right-click to avoid
  // accumulating duplicate DOM nodes over the course of a session.
  _contextMenuEl             = document.createElement('div');
  _contextMenuEl.id          = 'notation-context-menu';
  _contextMenuEl.className   = 'mv-context-menu';
  _contextMenuEl.style.display = 'none';
  document.body.appendChild(_contextMenuEl);

  // Dismiss the menu on any outside click or Escape.
  document.addEventListener('click', (e) => {
    if (_contextMenuEl && !_contextMenuEl.contains(e.target)) _hideContextMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _hideContextMenu();
  });

  console.log('[NotationTool] Initialized.');
};


// Activates notation placement mode.
// Clicking anywhere on the map (that is not an existing note) drops a new text cursor.
// Calling this when notation mode is already on is a no-op.
const enableNotationTool = () => {
  if (!_map || _mode === 'notation') return;
  _mode = 'notation';

  // The click handler creates a new note wherever the user clicks, unless the click
  // landed on an existing note element (originalEvent.target.closest guards this).
  _clickHandler = (e) => {
    if (e.originalEvent.target.closest('.notation-wrap')) return;
    _placeNote(e.latlng);
  };

  _map.on('click', _clickHandler);
  _map.getContainer().style.cursor = 'text';

  // Mark the "Place Note" button inside the Notation sub-panel as active.
  // The panel button (btn-notation) is now a panel toggle, not a direct draw toggle.
  document.getElementById('btn-start-notation')?.classList.add('active');

  console.log('[NotationTool] Notation mode ENABLED — click on the map to place a text note.');
};


// Deactivates notation placement mode.
// All existing notes remain on the map; no new notes can be placed.
// Calling this when notation mode is off is a no-op.
const disableNotationTool = () => {
  if (!_map || _mode === null) return;

  if (_clickHandler) { _map.off('click', _clickHandler); _clickHandler = null; }
  _map.getContainer().style.cursor = '';
  _mode = null;

  document.getElementById('btn-start-notation')?.classList.remove('active');
  
  // Fire the change callback so main.js knows to update toolbar highlights (de-highlight).
  _onNoteChange?.(_notes);

  console.log('[NotationTool] Notation mode DISABLED.');
};


// Returns true while notation placement mode is active.
const isNotationActive = () => _mode === 'notation';


// ── Private: note placement ───────────────────────────────────────────────────


// Creates a new draggable text-note marker at the given map coordinate.
// The note's contenteditable span is focused automatically after placement
// so the user can begin typing immediately.
//
// 'latlng' — Leaflet LatLng of the map click that triggered placement
const _placeNote = (latlng) => {
  if (_notes.length >= _MAX_NOTES) {
    console.warn(`[NotationTool] Session limit of ${_MAX_NOTES} notes reached. Delete some notes first.`);
    return;
  }

  const id       = _nextId++;
  const fontSize = _currentFontSize;
  const color    = _currentColor;

  // Build a Leaflet DivIcon containing the contenteditable note span.
  // className: 'notation-marker' replaces the default 'leaflet-div-icon' class
  // so we avoid Leaflet's white background and black border defaults.
  const icon = L.divIcon({
    className: 'notation-marker',
    html:      _buildNoteHtml(id, '', fontSize, color),
    iconSize:  null,    // let CSS control the size — do not constrain the container
    iconAnchor: [0, 0]  // top-left of the icon sits at the clicked latlng
  });

  const marker = L.marker(latlng, {
    icon,
    draggable: true,
    autoPan:   false
  }).addTo(_map);

  // Track this note in the session array BEFORE the setTimeout fires so the
  // blur and contextmenu handlers can always look up noteObj by id.
  // 'visible: true' is set immediately; it is flipped by toggleNoteVisibility().
  const noteObj = { id, marker, text: '', fontSize, color, locked: false, visible: true };
  _notes.push(noteObj);

  // Note interaction (Drag, Context Menu) is now managed via listeners 
  // attached to the DOM element in the setTimeout block below, to 
  // ensure reliable propagation even when contenteditable is active.

  // When the drag ends, update noteObj's stored position so it reflects the
  // new latlng if we ever need it (e.g. future save or export).
  marker.on('dragend', () => {
    const pos = marker.getLatLng();
    noteObj.lat = pos.lat;
    noteObj.lon = pos.lng;
    console.log(`[NotationTool] Note #${id} moved to (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}).`);
  });

  // The Leaflet DivIcon DOM element is added to the map synchronously during
  // addTo(), but the element may not yet be fully positioned when this tick
  // runs. A short timeout ensures the element exists in the DOM before we
  // query it and attach the text-editing listeners.
  setTimeout(() => {
    const el = _getNoteElement(id);
    if (!el) return;

    // Manage propagation: we want 'mousedown' to bubble when the note is 
    // committed (allowing Leaflet to drag the marker), but we must STOP 
    // it when editing (allowing the user to select text/position caret).
    el.addEventListener('mousedown', (e) => {
      const textEl = el.querySelector('.notation-text');
      if (textEl && textEl.contentEditable === 'true') {
        e.stopPropagation();
      }
    });

    // Right-click context menu: attached directly to the DOM element for 
    // maximum reliability across different browsers and Leaflet versions.
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      _showContextMenu(e.clientX, e.clientY, id);
    });

    const textEl = el.querySelector('.notation-text');
    if (!textEl) return;

    // ── Floating style bar ────────────────────────────────────────────────────
    // Reflects which size/color buttons should appear highlighted (.active) based
    // on the note's CURRENT style. Called on focus and after any style change.
    const _syncBar = () => {
      const sizeKeys = { '10px': 'XS', '12px': 'S', '14px': 'M', '18px': 'L', '24px': 'XL' };
      const activeSize = sizeKeys[noteObj.fontSize] || 'M';
      el.querySelectorAll('.size-btn').forEach((b) =>
        b.classList.toggle('active', b.dataset.size === activeSize));
      el.querySelectorAll('.color-swatch').forEach((s) =>
        s.classList.toggle('active',
          s.dataset.color.toLowerCase() === (noteObj.color || '#ffffff').toLowerCase()));
    };

    // Size buttons — use mousedown (not click) with preventDefault so the
    // contenteditable span never loses focus before the update is applied.
    // The change is immediately reflected in the live text via inline style.
    el.querySelectorAll('.size-btn').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const sizeValues = { 'XS': '10px', 'S': '12px', 'M': '14px', 'L': '18px', 'XL': '24px' };
        const newSize = sizeValues[btn.dataset.size] || '14px';
        noteObj.fontSize  = newSize;
        _currentFontSize  = newSize;   // persist as default for subsequent new notes
        textEl.style.fontSize = newSize;
        _syncBar();
      });
    });

    // Color swatches — same mousedown + preventDefault pattern.
    el.querySelectorAll('.color-swatch').forEach((swatch) => {
      swatch.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const newColor    = swatch.dataset.color;
        noteObj.color     = newColor;
        _currentColor     = newColor;  // persist as default for subsequent new notes
        textEl.style.color = newColor;
        _syncBar();
      });
    });

    // Focus — show the floating bar, sync its highlights, disable map drag.
    // Listeners are attached BEFORE the initial textEl.focus() call so this
    // handler fires correctly when the note is first placed.
    textEl.addEventListener('focus', () => {
      marker.dragging.disable();
      el.classList.add('editing');   // CSS: .notation-wrap.editing → bar becomes visible
      _syncBar();
      _onNoteSelected?.(noteObj);
    });

    // Blur — hide the floating bar, enter committed (read-only) state.
    // contenteditable is disabled so the note becomes drag-to-move only.
    // The note is auto-removed if the user never typed anything.
    textEl.addEventListener('blur', () => {
      el.classList.remove('editing');
      textEl.contentEditable = 'false';   // committed state: click = drag, not type
      noteObj.text = textEl.textContent.trim();
      if (!noteObj.locked) marker.dragging.enable();
      if (!noteObj.text) {
        if (_map.hasLayer(marker)) _map.removeLayer(marker);
        _notes = _notes.filter((n) => n.id !== id);
        console.log(`[NotationTool] Empty note #${id} removed.`);
      }
      _onNoteChange?.(_notes);
    });

    // Enter commits the note (blur + deactivate tool); Shift+Enter adds a newline.
    textEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        textEl.blur();
        disableNotationTool();
      }
    });

    // Auto-focus AFTER all listeners are wired so the focus handler fires correctly
    // for the first note placement and the style bar syncs and shows immediately.
    textEl.focus();
    _moveCursorToEnd(textEl);
  }, 50);

  console.log(`[NotationTool] Note #${id} placed at (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}).`);
};


// ── Private: note HTML builder ────────────────────────────────────────────────


// Returns the inner HTML string for a note's DivIcon.
// Includes the floating style bar (hidden by default; revealed by adding the
// .editing class to .notation-wrap when the text span is focused).
//
// 'id'       — numeric note id, stored as a data attribute for DOM lookup
// 'text'     — current note text (empty string for a brand-new note)
// 'fontSize' — CSS font-size value, e.g. '14px'
// 'color'    — CSS color value, e.g. '#ffff00'
const _buildNoteHtml = (id, text, fontSize, color) => {
  // Floating style bar — positioned above the note via CSS (.notation-floating-bar).
  // Active states for size/color are set dynamically via _syncBar() on focus,
  // NOT baked into this HTML, so we don't have to regenerate the icon on every change.
  const bar =
    `<div class="notation-floating-bar">` +
      `<div class="style-group">` +
        `<span class="style-group-label">Size</span>` +
        `<button class="size-btn" data-size="XS">XS</button>` +
        `<button class="size-btn" data-size="S">S</button>` +
        `<button class="size-btn" data-size="M">M</button>` +
        `<button class="size-btn" data-size="L">L</button>` +
        `<button class="size-btn" data-size="XL">XL</button>` +
      `</div>` +
      `<div class="style-bar-divider"></div>` +
      `<div class="style-group">` +
        `<span class="style-group-label">Color</span>` +
        `<div class="color-swatch" data-color="#ffffff" style="background:#ffffff" title="White"></div>` +
        `<div class="color-swatch" data-color="#faef5d" style="background:#faef5d" title="Yellow"></div>` +
        `<div class="color-swatch" data-color="#00d4ff" style="background:#00d4ff" title="Cyan"></div>` +
        `<div class="color-swatch" data-color="#4ade80" style="background:#4ade80" title="Lime"></div>` +
        `<div class="color-swatch" data-color="#fb923c" style="background:#fb923c" title="Orange"></div>` +
        `<div class="color-swatch" data-color="#f87171" style="background:#f87171" title="Red"></div>` +
      `</div>` +
    `</div>`;

  return (
    `<div class="notation-wrap" data-note-id="${id}">` +
    bar +
    `<span class="notation-text" contenteditable="true" spellcheck="false" ` +
    `style="font-size:${fontSize};color:${color};">${text}</span>` +
    `</div>`
  );
};


// ── Private: style editing (via context menu) ─────────────────────────────────


// Switches an existing note back into "Edit Mode".
// Called from the context menu "Edit Text & Style" action.
// Re-enables contenteditable (which was disabled on commit) and focuses the span,
// which triggers the focus handler to show the floating style bar automatically.
//
// 'noteId' — id of the note to edit
const _editNote = (noteId) => {
  const el = _getNoteElement(noteId);
  if (!el) return;
  const textEl = el.querySelector('.notation-text');
  if (!textEl) return;
  textEl.contentEditable = 'true';   // re-enter edit mode (was disabled on commit)
  textEl.focus();
  _moveCursorToEnd(textEl);
};


// Toggles the locked/unlocked state of a note's marker drag.
// When locked, the note cannot be moved by dragging (accidental move prevention).
// When unlocked, the marker becomes draggable again.
//
// 'noteId' — id of the note to toggle
const _toggleLock = (noteId) => {
  const noteObj = _notes.find((n) => n.id === noteId);
  if (!noteObj) return;

  noteObj.locked = !noteObj.locked;
  if (noteObj.locked) {
    noteObj.marker.dragging.disable();
  } else {
    noteObj.marker.dragging.enable();
  }
  console.log(`[NotationTool] Note #${noteId} ${noteObj.locked ? 'locked' : 'unlocked'}.`);
};


// Permanently removes a single note from the map.
//
// 'noteId' — id of the note to delete
const _deleteNote = (noteId) => {
  const noteObj = _notes.find((n) => n.id === noteId);
  if (!noteObj) return;
  if (_map && _map.hasLayer(noteObj.marker)) _map.removeLayer(noteObj.marker);
  _notes = _notes.filter((n) => n.id !== noteId);
  _onNoteChange?.(_notes);
  console.log(`[NotationTool] Note #${noteId} deleted.`);
};


// Removes every note from the map and clears the session array.
// Called from the context menu "Delete All Notes" action after the user confirms.
// No noteId parameter — affects the entire session collection.
const _clearAllNotes = () => {
  _notes.forEach((n) => {
    if (_map && _map.hasLayer(n.marker)) _map.removeLayer(n.marker);
  });
  _notes = [];
  _onNoteChange?.(_notes);
  console.log('[NotationTool] All notes cleared.');
};


// ── Private: context menu ────────────────────────────────────────────────────


// Builds and displays the right-click context menu for an existing note.
// The menu content is rebuilt on every open so click listeners never accumulate
// across multiple right-clicks.
//
// 'x'      — clientX from the right-click event
// 'y'      — clientY from the right-click event
// 'noteId' — id of the note that was right-clicked
const _showContextMenu = (x, y, noteId) => {
  if (!_contextMenuEl) return;

  const noteObj  = _notes.find((n) => n.id === noteId);
  if (!noteObj) return;

  const lockLabel = noteObj.locked ? '&#128275; Unlock Placement' : '&#128274; Lock Placement';

  _contextMenuEl.innerHTML =
    `<div class="mv-ctx-item" data-action="edit">&#9998;&nbsp; Edit Text &amp; Style</div>` +
    `<div class="mv-ctx-item" data-action="lock">${lockLabel}</div>` +
    `<div class="mv-ctx-item mv-ctx-item--danger" data-action="delete">&#10005;&nbsp; Delete Note</div>` +
    `<div class="mv-ctx-item mv-ctx-item--danger" data-action="delete-all">&#10005;&nbsp; Delete All Notes</div>`;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  _contextMenuEl.style.left    = `${Math.min(x, vw - 170)}px`;
  _contextMenuEl.style.top     = `${Math.min(y, vh - 140)}px`;
  _contextMenuEl.style.display = 'block';

  _contextMenuEl.querySelector('[data-action="edit"]').addEventListener('click', () => {
    _editNote(noteId);
    _hideContextMenu();
  });

  _contextMenuEl.querySelector('[data-action="lock"]').addEventListener('click', () => {
    _toggleLock(noteId);
    _hideContextMenu();
  });

  _contextMenuEl.querySelector('[data-action="delete"]').addEventListener('click', () => {
    _deleteNote(noteId);
    _hideContextMenu();
  });

  // "Delete All Notes" requires explicit confirmation before wiping the entire session.
  _contextMenuEl.querySelector('[data-action="delete-all"]').addEventListener('click', () => {
    _hideContextMenu();
    if (window.confirm('Delete ALL notes? This cannot be undone.')) {
      _clearAllNotes();
    }
  });
};


// Hides and clears the context menu.
const _hideContextMenu = () => {
  if (_contextMenuEl) {
    _contextMenuEl.style.display = 'none';
    _contextMenuEl.innerHTML     = '';
  }
};


// ── Private: DOM helpers ──────────────────────────────────────────────────────


// Returns the `.notation-wrap` DOM element for a given note id, or null if the
// element is not yet present in the DOM (e.g. called before the DivIcon renders).
const _getNoteElement = (noteId) =>
  document.querySelector(`.notation-wrap[data-note-id="${noteId}"]`);


// Moves the browser's cursor (caret) to the end of a contenteditable element.
// Used when auto-focusing new notes or when the user selects "Edit Text".
const _moveCursorToEnd = (el) => {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);   // collapse to END
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
};


// ── Public: Session Note Manager API ─────────────────────────────────────────


// Registers a callback fired whenever the notes collection changes.
// main.js uses this to keep the Notation sub-panel list in sync.
//
// 'cb' — function(notes) called with the current internal _notes array
const setNoteChangeCallback = (cb) => { _onNoteChange = cb; };


// Returns a shallow-copy snapshot of all current notes safe for iteration in
// the UI. Includes id, text, and visible state; omits internal marker/dom refs.
//
// Returns Array<{ id, text, visible }>
const getNotes = () =>
  _notes.map((n) => ({ id: n.id, text: n.text || '(empty)', visible: n.visible }));


// Toggles a note's visibility on the map. Hidden notes are removed from the
// Leaflet map but kept in the session array so they can be shown again without
// having to redraw them. The hitbox / context-menu still works once re-shown.
//
// 'noteId' — numeric id of the note to toggle
const toggleNoteVisibility = (noteId) => {
  const noteObj = _notes.find((n) => n.id === noteId);
  if (!noteObj || !_map) return;
  noteObj.visible = !noteObj.visible;
  if (noteObj.visible) {
    noteObj.marker.addTo(_map);
  } else {
    _map.removeLayer(noteObj.marker);
  }
  _onNoteChange?.(_notes);
  console.log(`[NotationTool] Note #${noteId} ${noteObj.visible ? 'shown' : 'hidden'}.`);
};


// Removes a note by id. Delegates to the private helper which fires the callback.
//
// 'noteId' — numeric id of the note to remove
const deleteNoteById = (noteId) => { _deleteNote(noteId); };

// Public wrapper for editing a note by id (e.g. from the sidebar panel).
//
// 'noteId' — numeric id of the note to edit
const editNoteById = (noteId) => { _editNote(noteId); };


/**
 * Phase 25: Sets the default font size for any NEW notes created hereafter.
 * @param {string} sizeKey - 'XS' | 'S' | 'M' | 'L' | 'XL'
 */
const setNotationFontSize = (sizeKey) => {
  const sizes = { 'XS': '10px', 'S': '12px', 'M': '14px', 'L': '18px', 'XL': '24px' };
  _currentFontSize = sizes[sizeKey] || _DEFAULT_FONT_SIZE;
  console.log(`[NotationTool] Default font size set to ${_currentFontSize} (${sizeKey}).`);
};

/**
 * Phase 25: Sets the default text color for any NEW notes created hereafter.
 * @param {string} colorValue - CSS color string (hex, rgb, etc.)
 */
const setNotationColor = (colorValue) => {
  _currentColor = colorValue;
  console.log(`[NotationTool] Default color set to ${_currentColor}.`);
};

/**
 * Phase 25: Registers a callback that fires when a note is focused (selected).
 * Allows the UI to synchronize its style controls with the active note.
 * @param {function} cb - function(noteObj)
 */
const setNoteSelectedCallback = (cb) => {
  _onNoteSelected = cb;
};


export {
  initNotationTool,
  enableNotationTool,
  disableNotationTool,
  isNotationActive,
  setNoteChangeCallback,
  getNotes,
  toggleNoteVisibility,
  deleteNoteById,
  editNoteById,
  setNotationFontSize,
  setNotationColor,
  setNoteSelectedCallback
};
