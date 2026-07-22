# ubuntu-deployment/scripts — the deployment, as code

These scripts ARE how the box is brought up and operated. They replace
click-by-click Portainer/NPM/Cloudflare steps with idempotent,
re-runnable code so the procedure lives in the repo, not in someone's
head or a chat log. Everything reads secrets from `../.env`
(gitignored); **no secret is ever hard-coded or committed.**

Run them from the repo clone on the box (`/opt/web10`), which is where
the `.env` lives. They target `localhost` (Portainer :9000, NPM :81) —
i.e. they must run ON the box (or through an SSH tunnel).

| Script | What it does | Idempotent? |
|--------|--------------|-------------|
| `lib.sh` | shared bash helpers (loads `.env`, mints Portainer/NPM tokens) — sourced, not run | — |
| `sync-dns.py` | create/reconcile all dev + prod Cloudflare A records (dev→LAN, prod→public); `--prune-staging` removes the legacy staging records | yes |
| `deploy-stacks.py register [edge\|dev\|prod\|all]` | register file-backed Portainer stacks (no GitOps polling — E6) | yes |
| `deploy-stacks.py disable-gitops [edge\|dev\|prod\|all]` | disable auto-update on existing git-backed stacks | yes |
| `deploy-stacks.py gitops [edge\|dev\|prod\|all]` | **DEPRECATED** — legacy git-backed stacks with 5-min polling | yes |
| `sync-npm.py` | one Cloudflare DNS-01 cert covering every vhost + all proxy hosts (forwarding by stack-prefixed alias) | yes |
| `smoke.sh` | HTTP + money-path (signup→token) checks for both envs | yes |

## Deploy model (E6: SSH-deploy CI/CD)

The primary deploy path is **GitHub Actions → SSH → docker compose**
(see `.github/workflows/deploy.yml`). Portainer is the management UI
only — it does NOT trigger deploys. After a successful docker compose
deploy, the Portainer API is called to register the stack so it appears
in the Portainer UI for management (restart, logs, env-var editing).

This replaces the old Portainer GitOps polling (5-min interval, silent
retry loop on failure, zero signal back to GitHub).

## Full bring-up order (fresh box)

```bash
# 0. prep-vm.sh already ran (Docker + Portainer + proxy network),
#    and .env is filled in (see .env.example). If Portainer/NPM have
#    no admin yet, create them in their UIs first (or the init is a
#    one-time manual step — see OPS-LOG for how it was done here).
cd /opt/web10
python3 ubuntu-deployment/scripts/sync-dns.py            # DNS first (DNS-01 needs it)
python3 ubuntu-deployment/scripts/deploy-stacks.py register all  # edge + dev + prod (file-backed)
python3 ubuntu-deployment/scripts/sync-npm.py            # cert + routes
bash    ubuntu-deployment/scripts/smoke.sh               # verify
```

## Day-2

- **Code changed on `dev`/`main`:** nothing to do — GitHub Actions
  deploys automatically on push. Check the deploy workflow run in
  GitHub for success/failure with full logs.
- **Force a redeploy from the box:**
  ```bash
  cd /opt/web10 && git pull
  cd ubuntu-deployment
  docker compose -p web10-dev --env-file env.dev -f docker-compose.ecosystem.yml up -d --build --remove-orphans
  bash scripts/smoke.sh
  ```
- **New/changed vhost or forward target:** edit the `HOSTS` table in
  `sync-npm.py`, re-run it.
- **New/changed DNS:** edit `sync-dns.py`, re-run it.
- **Rotate a secret:** change it in `.env` (and in Cloudflare/Portainer
  as needed), re-run the relevant script.

See `../AGENT-OPS.md` for the guardrails (this is a shared personal
box — touch only edge/web10-* stacks) and `../OPS-LOG.md` for the
running ledger.