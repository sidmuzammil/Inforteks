/** Server configuration only. Never expose the client secret to the browser. */
export function googleSignInEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return Boolean(
    env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

/** Provider error text is untrusted; render only our own messages. */
export function googleSignInError(code?: string) {
  if (!code) return "";
  if (code === "access_denied")
    return "Google sign-in was cancelled. You can try again or use your email and password.";
  if (code === "account not linked" || code === "account_not_linked")
    return "Sign in with your existing password, then connect Google in Profile & security.";
  if (code === "google_customer_only")
    return "Google sign-in is for customer accounts. Staff should use Staff sign in.";
  if (code === "email_does_not_match")
    return "Choose the Google account with the same email as your Inforteks account.";
  return "We couldn’t complete Google sign-in. Please try again or use your email and password.";
}
