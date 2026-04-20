export class CredentialStore {
    user;
    elicitor;
    cachedPassword;
    constructor(user, envPassword, elicitor) {
        this.user = user;
        this.elicitor = elicitor;
        this.cachedPassword = envPassword;
    }
    async getPassword() {
        if (this.cachedPassword !== undefined)
            return this.cachedPassword;
        const pw = await this.elicitor.promptPassword(`Enter LDAP password for ${this.user}`);
        this.cachedPassword = pw;
        return pw;
    }
    async getOtp() {
        return this.elicitor.promptOtp("Enter 6-digit OTP for dlpxdc dc login");
    }
}
//# sourceMappingURL=credentials.js.map