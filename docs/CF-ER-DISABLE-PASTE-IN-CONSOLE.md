# Disable Cloudflare Email Routing · 30-second paste-in-console

Cloudflare blocks write-API calls from automated browser sessions, but accepts them from your normal Chrome. So paste this snippet into your own Chrome's DevTools console — it uses your existing CF session.

## Step-by-step

1. Open this URL in your normal Chrome (the one where you're logged into Cloudflare):
   ```
   https://dash.cloudflare.com/78c7941714fccce82e777108db054961/tamazia.co.uk/email/routing/routes
   ```
   Wait for the page to actually load (cards visible, not just spinner).

2. Open DevTools: **Cmd+Option+J** on macOS. The Console tab should be active.

3. Paste this entire block into the console and press **Return**:

```js
(async () => {
  const ZONE = 'a564b60458bb5eec33bbe7f13eb0e4e1';
  const bc = JSON.parse(localStorage.getItem('bootstrap-cache') || '{}');
  const atok = bc.atok;
  if (!atok) { console.error('NO ATOK — page not fully loaded. Wait 10s and retry.'); return; }
  console.log('atok loaded · firing disable POST...');
  const r = await fetch(`/api/v4/zones/${ZONE}/email/routing/disable`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Atok': atok, 'X-Requested-With': 'XMLHttpRequest' },
    body: '{}'
  });
  const j = await r.json().catch(() => ({}));
  console.log('STATUS:', r.status);
  console.log('SUCCESS:', j.success);
  console.log('RESULT:', j.result);
  console.log('ERRORS:', j.errors);
  if (j.success) console.log('OK · Email Routing disabled. The 3 MX records are now editable.');
  else console.log('NOT OK · paste the errors above to me.');
})();
```

4. Look at the console output. You want to see:
   ```
   STATUS: 200
   SUCCESS: true
   OK · Email Routing disabled. The 3 MX records are now editable.
   ```

5. The moment you see that, message me and I run `bash scripts/zoho-mx-apply.sh` which deletes the 3 CF MX records and adds the 3 Zoho EU MX records in one shot, then sends a test email.

## If the page won't load

CF dashboard can be slow. Try:
- Hard refresh: Cmd+Shift+R
- Disable any uBlock / Privacy Badger / ad blocker for dash.cloudflare.com (CF sometimes ghosts blockers)
- Try in an Incognito window after signing in there

## If the snippet errors

Paste the exact console output to me. If it says NO ATOK, the page didn't finish loading — wait longer. If it says STATUS: 403, CF wants additional verification — drop me the full `j` printout and I'll adapt.

## Fallback if the snippet won't work either: click path

If you really want the button: same URL above, then look for a "Settings" sub-tab in the left sidebar under "Email > Email Routing". On the Settings page, scroll all the way to the bottom. The "Disable Email Routing" button sits in a red-bordered "Danger Zone" section. Click it. CF asks for confirmation. Confirm. Done.

If "Settings" sub-tab isn't visible: in the left sidebar click "Email" → look for "Email Routing" → there should be a gear/cog icon next to the section title. That opens settings.

If still not visible, your account view may be different. Send me a screenshot of what you see on the /routing/routes URL and I'll mark up exactly where to click.
