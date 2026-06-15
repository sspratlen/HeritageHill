// Supabase Edge Function: send-group-email
// Sends a rich-text email from a small group leader to their group members via Resend.
// Recipients are sent via BCC so they don't see each other's addresses.
// Env vars required: RESEND_API_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { subject, htmlBody, recipients, fromName } = await req.json()

    if (!subject || !htmlBody || !Array.isArray(recipients) || !recipients.length) {
      return new Response(JSON.stringify({ error: 'subject, htmlBody, and recipients are required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const senderName = fromName || 'Heritage Hill Church'

    // Wrap the Quill HTML in a clean email shell
    const wrappedHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 0; background: #f4f4f2; font-family: Arial, sans-serif; }
    .wrap { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
    .header { background: #0C0E11; padding: 24px 32px; border-bottom: 3px solid #BC7A1E; }
    .header p { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #BC7A1E; }
    .header h1 { margin: 6px 0 0; color: #F5F0E8; font-size: 20px; font-weight: 700; }
    .body { padding: 28px 32px; font-size: 15px; line-height: 1.7; color: #1C1C1E; }
    .body h1, .body h2, .body h3 { color: #0D0F14; margin: 0 0 12px; }
    .body a { color: #BC7A1E; }
    .body img { max-width: 100%; border-radius: 6px; }
    .body ul, .body ol { padding-left: 20px; margin: 0 0 12px; }
    .footer { padding: 18px 32px; border-top: 1px solid #e4e4e4; font-size: 12px; color: #6b7280; }
    .footer a { color: #BC7A1E; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <p>Heritage Hill Church</p>
      <h1>${senderName}</h1>
    </div>
    <div class="body">${htmlBody}</div>
    <div class="footer">
      Heritage Hill Church &nbsp;·&nbsp; 6909 Cornhusker Rd, Papillion, NE 68133<br>
      <a href="https://heritagehill.church">heritagehill.church</a>
    </div>
  </div>
</body>
</html>`

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${senderName} <noreply@heritagehill.church>`,
        to:   ['noreply@heritagehill.church'],
        bcc:  recipients,
        subject,
        html: wrappedHtml,
      }),
    })

    if (!resendRes.ok) {
      const err = await resendRes.text()
      throw new Error(`Resend error: ${err}`)
    }

    return new Response(JSON.stringify({ ok: true, sent: recipients.length }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[send-group-email]', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
