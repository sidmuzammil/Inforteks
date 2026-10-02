/** Accept local navigation only; browsers treat backslashes as URL separators. */
export function safeReturnPath(value?: string | null, staff = false): string {
  const fallback = staff ? "/admin" : "/account";
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u0020]/.test(decoded) || decoded.startsWith("//"))
      return fallback;
    const url = new URL(value, "https://inforteks.invalid");
    if (url.origin !== "https://inforteks.invalid") return fallback;
    const path = decodeURIComponent(url.pathname);
    if (staff && !(path === "/admin" || path.startsWith("/admin/")))
      return fallback;
    if (!staff && (path === "/admin" || path.startsWith("/admin/")))
      return fallback;
    if (
      /^\/(?:api|login|register|forgot-password|reset-password)(?:\/|$)/.test(
        path,
      ) ||
      path === "/admin/login"
    )
      return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
