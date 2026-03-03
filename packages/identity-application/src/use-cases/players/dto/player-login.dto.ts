export interface PlayerLoginInput {
  /**
   * Player ID từ hệ thống của tenant (alphanumeric, 4-32 ký tự).
   * Dùng làm phần đầu của username: `playerExternalId@tenantId`.
   */
  playerExternalId: string;

  /**
   * Tenant ID — lấy từ API Key auth context, không từ body.
   */
  tenantId: string;
}

export interface PlayerLoginOutput {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}
