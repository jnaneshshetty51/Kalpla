"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

interface DraftProject {
  submission_id: string;
  project_id: string;
  project_name: string;
  code: string;
  case_study: string | null;
  is_published: boolean;
}

interface Portfolio {
  user_id: string;
  slug: string;
  is_public: boolean;
  bio: string | null;
  published_projects: string[];
}

export default function PortfolioEditorPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [draftProjects, setDraftProjects] = useState<DraftProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bio, setBio] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [caseStudyEdits, setCaseStudyEdits] = useState<Record<string, string>>({});
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const [slugInput, setSlugInput] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/portfolio");
      if (!res.ok) throw new Error(`Failed to load portfolio (${res.status})`);
      const json = await res.json();
      setPortfolio(json.portfolio);
      setDraftProjects(json.draft_projects);
      setBio(json.portfolio.bio || "");
      setSlugInput(json.portfolio.slug || "");
      setSelectedIds(new Set(json.portfolio.published_projects || []));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } flex: {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function loadOnMount() {
      try {
        const res = await fetch("/api/portfolio");
        if (!res.ok) throw new Error(`Failed to load portfolio (${res.status})`);
        const json = await res.json();
        if (!isMounted) return;
        setPortfolio(json.portfolio);
        setDraftProjects(json.draft_projects);
        setBio(json.portfolio.bio || "");
        setSlugInput(json.portfolio.slug || "");
        setSelectedIds(new Set(json.portfolio.published_projects || []));
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadOnMount();
    return () => {
      isMounted = false;
    };
  }, []);

  const toggleProject = (submissionId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(submissionId)) next.delete(submissionId);
      else next.add(submissionId);
      return next;
    });
  };

  const handleGenerateCaseStudy = async (submissionId: string, force: boolean) => {
    setGeneratingFor(submissionId);
    try {
      const res = await fetch("/api/portfolio/case-study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submissionId, force }),
      });
      if (res.ok) {
        const json = await res.json();
        setDraftProjects((prev) =>
          prev.map((p) =>
            p.submission_id === submissionId ? { ...p, case_study: json.case_study.summary } : p,
          ),
        );
      }
    } finally {
      setGeneratingFor(null);
    }
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch("/api/portfolio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bio,
          case_study_overrides: caseStudyEdits,
          published_projects: Array.from(selectedIds),
        }),
      });
      if (res.ok) {
        setSaveStatus("Draft saved.");
        await load();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublishToggle = async () => {
    if (!portfolio) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      if (portfolio.is_public) {
        const res = await fetch("/api/portfolio/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unpublish" }),
        });
        if (res.ok) await load();
      } else {
        await handleSaveDraft();
        const res = await fetch("/api/portfolio/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "publish", custom_slug: slugInput }),
        });
        if (res.ok) {
          await load();
        } else {
          const json = await res.json();
          setPublishError(json.error || "Failed to publish.");
        }
      }
    } finally {
      setIsPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono telemetry-grid-bg">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-telemetry-cyan border-t-transparent shadow-telemetry-cyan" />
          <div>
            <h2 className="text-sm font-bold text-white">Loading Portfolio Editor Console</h2>
            <p className="text-xs text-steel-400 font-sans mt-1">Fetching case studies &amp; publishing configuration…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !portfolio) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono">
        <Card variant="bordered" padding="lg" className="max-w-md text-center">
          <h2 className="text-lg font-bold text-vulnerability-crimson">Portfolio Editor Error</h2>
          <p className="mt-2 text-xs text-steel-400 font-sans leading-relaxed">{error || "Unable to load portfolio."}</p>
          <Button variant="primary" className="mt-6 w-full" onClick={() => window.location.reload()}>
            Retry Loading
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-observatory-base text-steel-50 font-mono pb-24 telemetry-grid-bg">
      {/* Top Header */}
      <header className="border-b border-steel-800 bg-observatory-panel/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6 py-5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
              Portfolio Console
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white mt-0.5">
              Private Portfolio Draft &amp; Publishing Settings
            </h1>
          </div>

          {portfolio.is_public && (
            <Link
              href={`/portfolio/${portfolio.slug}`}
              target="_blank"
              className="text-xs font-mono font-bold text-telemetry-cyan hover:underline flex items-center gap-1.5"
            >
              <span>View Live Public Page</span>
              <span>↗</span>
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 pt-8 flex flex-col gap-8">
        {/* SUBTLE SETTINGS BAR: Publish/Unpublish Toggle & Custom Slug Customization */}
        <Card variant="bordered" padding="md" className="bg-observatory-panel/90">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant={portfolio.is_public ? "mastery" : "neutral"}>
                  {portfolio.is_public ? "LIVE PUBLIC PAGE ✓" : "UNPUBLISHED DRAFT"}
                </Badge>
                <span className="text-xs text-steel-400 font-mono font-tabular">
                  kalpla.app/portfolio/{portfolio.slug}
                </span>
              </div>
              <p className="text-xs text-steel-400 font-sans mt-1">
                Customize your public URL slug and toggle page visibility.
              </p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {!portfolio.is_public && (
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="text-steel-400">slug:</span>
                  <input
                    type="text"
                    value={slugInput}
                    onChange={(e) => setSlugInput(e.target.value)}
                    className="w-36 rounded-xl border border-steel-800 bg-observatory-base px-3 py-1.5 text-xs text-white focus:border-telemetry-cyan focus:outline-none"
                  />
                </div>
              )}

              <Button
                variant={portfolio.is_public ? "danger" : "primary"}
                size="sm"
                onClick={handlePublishToggle}
                loading={isPublishing}
              >
                {isPublishing
                  ? "Updating…"
                  : portfolio.is_public
                  ? "Unpublish Page"
                  : "Publish Portfolio →"}
              </Button>
            </div>
          </div>
          {publishError && <p className="mt-2 text-xs text-vulnerability-crimson font-mono">{publishError}</p>}
        </Card>

        {/* EDITABLE BIO SECTION */}
        <Card variant="default" padding="md">
          <div className="flex items-center justify-between border-b border-steel-800 pb-2 mb-3">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              ✎ Engineer Bio (Editable Text)
            </span>
            <Badge variant="info" size="sm">Editable</Badge>
          </div>
          <textarea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short professional bio displayed at the top of your public engineering portfolio page..."
            className="w-full rounded-xl border border-steel-800 bg-observatory-base p-3.5 font-mono text-xs text-white placeholder-steel-400 focus:border-telemetry-cyan focus:outline-none"
          />
        </Card>

        {/* FIXED VERIFIED DATA INDICATOR (Live Competency Scores) */}
        <Card variant="bordered" padding="md" className="border-steel-800 bg-observatory-base/50">
          <div className="flex items-center justify-between border-b border-steel-800 pb-2 mb-2">
            <span className="text-xs font-bold text-steel-400 uppercase tracking-wider">
              🔒 Immutable Verified Competency Telemetry (Fixed Data)
            </span>
            <Badge variant="neutral" size="sm">Not Editable</Badge>
          </div>
          <p className="text-xs font-sans text-steel-400 leading-relaxed">
            Your 8-category competency score breakdown is calculated live from server execution rubrics and diagnostic evaluation. Scores cannot be manually overridden.
          </p>
        </Card>

        {/* AI-GENERATED BUT EDITABLE CASE STUDIES */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-steel-800 pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
                Published Capstones
              </span>
              <h2 className="text-lg font-bold text-white mt-0.5">
                Passing Project Case Studies ({draftProjects.length})
              </h2>
            </div>
            <span className="text-xs text-steel-400 font-mono">
              Check box to include on public portfolio
            </span>
          </div>

          {draftProjects.length === 0 && (
            <EmptyState
              icon="🚀"
              badgeText="No Capstones Completed Yet"
              title="Build Your First Capstone to Generate Your Portfolio"
              description="Complete any of the 3 production capstone projects (Prompt Engineering, RAG Knowledge Base, or Agent Swarm) on the Project Ladder to auto-generate verified case study artifacts."
              action={{
                label: "Explore Project Ladder →",
                href: "/projects",
              }}
            />
          )}

          <div className="flex flex-col gap-5">
            {draftProjects.map((p) => (
              <Card key={p.submission_id} variant="default" padding="lg">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-steel-800 pb-4 mb-4">
                  <label className="flex items-center gap-3 text-sm font-bold text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.submission_id)}
                      onChange={() => toggleProject(p.submission_id)}
                      className="h-4 w-4 rounded accent-telemetry-cyan"
                    />
                    <span>{p.project_name}</span>
                  </label>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleGenerateCaseStudy(p.submission_id, !!p.case_study)}
                    disabled={generatingFor === p.submission_id}
                    loading={generatingFor === p.submission_id}
                  >
                    {generatingFor === p.submission_id
                      ? "Generating Case Study…"
                      : p.case_study
                      ? "Regenerate AI Case Study ↺"
                      : "Generate AI Case Study ✨"}
                  </Button>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-steel-400 mb-2">
                  <span>✎ AI-Generated Case Study (Editable Text Field):</span>
                  <Badge variant="info" size="sm">Editable</Badge>
                </div>

                <textarea
                  rows={4}
                  value={caseStudyEdits[p.submission_id] ?? p.case_study ?? ""}
                  onChange={(e) =>
                    setCaseStudyEdits((prev) => ({ ...prev, [p.submission_id]: e.target.value }))
                  }
                  placeholder="Case study summary will appear here once generated — feel free to edit or refine your architectural narrative."
                  className="w-full rounded-xl border border-steel-800 bg-observatory-base p-3.5 font-mono text-xs text-steel-200 placeholder-steel-400 focus:border-telemetry-cyan focus:outline-none"
                />
              </Card>
            ))}
          </div>
        </section>

        {/* SAVE DRAFT ACTION */}
        <div className="flex items-center gap-4 pt-2">
          <Button
            variant="primary"
            onClick={handleSaveDraft}
            loading={isSaving}
            disabled={isSaving}
          >
            {isSaving ? "Saving Draft…" : "Save Portfolio Draft"}
          </Button>
          {saveStatus && <span className="text-xs font-mono text-precision-emerald font-bold">{saveStatus}</span>}
        </div>
      </main>
    </div>
  );
}
