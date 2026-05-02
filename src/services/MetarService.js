// ============================================================
// MetarService.js — Phase 35: Real-Time METAR/TAF Integration
// ============================================================
// Self-contained ES module responsible for all CheckWX API
// communication and in-session caching.
//
// Public API:
//   fetchWeather(icao) → Promise<WeatherResult | null>
//
// Caching:
//   Results are cached per-ICAO for TTL_MS (10 minutes).
//   Returning the cached result on repeated requests prevents
//   the free-tier quota (100 req/month) from being exhausted
//   during a training session where the same airport popup may
//   be opened multiple times.
//
// Error handling:
//   - If the METAR fetch fails, returns null (caller shows error state).
//   - If the TAF fetch fails, METAR is still returned with taf_* fields null.
//   - Promise.allSettled() is used to ensure one failure never blocks the other.
//
// API KEY SETUP:
//   Create a .env file at the project root (it is already git-ignored):
//     VITE_CHECKWX_API_KEY=your_real_key_here
//   Get a free key at https://checkwx.com (100 req/month on the free tier).
// ============================================================

// Vite exposes VITE_* variables from .env as import.meta.env at build time.
// As of Phase 37, we use a Cloudflare Worker proxy to handle the API key securely.
const WEATHER_PROXY_URL = import.meta.env.VITE_WEATHER_PROXY_URL || 'https://aeroproc-weather-proxy.mytchelcosta.workers.dev';

// ── Private cache ────────────────────────────────────────────
// Map<icao, { data: WeatherResult, fetchedAt: number }>
const _cache = new Map();

// Cache TTL: 10 minutes in milliseconds.
const TTL_MS = 10 * 60 * 1000;

// CheckWX decoded endpoint base URL (pointing to our proxy by default).
const BASE_URL = WEATHER_PROXY_URL;


// ── Internal helpers ─────────────────────────────────────────

// Performs a single CheckWX API fetch with the key in the header.
// Returns the parsed JSON body, or throws on network / HTTP error.
// Note: Headers (like X-API-Key) are now handled by the Cloudflare Worker.
const _checkwxFetch = async (endpoint) => {
  const response = await fetch(`${BASE_URL}${endpoint}`);

  if (!response.ok) {
    throw new Error(`CheckWX HTTP ${response.status} for ${endpoint}`);
  }

  return response.json();
};


// Normalises a raw CheckWX decoded METAR API response into the flat
// WeatherResult shape consumed by the weather card template.
//
// CheckWX decoded METAR response shape (relevant fields):
//   data[0].raw_text, .observed, .flight_category,
//   .wind.degrees, .wind.speed_kts, .wind.gust_kts, .wind.variable_direction
//   .visibility.miles_float
//   .clouds[]  → { code, base_feet_agl }
//   .temperature.celsius, .dewpoint.celsius
//   .altimeter.hectopascal
//
// Returns a flat WeatherResult or null if data is empty/malformed.
const _normaliseMetar = (body) => {
  if (!body?.data?.[0]) return null;
  const d = body.data[0];

  return {
    icao:            d.icao  || '????',
    observed:        d.observed  || '',
    flight_category: d.flight_category || 'UNK',
    raw_metar:       d.raw_text || '',
    wind: {
      degrees:  d.wind?.degrees  ?? 0,
      speed_kts: d.wind?.speed_kts ?? 0,
      gust_kts:  d.wind?.gust_kts  ?? null,
      variable:  !!d.wind?.variable_direction,
    },
    visibility_sm: d.visibility?.miles_float ?? null,
    clouds: (d.clouds || []).map((c) => ({
      code:    c.code    || '???',
      base_ft: c.base_feet_agl ?? 0,
    })),
    temperature_c: d.temperature?.celsius ?? 0,
    dewpoint_c:    d.dewpoint?.celsius    ?? 0,
    altimeter_hpa: d.altimeter?.hectopascal ?? 0,
    // TAF fields are filled in by _normaliseTaf() if available.
    taf_raw:        null,
    taf_valid_from: null,
    taf_valid_to:   null,
    taf_forecast:   null,
  };
};


// Augments an existing WeatherResult (created by _normaliseMetar) with TAF fields.
// Mutates the result object in-place and returns it.
//
// CheckWX decoded TAF response shape (relevant fields):
//   data[0].raw_text
//   data[0].forecast[0].timestamp.from, .to   (validity period of first period)
//   data[0].forecast[].timestamp.from, .wind, .visibility, .clouds
const _normaliseTaf = (result, body) => {
  if (!body?.data?.[0]) return result;  // TAF unavailable — keep null fields
  const t = body.data[0];

  result.taf_raw = t.raw_text || null;

  // Validity window: span from earliest to latest period.
  const forecasts = t.forecast || [];
  if (forecasts.length > 0) {
    result.taf_valid_from = forecasts[0]?.timestamp?.from || null;
    result.taf_valid_to   = forecasts[forecasts.length - 1]?.timestamp?.to || null;

    // Normalise the forecast array for the detailed expansion (future enhancement).
    result.taf_forecast = forecasts.map((f) => ({
      time_from:     f.timestamp?.from || '',
      wind: {
        degrees:  f.wind?.degrees   ?? 0,
        speed_kts: f.wind?.speed_kts ?? 0,
        variable: !!f.wind?.variable_direction,
      },
      visibility_sm: f.visibility?.miles_float ?? null,
      clouds: (f.clouds || []).map((c) => ({
        code:    c.code    || '???',
        base_ft: c.base_feet_agl ?? 0,
      })),
    }));
  }

  return result;
};


// ── Public API ────────────────────────────────────────────────


// Fetches (or returns cached) METAR and TAF data for a given ICAO airport code.
//
// 'icao' — uppercase ICAO identifier, e.g. 'SBGR'.
//
// Returns: Promise<WeatherResult | null>
//   • WeatherResult — fully normalised weather data object.
//   • null           — METAR fetch failed (network / API error / no data).
//     In this case the caller should display an error state.
//
// Caching: results are stored per-ICAO for TTL_MS. A cached entry is
// returned immediately if it exists and is younger than TTL_MS.
export const fetchWeather = async (icao) => {
  if (!icao) return null;

  const key = icao.toUpperCase();

  // ── Cache hit ────────────────────────────────────────────────
  const cached = _cache.get(key);
  if (cached && (Date.now() - cached.fetchedAt) < TTL_MS) {
    console.log(`[MetarService] Cache hit for ${key} (age ${Math.round((Date.now() - cached.fetchedAt) / 1000)}s)`);
    return cached.data;
  }

  // ── Live fetch ───────────────────────────────────────────────
  console.log(`[MetarService] Fetching METAR + TAF for ${key}…`);

  // Fire both requests in parallel. allSettled ensures a TAF 404
  // (some airports have no TAF) does not abort the METAR.
  const [metarResult, tafResult] = await Promise.allSettled([
    _checkwxFetch(`/metar/${key}/decoded`),
    _checkwxFetch(`/taf/${key}/decoded`),
  ]);

  // METAR is mandatory — if it failed, return null.
  if (metarResult.status === 'rejected') {
    console.error(`[MetarService] METAR fetch failed for ${key}:`, metarResult.reason);
    return null;
  }

  // Normalise METAR.
  const weatherResult = _normaliseMetar(metarResult.value);
  if (!weatherResult) {
    console.warn(`[MetarService] METAR data empty or malformed for ${key}.`);
    return null;
  }

  // Augment with TAF if available (graceful degradation on failure).
  if (tafResult.status === 'fulfilled') {
    _normaliseTaf(weatherResult, tafResult.value);
  } else {
    console.warn(`[MetarService] TAF unavailable for ${key}:`, tafResult.reason?.message || tafResult.reason);
  }

  // ── Store in cache ───────────────────────────────────────────
  _cache.set(key, { data: weatherResult, fetchedAt: Date.now() });

  console.log(`[MetarService] ${key} — ${weatherResult.flight_category} | ${weatherResult.raw_metar}`);
  return weatherResult;
};


// Returns the number of currently-cached entries (useful for debug).
export const getCacheSize = () => _cache.size;


// Clears all cached weather data (e.g. useful for testing / forced refresh).
export const clearCache = () => {
  _cache.clear();
  console.log('[MetarService] Cache cleared.');
};
