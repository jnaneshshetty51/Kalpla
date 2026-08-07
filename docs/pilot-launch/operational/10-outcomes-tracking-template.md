# Completion & Outcomes Tracking Template — Pilot Cohort 1

Column spec for a tracking sheet — implement as a tab in the same Google Sheet used for [`08`](08-communication-tool-decision.md)/[`09`](09-payment-collection-decision.md). One row per student. This data is what justifies cohort-2 pricing and any future conversations with programs like DPIIT/MeitY/Karnataka ELEVATE — verify each program's actual required fields against their real application forms when the time comes; don't assume this template already matches them.

**Data governance note**: this sheet holds personal and sensitive data (compensation figures, contact info). It falls under the data-collection/retention commitments in [`06b`](../legal/06b-privacy-policy.md) — treat access to it accordingly (restricted to the named owner + backup from `08`, not cohort-wide).

## 1. Enrollment & payment

| Column | Source |
|---|---|
| Student name, contact | Enrollment form |
| Enrollment date | Enrollment form |
| Installment 1 / 2 / 3 status + date | [`09`](09-payment-collection-decision.md) payments tab |
| Fully enrolled (Y/N) | Derived — true once installment 1 clears |

## 2. Diagnostic baseline

| Column | Source |
|---|---|
| Diagnostic score — per category (8 columns: LLM Fundamentals, Prompt Engineering, API Integration, Embeddings & Retrieval, Agentic Systems, Evaluation, Fine-Tuning Basics, Deployment) | Platform diagnostic assessment, or [`03`](../curriculum/03-manual-grading-rubrics.md) Part A if manually graded |

## 3. Progress

| Column | Source |
|---|---|
| Skill nodes completed (out of 24) | Platform progress data |
| % roadmap complete | Derived |
| Prompt Playground — status + `overall_score` | [`03`](../curriculum/03-manual-grading-rubrics.md) Part B |
| RAG Chatbot — status + `overall_score` | [`03`](../curriculum/03-manual-grading-rubrics.md) Part B |
| Tool-Using Agent — status + `overall_score` | [`03`](../curriculum/03-manual-grading-rubrics.md) Part B |

## 4. Engagement

| Column | Source |
|---|---|
| AI tutor usage (qualitative: low/medium/high) | Platform usage data |
| Live session attendance (count / total from [`01`](../curriculum/01-weekly-session-calendar.md)) | Manual attendance log |
| Mock interviews completed (out of 2) | [`02`](../curriculum/02-ai-vs-human-mock-interviews.md) |

## 5. Completion

| Column | Source |
|---|---|
| Capstone(s) completed | Derived from section 3 |
| Portfolio published (Y/N) | Platform `is_public` flag |
| Cohort completion status | Completed / Withdrew / In progress |

## 6. Placement-assistance service delivery (things the company controls and can prove)

| Column | Source |
|---|---|
| Resume review delivered (Y/N + date) | [`01`](../curriculum/01-weekly-session-calendar.md) Week 22 |
| LinkedIn review delivered (Y/N + date) | [`01`](../curriculum/01-weekly-session-calendar.md) Week 22 |
| Portfolio/GitHub review delivered (Y/N + date) | [`01`](../curriculum/01-weekly-session-calendar.md) Week 21 |
| Referrals made (count) | Manual log |
| Interviews scheduled via Kalpla (count) | Manual log |

## 7. Employment outcome data (kept structurally separate from section 6 — see compliance note below)

| Column | Source |
|---|---|
| Employed post-cohort (Y/N) | Follow-up survey |
| Role / title | Follow-up survey |
| Compensation | Follow-up survey — **see compliance note** |
| Time-to-offer (weeks post-completion) | Follow-up survey |
| Testimonial consent (Y/N) | Explicit written consent — see below |

### Compliance notes (read before using this data anywhere external)

- **Sections 6 and 7 are deliberately separate.** Section 6 is what Kalpla did (provable, company-controlled). Section 7 is what happened to the student afterward (an outcome, influenced by many factors outside Kalpla's control). Marketing copy ([`04`](../legal/04-marketing-copy-pilot-cohort.md)) should draw from section 6, not present section 7 as something Kalpla caused or guaranteed.
- **Never publish individual compensation figures without separate, explicit written consent** — the testimonial-consent column above is not blanket consent to publish salary data specifically.
- **Cohort 1's sample size (~10–20 students) is not large enough to support marketing claims like "X% placement rate."** Don't use section 7 aggregates in outreach or landing copy until sample size and methodology could withstand scrutiny — this is the same reasoning behind [`04`](../legal/04-marketing-copy-pilot-cohort.md)'s "zero outcomes data" rule for cohort 1.
