// ============================================================
// DataStatusModal.js — Data Currency Warning System
// ============================================================
import { i18n } from '../utils/i18n.js';
// ============================================================

// sessionStorage key: set to '1' when the user dismisses with "don't show again".
// The flag clears automatically when the browser session ends (tab close / restart).
const SESSION_KEY = 'aeroproc_data_status_shown';

// Maps the raw manifest key names to friendly display names for the modal table.
const SOURCE_NAMES = {
  'waypoint_aisweb.xlsx':    'AISWEB Waypoints',
  'navaids_aip.json':        'AIP Brasil NAVAIDs',
  'airports.csv':            'OurAirports Database',
  'navaids.csv':             'OurAirports NAVAIDs (fallback)',
  'runways.csv':             'Runway Data',
  'airport-frequencies.csv': 'Airport Frequencies',
  'airport-comments.csv':    'Airport Comments',
  'countries.csv':           'Country Codes',
  'regions.csv':             'Region Codes',
  'ICAO_Airports.txt':       'ICAO Airports (legacy)'
};

// Returns 'stale', 'outdated', or 'ok' for a given source key and its age in days.
// The thresholds reflect how quickly each source can become dangerous for training:
//   AIRAC-cycle files (waypoints, NAVAIDs) — expire every 28 days.
//   Monthly open-data files (airports, navaids.csv) — go outdated after 60 days.
//   Slowly-changing reference files — become outdated after 365 days.
const _getStalenessStatus = (key, ageDays) => {
  if (key === 'navaids_aip.json' || key === 'waypoint_aisweb.xlsx') {
    // AIRAC-critical: these change every 28 days and directly affect procedure accuracy.
    return ageDays > 28 ? 'stale' : 'ok';
  }
  if (key === 'airports.csv' || key === 'navaids.csv') {
    // OurAirports data is refreshed monthly; 60 days is a reasonable alert threshold.
    return ageDays > 60 ? 'outdated' : 'ok';
  }
  // All other reference files: ICAO databases, runway data, etc.
  return ageDays > 365 ? 'outdated' : 'ok';
};

// Calculates how many days old a data file is, based on its 'downloaded' ISO date string.
// Uses UTC midnight to avoid timezone boundary issues.
//
// 'dateStr' — ISO date string from the manifest, e.g. "2026-04-25"
// Returns: integer number of days (0 = downloaded today), or null if dateStr is empty/invalid.
const _calcAgeDays = (dateStr) => {
  if (!dateStr) return null;
  const downloaded = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(downloaded.getTime())) return null;
  const today    = new Date();
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diffMs   = todayUTC - downloaded.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
};

// Processes the raw DATA_MANIFEST.json into a flat array ready for the modal table.
// Skips deprecated files (they are not used by the app) and sources with no
// 'downloaded' date (they cannot have an age calculated).
//
// Returns: [{ key, displayName, description, downloaded, ageDays, status }, ...]
const processManifest = (manifest) => {
  if (!manifest || !manifest.sources) return [];

  return Object.entries(manifest.sources)
    .filter(([key, data]) => {
      // Deprecated files and reference files not currently used for critical
      // logic are skipped to keep the disclaimer focused on operational data.
      const s = (data.status || '').toUpperCase();
      if (s === 'DEPRECATED' || s.startsWith('FALLBACK')) return false;
      if (key === 'ICAO_Airlines.txt' || key === 'ICAO_Aircraft.txt') return false;

      // Must have a download date to calculate a meaningful age.
      if (!data.downloaded) return false;
      return true;
    })
    .map(([key, data]) => {
      const ageDays = _calcAgeDays(data.downloaded) ?? 0;
      // Truncate long descriptions so they fit neatly in the modal table row.
      const rawDesc = data.description || '';
      const description = rawDesc.length > 90 ? rawDesc.substring(0, 87) + '…' : rawDesc;

      return {
        key,
        displayName: SOURCE_NAMES[key] || key,
        description,
        downloaded:  data.downloaded,
        ageDays,
        status:      _getStalenessStatus(key, ageDays)
      };
    });
};

// Returns the single worst status string across all processed sources.
// Priority: 'stale' > 'outdated' > 'ok'.
// Used to set the badge color and decide whether to auto-expand the modal.
const getWorstStatus = (statusData) => {
  if (statusData.some((s) => s.status === 'stale'))    return 'stale';
  if (statusData.some((s) => s.status === 'outdated')) return 'outdated';
  return 'ok';
};

// Builds the HTML string for a colored status badge pill.
// Inline HTML — these must match the .ds-badge-* classes defined in main.css.
const _statusBadgeHtml = (status) => {
  if (status === 'stale')    return `<span class="ds-badge ds-badge-stale" data-i18n="data_status.status.stale">${i18n.t('data_status.status.stale')}</span>`;
  if (status === 'outdated') return `<span class="ds-badge ds-badge-outdated" data-i18n="data_status.status.outdated">${i18n.t('data_status.status.outdated')}</span>`;
  return `<span class="ds-badge ds-badge-ok" data-i18n="data_status.status.current">${i18n.t('data_status.status.current')}</span>`;
};

// Simple HTML-escape helper — prevents any data strings from injecting markup.
const _esc = (str) =>
  String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Hides the modal by re-adding the .ds-hidden CSS class.
const _closeModal = () => {
  const el = document.getElementById('data-status-modal');
  if (el) el.classList.add('ds-hidden');
};

// Injects the modal's full DOM skeleton into <body> exactly once at app startup.
// The modal is hidden by default (.ds-hidden). showDataStatusModal() reveals it.
// Must be called before any other function in this module.
const initDataStatusModal = () => {
  // Guard against double-initialization in hot-reload development environments.
  if (document.getElementById('data-status-modal')) return;

  const el = document.createElement('div');
  el.id        = 'data-status-modal';
  el.className = 'ds-modal-overlay ds-hidden';
  el.innerHTML = `
    <div class="ds-modal-box" role="dialog" aria-modal="true" aria-labelledby="ds-modal-title">
      <button id="ds-close-btn" class="ds-close-btn" aria-label="Close data status modal">&times;</button>

      <div id="ds-modal-header" class="ds-modal-header ds-header-ok">
        <div class="ds-header-title-group">
          <span id="ds-modal-icon" class="ds-modal-icon">&#9432;</span>
          <h2 id="ds-modal-title" class="ds-modal-title" data-i18n="data_status.modal_title">Data Currency Status</h2>
        </div>
        
        <!-- Language Toggle inside Modal Header -->
        <div class="lang-toggle" id="modal-lang-toggle" style="margin-right: 26px;">
          <button class="lang-btn" data-lang="en">EN</button>
          <button class="lang-btn" data-lang="pt">PT</button>
          <div class="lang-pill"></div>
        </div>
      </div>

      <div class="ds-disclaimer-banner">
        <strong data-i18n="data_status.disclaimer_title">&#9888; Training Tool Disclaimer:</strong>
        <span data-i18n="data_status.disclaimer_body">
          AeroProc is for ATC training purposes only. Always verify all procedures and
          navigation data against current official charts from
          <strong>AISWEB DECEA</strong> before any operational or study use.
        </span>
      </div>

      <div class="ds-table-wrapper">
        <table class="ds-table">
          <thead>
            <tr>
              <th data-i18n="data_status.table.source">Source</th>
              <th data-i18n="data_status.table.age">Age</th>
              <th data-i18n="data_status.table.downloaded">Downloaded</th>
              <th data-i18n="data_status.table.status">Status</th>
            </tr>
          </thead>
          <tbody id="ds-table-body"></tbody>
        </table>
      </div>

      <div class="ds-modal-footer">
        <label class="ds-no-show-label">
          <input type="checkbox" id="ds-no-show-cb">
          <span data-i18n="data_status.footer.no_show">Do not show again this session</span>
        </label>
        <button id="ds-dismiss-btn" class="ds-dismiss-btn" data-i18n="data_status.footer.dismiss">Understood</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  // Set initial active state for modal toggle
  const currentLang = i18n.currentLang;
  el.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
  });

  // Close via the × button in the corner.
  document.getElementById('ds-close-btn').addEventListener('click', _closeModal);

  // Clicking the dark backdrop also closes the modal (standard UX convention).
  el.addEventListener('click', (e) => {
    if (e.target === el) _closeModal();
  });

  // "Understood" button: persist the session flag if the checkbox is ticked.
  document.getElementById('ds-dismiss-btn').addEventListener('click', () => {
    if (document.getElementById('ds-no-show-cb')?.checked) {
      sessionStorage.setItem(SESSION_KEY, '1');
    }
    _closeModal();
  });
};

// Opens the data status modal and populates it with the processed source data.
//
// The modal will NOT appear if the user dismissed it with "don't show again"
// earlier in the same session, UNLESS 'force' is true (used by the badge button
// so the user can always re-open the modal manually).
//
// If ANY source is 🔴 STALE, the modal header turns red — a clear signal to the
// user that they should update data before studying procedures.
//
// 'statusData' — array from processManifest(): [{ key, displayName, downloaded, ageDays, status }]
// 'force'      — true = bypass sessionStorage check (used by badge button click)
const showDataStatusModal = (statusData, force = false) => {
  if (!force && sessionStorage.getItem(SESSION_KEY)) {
    console.log('[DataStatusModal] Skipping startup modal (already shown this session).');
    return;
  }

  const el = document.getElementById('data-status-modal');
  if (!el) {
    console.error('[DataStatusModal] Modal element not found. Ensure initDataStatusModal() was called at startup.');
    return;
  }

  const worst = getWorstStatus(statusData);

  // Set the header color and icon to reflect the worst status.
  const header = document.getElementById('ds-modal-header');
  const icon   = document.getElementById('ds-modal-icon');
  if (header) {
    header.className = 'ds-modal-header';
    if (worst === 'stale') {
      header.classList.add('ds-header-stale');
      if (icon) icon.innerHTML = '&#9888;';
    } else if (worst === 'outdated') {
      header.classList.add('ds-header-outdated');
      if (icon) icon.innerHTML = '&#9888;';
    } else {
      header.classList.add('ds-header-ok');
      if (icon) icon.innerHTML = '&#9432;';
    }
  }

  // Populate the status table — one row per active data source.
  const tbody = document.getElementById('ds-table-body');
  if (tbody) {
    // Sort rows: stale first, then outdated, then ok — so problems are visible at a glance.
    const sorted = [...statusData].sort((a, b) => {
      const rank = { stale: 0, outdated: 1, ok: 2 };
      return (rank[a.status] ?? 2) - (rank[b.status] ?? 2);
    });

    tbody.innerHTML = sorted.map((src) => {
      const daysKey = src.ageDays !== 1 ? 'data_status.table.days' : 'data_status.table.day';
      return `
        <tr class="ds-row-${_esc(src.status)}">
          <td class="ds-col-name">${_esc(src.displayName)}</td>
          <td class="ds-col-age">${src.ageDays} <span data-i18n="${daysKey}">${i18n.t(daysKey)}</span></td>
          <td class="ds-col-date">${_esc(src.downloaded)}</td>
          <td class="ds-col-status">${_statusBadgeHtml(src.status)}</td>
        </tr>
      `;
    }).join('');
  }

  el.classList.remove('ds-hidden');
};

// Updates the persistent status badge button in the sidebar header.
// The badge color reflects the worst status across ALL data sources so the user
// has a constant, at-a-glance indicator of data freshness without opening the modal.
//
// 'worst' — string returned by getWorstStatus(): 'stale', 'outdated', or 'ok'
const updateStatusBadge = (worst) => {
  const badge = document.getElementById('btn-data-status');
  if (!badge) return;

  // Remove all status classes before setting the new one.
  badge.classList.remove('data-status-stale', 'data-status-outdated', 'data-status-ok');

  if (worst === 'stale') {
    badge.classList.add('data-status-stale');
    badge.title     = i18n.t('data_status.badge.stale');
    badge.innerHTML = '&#9888;';  // ⚠ warning sign
  } else if (worst === 'outdated') {
    badge.classList.add('data-status-outdated');
    badge.title     = i18n.t('data_status.badge.outdated');
    badge.innerHTML = '&#9888;';
  } else {
    badge.classList.add('data-status-ok');
    badge.title     = i18n.t('data_status.badge.ok');
    badge.innerHTML = '&#9432;';  // ℹ information sign
  }
};

// Phase 36: Listen for language changes to update the modal and badge titles
window.addEventListener('languageChanged', () => {
  i18n.updateDOM();
  // We don't need to re-render the whole table here because data-i18n tags 
  // on the table cells handle the update via updateDOM().
});

export { initDataStatusModal, showDataStatusModal, updateStatusBadge, getWorstStatus, processManifest };
