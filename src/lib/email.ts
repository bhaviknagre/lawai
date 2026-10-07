import "server-only";

/**
 * Transactional email through Resend (provisioned via the Vercel Marketplace, which sets RESEND_API_KEY).
 * Without a key nothing is sent and callers fall back to showing the link on screen.
 */

const FROM = () => process.env.EMAIL_FROM || "LawAI <onboarding@resend.dev>";

export const emailConfigured = () => !!process.env.RESEND_API_KEY;

export async function sendEmail(msg: { to: string; subject: string; text: string; html: string; idempotencyKey?: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false as const, reason: "Email isn't set up (RESEND_API_KEY missing)." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        ...(msg.idempotencyKey ? { "idempotency-key": msg.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({ from: FROM(), to: msg.to, subject: msg.subject, text: msg.text, html: msg.html }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[email] Resend rejected the message", res.status, body.slice(0, 300));
      return { sent: false as const, reason: `Email provider error (${res.status}).` };
    }
    return { sent: true as const };
  } catch (e) {
    console.error("[email] send failed", e);
    return { sent: false as const, reason: "Couldn't reach the email provider." };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Plain, single-column HTML that renders the same in every mail client. */
function layout(paragraphs: string[], button?: { label: string; url: string }, footer?: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101828">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<div style="font-size:20px;font-weight:800;margin-bottom:24px">LawAI</div>
<div style="background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:28px">
${paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.55">${p}</p>`).join("")}
${button ? `<p style="margin:24px 0"><a href="${esc(button.url)}" style="display:inline-block;background:#2b44d6;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${esc(button.label)}</a></p>
<p style="margin:0;font-size:13px;color:#667085;word-break:break-all">Or paste this link into your browser:<br>${esc(button.url)}</p>` : ""}
</div>
${footer ? `<p style="font-size:12.5px;color:#667085;margin:16px 4px">${footer}</p>` : ""}
</div></body></html>`;
}

const when = (d: Date) => d.toUTCString().replace(":00 GMT", " UTC");

export function linkEmail(p: { name: string; email: string; firmName: string; url: string; expiresAt: Date; kind: "invite" | "reset"; invitedBy?: string | null }) {
  const first = p.name.split(" ")[0];
  if (p.kind === "invite") {
    const by = p.invitedBy ? `${p.invitedBy} has invited you` : "You've been invited";
    return {
      to: p.email,
      subject: `You're invited to LawAI for ${p.firmName}`,
      text: `Hi ${first},\n\n${by} to join ${p.firmName} on LawAI.\n\nChoose your password here (the link works once, until ${when(p.expiresAt)}):\n${p.url}\n\nAfterwards, sign in with ${p.email}.\n\nIf you weren't expecting this, you can ignore this email.`,
      html: layout(
        [`Hi ${esc(first!)},`, `${esc(by)} to join <strong>${esc(p.firmName)}</strong> on LawAI.`, `Click below to confirm your email and choose your password. The link works once, until ${esc(when(p.expiresAt))}.`],
        { label: "Accept invite", url: p.url },
        `You'll sign in with ${esc(p.email)}. If you weren't expecting this, you can ignore this email.`,
      ),
    };
  }
  return {
    to: p.email,
    subject: "Choose a new LawAI password",
    text: `Hi ${first},\n\nYour firm's admin reset your LawAI password. Choose a new one here (the link works once, until ${when(p.expiresAt)}):\n${p.url}\n\nYour old password no longer works.`,
    html: layout(
      [`Hi ${esc(first!)},`, `Your firm's admin reset your LawAI password, so your old password no longer works.`, `Choose a new one below. The link works once, until ${esc(when(p.expiresAt))}.`],
      { label: "Choose a new password", url: p.url },
    ),
  };
}

export function adminActivatedEmail(p: { to: string; adminName: string; adminEmail: string; firmName: string; platformUrl: string }) {
  return {
    to: p.to,
    subject: `${p.firmName}: admin confirmed`,
    text: `${p.adminName} (${p.adminEmail}) confirmed their email and set up their LawAI account as admin of ${p.firmName}. They can now invite associates and paralegals.\n\nPlatform: ${p.platformUrl}`,
    html: layout(
      [`<strong>${esc(p.adminName)}</strong> (${esc(p.adminEmail)}) confirmed their email and set up their LawAI account as admin of <strong>${esc(p.firmName)}</strong>.`, "They can now invite associates and paralegals."],
      { label: "Open Platform", url: p.platformUrl },
    ),
  };
}
