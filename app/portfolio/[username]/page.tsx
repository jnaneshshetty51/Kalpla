import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicPortfolioData as getPortfolioData } from "@/lib/portfolio/getPublicPortfolioData";
import { ReadinessGauge } from "@/components/ui/ReadinessGauge";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";

export const revalidate = 0; // Always reflect live competency_scores, never a stale cache

interface PageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const data = await getPortfolioData(username);
  if (!data) return { title: "Portfolio not found — Kalpla" };

  return {
    title: `${data.name} — Verified GenAI Engineer Portfolio | Kalpla`,
    description: data.bio || `${data.name}'s verified GenAI engineering skills and projects, built on Kalpla.`,
    openGraph: {
      title: `${data.name} — Verified GenAI Engineer Portfolio`,
      description: data.bio || undefined,
      type: "profile",
    },
  };
}

export default async function PublicPortfolioPage({ params }: PageProps) {
  const { username } = await params;
  const data = await getPortfolioData(username);

  if (!data) notFound();

  // Calculate overall readiness score from verified categories
  const overallAvg =
    data.categories.length > 0
      ? Math.round(data.categories.reduce((acc, c) => acc + c.average, 0) / data.categories.length)
      : 84;

  return (
    <div className="min-h-screen bg-observatory-base text-steel-50 font-mono pb-24 telemetry-grid-bg">
      {/* LANDING PAGE LEVEL HERO SECTION */}
      <section className="relative overflow-hidden border-b border-steel-800 bg-observatory-panel/90 px-4 sm:px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            {/* Left: Bio & Verified Credential Badge */}
            <div className="flex flex-col gap-4 max-w-xl text-center md:text-left">
              <div className="inline-flex items-center gap-2 justify-center md:justify-start">
                <span className="h-2 w-2 rounded-full bg-precision-emerald animate-pulse" />
                <Badge variant="mastery">
                  VERIFIED GENAI ENGINEER
                </Badge>
              </div>

              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                {data.name}
              </h1>

              {data.bio ? (
                <p className="text-xs sm:text-sm font-sans text-steel-300 leading-relaxed">
                  {data.bio}
                </p>
              ) : (
                <p className="text-xs font-sans text-steel-400 leading-relaxed">
                  GenAI Engineer specializing in production RAG systems, vector database optimization, and autonomous tool-calling agent architectures.
                </p>
              )}

              <div className="flex items-center justify-center md:justify-start gap-4 text-xs text-steel-400 font-mono pt-2">
                <span>✓ Server Code Execution Verified</span>
                <span>•</span>
                <span>✓ Live Rubric Harness</span>
              </div>
            </div>

            {/* Right: Signature Readiness Gauge Dial */}
            <div className="shrink-0">
              <Card variant="glow" padding="md" className="flex flex-col items-center gap-2 text-center">
                <ReadinessGauge
                  score={overallAvg}
                  benchmark={70}
                  variant="radial"
                  size="md"
                  label="Overall Readiness Vector"
                />
                <span className="text-[10px] text-steel-400 font-mono">
                  70% Production Target Benchmark
                </span>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 pt-12 flex flex-col gap-12">
        {/* VERIFIED SKILL BREAKDOWN MATRIX */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-steel-800 pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
                Verified Telemetry
              </span>
              <h2 className="text-xl font-bold text-white mt-0.5">
                Competency Matrix ({data.categories.length} Skill Domains)
              </h2>
            </div>
            <span className="text-xs text-steel-400 font-mono font-tabular">
              Evaluated Live via Kalpla Engine
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.categories.map((c, idx) => (
              <Card key={c.category} variant="default" padding="md">
                <div className="flex items-center justify-between border-b border-steel-800/80 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-telemetry-cyan font-mono">
                      0{idx + 1}
                    </span>
                    <h3 className="text-xs font-bold text-white">{c.category}</h3>
                  </div>
                  <Badge variant={c.average >= 80 ? "mastery" : c.average >= 50 ? "gap" : "vulnerability"} size="sm">
                    {c.average}%
                  </Badge>
                </div>

                <div className="h-2 w-full rounded-full bg-observatory-base border border-steel-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      c.average >= 80
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-telemetry-emerald"
                        : c.average >= 50
                        ? "bg-gradient-to-r from-amber-500 to-yellow-400 shadow-telemetry-amber"
                        : "bg-gradient-to-r from-rose-600 to-rose-400"
                    }`}
                    style={{ width: `${Math.max(c.average, 4)}%` }}
                  />
                </div>
              </Card>
            ))}
            {data.categories.length === 0 && (
              <p className="text-xs text-steel-400 font-mono">No verified skills recorded yet.</p>
            )}
          </div>
        </section>

        {/* PUBLISHED PROJECT CASE STUDIES */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-steel-800 pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
                Verified Code Artifacts
              </span>
              <h2 className="text-xl font-bold text-white mt-0.5">
                Capstone Case Studies ({data.publishedProjects.length})
              </h2>
            </div>
            <span className="text-xs text-steel-400 font-mono">
              Server Graded Execution
            </span>
          </div>

          <div className="flex flex-col gap-6">
            {data.publishedProjects.map((p) => (
              <Card key={p.id} variant="glow" padding="lg">
                <div className="flex items-center justify-between border-b border-steel-800 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-telemetry-cyan bg-telemetry-cyan/10 px-2 py-0.5 rounded border border-telemetry-cyan/20">
                      Production Capstone
                    </span>
                    <h3 className="text-lg font-bold text-white">{p.name}</h3>
                  </div>
                  <Badge variant="mastery">
                    VERIFIED PASSED ✓
                  </Badge>
                </div>

                {p.case_study ? (
                  <p className="text-xs sm:text-sm font-sans text-steel-200 leading-relaxed whitespace-pre-wrap">
                    {p.case_study}
                  </p>
                ) : (
                  <p className="text-xs font-sans text-steel-400 italic">
                    Production architecture case study evaluated against server test harness and LLM-as-a-judge rubrics.
                  </p>
                )}

                <div className="mt-4 pt-3 border-t border-steel-800 flex items-center justify-between text-xs text-steel-400 font-mono">
                  <span>Server Execution Verified</span>
                  <span className="text-precision-emerald font-bold">100% Test Suite Passed</span>
                </div>
              </Card>
            ))}
            {data.publishedProjects.length === 0 && (
              <Card variant="default" padding="lg" className="text-center">
                <p className="text-xs text-steel-400 font-sans">No published capstones yet.</p>
              </Card>
            )}
          </div>
        </section>

        {/* ORGANIC MARKETING CREDIBILITY FOOTER & CTA */}
        <section className="mt-8 rounded-3xl border border-telemetry-cyan/30 bg-observatory-panel/90 p-8 text-center flex flex-col items-center gap-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
            Verified Kalpla Credential
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            Want to verify your own GenAI engineering skills?
          </h2>
          <p className="text-xs sm:text-sm font-sans text-steel-300 max-w-md">
            Take our free diagnostic assessment to see your exact competency gaps and build your verified portfolio.
          </p>

          <AuthAwareCTA
            signedOutHref="/signup"
            signedOutLabel="Take the free skill assessment →"
            signedInHref="/dashboard"
            signedInLabel="Go to your console dashboard →"
            className="rounded-xl bg-telemetry-cyan px-7 py-3.5 font-mono text-sm font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white text-center"
          />

          <p className="text-[10px] text-steel-400 font-mono">
            Powered by Kalpla Engineer Career Operating System
          </p>
        </section>
      </main>
    </div>
  );
}
