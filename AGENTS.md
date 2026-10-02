<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Inforteks project conventions

- Read `README.md`, `docs/ARCHITECTURE.md` and the relevant domain module before extending a workflow. `docs/PROGRESS.md` distinguishes implemented behavior from the supplied brief's future scope.
- Keep business authorization in `src/domains`, shared by HTTP, staff UI and AI tools. Client visibility is not an authorization check. Recheck current permissions and versions when applying proposals.
- Use integer AED fils, transactionally maintained inventory, immutable purchased-item snapshots and idempotency for retried checkout. Add a migration for schema changes; do not edit applied migrations.
- Public DTOs must exclude private cost, credentials and unpublished media. Do not serialize full database users, sessions or keys into client components.
- Demo catalogue data is explicitly labelled. Never invent live provider results, customer reviews, warranty claims, merchant tax registration or delivery commitments.
- Keep secrets, uploads, mailboxes, browser traces and database snapshots out of Git. No default staff passwords. Never point seeds, bootstrap verification or browser tests at production.
- Use the existing checkout. Setup is `bash scripts/setup.sh`; web and worker are separate `pnpm dev` and `pnpm worker` processes. Run checks relevant to the change, and regenerate API documentation when its operation registry changes.
