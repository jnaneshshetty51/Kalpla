"use client";

import React from "react";

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  variant?: "default" | "bordered" | "glow";
  padding?: "none" | "sm" | "md" | "lg";
}

export function Card({
  children,
  title,
  subtitle,
  action,
  variant = "default",
  padding = "md",
  className = "",
  ...props
}: CardProps) {
  const variantStyles = {
    default: "bg-observatory-panel border border-steel-800",
    bordered: "bg-observatory-base border border-steel-700",
    glow: "bg-observatory-panel border border-telemetry-cyan/40 telemetry-glow-cyan",
  };

  const paddingStyles = {
    none: "p-0",
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
  };

  return (
    <div
      className={`rounded-3xl transition-all duration-200 ${variantStyles[variant]} ${paddingStyles[padding]} ${className}`}
      {...props}
    >
      {(title || subtitle || action) && (
        <div className="flex items-start justify-between gap-4 mb-4 border-b border-steel-800/80 pb-3">
          <div>
            {title && (
              <h3 className="text-sm font-mono font-bold text-steel-50 flex items-center gap-2">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-steel-400 mt-0.5 font-sans leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
