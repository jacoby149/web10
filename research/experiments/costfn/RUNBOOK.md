# Running the Experiment — Repeatable Runbook

Step-by-step for running the access-control cost function experiment on a fresh
DigitalOcean droplet. Written so a second person (or you at 2am) can reproduce
it without rediscovering the traps. Each trap below was hit for real during the
first connected attempt (01.11.2026) and is documented here so it's a lookup,
not a re-discovery.

**TL;DR:** provision a droplet you can SSH into → install docker + log in to GHCR
→ clone the repo → `CREATORS=100 K_VALUES="10 100" RUNS=15 ./run.sh` → copy
`results/` off → destroy the droplet and verify it's gone. Budget ~$1, cap ~2 hr.

---

## 0. Prerequisites (on the machine driving the run)

**Verified connection workaround:** on this Mac/network, default SSH timed out
while `ssh -o IPQoS=none` succeeded against the same droplet. The server had
sshd listening and UFW inactive; external TCP probes also reached port 22.
Use `-o IPQoS=none` for SSH and SCP below. This does not disable encryption or
host-key checks; it disables packet QoS markings. The exact filtering device
is unknown. Allow cloud-init to finish before installing packages.

- **`doctl` installed and authenticated.** `doctl account get` must print your
  account. If not: `doctl auth init` (paste a DO personal access token from
  https://cloud.digitalocean.com/account/api/tokens) or `doctl auth login`.
- **An SSH keypair** the droplet will accept. Default `~/.ssh/id_ed25519` is fine.
  You need the **public** key (`~/.ssh/id_ed25519.pub`) to register with DO.
- **Network egress to DO droplet port 22.** ⚠️ *The #1 trap.* Verify BEFORE you
  spend money: after creating a droplet, `ssh root@<ip>` must work within ~60s.
  If TCP to :22 times out, the network path, droplet firewall or sshd readiness
  needs diagnosis; ping alone does not identify the cause. Test reachability
  first (see §1 step 4). GitHub:22 being reachable does NOT imply DO:22 is.
- **A GHCR-pull path** for the private base images (see §3). Either the droplet
  can pull `ghcr.io/jacoby149/*` (needs a token), or you pre-load them.

---

## 1. Provision the droplet

### 1a. Register your SSH key with DO (once per account)
```bash
doctl compute ssh-key create "costfn-$(date +%m%d%H)" \
  --public-key "$(cat ~/.ssh/id_ed25519.pub)"
# note the ID from the output, e.g. 60548720
```
⚠️ In doctl 2.x the command is `ssh-key create <name> --public-key "..."`
(older docs say `ssh-key add --name`; that flag doesn't exist in 2.1.0). Keys
only attach **at creation time** — you cannot add one to a running droplet via
doctl. If you create a droplet without a key, you're stuck (no passwordless SSH);
delete it and recreate with `--ssh-keys`.

### 1b. Pick a size + region that actually exists
⚠️ *Trap:* `s-4vcpu-16gb` and even `s-4vcpu-8gb` are **not available in every
region** (nyc3 rejected both with "Size is not available in this region"). Don't
assume the README's suggested size exists. Check what's offered:
```bash
doctl compute size list | awk 'NR>1 && $3==8192 {print $1, $3/1024"GB", $4"vcpu"}'
```
For the **mini probe** (CREATORS=100, K≤100) an 8 GB box is plenty — the policy
layer is I/O-bound (ClickHouse round-trips), not CPU/RAM bound. A shared
`s-4vcpu-8gb` (~$0.20/hr) or `s-2vcpu-8gb` works. For the **full matrix**
(K up to 1000) prefer more RAM if available, but 8 GB still works (metadata-only
seed, no content).

### 1c. Create it WITH the key, and wait for active
```bash
doctl compute droplet create web10-costfn-probe \
  --region sfo2 --size s-4vcpu-8gb --image ubuntu-24-04-x64 \
  --ssh-keys <KEY_ID_FROM_1a> --tag-names web10-costfn-probe --wait
```
⚠️ Flags that differ in doctl 2.x: tags are `--tag-names` (not `--tags`); there
is no `--enable-backups=false` (backups are off by default). The `--wait` flag
blocks until `active`. Note the **ID** and **Public IPv4** from the output.

### 1d. Verify SSH before doing anything else
```bash
sleep 30   # sshd takes a moment after "active"
ssh -o IPQoS=none -o ConnectTimeout=12 -o StrictHostKeyChecking=accept-new root@<IP> "echo OK; cloud-init status --wait"
```
⚠️ *The trap that stopped the first run:* if this **times out** (ping works,
`nc -z <ip> 22` may even say open, but the SSH handshake hangs), SSH is not
usable yet. This does not prove local egress is the cause. Use
`ssh -vvv` and the DO console to inspect sshd/firewall state. **Stop.** Destroy the droplet (`doctl compute droplet delete
<ID> --force`) and fix the network path first — don't keep recreating boxes.
GitHub:22 working does not mean DO:22 works from your network.

---

## 2. Install Docker on the droplet
```bash
ssh -o IPQoS=none root@<IP> 'export DEBIAN_FRONTEND=noninteractive && \
  apt-get update -y && apt-get install -y docker.io docker-compose-v2 >/dev/null && \
  systemctl enable --now docker && docker compose version'
```
(Ubuntu 24.04 ships `docker-compose-v2` as the `docker compose` plugin.)

---

## 3. Log in to GHCR (the private base images)
The stack pulls `ghcr.io/jacoby149/base-clickhouse`, `base-minio`, and the api
build pulls `base-uv:python3.12-bookworm-slim`. These are **private** (anonymous
pull returns 401). The repo itself is public (clone needs no token) — only the
*images* need auth.
```bash
# From the driving machine, get a token that works for GHCR pulls:
GH_TOKEN=$(gh auth token)        # a github.com PAT / OAuth token pulls from GHCR
printf '%s' "$GH_TOKEN" | ssh -o IPQoS=none root@<IP> 'docker login ghcr.io -u jacoby149 --password-stdin'
```
⚠️ The token goes to the droplet over SSH at provision time only — **never commit
it**, and the droplet is destroyed after, so it doesn't persist. If `gh` isn't
available, generate a classic PAT with `read:packages` on the `jacoby149`
account and use that instead.

Verify the pull works before the full run:
```bash
ssh -o IPQoS=none root@<IP> 'docker pull ghcr.io/jacoby149/base-clickhouse:24.3 && echo PULL_OK'
```

---

## 4. Clone the repo + set up vhosts
```bash
ssh -o IPQoS=none root@<IP> 'cd ~ && git clone https://github.com/jacoby149/web10 && cd web10 && \
  git checkout dev && \
  printf "127.0.0.1 api.localhost\n127.0.0.1 minio.localhost\n" >> /etc/hosts && \
  echo CLONE_OK'
```
(The bench talks to `http://localhost:6000` directly, so the nginx proxy vhosts
aren't strictly required for the measurement — but `minio.localhost` is referenced
by the compose S3 endpoint, so map it. Pin to a specific commit if you want the
run reproducible against a known-good state: `git checkout <sha>`.)

---

## 5. Run the experiment

### Mini probe first (shake out the first connected run — ~5 min bench, ~$0.10)
```bash
ssh -o IPQoS=none root@<IP> 'cd ~/web10/research/experiments/costfn && \
  python3 bench.test.py && \
  CREATORS=10 FOLLOW=10 POSTS_PER_CREATOR=1 K_VALUES=10 RUNS=3 FEEDS="personal discover" \
  MODES="per-group batched" LINES="A B C" ./run.sh 2>&1 | tee run.log'
```
Watch `run.log`: it should show API up → ClickHouse up → seeding 10 creators
→ "running cell …" per cell → results written. **If a cell's `timing_samples` is
far below RUNS, it hit rate-limits/errors — investigate, don't silently re-run.**

### Full matrix (after the probe looks sane — ~30–60 min bench, ~$1)
```bash
ssh -o IPQoS=none root@<IP> 'cd ~/web10/research/experiments/costfn && \
  CREATORS=1000 K_VALUES="10 100 1000" RUNS=20 ./run.sh 2>&1 | tee run-full.log'
```
⚠️ Keep `CREATORS` ≥ the max K you sweep (1000 backs K=1000). **Don't raise
CREATORS to 10k** for this experiment — the policy cost depends on K, not creator
count, and 10k creators ≈ 3 hr of rate-limited signups = a bigger bill for no
extra signal.

### Wall-clock guard
Set a timer. **Mini probe: ~45 min cap. Full: ~2 hr cap.** If `run.log` shows no
progress for several minutes (stuck seed or hung cell), kill it:
```bash
ssh -o IPQoS=none root@<IP> 'docker compose -f ~/web10/research/experiments/costfn/compose.yml -p web10-costfn down -v'
```
then destroy the droplet (§7) and investigate before spending more.

---

## 6. Collect results (BEFORE destroying the box)
```bash
scp -o IPQoS=none -r root@<IP>:~/web10/research/experiments/costfn/results/ ./costfn-results/
```
Sanity-check before you tear down:
```bash
ls costfn-results/                      # report.json + cell-*.json + system-info.txt
python3 -c "import json;r=json.load(open('costfn-results/report.json')); \
  print('cells:',len(r['cells'])); \
  print('B-A pairs:',list(r['causal_overhead_B_minus_A'].keys()))"
# each cell-*.json: timing_samples should be ≈ RUNS (not gutted by 429s)
```
If `report.json` has no `causal_overhead_B_minus_A` entries, the A and B cells
didn't both produce samples for some (feed, K, mode) — check which cells are short.

---

## 7. Destroy the droplet + VERIFY (the anti-blowout step)
```bash
doctl compute droplet delete <ID> --force
sleep 8
doctl compute droplet list    # MUST be empty (or not contain your droplet)
```
⚠️ `run.sh` tears down the local compose stack but **does NOT destroy the cloud
droplet**. Local Docker cleanup does not stop the bill. A forgotten droplet at
~$0.20/hr is the classic blowout — always confirm the list is empty after delete.

---

## Cost recap
| Run | Box | Time | Cost |
|---|---|---|---|
| Mini probe | s-4vcpu-8gb (~$0.20/hr) | ~15–45 min | ~$0.10–0.15 |
| Full matrix | same | ~1–2 hr | ~$0.30–0.50 |
| 3 trials (paper) | 3× full | — | ~$1–1.50 total |

There is no scenario where this costs more than a few dollars unless you leave a
box running. The destroy+verify in §7 is the whole point.

---

## Troubleshooting index (symptom → cause → fix)

| Symptom | Cause | Fix |
|---|---|---|
| `ssh root@<ip>` times out, ping works | Egress to DO:22 blocked (VPN/firewall) | Stop. Fix network path. Don't recreate boxes. |
| `ssh` hangs at "Connecting" but `nc -z :22` says open | Same as above (nc can race/false-positive) | Treat as blocked egress. |
| Droplet created but no passwordless SSH | Created without `--ssh-keys` (key didn't attach) | Delete + recreate with `--ssh-keys <id>`. Can't add key to a running droplet via doctl. |
| `Error: unknown flag: --tags` / `--name` / `--title` | doctl 2.x renamed flags | `--tag-names`, `ssh-key create <name> --public-key`, no `--name` on droplet update. |
| `Size is not available in this region` | That size isn't offered in that region | `doctl compute size list` to find a valid slug; try another region (sfo2/ams3 had 8 GB; nyc3 was restrictive). |
| GHCR pull returns 401 | Private images, no token | `docker login ghcr.io` with `oauth2:<gh-token>` (§3). Repo clone needs no token (public). |
| Cell `timing_samples` << RUNS | Rate-limited (429) or errors | Check `run.log` + api logs. The bench paces at 1s/query under the 60/min limit; if still short, lower RUNS or investigate. |
| `report.json` has no B−A pairs | A and B cells didn't both sample for a (feed,K,mode) | Find which cells are short in `cell-*.json`; re-run just those. |
| API not healthy after 120s in run.sh | Stack failed to boot | `docker compose -p web10-costfn logs api \| tail -40` on the box. |
| Bill keeps climbing | Forgot to destroy the droplet | `doctl compute droplet list` → delete any strays → verify empty. |
