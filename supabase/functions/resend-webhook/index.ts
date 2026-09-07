// Supabase Edge Function: resend-webhook
// Receives Resend delivery-status webhooks (account-wide — every email this
// Resend account sends triggers this, not just tracked ones) and updates
// outbound_email_recipients.status for any email this app is tracking.
// Events for untracked emails (any Resend send not created through
// send-group-email) are silently ignored.
//
// No CORS handling: this is a server-to-server callback from Resend, not a
// browser fetch, so there is no preflight to answer.
//
// Required secret (set via Supabase Dashboard → Settings → Secrets):
//   RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are already available to every
//   Edge Function automatically — no need to set them.)
//
// Deploy:
//   supabase functions deploy resend-webhook
//
// Manual setup required (cannot be done from code — see plan Task 6):
//   In the Resend dashboard, create a Webhook pointing at this function's
//   URL, subscribed to at least: email.delivered, email.opened,
//   email.bounced, email.complained. Copy the signing secret it generates
//   into RESEND_WEBHOOK_SECRET above.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Webhook } from 'https://esm.sh/svix@1.15.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STATUS_RANK: Record<string, number> = { pending: 0, delivered: 1, opened: 2, bounced: 3, complained: 3 }
const EVENT_TO_STATUS: Record<string, string> = {
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
}

serve(async (req: Request) => {
  try {
    const payload = await req.text()
    const svixHeaders = {
      'svix-id': req.headers.get('svix-id') ?? '',
      'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
      'svix-signature': req.headers.get('svix-signature') ?? '',
    }

    const wh = new Webhook(Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '')
    let event: { type: string; data: { email_id: string } }
    try {
      event = wh.verify(payload, svixHeaders) as typeof event
    } catch {
      return new Response('Invalid signature', { status: 400 })
    }

    const newStatus = EVENT_TO_STATUS[event.type]
    if (!newStatus) {
      // Not a status event we track (e.g. email.sent, email.clicked) — no-op.
      return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: { 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: recipient, error: findErr } = await supabase
      .from('outbound_email_recipients')
      .select('id, status')
      .eq('resend_email_id', event.data.email_id)
      .maybeSingle()

    if (findErr || !recipient) {
      // Not a tracked email — this webhook endpoint is account-wide.
      return new Response(JSON.stringify({ ok: true, tracked: false }), { headers: { 'Content-Type': 'application/json' } })
    }

    const currentRank = STATUS_RANK[recipient.status] ?? 0
    const newRank = STATUS_RANK[newStatus] ?? 0
    if (newRank >= currentRank) {
      await supabase.from('outbound_email_recipients')
        .update({ status: newStatus, status_updated_at: new Date().toISOString() })
        .eq('id', recipient.id)
    }

    return new Response(JSON.stringify({ ok: true, tracked: true }), { headers: { 'Content-Type': 'application/json' } })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[resend-webhook]', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
