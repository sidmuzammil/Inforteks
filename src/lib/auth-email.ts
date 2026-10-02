import { z } from "zod";

export function authEmail(payload: Record<string, string>, origin: string) {
  const kind = z
    .enum(["PASSWORD_RESET", "VERIFY_EMAIL"])
    .parse(payload.kind ?? "PASSWORD_RESET");
  const to = z.email().parse(payload.to);
  const url = new URL(payload.url);
  const expected = new URL(origin);
  if (
    url.origin !== expected.origin ||
    !url.pathname.startsWith(
      kind === "VERIFY_EMAIL"
        ? "/api/auth/verify-email"
        : "/api/auth/reset-password/",
    )
  ) {
    throw new Error("Authentication email link is invalid.");
  }
  const verify = kind === "VERIFY_EMAIL";
  const subject = verify
    ? "Verify your Inforteks email"
    : "Reset your Inforteks password";
  const action = verify ? "Verify email address" : "Reset password";
  const explanation = verify
    ? "Confirm that this email belongs to you to secure your Inforteks account."
    : "We received a request to reset your Inforteks password. Use the secure link below to choose a new one.";
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  return {
    to,
    subject,
    text: `${subject}\n\n${explanation}\n\n${url.href}\n\nThis link expires ${verify ? "one hour" : "30 minutes"} after it was requested. If you didn’t request this, you can ignore this email. Never share this link or your password.\n\nInforteks`,
    html: `<div style="background:#f4f6fa;padding:32px 16px;font-family:Arial,sans-serif;color:#14213a"><div style="max-width:520px;margin:auto;background:white;border-radius:14px;padding:32px"><div style="font-size:25px;font-weight:700;color:#1651ed">inforteks</div><h1 style="font-size:24px;margin-top:28px">${subject}</h1><p style="line-height:1.7">${explanation}</p><p style="margin:30px 0"><a href="${escape(url.href)}" style="background:#1651ed;color:white;padding:14px 22px;text-decoration:none;border-radius:7px;display:inline-block">${action}</a></p><p style="font-size:13px;line-height:1.7;color:#536178">This link expires ${verify ? "one hour" : "30 minutes"} after it was requested. If you didn’t request this, you can ignore this email. Never share this link or your password.</p></div></div>`,
  };
}
