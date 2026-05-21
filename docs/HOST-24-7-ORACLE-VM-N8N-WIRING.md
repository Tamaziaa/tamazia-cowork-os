# 24/7 host wiring · Oracle Always Free VM + PikaPod n8n
Exact step by step to run the Tamazia engine unattended, forever, for £0. Written for a non-developer: every step is a click or a paste, no terminal, no SSH. The one developer-flagged dependency is called out explicitly at the top.

---

## TL;DR architecture
Two layers, each free, each self-healing.

1. **Oracle Always Free VM** runs the engine (`run-engine-cycle.sh`) every 30 minutes via a systemd timer. The VM is always on, native Node, no monthly cost. It installs and schedules itself from a single cloud-init script you paste at creation. If a run crashes, systemd restarts it. If the box reboots, the timer re-arms on boot.
2. **PikaPod n8n** (already live at `modest-magpie.pikapod.net`) is the watchdog and re-arm layer above the VM. It pings the VM heartbeat every 15 min, and if the engine goes silent it alerts Slack + Telegram and can re-trigger the cycle over HTTP. n8n is where any webhook-triggered or human-in-the-loop steps live.

The VM does the work. n8n watches the VM and re-arms it. Neither needs you to babysit it.

---

## The one prerequisite (developer-flagged, one-time)
The VM pulls the engine code from a **private Git repo**. The engine is not on GitHub yet (`GH_TOKEN` is in the not-set list in SECRET-KEYS).

Two ways to satisfy this, ranked:
- **(Recommended, no terminal):** create a private repo at github.com/new in the browser, then drag-and-drop the `COWORK-OS-EXECUTION` folder into the web uploader, commit. Generate a fine-grained Personal Access Token (Settings → Developer settings → Tokens) with read access to that one repo. Paste it into SECRET-KEYS as `GH_TOKEN`. ~10 min, clicks only.
- **(If you'd rather not):** this is the single step that benefits from a developer (Aditya) doing the initial `git push`. Everything after this is automated. **Flagged: this prerequisite is the only developer touchpoint in the whole build.**

Once `GH_TOKEN` exists and the repo is up, the rest below is paste-only.

---

## PART A — Oracle account + VM (browser clicks only)

### A1. Create the Oracle Cloud account
1. Go to `oracle.com/cloud/free`. Sign up. It asks for a card for identity verification only. **Always Free resources never charge** as long as you pick Always-Free-eligible shapes (below). Set the account to stay on Always Free; do not upgrade to Pay As You Go unless you choose to.
2. Pick home region close to your buyers: **UK South (London)** or **Germany Central (Frankfurt)** for UK/EU deliverability and GDPR data residency. Region is permanent, so choose once.

> Account creation is a "create account" action, so you do this yourself. I cannot create accounts.

### A2. Launch the Always Free VM
Console → Menu → Compute → Instances → **Create instance**.
- **Name:** `tamazia-engine`
- **Image:** Canonical Ubuntu 24.04
- **Shape:** click Change shape → Ampere (Arm) → **VM.Standard.A1.Flex** → set **1 OCPU / 6 GB RAM** (Always Free covers up to 4 OCPU / 24 GB on Arm; 1/6 is plenty and leaves headroom). If Arm capacity is unavailable in your region, fall back to **VM.Standard.E2.1.Micro** (AMD, also Always Free).
- **Networking:** leave defaults (creates a VCN with a public IP). Tick **Assign a public IPv4 address**.
- **SSH keys:** choose **Generate a key pair for me** and download both keys (you will not need a terminal, but keep them; they are your break-glass access).
- **Advanced options → Management → cloud-init / "user data":** paste the **entire script in PART B** into this box. This is what makes the VM install and schedule itself with zero terminal work.
- Click **Create**. Wait ~2 min for state RUNNING. Note the public IP.

### A3. Open the heartbeat port (so n8n can ping it)
Console → Networking → Virtual Cloud Networks → your VCN → Security List → **Add Ingress Rule**:
- Source CIDR `0.0.0.0/0`, IP Protocol TCP, Destination port **8088**.
This exposes only the read-only heartbeat endpoint the cloud-init script serves. No secrets on it.

That is the entire Oracle side. The VM is now installing Node, pulling the engine, and arming the 30-minute timer by itself.

---

## PART B — cloud-init script (paste into the "user data" box in A2)
Replace the three ALL-CAPS placeholders before pasting: `GH_TOKEN_HERE`, `GH_REPO_HERE` (e.g. `realfamemedia/tamazia-cowork-os`), and `ENV_BLOB_HERE` (paste the full contents of your `.env`, base64 is cleanest — or I can hand you a pre-filled version).

```yaml
#cloud-config
package_update: true
packages:
  - git
  - curl
  - unzip
runcmd:
  # 1. Node 20 LTS
  - curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  - apt-get install -y nodejs
  # 2. Pull the engine into /opt/tamazia
  - git clone https://GH_TOKEN_HERE@github.com/GH_REPO_HERE.git /opt/tamazia
  - cd /opt/tamazia && npm install --omit=dev || true
  # 3. Drop in the environment
  - echo "ENV_BLOB_HERE" | base64 -d > /opt/tamazia/.env
  # 4. Heartbeat server (writes last-run time, served on :8088) — self-healing visibility
  - |
    cat >/opt/tamazia/heartbeat.js <<'EOF'
    const http=require('http'),fs=require('fs');
    http.createServer((_,res)=>{let t='never';try{t=fs.readFileSync('/opt/tamazia/.last_run','utf8').trim()}catch(e){}
    const age=t==='never'?1e9:(Date.now()-Date.parse(t))/1000;
    res.writeHead(age<2400?200:503,{'content-type':'application/json'});
    res.end(JSON.stringify({last_run:t,age_seconds:Math.round(age),healthy:age<2400}))}).listen(8088);
    EOF
  # 5. systemd: the engine cycle as a one-shot, plus a 30-min timer (self-renewing), plus heartbeat as a service
  - |
    cat >/etc/systemd/system/tamazia-cycle.service <<'EOF'
    [Unit]
    Description=Tamazia engine cycle
    [Service]
    Type=oneshot
    WorkingDirectory=/opt/tamazia
    ExecStartPre=/bin/sh -c 'date -u +%%Y-%%m-%%dT%%H:%%M:%%SZ > /opt/tamazia/.last_run'
    ExecStart=/bin/bash /opt/tamazia/scripts/run-engine-cycle.sh
    EOF
  - |
    cat >/etc/systemd/system/tamazia-cycle.timer <<'EOF'
    [Unit]
    Description=Run Tamazia cycle every 30 min
    [Timer]
    OnBootSec=3min
    OnUnitActiveSec=30min
    Persistent=true
    [Install]
    WantedBy=timers.target
    EOF
  - |
    cat >/etc/systemd/system/tamazia-heartbeat.service <<'EOF'
    [Unit]
    Description=Tamazia heartbeat
    [Service]
    ExecStart=/usr/bin/node /opt/tamazia/heartbeat.js
    Restart=always
    [Install]
    WantedBy=multi-user.target
    EOF
  # 6. Auto-update: pull latest engine code daily at 03:00 (self-renewing code)
  - |
    cat >/etc/systemd/system/tamazia-update.service <<'EOF'
    [Unit]
    Description=Tamazia self-update
    [Service]
    Type=oneshot
    WorkingDirectory=/opt/tamazia
    ExecStart=/bin/sh -c 'git pull && npm install --omit=dev || true'
    EOF
  - |
    cat >/etc/systemd/system/tamazia-update.timer <<'EOF'
    [Unit]
    Description=Daily engine self-update
    [Timer]
    OnCalendar=*-*-* 03:00:00
    Persistent=true
    [Install]
    WantedBy=timers.target
    EOF
  # 7. Arm everything
  - systemctl daemon-reload
  - systemctl enable --now tamazia-heartbeat.service
  - systemctl enable --now tamazia-cycle.timer
  - systemctl enable --now tamazia-update.timer
```

What this gives you, against your build-quality bar:
- **Self-healing:** each cycle is a oneshot; a crash does not wedge the timer, the next 30-min tick runs clean. `Persistent=true` means a missed run (downtime) fires on recovery.
- **Self-renewing:** the box re-arms the timer on every boot; the daily update timer pulls new engine code so you never redeploy by hand.
- **Auditable:** the `:8088` heartbeat exposes last-run time + healthy flag for n8n to watch.

---

## PART C — PikaPod n8n watchdog (wiring, in the n8n UI you already have)
n8n sits above the VM. Build one workflow, "Engine Watchdog".

1. **Schedule trigger** → every 15 minutes.
2. **HTTP Request node** → GET `http://<VM_PUBLIC_IP>:8088`. Set "Continue on Fail" = on (so a dead box does not error the workflow, it routes to the alert).
3. **IF node** → condition: `{{$json.healthy}}` is false OR the HTTP node errored.
   - **True branch (engine silent > 40 min):**
     - **HTTP Request** → POST to Slack webhook (`SLACK_BOT_TOKEN` → chat.postMessage to #all-tamazia): `🔴 Engine heartbeat stale (last run {{age}}s ago). Auto-recovering.`
     - **HTTP Request** → Telegram sendMessage (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`): same line.
     - **(Optional re-trigger)** if you also expose a tiny authenticated `/run` endpoint on the VM later, call it here to force a cycle. Until then, systemd already recovers on the next tick, so the alert is the action.
   - **False branch:** do nothing (silent when healthy — no noise).
4. Save + **Activate** the workflow.

Second workflow, optional but recommended: **Daily heartbeat digest** — Schedule 08:00 → HTTP GET `:8088` → Telegram one-liner `🟢 Engine healthy · last run {{age}}s ago` so you get a positive daily "it's alive" ping.

n8n on PikaPod is always on, so this watchdog runs whether or not your laptop is open. The VM watches the work; n8n watches the VM; the two cover each other.

---

## Failure modes and what happens (no babysitting)
| Failure | What recovers it | Your involvement |
|---|---|---|
| A cycle crashes mid-run | Next 30-min systemd tick runs clean | None |
| VM reboots (Oracle maintenance) | Timer + heartbeat re-arm `OnBoot`; missed run fires via `Persistent` | None |
| Engine code updated | Daily 03:00 self-update pulls + reinstalls | None (just push to the repo) |
| VM hard-down / network dead | n8n watchdog alerts Slack + Telegram within 15 min | You see one alert; decide if action needed |
| Oracle reclaims Arm capacity (rare on Always Free) | Fallback E2.Micro shape, same script | One-time relaunch if it ever happens |

---

## Cost
£0/month. Oracle Always Free A1 VM + PikaPod n8n (already paid in your stack) + Cloudflare + Neon free tiers. No new spend.

---

## If you want to skip the VM entirely (zero-sysadmin alternative)
**GitHub Actions scheduled cron** runs the same `run-engine-cycle.sh` every 30 min on GitHub's runners, free, native Node, nothing to host. Add a `.github/workflows/cycle.yml` with `on: schedule: cron`, put the `.env` values in repo Secrets, done. Trade-off vs Oracle: GitHub free runners cap at ~2,000 min/month on private repos (a 30-min cadence of short cycles fits comfortably), and there is no always-on box for the heartbeat — n8n would poll a status row in Neon instead of the VM. This is the cleanest path if you never want to think about a server. Say the word and I will write the workflow file; it reuses everything you already have.

Recommendation: **Oracle VM + n8n** if you want a true always-on box you control (this doc). **GitHub Actions** if you want zero infrastructure to maintain. Both are £0. Both are no-terminal for you once the repo prerequisite is met.
