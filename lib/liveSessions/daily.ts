const DAILY_API_BASE = "https://api.daily.co/v1";

/**
 * The only file in this codebase that should mention "Daily" — everything
 * else imports the provider-agnostic names re-exported from ./index.ts, so
 * swapping video providers later touches this file only, not every call
 * site (mirrors lib/billing/stripe.ts's isolation of the Stripe SDK).
 */
export function isDailyConfigured(): boolean {
  return !!process.env.DAILY_API_KEY;
}

function getDailyApiKey(): string {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) {
    throw new Error("DAILY_API_KEY is not configured — live video sessions are unavailable.");
  }
  return apiKey;
}

async function dailyFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${DAILY_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getDailyApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Daily API request to ${path} failed (${res.status}): ${errorText}`);
  }

  return res.json() as Promise<T>;
}

export interface CreateDailyRoomParams {
  /** Room name; Daily generates one automatically if omitted. */
  name?: string;
  /** Unix timestamp (seconds) after which the room can no longer be joined. */
  expiresAt: number;
  /**
   * Explicit participant cap. Daily defaults to 200 for rooms that don't
   * set this, which is far above any real cohort size here — set
   * explicitly per session type (see the live-sessions admin route) as a
   * cheap safety net rather than relying on that undocumented-to-us
   * default.
   */
  maxParticipants?: number;
}

export interface DailyRoom {
  name: string;
  url: string;
}

/**
 * Creates a private Daily room — private (not public) is required so that
 * joining always requires a signed meeting token, which is what makes
 * per-user admin-vs-student privileges possible at all.
 */
export async function createDailyRoom({ name, expiresAt, maxParticipants }: CreateDailyRoomParams): Promise<DailyRoom> {
  const room = await dailyFetch<{ name: string; url: string }>("/rooms", {
    ...(name ? { name } : {}),
    privacy: "private",
    properties: {
      exp: expiresAt,
      ...(maxParticipants !== undefined ? { max_participants: maxParticipants } : {}),
    },
  });
  return { name: room.name, url: room.url };
}

export interface CreateDailyMeetingTokenParams {
  roomName: string;
  userId: string;
  userName: string;
  /** Grants Daily's room-owner privileges (mute others, eject, end room). */
  isOwner: boolean;
  /** Unix timestamp (seconds) after which the token is no longer valid. */
  expiresAt: number;
}

/**
 * Mints a fresh, per-user meeting token — not cached. Callers should set
 * expiresAt generously past the session's expected end so a token minted
 * right at join time doesn't expire mid-call.
 */
export async function createDailyMeetingToken({
  roomName,
  userId,
  userName,
  isOwner,
  expiresAt,
}: CreateDailyMeetingTokenParams): Promise<string> {
  const result = await dailyFetch<{ token: string }>("/meeting-tokens", {
    properties: {
      room_name: roomName,
      user_id: userId,
      user_name: userName,
      is_owner: isOwner,
      exp: expiresAt,
    },
  });
  return result.token;
}
