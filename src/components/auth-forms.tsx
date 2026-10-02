"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { safeReturnPath } from "@/lib/auth-navigation";

class AuthRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}
async function authRequest(path: string, body: unknown) {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new AuthRequestError(
      "We couldn’t connect. Check your connection and try again.",
    );
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const messages: Record<string, string> = {
      INVALID_EMAIL_OR_PASSWORD:
        "The email or password is incorrect. Please try again.",
      INVALID_PASSWORD: "Your current password is incorrect.",
      EMAIL_NOT_VERIFIED:
        "Please verify your email before signing in. You can request a new link below.",
      INVALID_TOKEN:
        "This link has expired or has already been used. Request a new one.",
      PASSWORD_TOO_SHORT: "Use at least 12 characters for your password.",
      PASSWORD_TOO_LONG: "Use no more than 128 characters for your password.",
      USER_ALREADY_EXISTS:
        "Unable to create this account. Try signing in or recovering your password.",
      USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
        "Unable to create this account. Try signing in or recovering your password.",
      EMAIL_UNAVAILABLE:
        "Email recovery is temporarily unavailable. Please try again later.",
    };
    throw new AuthRequestError(
      response.status === 429
        ? "Too many attempts. Please wait a minute and try again."
        : (messages[result.code] ??
          (response.status === 401
            ? "Please sign in again to continue."
            : "We couldn’t complete that request. Check your details and try again.")),
      result.code,
    );
  }
  return result;
}

export function PasswordField({
  name = "password",
  label = "Password",
  newPassword = false,
  disabled = false,
}: {
  name?: string;
  label?: string;
  newPassword?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [length, setLength] = useState(0);
  const [caps, setCaps] = useState(false);
  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-control">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          minLength={newPassword ? 12 : undefined}
          maxLength={128}
          disabled={disabled}
          autoComplete={newPassword ? "new-password" : "current-password"}
          aria-describedby={`${id}-help`}
          onChange={(e) => setLength(e.target.value.length)}
          onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
          onBlur={() => setCaps(false)}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
          disabled={disabled}
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </div>
      <small id={`${id}-help`} className="form-help">
        {caps ? "Caps Lock is on. " : ""}
        {newPassword
          ? length >= 12
            ? "✓ Minimum length met. Use a unique password or passphrase."
            : "Use 12–128 characters. A few unrelated words work well."
          : "Password managers and pasting are welcome."}
      </small>
    </div>
  );
}

function Feedback({ error, message }: { error: string; message: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  return (
    <>
      {error && (
        <div ref={ref} tabIndex={-1} className="form-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="notice success" role="status">
          {message}
        </div>
      )}
    </>
  );
}

export function AuthForm({
  mode,
  token,
  next,
  staff = false,
  emailEnabled = true,
}: {
  mode: "login" | "register" | "forgot-password" | "reset-password";
  token?: string;
  next?: string;
  staff?: boolean;
  emailEnabled?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [email, setEmail] = useState("");
  const login = staff ? "/admin/login" : "/login";
  const recovery = `/forgot-password${staff ? "?audience=staff" : ""}`;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    setError("");
    setMessage("");
    if (
      (mode === "register" || mode === "reset-password") &&
      password !== form.get("confirmPassword")
    ) {
      setError(
        "The passwords don’t match. Please enter the same password twice.",
      );
      return;
    }
    setBusy(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === "forgot-password") {
        await authRequest("request-password-reset", {
          email: normalizedEmail,
          redirectTo: `/reset-password${staff ? "?audience=staff" : ""}`,
        });
        setMessage(
          "If an account uses this email, you’ll receive a reset link. Check your inbox and spam folder. The link expires in 30 minutes.",
        );
        setDone(true);
      } else if (mode === "reset-password") {
        await authRequest("reset-password", { token, newPassword: password });
        setMessage(
          "Your password has been updated. Sign in with your new password. Your other sessions have been signed out.",
        );
        setDone(true);
        // Remove the used token from browser history without another navigation.
        window.history.replaceState(
          null,
          "",
          `/reset-password${staff ? "?audience=staff" : ""}`,
        );
      } else {
        const result = await authRequest(
          mode === "login" ? "sign-in/email" : "sign-up/email",
          {
            email: normalizedEmail,
            password,
            ...(mode === "register"
              ? {
                  name: String(form.get("name") ?? "").trim(),
                  callbackURL: "/login?verified=1",
                }
              : { rememberMe: form.get("rememberMe") === "on" }),
          },
        );
        if (mode === "register" && !result.token) {
          setMessage(
            "Check your inbox to verify your email, then sign in. If you already have an account, use sign in or password recovery.",
          );
          setDone(true);
        } else {
          router.replace(safeReturnPath(next, staff));
          router.refresh();
        }
      }
    } catch (err) {
      setError((err as Error).message);
      setNeedsVerification(
        err instanceof AuthRequestError && err.code === "EMAIL_NOT_VERIFIED",
      );
    } finally {
      setBusy(false);
    }
  }
  if (mode === "forgot-password" && !emailEnabled)
    return (
      <div className="auth-result">
        <ShieldCheck size={30} />
        <h2>Email recovery is temporarily unavailable</h2>
        <p>
          Please try again later. If you’re already signed in, you can change
          your password in Profile & security.
        </p>
        <Link href={login} className="button">
          Back to sign in
        </Link>
      </div>
    );
  if (done)
    return (
      <div className="auth-result">
        <CheckCircle size={32} />
        <Feedback error="" message={message} />
        <Link href={login} className="button primary">
          Back to sign in <ArrowRight size={16} />
        </Link>
        {mode === "forgot-password" && (
          <button
            className="text-button"
            onClick={() => {
              setDone(false);
              setMessage("");
            }}
          >
            Try a different email
          </button>
        )}
      </div>
    );
  return (
    <form className="form-stack auth-form" onSubmit={submit} aria-busy={busy}>
      {mode === "register" && (
        <label>
          Full name
          <input
            name="name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
            disabled={busy}
          />
        </label>
      )}
      {mode !== "reset-password" && (
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            inputMode="email"
          />
        </label>
      )}
      {mode !== "forgot-password" && (
        <PasswordField
          newPassword={mode !== "login"}
          disabled={busy}
          label={mode === "reset-password" ? "New password" : "Password"}
        />
      )}
      {(mode === "register" || mode === "reset-password") && (
        <PasswordField
          name="confirmPassword"
          label="Confirm password"
          newPassword
          disabled={busy}
        />
      )}
      {mode === "login" && (
        <div className="auth-options">
          <label className="check-label">
            <input
              type="checkbox"
              name="rememberMe"
              defaultChecked={!staff}
              disabled={busy}
            />{" "}
            Keep me signed in
          </label>
          <Link href={recovery} className="text-button">
            Forgot password?
          </Link>
        </div>
      )}
      <Feedback error={error} message={message} />
      {error.includes("link") && mode === "reset-password" && (
        <Link href={recovery} className="text-button">
          Request a new reset link
        </Link>
      )}
      <button className="button primary" disabled={busy} type="submit">
        {busy ? (
          <>
            <LoaderCircle className="loading-icon" size={17} /> Please wait…
          </>
        ) : (
          <>
            {mode === "login"
              ? staff
                ? "Sign in to workspace"
                : "Sign in"
              : mode === "register"
                ? "Create customer account"
                : mode === "forgot-password"
                  ? "Send reset link"
                  : "Save new password"}
            <ArrowRight size={17} />
          </>
        )}
      </button>
      {needsVerification && emailEnabled && (
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await authRequest("send-verification-email", {
                email: email.trim().toLowerCase(),
                callbackURL: `${login}?verified=1`,
              });
              setMessage(
                "If this account needs verification, a new link will arrive in your inbox.",
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Resend verification email
        </button>
      )}
    </form>
  );
}

export function AccountSecurity({
  email,
  verified,
  emailEnabled,
}: {
  email: string;
  verified: boolean;
  emailEnabled: boolean;
}) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="account-security">
      <div className="security-heading">
        <ShieldCheck size={23} />
        <div>
          <h2>Password & security</h2>
          <p>Use a unique password and keep your account private.</p>
        </div>
      </div>
      <div className="account-email">
        <span>{email}</span>
        <span className="badge">
          {verified ? "Email verified" : "Email not verified"}
        </span>
      </div>
      {!verified && emailEnabled && (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            setMessage("");
            try {
              await authRequest("send-verification-email", {
                email,
                callbackURL: "/account/profile",
              });
              setMessage("Check your inbox for a verification link.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Verify my email
        </button>
      )}
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const form = e.currentTarget;
          const data = new FormData(form);
          setError("");
          setMessage("");
          if (data.get("newPassword") !== data.get("confirmPassword")) {
            setError("The new passwords don’t match.");
            return;
          }
          setBusy(true);
          try {
            await authRequest("change-password", {
              currentPassword: data.get("currentPassword"),
              newPassword: data.get("newPassword"),
              revokeOtherSessions: true,
            });
            form.reset();
            setMessage(
              "Password updated. Your other devices have been signed out.",
            );
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <PasswordField
          name="currentPassword"
          label="Current password"
          disabled={busy}
        />
        <PasswordField
          name="newPassword"
          label="New password"
          newPassword
          disabled={busy}
        />
        <PasswordField
          name="confirmPassword"
          label="Confirm new password"
          newPassword
          disabled={busy}
        />
        <Feedback error={error} message={message} />
        <div>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Update password"}
          </button>
        </div>
      </form>
      <div className="security-session">
        <div>
          <h3>Signed in somewhere else?</h3>
          <p>Keep this session and sign out on your other devices.</p>
        </div>
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            setMessage("");
            try {
              await authRequest("revoke-other-sessions", {});
              setMessage("Your other devices have been signed out.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Sign out other devices
        </button>
      </div>
    </section>
  );
}
