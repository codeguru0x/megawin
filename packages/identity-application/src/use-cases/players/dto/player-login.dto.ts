export interface PlayerLoginInput {
  /**
   * JWT assertion token từ tenant (signed bằng JWKS private key của tenant).
   * Chứa subject (player id) và thông tin cần thiết.
   */
  assertionToken: string;

  /**
   * Tenant ID để xác định cấu hình JWKS.
   */
  tenantId: string;
}

export interface PlayerLoginOutput {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  player: {
    accountId: string;
    username: string;
    displayName: string;
    tenantId: string;
    isNewAccount: boolean;
  };
}
