# GitHub Secrets — additions required for D5.7 Notion sync

Applies to: Tamaziaa/tamazia-cowork-os -> Settings -> Secrets and variables -> Actions.

## New individual secrets to add

NOTION_API_KEY  = <your-notion-integration-token>   (notion-sync.yml D5.7)
NEON_URL        = your Neon pooler connection string (notion-sync.yml D5.7)

The notion-sync.js script also loads these from ENV_B64 (.env), so if they are already
in ENV_B64 the individual secrets are belt-and-braces only. Either path works.

## D6.2 — cal_bookings reconcile: NO NEW SECRETS NEEDED

reconcile-cal-bookings.js is already wired into reconcile.js step 2b and runs nightly at
02:30 UTC via nightly-workers.yml. It reads the KV namespace configured in ENV_B64 via
CLOUDFLARE_API_TOKEN_FULL + CLOUDFLARE_ACCOUNT_ID -- both already present in ENV_B64.

The "cal_bookings = 0" state is expected while SEND is off (no bookings have arrived yet).
It will auto-populate on the first nightly run after a booking arrives.

## How to update ENV_B64 to include NOTION_API_KEY

1. Decode current value:  echo "$ENV_B64" | base64 -d > /tmp/current.env
2. Append:                echo 'NOTION_API_KEY=<your-token>' >> /tmp/current.env
3. Re-encode (Linux):     base64 -w0 /tmp/current.env
   Re-encode (macOS):     base64 /tmp/current.env
4. Paste into GitHub -> Settings -> Secrets -> ENV_B64 -> Update value.

## Notion integration setup (one-time)

The integration token must be connected to the cockpit page:
1. Open the Tamazia Cockpit B page in Notion
2. Click ... (page menu) -> Add connections -> find your integration -> Connect.
Without this step the Notion API returns 404 even with a valid token.
