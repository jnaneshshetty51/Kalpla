# Weekly Human-Session Calendar — Pilot Cohort 1

## Read this before scheduling anything

**"Week N" is a staffing label, not a platform feature.** The Kalpla app has no cohort, start-date, or week-gating concept in its code — every student's roadmap is self-paced and asynchronous. This calendar exists so Brnd Monk can staff live sessions against a shared cohort clock; it doesn't change how the app itself behaves for any individual student.

**Why this is ~2x slower than the platform's own default pace, on purpose.** The app's own `/roadmap` page assumes its ~26-node curriculum fits in ~12 weeks (90 days) at default pace. This cohort runs 6 months (~24 weeks of curriculum + capstone) instead, because:
- Most students are part-time (working, studying, or job-searching alongside the program), not full-time on the platform.
- Every week carries live human sessions (below) that a self-paced solo learner doesn't have to schedule around.
- The last month is reserved for capstone polish and placement-assistance work (resume, portfolio, mock interviews), not new curriculum.

This isn't a contradiction of the app's own copy — it's a different product for a different pace of life. Don't reuse the "90 days" tagline in pilot-facing materials; see [`04`](../legal/04-marketing-copy-pilot-cohort.md).

## Structure at a glance

- **Live Class**: 1×/week, cohort-wide, ties to that week's real skill-node topic(s).
- **Architecture Session**: 1× every 2 weeks, a deeper production-style case study (not assessment-linked).
- **Office Hours**: 1×/week, open Q&A / debugging, cohort-wide.
- **Mock Interviews**: concentrated in Months 5–6 (job-readiness phase), not spread weekly — see [`02`](02-ai-vs-human-mock-interviews.md) for why these are 100% human-delivered.
- **Career sessions** (resume, LinkedIn, portfolio, GitHub review): explicit calendar slots in Month 6, not left ad hoc — these are the concrete "placement assistance" deliverables referenced in [`04`](../legal/04-marketing-copy-pilot-cohort.md).

Curriculum coverage below uses the platform's real 8 categories / 24 skill nodes (`supabase/migrations/20260805090822_seed_skill_nodes.sql`) and its 3 real capstone projects — **Prompt Playground** (free), **RAG Chatbot** (pro), **Tool-Using Agent** (pro). Do not substitute the business-vision doc's aspirational 5-option capstone list ("AI SaaS," "AI Customer Support," etc.) in any student-facing material — those projects don't exist on the platform.

## Month 1 — Programming Foundations (Weeks 1–4)

**Not covered by the skill graph at all.** Python, Git, REST APIs, Linux basics, and SQL must be delivered entirely outside the Kalpla platform — external curated resources plus live sessions. This is deliberate: the app's skill graph starts at LLM fundamentals and assumes basic programming literacy going in.

| Week | Live Class | Architecture Session | Office Hours |
|---|---|---|---|
| 1 | Python essentials + dev environment setup | — | Setup troubleshooting |
| 2 | Git/GitHub workflow | Case study: reading a real open-source repo | Debugging Q&A |
| 3 | REST APIs & Linux/CLI basics | — | Debugging Q&A |
| 4 | SQL fundamentals | Case study: a production data pipeline | Debugging Q&A |

**Milestone**: diagnostic assessment (the platform's 8 real diagnostic tasks, one per skill category) — unlocks each student's personalized roadmap.

## Month 2 — AI Fundamentals (Weeks 5–8)

Covers Category 1 (LLM Fundamentals) + Category 2 (Prompt Engineering), 6 real nodes.

| Week | Skill nodes covered | Live Class | Architecture Session | Office Hours |
|---|---|---|---|---|
| 5 | Tokenization & Context Windows; Transformer Architecture & Self-Attention | How LLMs actually process text | — | Q&A |
| 6 | Model Families & Capabilities; Zero-Shot & Few-Shot Prompting | Choosing a model for a real use case | Case study: open-weights vs. proprietary tradeoffs in production | Q&A |
| 7 | Chain-of-Thought & Reasoning Techniques | Prompting for reasoning tasks | — | Q&A |
| 8 | Structured Output & System Instructions | Reliable JSON/structured output | Case study: a real system-prompt failure and fix | Q&A |

**Milestone**: end-of-month competency check-in (AI-graded, per-node).

## Month 3 — Build Applications (Weeks 9–12)

Covers Category 3 (API Integration) + Category 4 (Embeddings & Retrieval), 8 real nodes. **Prompt Playground** (the free-tier capstone) becomes reachable partway through this month.

| Week | Skill nodes covered | Live Class | Architecture Session | Office Hours |
|---|---|---|---|---|
| 9 | LLM Client SDKs & Parameters | Working with streaming responses | — | Q&A |
| 10 | Structured Function & Tool Calling | Building your first tool-calling flow | Case study: function-calling in a real product | Q&A — Prompt Playground opens |
| 11 | Rate Limiting, Error Handling & Fallbacks; Vector Embeddings & High-Dimensional Spaces | Handling failure gracefully; intro to embeddings | — | Q&A |
| 12 | Vector Search Fundamentals; Chunking Strategy & Document Processing | Indexing and chunking for retrieval | Case study: a real chunking-strategy failure | Q&A |

**Milestone**: Prompt Playground submission due (first real project + reflection).

## Month 4 — Production AI (Weeks 13–16)

Covers Category 5 (Agentic Systems) + Category 6 (Evaluation), 6 real nodes. **RAG Chatbot** work begins.

| Week | Skill nodes covered | Live Class | Architecture Session | Office Hours |
|---|---|---|---|---|
| 13 | RAG Pipeline Design | Building an end-to-end RAG pipeline | — | Q&A — RAG Chatbot opens |
| 14 | Retrieval Evaluation & Re-Ranking | Making retrieval actually good | Case study: debugging a bad RAG pipeline | Q&A |
| 15 | Agent Loops & ReAct Framework | Building an agent loop | — | Q&A |
| 16 | Agent Memory & State Management; Multi-Agent Orchestration & Workflows | Memory and multi-agent design | Case study: a real multi-agent production system | Q&A |

**Milestone**: RAG Chatbot submission due.

## Month 5 — Evaluation, Fine-Tuning & Deployment (Weeks 17–20)

Covers Category 6 remainder + Category 7 (Fine-Tuning Basics) + Category 8 (Deployment), 6 real nodes. **Tool-Using Agent** work begins.

> **Naming note**: the business-vision doc called this month "Cloud & Deployment" (Docker/Kubernetes/AWS/CI-CD). The platform's actual Category 8 content is narrower and different — LLM-serving, latency/caching, and cost/monitoring, not general infra. Live sessions below cover what the platform actually teaches and can assess; general DevOps (Docker/K8s/AWS) is a light supplement, not something the AI tutor or grading rubrics cover. Don't imply in student materials that the platform grades Docker/K8s work — it has no assessment tasks for that.

| Week | Skill nodes covered | Live Class | Architecture Session | Office Hours |
|---|---|---|---|---|
| 17 | LLM-as-a-Judge & Automated Evals; Benchmark Suites & Ground Truth Datasets | Building an eval pipeline | — | Q&A — Tool-Using Agent opens |
| 18 | Guardrails, Hallucination & Safety Auditing | Guardrails and safety in production | Case study: a real prompt-injection incident | Q&A |
| 19 | Supervised Fine-Tuning & Dataset Formatting; PEFT/LoRA | When (and when not) to fine-tune | — | Q&A |
| 20 | RLHF/DPO; Model Serving & Inference Engines; Caching & Latency Optimization; Production Monitoring & Cost Tracking | Serving and monitoring models in production (+ supplemental Docker/deployment overview) | Case study: a real latency/cost optimization | Q&A |

**Milestone**: Tool-Using Agent submission due.

## Month 6 — Capstone Polish & Placement Support (Weeks 21–24)

No new curriculum. Focus shifts entirely to finishing/polishing the 3 real capstone projects and the placement-assistance deliverables from the business vision (resume, LinkedIn, portfolio, GitHub, referrals, interview practice) — see [`02`](02-ai-vs-human-mock-interviews.md) for what's AI vs. human here.

| Week | Focus | Live Class | Architecture Session | Office Hours | Career support |
|---|---|---|---|---|---|
| 21 | Capstone completion push | Portfolio-quality code review | Case study: what makes a hiring manager say yes | Q&A | Portfolio + GitHub review sessions |
| 22 | Capstone polish | Presenting your project | — | Q&A | Resume + LinkedIn review sessions |
| 23 | Interview readiness | — | — | Q&A | **Mock interview round 1** (human) |
| 24 | Demo day | Cohort demo day — each student presents one capstone | — | — | **Mock interview round 2** (human); referral/employer-intro prep |

**Final milestone**: portfolio published (real `is_public` flip on the platform), at least one capstone with a passing submission, demo day complete.

## What this feeds

- [`02`](02-ai-vs-human-mock-interviews.md) — the 2 mock-interview sessions/student here must match the count quoted there.
- [`03`](03-manual-grading-rubrics.md) — the 3 project-submission milestones above are the checkpoints graders use.
- [`10`](../operational/10-outcomes-tracking-template.md) — every milestone row here should have a corresponding tracking-sheet column.
