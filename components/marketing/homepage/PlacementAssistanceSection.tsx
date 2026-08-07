import { Card } from "@/components/ui/Card";

// Adapted near-verbatim from docs/pilot-launch/legal/04-marketing-copy-pilot-cohort.md
// Section 2 "Placement assistance" — the ASCI/Consumer-Protection-Act
// compliance-vetted list. Deliberately narrower than a generic wishlist:
// "interview scheduling" is folded into referrals, "hiring events" and
// "career coaching" are omitted as standalone claims since neither is a
// confirmed real deliverable. Do not add items here without updating that
// document's claims register first.
const SERVICES = [
  { title: "Resume & LinkedIn Review", description: "One-on-one review with a human mentor." },
  { title: "Portfolio & GitHub Review", description: "Feedback on how your published work reads to a hiring manager." },
  { title: "2 Live Mock Interviews", description: "Real conversations with a human mentor, with detailed feedback — not an automated feature." },
  { title: "Employer Referrals", description: "Introductions where we have them." },
];

export function PlacementAssistanceSection() {
  return (
    <section className="px-4 sm:px-6 py-20 border-b border-steel-800 bg-observatory-panel/30">
      <div className="mx-auto max-w-5xl">
        <div className="text-center max-w-2xl mx-auto mb-4">
          <span className="font-mono text-xs font-bold text-telemetry-cyan uppercase tracking-widest">
            Placement Assistance
          </span>
          <h2 className="text-2xl sm:text-3xl font-mono font-bold text-white mt-2">
            We help you get hired. We don&apos;t guarantee it.
          </h2>
          <p className="text-sm text-steel-400 font-sans mt-3 leading-relaxed">
            What we do provide, concretely:
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
          {SERVICES.map((s) => (
            <Card key={s.title} padding="sm">
              <h3 className="font-mono text-sm font-bold text-white">{s.title}</h3>
              <p className="mt-1 font-sans text-xs text-steel-400 leading-relaxed">{s.description}</p>
            </Card>
          ))}
        </div>

        <p className="text-center text-xs text-steel-500 font-sans mt-8 max-w-xl mx-auto leading-relaxed">
          This is our first cohort, so we don&apos;t have placement statistics to show you yet — we&apos;ll publish real, honestly-reported outcomes starting with future cohorts.
        </p>
      </div>
    </section>
  );
}
