// Approval navigation is based on business authority, independently of AI access.
export const approvalScopes = [
  "catalog:write",
  "catalog:publish",
  "pricing:write",
  "inventory:adjust",
  "orders:cancel",
  "fulfillments:write",
  "returns:write",
  "payments:record",
  "refunds:request",
] as const;
