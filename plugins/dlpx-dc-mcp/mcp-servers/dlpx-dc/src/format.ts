import type { ExecResult } from "./session/exec.js";

function block(label: string, body: string): string {
  const trimmed = body.replace(/\n+$/, "");
  return `--- ${label} ---\n${trimmed.length ? trimmed : "(empty)"}`;
}

export function formatExecResult(r: ExecResult): string {
  return `exit: ${r.code}\n${block("stdout", r.stdout)}\n${block("stderr", r.stderr)}`;
}
