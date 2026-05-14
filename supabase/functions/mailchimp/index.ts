// ================================================================
//  Heritage Hill Church — Mailchimp Edge Function
//  Deployed to: Supabase Edge Functions (Deno runtime)
//
//  Handles Mailchimp API operations for the admin dashboard.
//
//  Required secrets (set via Supabase Dashboard → Settings → Secrets):
//    MAILCHIMP_API_KEY=your-api-key-us1
//    MAILCHIMP_LIST_ID=your-audience-list-id
//
//  Deploy:
//    supabase functions deploy mailchimp
// ================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const MAILCHIMP_API_KEY = Deno.env.get("MAILCHIMP_API_KEY") ?? "";
  const MAILCHIMP_LIST_ID = Deno.env.get("MAILCHIMP_AUDIENCE_ID") ?? Deno.env.get("MAILCHIMP_LIST_ID") ?? "";
  const DC = Deno.env.get("MAILCHIMP_SERVER_PREFIX") || MAILCHIMP_API_KEY.split("-").pop() || "us1";
  const BASE = `https://${DC}.api.mailchimp.com/3.0`;
  const AUTH = "Basic " + btoa(`anystring:${MAILCHIMP_API_KEY}`);

  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  async function mc(path: string, options: RequestInit = {}) {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        Authorization: AUTH,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  }

  try {
    const body = await req.json();
    const { action, ...p } = body;

    // ── Add subscriber to Mailchimp audience ────────────────────
    if (action === "add_subscriber") {
      const { email, firstName = "", lastName = "" } = p;
      if (!email) return json({ error: "email is required" }, 400);

      await mc(`/lists/${MAILCHIMP_LIST_ID}/members`, {
        method: "POST",
        body: JSON.stringify({
          email_address: email,
          status: "subscribed",
          merge_fields: { FNAME: firstName, LNAME: lastName },
        }),
      });

      return json({ ok: true });
    }

    // ── Send a Mailchimp campaign ───────────────────────────────
    if (action === "send_campaign") {
      const { htmlContent, subject, previewText, fromName, replyTo, tag } = p;
      if (!htmlContent || !subject) {
        return json({ error: "htmlContent and subject are required" }, 400);
      }

      const recipients: Record<string, unknown> = { list_id: MAILCHIMP_LIST_ID };

      // When a tag is provided, send only to subscribers with that tag
      if (tag) {
        recipients.segment_opts = {
          match: "any",
          conditions: [
            { condition_type: "Tag", field: "tag", op: "is", value: tag },
          ],
        };
      }

      const campaign = await mc("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          type: "regular",
          recipients,
          settings: {
            subject_line: subject,
            preview_text: previewText ?? "",
            title: subject,
            from_name: fromName ?? "Heritage Hill Church",
            reply_to: replyTo ?? "",
          },
        }),
      });

      if (!campaign.id) {
        console.error("[mailchimp] create campaign failed:", campaign);
        return json({ error: campaign.detail ?? "Failed to create campaign" }, 400);
      }

      await mc(`/campaigns/${campaign.id}/content`, {
        method: "PUT",
        body: JSON.stringify({ html: htmlContent }),
      });

      await mc(`/campaigns/${campaign.id}/actions/send`, { method: "POST" });

      return json({ ok: true, campaignId: campaign.id });
    }

    // ── Get all audience members with tags ─────────────────────
    if (action === "get_members") {
      let allMembers: unknown[] = [];
      let offset = 0;
      const count = 500;

      while (true) {
        const data = await mc(
          `/lists/${MAILCHIMP_LIST_ID}/members?count=${count}&offset=${offset}`
        );

        // Surface Mailchimp API errors instead of silently returning []
        if (data.status && data.status !== 200) {
          return json({ error: `Mailchimp API error: ${data.detail ?? data.title ?? JSON.stringify(data)}` }, 400);
        }
        if (!data.members) {
          return json({ error: `Unexpected Mailchimp response: ${JSON.stringify(data).slice(0, 300)}` }, 400);
        }

        const batch = data.members as Record<string, unknown>[];
        allMembers = allMembers.concat(batch);
        if (batch.length < count) break;
        offset += count;
      }

      const members = (allMembers as Record<string, unknown>[]).map((m) => {
        const merge = (m.merge_fields as Record<string, unknown>) ?? {};
        const tags = ((m.tags as Array<{ name: string }>) ?? []).map(t => t.name);
        return {
          email: m.email_address,
          firstName: merge.FNAME ?? '',
          lastName: merge.LNAME ?? '',
          status: m.status ?? 'subscribed',
          tags,
        };
      });

      return json({ members, total: members.length });
    }

    // ── Get sent campaign history ───────────────────────────────
    if (action === "get_campaigns") {
      const data = await mc(
        `/campaigns?count=10&sort_field=send_time&sort_dir=DESC&status=sent`
      );
      const campaigns = (data.campaigns ?? []).map((c: Record<string, unknown>) => {
        const settings = c.settings as Record<string, unknown> | undefined;
        const recipientsInfo = c.recipients as Record<string, unknown> | undefined;
        const summary = c.report_summary as Record<string, unknown> | undefined;
        return {
          id: c.id,
          subject: settings?.subject_line,
          sendTime: c.send_time,
          recipients: recipientsInfo?.recipient_count,
          opens: summary?.open_rate,
          clicks: summary?.click_rate,
          archiveUrl: c.archive_url,
        };
      });
      return json({ campaigns });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("[mailchimp] Error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
