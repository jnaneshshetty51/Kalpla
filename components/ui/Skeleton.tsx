"use client";

import React from "react";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/**
 * Primitive skeleton block that respects reduced-motion preferences.
 */
export function Skeleton({ className = "", ...props }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse motion-reduce:animate-none rounded-xl bg-steel-800/60 ${className}`}
      {...props}
    />
  );
}

/**
 * Honest AI generation loading component with specific progress copy.
 */
export function AILoadingState({
  title = "Synthesizing Telemetry Matrix",
  subtitle = "AI Engine is analyzing system parameters…",
  icon = "⚡",
}: {
  title?: string;
  subtitle?: string;
  icon?: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono telemetry-grid-bg">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="relative mb-6">
          <div className="h-14 w-14 animate-spin motion-reduce:animate-none rounded-full border-4 border-telemetry-cyan border-t-transparent shadow-telemetry-cyan" />
          <div className="absolute inset-0 flex items-center justify-center text-xl">
            {icon}
          </div>
        </div>

        <h3 className="text-base font-bold text-white font-mono">{title}</h3>
        <p className="text-xs font-sans text-steel-400 mt-1.5 leading-relaxed">
          {subtitle}
        </p>

        <div className="mt-6 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-telemetry-cyan animate-pulse motion-reduce:animate-none" />
          <span className="h-1.5 w-1.5 rounded-full bg-telemetry-cyan animate-pulse motion-reduce:animate-none delay-150" />
          <span className="h-1.5 w-1.5 rounded-full bg-telemetry-cyan animate-pulse motion-reduce:animate-none delay-300" />
        </div>
      </div>
    </div>
  );
}

/**
 * Dashboard skeleton screen layout matching actual dashboard cards.
 */
export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-observatory-base p-6 font-mono telemetry-grid-bg">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between border-b border-steel-800 pb-5 mb-8">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-10 w-44 rounded-xl" />
      </div>

      {/* Hero Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
        <div className="lg:col-span-8">
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
        <div className="lg:col-span-4">
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>

      {/* Grid List Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * Roadmap vertical timeline skeleton screen layout.
 */
export function RoadmapSkeleton() {
  return (
    <div className="min-h-screen bg-observatory-base p-6 font-mono max-w-4xl mx-auto telemetry-grid-bg">
      <div className="border-b border-steel-800 pb-5 mb-8 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-72" />
      </div>

      <div className="space-y-6">
        {[1, 2, 3].map((w) => (
          <div key={w} className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <div className="space-y-3 pl-4 border-l-2 border-steel-800">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Live sessions list skeleton screen layout.
 */
export function SessionsSkeleton() {
  return (
    <div className="min-h-screen bg-observatory-base p-6 font-mono max-w-3xl mx-auto telemetry-grid-bg">
      <div className="border-b border-steel-800 pb-5 mb-8 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * Admin high-density table skeleton screen.
 */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="w-full space-y-3 font-mono">
      <div className="flex justify-between border-b border-steel-800 pb-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  );
}
