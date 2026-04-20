const SAFE = /^[A-Za-z0-9_\-.,:=/@+]+$/;
export function shellQuote(argv) {
    return argv
        .map((a) => {
        if (a.length === 0)
            return "''";
        if (SAFE.test(a))
            return a;
        return `'${a.replace(/'/g, `'\\''`)}'`;
    })
        .join(" ");
}
//# sourceMappingURL=shell-quote.js.map