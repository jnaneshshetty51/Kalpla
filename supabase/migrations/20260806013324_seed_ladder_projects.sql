-- Prompts 68-70: the public 3-tier project ladder. Distinct from the two
-- lightweight, purely-synthetic exercises seeded earlier (Section G/H) for
-- testing sandbox mechanics — these are the real capstone projects,
-- unlocked by roadmap progress (prerequisite_skill_node_ids), reviewed via
-- lib/grading/reviewSubmission.ts's GenAI-specific rubrics (Prompt 62).

-- Project 1: Prompt Playground
insert into public.projects (id, name, tier, ladder_position, prerequisite_skill_node_ids, spec, starter_template)
values (
  'd0000000-0000-4000-a000-000000000001',
  'Prompt Playground',
  'free',
  1,
  array[
    'a0000000-0000-4000-a000-000000000201'::uuid, -- Zero-Shot & Few-Shot Prompting
    'a0000000-0000-4000-a000-000000000203'::uuid  -- Structured Output & System Instructions
  ],
  '{
    "type": "general",
    "description": "Build a small tool that takes unstructured text input and reliably extracts structured JSON output using prompt engineering — the model will sometimes wrap its answer in markdown fences, add commentary, or receive malformed/empty input, and your extraction pipeline needs to handle all of that without crashing.",
    "requirements": [
      "extract_structured_data(text) must call the LLM (via call_llm) with a prompt engineered to reliably return valid JSON with a clearly defined schema (at minimum: a \"summary\" string field and an \"entities\" list field).",
      "parse_json_response(raw_text) must robustly parse a model response into a dict: strip markdown code fences if present, parse the JSON, and return None (not raise) on malformed or empty input.",
      "Handle the edge case of an empty input string to extract_structured_data without making a wasted LLM call.",
      "The output schema must be explicit and consistent — document it in a comment or docstring."
    ],
    "test_cases": [
      {"function": "parse_json_response", "input": ["{\"summary\": \"ok\", \"entities\": []}"], "expected_output": {"summary": "ok", "entities": []}},
      {"function": "parse_json_response", "input": ["```json\n{\"summary\": \"fenced\", \"entities\": [\"a\"]}\n```"], "expected_output": {"summary": "fenced", "entities": ["a"]}},
      {"function": "parse_json_response", "input": [""], "expected_output": null},
      {"function": "parse_json_response", "input": ["not json at all"], "expected_output": null}
    ]
  }'::jsonb,
  '# Prompt Playground
#
# Extract structured JSON from unstructured text using prompt engineering.
# Use "Run Tests" to check parse_json_response against the project''s test
# cases before submitting.

import json as _json

def parse_json_response(raw_text):
    """Robustly parse a (possibly markdown-fenced, possibly malformed)
    model response into a dict. Returns None on empty/malformed input."""
    # TODO: strip ```json fences if present, then json.loads, else None
    pass


async def extract_structured_data(text):
    """Extract structured JSON {"summary": str, "entities": [str]} from
    unstructured text via the LLM proxy. Handle empty input without
    making a wasted call."""
    if not text or not text.strip():
        return None

    system_prompt = "TODO: engineer a system prompt that reliably returns JSON matching {\"summary\": str, \"entities\": [str]}"
    raw = await call_llm(text, system_prompt)
    return parse_json_response(raw)
'
)
on conflict (id) do nothing;

-- Project 2: RAG Chatbot
insert into public.projects (id, name, tier, ladder_position, prerequisite_skill_node_ids, spec, starter_template)
values (
  'd0000000-0000-4000-a000-000000000002',
  'RAG Chatbot',
  'pro',
  2,
  array[
    'a0000000-0000-4000-a000-000000000401'::uuid, -- Vector Embeddings & High-Dimensional Spaces
    'a0000000-0000-4000-a000-000000000402'::uuid, -- Vector Search Fundamentals
    'a0000000-0000-4000-a000-000000000403'::uuid, -- Chunking Strategy & Document Processing
    'a0000000-0000-4000-a000-000000000404'::uuid  -- RAG Pipeline Design
  ],
  '{
    "type": "rag",
    "description": "Build a document-grounded chatbot: upload a document, chunk it, embed and store the chunks in the platform''s real pgvector-backed store, retrieve the most relevant chunks for a question, and generate an answer grounded in only that retrieved context. Chunking is pre-built for you — focus on retrieval quality and prompt construction.",
    "requirements": [
      "index_document(document_text) must chunk the document (chunk_document is already implemented) and store every chunk via store_document_chunk.",
      "answer_question(question) must retrieve relevant chunks via search_similar_chunks, assemble them into grounded context, and call call_llm with a prompt that instructs the model to answer ONLY from the provided context.",
      "If no sufficiently similar chunks are found, answer_question must say so rather than letting the model guess/hallucinate an answer.",
      "The generation prompt must clearly separate retrieved context from the question so the model cannot confuse the two."
    ],
    "test_cases": [
      {"function": "chunk_document", "input": ["ABCDEFGHIJKLMNOP", 6, 2], "expected_output": ["ABCDEF", "EFGHIJ", "IJKLMN", "MNOP"]}
    ]
  }'::jsonb,
  '# RAG Chatbot
#
# Document upload + chunking scaffolding is pre-built below. Implement
# index_document and answer_question. store_document_chunk and
# search_similar_chunks are provided by the sandbox and read/write the
# platform''s real pgvector-backed embeddings store, scoped to this project.

def chunk_document(text, chunk_size=500, overlap=50):
    """Pre-built: split text into overlapping chunks. Don''t need to touch this."""
    chunks = []
    step = chunk_size - overlap
    for i in range(0, len(text), step):
        chunk = text[i:i + chunk_size]
        if chunk:
            chunks.append(chunk)
    return chunks


async def index_document(document_text):
    """Chunk the document and store every chunk in the real vector store."""
    chunks = chunk_document(document_text)
    # TODO: await store_document_chunk(chunk) for each chunk
    pass


async def answer_question(question):
    """Retrieve relevant chunks and generate a grounded answer. If nothing
    sufficiently relevant is found, say so rather than guessing."""
    # TODO: results = await search_similar_chunks(question, top_k=3)
    # TODO: build context from results, call_llm with a grounded-answer prompt
    pass
'
)
on conflict (id) do nothing;

-- Project 3: Tool-Using Agent
insert into public.projects (id, name, tier, ladder_position, prerequisite_skill_node_ids, spec, starter_template)
values (
  'd0000000-0000-4000-a000-000000000003',
  'Tool-Using Agent',
  'pro',
  3,
  array[
    'a0000000-0000-4000-a000-000000000501'::uuid, -- Agent Loops & ReAct Framework
    'a0000000-0000-4000-a000-000000000302'::uuid  -- Structured Function & Tool Calling
  ],
  '{
    "type": "agent",
    "description": "Build a multi-step agent that can call at least two distinct tools — a calculator and a mock search function — and correctly plans which one to use (or neither) based on the user''s query, using the LLM proxy''s real function-calling support.",
    "requirements": [
      "calculator_tool(expression) and search_tool(query) must both be implemented as plain, directly-callable Python functions (these are the actual tool implementations the agent invokes).",
      "run_agent(query) must call call_llm_with_tools with both tool definitions and correctly dispatch to the matching Python function when the model returns a tool call, then produce a final answer.",
      "The agent must handle a tool call failing (e.g. calculator_tool given an invalid expression) without crashing — return a clear error back into the loop rather than raising.",
      "Planning must be driven by the model''s tool_calls output, not a hardcoded keyword if-chain that only coincidentally matches the test queries."
    ],
    "test_cases": [
      {"function": "calculator_tool", "input": ["2 + 2"], "expected_output": 4},
      {"function": "calculator_tool", "input": ["10 * 3"], "expected_output": 30},
      {"function": "search_tool", "input": ["capital of France"], "expected_output": "Paris is the capital of France."}
    ]
  }'::jsonb,
  '# Tool-Using Agent
#
# Implement the two tools and the agent loop. call_llm_with_tools is
# provided by the sandbox and calls the platform''s real LLM proxy with
# function-calling support.

def calculator_tool(expression):
    """Safely evaluate a basic arithmetic expression. Raise a clear error
    (don''t crash silently) on invalid input."""
    # TODO: implement (avoid raw eval() of arbitrary input)
    pass


def search_tool(query):
    """Mock search tool — returns a canned fact for known queries."""
    known = {"capital of France": "Paris is the capital of France."}
    return known.get(query, f"No results found for: {query}")


TOOLS = [
    {
        "name": "calculator_tool",
        "description": "Evaluate a basic arithmetic expression and return the numeric result.",
        "input_schema": {
            "type": "object",
            "properties": {"expression": {"type": "string"}},
            "required": ["expression"],
        },
    },
    {
        "name": "search_tool",
        "description": "Look up a factual query the agent doesn''t already know.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
]


async def run_agent(query):
    """Plan and execute: ask the model which tool (if any) to use, dispatch
    to the matching Python function, handle failures gracefully, then
    produce a final answer."""
    # TODO: result = await call_llm_with_tools(query, TOOLS)
    # TODO: for each tool call in result["tool_calls"], dispatch and handle errors
    pass
'
)
on conflict (id) do nothing;
