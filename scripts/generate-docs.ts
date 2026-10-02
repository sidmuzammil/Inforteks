import { mkdir, writeFile } from "node:fs/promises";
import { openapi, apiOperations } from "../src/lib/openapi";
import { approvalPolicies } from "../src/domains/approvals";
import SwaggerParser from "@apidevtools/swagger-parser";
import { format } from "prettier";
async function writeDoc(path: string, content: string) {
  await writeFile(path, await format(content, { filepath: path }));
}
await mkdir("docs", { recursive: true });
await writeDoc("docs/openapi.json", JSON.stringify(openapi, null, 2) + "\n");
await SwaggerParser.validate("docs/openapi.json");
const rows = apiOperations
  .filter((o) => o.path.startsWith("/admin"))
  .map(
    (o) =>
      `| ${o.id} | ${o.method.toUpperCase()} \`${o.path}\` | ${o.scope ?? "Operation-specific / current identity"} | ${["createProduct", "listAdminProducts", "createProposal"].includes(o.id) ? "Curated tools only" : "No direct tool"} | ${o.id.toLowerCase().includes("propos") || o.id.includes("publish") || o.id.includes("archive") ? "Version-bound human approval" : "Permission-checked action"} | ${o.summary} |`,
  );
await writeDoc(
  "docs/OPERATION_MATRIX.md",
  `# Operation matrix\n\nGenerated from the API operation registry. API paths are relative to /api/v1. Business mutations share domain services across entry points.\n\n| Operation | Endpoint | Permission | AI exposure | Confirmation | Behavior |\n|---|---|---|---|---|---|\n${rows.join("\n")}\n\n## Approved operations\n\n| Operation | Required scope | Audit event |\n|---|---|---|\n${approvalPolicies.map((p) => `| ${p.operation} | ${p.scope} | ${p.operation} |`).join("\n")}\n\nProposals also record proposal.create. Approvals consume a proposal exactly once, check its expiry and target version, and commit the mutation with its audit event. REST bearer keys cannot approve. Return restocking additionally requires inventory:adjust. Access management requires an Owner browser session.\n`,
);
console.log(
  `Validated OpenAPI 3.1 and generated ${apiOperations.length} documented operations.`,
);
