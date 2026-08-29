// Supabase Edge Function: analyze-assessments
// Given an aggregate DISC/Spiritual Gifts snapshot (no PII — counts and
// gift/ministry names only), asks Claude for a ministry-gap analysis for
// the admin dashboard's Analytics tab.
//
// Required secret (set via Supabase Dashboard → Settings → Secrets):
//   ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
//
// Deploy:
//   supabase functions deploy analyze-assessments

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Auth check — same pattern as the mailchimp function's admin-only actions:
    // confirm the caller has a valid Supabase session, but don't restrict to a
    // specific role (front-end ROLE_TABS already gates who sees this tab).
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { summaryStats } = await req.json()
    if (!summaryStats) {
      return new Response(JSON.stringify({ error: 'summaryStats is required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const systemPrompt = `You are a ministry-planning analyst for a local church, Heritage Hill Church. You are given aggregate, anonymous statistics about which DISC personality types and Spiritual Gifts the congregation's assessed members have — no names, no individually-identifying information, only counts.

Your job is to help the senior pastor understand where the congregation's gift base is thin relative to the ministries that depend on those gifts, and to surface any DISC-pattern observations genuinely worth their attention. You are given, for each spiritual gift, the list of ministries at this church that rely on that gift (already configured by church staff).

Write a short, direct analysis in markdown for the pastor. Specifically:
- Name specific gifts that are thin (low count, especially zero) relative to the ministries that depend on them, and name those ministries.
- Note any real DISC-distribution pattern worth flagging (e.g., very few of a given type, if that plausibly affects leadership pipeline or team composition) — only if the data actually supports it, not one for every letter just to have something to say.
- Close with a small number (2-4) of concrete, actionable notes for the pastor.
- Do not simply restate every number — the pastor already sees the raw counts elsewhere. Your value is inference: what the numbers imply.
- Do not invent specifics about the church, its ministries, or its people beyond what is present in the data you're given.
- Participation counts (how many people have taken each assessment out of how many approved members) are provided too — factor in whether the sample is large enough to draw a conclusion, and say so if it's thin.`

    const userContent = `Aggregate assessment data:\n\n${JSON.stringify(summaryStats, null, 2)}`

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 4096,
        thinking: { type: 'adaptive' },
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    if (!claudeRes.ok) {
      const err = await claudeRes.text()
      throw new Error(`Claude API error: ${err}`)
    }

    const claudeJson = await claudeRes.json()
    const textBlock = (claudeJson.content || []).find((b: { type: string }) => b.type === 'text')
    const analysisText = textBlock ? textBlock.text : ''
    if (!analysisText) throw new Error('Claude returned no analysis text')

    return new Response(
      JSON.stringify({ analysisText }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[analyze-assessments]', msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
