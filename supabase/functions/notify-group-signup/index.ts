// Supabase Edge Function: notify-group-signup
// Called after someone submits the "Join a Group" form on the public
// Small Groups page. Sends a confirmation email to the requester via Resend.
//
// Deploy: supabase functions deploy notify-group-signup
// Env vars required: RESEND_API_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { name, email, groupName, leaderName } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ ok: true, skipped: 'No email provided' }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const firstName = (name || '').trim().split(/\s+/)[0] || 'Friend'
    const group      = (groupName || 'the group').trim()
    const leaderLine = leaderName ? `<strong>${leaderName}</strong>` : 'the group leader'
    const leaderText = leaderName ? leaderName : 'the group leader'

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#1C1C1E;">

        <!-- Header -->
        <div style="background:#BC7A1E;padding:28px 32px;border-radius:12px 12px 0 0;">
          <p style="margin:0;color:rgba(255,255,255,.75);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">Heritage Hill Church · Papillion, Nebraska</p>
          <h1 style="margin:8px 0 0;color:#fff;font-size:24px;font-weight:700;line-height:1.25;">Request Received! 🙌</h1>
        </div>

        <!-- Body -->
        <div style="background:#ffffff;border:1px solid #e4e4e4;border-top:none;padding:32px;border-radius:0 0 12px 12px;">

          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            Hi ${firstName},
          </p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            Thanks for your interest in joining <strong>${group}</strong>! We've received your request
            and passed it along to ${leaderLine}.
          </p>

          <!-- Highlight box -->
          <div style="background:#fdf6ec;border-left:4px solid #BC7A1E;border-radius:0 8px 8px 0;padding:16px 20px;margin:24px 0;">
            <p style="margin:0;font-size:14px;font-weight:700;color:#92400e;margin-bottom:6px;">What happens next</p>
            <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.8;color:#1C1C1E;">
              <li>${leaderLine} will reach out to you directly with next steps.</li>
              <li>This usually happens within a few days.</li>
            </ul>
          </div>

          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            If you have any questions in the meantime, feel free to reply to this email or
            reach out to us at
            <a href="mailto:heritagehillchurch@gmail.com" style="color:#BC7A1E;font-weight:600;">heritagehillchurch@gmail.com</a>.
          </p>

          <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            We're glad you're taking this step,
          </p>
          <p style="margin:0;font-size:15px;font-weight:700;color:#1C1C1E;">
            The Heritage Hill Church Team
          </p>

          <!-- Divider + footer -->
          <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e4e4e4;font-size:11.5px;color:#9ca3af;line-height:1.6;">
            Heritage Hill Church &nbsp;·&nbsp; 6909 Cornhusker Rd, Papillion, NE 68133<br>
            <a href="https://heritagehill.church" style="color:#BC7A1E;text-decoration:none;">heritagehill.church</a>
          </div>

        </div>
      </div>
    `

    const textBody = [
      `Hi ${firstName},`,
      ``,
      `Thanks for your interest in joining "${group}"! We've received your request`,
      `and passed it along to ${leaderText}.`,
      ``,
      `What happens next:`,
      `  • ${leaderText} will reach out to you directly with next steps.`,
      `  • This usually happens within a few days.`,
      ``,
      `If you have any questions, reply to this email or reach out at heritagehillchurch@gmail.com.`,
      ``,
      `We're glad you're taking this step,`,
      `The Heritage Hill Church Team`,
      ``,
      `Heritage Hill Church · 6909 Cornhusker Rd, Papillion, NE 68133`,
      `https://heritagehill.church`,
    ].join('\n')

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    'Heritage Hill Church <noreply@heritagehill.church>',
        to:      [email],
        subject: `We Got Your Request to Join ${group} — Heritage Hill Church`,
        text:    textBody,
        html:    htmlBody,
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
    console.error('[notify-group-signup]', msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
