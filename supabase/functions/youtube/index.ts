// ================================================================
//  Heritage Hill Church — YouTube Proxy Edge Function
//  Deployed to: Supabase Edge Functions (Deno runtime)
//
//  Fetches latest videos from the HHC YouTube channel and returns
//  them as JSON. The API key is stored as a Supabase secret —
//  it never appears in frontend code.
//
//  URL after deployment:
//    https://YOUR_PROJECT_REF.supabase.co/functions/v1/youtube
//  Query params:
//    ?maxResults=12   (optional, default 12, max 50)
// ================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Heritage Hill Church YouTube channel ID
const CHANNEL_ID = "UCiHVvsAETn_BFpydmL6CocQ";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // Get API key from environment secret (set via Supabase dashboard)
    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "YOUTUBE_API_KEY secret not configured" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Parse maxResults from query string
    const url = new URL(req.url);
    const maxResults = Math.min(
      parseInt(url.searchParams.get("maxResults") || "12", 10),
      50
    );

    // Call YouTube Data API v3 — search for latest videos from channel
    const ytUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    ytUrl.searchParams.set("key", apiKey);
    ytUrl.searchParams.set("channelId", CHANNEL_ID);
    ytUrl.searchParams.set("part", "snippet");
    ytUrl.searchParams.set("order", "date");
    ytUrl.searchParams.set("type", "video");
    ytUrl.searchParams.set("maxResults", String(maxResults));

    const ytRes = await fetch(ytUrl.toString());
    if (!ytRes.ok) {
      const errText = await ytRes.text();
      console.error("[youtube-fn] YouTube API error:", errText);
      return new Response(
        JSON.stringify({ error: "YouTube API request failed", detail: errText }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const ytData = await ytRes.json();

    // Return the raw YouTube response — db.js maps it on the client
    return new Response(JSON.stringify(ytData), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[youtube-fn] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
