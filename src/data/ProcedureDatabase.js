// ============================================================
// ProcedureDatabase.js - Persistent Procedure Storage
// ============================================================
// This module handles saving, loading, and deleting procedures
// using the browser's LocalStorage. Think of it as a small
// client-side database that persists across page reloads.
//
// LocalStorage stores everything as strings, so we serialize
// (JSON.stringify) when writing and deserialize (JSON.parse)
// when reading.
//
// Every saved procedure gets a unique 'id' field auto-assigned
// by saveProc() so we can identify it later for deletion or
// toggle operations.
//
// Phase 12 — Schema:
// Procedures use a branched format:
//   {
//     common_route: [...],
//     transitions: [
//       { name, direction, convergence_fix, points: [...] },  // inbound
//       { name, direction, divergence_fix,  points: [...] }   // outbound
//     ]
//   }
//
// BACKWARD COMPATIBILITY: loadAll() normalizes all older
// save formats (flat 'points' array, Phase-11 transitions
// without direction fields) automatically so the rest of
// the app always sees the Phase-12 schema.
// ============================================================

// The key under which ALL procedures are stored in localStorage.
// Changing this string would cause existing data to be invisible,
// so treat it as permanent.
const STORAGE_KEY = 'aeroproc_hk_procedures';


// Loads all saved procedures from localStorage and normalizes them to the
// Phase 12 schema. Several older formats are handled transparently:
//
//   • Phase 1-10 flat format — has 'points' but no 'common_route':
//     Treated as common route with no transitions.
//
//   • Phase 11 branch format — has 'common_route' and 'transitions' but
//     transitions lack 'direction', 'convergence_fix', 'divergence_fix':
//     Treated as old-style undirected transitions (rendered as raw point sequences).
//
//   • Phase 12 format — already correct; passed through unchanged.
//
// The normalization is intentionally NOT written back to localStorage — that
// would mutate stored data on load, which could cause data loss if something
// went wrong. The normalized objects live only in memory.
//
// Returns: Array of normalized procedure objects (may be empty)
const loadAll = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const procs = raw ? JSON.parse(raw) : [];

    return procs.map((proc) => {
      // ── Step 1: Ensure common_route exists ────────────────────────────────
      // Old flat format uses 'points'; new format uses 'common_route'.
      let normalised = proc;
      if (proc.points && !proc.common_route) {
        normalised = { ...proc, common_route: proc.points, transitions: [] };
      } else if (!proc.transitions) {
        normalised = { ...proc, transitions: [] };
      }

      // ── Step 2: Ensure each transition has a 'direction' field ────────────
      // Phase 11 transitions have { name, points } but no direction or key fix.
      // We pass them through as-is with direction: null so renderSavedProcedure
      // falls back to the old "raw point sequence" rendering path.
      normalised = {
        ...normalised,
        transitions: (normalised.transitions || []).map((t) => ({
          direction:       t.direction       ?? null,
          convergence_fix: t.convergence_fix ?? null,
          divergence_fix:  t.divergence_fix  ?? null,
          ...t  // spread after defaults so real values override nulls
        }))
      };

      return normalised;
    });
  } catch (err) {
    console.error('[ProcedureDatabase] Failed to load from localStorage:', err.message);
    return [];
  }
};


// Saves a single procedure to the database.
// The procedure object should be the plain object returned by DrawingState.toJSON().
//
// Phase 10: saveProc() now persists 'common_route' and 'transitions' in addition to
// the existing fields. For backward compatibility, if the incoming procedure still has
// a flat 'points' field (e.g. from an older export), it is treated as the common_route
// and transitions defaults to [].
//
// The 'lineStyle' nested object from DrawingState.toJSON() is flattened into top-level
// 'color' and 'pattern' fields so renderSavedProcedure() can read them without needing
// to know about the lineStyle wrapper structure.
//
// Returns the saved entry (with id and savedAt added), or null if saving failed.
const saveProc = (procedure) => {
  // Create a unique id using the timestamp + a short random suffix
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // Resolve common_route: prefer the new 'common_route' field; fall back to 'points'
  // for any procedure objects that originated from an older DrawingState.toJSON().
  const commonRoute  = procedure.common_route || procedure.points || [];
  const transitions  = procedure.transitions  || [];

  const entry = {
    name:         procedure.name    || '(unnamed)',
    type:         procedure.type    || 'SID',
    airport:      procedure.airport || '',
    runway:       procedure.runway  || '',
    pattern:      procedure.lineStyle?.pattern || procedure.pattern || 'solid',
    color:        procedure.lineStyle?.color   || procedure.color   || '#3b9eff',
    common_route: commonRoute,
    transitions,
    id,
    savedAt: new Date().toISOString()
  };

  try {
    const all = loadAll();
    all.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    const branchInfo = transitions.length > 0
      ? `, ${transitions.length} transition(s)`
      : '';
    console.log(
      `[ProcedureDatabase] Saved "${entry.name}" ` +
      `(${commonRoute.length} common-route pts${branchInfo}) — id: ${id}.`
    );
    return entry;
  } catch (err) {
    // localStorage can throw if the user's storage quota is exceeded
    console.error('[ProcedureDatabase] Failed to save procedure:', err.message);
    return null;
  }
};


// Removes a single procedure from the database by its id.
// All other procedures are kept intact.
//
// 'id' — the id string assigned by saveProc()
const deleteProc = (id) => {
  const all = loadAll().filter((p) => p.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    console.log(`[ProcedureDatabase] Deleted procedure id: ${id}.`);
  } catch (err) {
    console.error('[ProcedureDatabase] Failed to delete procedure:', err.message);
  }
};


export { loadAll, saveProc, deleteProc };
