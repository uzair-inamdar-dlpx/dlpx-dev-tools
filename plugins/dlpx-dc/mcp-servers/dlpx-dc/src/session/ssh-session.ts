import {
  Client,
  type ClientChannel,
  type AnyAuthMethod,
  type AuthenticationType,
  type NextAuthHandler,
} from "ssh2";
import type { AuthMode } from "../config.js";
import { shellQuote } from "../util/shell-quote.js";
import type { ExecResult, SshExec } from "./exec.js";

export interface SshSessionOptions {
  host: string;
  username: string;
  /**
   * Path to the ssh-agent socket (typically `process.env.SSH_AUTH_SOCK`).
   * When set, publickey auth via the agent can be tried (subject to mode).
   */
  agentSocket?: string;
  /**
   * Lazy password provider. Only invoked if agent auth is unavailable or
   * rejected by the server — this is what keeps users off the elicitation
   * prompt when their agent is already authorized.
   */
  password?: () => Promise<string>;
  /**
   * Returns the auth mode to use on the NEXT connect(). Read lazily so that
   * `dlpx_set_auth` can mutate the mode after construction and have the
   * change take effect on reconnection (SessionManager.closeAll handles that).
   * Defaults to "auto" when omitted.
   */
  getMode?: () => AuthMode;
  keepaliveIntervalSec: number;
  commandTimeoutSec: number;
}

// ssh2's authHandler accepts `false` to stop auth, but @types/ssh2 omits it.
const stopAuth = (next: NextAuthHandler): void =>
  (next as unknown as (stop: false) => void)(false);

export class SshSession implements SshExec {
  private client?: Client;

  constructor(private readonly opts: SshSessionOptions) {}

  private connect(): Promise<Client> {
    if (this.client) return Promise.resolve(this.client);
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
        keepaliveInterval: this.opts.keepaliveIntervalSec * 1000,
        readyTimeout: 20_000,
        authHandler: this.makeAuthHandler(),
      });
    });
  }

  private makeAuthHandler() {
    const { username, agentSocket, password, getMode } = this.opts;
    let agentTried = false;
    let passwordTried = false;
    return (
      _authsLeft: AuthenticationType[] | null,
      _partialSuccess: boolean | null,
      next: NextAuthHandler,
    ): void => {
      const mode: AuthMode = getMode ? getMode() : "auto";
      const agentAllowed = mode === "auto" || mode === "agent";
      const passwordAllowed = mode === "auto" || mode === "password";

      if (agentAllowed && !agentTried && agentSocket) {
        agentTried = true;
        const method: AnyAuthMethod = {
          type: "agent",
          username,
          agent: agentSocket,
        };
        next(method);
        return;
      }
      if (passwordAllowed && !passwordTried && password) {
        passwordTried = true;
        password().then(
          (pw) => {
            const method: AnyAuthMethod = {
              type: "password",
              username,
              password: pw,
            };
            next(method);
          },
          () => stopAuth(next),
        );
        return;
      }
      stopAuth(next);
    };
  }

  async run(argv: string[]): Promise<ExecResult> {
    const client = await this.connect();
    const command = shellQuote(argv);
    return new Promise<ExecResult>((resolve, reject) => {
      client.exec(command, (err, stream: ClientChannel) => {
        if (err) return reject(err);
        let stdout = "";
        let stderr = "";
        let code = 0;
        const timer = setTimeout(() => {
          stream.close();
          reject(
            new Error(
              `command timed out after ${this.opts.commandTimeoutSec}s: ${command}`,
            ),
          );
        }, this.opts.commandTimeoutSec * 1000);
        stream.on("close", (exit: number | null) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, code: exit ?? code });
        });
        stream.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
        stream.stderr.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });
        stream.on("exit", (exit: number) => { code = exit; });
      });
    });
  }

  async close(): Promise<void> {
    if (this.client) {
      this.client.end();
      this.client = undefined;
    }
  }
}
