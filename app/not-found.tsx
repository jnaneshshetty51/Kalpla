import { EmptyState } from "@/components/ui/EmptyState";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono telemetry-grid-bg">
      <EmptyState
        icon="🛰️"
        badgeText="404"
        title="This route doesn't exist"
        description="The page you're looking for was moved, renamed, or never existed. Double-check the link, or head back to a page that does."
        action={{ label: "← Back to Dashboard", href: "/dashboard" }}
        secondaryAction={{ label: "Go to Homepage", href: "/" }}
      />
    </div>
  );
}
