/// <reference lib="webworker" />
/* eslint-disable @typescript-eslint/no-explicit-any */

// Runs Pyodide off the main thread so a runaway user loop can't freeze the
// page — the only way to actually interrupt a busy synchronous WASM loop is
// to terminate the whole worker from the main thread (see
// lib/sandbox/pyodide.ts), so this file just needs to load Pyodide, execute
// one script per "execute" message, and report back.
//
// Deliberately separate from lib/pyodide/loader.ts (Prompt 21's
// assessment-specific, main-thread integration for single-function grading
// stubs) — this wrapper supports arbitrary multi-function project code,
// package loading, and the LLM proxy shim below.

import { appendCapped } from "./outputBuffer";

const PYODIDE_VERSION = "v0.26.2";
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;
const PYODIDE_MODULE_URL = `${PYODIDE_INDEX_URL}pyodide.mjs`;

interface ExecuteMessage {
  type: "execute";
  requestId: string;
  code: string;
  packages?: string[];
  projectId?: string;
}

type IncomingMessage = ExecuteMessage;

let pyodideReady: Promise<any> | null = null;
let currentProjectId = "";

/**
 * LLM proxy shim (Prompt 53): Pyodide can't make real network calls to
 * arbitrary hosts in a way that's safe/sandboxed, so instead of general
 * internet access, user code gets exactly one network-shaped capability —
 * calling this platform's own authenticated, cost-logged /api/llm proxy.
 * Workers have their own `fetch`, and same-origin requests carry the
 * user's session cookie automatically, so this reaches the real endpoint
 * without any main-thread round-trip.
 */
async function callLLMProxy(prompt: string, systemPrompt?: string): Promise<string> {
  const messages = systemPrompt
    ? [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }]
    : [{ role: "user", content: prompt }];

  const response = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feature: "sandbox_llm_call", model: "cheap", messages }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`LLM proxy call failed (${response.status}): ${errBody}`);
  }

  const json = await response.json();
  return json.content || "";
}

/**
 * Tool-calling variant of the LLM proxy shim (Prompt 70): passes Anthropic-
 * shaped tool definitions through to /api/llm and returns whatever the
 * model decided — text, a tool call, or both — as a plain JS object so
 * Python sees a dict, not an opaque proxy.
 */
async function callLLMWithToolsProxy(
  prompt: string,
  toolsJson: string,
  systemPrompt?: string,
): Promise<{ content: string; tool_calls: Array<{ name: string; input: Record<string, unknown> }> }> {
  const tools = JSON.parse(toolsJson);
  const messages = systemPrompt
    ? [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }]
    : [{ role: "user", content: prompt }];

  const response = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feature: "sandbox_llm_call", model: "cheap", messages, tools }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`LLM proxy call failed (${response.status}): ${errBody}`);
  }

  const json = await response.json();
  return {
    content: json.content || "",
    tool_calls: (json.toolCalls || []).map((t: { name: string; input: Record<string, unknown> }) => ({
      name: t.name,
      input: t.input,
    })),
  };
}

/**
 * Embeddings shim (Prompt 69): the RAG Chatbot project stores/retrieves
 * chunks against the platform's real pgvector-backed public.embeddings
 * table (Prompt 5), not a simulated in-sandbox structure.
 */
async function storeDocumentChunkProxy(text: string): Promise<string> {
  const response = await fetch("/api/sandbox/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "store", project_id: currentProjectId, text }),
  });
  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`store_document_chunk failed (${response.status}): ${errBody}`);
  }
  const json = await response.json();
  return json.id;
}

async function searchSimilarChunksProxy(
  query: string,
  topK: number,
): Promise<Array<{ text: string; similarity: number }>> {
  const response = await fetch("/api/sandbox/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "search", project_id: currentProjectId, query, top_k: topK }),
  });
  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`search_similar_chunks failed (${response.status}): ${errBody}`);
  }
  const json = await response.json();
  return json.results;
}

async function initPyodide(): Promise<any> {
  if (pyodideReady) return pyodideReady;

  pyodideReady = (async () => {
    const { loadPyodide } = await import(/* webpackIgnore: true */ PYODIDE_MODULE_URL);
    const pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });

    // Common packages the GenAI track needs available offline.
    await pyodide.loadPackage(["numpy"]);

    pyodide.globals.set("_call_llm_proxy", callLLMProxy);
    pyodide.globals.set("_call_llm_with_tools_proxy", callLLMWithToolsProxy);
    pyodide.globals.set("_store_document_chunk_proxy", storeDocumentChunkProxy);
    pyodide.globals.set("_search_similar_chunks_proxy", searchSimilarChunksProxy);

    await pyodide.runPythonAsync(`
import json as _json

async def call_llm(prompt, system_prompt=""):
    """Call the platform's LLM proxy from sandboxed code. Costs count
    against your usage cap like any other AI feature."""
    result = await _call_llm_proxy(prompt, system_prompt)
    return result

async def call_llm_with_tools(prompt, tools, system_prompt=""):
    """Call the LLM proxy with tool/function definitions (Anthropic-shaped:
    [{"name", "description", "input_schema"}]). Returns a dict:
    {"content": str, "tool_calls": [{"name": str, "input": dict}]}."""
    result = await _call_llm_with_tools_proxy(prompt, _json.dumps(tools), system_prompt)
    return result.to_py() if hasattr(result, "to_py") else result

async def store_document_chunk(text):
    """Embed and store a document chunk in the platform's real pgvector
    store (public.embeddings), scoped to this project."""
    return await _store_document_chunk_proxy(text)

async def search_similar_chunks(query, top_k=3):
    """Retrieve the most similar previously-stored chunks for this project."""
    result = await _search_similar_chunks_proxy(query, top_k)
    return result.to_py() if hasattr(result, "to_py") else result
`);

    return pyodide;
  })();

  return pyodideReady;
}

self.onmessage = async (event: MessageEvent<IncomingMessage>) => {
  const msg = event.data;
  if (msg.type !== "execute") return;

  const { requestId, code, packages, projectId } = msg;
  if (projectId) currentProjectId = projectId;
  const startTime = performance.now();

  let stdoutBuffer = "";
  let stderrBuffer = "";
  const stdoutTruncated = { value: false };
  const stderrTruncated = { value: false };

  try {
    const pyodide = await initPyodide();

    if (packages && packages.length > 0) {
      await pyodide.loadPackage(packages);
    }

    pyodide.setStdout({
      batched: (text: string) => {
        stdoutBuffer = appendCapped(stdoutBuffer, text + "\n", stdoutTruncated);
      },
    });
    pyodide.setStderr({
      batched: (text: string) => {
        stderrBuffer = appendCapped(stderrBuffer, text + "\n", stderrTruncated);
      },
    });

    const rawResult = await pyodide.runPythonAsync(code);
    const formattedResult =
      rawResult !== undefined && rawResult !== null ? String(rawResult) : "";

    (self as unknown as Worker).postMessage({
      type: "result",
      requestId,
      stdout: stdoutBuffer.trim(),
      stderr: stderrBuffer.trim(),
      result: formattedResult,
      isError: false,
      executionTimeMs: Math.round(performance.now() - startTime),
      truncated: stdoutTruncated.value || stderrTruncated.value,
    });
  } catch (err: any) {
    (self as unknown as Worker).postMessage({
      type: "result",
      requestId,
      stdout: stdoutBuffer.trim(),
      stderr: (stderrBuffer + "\n" + (err?.message || String(err))).trim(),
      result: "",
      isError: true,
      executionTimeMs: Math.round(performance.now() - startTime),
      truncated: stdoutTruncated.value || stderrTruncated.value,
    });
  }
};

(self as unknown as Worker).postMessage({ type: "worker_ready" });
