"use client";

import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "mastery" | "gap" | "vulnerability" | "info" | "neutral";
  size?: "sm" | "md";
  dot?: boolean;
}

export function Badge({
  children,
  variant = "neutral",
  size = "md",
  dot = true,
  className = "",
  ...props
}: BadgeProps) {
  const variantStyles = {
    mastery: "bg-precision-emerald/10 text-precision-emerald border-precision-emerald/30",
    gap: "bg-calibrated-amber/10 text-calibrated-amber border-calibrated-amber/30",
    vulnerability: "bg-vulnerability-crimson/10 text-vulnerability-crimson border-vulnerability-crimson/30",
    info: "bg-telemetry-cyan/10 text-telemetry-cyan border-telemetry-cyan/30",
    neutral: "bg-steel-800/50 text-steel-300 border-steel-700/60",
  };

  const dotColors = {
    mastery: "bg-precision-emerald",
    gap: "bg-calibrated-amber",
    vulnerability: "bg-vulnerability-crimson",
    info: "bg-telemetry-cyan",
    neutral: "bg-steel-400",
  };

  const sizes = {
    sm: "px-2 py-0.5 text-[10px] gap-1",
    md: "px-2.5 py-1 text-[11px] gap-1.5",
  };

  return (
    <span
      className={`inline-flex items-center font-mono font-semibold rounded-full border ${variantStyles[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {dot && (
        <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${dotColors[variant]}`} />
      )}
      <span>{children}</span>
    </span>
  );
}
