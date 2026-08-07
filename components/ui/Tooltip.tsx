"use client";

import React, { useState } from "react";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  shortcut?: string;
}

export function Tooltip({
  content,
  children,
  position = "top",
  shortcut,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);

  const positionClasses = {
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
    right: "left-full ml-2 top-1/2 -translate-y-1/2",
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={`absolute z-50 pointer-events-none flex items-center gap-2 whitespace-nowrap rounded-lg border border-steel-700 bg-observatory-base px-2.5 py-1.5 font-mono text-[11px] text-steel-200 shadow-xl backdrop-blur-md transition-opacity duration-150 ${positionClasses[position]}`}
        >
          <span>{content}</span>
          {shortcut && (
            <kbd className="rounded border border-steel-800 bg-steel-900 px-1 py-0.5 text-[9px] text-steel-400">
              {shortcut}
            </kbd>
          )}
        </div>
      )}
    </div>
  );
}
