/** Canonical staff detail route. Authorization always uses the stored order channel. */
export function adminOrderHref(id: string, channel: "DIRECT" | "ONLINE") {
  return `/admin/${channel === "DIRECT" ? "direct-sales" : "online-store"}/orders/${encodeURIComponent(id)}`;
}
