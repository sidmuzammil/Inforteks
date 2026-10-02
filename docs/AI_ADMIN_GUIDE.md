# AI administration guide

The assistant is optional. Without both a server-side key and model configuration, the interface says that the provider is not connected and does not simulate results. Manual administration remains available.

Choose `AI_PROVIDER=openai` with `OPENAI_API_KEY`/`OPENAI_MODEL`, or `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`. Use the deployment's private application variables, never a `NEXT_PUBLIC_` variable. If a cloud proxy reserves a variable name, bind an allowed alias securely and map it only in the application process; do not print the value. Provider hosts also need authorized network access. Live provider calls were not tested because credentials were not supplied.

Runs are durable jobs owned by the initiating staff account. The worker uses official SDKs, validates tool arguments and rechecks permissions before each call. There is a maximum of eight steps (default six), a 90-second run deadline and a bounded output-token request. Cancellation is checked between provider calls and before each tool. A call already executing cannot be undone; review resulting drafts/proposals before retrying.

| Tool                         | Authority and result                                                  |
| ---------------------------- | --------------------------------------------------------------------- |
| Search products              | `catalog:read`; bounded public catalogue results                      |
| Low stock                    | `inventory:read`; bounded stock list                                  |
| Create product draft         | `catalog:write`; supplied prices additionally require `pricing:write` |
| Propose price change         | `pricing:write`; creates an exact proposal only                       |
| Propose inventory adjustment | `inventory:adjust`; creates a reasoned proposal only                  |

All tools additionally require `ai:use`. Tools cannot run shell commands, arbitrary HTTP requests or SQL, grant access, expose API keys, execute refunds, or approve live changes. Product and supplier text is treated as untrusted data. Human approval is a server-enforced operation and cannot be inferred from a model response or uploaded text.

This is a curated first tool set. It does not yet provide streaming, a monetary budget ledger, attachment processing, a general workflow planner, or full parity with every admin operation. Provider token counts are recorded, but they are not a billing guarantee. Add spending controls and live-provider evaluation before enabling unattended or high-volume use.
