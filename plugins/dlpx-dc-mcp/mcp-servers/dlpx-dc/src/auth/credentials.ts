import type { Elicitor } from "./elicit.js";

export class CredentialStore {
  private cachedPassword?: string;

  constructor(
    public readonly user: string,
    envPassword: string | undefined,
    private readonly elicitor: Elicitor,
  ) {
    this.cachedPassword = envPassword;
  }

  async getPassword(): Promise<string> {
    if (this.cachedPassword !== undefined) return this.cachedPassword;
    const pw = await this.elicitor.promptPassword(
      `Enter LDAP password for ${this.user}`,
    );
    this.cachedPassword = pw;
    return pw;
  }

  async getOtp(): Promise<string> {
    return this.elicitor.promptOtp("Enter 6-digit OTP for dlpxdc dc login");
  }
}
