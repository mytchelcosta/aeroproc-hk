// ============================================================
// Modal.js - The Point Restriction Prompt Modal
// ============================================================
// This module creates and manages the popup dialog that appears
// every time a point is added to an active procedure. The user
// selects a CONDITION (At / Above / Below for level; At / At Least /
// Less Than for speed) and types a VALUE (e.g. "FL100", "250kt").
//
// This structured approach lets the sidebar and JSON export apply
// ATC-standard formatting automatically:
//   Altitude Above  →  underline  (e.g. FL100 with underline)
//   Altitude Below  →  overline   (e.g. FL100 with overline)
//   Altitude At     →  plain text
//   Speed At Least  →  ">" prefix (e.g. >250kt)
//   Speed Less Than →  "<" prefix (e.g. <250kt)
//   Speed At        →  "@" prefix (e.g. @250kt)
//
// Phase 8.2 addition — Holding Pattern:
//   The modal also has a "HOLDING POINT" checkbox. When checked,
//   two additional fields appear:
//     • Inbound Leg Bearing (numeric, 000–360)
//     • Turn Direction (LEFT or RIGHT)
//   These values are returned alongside the level/speed data so
//   main.js can store them in DrawingState and MapLayers can draw
//   a stylised "H" marker next to the fix on the map.
//
// initModal() inserts the HTML into <body> once at startup.
// showRestrictionModal() populates and shows it, then calls back
// with { levelCondition, levelValue, speedCondition, speedValue,
//        isHolding, holdingBearing, holdingSide }.
// ============================================================


// Creates the modal's HTML and inserts it into the document body.
// Must be called once at app startup before any points are added.
const initModal = () => {
  // Guard: do not create the modal twice (e.g. during hot-module reload)
  if (document.getElementById('restriction-modal')) return;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="restriction-modal" class="modal-overlay">
      <div class="modal-box">

        <div class="modal-header">
          <span class="modal-tag">POINT ADDED</span>
          <div class="modal-point-name" id="modal-point-name"></div>
        </div>

        <div class="modal-fields">

          <div class="modal-field-group">
            <label class="modal-label">Level Restriction</label>
            <div class="modal-pair-row">
              <select class="modal-select" id="modal-level-cond">
                <option value="">No restriction</option>
                <option value="At">At</option>
                <option value="Above">Above</option>
                <option value="Below">Below</option>
              </select>
              <input
                class="modal-input modal-value-input"
                type="text"
                id="modal-level-val"
                placeholder="e.g. FL100, 5000ft"
                autocomplete="off"
                disabled
              >
            </div>
          </div>

          <div class="modal-field-group">
            <label class="modal-label">Speed Restriction</label>
            <div class="modal-pair-row">
              <select class="modal-select" id="modal-speed-cond">
                <option value="">No restriction</option>
                <option value="At">At</option>
                <option value="At Least">At Least</option>
                <option value="Less Than">Less Than</option>
              </select>
              <input
                class="modal-input modal-value-input"
                type="text"
                id="modal-speed-val"
                placeholder="e.g. 250kt"
                autocomplete="off"
                disabled
              >
            </div>
          </div>

          <!-- ── Phase 8.2: Holding Pattern section ─────────────────────────
               The checkbox is always visible. The bearing/side fields only
               appear when the user checks "Holding Point" so the modal stays
               compact for non-holding waypoints. -->
          <div class="modal-field-group modal-holding-group">
            <label class="modal-label modal-holding-checkbox-label">
              <input type="checkbox" id="modal-holding-chk" class="modal-holding-chk">
              <span>Holding Point</span>
            </label>

            <!-- These two fields are hidden by default and revealed by JS when
                 the checkbox is checked. -->
            <div id="modal-holding-fields" class="modal-holding-fields" style="display:none;">
              <div class="modal-pair-row modal-holding-row">
                <label class="modal-sublabel">Inbound Bearing</label>
                <input
                  class="modal-input modal-holding-input"
                  type="number"
                  id="modal-holding-bearing"
                  placeholder="e.g. 090"
                  min="0" max="360" step="1"
                  autocomplete="off"
                >
              </div>
              <div class="modal-pair-row modal-holding-row">
                <label class="modal-sublabel">Turn Direction</label>
                <select class="modal-select modal-holding-select" id="modal-holding-side">
                  <option value="RIGHT">RIGHT</option>
                  <option value="LEFT">LEFT</option>
                </select>
              </div>
            </div>
          </div>

        </div>

        <div class="modal-hint">Enter to confirm &nbsp;·&nbsp; Esc to skip</div>

        <div class="modal-actions">
          <button class="modal-btn modal-btn-skip"    id="modal-skip">Skip</button>
          <button class="modal-btn modal-btn-confirm" id="modal-confirm">Confirm</button>
        </div>

      </div>
    </div>
  `);

  // Wire up the level condition dropdown so the value input is only enabled
  // when the user has actually chosen a condition. Prevents typing a value
  // while "No restriction" is selected.
  document.getElementById('modal-level-cond').addEventListener('change', (e) => {
    const valInput = document.getElementById('modal-level-val');
    valInput.disabled = !e.target.value;
    if (!e.target.value) valInput.value = '';
    else valInput.focus();
  });

  // Same logic for speed condition.
  document.getElementById('modal-speed-cond').addEventListener('change', (e) => {
    const valInput = document.getElementById('modal-speed-val');
    valInput.disabled = !e.target.value;
    if (!e.target.value) valInput.value = '';
    else valInput.focus();
  });

  // Holding checkbox: show or hide the bearing + side fields depending on its state.
  // When unchecked the fields slide back out so the modal stays small.
  document.getElementById('modal-holding-chk').addEventListener('change', (e) => {
    const holdingFields = document.getElementById('modal-holding-fields');
    if (e.target.checked) {
      holdingFields.style.display = 'block';
      // Auto-focus the bearing input so the user can type immediately.
      document.getElementById('modal-holding-bearing').focus();
    } else {
      holdingFields.style.display = 'none';
      // Clear the fields so stale data from a previous session does not leak
      // into the next waypoint if the user unchecks without entering values.
      document.getElementById('modal-holding-bearing').value = '';
      document.getElementById('modal-holding-side').value = 'RIGHT';
    }
  });

  console.log('[Modal] Restriction modal initialized with holding pattern support.');
};

  // Shows the restriction modal for the point that was just added (or edited).
  // The user picks a condition and optional value for both level and speed.
  // They can also designate the point as a holding pattern fix.
  //
  // 'pointLabel'    — name shown in the title (e.g. 'ASPAT')
  // 'onConfirm'     — callback called with the full restrictions object (see below)
  // 'onSkip'        — callback called with all fields at their default/empty values
  // 'initialValues' — optional pre-populated values used when editing an existing point:
  //                   { levelCondition, levelValue, speedCondition, speedValue,
  //                     isHolding, holdingBearing, holdingSide }
  //
  // Both callbacks receive the same object shape:
  //   { levelCondition, levelValue, speedCondition, speedValue,
  //     isHolding, holdingBearing, holdingSide }
  const showRestrictionModal = (pointLabel, onConfirm, onSkip, initialValues = null) => {
    const modal = document.getElementById('restriction-modal');
    const nameEl = document.getElementById('modal-point-name');
    const levelCond = document.getElementById('modal-level-cond');
    const levelVal = document.getElementById('modal-level-val');
    const speedCond = document.getElementById('modal-speed-cond');
    const speedVal = document.getElementById('modal-speed-val');
    const holdingChk = document.getElementById('modal-holding-chk');
    const holdingFields = document.getElementById('modal-holding-fields');
    const holdingBearing = document.getElementById('modal-holding-bearing');
    const holdingSide = document.getElementById('modal-holding-side');
    const confirmBtn = document.getElementById('modal-confirm');
    const skipBtn = document.getElementById('modal-skip');

    // If any element is missing, the modal HTML is broken — fail gracefully
    // by skipping so the point still gets added with no restrictions.
    if (!modal || !nameEl || !levelCond || !levelVal || !speedCond || !speedVal
      || !holdingChk || !holdingFields || !holdingBearing || !holdingSide
      || !confirmBtn || !skipBtn) {
      console.error('[Modal] showRestrictionModal: required DOM elements are missing. Was initModal() called?');
      onSkip({
        levelCondition: '', levelValue: '', speedCondition: '', speedValue: '',
        isHolding: false, holdingBearing: '', holdingSide: 'RIGHT'
      });
      return;
    }

    // Set field values — either empty (new point) or pre-populated (editing existing point).
    nameEl.textContent = pointLabel;

    if (initialValues) {
      // Pre-populate all fields for edit mode so the user sees the existing values.
      levelCond.value = initialValues.levelCondition || '';
      levelVal.value = initialValues.levelValue || '';
      levelVal.disabled = !initialValues.levelCondition;
      speedCond.value = initialValues.speedCondition || '';
      speedVal.value = initialValues.speedValue || '';
      speedVal.disabled = !initialValues.speedCondition;

      // Pre-populate the holding section.
      holdingChk.checked = !!initialValues.isHolding;
      holdingFields.style.display = initialValues.isHolding ? 'block' : 'none';
      holdingBearing.value = initialValues.holdingBearing || '';
      holdingSide.value = initialValues.holdingSide || 'RIGHT';
    } else {
      // Fresh modal — clear everything and disable value inputs until conditions are chosen.
      levelCond.value = '';
      levelVal.value = '';
      levelVal.disabled = true;
      speedCond.value = '';
      speedVal.value = '';
      speedVal.disabled = true;
      holdingChk.checked = false;
      holdingFields.style.display = 'none';
      holdingBearing.value = '';
      holdingSide.value = 'RIGHT';
    }

    modal.classList.add('is-visible');

    // Auto-focus the level condition dropdown so the user can navigate by keyboard.
    setTimeout(() => levelCond.focus(), 60);

    // ── Event handlers ────────────────────────────────────────────────────
    // Created fresh each time the modal opens and removed immediately after
    // closing, so they do not accumulate across multiple modal uses.

    // Builds and returns the complete restrictions object from the current field state.
    // Both onConfirm and onSkip use the same shape so callers can always spread it.
    const _buildRestrictions = (useHolding) => ({
      levelCondition: levelCond.value,
      levelValue: levelVal.value.trim(),
      speedCondition: speedCond.value,
      speedValue: speedVal.value.trim(),
      // Holding data — only included when the checkbox is checked AND this is a Confirm
      // (not a Skip). Skip always leaves the point as non-holding.
      isHolding: useHolding && holdingChk.checked,
      holdingBearing: (useHolding && holdingChk.checked) ? holdingBearing.value.trim() : '',
      holdingSide: (useHolding && holdingChk.checked) ? (holdingSide.value || 'RIGHT') : 'RIGHT'
    });

    const handleConfirm = () => {
      cleanup();
      onConfirm(_buildRestrictions(true));
    };

    const handleSkip = () => {
      cleanup();
      // Skip: return all fields at their defaults — no restrictions, no holding.
      // We do NOT read the field values here (unlike handleConfirm) because the
      // intent of "Skip" is "add the point without any restrictions", regardless of
      // what the user may have started typing before changing their mind.
      onSkip({
        levelCondition: '',
        levelValue:     '',
        speedCondition: '',
        speedValue:     '',
        isHolding:      false,
        holdingBearing: '',
        holdingSide:    'RIGHT'
      });
    };

    // Enter key confirms; Escape skips — standard dialog keyboard behavior.
    const handleKeydown = (e) => {
      if (e.key === 'Enter') handleConfirm();
      if (e.key === 'Escape') handleSkip();
    };

    const cleanup = () => {
      modal.classList.remove('is-visible');
      confirmBtn.removeEventListener('click', handleConfirm);
      skipBtn.removeEventListener('click', handleSkip);
      document.removeEventListener('keydown', handleKeydown);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    skipBtn.addEventListener('click', handleSkip);
    document.addEventListener('keydown', handleKeydown);
  };

  export { initModal, showRestrictionModal };
