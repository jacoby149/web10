# Pre-Experiment — the baby test (Digital Ocean)

Proves the DO lifecycle works before we burn a droplet on the real experiment.
It's the smallest possible end-to-end run: spin up → docker hello-world →
docker error → verify the droplet survived → destroy.

## What it checks

| Step | What it proves |
|---|---|
| 0. Clean up a stale droplet | A previous failed run can't leave a billing droplet behind |
| 1. Spin up a s-2vcpu-4gb | The DO API + the `DO_API_TOKEN` work; the droplet gets an IP + SSH |
| 2. Install docker | The droplet is a bare Ubuntu VM; docker installs cleanly |
| 3. `docker run hello-world` | The happy path: a container runs and prints |
| 4. `docker run alpine … exit 3` | The error path: a container exits non-zero |
| 5. Verify the droplet is alive | The error did NOT kill the droplet — only our teardown does that |
| 6. Teardown (trap) | The droplet is destroyed; it "only survives the experiment" |

## The "only survive the experiment" guarantee

The script sets a `trap cleanup EXIT` at the top. `cleanup` destroys the
droplet by ID. The trap fires on **any** exit — success, a mid-way `exit 1`,
a Ctrl-C, or a crash. So the droplet cannot outlive the script. If the script
itself can't run (no token, no network), no droplet is created, so nothing
leaks.

The one leak case: the script creates the droplet, gets the ID, then the
process is killed with `kill -9` (the trap doesn't fire on SIGKILL). That's
why the droplet is tagged `web10-sigmod-pre` — you can always find + destroy a
stray:

```bash
export DO_API_TOKEN=<your-token>
curl -s -H "Authorization: Bearer $DO_API_TOKEN" \
  "https://api.digitalocean.com/v2/droplets?tag_filters=web10-sigmod-pre"
# → the id; then:
curl -s -X DELETE -H "Authorization: Bearer $DO_API_TOKEN" \
  "https://api.digitalocean.com/v2/droplets/<id>"
```

Or the `doctl` CLI: `doctl compute droplet list --tag web10-sigmod-pre` then
`doctl compute droplet delete <id>`.

## Run it

```bash
export DO_API_TOKEN=<your-digital-ocean-api-token>
cd research/experiments/pre-experiment
./pre-experiment.sh
```

Expected output (abridged):
```
[pre] creating droplet: web10-pre-… (s-2vcpu-4gb, nyc3, ubuntu-24-04)
[pre] droplet id: 123456789
[pre] ip: 159.x.x.x
[pre] ssh is up
[pre] installing docker on the droplet...
[pre] running hello-world docker container...
[pre] PASS: hello-world ran.
[pre] running a docker container that exits non-zero...
[pre] PASS: error container exited with code 3 (as expected).
[pre] verifying the droplet survived the error...
[pre] PASS: droplet is still alive after the error container.
============================================
 pre-experiment PASSED
 ...
[pre] cleanup: destroying droplet 123456789...
[pre] destroyed. the droplet only survived the experiment.
```

## Cost

A s-2vcpu-4gb is ~$0.15/hr. The whole run takes ~5-8 minutes (most of it
waiting for the droplet to boot + docker to install). Total cost: well under
$0.05.

## Why this before the real experiment

The real `run.sh` does the same lifecycle but heavier: it brings up the full
web10 docker-compose stack (api + clickhouse + minio), seeds a synthetic
dataset, and runs the bench. If the basic spin-up/ssh/docker/teardown
lifecycle has a bug (wrong API field, SSH not ready, docker install fails,
the droplet leaks), you'd find it on a $12+ box running the real thing instead
of a $0.05 box running hello-world. This is the de-risking step.
