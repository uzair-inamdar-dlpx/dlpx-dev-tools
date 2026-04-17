export interface Elicitor {
  promptPassword(message: string): Promise<string>;
  promptOtp(message: string): Promise<string>;
}
