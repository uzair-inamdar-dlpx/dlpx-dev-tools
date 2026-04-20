export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface SshExec {
  run(argv: string[]): Promise<ExecResult>;
  close(): Promise<void>;
}
