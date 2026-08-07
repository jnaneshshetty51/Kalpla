import { generateUnsubscribeToken } from "@/lib/email/unsubscribeToken";
import { DailyTask } from "@/lib/coach/generateDailyTasks";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "Kalpla Daily Coach <coach@kalpla.app>";

function buildEmailBody(userName: string, tasks: DailyTask[], dashboardUrl: string, unsubscribeUrl: string) {
  const taskLines = tasks
    .map((t) => `- ${t.title} (${t.estimated_minutes} min): ${t.description}`)
    .join("\n");

  const text = `Hi ${userName},

Here's your task list for today:

${taskLines}

Continue here: ${dashboardUrl}

---
Unsubscribe from these emails: ${unsubscribeUrl}`;

  const taskListHtml = tasks
    .map(
      (t) =>
        `<li style="margin-bottom:8px;"><strong>${t.title}</strong> (${t.estimated_minutes} min)<br><span style="color:#555;">${t.description}</span></li>`,
    )
    .join("");

  const html = `<div style="font-family: -apple-system, sans-serif; max-width: 480px; color:#111;">
<p>Hi ${userName},</p>
<p>Here's your task list for today:</p>
<ul style="padding-left:20px;">${taskListHtml}</ul>
<p><a href="${dashboardUrl}" style="color:#4f46e5;">Continue on Kalpla &rarr;</a></p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
<p style="font-size:12px;color:#888;">
<a href="${unsubscribeUrl}" style="color:#888;">Unsubscribe from daily coach emails</a>
</p>
</div>`;

  return { text, html };
}

export interface SendDailyCoachEmailParams {
  userId: string;
  email: string;
  userName: string;
  tasks: DailyTask[];
  baseUrl: string;
}

/**
 * Sends the daily coach nudge email via Resend (Prompt 79). Only called
 * for users with email_notifications_enabled = true — the opt-out check
 * itself happens at the call site (app/api/cron/daily-coach/route.ts) so
 * this function stays a pure "send" with no DB reads of its own.
 */
export async function sendDailyCoachEmail({
  userId,
  email,
  userName,
  tasks,
  baseUrl,
}: SendDailyCoachEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  const dashboardUrl = `${baseUrl}/dashboard`;
  const unsubscribeUrl = `${baseUrl}/api/email/unsubscribe?user_id=${userId}&token=${generateUnsubscribeToken(userId)}`;
  const { text, html } = buildEmailBody(userName, tasks, dashboardUrl, unsubscribeUrl);

  if (!apiKey) {
    console.warn(
      `[lib/email/sendDailyCoachEmail] RESEND_API_KEY not configured. Skipping send for ${email} (dev mode) — would have sent:\n${text}`,
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
      subject: "Your Kalpla tasks for today",
      text,
      html,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    console.error(`[lib/email/sendDailyCoachEmail] Resend API request failed (${response.status}): ${errBody}`);
    return false;
  }

  return true;
}
