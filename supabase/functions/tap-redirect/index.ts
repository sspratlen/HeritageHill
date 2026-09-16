// Supabase Edge Function: tap-redirect
// Public, unauthenticated endpoint hit directly by a phone's browser when
// someone taps an NFC chair tag. Resolves the tapped section's CURRENT
// destination (set live from admin/tap-control.html) and issues a true
// HTTP 302 -- no intermediate page. Every failure path falls back to the
// site homepage so a guest never sees a raw error.
// Deploy with --no-verify-jwt (see deployment note below) -- this
// codebase's other public GET endpoint, the `youtube` function, is
// called from js/db.js with no Authorization header at all, which only
// works because it was deployed the same way.
// Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (both
// auto-injected by Supabase for every Edge Function).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FALLBACK_URL = 'https://heritagehill.church/'

serve(async (req: Request) => {
  const fallback = () => Response.redirect(FALLBACK_URL, 302)

  try {
    const url = new URL(req.url)
    const section = url.searchParams.get('section')
    if (!section) return fallback()

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: sectionRow } = await admin.from('tap_sections')
      .select('id').eq('slug', section).maybeSingle()
    if (!sectionRow) return fallback()

    const { data: current } = await admin.from('tap_current')
      .select('link_id, custom_url').eq('section_id', sectionRow.id).maybeSingle()
    if (!current) return fallback()

    let destUrl: string | null = null
    let destLabel: string | null = null

    if (current.custom_url) {
      destUrl = current.custom_url
    } else if (current.link_id) {
      const { data: link } = await admin.from('tap_links')
        .select('label, url').eq('id', current.link_id).maybeSingle()
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

    return Response.redirect(destUrl, 302)

  } catch (e: unknown) {
    console.error('[tap-redirect]', e instanceof Error ? e.message : String(e))
    return fallback()
  }
})
