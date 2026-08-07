# Kalpla Pilot Cohort 1 — Launch Documentation

This folder contains the operational and legal documents needed to run Brnd Monk's first Kalpla pilot cohort: the **GenAI Engineer Accelerator**, a 6-month program built on top of the existing self-paced Kalpla platform.

These are working drafts, not finished legal instruments. Read the **Open Items** section before using any of this externally.

## Canonical facts

Every document in this folder should treat these as fixed inputs. If one changes, update it here first, then propagate.

| Fact | Value |
|---|---|
| Entity | Learncap Academy Pvt Ltd |
| Jurisdiction | Udupi, Karnataka |
| Program name | GenAI Engineer Accelerator — Kalpla Pilot Cohort 1 |
| Operator | Brnd Monk |
| Duration | 6 months (~24–26 weeks) + capstone/placement-support month |
| Price | **₹49,000** (founding-cohort rate, below the eventual cohort-2+ price) |
| Payment structure | 3-installment plan, ~₹17,000 × 3, paid directly to the company (**not** "EMI" — see [Why "installment plan," not "EMI"](#why-installment-plan-not-emi)) |
| Mock interviews | 100% human-delivered in the pilot — no automated AI mock-interview feature exists yet. Matches the live `/pricing` page's "coming soon" note. |
| Curriculum grounding | 8 skill categories / 26 skill nodes / 3 real capstone ("ladder") projects: **Prompt Playground** (free), **RAG Chatbot** (pro), **Tool-Using Agent** (pro) |
| Communication tool | WhatsApp group + one shared Google Sheet |
| Payment collection | UPI / direct bank transfer, manually reconciled |

Money is always written as `₹49,000` — never spelled out — so a later price change can be found with a single search across this folder.

### Why "installment plan," not "EMI"

"EMI" is a regulated-lending term in India — it implies a licensed NBFC/BNPL partner (e.g. Razorpay Affordability Suite, Cashfree, Propelld, Eduvanz) with its own interest/APR disclosure obligations. Cohort 1 has no such partner confirmed. Every document in this folder therefore says **"installment plan"**: the student pays the same company directly in three parts, with no interest and no third-party lender involved. If a real NBFC/BNPL partnership is signed later, this wording — and the refund document's installment clause — needs a deliberate update, not a global find-replace of "installment" back to "EMI."

## Document map

| # | File | What it is |
|---|---|---|
| 1 | [`curriculum/01-weekly-session-calendar.md`](curriculum/01-weekly-session-calendar.md) | Staffable week-by-week schedule of live classes, architecture sessions, office hours, and mock interviews |
| 2 | [`curriculum/02-ai-vs-human-mock-interviews.md`](curriculum/02-ai-vs-human-mock-interviews.md) | Student-facing clarification: what the AI tutor does vs. what a human mock interview is |
| 3 | [`curriculum/03-manual-grading-rubrics.md`](curriculum/03-manual-grading-rubrics.md) | Manual grading rubrics for cohort 1, mirroring the platform's real AI-grading schemas |
| 4 | [`legal/04-marketing-copy-pilot-cohort.md`](legal/04-marketing-copy-pilot-cohort.md) | Outreach messages + landing page copy, with compliance reasoning shown inline |
| 5 | [`legal/05-refund-cancellation-policy.md`](legal/05-refund-cancellation-policy.md) | Refund/cancellation policy — **DRAFT, pending legal review** |
| 6a | [`legal/06a-terms-of-service.md`](legal/06a-terms-of-service.md) | Terms of Service (platform + pilot) — **DRAFT, pending legal review** |
| 6b | [`legal/06b-privacy-policy.md`](legal/06b-privacy-policy.md) | Privacy Policy (DPDPA 2023) — **DRAFT, pending legal review** |
| 8 | [`operational/08-communication-tool-decision.md`](operational/08-communication-tool-decision.md) | Cohort communication tool recommendation |
| 9 | [`operational/09-payment-collection-decision.md`](operational/09-payment-collection-decision.md) | Payment collection method recommendation |
| 10 | [`operational/10-outcomes-tracking-template.md`](operational/10-outcomes-tracking-template.md) | Columns for a completion/outcomes tracking sheet |

Item 7 of the original checklist — **business registration status** — has no document here. It requires the user's own legal confirmation, not drafting. See Open Items below.

Suggested reading order for a first pass: this README → `09` → `08` → `01` → `02` → `03` → `10` → `05` → `04` → `06a` → `06b`.

## Open items (need a human decision, not more drafting)

1. **GST/PAN registration status for Learncap Academy Pvt Ltd.** The entity name is now locked into the legal documents below. What's still unconfirmed is whether its GST/PAN registration is complete enough for payment-gateway KYC — this is narrower than before, but still blocks the Razorpay/Stripe upgrade path noted in `09`.
2. **Legal review of `05`, `06a`, `06b`.** These carry a visible DRAFT marker because no lawyer has reviewed them. Real money (₹49,000/student) is being collected under these — a short paid review before cohort 1's first payment is worth the cost, even if it's a 1–2 hour pass.
3. **Pre-existing `$29/mo` inconsistency in the live app** (not created by this pilot work, just noted here because it will look odd next to these price-consistent documents): `app/(app)/billing/page.tsx` and the homepage hardcode `"$29/mo"` for the Pro tier, while `app/(marketing)/pricing/page.tsx` deliberately avoids a hardcoded figure — its own code comment says Stripe is the source of truth and a hardcoded price could drift. Worth fixing in the app itself at some point; out of scope for this documentation set.
4. **The platform's own "90 days" framing.** `app/(marketing)/page.tsx`'s tagline and `app/(app)/roadmap/page.tsx`'s default-pace copy both assume the ~26-node curriculum fits in ~12 weeks. The pilot's 6-month cadence is deliberately slower (part-time pacing, human session cadence, capstone + job-search buffer — see `01`) and is *not* a contradiction, but don't casually reuse the "90 days" tagline in pilot marketing copy — `04` uses "6-month guided cohort" instead, on purpose.
