import nodemailer from "nodemailer";

/**
 * Sends a transactional email over SMTP (Google Workspace / Gmail with an app password).
 * Env: SMTP_USER, SMTP_PASS (app password), optional SMTP_HOST (default smtp.gmail.com),
 * SMTP_PORT (default 465) and NOTIFY_FROM_EMAIL (default: SMTP_USER; Gmail rewrites any
 * other From to the authenticated account unless it is a verified alias).
 * When SMTP_USER/SMTP_PASS are missing this is a no-op that reports it, so creating a
 * request never depends on email.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return { ok: false, error: "Email notifications are not configured." };

  const port = Number(process.env.SMTP_PORT || 465);
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transport.sendMail({
      from: process.env.NOTIFY_FROM_EMAIL || user,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Email send failed." };
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
