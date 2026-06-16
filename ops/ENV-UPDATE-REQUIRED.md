# ENV_B64 Update Required

All environment variables live in the GitHub Actions secret `ENV_B64` (base64-encoded `.env`).
This file lists every variable that is missing or blank and the exact steps to update the secret.

## Priority 1 -- Unlocks serp-top + serp-maps scrapers (currently 0 leads from SERP)

Run `ops/searxng-setup.sh` on the Oracle VM first, then add:

    SEARXNG_URL=http://150.230.118.117:8888

Once this variable is set, `free-serp.js` routes through SearXNG before Brave/DDG, giving
unlimited SERP queries at £0. The serp-top and serp-maps scrapers will start yielding leads
on the next engine-cycle run.

If the Oracle VM IP ever changes (e.g. upgrade to A1.Flex), update this value to the new IP.

## Priority 2 -- Register scrapers (currently skipped due to missing keys)

Companies House (companies-house scraper):

    CH_API_KEY=<from developer.company-information.service.gov.uk -- free, instant>

CQC (cqc scraper -- healthcare sector):

    CQC_API_KEY=<from cqc.org.uk/about-us/transparency/using-cqc-data -- free key>
    CQC_PARTNER_CODE=<from CQC registration -- may need form submission>

FCA (fca scraper -- finance sector):

    FCA_API_EMAIL=<email used to register at register.fca.org.uk>
    FCA_API_KEY=<from FCA API portal -- free>

## Priority 3 -- Signal scrapers

Meta Ads (social_ads scraper):

    META_AD_TOKEN=<from developers.facebook.com -- free, requires Meta developer account>

## Priority 4 -- Integrations already purchased or authorised

    NOTION_API_KEY=<your Notion integration token from notion.so/my-integrations>

## Priority 5 -- Deferred (spend not yet approved)

    REOON_KEY=<purchase at emailverifier.reoon.com -- replaces free verify fallback>
    ANYMAILFINDER_KEY=<purchase at anymailfinder.com ~$39/mo -- best UK/ME finder>

## How to update ENV_B64

Run these commands on your local Mac:

Step 1: Decode current secret to a temp file

    echo "PASTE_CURRENT_ENV_B64_VALUE_HERE" | base64 -d > /tmp/current.env

Step 2: Add the missing variables

    nano /tmp/current.env

Step 3: Encode the updated file

    base64 /tmp/current.env | tr -d '\n'

Step 4: Copy the output and paste into:
GitHub -> tamazia-cowork-os -> Settings -> Secrets -> ENV_B64 -> Update secret

Step 5: Clean up

    rm /tmp/current.env

After updating, trigger a manual run of engine-cycle to verify the new variables are picked up.

## Verification

Check the engine-cycle run log for:

- [serp-top] provider: searxng   -- SearXNG routing correctly
- [serp-maps] provider: searxng  -- maps scraper also routed
- No "SEARXNG_URL not set" warnings in qualify/enrich logs
