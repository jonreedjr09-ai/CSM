# CSM — Monthly Bonus Pool Updates

Two ways the crew finds out the current bonus pool, running side by side:

1. **SMS every Friday** — a script reads the pool total and crew phone
   numbers from a Google Sheet, then posts to a Zapier webhook that sends
   the text.
2. **Live chart in Google Slides** — a Google Apps Script reads the
   `Bonus Pool` history straight out of the real `TECH Bonus` tab on the
   [CSM NWA Master Sheet](https://docs.google.com/spreadsheets/d/1MoxQ2iP3ky_yvp63Ot84M_Fh4ofJsnsb5Lmutkz8Igo/edit),
   keeps a clean chart in sync, and refreshes it inside the
   [Crawlspace Medic — Monthly Bonus Pool](https://docs.google.com/presentation/d/1x_WK1lbaxCNWx8A4sPkQcq7kapbnl5Uq0v2439VE_S4/edit)
   slide deck on a schedule — no manual "Update" click.

```
Google Sheet  --(read)-->  script (GitHub Actions, every Friday)  --(webhook)-->  Zapier  --(SMS)-->  crew

CSM NWA Master Sheet (TECH Bonus tab)  --(Apps Script, every Friday)-->  chart  -->  Google Slides deck
```

No server to host for the SMS piece — it runs as a scheduled GitHub Actions
job. The Slides chart needs no hosting either — it runs inside Google's own
infrastructure via Apps Script.

## Part A: SMS every Friday (via Zapier)

### 1. Set up the Google Sheet

Create a Google Sheet with two tabs:

**`BonusPool`** — one row per month, last row is treated as current:

| Month     | Amount |
|-----------|--------|
| June 2026 | 12500  |
| July 2026 | 14200  |

**`Crew`** — one row per person. `Active` is optional; set to `no` to pause someone without deleting them:

| Name      | Phone         | Active |
|-----------|---------------|--------|
| Jamie Lee | +15551234567  |        |
| Sam Ortiz | +15559876543  | no     |

Use phone numbers in E.164 format (`+1...`) since that's what most SMS APIs expect.

### 2. Create a Google service account (read-only access to the sheet)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (or use an existing one) and enable the **Google Sheets API**.
2. Create a **Service Account**, then create a JSON key for it and download it.
3. Open your Google Sheet, click **Share**, and share it with the service account's email (`...@...iam.gserviceaccount.com`) as **Viewer**.
4. From the downloaded JSON, you'll need `client_email` and `private_key` for the secrets below.
5. The Sheet ID is the long string in the sheet's URL: `https://docs.google.com/spreadsheets/d/<THIS_PART>/edit`.

### 3. Set up the Zapier webhook

1. Create a new Zap starting with the **Webhooks by Zapier** trigger, event **Catch Hook**. Copy the generated webhook URL.
2. The script POSTs this JSON body:
   ```json
   {
     "month": "July 2026",
     "amount": 14200,
     "formattedAmount": "$14,200.00",
     "crew": [
       { "name": "Jamie Lee", "phone": "+15551234567", "message": "Hey Jamie Lee! The July 2026 bonus pool is $14,200.00. Nice work crew!" }
     ]
   }
   ```
3. Add a **Loop by Zapier** step, looping over `crew`.
4. Inside the loop, add your SMS action (e.g. **SMS by Zapier**, or whatever texting app you've connected in Zapier), sending `phone` and `message` from the current loop item.
5. Turn the Zap on.

### 4. Configure GitHub Actions secrets

In this repo's **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from the service account JSON |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | `private_key` from the service account JSON (keep the `\n` sequences as-is) |
| `GOOGLE_SHEET_ID` | the sheet ID from its URL |
| `ZAPIER_WEBHOOK_URL` | the Catch Hook URL from step 3 |

### 5. Schedule

`.github/workflows/bonus-pool-update.yml` runs every Friday at 15:00 UTC. Edit
the cron expression there to match your crew's timezone. You can also trigger
it manually any time from the **Actions** tab via **Run workflow**.

### Local testing

```bash
npm install
cp .env.example .env   # fill in real values
node --env-file=.env scripts/send-bonus-pool-update.mjs
```

### Customizing the message

Set the `MESSAGE_TEMPLATE` env var (or secret) to change the text. Supports
`{{name}}`, `{{month}}`, and `{{amount}}` placeholders. Default:

> Hey {{name}}! The {{month}} bonus pool is {{amount}}. Nice work crew!

## Part B: Live chart in Google Slides (via Apps Script)

This reads directly from your real spreadsheet — the
[CSM NWA Master Sheet](https://docs.google.com/spreadsheets/d/1MoxQ2iP3ky_yvp63Ot84M_Fh4ofJsnsb5Lmutkz8Igo/edit),
`TECH Bonus` tab, `Bonus Pool` row — so there's nothing to reformat by hand.
It keeps a chart current inside an already-created deck,
[Crawlspace Medic — Monthly Bonus Pool](https://docs.google.com/presentation/d/1x_WK1lbaxCNWx8A4sPkQcq7kapbnl5Uq0v2439VE_S4/edit).

The code lives at [`scripts/BonusPoolChart.gs`](scripts/BonusPoolChart.gs) —
GitHub can't run it for you (Apps Script only runs inside Google's
infrastructure under your own account), so it needs a one-time manual step:

1. Open the [CSM NWA Master Sheet](https://docs.google.com/spreadsheets/d/1MoxQ2iP3ky_yvp63Ot84M_Fh4ofJsnsb5Lmutkz8Igo/edit) → **Extensions → Apps Script**.
2. Delete any placeholder code and paste in the contents of `scripts/BonusPoolChart.gs`.
3. From the function dropdown at the top, select **`updateBonusPoolChart`** and click **Run** (▶). The first run will prompt you to authorize the script — this is Google requiring a human to grant permission; approve it (it only needs access to this Sheet and the one target Slide deck).
4. Check the [Slides deck](https://docs.google.com/presentation/d/1x_WK1lbaxCNWx8A4sPkQcq7kapbnl5Uq0v2439VE_S4/edit) — it should now have a bar chart of the bonus pool by month.
5. Select **`installWeeklyTrigger`** from the function dropdown and click **Run** once. This schedules `updateBonusPoolChart` to run automatically every Friday at 9am (your Google account's timezone) — after this, the chart stays current with zero manual clicks, even as new months get added to the `TECH Bonus` tab.

### How it finds the data

Every run, the script:
- Scans the `TECH Bonus` tab for the row containing the header `Bonus Pool`, then reads every month row below it (stopping at the first blank row) — this is where `MAY | $930 | 38.5 | ...` currently lives.
- Rewrites a clean `Month | Bonus Pool` table into a `Bonus Pool Chart Data` tab (created automatically) so the chart has something tidy to plot.
- Creates the chart the first time, or resizes its data range on later runs as new months get appended.
- Inserts the chart into the Slide the first time, or calls `.refresh()` on it thereafter so the Slide always reflects the latest numbers.

If you'd rather chart a different number (e.g. the crew reminder doc's
projected figures instead of the `TECH Bonus` tab), tell me and I'll point
the script at that source instead.
