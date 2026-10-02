# Inforteks production operations

This runbook defines checks needed for a retail launch. Infrastructure settings described here are not active until verified in the actual Railway project. See [delivery status](PROGRESS.md) for application limitations.

## Recovery

- Enable PostgreSQL point-in-time recovery where supported and verify archiving is active. Configure daily and weekly backups and record actual retention. Take an additional backup before migrations or imports that affect existing data.
- Back up private media to an independently protected destination. Database records reference object keys; a database-only restore is incomplete if those objects are lost.
- Restore a selected backup into a new isolated service. Verify migration history, product/SKU/order counts, customer ownership, inventory/reservations and sample media hashes. Disable outbound providers during drills. Never overwrite the live database just to test recovery.
- Record actual recovery time and the recoverable timestamp. Initial objectives are no more than 24 hours of lost data and recovery within two hours; these are targets to validate, not service guarantees. A business requiring less data loss should require verified continuous recovery before accepting orders.
- Restrict backup access. Never put dumps, credentials, customer exports or backups into Git or public build artifacts.

Useful Railway commands after authentication and project selection:

```bash
railway postgres pitr status --service Postgres --environment production
railway postgres pitr enable --service Postgres --environment production
railway postgres pitr schedule set --daily --weekly --service Postgres --environment production
railway postgres pitr backup create --service Postgres --environment production --name pre-migration
```

Inspect current state and plan support first. Enabling recovery can redeploy the database; schedule changes in an appropriate maintenance window. Restore into a new service and retain the original until verification passes.

## Monitoring

Configure these monitors with an actual destination owned by the operations team. This repository does not send alerts by itself.

| Signal                         | Initial action threshold                                 | Response                                                 |
| ------------------------------ | -------------------------------------------------------- | -------------------------------------------------------- |
| Web `/api/ready`               | Two failed checks one minute apart                       | Inspect deployment and database connectivity             |
| Private worker `/health`       | Unavailable or no progress for five minutes              | Inspect jobs before restarting or retrying external work |
| Failed / blocked jobs          | Any new failure, or oldest queued job above five minutes | Review provider state and recorded outcome in admin      |
| Database connections           | Above 70% of configured limit for five minutes           | Review pool budgets, deploy overlap and slow queries     |
| Database / bucket capacity     | Above 70% provisioned capacity                           | Forecast growth before resizing or changing retention    |
| HTTP errors / checkout latency | Sustained errors or regression from measured baseline    | Investigate before scaling replicas                      |
| Backups                        | Missing scheduled backup or failed restore drill         | Treat recovery as unavailable until corrected            |

Logs must exclude authorization headers, secrets, reset links and full customer payloads. Retain audit events according to the merchant's documented policy. Store UTC event timestamps and display schedules in the operations team's chosen timezone.

## Deployment and rollback

Deploy the same reviewed Git commit to web and worker. Apply backward-compatible migrations through web pre-deploy, verify readiness, then release worker. Never use destructive database resets or edit applied migrations as a rollback shortcut.

For an application regression, roll both processes back to a schema-compatible commit. For data corruption, stop affected writes, preserve evidence, restore into an isolated environment and verify before switching connections. Record the recovery point and any data-loss implications.

Worker claims and inventory updates are transactional. Interrupted external actions can have uncertain outcomes: expired worker leases are marked for review instead of blindly replaying AI or other side effects. Inspect provider and audit records before re-queuing.

## Launch evidence

Record the deployed commit, project/environment IDs, canonical domain, successful web/worker readiness, migration history, private image round-trip, first-Owner access, backup/restore results and monitoring destination. Exercise an order flow with the intended payment method before taking real orders. Load-test with an isolated dataset and a declared traffic target before claiming capacity for a large catalogue or busy launch.

Live payment/refund/courier integrations and order-email delivery remain incomplete. They are launch dependencies for customer promises relying on them.
