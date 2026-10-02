# Inforteks infrastructure

Railway CLI 5.63.1 and the pinned `railway` SDK manage this configuration.
Link the intended Inforteks project and environment before running:

```sh
railway status --json
railway config plan
railway config apply --yes
```

Read every plan before applying. The `inforteks` partial owns application resources; removing
owned resources from it can delete data. Railway-managed PITR buckets remain
outside this partial and must be preserved. Do not use `--confirm-destructive` without
reviewing the exact deletion and a verified backup.

Create a separate strong `BETTER_AUTH_SECRET` shared variable in each environment
through secure Railway configuration. The file references it without including
its value. Do not use `ctx.randomString` for authentication secrets.

Deploy the web service first, wait for successful migrations and readiness, then
deploy the worker. Only web receives a public HTTPS domain. Until Railway's GitHub
App has repository access, upload the reviewed checkout with `railway up --service
web --environment staging`, then the worker. Source pushes alone do not deploy
this infrastructure file; always review and apply configuration changes separately.

See `docs/DEPLOYMENT_RAILWAY.md` and `docs/OPERATIONS.md` for storage, backups,
domain cutover, and remaining retail integrations.
