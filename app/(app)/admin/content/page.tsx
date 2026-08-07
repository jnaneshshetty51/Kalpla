"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

// ---- Types ----
interface LessonVersionInfo {
  version: number;
  title: string;
  created_at?: string;
}

interface LatestLessonData {
  id?: string;
  version: number;
  title: string;
  content_markdown: string;
  code_example?: string;
  discussion_questions?: string[];
  created_at?: string;
}

interface AdminNodeItem {
  id: string;
  name: string;
  category: string;
  difficulty: number;
  order_index: number;
  description?: string;
  prerequisite_ids?: string[];
  current_version: number;
  latest_lesson: LatestLessonData;
  all_versions: LessonVersionInfo[];
}

type PageTab = "lessons" | "skill-graph";

const textareaStyles =
  "w-full rounded-xl border border-steel-800 bg-observatory-base p-4 text-xs text-steel-200 transition duration-200 focus:border-telemetry-cyan focus:outline-none focus:ring-1 focus:ring-telemetry-cyan leading-relaxed";

export default function AdminContentPage() {
  const [nodes, setNodes] = useState<AdminNodeItem[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [pageTab, setPageTab] = useState<PageTab>("lessons");
  const [lessonTab, setLessonTab] = useState<"editor" | "preview">("editor");

  // Lesson form state
  const [title, setTitle] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [codeExample, setCodeExample] = useState("");
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");

  // Skill graph edit state
  const [sgName, setSgName] = useState("");
  const [sgDesc, setSgDesc] = useState("");
  const [sgPrereqs, setSgPrereqs] = useState(""); // comma-separated IDs

  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cycleDetected, setCycleDetected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const populateLesson = (node: AdminNodeItem) => {
    const lesson = node.latest_lesson;
    setTitle(lesson.title || node.name);
    setContentMarkdown(lesson.content_markdown || "");
    setCodeExample(lesson.code_example || "");
    const questions = lesson.discussion_questions || [];
    setQ1(questions[0] || "");
    setQ2(questions[1] || "");
    setSaveStatus(null);
    setSaveError(null);
  };

  const populateSkillGraph = (node: AdminNodeItem) => {
    setSgName(node.name);
    setSgDesc(node.description || "");
    setSgPrereqs((node.prerequisite_ids || []).join(", "));
    setSaveStatus(null);
    setSaveError(null);
    setCycleDetected(false);
  };

  useEffect(() => {
    let isMounted = true;

    async function loadNodes() {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/admin/lessons");
        const json = await r.json();
        if (!isMounted) return;
        if (json.nodes && json.nodes.length > 0) {
          setNodes(json.nodes);
          const first = json.nodes[0];
          setSelectedNodeId(first.id);
          populateLesson(first);
          populateSkillGraph(first);
        }
      } catch (e) {
        if (isMounted) setError(String(e));
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadNodes();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectNode = (node: AdminNodeItem) => {
    setSelectedNodeId(node.id);
    populateLesson(node);
    populateSkillGraph(node);
  };

  const handleSaveNewVersion = async () => {
    if (!selectedNodeId || isSaving) return;
    setIsSaving(true);
    setSaveStatus(null);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill_node_id: selectedNodeId,
          title: title.trim(),
          content_markdown: contentMarkdown.trim(),
          code_example: codeExample.trim(),
          discussion_questions: [q1, q2].filter((q) => q.trim()),
        }),
      });
      const json = await res.json();
      if (json.success && json.version) {
        setSaveStatus(`Saved Version ${json.version}`);
        setNodes((prev) =>
          prev.map((n) =>
            n.id === selectedNodeId
              ? {
                  ...n,
                  current_version: json.version,
                  latest_lesson: { ...n.latest_lesson, version: json.version, title: title.trim() },
                  all_versions: [{ version: json.version, title: title.trim() }, ...n.all_versions],
                }
              : n,
          ),
        );
      } else {
        setSaveError(json.error || "Save failed");
      }
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSkillGraph = async () => {
    if (!selectedNodeId || isSaving) return;
    setIsSaving(true);
    setSaveStatus(null);
    setSaveError(null);
    setCycleDetected(false);

    const prereqIds = sgPrereqs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/admin/skill-nodes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedNodeId,
          name: sgName.trim(),
          description: sgDesc.trim(),
          prerequisite_ids: prereqIds,
        }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        setSaveStatus("Skill node metadata saved");
        setNodes((prev) =>
          prev.map((n) =>
            n.id === selectedNodeId
              ? { ...n, name: json.data.name, description: json.data.description, prerequisite_ids: json.data.prerequisite_ids }
              : n,
          ),
        );
      } else if (json.error?.includes("Cycle")) {
        setCycleDetected(true);
        setSaveError("Cycle detected — this prerequisite arrangement would create a dependency loop in the skill graph.");
      } else {
        setSaveError(json.error || "Update failed");
      }
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const filteredNodes = nodes.filter(
    (n) =>
      n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.category.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-observatory-base"
        role="status"
        aria-live="polite"
        aria-label="Loading skill nodes"
      >
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-telemetry-cyan border-t-transparent" />
      </div>
    );
  }

  if (error || nodes.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-observatory-base text-steel-100 px-4">
        <div className="rounded-2xl border border-steel-800 bg-observatory-panel p-8 text-center max-w-sm">
          <h2 className="text-vulnerability-crimson font-semibold">Load Error</h2>
          <p className="text-xs text-steel-300 mt-2">{error || "No skill nodes found."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-observatory-base text-steel-100">
      <header className="border-b border-steel-800 px-4 sm:px-8 py-5 bg-observatory-base/90 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-calibrated-amber">Admin</span>
            <h1 className="text-xl font-bold text-white mt-0.5">Content Management</h1>
          </div>
          <Link href="/dashboard" className="text-xs text-steel-400 hover:text-steel-300 transition rounded px-1">
            ← Back to app
          </Link>
        </div>

        {/* Page-level tab switcher */}
        <div
          role="tablist"
          aria-label="Content management sections"
          className="flex gap-1 mt-4 bg-observatory-panel rounded-xl p-1 border border-steel-800 w-fit"
        >
          {(["lessons", "skill-graph"] as PageTab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={pageTab === t}
              onClick={() => setPageTab(t)}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold capitalize transition ${
                pageTab === t ? "bg-telemetry-cyan text-observatory-base" : "text-steel-400 hover:text-steel-200"
              }`}
            >
              {t === "lessons" ? "📝 Lesson Content" : "🕸 Skill Graph"}
            </button>
          ))}
        </div>
      </header>

      <main className="p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(100vh-200px)]">
          {/* Sidebar */}
          <div className="flex flex-col rounded-3xl border border-steel-800 bg-observatory-panel/60 p-5 lg:overflow-hidden">
            <label htmlFor="admin-content-search" className="sr-only">
              Search skill nodes
            </label>
            <input
              id="admin-content-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search skill nodes…"
              className="mb-3 w-full rounded-xl border border-steel-800 bg-observatory-base px-3 py-2 text-xs text-white placeholder-steel-400 transition duration-200 focus:border-telemetry-cyan focus:outline-none focus:ring-1 focus:ring-telemetry-cyan"
            />
            <div
              className="flex flex-col gap-1.5 pr-1 max-h-80 lg:max-h-none lg:flex-1 lg:overflow-y-auto"
              role="listbox"
              aria-label="Skill nodes"
            >
              {filteredNodes.map((n) => {
                const isSelected = n.id === selectedNodeId;
                return (
                  <button
                    key={n.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectNode(n)}
                    className={`flex flex-col text-left p-3 rounded-xl border transition ${
                      isSelected
                        ? "border-telemetry-cyan/80 bg-telemetry-cyan/10 text-white"
                        : "border-steel-800 bg-observatory-base/60 text-steel-300 hover:bg-observatory-hover"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-telemetry-cyan uppercase">{n.category}</span>
                      <span className="rounded-full bg-steel-800 px-2 py-0.5 font-mono text-[10px] text-steel-300">
                        v{n.current_version}
                      </span>
                    </div>
                    <span className="text-xs font-semibold mt-0.5 line-clamp-1">{n.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Editor panel */}
          <div className="lg:col-span-2 flex flex-col rounded-3xl border border-steel-800 bg-observatory-panel p-4 sm:p-6 lg:overflow-hidden">
            {selectedNode ? (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap border-b border-steel-800 pb-4 mb-4">
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase text-telemetry-cyan">{selectedNode.category}</span>
                    <h2 className="text-base font-bold text-white">{selectedNode.name}</h2>
                  </div>

                  {pageTab === "lessons" && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <div
                        role="tablist"
                        aria-label="Lesson editor view"
                        className="flex rounded-xl bg-observatory-base p-1 border border-steel-800 text-xs"
                      >
                        {(["editor", "preview"] as const).map((t) => (
                          <button
                            key={t}
                            role="tab"
                            aria-selected={lessonTab === t}
                            onClick={() => setLessonTab(t)}
                            className={`rounded-lg px-3 py-1.5 font-medium transition ${
                              lessonTab === t ? "bg-telemetry-cyan text-observatory-base" : "text-steel-400 hover:text-steel-200"
                            }`}
                          >
                            {t === "editor" ? "✏️ Editor" : "👁️ Preview"}
                          </button>
                        ))}
                      </div>
                      <Button size="sm" variant="secondary" onClick={handleSaveNewVersion} disabled={isSaving || !title.trim()} loading={isSaving}>
                        {isSaving ? "Saving…" : `Save v${selectedNode.current_version + 1} →`}
                      </Button>
                    </div>
                  )}

                  {pageTab === "skill-graph" && (
                    <Button size="sm" onClick={handleSaveSkillGraph} disabled={isSaving} loading={isSaving}>
                      {isSaving ? "Saving…" : "Save Node Metadata →"}
                    </Button>
                  )}
                </div>

                {/* Status / error banners */}
                {saveStatus && (
                  <div
                    role="status"
                    className="mb-4 rounded-xl border border-precision-emerald/40 bg-precision-emerald/10 px-4 py-2 text-xs text-precision-emerald font-medium"
                  >
                    ✓ {saveStatus}
                  </div>
                )}
                {saveError && (
                  <div
                    role="alert"
                    className="mb-4 rounded-xl border border-vulnerability-crimson/40 bg-vulnerability-crimson/10 px-4 py-2 text-xs text-vulnerability-crimson"
                  >
                    {cycleDetected ? (
                      <div>
                        <p className="font-bold">⚠ Cycle Detected — Save Rejected</p>
                        <p className="mt-1 opacity-80">{saveError}</p>
                      </div>
                    ) : (
                      saveError
                    )}
                  </div>
                )}

                <div className="flex-1 lg:overflow-y-auto pr-1">
                  {/* LESSON TAB */}
                  {pageTab === "lessons" && lessonTab === "editor" && (
                    <div className="flex flex-col gap-5">
                      <Input label="Lesson Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                      <div>
                        <label htmlFor="admin-content-markdown" className="block text-xs font-mono font-semibold text-steel-300 mb-1.5">
                          Content Markdown
                        </label>
                        <textarea
                          id="admin-content-markdown"
                          rows={10}
                          value={contentMarkdown}
                          onChange={(e) => setContentMarkdown(e.target.value)}
                          className={`${textareaStyles} font-mono`}
                        />
                      </div>
                      <div>
                        <label htmlFor="admin-content-code" className="block text-xs font-mono font-semibold text-steel-300 mb-1.5">
                          Worked Code Snippet
                        </label>
                        <textarea
                          id="admin-content-code"
                          rows={6}
                          value={codeExample}
                          onChange={(e) => setCodeExample(e.target.value)}
                          className={`${textareaStyles} font-mono text-precision-emerald`}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input label="Discussion Q1" value={q1} onChange={(e) => setQ1(e.target.value)} />
                        <Input label="Discussion Q2" value={q2} onChange={(e) => setQ2(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {pageTab === "lessons" && lessonTab === "preview" && (
                    <div className="rounded-2xl border border-steel-800 bg-observatory-base p-4 sm:p-6 flex flex-col gap-5">
                      <div>
                        <span className="text-[10px] font-mono font-bold uppercase text-telemetry-cyan">{selectedNode.category}</span>
                        <h3 className="text-2xl font-extrabold text-white mt-1">{title}</h3>
                      </div>
                      <div className="whitespace-pre-wrap text-sm text-steel-200 leading-relaxed">{contentMarkdown}</div>
                      {codeExample && (
                        <div className="rounded-xl border border-steel-800 bg-observatory-panel p-4 font-mono text-xs text-precision-emerald overflow-x-auto">
                          <pre>{codeExample}</pre>
                        </div>
                      )}
                      {(q1 || q2) && (
                        <div className="rounded-xl border border-telemetry-cyan/20 bg-telemetry-cyan/5 p-4 text-xs">
                          <h4 className="font-bold text-telemetry-cyan">Discussion Questions:</h4>
                          <ul className="mt-2 flex flex-col gap-1 list-disc pl-4 text-steel-300">
                            {q1 && <li>{q1}</li>}
                            {q2 && <li>{q2}</li>}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SKILL GRAPH TAB */}
                  {pageTab === "skill-graph" && (
                    <div className="flex flex-col gap-5">
                      <Input label="Node Name" value={sgName} onChange={(e) => setSgName(e.target.value)} />
                      <div>
                        <label htmlFor="admin-sg-desc" className="block text-xs font-mono font-semibold text-steel-300 mb-1.5">
                          Description
                        </label>
                        <textarea
                          id="admin-sg-desc"
                          rows={4}
                          value={sgDesc}
                          onChange={(e) => setSgDesc(e.target.value)}
                          className={textareaStyles}
                        />
                      </div>
                      <Input
                        label="Prerequisite Node IDs"
                        helperText="⚠ If saving this change would create a dependency cycle, the API will reject it and show a cycle-detection warning above."
                        value={sgPrereqs}
                        onChange={(e) => setSgPrereqs(e.target.value)}
                        placeholder="uuid1, uuid2, …"
                        className="font-mono"
                      />

                      {/* Reference: all nodes */}
                      <div className="rounded-2xl border border-steel-800 bg-observatory-base p-4">
                        <p className="text-[10px] font-mono font-bold uppercase text-steel-400 mb-2">Available Node IDs (for reference)</p>
                        <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                          {nodes.map((n) => (
                            <div key={n.id} className="flex items-center justify-between gap-2 text-[11px] py-0.5">
                              <span className="text-steel-300 truncate max-w-[55%]">{n.name}</span>
                              <span className="font-mono text-steel-400 text-[10px] truncate">{n.id}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-steel-400 text-xs py-12">
                Select a skill node from the sidebar to edit.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
