export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface PromptResponder {
  /**
   * Regex tested against the rolling PTY stdout buffer. The first match wins;
   * each entry fires at most once per command.
   */
  match: RegExp;
  /**
   * Text to send when `match` first hits. A trailing `\n` is appended
   * automatically (PTY in cooked mode treats it as Enter).
   */
  respond: string;
}

export interface RunOptions {
  /**
   * Allocate a PTY for the remote command. Required for tools that read
   * passwords/OTPs via /dev/tty (notably `dc login`). With PTY, stderr is
   * merged into stdout by the kernel; expect `stderr` to be empty.
   */
  pty?: boolean;
  /**
   * Drive an interactive command by responding to prompts as they appear.
   * Writing input before the prompt arrives does NOT work for getpass-style
   * readers — they call tcsetattr with TCSAFLUSH which discards any
   * pre-buffered tty input. Hence prompt-on-match.
   */
  prompts?: PromptResponder[];
  /**
   * Per-command timeout override (seconds). Falls back to the session-level
   * commandTimeoutSec. Use a tight value for interactive subcalls so a
   * misidentified prompt fails fast instead of hanging the whole tool.
   */
  timeoutSec?: number;
}

export interface SshExec {
  run(argv: string[], opts?: RunOptions): Promise<ExecResult>;
  close(): Promise<void>;
}
