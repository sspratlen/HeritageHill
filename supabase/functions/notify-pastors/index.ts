// Supabase Edge Function: notify-pastors
// Triggered after a prayer request is submitted.
// Reads pastor email list from site_settings and sends
// a notification email via Resend.
//
// Deploy: supabase functions deploy notify-pastors
// Env vars required: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { name, email, request, private: isPrivate } = await req.json()

    // Fetch pastor emails from site_settings using service role (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'pastor_emails')
      .single()

    const pastorEmails: string[] = Array.isArray(data?.value) ? data.value : []

    if (!pastorEmails.length) {
      return new Response(
        JSON.stringify({ ok: true, skipped: 'No pastor emails configured' }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const submitterName = (name || '').trim() || 'Anonymous'
    const privacyNote   = isPrivate
      ? '\n\n⚠️  This request is marked PRIVATE — do not share publicly or include in group emails.'
      : ''
    const replyTo = email && email.trim() ? email.trim() : undefined

    const textBody = [
      `A new prayer request was submitted on the Heritage Hill website.`,
      ``,
      `From:    ${submitterName}`,
      email ? `Email:   ${email}` : `Email:   (not provided)`,
      ``,
      `Request:`,
      request,
      privacyNote,
      ``,
      `──────────────────────────────`,
      `Log in to the admin dashboard to manage this request, mark it as prayed, or load it into a prayer email campaign.`,
    ].join('\n')

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1C1C1E;">
        <div style="background:#155CA2;padding:20px 28px;border-radius:10px 10px 0 0;">
          <p style="margin:0;color:#fff;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Heritage Hill Church</p>
          <h2 style="margin:6px 0 0;color:#fff;font-size:20px;">New Prayer Request</h2>
        </div>
        <div style="background:#fff;border:1px solid #e4e4e4;border-top:none;padding:24px 28px;border-radius:0 0 10px 10px;">
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <tr><td style="padding:6px 0;font-size:13px;color:#6B6B6B;font-weight:700;width:80px;">FROM</td><td style="padding:6px 0;font-size:14px;">${submitterName}</td></tr>
            ${email ? `<tr><td style="padding:6px 0;font-size:13px;color:#6B6B6B;font-weight:700;">EMAIL</td><td style="padding:6px 0;font-size:14px;"><a href="mailto:${email}" style="color:#155CA2;">${email}</a></td></tr>` : ''}
          </table>
          ${isPrivate ? `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px 14px;font-size:13px;color:#92400e;margin-bottom:16px;">⚠️ <strong>Private Request</strong> — Do not share publicly or include in group emails.</div>` : ''}
          <div style="background:#f4f4f2;border-radius:8px;padding:16px 18px;font-size:15px;line-height:1.75;color:#1C1C1E;white-space:pre-wrap;">${request.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
          <div style="margin-top:24px;padding-top:18px;border-top:1px solid #e4e4e4;font-size:12px;color:#6B6B6B;">
            Log in to the <a href="https://heritagehill.church/admin/dashboard.html?tab=prayer" style="color:#155CA2;">admin dashboard</a> to mark this as prayed or add it to a prayer email campaign.
          </div>
        </div>
      </div>
    `

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:     'Heritage Hill Church <noreply@heritagehill.church>',
        to:       pastorEmails,
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject:  `New Prayer Request${isPrivate ? ' (Private)' : ''} — ${submitterName}`,
        text:     textBody,
        html:     htmlBody,
      }),
    })

    if (!resendRes.ok) {
      const err = await resendRes.text()
      throw new Error(`Resend error: ${err}`)
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[notify-pastors]', msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
