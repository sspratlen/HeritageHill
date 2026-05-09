// ================================================================
//  Heritage Hill Church — Contact Email Edge Function
//  Deployed to: Supabase Edge Functions (Deno runtime)
//
//  Receives a contact form submission, saves it to the
//  contact_messages table, and sends a notification email
//  to the church via Resend (https://resend.com).
//
//  Required secret (set via Supabase Dashboard → Settings → Secrets):
//    RESEND_API_KEY=re_xxxxxxxxxxxx
//
//  Deploy:
//    supabase functions deploy send-contact-email
// ================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const TO_EMAIL   = "heritagehillchurch@gmail.com";
const FROM_EMAIL = "no-reply@heritagehill.church"; // must be a verified Resend domain

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { name, email, phone, message, source } = await req.json();

    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ error: "name, email, and message are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Save to Supabase ────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabase.from("contact_messages").insert({
      name, email, phone: phone || null,
      message, source: source || "website",
    });

    // ── Send email via Resend ───────────────────────────────────
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const phoneLine = phone ? `<tr><td style="padding:4px 0;color:#666;width:80px;">Phone</td><td>${phone}</td></tr>` : "";
      const sourceLine = source ? `<tr><td style="padding:4px 0;color:#666;">Source</td><td>${source}</td></tr>` : "";

      const html = `
        <div style="font-family:'DM Sans',sans-serif;max-width:560px;margin:0 auto;">
          <div style="background:#bc7a1e;padding:20px 28px;border-radius:10px 10px 0 0;">
            <h2 style="color:#fff;margin:0;font-size:1.2rem;">New Message — Heritage Hill Church</h2>
          </div>
          <div style="background:#fff;padding:28px;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;">
            <table style="width:100%;border-collapse:collapse;font-size:.95rem;">
              <tr><td style="padding:4px 0;color:#666;width:80px;">From</td><td><strong>${name}</strong></td></tr>
              <tr><td style="padding:4px 0;color:#666;">Email</td><td><a href="mailto:${email}">${email}</a></td></tr>
              ${phoneLine}
              ${sourceLine}
            </table>
            <div style="margin-top:20px;padding:16px;background:#f8f8f8;border-radius:8px;font-size:.95rem;line-height:1.6;white-space:pre-wrap;">${message}</div>
            <div style="margin-top:24px;">
              <a href="mailto:${email}?subject=Re: Your message to Heritage Hill Church" style="background:#bc7a1e;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Reply to ${name}</a>
            </div>
          </div>
          <p style="text-align:center;font-size:.78rem;color:#999;margin-top:14px;">Sent via Heritage Hill website contact form</p>
        </div>`;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [TO_EMAIL],
          reply_to: email,
          subject: `New message from ${name} — Heritage Hill Website`,
          html,
        }),
      });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[send-contact-email] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
