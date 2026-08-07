-- Real curated lesson content (Prompt 44) for all 26 skill nodes.
-- Each row: core concept (content_markdown), a worked example (code_example),
-- and 1-2 discussion questions the tutor uses for comprehension checks.
-- Uses dollar-quoting to avoid manual escaping across markdown/code blocks.

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000101',
  1,
  'Tokenization & Context Windows',
  $lesson$## Core Concept

LLMs never see raw text — they see integer token IDs produced by a subword tokenizer (BPE for GPT/Claude-family models, WordPiece for BERT-family models). Subword tokenization splits rare or unfamiliar words into smaller known fragments, so the model never hits a true "unknown word" the way whole-word vocabularies do. Common English words are usually a single token; rare words, code identifiers, and non-English text often cost 2-5+ tokens per word.

The context window is the hard ceiling on how many tokens (input + output combined) a single request can hold. Every message, every system prompt, every piece of retrieved context in a RAG pipeline eats into that budget. Token count also directly drives cost and latency, since providers bill per token and generation time scales with output token count.

## Worked Example

"unbelievable" might tokenize as three pieces: `un` + `believ` + `able`. A model that has never seen the word "unbelievable" as a whole can still process it because it has seen those three fragments thousands of times in other words.$lesson$,
  $lesson$// Rough token-budget check before sending a request
function estimateTokens(text) {
  // ~4 characters per token is a reasonable rough English estimate
  return Math.ceil(text.length / 4);
}

const systemPrompt = "You are a concise coding assistant.";
const userMessage = "Explain the difference between BPE and WordPiece tokenization.";

const estimated = estimateTokens(systemPrompt) + estimateTokens(userMessage);
console.log(`Estimated input tokens: ~${estimated}`);$lesson$,
  '["Why might non-English languages consume significantly more tokens per sentence than English?","How does subword tokenization let a model handle a word it has never seen during training?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000102',
  1,
  'Transformer Architecture & Self-Attention',
  $lesson$## Core Concept

The Transformer replaced recurrent architectures (RNNs/LSTMs) with a parallelizable mechanism called self-attention. Instead of processing tokens one at a time in sequence, self-attention lets every token look at every other token in the input simultaneously and learn how much to "attend to" each one.

Each token is projected into three vectors: Query (what am I looking for?), Key (what do I contain?), and Value (what do I actually offer?). The attention score between two tokens is the dot product of one token's Query and another's Key, scaled down and passed through softmax to produce weights that sum to 1. Multi-head attention runs several of these attention computations in parallel with different learned projections, letting the model capture different kinds of relationships (syntax, coreference, long-range dependency) at once.

## Worked Example

Scaled dot-product attention, the core operation repeated across every layer and every head:$lesson$,
  $lesson$import numpy as np

def scaled_dot_product_attention(Q, K, V):
    d_k = Q.shape[-1]
    scores = np.matmul(Q, K.T) / np.sqrt(d_k)
    weights = np.exp(scores) / np.sum(np.exp(scores), axis=-1, keepdims=True)
    return np.matmul(weights, V)$lesson$,
  '["What is the computational complexity of standard self-attention relative to sequence length N, and why does that matter for long-context models?","Why is the scaling factor 1/sqrt(d_k) necessary for stable gradients?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000103',
  1,
  'Model Families & Capabilities',
  $lesson$## Core Concept

Not all LLMs share the same architecture or deployment model. Decoder-only models (GPT, Claude, Llama) generate text left-to-right and dominate general-purpose chat and completion use cases. Encoder-decoder models (T5, BART) separately encode an input and decode an output, and remain strong for translation and summarization where input and output are structurally distinct.

Separately, there's a proprietary-vs-open-weights axis. Proprietary models (Claude, GPT) are accessed only via API, are usually the most capable at release, and the provider controls updates and pricing. Open-weights models (Llama, Mistral) can be self-hosted, fine-tuned freely, and run offline — at the cost of needing your own serving infrastructure and usually trailing the frontier on raw capability.

## Worked Example

Choosing a model tier is a real engineering decision, not just a preference:$lesson$,
  $lesson$function pickModelTier(task) {
  if (task.isHighVolumeSimpleClassification) return "cheap-tier (e.g. Haiku, GPT-4o-mini)";
  if (task.needsDeepReasoningOrCode) return "expensive-tier (e.g. Sonnet/Opus, GPT-4o)";
  if (task.needsOfflineOrFineTuning) return "open-weights self-hosted (Llama, Mistral)";
  return "expensive-tier (default to correctness first)";
}$lesson$,
  '["What are the real trade-offs of self-hosting an open-weights model versus calling a proprietary API?","Why might a production system route different requests to different model tiers instead of using one model for everything?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000201',
  1,
  'Zero-Shot & Few-Shot Prompting',
  $lesson$## Core Concept

Zero-shot prompting asks the model to perform a task with no examples — just a clear instruction. It works well for tasks the model has seen extensively during training (classification, simple extraction, general Q&A). Few-shot prompting instead shows the model 2-5 input/output examples directly in the prompt before asking it to complete a new instance, which steers the model toward a specific output format, tone, or edge-case handling that a bare instruction wouldn't reliably produce.

Few-shot examples cost tokens (and therefore money and context budget) on every single call, so the choice between zero-shot and few-shot is a real trade-off between reliability and cost — not a free win.

## Worked Example

Same task, two approaches:$lesson$,
  $lesson$// Zero-shot
const zeroShot = `Classify the sentiment of this review as positive, negative, or neutral: "${review}"`;

// Few-shot — locks in the exact output format
const fewShot = `
Review: "This product changed my life!" -> positive
Review: "Broke after one day, total waste." -> negative
Review: "It's fine, does what it says." -> neutral
Review: "${review}" ->`;$lesson$,
  '["When would a few-shot prompt actually perform worse than a well-written zero-shot instruction?","How many examples are \"enough\" for few-shot prompting, and what happens if you add too many?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000202',
  1,
  'Chain-of-Thought & Reasoning Techniques',
  $lesson$## Core Concept

Chain-of-Thought (CoT) prompting asks the model to reason step-by-step before giving a final answer, instead of jumping straight to a conclusion. This dramatically improves accuracy on multi-step math, logic, and planning tasks, because it gives the model "room to think" — each generated token can condition on the reasoning that came before it, rather than needing to hold the entire solution in one leap.

Tree-of-Thought extends this by exploring multiple reasoning branches and comparing them before committing to an answer. Self-consistency samples several independent CoT reasoning paths for the same question and takes a majority vote on the final answer, trading extra API calls for higher reliability.

## Worked Example

The simplest CoT trigger is often just one instruction:$lesson$,
  $lesson$const prompt = `Solve this step by step, showing your reasoning before the final answer:

A store has 3 boxes of 12 pens each. They sell 15 pens. How many pens are left?

Reasoning:`;
// vs. asking for the answer directly, which skips the intermediate steps
// that catch arithmetic and logic errors before they compound.$lesson$,
  '["Why does asking a model to \"think step by step\" measurably improve accuracy on math and logic tasks?","What''s the cost trade-off of self-consistency sampling versus a single CoT call?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000203',
  1,
  'Structured Output & System Instructions',
  $lesson$## Core Concept

Production systems rarely want free-form prose back from an LLM — they want a JSON object matching a specific schema they can parse and validate. Structured output can be enforced two ways: native provider support (JSON mode / constrained decoding, where the API guarantees schema-valid output) or prompt-level instruction (asking the model to return JSON and validating it yourself afterward, with a retry-on-failure loop).

Even with native structured output support, validating the result with a schema library (Zod, Pydantic) is essential — "the API promises JSON" is not the same guarantee as "the API promises the JSON your code expects," and providers can still return semantically wrong values inside a syntactically valid shape.

System prompts are the other half of reliable structured behavior: they set a persistent role, tone, and set of constraints that apply across the whole conversation, and are prioritized more heavily by the model than user turns — which is also why they're the first line of defense against prompt injection.

## Worked Example

Define the shape once, validate every response against it:$lesson$,
  $lesson$import { z } from "zod";

const ExtractionSchema = z.object({
  name: z.string(),
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
});

const parsed = ExtractionSchema.safeParse(JSON.parse(llmResponseText));
if (!parsed.success) {
  // retry with an error-correction prompt rather than trusting the shape blindly
}$lesson$,
  '["Why is schema validation still necessary even when a provider offers native structured output guarantees?","How do system prompts help resist a user trying to override the model''s instructions mid-conversation?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000301',
  1,
  'LLM Client SDKs & Parameters',
  $lesson$## Core Concept

Every LLM API exposes a handful of generation parameters that meaningfully change behavior. `temperature` controls randomness (0 = deterministic/greedy, higher = more varied); `top_p` (nucleus sampling) restricts sampling to the smallest set of tokens whose cumulative probability exceeds a threshold; `max_tokens` caps output length and directly bounds both cost and latency.

Streaming (Server-Sent Events) lets you render tokens to the user as they're generated instead of waiting for the full response — critical for perceived latency in chat interfaces. A streamed response arrives as a sequence of small chunks/deltas your client accumulates and appends to the UI progressively, rather than one large JSON payload at the end.

## Worked Example

Consuming a streamed response client-side:$lesson$,
  $lesson$const response = await fetch("/api/tutor/chat", { method: "POST", body: JSON.stringify(payload) });
const reader = response.body.getReader();
const decoder = new TextDecoder();
let fullText = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  fullText += decoder.decode(value, { stream: true });
  renderPartialText(fullText); // update UI token-by-token, not spinner-then-dump
}$lesson$,
  '["Why does setting temperature to 0 not guarantee perfectly identical outputs across repeated calls?","What''s the user-experience argument for streaming even when total latency is unchanged?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000302',
  1,
  'Structured Function & Tool Calling',
  $lesson$## Core Concept

Function/tool calling lets an LLM decide when to invoke a predefined function (with a name, description, and JSON-schema-typed parameters) instead of only producing text. The model doesn't execute the function itself — it returns a structured request naming the function and the arguments it wants to call it with; your code executes the actual function and feeds the result back to the model as a new message so it can continue reasoning with real data.

This is the foundation of every agentic system: search, database queries, code execution, and API calls all become "tools" the model can reach for mid-conversation rather than needing to be baked into a single static prompt.

## Worked Example

A minimal tool definition and the resulting round-trip:$lesson$,
  $lesson$const tools = [{
  name: "get_weather",
  description: "Get current weather for a city",
  input_schema: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  },
}];

// Model responds with a tool_use block instead of text:
// { type: "tool_use", name: "get_weather", input: { city: "Boston" } }
// Your code executes getWeather("Boston"), then sends the result back
// as a tool_result message so the model can produce its final answer.$lesson$,
  '["Why does the model never execute the function itself — what would go wrong if it did?","How do function/tool definitions consume part of the token budget on every call, even when no tool ends up being used?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000303',
  1,
  'Rate Limiting, Error Handling & Fallbacks',
  $lesson$## Core Concept

Production LLM integrations fail in predictable ways: rate limits (429), transient server errors (5xx), and timeouts on slow generations. The standard defense is exponential backoff with jitter — retry after progressively longer delays (with a small random offset to avoid synchronized retry storms across many clients) rather than hammering the API immediately.

Beyond retries, resilient systems track token usage against provider-enforced quotas, and often implement provider fallback: if the primary provider is degraded or rate-limited, automatically route the request to a secondary provider/model rather than failing the user-facing request outright.

## Worked Example

A minimal exponential backoff retry wrapper:$lesson$,
  $lesson$async function callWithBackoff(fn, maxRetries = 4) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      const delay = 2 ** attempt * 500 + Math.random() * 250;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}$lesson$,
  '["Why does adding random jitter to backoff delays matter when many clients are retrying at once?","What''s the risk of an automatic provider fallback if the two providers'' models behave differently on the same prompt?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000401',
  1,
  'Vector Embeddings & High-Dimensional Spaces',
  $lesson$## Core Concept

An embedding model converts text into a dense vector of a few hundred to a few thousand floating-point numbers, positioned in a high-dimensional space such that semantically similar text ends up close together and dissimilar text ends up far apart. Unlike keyword matching, embeddings capture meaning — "car" and "automobile" land near each other even though they share no characters.

Embedding models are trained separately from generative LLMs and are typically much cheaper and faster to call, since they only need one forward pass to produce a fixed-size vector rather than generating token-by-token.

## Worked Example

Generating and comparing embeddings:$lesson$,
  $lesson$async function generateEmbedding(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  const json = await res.json();
  return json.data[0].embedding; // 1536-dimensional vector
}$lesson$,
  '["Why do two sentences with completely different words sometimes have very similar embeddings?","What happens to search quality if you embed queries with one model version and stored documents with another?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000402',
  1,
  'Vector Search Fundamentals',
  $lesson$## Core Concept

Once text is embedded as vectors, finding "similar" content becomes a nearest-neighbor search problem. Cosine similarity measures the angle between two vectors (ignoring magnitude) and is the most common metric for text embeddings. Euclidean distance measures straight-line distance; dot product combines angle and magnitude.

Exact nearest-neighbor search over millions of vectors is too slow for production, so approximate nearest-neighbor (ANN) index structures trade a small amount of accuracy for large speed gains. HNSW (Hierarchical Navigable Small World) builds a multi-layer graph for fast traversal; IVFFlat partitions vectors into clusters and only searches the most relevant clusters. pgvector supports both.

## Worked Example

A cosine similarity search via pgvector's `<=>` operator:$lesson$,
  $lesson$-- Find the 5 most similar rows to a query embedding
select id, content, 1 - (embedding <=> $1) as similarity
from documents
order by embedding <=> $1
limit 5;$lesson$,
  '["Why is approximate nearest-neighbor search preferred over exact search at production scale?","When would Euclidean distance give a different ranking than cosine similarity for the same two vectors?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000403',
  1,
  'Chunking Strategy & Document Processing',
  $lesson$## Core Concept

Before documents can be embedded and searched, they need to be split into chunks small enough to embed meaningfully and retrieve precisely. Fixed-size character/token splitting is simple and fast but can cut sentences or ideas in half. Recursive character splitting tries progressively smaller separators (paragraph → sentence → word) to keep chunks semantically coherent while respecting a size limit. Semantic chunking goes further, using embedding similarity between adjacent sentences to find natural topic boundaries.

Overlap between consecutive chunks (e.g. 10-20% of chunk size) helps preserve context that would otherwise be lost at a hard chunk boundary. Attaching metadata (source document, section heading, page number) to each chunk lets retrieval results be filtered and cited accurately.

## Worked Example

A basic recursive splitter with overlap:$lesson$,
  $lesson$function chunkText(text, chunkSize = 500, overlap = 50) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}$lesson$,
  '["What goes wrong at retrieval time if chunks are too large? What goes wrong if they''re too small?","Why does adding overlap between chunks help, and what does it cost?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000404',
  1,
  'RAG Pipeline Design',
  $lesson$## Core Concept

Retrieval-Augmented Generation (RAG) bridges an LLM's static training-data knowledge cutoff by retrieving relevant document chunks from a vector database at query time and injecting them into the prompt as context before generation. The pipeline: embed the user's query with the same embedding model used to index documents, run a similarity search to fetch the top-K most relevant chunks, assemble those chunks into the prompt context, and generate an answer grounded in that retrieved text.

RAG quality depends on every upstream stage: bad chunking produces irrelevant retrieved context, a mismatched embedding model produces poor similarity scores, and too few or too many retrieved chunks either starve the model of context or drown the relevant parts in noise.

## Worked Example

The full retrieve-then-generate flow:$lesson$,
  $lesson$async function performRAG(userQuery) {
  const embedding = await generateEmbedding(userQuery);
  const docs = await vectorDb.search(embedding, { topK: 3 });
  const context = docs.map((d) => d.text).join("\n\n");
  return await callLLM({
    system: "Answer using ONLY the provided context. If it's not there, say so.",
    prompt: `Context:\n${context}\n\nQuestion: ${userQuery}`,
  });
}$lesson$,
  '["What trade-offs exist between fixed-size chunking and semantic chunking for RAG retrieval quality?","Why should the system prompt explicitly instruct the model to only use the retrieved context, rather than trusting it to do so implicitly?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000405',
  1,
  'Retrieval Evaluation & Re-Ranking',
  $lesson$## Core Concept

Raw vector similarity search is a good first pass but an imperfect relevance signal — it optimizes for embedding-space proximity, not necessarily "is this the best possible context for answering this exact question." Re-ranking adds a second, more expensive but more accurate pass: a cross-encoder model scores each (query, candidate chunk) pair jointly (rather than comparing pre-computed independent embeddings), producing a much sharper relevance ranking than cosine similarity alone.

Reciprocal Rank Fusion (RRF) combines rankings from multiple retrieval methods (e.g. vector search + keyword/BM25 search) into a single blended ranking, which tends to outperform any single method alone. Evaluating retrieval quality itself requires metrics like context relevance (are the retrieved chunks actually useful?) and faithfulness (does the generated answer actually rely on the retrieved context, or hallucinate around it?).

## Worked Example

A typical two-stage retrieve-then-rerank flow:$lesson$,
  $lesson$async function retrieveAndRerank(query, topK = 20, finalK = 5) {
  const candidates = await vectorSearch(query, topK); // cheap, broad recall
  const scored = await crossEncoderRerank(query, candidates); // expensive, precise
  return scored.sort((a, b) => b.score - a.score).slice(0, finalK);
}$lesson$,
  '["Why is a cross-encoder more accurate than cosine similarity, and why can''t you just use it for the initial broad search too?","What does it mean for a RAG answer to be relevant but not faithful, and why is that distinction dangerous in production?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000501',
  1,
  'Agent Loops & ReAct Framework',
  $lesson$## Core Concept

An agent is an LLM wrapped in a loop that lets it take multiple actions toward a goal rather than producing one response. The ReAct (Reason + Act) pattern structures each loop iteration as: Thought (reason about what to do next), Action (call a tool), Observation (read the tool's result), repeated until the model decides it has enough information to produce a final answer.

This loop structure is what turns "an LLM that can call a function" into "an agent that can autonomously investigate a multi-step problem" — the model sees its own prior actions and their results, and adapts its next action accordingly, rather than committing to a fixed plan upfront.

## Worked Example

A minimal ReAct-style loop:$lesson$,
  $lesson$async function runAgentLoop(goal, maxSteps = 6) {
  const messages = [{ role: "user", content: goal }];
  for (let step = 0; step < maxSteps; step++) {
    const response = await callLLMWithTools(messages);
    if (response.stopReason === "end_turn") return response.content;
    const toolResult = await executeTool(response.toolCall);
    messages.push(response.toAssistantMessage(), toolResultMessage(toolResult));
  }
  throw new Error("Agent exceeded max steps without reaching a final answer");
}$lesson$,
  '["Why is a hard step limit necessary for every agent loop implementation?","What''s the difference between an agent that plans all its steps upfront and one that reasons step-by-step with ReAct?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000502',
  1,
  'Agent Memory & State Management',
  $lesson$## Core Concept

Agents need different kinds of memory for different time horizons. Short-term/working memory is the current conversation's message history, held entirely in the context window and lost when the session ends. Long-term memory persists across sessions — typically implemented as a vector store (embeddings + similarity search) that lets an agent retrieve relevant facts from past interactions even though they're no longer in the active context window.

Managing memory is fundamentally a context-budget problem: as conversations grow, you can't keep appending every message forever, so systems summarize or selectively retrieve older context rather than including it verbatim.

## Worked Example

A simple pattern combining both memory types:$lesson$,
  $lesson$async function buildAgentContext(userId, currentMessage) {
  const recentMessages = getLastNMessages(userId, 10); // short-term
  const relevantMemories = await vectorSearch(
    await generateEmbedding(currentMessage),
    { userId, topK: 3 }, // long-term
  );
  return [...relevantMemories.map(toContextNote), ...recentMessages];
}$lesson$,
  '["Why can''t an agent just keep the entire conversation history in every request forever?","What could go wrong if long-term memory retrieval pulls in an outdated or contradicted fact from an earlier session?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000503',
  1,
  'Multi-Agent Orchestration & Workflows',
  $lesson$## Core Concept

Complex tasks are often better handled by multiple specialized agents than one generalist agent trying to do everything. A common pattern is an orchestrator/router agent that decomposes a task and delegates sub-tasks to specialist agents (a research agent, a coding agent, a review agent), then assembles their outputs into a final result.

This mirrors software engineering's separation of concerns: each specialist agent can have a narrower, more reliable system prompt and toolset, and failures are easier to isolate and debug than in one monolithic agent trying to juggle every responsibility at once. The trade-off is added latency (multiple sequential or parallel LLM calls) and orchestration complexity (routing logic, handoff protocols, shared state).

## Worked Example

A minimal orchestrator pattern:$lesson$,
  $lesson$async function orchestrate(task) {
  const plan = await routerAgent.decompose(task);
  const results = await Promise.all(
    plan.subtasks.map((st) => specialistAgents[st.type].execute(st)),
  );
  return await synthesizerAgent.combine(results);
}$lesson$,
  '["What kinds of tasks benefit most from splitting across specialized agents versus using one generalist agent?","How does multi-agent orchestration change your error-handling strategy compared to a single-agent system?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000601',
  1,
  'LLM-as-a-Judge & Automated Evals',
  $lesson$## Core Concept

Manually reviewing every model output doesn't scale. LLM-as-a-judge uses a (usually stronger) LLM to grade another model's outputs against a rubric — checking correctness, tone, format compliance, or faithfulness to source material — producing a numeric score and structured feedback automatically. This is exactly the pattern this platform uses to grade open-ended assessment responses.

Judge reliability itself needs validation: judges can have systematic biases (favoring longer responses, being lenient on confident-sounding wrong answers), so it's standard practice to periodically spot-check judge scores against human ratings and calibrate the rubric or grading prompt accordingly.

## Worked Example

A minimal LLM-as-judge grading call:$lesson$,
  $lesson$async function gradeWithLLM(response, rubric) {
  const result = await callLLM({
    system: `Grade the response 0-100 against this rubric: ${JSON.stringify(rubric)}. Return JSON: { score, feedback }.`,
    prompt: response,
  });
  return JSON.parse(result.content);
}$lesson$,
  '["What systematic biases can an LLM judge have, and how would you detect them?","Why might you use a more expensive/capable model as the judge than the model being evaluated?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000602',
  1,
  'Benchmark Suites & Ground Truth Datasets',
  $lesson$## Core Concept

A benchmark is a fixed dataset of inputs paired with known-correct (ground truth) outputs, used to measure a system's accuracy in a repeatable way. Curating a good golden dataset means covering realistic edge cases, not just easy average-case examples, and keeping it separate from anything used in prompt iteration so scores stay meaningful and don't overfit to the benchmark itself.

Common metrics include exact-match accuracy (for tasks with a single correct answer), faithfulness (does the output stay grounded in provided context), and regression tracking — running the same benchmark after every prompt or model change to catch silent quality drops before they reach users.

## Worked Example

A minimal regression-eval harness:$lesson$,
  $lesson$async function runBenchmark(goldenSet, generateFn) {
  const results = await Promise.all(
    goldenSet.map(async (ex) => ({
      passed: (await generateFn(ex.input)) === ex.expectedOutput,
      ...ex,
    })),
  );
  const accuracy = results.filter((r) => r.passed).length / results.length;
  return { accuracy, failures: results.filter((r) => !r.passed) };
}$lesson$,
  '["Why is it important to keep your benchmark dataset separate from the examples you use while iterating on a prompt?","What''s the risk of only benchmarking easy, average-case inputs?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000603',
  1,
  'Guardrails, Hallucination & Safety Auditing',
  $lesson$## Core Concept

Guardrails are checks applied before a prompt reaches the model (input guardrails — blocking prompt injection, PII, disallowed topics) and after a response is generated (output guardrails — checking for hallucination, toxicity, format compliance) before it reaches the end user. Hallucination is when a model states something confidently that isn't true or isn't supported by the provided context — detecting it often means checking whether claims in the output are actually traceable back to the source material (for RAG) or cross-checking against a trusted source.

Prompt injection is a distinct risk: an attacker embeds instructions inside user-supplied or retrieved content, trying to override the system prompt's constraints. Defenses include treating all retrieved/user content as untrusted data (never as instructions), and explicitly instructing the model to ignore instructions embedded within content it's asked to process.

## Worked Example

A simple output guardrail checking groundedness:$lesson$,
  $lesson$async function checkGroundedness(answer, sourceContext) {
  const check = await callLLM({
    system: "Does the ANSWER make any claims not supported by the CONTEXT? Answer only yes or no.",
    prompt: `CONTEXT: ${sourceContext}\n\nANSWER: ${answer}`,
  });
  return check.content.trim().toLowerCase() === "no"; // true = grounded
}$lesson$,
  '["How does prompt injection via retrieved documents differ from prompt injection via direct user input?","Why is it hard to reliably detect hallucination with the same model that generated the response?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000701',
  1,
  'Supervised Fine-Tuning (SFT) & Dataset Formatting',
  $lesson$## Core Concept

Supervised Fine-Tuning adapts a pre-trained base model to a specific task or style by further training it on a curated dataset of input/output examples (instruction, response) pairs. This is different from prompting: fine-tuning changes the model's weights, so the learned behavior persists without needing to repeat instructions in every prompt.

Dataset format matters — Alpaca-style datasets use a flat (instruction, input, output) structure; ShareGPT-style datasets use a multi-turn conversation format, better suited for chat models. Dataset quality dominates fine-tuning outcomes far more than dataset size: a small, clean, consistent dataset usually outperforms a large noisy one.

## Worked Example

A minimal Alpaca-format training example:$lesson$,
  $lesson${
  "instruction": "Summarize the following support ticket in one sentence.",
  "input": "Customer reports login page returns 500 error after password reset.",
  "output": "Login fails with a server error following a password reset."
}$lesson$,
  '["Why does fine-tuning dataset quality matter more than raw dataset size?","When would fine-tuning be a better choice than a well-engineered prompt with few-shot examples?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000702',
  1,
  'Parameter-Efficient Fine-Tuning (PEFT / LoRA)',
  $lesson$## Core Concept

Full fine-tuning updates every parameter in a model, which for large models requires enormous GPU memory and storage per fine-tuned variant. LoRA (Low-Rank Adaptation) instead freezes the original model weights and injects small trainable low-rank matrices into specific layers — training only a tiny fraction of the total parameters while achieving comparable task performance. QLoRA extends this further by quantizing the frozen base model to 4-bit precision, cutting memory requirements dramatically and making fine-tuning large models feasible on a single consumer GPU.

Because LoRA only trains small adapter matrices, you can store many task-specific adapters (megabytes each) against one shared frozen base model (gigabytes), and swap adapters at inference time instead of hosting a full fine-tuned copy per task.

## Worked Example

Conceptually, LoRA decomposes a weight update into two small matrices:$lesson$,
  $lesson$// Full fine-tuning updates W directly: W' = W + ΔW  (ΔW is huge)
// LoRA instead learns ΔW as a low-rank product, freezing W entirely:
// ΔW ≈ A @ B, where A is (d x r) and B is (r x d), r << d
// Only A and B are trained — a tiny fraction of W's parameter count.$lesson$,
  '["Why does training only a low-rank decomposition still produce meaningful task adaptation?","What practical deployment advantage does having many small LoRA adapters over one shared base model give you?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000703',
  1,
  'RLHF & Direct Preference Optimization (DPO)',
  $lesson$## Core Concept

Reinforcement Learning from Human Feedback (RLHF) aligns a fine-tuned model with human preferences by training a separate reward model on human-ranked pairs of responses (which one do people prefer?), then using reinforcement learning to update the base model to produce outputs the reward model scores highly. This is the technique behind making raw fine-tuned models feel helpful, honest, and safe rather than just fluent.

Direct Preference Optimization (DPO) achieves a similar alignment effect without training a separate reward model or running full RL — it directly optimizes the model on preference pairs (chosen response vs. rejected response) using a simpler, more stable loss function, making alignment training significantly cheaper and easier to get right.

## Worked Example

A DPO training example is just a preference pair, no reward model needed:$lesson$,
  $lesson${
  "prompt": "Explain recursion to a beginner.",
  "chosen": "Recursion is when a function calls itself to solve a smaller version of the same problem, until it reaches a simple base case...",
  "rejected": "Recursion is a programming technique. It is used in computer science for various algorithmic purposes."
}$lesson$,
  '["Why is DPO generally considered more stable to train than full RLHF?","What could go wrong if the human preference data used for alignment reflects biased or inconsistent judgments?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000801',
  1,
  'Model Serving & Inference Engines',
  $lesson$## Core Concept

Serving a model in production is a different engineering problem than training it. Dedicated inference engines like vLLM, TGI (Text Generation Inference), and Ollama optimize for high-throughput, low-latency serving using techniques like continuous batching (dynamically grouping requests together instead of processing one at a time) and PagedAttention (managing the KV cache — the per-request memory of prior tokens' attention state — more efficiently, similar to how an OS manages virtual memory pages).

Choosing a serving engine involves trade-offs between raw throughput (requests/second), latency (time to first token, time per output token), hardware requirements (GPU memory), and ease of deployment (Ollama is simplest for local/small-scale; vLLM/TGI target production-scale throughput).

## Worked Example

A minimal vLLM-style serving request looks like a normal chat completion call, but the engine handles batching transparently:$lesson$,
  $lesson$// From the client's perspective, serving infra is invisible —
// the engine batches this request with concurrent ones automatically.
const response = await fetch("http://localhost:8000/v1/chat/completions", {
  method: "POST",
  body: JSON.stringify({ model: "llama-3-8b", messages, stream: true }),
});$lesson$,
  '["Why does continuous batching improve throughput compared to processing requests strictly one at a time?","What deployment scenario would make Ollama a better choice than vLLM, and vice versa?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000802',
  1,
  'Caching & Latency Optimization',
  $lesson$## Core Concept

LLM latency has two dominant costs: time-to-first-token (TTFT, how long before generation starts) and per-token generation time. Prompt caching lets a provider reuse the computed attention state for a repeated prefix (like a long, unchanging system prompt) across multiple requests, avoiding redundant computation and cutting both cost and TTFT for that shared prefix. KV cache reuse applies the same idea within a serving engine across concurrent requests sharing common context.

Quantization reduces model weight precision (e.g. from 16-bit to 8-bit or 4-bit numbers), shrinking memory footprint and increasing throughput at a small, usually acceptable, accuracy cost — a common production trade-off when serving large models on limited hardware.

## Worked Example

Structuring a prompt to maximize cache hits — put the stable, unchanging content first:$lesson$,
  $lesson$const messages = [
  { role: "system", content: LONG_STABLE_SYSTEM_PROMPT }, // cached across requests
  { role: "user", content: userSpecificQuestion },        // changes every request
];
// Providers that support prompt caching cache the stable prefix (system
// prompt) and only pay full compute cost for the variable suffix.$lesson$,
  '["Why does putting stable content at the start of a prompt (rather than the end) matter for caching?","What''s the trade-off quantization makes, and when would it not be an acceptable choice?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

insert into public.lessons (skill_node_id, version, title, content_markdown, code_example, discussion_questions)
values (
  'a0000000-0000-4000-a000-000000000803',
  1,
  'Production Monitoring & Cost Tracking',
  $lesson$## Core Concept

Once an LLM feature is live, you need visibility into what it's actually doing: token usage per request/user/feature, latency percentiles (p50/p95/p99, not just averages, since averages hide tail latency spikes that dominate user experience), error rates, and dollar cost per feature. Without this, cost overruns and quality regressions are invisible until a bill or a user complaint arrives.

A cost ledger (logging every LLM call's tokens, model, feature, and computed cost) is the foundation for this — it lets you answer "which feature is expensive," "did this prompt change increase token usage," and "is this user hitting an unusual volume" after the fact, not just in the moment.

## Worked Example

A minimal cost-logging call, made right after every LLM invocation:$lesson$,
  $lesson$async function logLLMCost({ userId, feature, model, tokensIn, tokensOut }) {
  const costUsd = calculateCost(model, tokensIn, tokensOut);
  await db.from("cost_logs").insert({ user_id: userId, feature, model, tokensIn, tokensOut, cost_usd: costUsd });
  return costUsd;
}$lesson$,
  '["Why do p95/p99 latency numbers matter more than the average for user-facing quality?","What decisions become possible once you can attribute LLM cost to a specific feature rather than just a total bill?"]'::jsonb
)
on conflict (skill_node_id, version) do nothing;

