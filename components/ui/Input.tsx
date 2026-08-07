"use client";

import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error, leftIcon, rightIcon, className = "", id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="text-xs font-mono font-semibold text-steel-300">
            {label}
          </label>
        )}

        <div className="relative flex items-center w-full">
          {leftIcon && (
            <div className="absolute left-3 text-steel-400 pointer-events-none flex items-center justify-center">
              {leftIcon}
            </div>
          )}

          <input
            id={inputId}
            ref={ref}
            className={`w-full rounded-xl border bg-observatory-panel text-xs font-mono text-steel-50 placeholder-steel-400 transition duration-200 focus:outline-none focus:ring-1 ${
              error
                ? "border-vulnerability-crimson focus:border-vulnerability-crimson focus:ring-vulnerability-crimson"
                : "border-steel-800 focus:border-telemetry-cyan focus:ring-telemetry-cyan"
            } ${leftIcon ? "pl-9" : "px-3.5"} ${rightIcon ? "pr-9" : "py-2.5"} ${className}`}
            {...props}
          />

          {rightIcon && (
            <div className="absolute right-3 text-steel-400 pointer-events-none flex items-center justify-center">
              {rightIcon}
            </div>
          )}
        </div>

        {error ? (
          <span className="text-[11px] font-mono text-vulnerability-crimson">{error}</span>
        ) : helperText ? (
          <span className="text-[11px] font-mono text-steel-400">{helperText}</span>
        ) : null}
      </div>
    );
  },
);

Input.displayName = "Input";
