export interface PlayerRefreshTokenInput {
  refreshToken: string;
  COGNITO_PLAYER_POOL_CLIENT_ID: string;
}

export interface PlayerRefreshTokenOutput {
  accessToken: string;
  idToken: string;
  expiresIn: number;
  tokenType: string;
}
