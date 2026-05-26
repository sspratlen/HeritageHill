// Supabase Edge Function: notify-retreat-registrant
// Called after a man registers for the Nebraska Nazarene Men's Retreat.
// Sends a confirmation email to the registrant via Resend.
//
// Deploy: supabase functions deploy notify-retreat-registrant
// Env vars required: RESEND_API_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { fullName, email, church, dietary } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ ok: true, skipped: 'No email provided' }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const firstName = (fullName || '').trim().split(/\s+/)[0] || 'Friend'
    const churchLine = church ? `<tr><td style="padding:5px 0;font-size:13px;color:#9ca3af;font-weight:700;width:90px;vertical-align:top;">CHURCH</td><td style="padding:5px 0;font-size:14px;color:#F5F0E8;">${church}</td></tr>` : ''
    const dietaryLine = dietary ? `<tr><td style="padding:5px 0;font-size:13px;color:#9ca3af;font-weight:700;vertical-align:top;">DIETARY</td><td style="padding:5px 0;font-size:14px;color:#F5F0E8;">${dietary}</td></tr>` : ''

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;background:#1A1A1A;color:#F5F0E8;border-radius:12px;overflow:hidden;">

        <!-- Header -->
        <div style="background:#0C0E11;padding:36px 32px 28px;text-align:center;border-bottom:3px solid #E8891A;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#E8891A;">Nebraska Nazarene</p>
          <h1 style="margin:0 0 6px;color:#F5F0E8;font-size:26px;font-weight:800;line-height:1.2;">Men's Retreat 2025</h1>
          <p style="margin:0;font-size:14px;color:rgba(245,240,232,.6);font-style:italic;">Building Teams: At Home, At Church, and At Work</p>
        </div>

        <!-- Body -->
        <div style="padding:32px;">

          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#E8891A;">You're registered, ${firstName}! 🙌</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:rgba(245,240,232,.85);">
            We've got your spot for the Nebraska Nazarene Men's Retreat. Get ready for a great weekend of brotherhood, growth, and encouragement.
          </p>

          <!-- Event details box -->
          <div style="background:#252525;border:1px solid #333;border-left:4px solid #E8891A;border-radius:0 8px 8px 0;padding:20px 22px;margin:0 0 24px;">
            <p style="margin:0 0 14px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#E8891A;">Event Details</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:5px 0;font-size:13px;color:#9ca3af;font-weight:700;width:90px;vertical-align:top;">WHEN</td>
                <td style="padding:5px 0;font-size:14px;color:#F5F0E8;">August 21–22, 2025<br><span style="font-size:12px;color:rgba(245,240,232,.6);">Thursday evening through Friday</span></td>
              </tr>
              <tr>
                <td style="padding:5px 0;font-size:13px;color:#9ca3af;font-weight:700;vertical-align:top;">WHERE</td>
                <td style="padding:5px 0;font-size:14px;color:#F5F0E8;">Nebraska Youth Camp<br><span style="font-size:12px;color:rgba(245,240,232,.6);">65 Sweetwater Ave S, Kearney, NE 68847</span></td>
              </tr>
              <tr>
                <td style="padding:5px 0;font-size:13px;color:#9ca3af;font-weight:700;vertical-align:top;">COST</td>
                <td style="padding:5px 0;font-size:14px;color:#F5F0E8;">$100 per person<br><span style="font-size:12px;color:rgba(245,240,232,.6);">Includes all meals &amp; lodging</span></td>
              </tr>
              <tr>
                <td style="padding:5px 0;font-size:13px;color:#9ca3af;font-weight:700;vertical-align:top;">YOUR INFO</td>
                <td style="padding:5px 0;font-size:14px;color:#F5F0E8;">${fullName}</td>
              </tr>
              ${churchLine}
              ${dietaryLine}
            </table>
          </div>

          <!-- What's next -->
          <div style="background:#252525;border:1px solid #333;border-radius:8px;padding:20px 22px;margin:0 0 24px;">
            <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#E8891A;">What's Next</p>
            <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.85;color:rgba(245,240,232,.85);">
              <li>A full schedule will be sent closer to the event.</li>
              <li>Payment of <strong style="color:#F5F0E8;">$100</strong> can be made at the retreat check-in or arranged in advance — we'll be in touch.</li>
              <li>Questions? Reply to this email or reach out to <a href="mailto:scottspratlen@heritagehill.church" style="color:#E8891A;font-weight:600;">scottspratlen@heritagehill.church</a>.</li>
            </ul>
          </div>

          <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:rgba(245,240,232,.85);">
            See you in August —
          </p>
          <p style="margin:0;font-size:15px;font-weight:700;color:#F5F0E8;">Heritage Hill Church</p>

          <!-- Footer -->
          <div style="margin-top:28px;padding-top:18px;border-top:1px solid #333;font-size:11.5px;color:#6b7280;line-height:1.6;">
            Heritage Hill Church &nbsp;·&nbsp; 6909 Cornhusker Rd, Papillion, NE 68133<br>
            <a href="https://heritagehill.church" style="color:#E8891A;text-decoration:none;">heritagehill.church</a>
          </div>
        </div>

      </div>
    `

    const textBody = [
      `You're registered, ${firstName}!`,
      ``,
      `We've got your spot for the Nebraska Nazarene Men's Retreat.`,
      `Building Teams: At Home, At Church, and At Work`,
      ``,
      `EVENT DETAILS`,
      `  When:  August 21–22, 2025 (Thursday evening through Friday)`,
      `  Where: Nebraska Youth Camp — 65 Sweetwater Ave S, Kearney, NE 68847`,
      `  Cost:  $100 per person — includes all meals & lodging`,
      `  Name:  ${fullName}`,
      ...(church ? [`  Church: ${church}`] : []),
      ...(dietary ? [`  Dietary notes: ${dietary}`] : []),
      ``,
      `WHAT'S NEXT`,
      `  • A full schedule will be sent closer to the event.`,
      `  • Payment of $100 can be made at retreat check-in or arranged in advance.`,
      `  • Questions? Reply to this email or contact scottspratlen@heritagehill.church`,
      ``,
      `See you in August —`,
      `Heritage Hill Church`,
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
        subject: `You're Registered — Nebraska Nazarene Men's Retreat 2025`,
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
    console.error('[notify-retreat-registrant]', msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
