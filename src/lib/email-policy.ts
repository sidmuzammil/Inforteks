export function emailDeliveryEnabled(env: NodeJS.ProcessEnv = process.env) {
  return (
    (env.EMAIL_PROVIDER === "resend" && Boolean(env.EMAIL_FROM)) ||
    (env.NODE_ENV !== "production" && env.EMAIL_PROVIDER === "development")
  );
}
export function emailVerificationRequired(
  env: NodeJS.ProcessEnv = process.env,
) {
  return (
    emailDeliveryEnabled(env) && env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true"
  );
}
