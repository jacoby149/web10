# ubuntu-deployment

One-shot deploy script for a fresh Ubuntu VM on Proxmox.

## Quick start

1. Create a fresh Ubuntu VM on Proxmox (see `create-vm.sh` or do it manually)
2. SSH into the VM
3. Run the deploy script:
   ```bash
   curl -fsSL <url-to-this-script> | sudo bash
   ```
   Or copy the script to the VM and run `sudo bash ubuntu-deploy.sh`

## What it installs

- **Docker + Docker Compose** — for running web10 services
- **Caddy** — reverse proxy with automatic TLS (Let's Encrypt)
- **web10 node** — api + ui + rtc + minio (docker compose)
- **marketing site** — marketing-ui + marketing-api

## After deployment

```bash
# Start the web10 node
cd /opt/web10-node && docker compose up -d

# Check logs
docker compose logs -f

# Caddy logs
journalctl -u caddy -f
```

## DNS

Point your domains to the VM's IP. Caddy will auto-provision TLS certs
once DNS resolves. No manual cert management needed.

## Manual VM creation on Proxmox

If you don't have SSH keys set up, use the Proxmox web UI:

1. **Create VM** → QEMU → Next
2. **OS**: Download an image from a mirror → Ubuntu 24.04 LTS → Next
3. **System**: Use UEFI, SecureBoot off → Next
4. **CPU**: 2 cores → Next
5. **Memory**: 4096 MB → Next
6. **Hard Disk**: 32 GB, SCSI controller → Next
7. **Network**: virtio → Next
8. **Confirm** → Finish

Then set up SSH keys on the VM and run the deploy script.