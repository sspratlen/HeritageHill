// Supabase Edge Function: notify-leader-approved
// Called when an admin approves a small group leader application.
// Sends a congratulatory approval email to the applicant via Resend.
//
// Deploy: supabase functions deploy notify-leader-approved
// Env vars required: RESEND_API_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { applicantEmail, applicantName, groupName } = await req.json()

    if (!applicantEmail) {
      return new Response(
        JSON.stringify({ ok: true, skipped: 'No applicant email provided' }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const firstName = (applicantName || '').trim().split(/\s+/)[0] || 'Friend'
    const group     = (groupName || 'your small group').trim()

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#1C1C1E;">

        <!-- Header -->
        <div style="background:#BC7A1E;padding:28px 32px;border-radius:12px 12px 0 0;">
          <p style="margin:0;color:rgba(255,255,255,.75);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">Heritage Hill Church · Papillion, Nebraska</p>
          <h1 style="margin:8px 0 0;color:#fff;font-size:24px;font-weight:700;line-height:1.25;">You're Approved! 🎉</h1>
        </div>

        <!-- Body -->
        <div style="background:#ffffff;border:1px solid #e4e4e4;border-top:none;padding:32px;border-radius:0 0 12px 12px;">

          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            Hi ${firstName},
          </p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            Great news — your application to lead <strong>${group}</strong> has been approved!
            We're so excited to have you as part of our small group leadership team at Heritage Hill.
          </p>

          <!-- Highlight box -->
          <div style="background:#fdf6ec;border-left:4px solid #BC7A1E;border-radius:0 8px 8px 0;padding:16px 20px;margin:24px 0;">
            <p style="margin:0;font-size:14px;font-weight:700;color:#92400e;margin-bottom:6px;">What happens next</p>
            <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.8;color:#1C1C1E;">
              <li>Your small group is being reviewed by our team.</li>
              <li>Once finalized, it will be published live on the <a href="https://heritagehill.church/small-groups.html" style="color:#BC7A1E;font-weight:600;">Small Groups page</a> of the website.</li>
              <li>We'll be in touch with any details or next steps.</li>
            </ul>
          </div>

          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            If you have any questions in the meantime, feel free to reply to this email or
            reach out to us at
            <a href="mailto:heritagehillchurch@gmail.com" style="color:#BC7A1E;font-weight:600;">heritagehillchurch@gmail.com</a>.
          </p>

          <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            We're grateful for your willingness to serve,
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
      `Great news — your application to lead "${group}" has been approved!`,
      `We're excited to have you as part of our small group leadership team at Heritage Hill.`,
      ``,
      `What happens next:`,
      `  • Your small group is being reviewed by our team.`,
      `  • Once finalized, it will be published live on our Small Groups page.`,
      `  • We'll be in touch with any details or next steps.`,
      ``,
      `If you have any questions, reply to this email or reach out at heritagehillchurch@gmail.com.`,
      ``,
      `We're grateful for your willingness to serve,`,
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
        to:      [applicantEmail],
        subject: `You're Approved as a Small Group Leader — Heritage Hill Church`,
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
    console.error('[notify-leader-approved]', msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
