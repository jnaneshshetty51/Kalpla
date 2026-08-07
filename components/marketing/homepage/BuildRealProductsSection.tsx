import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

// The 3 real capstone/ladder projects (supabase/migrations/20260806013324_seed_ladder_projects.sql)
// — not the illustrative 8-project list, none of which exist on the
// platform. No scores shown: no student has completed these yet, so a
// fabricated score badge would be dishonest.
const PROJECTS = [
  {
    name: "Prompt Playground",
    tier: "free" as const,
    type: "Prompt Engineering",
    summary:
      "Build a small tool that reliably extracts structured JSON output from unstructured text using prompt engineering — handling malformed input and markdown-wrapped responses without crashing.",
  },
  {
    name: "RAG Chatbot",
    tier: "pro" as const,
    type: "Retrieval-Augmented Generation",
    summary:
      "Build a document-grounded chatbot: chunk and embed a document into a real pgvector-backed store, retrieve the most relevant chunks, and generate an answer grounded only in that context.",
  },
  {
    name: "Tool-Using Agent",
    tier: "pro" as const,
    type: "Agentic Systems",
    summary:
      "Build a multi-step agent that calls at least two distinct tools — a calculator and a search function — and correctly plans which one to use based on the user's query.",
  },
];

export function BuildRealProductsSection() {
  return (
    <section className="px-4 sm:px-6 py-20 border-b border-steel-800 bg-observatory-base">
      <div className="mx-auto max-w-6xl">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="font-mono text-xs font-bold text-telemetry-cyan uppercase tracking-widest">
            Build Real Products
          </span>
          <h2 className="text-2xl sm:text-3xl font-mono font-bold text-white mt-2">
            Three real, reviewed projects — not toy exercises
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PROJECTS.map((proj) => (
            <Card key={proj.name} title={proj.name} subtitle={proj.type}>
              <p className="font-sans text-xs text-steel-300 leading-relaxed mb-4">{proj.summary}</p>
              <div className="pt-3 border-t border-steel-800/80">
                <Badge variant={proj.tier === "free" ? "mastery" : "info"} size="sm">
                  {proj.tier === "free" ? "Free tier" : "Included in Accelerator"}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
