/**
 * Pure buffer-capping logic used by the sandbox worker (Prompt 55) to stop
 * an accidental infinite print loop from growing stdout/stderr without
 * bound. Extracted from pyodide.worker.ts so it's directly unit-testable
 * (Prompt 60) without needing a real Worker/Pyodide environment.
 */
export const OUTPUT_BUFFER_CAP_CHARS = 50_000;

export interface TruncationFlag {
  value: boolean;
}

export function appendCapped(
  buffer: string,
  chunk: string,
  truncatedFlag: TruncationFlag,
  capChars: number = OUTPUT_BUFFER_CAP_CHARS,
): string {
  if (truncatedFlag.value) return buffer;
  const next = buffer + chunk;
  if (next.length > capChars) {
    truncatedFlag.value = true;
    return next.slice(0, capChars) + "\n[...output truncated: exceeded buffer cap...]";
  }
  return next;
}
