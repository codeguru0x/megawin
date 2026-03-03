/**
 * Cognito User Pool IDs.
 *
 * Project sử dụng 2 pool:
 *  - Workforce: company + agent accounts  (env: COGNITO_WORKFORCE_POOL_ID)
 *  - Player:    player accounts per-tenant (env: COGNITO_PLAYER_POOL_ID)
 *
 * Backward compat: COGNITO_USERPOOL_ID vẫn hoạt động như default fallback.
 */

export const COGNITO_WORKFORCE_POOL_ID = process.env.COGNITO_WORKFORCE_POOL_ID;

export const COGNITO_PLAYER_POOL_ID = process.env.COGNITO_PLAYER_POOL_ID;

export const COGNITO_PLAYER_POOL_CLIENT_ID =
  process.env.COGNITO_PLAYER_POOL_CLIENT_ID;
