# CSM — Monthly Bonus Pool Updates

Automatically texts the crew the current bonus pool amount every Friday. A
script reads the pool total and crew phone numbers from a Google Sheet, then
posts the data to a Zapier webhook, which sends the SMS.

```
Google Sheet  --(read)-->  script (GitHub Actions, every Friday)  --(webhook)-->  Zapier  --(SMS)-->  crew
```

No server to host — the whole thing runs as a scheduled GitHub Actions job.

## 1. Set up the Google Sheet

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

## 2. Create a Google service account (read-only access to the sheet)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (or use an existing one) and enable the **Google Sheets API**.
2. Create a **Service Account**, then create a JSON key for it and download it.
3. Open your Google Sheet, click **Share**, and share it with the service account's email (`...@...iam.gserviceaccount.com`) as **Viewer**.
4. From the downloaded JSON, you'll need `client_email` and `private_key` for the secrets below.
5. The Sheet ID is the long string in the sheet's URL: `https://docs.google.com/spreadsheets/d/<THIS_PART>/edit`.

## 3. Set up the Zapier webhook

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

## 4. Configure GitHub Actions secrets

In this repo's **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from the service account JSON |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | `private_key` from the service account JSON (keep the `\n` sequences as-is) |
| `GOOGLE_SHEET_ID` | the sheet ID from its URL |
| `ZAPIER_WEBHOOK_URL` | the Catch Hook URL from step 3 |

## 5. Schedule

`.github/workflows/bonus-pool-update.yml` runs every Friday at 15:00 UTC. Edit
the cron expression there to match your crew's timezone. You can also trigger
it manually any time from the **Actions** tab via **Run workflow**.

## Local testing

```bash
npm install
cp .env.example .env   # fill in real values
node --env-file=.env scripts/send-bonus-pool-update.mjs
```

## Customizing the message

Set the `MESSAGE_TEMPLATE` env var (or secret) to change the text. Supports
`{{name}}`, `{{month}}`, and `{{amount}}` placeholders. Default:

> Hey {{name}}! The {{month}} bonus pool is {{amount}}. Nice work crew!
