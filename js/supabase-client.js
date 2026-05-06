/* ================================================================
   Heritage Hill Church — Supabase Client Configuration
   ================================================================
   ACTION REQUIRED: Replace the two placeholder values below.
   See SUPABASE_SETUP.md for exact instructions.
   ================================================================ */

const SUPABASE_URL      = 'https://supabase.com/dashboard/project/ktyplbmawlaerzohkdqy';   // e.g. https://abcxyz123.supabase.co
const SUPABASE_ANON_KEY = 'sb_publishable_AySvm1ZZQhujy7KzkrxQrA_SDH5nQBw';      // starts with eyJ...

/* YouTube Edge Function — filled in after Step 4 in SUPABASE_SETUP.md
   Format: https://YOUR_PROJECT_REF.supabase.co/functions/v1/youtube  */
const YOUTUBE_FUNCTION_URL = SUPABASE_URL + '/functions/v1/youtube';

/* Initialize the client.
   The supabase global is loaded from the CDN <script> tag above this one. */
if (typeof supabase !== 'undefined') {
  window._supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.warn('[HHC] Supabase SDK not loaded. Check CDN script tag order.');
  window._supabase = null;
}
