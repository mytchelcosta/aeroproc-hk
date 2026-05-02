/**
 * AeroProc Weather Proxy (Cloudflare Worker)
 * 
 * This worker acts as a secure gateway for the CheckWX API, 
 * protecting the API key and enforcing origin-based security.
 */

export default {
  async fetch(request, env, ctx) {
    // 1. Enforce Domain-Locking (Environment-Aware Security)
    const origin = request.headers.get("Origin") || "";
    
    // Check if the origin is allowed (GitHub Pages production OR any local development port)
    const isProduction = origin === "https://mytchelcosta.github.io";
    const isLocalhost = origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
    
    // If there is an Origin header but it doesn't match our allowed list, block it.
    // (We also block requests with no Origin to strictly enforce browser-only access from our app)
    if (!isProduction && !isLocalhost) {
      return new Response("Forbidden: Invalid Origin", { status: 403 });
    }

    // 2. Configure CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS Preflight (OPTIONS request)
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Only allow GET requests for the actual data
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    // 3. Request Proxy & Header Injection
    // The frontend will call: https://aeroproc-weather-proxy.<username>.workers.dev/metar/SBGR/decoded
    // We forward the pathname and search params to the CheckWX API.
    const url = new URL(request.url);
    
    // Basic validation to ensure we only proxy /metar and /taf endpoints
    if (!url.pathname.startsWith('/metar/') && !url.pathname.startsWith('/taf/')) {
        return new Response("Not Found", { status: 404, headers: corsHeaders });
    }

    const targetUrl = new URL(`https://api.checkwx.com${url.pathname}${url.search}`);
    const apiKey = env.CHECKWX_API_KEY;

    if (!apiKey) {
      return new Response("Server Configuration Error: API key missing in Worker", { status: 500, headers: corsHeaders });
    }

    // Prepare the outgoing request to CheckWX, injecting the secret key
    const proxyRequest = new Request(targetUrl, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "Accept": "application/json"
      }
    });

    try {
      // Fetch from CheckWX
      const response = await fetch(proxyRequest);
      
      // Create a new response to send back to the frontend, appending our CORS headers
      const responseBody = await response.text();
      const modifiedHeaders = new Headers(response.headers);
      modifiedHeaders.set("Access-Control-Allow-Origin", origin);

      return new Response(responseBody, {
        status: response.status,
        headers: modifiedHeaders
      });
    } catch (error) {
      return new Response("Bad Gateway", { status: 502, headers: corsHeaders });
    }
  },
};
