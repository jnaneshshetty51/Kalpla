/**
 * Shared route loading skeleton used by all route-segment loading.tsx files.
 * Matches the app's dark design system with animated pulse placeholders.
 */
export default function RouteLoading() {
  return (
    <div
      className="min-h-[60vh] flex flex-col items-center justify-center gap-6 px-6"
      role="status"
      aria-live="polite"
      aria-label="Loading page content"
    >
      <div className="flex flex-col gap-4 w-full max-w-2xl" aria-hidden="true">
        <div className="h-8 w-48 rounded-xl bg-steel-800 animate-pulse" />
        <div className="h-4 w-full rounded-lg bg-steel-800/70 animate-pulse" />
        <div className="h-4 w-5/6 rounded-lg bg-steel-800/70 animate-pulse" />
        <div className="h-4 w-4/6 rounded-lg bg-steel-800/70 animate-pulse" />
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="h-32 rounded-2xl bg-steel-800/60 animate-pulse" />
          <div className="h-32 rounded-2xl bg-steel-800/60 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
