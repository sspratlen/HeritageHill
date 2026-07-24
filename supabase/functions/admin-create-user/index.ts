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
    const body = await req.json()
    const { email, action, userId } = body

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    if (action === 'delete') {
      // Verify the CALLER is an admin (delete is destructive; create/reset was
      // already exposed, but deletion must be gated).
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
      if (!userId) {
        return new Response(JSON.stringify({ error: 'userId required' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      const { error: delErr } = await admin.auth.admin.deleteUser(userId)
      if (delErr) throw delErr
      return new Response(JSON.stringify({ ok: true, action: 'deleted' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

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

    // If the user already exists, look them up.
    if (createErr.message.toLowerCase().includes('already') || createErr.message.toLowerCase().includes('duplicate') || createErr.status === 422) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
      if (listErr) throw listErr
      const existing = list.users.find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase())
      if (!existing) throw new Error('User lookup failed after duplicate error')

      // action === 'createIfNew' means "never touch an existing account's
      // password" — used by bulk/auto-provisioning flows where the caller
      // cannot be sure whether this person already set their own password.
      if (action === 'createIfNew') {
        return new Response(JSON.stringify({ ok: true, action: 'existed', userId: existing.id }), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }

      // Default behavior (explicit staff-initiated create/reset): reset their
      // password to the temp password.
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
