// Supabase Edge Function: admin-invite-user
// Creates a brand-new auth account via a Supabase invite link and emails the
// person a Heritage Hill-branded sign-in link via Resend -- never a plaintext
// password, never anything that looks like it came from Supabase.
//
// Deploy: supabase functions deploy admin-invite-user
// Env vars required: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Note: generateLink both creates the user AND returns the one-time link in
// a single call. If the Resend send below fails after that, the auth user
// already exists with no password set -- a retry of this same function will
// fail with "already registered." Recovery in that case is a manual resend
// via the Supabase Dashboard's Authentication -> Users -> invite flow, not
// this function again.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const { name, email, redirectTo } = body

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Creating an arbitrary new account is more sensitive than the existing
    // admin-create-user reset flow, so this is admin-only rather than any
    // staff role.
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    const { data: caller, error: callerErr } = await admin.auth.getUser(jwt)
    if (callerErr || !caller?.user?.email) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const { data: roleRow } = await admin.from('user_roles')
      .select('role').eq('email', caller.user.email.toLowerCase()).maybeSingle()
    if (!roleRow || roleRow.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admins only' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (!email || !name) {
      return new Response(JSON.stringify({ error: 'Name and email are required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const lowerEmail = email.toLowerCase()

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: lowerEmail,
      options: { data: { name }, redirectTo },
    })

    if (linkErr) {
      const msg = linkErr.message || String(linkErr)
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered') || linkErr.status === 422) {
        return new Response(JSON.stringify({ error: 'An account already exists for this email. Use "Set Up Account" or "Send Password Reset" instead.' }), {
          status: 409, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      throw linkErr
    }

    const actionLink = linkData?.properties?.action_link
    if (!actionLink) throw new Error('No invite link returned')

    const firstName = (name || '').trim().split(/\s+/)[0] || 'Friend'

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#1C1C1E;">

        <!-- Header -->
        <div style="background:#BC7A1E;padding:28px 32px;border-radius:12px 12px 0 0;">
          <p style="margin:0;color:rgba(255,255,255,.75);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">Heritage Hill Church &middot; Papillion, Nebraska</p>
          <h1 style="margin:8px 0 0;color:#fff;font-size:24px;font-weight:700;line-height:1.25;">You're Invited!</h1>
        </div>

        <!-- Body -->
        <div style="background:#ffffff;border:1px solid #e4e4e4;border-top:none;padding:32px;border-radius:0 0 12px 12px;">

          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            Hi ${firstName},
          </p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            An account has been created for you on the Heritage Hill Church website. Click below to set up your password and sign in.
          </p>

          <div style="text-align:center;margin:28px 0;">
            <a href="${actionLink}" style="display:inline-block;background:#BC7A1E;color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;">Set Up Your Account</a>
          </div>

          <p style="margin:0 0 18px;font-size:13px;line-height:1.7;color:#6B6B6B;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${actionLink}" style="color:#BC7A1E;word-break:break-all;">${actionLink}</a>
          </p>

          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            If you have any questions, feel free to reply to this email or reach out to us at
            <a href="mailto:heritagehillchurch@gmail.com" style="color:#BC7A1E;font-weight:600;">heritagehillchurch@gmail.com</a>.
          </p>

          <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            We're glad you're here,
          </p>
          <p style="margin:0;font-size:15px;font-weight:700;color:#1C1C1E;">
            The Heritage Hill Church Team
          </p>

          <!-- Divider + footer -->
          <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e4e4e4;font-size:11.5px;color:#9ca3af;line-height:1.6;">
            Heritage Hill Church &nbsp;&middot;&nbsp; 6909 Cornhusker Rd, Papillion, NE 68133<br>
            <a href="https://heritagehill.church" style="color:#BC7A1E;text-decoration:none;">heritagehill.church</a>
          </div>

        </div>
      </div>
    `

    const textBody = [
      `Hi ${firstName},`,
      ``,
      `An account has been created for you on the Heritage Hill Church website.`,
      `Set up your password and sign in using the link below:`,
      ``,
      actionLink,
      ``,
      `If you have any questions, reply to this email or reach out at heritagehillchurch@gmail.com.`,
      ``,
      `We're glad you're here,`,
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
        to:      [lowerEmail],
        subject: `You're Invited to Heritage Hill Church`,
        text:    textBody,
        html:    htmlBody,
      }),
    })

    if (!resendRes.ok) {
      const err = await resendRes.text()
      throw new Error(`Resend error: ${err}`)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[admin-invite-user]', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
