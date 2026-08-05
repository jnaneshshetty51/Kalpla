-- Seed migration populating skill_nodes with the full GenAI Engineer competency graph.
-- Uses deterministic UUIDs so re-execution is idempotent.

insert into public.skill_nodes (
  id,
  name,
  category,
  description,
  difficulty,
  order_index,
  prerequisite_ids
) values
-- Category 1: LLM Fundamentals
(
  'a0000000-0000-4000-a000-000000000101',
  'Tokenization & Context Windows',
  'LLM Fundamentals',
  'Understand BPE, WordPiece, token limits, context window mechanics, and vocabulary encoding.',
  1,
  10,
  '{}'
),
(
  'a0000000-0000-4000-a000-000000000102',
  'Transformer Architecture & Self-Attention',
  'LLM Fundamentals',
  'Core concepts of scaled dot-product attention, multi-head attention, feed-forward layers, and positional encodings.',
  2,
  20,
  '{}'
),
(
  'a0000000-0000-4000-a000-000000000103',
  'Model Families & Capabilities',
  'LLM Fundamentals',
  'Compare decoder-only, encoder-decoder architectures, open-weights (Llama, Mistral) vs proprietary models (Claude, GPT).',
  1,
  30,
  '{"a0000000-0000-4000-a000-000000000101"}'
),

-- Category 2: Prompt Engineering
(
  'a0000000-0000-4000-a000-000000000201',
  'Zero-Shot & Few-Shot Prompting',
  'Prompt Engineering',
  'Craft effective zero-shot instructions and few-shot in-context learning demonstrations.',
  1,
  40,
  '{"a0000000-0000-4000-a000-000000000103"}'
),
(
  'a0000000-0000-4000-a000-000000000202',
  'Chain-of-Thought & Reasoning Techniques',
  'Prompt Engineering',
  'Guide models step-by-step using Chain-of-Thought, Tree-of-Thought, and self-consistency prompting.',
  2,
  50,
  '{"a0000000-0000-4000-a000-000000000201"}'
),
(
  'a0000000-0000-4000-a000-000000000203',
  'Structured Output & System Instructions',
  'Prompt Engineering',
  'Enforce valid JSON schemas, Pydantic outputs, and robust system prompt steering.',
  2,
  60,
  '{"a0000000-0000-4000-a000-000000000201"}'
),

-- Category 3: API Integration
(
  'a0000000-0000-4000-a000-000000000301',
  'LLM Client SDKs & Parameters',
  'API Integration',
  'Configure temperature, top_p, max_tokens, and handle SSE streaming responses.',
  2,
  70,
  '{"a0000000-0000-4000-a000-000000000103"}'
),
(
  'a0000000-0000-4000-a000-000000000302',
  'Structured Function & Tool Calling',
  'API Integration',
  'Define tool definitions, process function call invocations, and return execution results to the LLM.',
  3,
  80,
  '{"a0000000-0000-4000-a000-000000000203", "a0000000-0000-4000-a000-000000000301"}'
),
(
  'a0000000-0000-4000-a000-000000000303',
  'Rate Limiting, Error Handling & Fallbacks',
  'API Integration',
  'Implement exponential backoff, rate limiting, token usage logging, and provider fallback strategies.',
  3,
  90,
  '{"a0000000-0000-4000-a000-000000000301"}'
),

-- Category 4: Embeddings & Retrieval
(
  'a0000000-0000-4000-a000-000000000401',
  'Vector Embeddings & High-Dimensional Spaces',
  'Embeddings & Retrieval',
  'Understand dense vector representations, semantic similarity spaces, and embedding models.',
  2,
  100,
  '{"a0000000-0000-4000-a000-000000000102"}'
),
(
  'a0000000-0000-4000-a000-000000000402',
  'Vector Search Fundamentals',
  'Embeddings & Retrieval',
  'Cosine distance, Euclidean distance, Dot Product, and vector indexing algorithms (HNSW, IVFFlat).',
  3,
  110,
  '{"a0000000-0000-4000-a000-000000000401"}'
),
(
  'a0000000-0000-4000-a000-000000000403',
  'Chunking Strategy & Document Processing',
  'Embeddings & Retrieval',
  'Recursive character splitting, semantic chunking, overlap tuning, and document metadata tagging.',
  2,
  120,
  '{"a0000000-0000-4000-a000-000000000101"}'
),
(
  'a0000000-0000-4000-a000-000000000404',
  'RAG Pipeline Design',
  'Embeddings & Retrieval',
  'Build end-to-end Retrieval-Augmented Generation workflows querying vector stores and injecting context.',
  3,
  130,
  '{"a0000000-0000-4000-a000-000000000301", "a0000000-0000-4000-a000-000000000402", "a0000000-0000-4000-a000-000000000403"}'
),
(
  'a0000000-0000-4000-a000-000000000405',
  'Retrieval Evaluation & Re-Ranking',
  'Embeddings & Retrieval',
  'Improve RAG precision using cross-encoders, reciprocal rank fusion (RRF), and context relevance metrics.',
  4,
  140,
  '{"a0000000-0000-4000-a000-000000000404"}'
),

-- Category 5: Agentic Systems
(
  'a0000000-0000-4000-a000-000000000501',
  'Agent Loops & ReAct Framework',
  'Agentic Systems',
  'Implement autonomous Observation-Thought-Action loops using the ReAct pattern.',
  3,
  150,
  '{"a0000000-0000-4000-a000-000000000302"}'
),
(
  'a0000000-0000-4000-a000-000000000502',
  'Agent Memory & State Management',
  'Agentic Systems',
  'Design short-term conversational buffers, working memory, and long-term vector state persistence.',
  4,
  160,
  '{"a0000000-0000-4000-a000-000000000501", "a0000000-0000-4000-a000-000000000401"}'
),
(
  'a0000000-0000-4000-a000-000000000503',
  'Multi-Agent Orchestration & Workflows',
  'Agentic Systems',
  'Orchestrate multi-agent teams with specialized roles, task delegation, and workflow routing.',
  4,
  170,
  '{"a0000000-0000-4000-a000-000000000501"}'
),

-- Category 6: Evaluation
(
  'a0000000-0000-4000-a000-000000000601',
  'LLM-as-a-Judge & Automated Evals',
  'Evaluation',
  'Set up automated evaluation pipelines using strong LLMs to grade model outputs and reasoning.',
  3,
  180,
  '{"a0000000-0000-4000-a000-000000000202"}'
),
(
  'a0000000-0000-4000-a000-000000000602',
  'Benchmark Suites & Ground Truth Datasets',
  'Evaluation',
  'Curate golden test datasets, calculate accuracy/faithfulness metrics, and run regression evals.',
  3,
  190,
  '{"a0000000-0000-4000-a000-000000000601"}'
),
(
  'a0000000-0000-4000-a000-000000000603',
  'Guardrails, Hallucination & Safety Auditing',
  'Evaluation',
  'Implement input/output guardrails, hallucination checks, and defend against prompt injection attacks.',
  4,
  200,
  '{"a0000000-0000-4000-a000-000000000601"}'
),

-- Category 7: Fine-Tuning Basics
(
  'a0000000-0000-4000-a000-000000000701',
  'Supervised Fine-Tuning (SFT) & Dataset Formatting',
  'Fine-Tuning Basics',
  'Prepare instruction-tuning datasets (Alpaca/ShareGPT formats) and run basic SFT training runs.',
  3,
  210,
  '{"a0000000-0000-4000-a000-000000000102", "a0000000-0000-4000-a000-000000000203"}'
),
(
  'a0000000-0000-4000-a000-000000000702',
  'Parameter-Efficient Fine-Tuning (PEFT / LoRA)',
  'Fine-Tuning Basics',
  'Train Low-Rank Adapters (LoRA / QLoRA) for memory-efficient model customization.',
  4,
  220,
  '{"a0000000-0000-4000-a000-000000000701"}'
),
(
  'a0000000-0000-4000-a000-000000000703',
  'RLHF & Direct Preference Optimization (DPO)',
  'Fine-Tuning Basics',
  'Align model outputs with human preferences using DPO and preference pair datasets.',
  5,
  230,
  '{"a0000000-0000-4000-a000-000000000702"}'
),

-- Category 8: Deployment
(
  'a0000000-0000-4000-a000-000000000801',
  'Model Serving & Inference Engines',
  'Deployment',
  'Serve models efficiently with high-throughput engines like vLLM, Ollama, and TGI.',
  3,
  240,
  '{"a0000000-0000-4000-a000-000000000103"}'
),
(
  'a0000000-0000-4000-a000-000000000802',
  'Caching & Latency Optimization',
  'Deployment',
  'Implement prompt caching, KV cache reuse, and quantization techniques to optimize TTFT and latency.',
  4,
  250,
  '{"a0000000-0000-4000-a000-000000000303", "a0000000-0000-4000-a000-000000000801"}'
),
(
  'a0000000-0000-4000-a000-000000000803',
  'Production Monitoring & Cost Tracking',
  'Deployment',
  'Set up production telemetry, token counters, latency metrics, and API cost controls.',
  3,
  260,
  '{"a0000000-0000-4000-a000-000000000303"}'
)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  difficulty = excluded.difficulty,
  order_index = excluded.order_index,
  prerequisite_ids = excluded.prerequisite_ids,
  updated_at = now();
