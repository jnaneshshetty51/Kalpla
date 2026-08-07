import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CURRICULUM_NODE_COUNT } from "@/lib/marketing/acceleratorFacts";

// Real 8 categories from supabase/migrations/20260805090822_seed_skill_nodes.sql
// (3+3+3+5+3+3+3+3 = 26 nodes) — not the illustrative module list, which
// doesn't match the real skill graph (no separate "Python Foundations" or
// "Git & Linux" categories exist; RAG lives inside Embeddings & Retrieval).
const MODULES = [
  { name: "LLM Fundamentals", nodeCount: 3 },
  { name: "Prompt Engineering", nodeCount: 3 },
  { name: "API Integration", nodeCount: 3 },
  { name: "Embeddings & Retrieval", nodeCount: 5 },
  { name: "Agentic Systems", nodeCount: 3 },
  { name: "Evaluation", nodeCount: 3 },
  { name: "Fine-Tuning Basics", nodeCount: 3 },
  { name: "Deployment", nodeCount: 3 },
];

export function CurriculumPreviewSection() {
  return (
    <section id="curriculum" className="px-4 sm:px-6 py-20 border-b border-steel-800 bg-observatory-base scroll-mt-20">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <span className="font-mono text-xs font-bold text-telemetry-cyan uppercase tracking-widest">
            Curriculum
          </span>
          <h2 className="text-2xl sm:text-3xl font-mono font-bold text-white mt-2">
            {CURRICULUM_NODE_COUNT} skills across 8 modules, then a real capstone
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {MODULES.map((mod, i) => (
            <Card key={mod.name} padding="sm" className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-steel-500">M{i + 1}</span>
                <span className="font-mono text-sm font-semibold text-white">{mod.name}</span>
              </div>
              <Badge variant="neutral" size="sm" dot={false}>{mod.nodeCount} skills</Badge>
            </Card>
          ))}

          <Card padding="sm" variant="glow" className="flex items-center justify-between sm:col-span-2 md:col-span-1">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold text-telemetry-cyan">M9</span>
              <span className="font-mono text-sm font-semibold text-telemetry-cyan">Capstone</span>
            </div>
            <Badge variant="info" size="sm" dot={false}>3 real projects</Badge>
          </Card>
        </div>
      </div>
    </section>
  );
}
