// Supabase Edge Function: admin-create-user
// Creates or resets a Supabase auth user with the default temp password.
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (auto-injected by Supabase).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TEMP_PASSWORD = 'HHTemp!'

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { email } = await req.json()
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Try to create the user first
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: TEMP_PASSWORD,
      email_confirm: true,
    })

    if (!createErr) {
      return new Response(JSON.stringify({ ok: true, action: 'created', userId: created.user.id }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // If the user already exists, find them and reset their password
    if (createErr.message.toLowerCase().includes('already') || createErr.message.toLowerCase().includes('duplicate') || createErr.status === 422) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
      if (listErr) throw listErr
      const existing = list.users.find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase())
      if (!existing) throw new Error('User lookup failed after duplicate error')

      const { error: updateErr } = await admin.auth.admin.updateUserById(existing.id, {
        password: TEMP_PASSWORD,
      })
      if (updateErr) throw updateErr

      return new Response(JSON.stringify({ ok: true, action: 'reset', userId: existing.id }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    throw createErr

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[admin-create-user]', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
