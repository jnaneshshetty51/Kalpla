-- Seed initial assessment tasks for the 8 top-level skill categories.
-- Uses deterministic UUIDs linked to foundational skill nodes.

insert into public.assessment_tasks (
  id,
  skill_node_id,
  type,
  prompt,
  rubric
) values
-- Category 1: LLM Fundamentals (Tokenization & Context Windows)
(
  'b0000000-0000-4000-a000-000000000101',
  'a0000000-0000-4000-a000-000000000101',
  'multiple_choice',
  'What happens when an input prompt exceeds an LLM context window limit?',
  '{"options": ["A) The prompt is automatically compressed without information loss", "B) The input is truncated or causes a context length validation error", "C) The model switches to infinite memory mode", "D) Token embeddings are converted back to raw ASCII text"], "correct_answer": "B"}'::jsonb
),
-- Category 2: Prompt Engineering (Zero-Shot & Few-Shot Prompting)
(
  'b0000000-0000-4000-a000-000000000201',
  'a0000000-0000-4000-a000-000000000201',
  'short_answer',
  'Explain the key structural difference between zero-shot prompting and few-shot in-context learning.',
  '{"key_points": ["Zero-shot provides only instructions without examples", "Few-shot includes input-output pair demonstrations in the prompt context"], "min_score_criteria": "Must mention prompt examples/demonstrations"}'::jsonb
),
-- Category 3: API Integration (LLM Client SDKs & Parameters)
(
  'b0000000-0000-4000-a000-000000000301',
  'a0000000-0000-4000-a000-000000000301',
  'code',
  'Write a Python function using the OpenAI client SDK to generate a response with temperature set to 0.2 and max_tokens set to 150.',
  '{"expected_parameters": ["temperature=0.2", "max_tokens=150"], "language": "python"}'::jsonb
),
-- Category 4: Embeddings & Retrieval (Vector Embeddings & High-Dimensional Spaces)
(
  'b0000000-0000-4000-a000-000000000401',
  'a0000000-0000-4000-a000-000000000401',
  'multiple_choice',
  'Which vector distance metric measures the cosine of the angle between two embedding vectors regardless of magnitude?',
  '{"options": ["A) Euclidean distance (L2)", "B) Cosine Similarity", "C) Manhattan distance (L1)", "D) Hamming distance"], "correct_answer": "B"}'::jsonb
),
-- Category 5: Agentic Systems (Agent Loops & ReAct Framework)
(
  'b0000000-0000-4000-a000-000000000501',
  'a0000000-0000-4000-a000-000000000501',
  'short_answer',
  'Describe the core cycle of the ReAct (Reasoning + Acting) agent framework.',
  '{"key_points": ["Thought / Reasoning step", "Action / Tool execution step", "Observation / Feedback step"], "min_score_criteria": "Must detail Thought-Action-Observation loop"}'::jsonb
),
-- Category 6: Evaluation (LLM-as-a-Judge & Automated Evals)
(
  'b0000000-0000-4000-a000-000000000601',
  'a0000000-0000-4000-a000-000000000601',
  'multiple_choice',
  'What is a primary advantage of LLM-as-a-Judge automated evaluation compared to traditional n-gram metrics (BLEU/ROUGE)?',
  '{"options": ["A) It uses zero compute power", "B) It evaluates semantic correctness and reasoning quality beyond surface word matching", "C) It guarantees 100% deterministic outputs", "D) It requires no ground truth rubric"], "correct_answer": "B"}'::jsonb
),
-- Category 7: Fine-Tuning Basics (Supervised Fine-Tuning SFT)
(
  'b0000000-0000-4000-a000-000000000701',
  'a0000000-0000-4000-a000-000000000701',
  'short_answer',
  'What format should an instruction fine-tuning dataset follow for Supervised Fine-Tuning (SFT)?',
  '{"key_points": ["JSONL format with prompt/response or system/user/assistant message arrays", "Paired instruction and target output examples"], "min_score_criteria": "Must mention instruction and target response pairs"}'::jsonb
),
-- Category 8: Deployment (Model Serving & Inference Engines)
(
  'b0000000-0000-4000-a000-000000000801',
  'a0000000-0000-4000-a000-000000000801',
  'multiple_choice',
  'Which optimization technique reduces Time-To-First-Token (TTFT) by reusing pre-computed key-value states across requests?',
  '{"options": ["A) Quantization", "B) KV Cache & Prompt Caching", "C) Speculative Decoding", "D) Batch Normalization"], "correct_answer": "B"}'::jsonb
)
on conflict (id) do update set
  skill_node_id = excluded.skill_node_id,
  type = excluded.type,
  prompt = excluded.prompt,
  rubric = excluded.rubric,
  updated_at = now();
