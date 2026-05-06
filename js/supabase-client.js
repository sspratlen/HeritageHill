/* ================================================================
   Heritage Hill Church — Supabase Client Configuration
   ================================================================
   ACTION REQUIRED: Replace the two placeholder values below.
   See SUPABASE_SETUP.md for exact instructions.
   ================================================================ */

const SUPABASE_URL      = 'https://ktyplbmawlaerzohkdqy.supabase.co';   // e.g. https://abcxyz123.supabase.co
const SUPABASE_ANON_KEY =  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0eXBsYm1hd2xhZXJ6b2hrZHF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjU4MDgsImV4cCI6MjA5MzY0MTgwOH0.Pe0_syQjPqkwrdl8cno9YliY2i1i8x77R8bYCG8KXr4'
                              //'sb_publishable_AySvm1ZZQhujy7KzkrxQrA_SDH5nQBw';      // starts with eyJ...

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
