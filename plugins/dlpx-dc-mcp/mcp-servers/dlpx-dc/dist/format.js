function block(label, body) {
    const trimmed = body.replace(/\n+$/, "");
    return `--- ${label} ---\n${trimmed.length ? trimmed : "(empty)"}`;
}
export function formatExecResult(r) {
    return `exit: ${r.code}\n${block("stdout", r.stdout)}\n${block("stderr", r.stderr)}`;
}
//# sourceMappingURL=format.js.map