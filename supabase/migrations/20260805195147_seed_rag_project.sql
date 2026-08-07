-- Seed two real catalog projects so Section G (workspace/sandbox) and
-- Section H (GenAI-specific review rubrics) have real data to exercise:
-- one RAG-shaped project, one agent-shaped project. Test cases are kept
-- deterministic and network-free (chunking/similarity/routing logic) so
-- the auto-test-runner (Prompt 57) can grade them entirely inside the
-- offline Pyodide sandbox.

insert into public.projects (id, name, tier, spec, starter_template)
values (
  'c0000000-0000-4000-a000-000000000001',
  'RAG Pipeline: Chunking & Retrieval Scorer',
  'free',
  '{
    "type": "rag",
    "description": "Implement the two core building blocks of a retrieval-augmented generation pipeline: splitting a document into overlapping chunks, and scoring chunk relevance against a query using cosine similarity.",
    "requirements": [
      "chunk_text(text, chunk_size, overlap) must return a list of substrings of length chunk_size, advancing by (chunk_size - overlap) each step, covering the full input text.",
      "cosine_similarity(vec_a, vec_b) must return the cosine similarity between two equal-length numeric vectors as a float between -1 and 1.",
      "Handle the edge case of a zero-magnitude vector without raising an exception (return 0.0 similarity)."
    ],
    "test_cases": [
      {"function": "chunk_text", "input": ["ABCDEFGHIJ", 4, 0], "expected_output": ["ABCD", "EFGH", "IJ"]},
      {"function": "chunk_text", "input": ["ABCDEFGHIJ", 4, 2], "expected_output": ["ABCD", "CDEF", "EFGH", "GHIJ", "IJ"]},
      {"function": "cosine_similarity", "input": [[1, 0], [1, 0]], "expected_output": 1.0},
      {"function": "cosine_similarity", "input": [[1, 0], [0, 1]], "expected_output": 0.0},
      {"function": "cosine_similarity", "input": [[0, 0], [1, 1]], "expected_output": 0.0}
    ]
  }'::jsonb,
  '# RAG Pipeline: Chunking & Retrieval Scorer
#
# Implement both functions below. Use "Run Tests" to check your work
# against the project''s test cases before submitting.

def chunk_text(text, chunk_size, overlap):
    """Split text into overlapping chunks of length chunk_size."""
    # TODO: implement
    pass


def cosine_similarity(vec_a, vec_b):
    """Return the cosine similarity between two equal-length vectors."""
    # TODO: implement
    pass
'
)
on conflict (id) do nothing;

insert into public.projects (id, name, tier, spec, starter_template)
values (
  'c0000000-0000-4000-a000-000000000002',
  'Agent Tool Router',
  'free',
  '{
    "type": "agent",
    "description": "Implement a simple ReAct-style router that decides which tool an agent should invoke next based on the content of its current thought.",
    "requirements": [
      "route_action(thought) must return \"search\" if the thought mentions needing external/current information (e.g. contains \"look up\", \"search\", \"find out\", \"current\").",
      "route_action(thought) must return \"calculate\" if the thought involves arithmetic (contains \"calculate\", \"compute\", or a math operator like +, -, *, /).",
      "route_action(thought) must return \"answer\" otherwise (the agent has enough information to respond directly).",
      "Matching must be case-insensitive."
    ],
    "test_cases": [
      {"function": "route_action", "input": ["I need to search for the current weather"], "expected_output": "search"},
      {"function": "route_action", "input": ["Let me calculate 12 * 4"], "expected_output": "calculate"},
      {"function": "route_action", "input": ["I already know the answer to this"], "expected_output": "answer"},
      {"function": "route_action", "input": ["I should look up the latest stock price"], "expected_output": "search"}
    ]
  }'::jsonb,
  '# Agent Tool Router
#
# Implement route_action below. Use "Run Tests" to check your work
# against the project''s test cases before submitting.

def route_action(thought):
    """Return "search", "calculate", or "answer" based on the thought text."""
    # TODO: implement
    pass
'
)
on conflict (id) do nothing;
