# HARDWARE-UPGRADE-PLAN.md — new web10 serving machine (Dell R630) and the move off the Supermicro 1U

> **Status: APPROVED 22.11.2026** (operator: "get it! and upgrade!").
> Purchase pending — eBay offer in flight. All baseline numbers measured
> 22.11.2026, read-only, from `pve` (192.168.8.20); receipts in §10.
> This file is the plan. `OPS-LOG.md` is the execution ledger;
> `AGENT-OPS.md` remains the field manual for the CURRENT box until
> cutover day.

## 1. Source listing

Dell PowerEdge R630, eBay item 206683906368, seller BuildMyServer
(Brooklyn, NY). Price $684.95 or Best Offer (planned offer: $600), free
shipping, 1-year warranty, 30-day returns. Condition: eBay Refurbished,
tested, R2 grade F4 / cosmetic A.

## 2. As shipped

- Chassis: 1U rackmount, 10-bay 2.5-inch SAS/SATA, sliding rails included
- Processors: 2× Intel Xeon E5-2698 v3 (Haswell-EP) — 16C/32T each,
  32C/64T total; 2.3 GHz base, 3.6 GHz max turbo, AVX2 (no AVX-512),
  40 MB L3 each, 135 W TDP (note: v3 parts cap DDR4-2133; the spec
  sheet's 120 W TDP figure is the commonly quoted one — verify against
  the service tag on arrival, does not affect the plan)
- Memory as shipped: 64 GB as 4× 16 GB DDR4-2133 RDIMM (PC4-17000-R),
  2 modules per processor
- Storage: none included, no caddies included
- Controller: HBA330, pass-through (non-RAID), 12 Gbps SAS
- Network: quad 1 GbE (Intel i350)
- Management: iDRAC8 Express
- Power: 2× 750 W Platinum redundant supplies

## 3. Upgrade plan — parts moved from the current Supermicro ("POWMICRO")

1. **Memory:** the Supermicro's 4× 16 GB Micron DDR4-2400 modules move
   into the R630. Both sets are DDR4 RDIMMs; mixed capacities/speeds are
   permitted. The moved modules run at 2133 in this machine (the v3
   processors cap memory at 2133). Resulting layout: 8× 16 GB, 4 modules
   per processor, one in each of the 4 channels per processor. Resulting
   total: 128 GB, all memory channels populated. Memory bandwidth:
   17.07 GB/s × 8 channels ≈ 136 GB/s aggregate.
2. **Drives:** its 4× 2 TB SSDs (8 TB raw) move into the R630 on Dell
   2.5-inch caddies. Planned layout: two mirrored pairs (software
   mirroring; the HBA330 does no RAID) = 4 TB usable.

### Pre-move checks — status 22.11.2026

- **Check 1 (RDIMM vs LRDIMM): PASS, verified from SMBIOS** on the
  current host instead of label inspection: 4× 16 GB, part number
  `18ADF2G72AZ-2G3A1` (Micron), **Total Width 72 bits / Data Width 64
  bits = 8-bit ECC**, Rank 2, 2400 MT/s rated, running 2133 MT/s
  (the E3's ceiling). ECC RDIMM confirmed — the R630's ECC-only
  requirement is met. Re-verify labels match this part number at
  removal; if any stick differs, STOP and re-check.
- **Check 2 (drive form factor): PASS** — 4× SanDisk SSD PLUS 2000GB,
  2.5-inch SATA. Fits the R630 backplane; the HBA330 (12 Gbps SAS)
  presents SATA drives fine. Caddies are NOT included in the listing —
  see §9.
- **Third check (added by the workspace):** the as-shipped R630 memory
  is RDIMM (PC4-17000-R) — do not mix the two sets into different
  channel counts; the 1DPC layout above is the only one that gets the
  full 8-channel bandwidth.

## 4. Measured baseline — current host `pve` (Supermicro 1U)

Measured 22.11.2026, read-only (SSH `root@192.168.8.20`, key access):

- **Board:** Supermicro `PIO-1UUP-ND1-AI036` — 1U, single-socket
  LGA2011-3, Intel Q170 chipset, SATA controller in plain AHCI mode.
- **OS:** Proxmox VE **9.1.5**, kernel 6.17.4-2-pve.
- **CPU:** Intel Xeon E3-1240 v5 @ 3.50 GHz — **4 cores / 8 threads
  (hyperthreading ON**; `/proc/cpuinfo` = 8 logical, confirmed). 8 MB L3.
  (The e2e-off-box changelog entry's "4 cores / 8 threads" was correct;
  a later workspace note of "4C/4T" was wrong.)
- **RAM:** 64 GB (4× 16 GB, see §3 check 1). Host: ~33 GiB used /
  ~28 GiB available at idle (22.11.2026) — most of the "used" is
  VM 100's page cache.
- **NIC:** Intel X540-AT2 dual-port 10GbE — **both ports LINKED AT
  10 Gbps** (measured `net: 10000 Mbps` ×2) + 2× Intel I210 1GbE.
- **PSU / management:** single PSU (no redundancy); no iDRAC equivalent
  (IPMI-only, LAN).

**Drives — serials are the map for the whole move** (by-id names on
`pve`; the R630's HBA330 will present the same serials under a
different id prefix — re-map from this table on cutover day):

| dev | serial (by-id suffix) | wwn | role | data |
|---|---|---|---|---|
| sda | `..._23306R800099` | 0x5001b448bf5260c7 | **raw passthrough to VM 100** (`scsi0: /dev/sda`) — the host does not own it | guest GPT: sda1 1M / sda2 513M / sda3 1.8T ext4, **626 GB used** |
| sdb | `..._23306R8000878` | 0x5001b448bf526afb | PVE system disk | pve-root 96 G (5 G used) + pve-swap 8 G + **pve-data LVM-thin pool 1.67 T, Data% 0.01 (empty**; 4 M stub `vm-100-disk-0`) |
| sdc | `..._233256800021` | 0x5001b448bfe382be | empty, no partitions | from 22.11.2026 22:48 UTC: **insurance clone of sda** (dd in progress, §7 Phase 0) |
| sdd | `..._233256800213` | 0x5001b448bfe31115 | effectively empty (small leftover partitions) | — |

**Network:** `vmbr0` = 192.168.8.20/24, gateway .1, `bridge-ports nic0`
(PVE stable NIC names; nic1–nic3 manual/unused). Public IP
184.174.17.178; its SSH port 42422 forwards to **VM 100 only** — the
host is not publicly reachable.

**Storage config** (`/etc/pve/storage.cfg`, as-is):

```
dir: local
	path /var/lib/vz
	content iso,vztmpl,backup,import

lvmthin: local-lvm
	thinpool data
	vgname pve
	content rootdir,images
```

**VM 100 rebuild spec** (`qm config 100`, as-is — recreate verbatim,
only the scsi0 target changes, and to an image on the new pool, not a
raw disk — the mirror layout owns the drives):

```
bios: ovmf
boot: order=scsi0;ide2;net0
cores: 8
cpu: host
efidisk0: local-lvm:vm-100-disk-0,efitype=4m,ms-cert=2023w,pre-enrolled-keys=1,size=4M
ide2: none,media=cdrom
memory: 32768
name: server-rack-ubuntu-original
net0: virtio=BC:24:11:9C:2D:7A,bridge=vmbr0
numa: 0
onboot: 1
ostype: l26
scsi0: /dev/sda,size=1953514584K
scsihw: virtio-scsi-single
smbios1: uuid=d170c77e-ca95-48ec-87e5-60fc6a88ba8a
sockets: 1
vmgenid: f9201c61-7395-43db-a8b7-36afe64796ab
watchdog: model=i6300esb,action=reset
```

(Guest: Ubuntu 22.04.5, hostname `all-spark`, SSH user `jacob`. Inside
it: Portainer + NPM edge stack + `web10-dev`/`web10-prod` app stacks —
see `AGENT-OPS.md`.)

**API worker model:** `docker-compose.ecosystem.yml` runs gunicorn with
**`-w 4`** (4 uvicorn workers) — concurrency = worker count; relevant
to §6.

## 5. What the assembled machine adds (quantified)

| Dimension | Supermicro (today) | R630 (assembled) | Ratio / note |
|---|---|---|---|
| Cores / threads | 4 / 8 | 32 / 64 | 8× |
| Base clock | 3.5 GHz (Skylake) | 2.3 GHz (Haswell-EP) | 0.66× |
| All-core sustained | ~3.5–3.7 GHz | ~2.5 GHz | 0.7× |
| IPC at equal clock | 1.0 (reference) | ≈0.85 | 0.85× |
| **Per-thread, light load** (turbo 3.8 vs 3.6×0.85≈3.1) | baseline | | **≈0.8×** (~20% slower) |
| **Per-thread, sustained** | baseline | | **≈0.6×** (~40% slower) |
| **Aggregate sustained** (8×3.5 vs 64×2.5×0.85 → 136/28 units) | 28 u | 136 u | **≈4.9×** |
| RAM | 64 GB, 2 channels | 128 GB, 8 channels | 2× capacity |
| Memory bandwidth | 34.1 GB/s | 136.6 GB/s | 4× |
| L3 cache | 8 MB | 90 MB | 11× |
| NIC | 2×10 GbE (**live 10 G links**) + 2×1 GbE | 4×1 GbE i350 | **REGRESSION unless the X540 moves** |
| PSU | single, non-redundant | 2×750 W redundant | better |
| Management | IPMI | iDRAC8 Express (virtual console + media) | better |
| Warranty | none | 1 year + 30-day returns | arrival test is risk-free |

**Why ~4.9× and not 8×:** the thread count is 8×, but Haswell-EP runs
~30% lower clocks sustained and ~15% lower IPC than the Skylake part.
Parallelism goes up 8×; per-thread work goes down 20–40%.

**Findings from the workspace audit (22.11.2026):**

1. **The NIC is a serving-path regression as listed.** The current host
   has two *live* 10 Gbps links (measured). Four 1 GbE ports ≈ 10–12
   concurrent 1080p streams each; 10 GbE ≈ 100× that. For a media-serving
   node the NIC is the first wall. **Fix: move the X540-AT2 (and its
   SFP+ optics/DAC — verify what is actually plugged in on the old box)
   into the R630's PCIe.** A spare card already owned; zero cost.
2. **HBA330 = pass-through HBA: no RAID mode, no foreign-configuration
   prompts.** The drives appear as four single SAS/SATA disks. The
   "click-through the wizard and lose 626 GB" scenario does not exist
   on this card; the install-wipe danger reduces to "only wipe the pair
   chosen for PVE root."
3. **Baseline threads = 8, not 4** (see §4) — the aggregate ratio is
   ~4.9× sustained, not ~10×.

## 6. Expected performance change for the web10 serving workload

- **ClickHouse (the main event).** Multi-threaded columnar engine; the
  costfn receipts (feed K20 reads, 1.6B-event reconciliations, the
  32/28/22 GiB memory frame) are the evidence base. 8× threads + 4×
  bandwidth + 11× L3 buys **~3–5× on scan/aggregation-heavy queries**
  (feeds, tallies, ad placement, delivery dedup), with p95 dropping
  until the storage ceiling takes over — and that ceiling is the mirror
  pairs' ~500 MB/s per SATA SSD (mirrors don't stripe). The 22–32 GiB
  research tier now fits *inside a VM on this box* with headroom.
- **API.** Concurrency = gunicorn workers (`-w 4` today) × per-core
  speed. This only realizes if the VM 100 allocation grows (8 → 16–24
  vCPU, §8) **and** `-w` is bumped (compose change, separate bite).
  Expect ~4–8× concurrent request handling, limited by ClickHouse or
  the NIC, not Python.
- **Transcoding.** OPS-LOG recorded the old box at **537% CPU on a
  single encode** (the entire 8-thread box consumed, by definition).
  On 64 threads: parallel pipelines, no serialization; per-file
  wall-clock about the same, files/hour up several-fold; prod
  transcoding stops stealing from serving.
- **Memory.** 128 GB / 8 channels: VM 100 (32 GiB) + VM 101
  (~16 GiB) + host ≈ 50–60 GiB committed, roughly half the box free.
  The overcommit regime ends; page cache stops being evicted under
  load; more VMs (future Tier-1 community nodes) fit without
  contortion.
- **Per-thread tax, stated honestly:** latency-critical single-request
  CPU work (JWT verify, safe-query boundary, auth checks) runs 0.6–0.8×
  per thread. These are sub-millisecond costs; at system level light
  p50 is ~flat and loaded p95 improves. Nothing in the serving path
  *regresses* in practice.
- **New ceilings (what does NOT go up 8×):** NIC (unless the X540
  moves); storage I/O ~500 MB/s per pair; **4 TB usable** (down from 8
  TB raw) — catalog bytes were never this box's job (TA3/TA-MOVE: the
  partner's petabytes live on partner infra).

## 7. Move plan (one change at a time; receipts in `OPS-LOG.md`)

**Phase 0 — done/in flight (22.11.2026, on the old box):**
Read-only host audit (§4); key provisioning for `root@pve` (this Mac's
ed25519 key; password bootstrap — rotation pending, §10); insurance
clone `dd if=/dev/sda of=/dev/sdc bs=64M` **launched 22:48 UTC**
(script `/root/dd-sda-sdc.sh`, pid 3725830, log `/root/dd-sda-sdc.log`,
done-marker `/root/dd-sda-sdc.done`, ~75 MB/s live read, overnight
ETA). Live point-in-time copy: ext4 journal recovers on mount; sda is
read-only for the run, sdb untouched. Config receipts banked at
`.context/proxmox-host/{vm100-config,host-config}.txt` and embedded in §4.

**Phase 1 — arrival, before install:**
iDRAC8 setup (LAN IP on 192.168.8.x, admin password reset — out of
band, never chat/git). Install 8× 16 GB ECC RDIMM, **1DPC, 4 per
socket, all channels** (R630 service-manual slot map — 2DPC would
halve channel bandwidth; the §3 layout is the only one that gets
136 GB/s). Caddies ×4 in. X540-AT2 + optics into a PCIe slot. Verify:
four drives present as single disks under the HBA330 (no config
prompts), 10 G link up on the router side.

**Phase 2 — install:**
Pair assignment decided cutover-day from §4 serials. **Recommendation:**
PVE root + LVM-thin pool on the pair containing `sdb` (the old PVE
install — the only drive safe to wipe); the all-spark `sda` drives the
data pair. Fresh PVE 9 onto the md mirror; `local` + `local-lvm`
storage recreated per §4's storage.cfg.

**Phase 3 — data move + VM rebuild:**
Old box keeps running (nothing destructive until Phase 4). Rsync
all-spark's 626 GB from the old box to the new storage **over the 10G
link (~10–15 min** — the fast path exists only because of finding §5.1;
over 1 GbE it would be hours). Recreate VM 100 from the §4 spec: same
MAC, SMBIOS UUID, OVMF + ms-cert, watchdog, onboot; `scsi0` → new image
on `local-lvm` (not the raw disk — the mirror layout owns the drives).
Boot; verify: SSH `jacob@`, `docker ps`, NPM/prod endpoints 200,
`scripts/smoke.sh`.

**Phase 4 — cutover:**
Power the old host **down first** (IP collision on .20), then new host
`vmbr0` → 192.168.8.20. VMs keep their addresses (all-spark stays
`.25`) → zero changes for anything pointing at all-spark; public line
unchanged → **no DNS changes at all**. Verify prod; old box retires as
cold spare — its `sdc` insurance clone stays in it as a cold backup of
all-spark until the new data-pair mirror verifies.

**Phase 5 — the Torah VM:**
VM 101 on the new pool: 8 vCPU / 16 GiB / thin disk. The white-label
demo's host question (`whitelabel-demo/OPS.md`, DEMO-DNS queue) resolves
to "VM 101 on the R630" — the second-VM-on-the-4-thread-box problem
this plan replaces no longer exists.

**Rollback:** at any point before Phase 4, power the old box back on —
prod and demo paths are unchanged, no DNS state moved. Phase 4 itself
has the cold backup (sdc-clone in the old box) behind it.

## 8. Open decisions (cutover day; owner: operator + workspace)

- Pair assignment (which serials form which pair — §4 table is the input)
- VM 100 vCPU sizing: 8 → 16/24? (and the matching gunicorn `-w` bump
  as a separate compose bite)
- VM 101 (Torah demo) sizing: 8 vCPU / 16 GiB confirmed?
- iDRAC credential channel (out of band)
- Router: confirm the free 10 G SFP+ port for the X540 move (or its
  second port)

## 9. Shopping list

- 4× Dell 2.5-inch hot-swap caddies (listing includes none) — cheap on
  eBay; match R630 10-bay SFF
- X540-AT2 + SFP+ optics/DAC moved from the old box (verify what is
  plugged in before removal — if the link is a DAC, the DAC moves too)
- C13/C14 power cables ×2 (verify at arrival; rails included in listing)

## 10. Access, security and provenance

- `root@192.168.8.20`: this Mac's ed25519 key
  (`...EAt macbook`) installed 22.11.2026 for the audit and cutover-day
  ops. The bootstrap password was provided in chat — **rotation
  pending (operator)**; key access replaces it.
- All §4 measurements were read-only. The only write to date on the
  old box is the `sdc` insurance clone (an empty drive).
- The old box's `.env` (CF/DNS secrets) is created fresh on the new
  box at install — not copied, per `AGENT-OPS.md` §1 (the CF token
  value is reusable; the file itself is never moved).
- Provenance: measurement session 22.11.2026 (workspace paris-v1);
  operator's spec text §1–3 as provided 22.11.2026 (eBay item
  206683906368); KB evidence cited: costfn 32/28/22 GiB frame
  (`research/experiments/costfn/README.md`), the 537% encode receipt
  (`ubuntu-deployment/OPS-LOG.md`), the e2e-off-box changelog entry,
  gunicorn `-w 4` (`docker-compose.ecosystem.yml:113`).
