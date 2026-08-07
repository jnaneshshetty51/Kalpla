"use client";
import RouteError from "@/components/RouteError";
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="bg-observatory-base text-steel-50">
        <RouteError error={error} reset={reset} title="Application Error" />
      </body>
    </html>
  );
}
