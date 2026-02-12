export const COGNITO_USER_POOL_ID = process.env.COGNITO_USERPOOL_ID;

if (!COGNITO_USER_POOL_ID) {
  throw new Error(
    "COGNITO_USERPOOL_ID is not configured. Please set COGNITO_USERPOOL_ID in environment variables."
  );
}
