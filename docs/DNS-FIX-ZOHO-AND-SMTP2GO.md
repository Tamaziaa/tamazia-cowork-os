# DNS fix · Zoho receive + SMTP2Go sender + spam-bypass
**Total time: 60-90 seconds in Cloudflare dashboard. Both issues fixed.**

The Tamazia CF token I have is Workers-scope only (can deploy + read DNS, can't edit DNS). I need you to apply these changes manually, OR create a new token with `Zone:DNS:Edit` scope on `tamazia.co.uk` and paste it as `CLOUDFLARE_API_TOKEN_DNS` in `.env` — then I'll complete it programmatically.

---

## Step 1 · Fix Zoho receive (founder@tamazia.co.uk)

Open: https://dash.cloudflare.com/?to=/:account/:zone/dns (select tamazia.co.uk)

**DELETE these 3 MX records** (currently routing to Cloudflare Email Routing instead of Zoho):

| Type | Name | Content | Priority |
|---|---|---|---|
| MX | tamazia.co.uk | route1.mx.cloudflare.net | 67 |
| MX | tamazia.co.uk | route2.mx.cloudflare.net | 53 |
| MX | tamazia.co.uk | route3.mx.cloudflare.net | 10 |

**ADD these 3 MX records** (Zoho EU servers — confirmed by your `zoho-verification=zb60522663.zmverify.zoho.eu` TXT):

| Type | Name | Content | Priority | TTL |
|---|---|---|---|---|
| MX | tamazia.co.uk | mx.zoho.eu | 10 | Auto |
| MX | tamazia.co.uk | mx2.zoho.eu | 20 | Auto |
| MX | tamazia.co.uk | mx3.zoho.eu | 50 | Auto |

**Propagation**: DNS updates take 5-15 min. Test with `dig MX tamazia.co.uk` after.

---

## Step 2 · Update SPF (single TXT record edit)

Find the existing TXT record on `tamazia.co.uk` whose value starts with `v=spf1` (you have one — id `48f5e5a35158d1c8cfb81fdce1d45515`).

**Replace its content with:**
```
v=spf1 include:zohomail.eu include:_spf.mx.cloudflare.net include:_spf.mailersend.net include:_spf.resend.com include:spf.brevo.com include:spf.smtp2go.com ~all
```

This adds:
- `include:zohomail.eu` (Zoho EU sending — for any reply you send from founder@tamazia.co.uk)
- `include:spf.smtp2go.com` (SMTP2Go sending — fixes the FROM_FMBLA_NEWDOM28 ding on Mail-Tester)

Keeps:
- Cloudflare, MailerSend, Resend, Brevo (already in use, don't break them)

---

## Step 3 · Verify the custom sender domain in SMTP2Go (kills the −0.8 spam-score ding)

1. Go to https://app.smtp2go.com/sending/senderdomains/
2. Click **Add Sender Domain** → enter `tamazia.co.uk`
3. SMTP2Go shows you ~4 DNS records to add (3 CNAMEs + 1 TXT). Copy each one.
4. Add them in Cloudflare DNS (Type, Name, Content as shown by SMTP2Go).
5. Click **Verify** in SMTP2Go dashboard.

Once verified, all outbound from `aman@tamazia.co.uk` via SMTP2Go uses the verified Tamazia domain in the bounce path → Mail-Tester score jumps from 9.4 to 9.9-10/10. No more "new bounce subdomain" warning.

---

## Step 4 · Quick verification after DNS propagation

Run this 15 minutes after applying the changes:

```bash
dig MX tamazia.co.uk +short
# Should return: 10 mx.zoho.eu., 20 mx2.zoho.eu., 50 mx3.zoho.eu.

dig TXT tamazia.co.uk +short | grep spf
# Should include: include:zohomail.eu include:spf.smtp2go.com
```

Then send a test email to founder@tamazia.co.uk — it should arrive in your Zoho inbox.

---

## Alternative: give me DNS-edit power

If you'd rather have me do all this programmatically next session:
1. Cloudflare dashboard → My Profile → API Tokens → Create Token
2. Template: **Edit zone DNS**
3. Zone Resources: include → specific zone → tamazia.co.uk
4. Create the token, copy the value
5. Add to `.env` as `CLOUDFLARE_API_TOKEN_DNS=...` (keep the existing `CLOUDFLARE_API_TOKEN` for Workers; we'll use the new one only for DNS edits)

Then I'll complete Steps 1-2 in 30 seconds + verify with `dig` + send a test email through Zoho.
