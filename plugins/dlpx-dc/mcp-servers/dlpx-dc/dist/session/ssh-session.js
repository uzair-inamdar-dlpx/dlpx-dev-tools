import { Client } from "ssh2";
import { shellQuote } from "../util/shell-quote.js";
export class SshSession {
    opts;
    client;
    constructor(opts) {
        this.opts = opts;
    }
    connect() {
        if (this.client)
            return Promise.resolve(this.client);
        return new Promise((resolve, reject) => {
            const c = new Client();
            c.on("ready", () => {
                this.client = c;
                resolve(c);
            });
            c.on("close", () => {
                this.client = undefined;
            });
            c.on("error", (err) => reject(err));
            c.connect({
                host: this.opts.host,
                username: this.opts.username,
                password: this.opts.password,
                keepaliveInterval: this.opts.keepaliveIntervalSec * 1000,
                readyTimeout: 20_000,
            });
        });
    }
    async run(argv) {
        const client = await this.connect();
        const command = shellQuote(argv);
        return new Promise((resolve, reject) => {
            client.exec(command, (err, stream) => {
                if (err)
                    return reject(err);
                let stdout = "";
                let stderr = "";
                let code = 0;
                const timer = setTimeout(() => {
                    stream.close();
                    reject(new Error(`command timed out after ${this.opts.commandTimeoutSec}s: ${command}`));
                }, this.opts.commandTimeoutSec * 1000);
                stream.on("close", (exit) => {
                    clearTimeout(timer);
                    resolve({ stdout, stderr, code: exit ?? code });
                });
                stream.on("data", (d) => { stdout += d.toString("utf8"); });
                stream.stderr.on("data", (d) => { stderr += d.toString("utf8"); });
                stream.on("exit", (exit) => { code = exit; });
            });
        });
    }
    async close() {
        if (this.client) {
            this.client.end();
            this.client = undefined;
        }
    }
}
//# sourceMappingURL=ssh-session.js.map