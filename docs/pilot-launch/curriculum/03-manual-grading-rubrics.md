# Manual Grading Rubrics — Pilot Cohort 1

The platform grades assessments and project submissions with AI (`lib/grading/gradeAttempt.ts` and `lib/grading/reviewSubmission.ts`). For cohort 1, human mentors grade manually — but using the **same field shapes**, so cohort 1's human-graded data stays structurally compatible if/when the pilot moves onto AI grading. Two parts below, used for different checkpoints.

**Usage mode for this pilot**: Part A is used as a **standalone manual grader** (not just an AI-QA spot-check overlay) — there's no AI-grading trust baseline yet for this specific cohort to check against.

## Part A — Assessment / diagnostic-task grading

Mirrors `GradingResultSchema` in `lib/grading/gradeAttempt.ts`, field for field. Use for the diagnostic assessment (Month 1 milestone) and any per-module check-ins.

| Field | Type | What to fill in |
|---|---|---|
| `score` | number, 0–100 | Overall score for this response |
| `feedback` | string | 2–4 sentence summary explaining the score, with a constructive next step |
| `criteriaBreakdown` | list of `{criterion, met, note}` | One row per rubric criterion in the task — see below |
| `confidence` | `"high"` \| `"medium"` \| `"low"` | Your own confidence in this grade — mirrors the platform's real confidence field, which drives escalation to a second reviewer when low |

Each `criteriaBreakdown` row:
- `criterion` — the specific thing being checked (e.g. "Correctly distinguishes zero-shot from few-shot")
- `met` — `true`/`false`
- `note` — one sentence on what the student's answer actually showed

### Score-band guidance (keep multiple graders consistent)

| Score | Meaning |
|---|---|
| 90–100 | Fully correct, precise terminology, no gaps |
| 70–89 | Correct core understanding, minor gaps or imprecision |
| 50–69 | Partially correct — right direction, meaningful gaps |
| 25–49 | Mostly incorrect, some relevant fragments |
| 0–24 | No meaningful understanding shown, or no response |

### Worked example

Task: Category 1 (LLM Fundamentals) — "Explain the difference between zero-shot and few-shot prompting."
Student answer: "Zero-shot has no examples, few-shot includes some."

```
{
  "score": 55,
  "feedback": "Correctly identifies the core distinction but doesn't explain why few-shot examples help (in-context learning) or when you'd choose one over the other. Add a concrete example next time.",
  "criteriaBreakdown": [
    { "criterion": "Correctly distinguishes zero-shot from few-shot", "met": true, "note": "States zero-shot has no examples, few-shot has some — accurate but minimal." },
    { "criterion": "Explains the mechanism (in-context learning)", "met": false, "note": "No mention of why examples improve output." },
    { "criterion": "Gives a concrete example", "met": false, "note": "No example provided." }
  ],
  "confidence": "high"
}
```

## Part B — Project / capstone submission review

Mirrors `SubmissionReviewSchema` in `lib/grading/reviewSubmission.ts`. Use for the three real capstone milestones from [`01`](01-weekly-session-calendar.md): Prompt Playground, RAG Chatbot, Tool-Using Agent.

| Field | Type | What to fill in |
|---|---|---|
| `overall_score` | number, 0–100 | Overall project score |
| `logic_correctness` | `{score, summary}` | Does the code actually do what's required? |
| `readability` | `{score, summary}` | Naming, structure, clarity |
| `optimization_opportunities` | `{score, summary}` | Meaningful inefficiencies or missed simplifications — not nitpicks |
| `edge_case_handling` | `{score, summary}` | Does it handle boundary/empty/malformed inputs sensibly? |
| `architecture_quality` | `{score, summary}` or `null` | System design quality — **only for RAG Chatbot and Tool-Using Agent** (`rag`/`agent` project types); `null` for Prompt Playground (`general` type) |
| `genai_specific_criteria` | list of `{name, met, note}` | Project-type-specific criteria — use the exact guidance below, verbatim, so human grading matches what the AI grader would check |
| `reflection_flag` | `{contradicts_code, note}` or `null` | Set `contradicts_code: true` if the student's written reflection claims something the code doesn't actually do (e.g. "I added error handling" but there's no such check) — a signal of possible misunderstanding, not a writing-quality note. `null` if no reflection or it's consistent. |
| `confidence` | `"high"` \| `"medium"` \| `"low"` | Your confidence in this review |
| `is_ambiguous` | boolean | `true` if this is a genuinely borderline call a second reviewer should double-check — **triggers escalation, not just a recorded flag** |

### `genai_specific_criteria` guidance by project type (copy exactly — same language the AI grader uses)

**RAG Chatbot** (`rag`):
> In addition to general code quality, specifically evaluate and list as genai_specific_criteria:
> - "Chunking strategy reasonableness": is the chunking approach (size, overlap, boundary handling) sound for real document retrieval, not just passing the literal test cases?
> - "Retrieval relevance": would the similarity/scoring logic actually surface the most relevant chunks in practice?
> - "Prompt construction quality": if the code assembles a prompt from retrieved context, is it structured to keep the model grounded in that context?

**Tool-Using Agent** (`agent`):
> In addition to general code quality, specifically evaluate and list as genai_specific_criteria:
> - "Tool-use correctness": does the code correctly decide when/which tool to invoke based on the available signal?
> - "Planning logic": is there a coherent reasoning/decision structure, not just a flat if-chain that happens to pass the given tests?
> - "Error handling on tool failure": does the code account for a tool call failing or returning unexpected data, or would it crash/silently misbehave?

**Prompt Playground** (`general`): no GenAI-specific criteria — leave `genai_specific_criteria` empty and `architecture_quality` as `null`.

### Worked example (RAG Chatbot)

```
{
  "overall_score": 78,
  "logic_correctness": { "score": 85, "summary": "Retrieval and generation pipeline works end-to-end against all provided test cases." },
  "readability": { "score": 80, "summary": "Clear function names; retrieval logic could be split into a separate module." },
  "optimization_opportunities": { "score": 70, "summary": "Re-embeds the query on every call instead of caching; fine at this scale but worth flagging." },
  "edge_case_handling": { "score": 65, "summary": "No handling for an empty document store — would throw an unhandled exception." },
  "architecture_quality": { "score": 80, "summary": "Reasonable separation between chunking, retrieval, and generation steps." },
  "genai_specific_criteria": [
    { "name": "Chunking strategy reasonableness", "met": true, "note": "Uses recursive character splitting with sensible overlap." },
    { "name": "Retrieval relevance", "met": true, "note": "Cosine similarity over the embedding store returns the intended top-k chunks." },
    { "name": "Prompt construction quality", "met": false, "note": "Retrieved context is appended without clear delimiters, risking model confusion between context and instructions." }
  ],
  "reflection_flag": null,
  "confidence": "medium",
  "is_ambiguous": false
}
```

## What this connects to

- Checkpoints tied to [`01`](01-weekly-session-calendar.md)'s milestones.
- `overall_score` (Part B) and `score` (Part A) are reused directly as columns in [`10`](../operational/10-outcomes-tracking-template.md).
