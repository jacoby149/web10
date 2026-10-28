# Pre-Experiment — the baby test

Proves the Hetzner lifecycle works before we burn a box on the real experiment.
It's the smallest possible end-to-end run: spin up → docker hello-world →
docker error → verify the box survived → tear down.

## What it checks

| Step | What it proves |
|---|---|
| 0. Clean up a stale box | A previous failed run can't leave a billing box behind |
| 1. Spin up a cx22 | The Hetzner Cloud API + the `HCLOUD_TOKEN` work; the box gets an IP + SSH |
| 2. Install docker | The box is a bare Ubuntu VM; docker installs cleanly |
| 3. `docker run hello-world` | The happy path: a container runs and prints |
| 4. `docker run alpine … exit 3` | The error path: a container exits non-zero |
| 5. Verify the box is alive | The error did NOT kill the box — only our teardown does that |
| 6. Teardown (trap) | The box is deleted; it "only survives the experiment" |

## The "only survive the experiment" guarantee

The script sets a `trap cleanup EXIT` at the top. `cleanup` deletes the server
by ID. The trap fires on **any** exit — success, a mid-way `exit 1`, a Ctrl-C,
or a crash. So the box cannot outlive the script. If the script itself can't
run (no token, no network), no box is created, so nothing leaks.

The one leak case: the script creates the box, gets the ID, then the process
is killed with `kill -9` (the trap doesn't fire on SIGKILL). That's why the
box is tagged `web10-sigmod-pre=1` — you can always find + delete a stray:

```bash
export HCLOUD_TOKEN=<your-token>
curl -s -H "Authorization: Bearer $HCLOUD_TOKEN" \
  "https://api.hetzner.cloud/v1/servers?label_selector=web10-sigmod-pre=1"
# → the id; then:
curl -s -X DELETE -H "Authorization: Bearer $HCLOUD_TOKEN" \
  "https://api.hetzner.cloud/v1/servers/<id>"
```

Or the `hcloud` CLI: `hcloud server list --label web10-sigmod-pre=1` then
`hcloud server delete <id>`.

## Run it

```bash
export HCLOUD_TOKEN=<your-hetzner-cloud-api-token>
cd research/experiments/pre-experiment
./pre-experiment.sh
```

Expected output (abridged):
```
[pre] creating server: web10-sigmod-pre-… (cx22, fsn1, ubuntu-24.04)
[pre] server id: 1234567
[pre] ip: 159.69.x.x
[pre] ssh is up
[pre] installing docker on the box...
[pre] running hello-world docker container...
[pre] PASS: hello-world ran.
[pre] running a docker container that exits non-zero...
[pre] PASS: error container exited with code 3 (as expected).
[pre] verifying the box survived the error...
[pre] PASS: box is still alive after the error container.
============================================
 pre-experiment PASSED
 ...
[pre] cleanup: deleting server 1234567...
[pre] deleted. the box only survived the experiment.
```

## Cost

A cx22 is ~€0.0035/hr. The whole run takes ~5-8 minutes (most of it waiting
for the box to boot + docker to install). Total cost: well under €0.01.

## Why this before the real experiment

The real `run.sh` does the same lifecycle but heavier: it brings up the full
web10 docker-compose stack (api + clickhouse + minio), seeds a synthetic
dataset, and runs the bench. If the basic spin-up/ssh/docker/teardown
lifecycle has a bug (wrong API field, SSH not ready, docker install fails,
the box leaks), you'd find it on a €12 box running the real thing instead of
a €0.01 box running hello-world. This is the de-risking step.
