export const stageLabels: Record<string, string> = {
  NEW: "New",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  WON: "Won",
  LOST: "Lost",
};
export const contactLabels: Record<string, string> = {
  office: "Office contact",
  account: "Website account",
  guest: "Guest order contact",
};
export const channelLabel = (channel: string) =>
  channel === "DIRECT" ? "Direct Sales" : "Online Store";
export const crmDateTime = (value: Date | string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export function opportunityName(row: {
  businessCustomer: { company: string } | null;
  user: { name: string } | null;
  guestOrder: { reference: string } | null;
}) {
  return (
    row.businessCustomer?.company ??
    row.user?.name ??
    `Guest · ${row.guestOrder?.reference ?? "order"}`
  );
}
