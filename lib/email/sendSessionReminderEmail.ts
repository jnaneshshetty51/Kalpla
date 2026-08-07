import { generateUnsubscribeToken } from "@/lib/email/unsubscribeToken";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "Kalpla Live Sessions <sessions@kalpla.app>";

const SESSION_TYPE_LABELS: Record<string, string> = {
  live_class: "Live Class",
  architecture_session: "Architecture Session",
  office_hours: "Office Hours",
  mock_interview: "Mock Interview",
};

function buildEmailBody(
  userName: string,
  sessionTitle: string,
  sessionType: string,
  startsAt: string,
  sessionsUrl: string,
  unsubscribeUrl: string,
) {
  const typeLabel = SESSION_TYPE_LABELS[sessionType] || sessionType;
  const timeStr = new Date(startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  const text = `Hi ${userName},

Your ${typeLabel} — "${sessionTitle}" — starts soon (${timeStr}).

Join here: ${sessionsUrl}

---
Unsubscribe from these emails: ${unsubscribeUrl}`;

  const html = `<div style="font-family: -apple-system, sans-serif; max-width: 480px; color:#111;">
<p>Hi ${userName},</p>
<p>Your <strong>${typeLabel}</strong> — "${sessionTitle}" — starts soon (${timeStr}).</p>
<p><a href="${sessionsUrl}" style="color:#4f46e5;">Join on Kalpla &rarr;</a></p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
<p style="font-size:12px;color:#888;">
<a href="${unsubscribeUrl}" style="color:#888;">Unsubscribe from session reminder emails</a>
</p>
</div>`;

  return { text, html };
}

export interface SendSessionReminderEmailParams {
  userId: string;
  email: string;
  userName: string;
  sessionTitle: string;
  sessionType: string;
  startsAt: string;
  baseUrl: string;
}

/**
 * Sends a "your session starts soon" email via Resend. Reuses the same
 * email_notifications_enabled flag and unsubscribe token as the daily
 * coach email — no new per-notification-type opt-in column for a pilot
 * this size. Links to /live-sessions (the list page), not directly to the
 * room, since this fires 10-20 minutes out, before the room's own join
 * window opens at T-minus-10.
 */
export async function sendSessionReminderEmail({
  userId,
  email,
  userName,
  sessionTitle,
  sessionType,
  startsAt,
  baseUrl,
}: SendSessionReminderEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  const sessionsUrl = `${baseUrl}/live-sessions`;
  const unsubscribeUrl = `${baseUrl}/api/email/unsubscribe?user_id=${userId}&token=${generateUnsubscribeToken(userId)}`;
  const { text, html } = buildEmailBody(userName, sessionTitle, sessionType, startsAt, sessionsUrl, unsubscribeUrl);

  if (!apiKey) {
    console.warn(
      `[lib/email/sendSessionReminderEmail] RESEND_API_KEY not configured. Skipping send for ${email} (dev mode) — would have sent:\n${text}`,
    );
    return false;
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: email,
      subject: `Starting soon: ${sessionTitle}`,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    console.error(`[lib/email/sendSessionReminderEmail] Resend API request failed (${response.status}): ${errBody}`);
    return false;
  }

  return true;
}
