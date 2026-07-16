// Supabase Edge Function: send-group-email
// Sends a rich-text email from a small group leader to their group members via Resend.
// Each member gets their own individual message (real To: address — no BCC) so Gmail/Outlook
// treat it as personal mail and keep it out of Spam / the Updates tab.
// Env vars required: RESEND_API_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Turn the Quill/wrapped HTML into a readable plain-text alternative so the message
// is never HTML-only (HTML-only mail is penalized by spam filters).
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n').map((l) => l.trim()).join('\n')
    .trim()
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { subject, htmlBody, recipients, fromName, fromEmail, replyTo } = await req.json()

    if (!subject || !htmlBody || !Array.isArray(recipients) || !recipients.length) {
      return new Response(JSON.stringify({ error: 'subject, htmlBody, and recipients are required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const senderName = fromName || 'Heritage Hill Church'

    // From must be on the verified domain. Accept a caller-supplied @heritagehill.church
    // address (e.g. an admin sending as themselves); otherwise send from noreply@.
    const fromAddr = (typeof fromEmail === 'string' && fromEmail.toLowerCase().endsWith('@heritagehill.church'))
      ? fromEmail.trim()
      : 'noreply@heritagehill.church'

    // Reply-To is only needed when replies should go somewhere other than the From address.
    const replyToRaw = (typeof replyTo === 'string' && replyTo.includes('@')) ? replyTo.trim() : ''
    const replyToEmail = replyToRaw && replyToRaw.toLowerCase() !== fromAddr.toLowerCase() ? replyToRaw : ''
    const unsubEmail = replyToEmail || fromAddr

    // Light, personal-looking shell — a simple sender line and minimal footer, no heavy
    // marketing header/imagery (which pushes Gmail toward the Promotions/Updates tab).
    const wrappedHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 0; background: #ffffff; font-family: -apple-system, Segoe UI, Arial, sans-serif; }
    .wrap { max-width: 600px; margin: 0 auto; padding: 24px; }
    .from { font-size: 13px; color: #6b7280; margin: 0 0 16px; }
    .body { font-size: 15px; line-height: 1.7; color: #1C1C1E; }
    .body h1, .body h2, .body h3 { color: #0D0F14; margin: 0 0 12px; }
    .body a { color: #BC7A1E; }
    .body img { max-width: 100%; border-radius: 6px; }
    .body ul, .body ol { padding-left: 20px; margin: 0 0 12px; }
    .footer { margin-top: 24px; padding-top: 14px; border-top: 1px solid #ececec; font-size: 12px; color: #9ca3af; }
    .footer a { color: #9ca3af; }
  </style>
</head>
<body>
  <div class="wrap">
    <p class="from">From ${senderName} · Heritage Hill Church</p>
    <div class="body">${htmlBody}</div>
    <div class="footer">
      Heritage Hill Church · 6909 Cornhusker Rd, Papillion, NE 68133 ·
      <a href="https://heritagehill.church">heritagehill.church</a>
    </div>
  </div>
</body>
</html>`

    const textBody = `${htmlToText(htmlBody)}\n\n—\nFrom ${senderName} · Heritage Hill Church\n6909 Cornhusker Rd, Papillion, NE 68133\nhttps://heritagehill.church`

    const listUnsub = `<mailto:${unsubEmail}?subject=unsubscribe>`

    // One message per recipient (real To:, no BCC). Resend batch endpoint accepts up to 100/call.
    const valid = recipients.filter((r: unknown) => typeof r === 'string' && r.includes('@'))
    const messages = valid.map((to: string) => ({
      from: `${senderName} <${fromAddr}>`,
      to: [to],
      ...(replyToEmail ? { reply_to: replyToEmail } : {}),
      subject,
      html: wrappedHtml,
      text: textBody,
      headers: {
        'List-Unsubscribe': listUnsub,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }))

    const apiKey = Deno.env.get('RESEND_API_KEY')
    let sent = 0

    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100)
      const resendRes = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      })

      if (!resendRes.ok) {
        const err = await resendRes.text()
        throw new Error(`Resend error (sent ${sent} of ${messages.length} so far): ${err}`)
      }
      sent += chunk.length
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
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
