"use client";

import React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: string;
  badgeText?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon = "⚡",
  badgeText = "Awaiting Action",
  action,
  secondaryAction,
  className = "",
}: EmptyStateProps) {
  return (
    <Card
      variant="glow"
      padding="lg"
      className={`text-center flex flex-col items-center justify-center py-12 px-6 max-w-lg mx-auto ${className}`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-telemetry-cyan/40 bg-telemetry-cyan/10 text-2xl text-telemetry-cyan mb-4 shadow-telemetry-cyan">
        {icon}
      </div>

      {badgeText && (
        <Badge variant="info" className="mb-2">
          {badgeText}
        </Badge>
      )}

      <h3 className="text-lg font-bold text-white font-mono">{title}</h3>
      <p className="text-xs font-sans text-steel-300 leading-relaxed mt-1.5 max-w-md">
        {description}
      </p>

      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto font-mono text-xs">
          {action && (
            action.href ? (
              <Link
                href={action.href}
                className="w-full sm:w-auto rounded-xl bg-telemetry-cyan px-6 py-3 font-mono text-xs font-bold text-observatory-base shadow-telemetry-cyan hover:bg-white transition text-center"
              >
                {action.label}
              </Link>
            ) : (
              <Button variant="primary" size="md" onClick={action.onClick} className="w-full sm:w-auto">
                {action.label}
              </Button>
            )
          )}

          {secondaryAction && (
            secondaryAction.href ? (
              <Link
                href={secondaryAction.href}
                className="w-full sm:w-auto rounded-xl border border-steel-800 bg-observatory-base px-5 py-3 font-mono text-xs font-bold text-steel-300 hover:border-telemetry-cyan hover:text-white transition text-center"
              >
                {secondaryAction.label}
              </Link>
            ) : (
              <Button variant="secondary" size="md" onClick={secondaryAction.onClick} className="w-full sm:w-auto">
                {secondaryAction.label}
              </Button>
            )
          )}
        </div>
      )}
    </Card>
  );
}
