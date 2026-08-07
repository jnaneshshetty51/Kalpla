# Cohort Communication Tool — Pilot Cohort 1

## Decision: WhatsApp group + one shared Google Sheet

- **WhatsApp group** — primary channel for announcements, doubt-routing to humans, session reminders, and payment-proof submission (see [`09`](09-payment-collection-decision.md)).
- **One Google Sheet** — the operational backbone, with separate tabs for: roadmap/session schedule (mirrors [`01`](../curriculum/01-weekly-session-calendar.md)), payments (feeds [`09`](09-payment-collection-decision.md)), and outcomes tracking ([`10`](10-outcomes-tracking-template.md)).

## Why, and what was ruled out

| Option | Adoption friction (India, early-career audience) | Searchability/threading | Notes |
|---|---|---|---|
| **WhatsApp (chosen)** | Near-zero — already installed, no new account | Weak | The channel students actually check |
| Slack | Real friction — new tool, new habit, unfamiliar to many early-career students | Strong | Better for larger/later cohorts, not worth the onboarding cost at pilot scale (~10–20 students) |
| Discord | Similar friction to Slack, plus a "gamer app" perception risk for a career-outcomes audience | Strong | Not recommended for cohort 1 |
| Email only | Low friction but low engagement — announcements get missed | N/A | Fine as a secondary channel for formal notices (enrollment confirmation, policy documents), not primary |

## Structure

- **One WhatsApp group** for the whole cohort (not broadcast-only) — group interaction has real value here: peer doubt-solving, a sense of cohort community, and a natural source of testimonials/referrals later, which matters for a first cohort with no track record yet.
- A pinned message in the group links to the shared Sheet and to [`02`](../curriculum/02-ai-vs-human-mock-interviews.md) so students know upfront what's AI vs. human.
- **Privacy note**: a WhatsApp group exposes every member's phone number to every other member. This must be disclosed to students at enrollment and is reflected in [`06b`](../legal/06b-privacy-policy.md)'s data-collection section — it is not an incidental detail, it's a real data-sharing fact.

## Ownership

Name one person as the group/sheet owner with a named backup for coverage gaps (illness, travel) — a pilot cohort with a single point of failure on communication is a real operational risk, not a hypothetical one.

## What this decision feeds

- [`01`](../curriculum/01-weekly-session-calendar.md) — session reminders route through this channel
- [`02`](../curriculum/02-ai-vs-human-mock-interviews.md) — mock interview booking mechanism
- [`06b`](../legal/06b-privacy-policy.md) — WhatsApp listed as a data-sharing surface
- [`10`](10-outcomes-tracking-template.md) — lives as a tab in the same Sheet
