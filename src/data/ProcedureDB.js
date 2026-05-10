// ============================================================
// ProcedureDB.js - JSON File Import / Export for Procedures
// ============================================================
// This module handles saving the entire procedure database to a
// downloadable JSON file on the user's device (export), and
// restoring procedures from a user-selected JSON file (import).
//
// It is intentionally a thin I/O layer — it does NOT touch
// localStorage directly. It works with raw procedure arrays so
// that a future swap to a remote database (Firebase, Supabase)
// only requires changing this module, not the rest of the app.
//
// The JSON file schema produced by exportToJSON:
//   {
//     "version": "1",
//     "exportedAt": "<ISO timestamp>",
//     "procedures": [ ...procedure objects... ]
//   }
//
// importFromJSON validates this schema before returning data.
// ============================================================

// The schema version written into every exported file.
// Increment this string if the procedure object shape changes
// in a breaking way so future import code can handle older files.
const SCHEMA_VERSION = '1';


// Downloads all procedures as a prettily-formatted JSON file to
// the user's device using the browser's native download mechanism.
// No server or service worker is required — the file is generated
// entirely in-browser using a Blob URL.
//
// 'procedures' — array of procedure objects from ProcedureDatabase.loadAll()
// 'filename'   — optional custom filename (defaults to 'aeroproc_procedures.json')
const exportToJSON = (procedures, filename = 'aeroproc_procedures.json') => {
  // Wrap the raw procedure array in a versioned envelope so we can detect
  // the schema when the user loads this file back later.
  const payload = {
    version:    SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    procedures
  };

  // Serialize the payload with 2-space indentation so the file is human-readable.
  const jsonText = JSON.stringify(payload, null, 2);

  // Convert the JSON string into a binary blob so the browser can attach it
  // to a temporary download link. The MIME type tells the OS it's a JSON file.
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);

  // Create a temporary invisible anchor, click it to trigger the native browser
  // save dialog, then remove it and release the object URL immediately.
  // The anchor never needs to be visible — clicking it programmatically is enough.
  const link       = document.createElement('a');
  link.href        = url;
  link.download    = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Revoking the URL frees the memory associated with the Blob.
  // We use a short setTimeout so the browser has time to start the download
  // before we pull the rug out from under the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  console.log(`[ProcedureDB] Exported ${procedures.length} procedure(s) to "${filename}".`);
};


// Opens the OS file picker so the user can choose a previously exported JSON file.
// Reads the file asynchronously and validates its structure before resolving.
//
// Returns a Promise that:
//   Resolves with: Array of raw procedure objects (may be empty)
//   Resolves with: null if the user dismissed the picker without choosing a file
//   Rejects  with: Error containing a plain-English description of what went wrong
//
// The caller is responsible for:
//   1. Showing a confirmation dialog (since importFromJSON just returns the data).
//   2. Calling ProcedureDatabase.saveProc() for each returned procedure.
//   3. Re-rendering everything on the map.
const importFromJSON = () => {
  return new Promise((resolve, reject) => {
    // Create a hidden file input element and immediately click it to open the picker.
    // We remove it from the DOM inside the change handler once the user selects a file.
    const input      = document.createElement('input');
    input.type       = 'file';
    input.accept     = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);

    // Guard flag: tracks whether the promise has already been settled.
    // Without this, the window-focus fallback handler below could settle
    // the promise a second time if 'change' fires just after 'focus'.
    let resolved = false;

    // Main handler: fires when the user picks a file from the dialog.
    input.addEventListener('change', async () => {
      if (resolved) return;

      // Remove the input from the DOM immediately — we no longer need it.
      try { document.body.removeChild(input); } catch (_) {}

      const file = input.files && input.files[0];
      if (!file) {
        // 'change' fired but no file was attached — treat as cancellation.
        resolved = true;
        resolve(null);
        return;
      }

      try {
        // Read the file's text content using the modern File.text() API.
        // This is asynchronous and works without FileReader boilerplate.
        const text = await file.text();

        // ── JSON syntax validation ────────────────────────────────────────────
        // Wrap JSON.parse in try/catch so we can give a plain-English error
        // instead of a raw SyntaxError that doesn't help the user understand
        // what went wrong.
        let data;
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          throw new Error(
            `"${file.name}" does not contain valid JSON. ` +
            `Make sure the file was exported by AeroProc and has not been edited manually.`
          );
        }

        // ── Structural validation ─────────────────────────────────────────────
        // Check for the two fields that make this a recognisable AeroProc export.
        // A missing 'version' field means the file was likely not produced by this app.
        if (typeof data.version === 'undefined') {
          throw new Error(
            `"${file.name}" is missing the required "version" field. ` +
            `It may have been produced by a different tool or an incompatible version of AeroProc.`
          );
        }

        // 'procedures' must be an array — even an empty one is fine.
        if (!Array.isArray(data.procedures)) {
          throw new Error(
            `"${file.name}" has an invalid "procedures" field — expected an array but got ${typeof data.procedures}. ` +
            `The file may be corrupted or from an incompatible version.`
          );
        }

        resolved = true;
        console.log(
          `[ProcedureDB] Parsed ${data.procedures.length} procedure(s) from "${file.name}" ` +
          `(schema v${data.version}, exported ${data.exportedAt || 'unknown date'}).`
        );
        resolve(data.procedures);

      } catch (err) {
        // Any unexpected error during read or parse: reject with the error message
        // so the caller can show it to the user.
        resolved = true;
        reject(err);
      }
    });

    // Fallback handler: some browsers do NOT fire 'change' when the user dismisses
    // the file picker without selecting anything. The window gets focus back instead.
    // We wait a short tick to give the 'change' event time to fire first.
    const onWindowFocus = () => {
      window.removeEventListener('focus', onWindowFocus);
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // Clean up the orphaned input element.
          try { document.body.removeChild(input); } catch (_) {}
          // Resolve with null — "user dismissed" is not an error condition.
          resolve(null);
        }
      }, 300);
    };
    window.addEventListener('focus', onWindowFocus);

    // Trigger the OS file picker. Must happen after all event listeners are wired
    // because some browsers fire 'change' synchronously on programmatic click.
    input.click();
  });
};


export { exportToJSON, importFromJSON };
