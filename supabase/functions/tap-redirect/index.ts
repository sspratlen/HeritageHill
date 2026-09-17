// Supabase Edge Function: tap-redirect
// Public, unauthenticated endpoint hit directly by a phone's browser when
// someone taps an NFC chair tag. Resolves the tapped section's CURRENT
// destination (set live from admin/tap-control.html) and issues a true
// HTTP 302 -- no intermediate page. Every failure path falls back to the
// site homepage so a guest never sees a raw error.
//
// Optional JSON mode: pass ?format=json to get back { url } as JSON (200)
// instead of a redirect. Used by the branded tap/ landing page so a
// guest's browser never navigates to this raw Supabase URL at all -- the
// landing page fetches this JSON in the background and does its own
// location.replace() straight to the real destination. Default behavior
// (no format param) is unchanged for any direct caller.
//
// Deploy with --no-verify-jwt (see deployment note below) -- this
// codebase's other public GET endpoint, the `youtube` function, is
// called from js/db.js with no Authorization header at all, which only
// works because it was deployed the same way.
// Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (both
// auto-injected by Supabase for every Edge Function).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FALLBACK_URL = 'https://heritagehill.church/'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)
  const asJson = url.searchParams.get('format') === 'json'
  const respond = (destUrl: string) => asJson
    ? Response.json({ url: destUrl }, { headers: CORS })
    : Response.redirect(destUrl, 302)
  const fallback = () => respond(FALLBACK_URL)

  try {
    const section = url.searchParams.get('section')
    if (!section) return fallback()

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: sectionRow, error: sectionErr } = await admin.from('tap_sections')
      .select('id').eq('slug', section).maybeSingle()
    if (sectionErr) console.error('[tap-redirect] tap_sections lookup error:', sectionErr.message)
    if (!sectionRow) return fallback()

    const { data: current, error: currentErr } = await admin.from('tap_current')
      .select('link_id, custom_url').eq('section_id', sectionRow.id).maybeSingle()
    if (currentErr) console.error('[tap-redirect] tap_current lookup error:', currentErr.message)
    if (!current) return fallback()

    let destUrl: string | null = null
    let destLabel: string | null = null

    if (current.custom_url) {
      destUrl = current.custom_url
    } else if (current.link_id) {
      const { data: link, error: linkErr } = await admin.from('tap_links')
        .select('label, url').eq('id', current.link_id).maybeSingle()
      if (linkErr) console.error('[tap-redirect] tap_links lookup error:', linkErr.message)
      if (link) { destUrl = link.url; destLabel = link.label }
    }

    if (!destUrl) return fallback()

    // Best-effort analytics log -- a logging failure must never block or
    // fail the redirect itself.
    try {
      await admin.from('tap_events').insert({
        section_id: sectionRow.id, resolved_url: destUrl, resolved_label: destLabel,
      })
    } catch (logErr) {
      console.error('[tap-redirect] tap_events insert failed:', logErr)
    }

    return respond(destUrl)

  } catch (e: unknown) {
    console.error('[tap-redirect]', e instanceof Error ? e.message : String(e))
    return fallback()
  }
})
