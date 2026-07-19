#!/usr/bin/env node
// Reads the current bonus pool + crew list from a Google Sheet, then POSTs
// the data to a Zapier webhook, which fans it out as SMS to the crew.
//
// Required env vars:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL   service account client_email
//   GOOGLE_SERVICE_ACCOUNT_KEY     service account private_key (with \n escapes intact)
//   GOOGLE_SHEET_ID                the sheet's ID (from its URL)
//   ZAPIER_WEBHOOK_URL             "Catch Hook" URL from a Zapier "Webhooks by Zapier" trigger
//
// Optional env vars:
//   BONUS_POOL_RANGE   default "BonusPool!A2:B"   (Month | Amount, last non-empty row wins)
//   CREW_RANGE         default "Crew!A2:C"        (Name | Phone | Active)
//   CURRENCY           default "USD"
//   MESSAGE_TEMPLATE   default below; supports {{name}}, {{month}}, {{amount}}

import { JWT } from "google-auth-library";

const required = [
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_KEY",
  "GOOGLE_SHEET_ID",
  "ZAPIER_WEBHOOK_URL",
];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

const {
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_SERVICE_ACCOUNT_KEY,
  GOOGLE_SHEET_ID,
  ZAPIER_WEBHOOK_URL,
  BONUS_POOL_RANGE = "BonusPool!A2:B",
  CREW_RANGE = "Crew!A2:C",
  CURRENCY = "USD",
  MESSAGE_TEMPLATE = "Hey {{name}}! The {{month}} bonus pool is {{amount}}. Nice work crew!",
} = process.env;

async function getAccessToken() {
  const client = new JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    // Support both literal newlines and escaped "\n" (common when stored as a GitHub secret).
    key: GOOGLE_SERVICE_ACCOUNT_KEY.includes("\\n")
      ? GOOGLE_SERVICE_ACCOUNT_KEY.replace(/\\n/g, "\n")
      : GOOGLE_SERVICE_ACCOUNT_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const { token } = await client.getAccessToken();
  return token;
}

async function readRange(token, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${encodeURIComponent(
    range
  )}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(
      `Failed to read range "${range}": ${res.status} ${await res.text()}`
    );
  }
  const { values = [] } = await res.json();
  return values;
}

function parseBonusPool(rows) {
  const lastRow = [...rows].reverse().find((row) => row[0] && row[1] != null && row[1] !== "");
  if (!lastRow) {
    throw new Error(`No bonus pool data found in range "${BONUS_POOL_RANGE}"`);
  }
  const [month, rawAmount] = lastRow;
  const amount = Number(String(rawAmount).replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(amount)) {
    throw new Error(`Could not parse bonus pool amount from "${rawAmount}"`);
  }
  return { month, amount };
}

function parseCrew(rows) {
  return rows
    .filter(([name, phone, active]) => name && phone && active !== "no" && active !== "false")
    .map(([name, phone]) => ({ name: name.trim(), phone: phone.trim() }));
}

function formatAmount(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: CURRENCY }).format(amount);
}

function renderMessage(template, { name, month, amount }) {
  return template
    .replaceAll("{{name}}", name)
    .replaceAll("{{month}}", month)
    .replaceAll("{{amount}}", amount);
}

async function main() {
  const token = await getAccessToken();
  const [bonusPoolRows, crewRows] = await Promise.all([
    readRange(token, BONUS_POOL_RANGE),
    readRange(token, CREW_RANGE),
  ]);

  const { month, amount } = parseBonusPool(bonusPoolRows);
  const formattedAmount = formatAmount(amount);
  const crew = parseCrew(crewRows);

  if (crew.length === 0) {
    console.error(`No active crew members found in range "${CREW_RANGE}"`);
    process.exit(1);
  }

  const payload = {
    month,
    amount,
    formattedAmount,
    crew: crew.map((member) => ({
      ...member,
      message: renderMessage(MESSAGE_TEMPLATE, { name: member.name, month, amount: formattedAmount }),
    })),
  };

  const res = await fetch(ZAPIER_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Zapier webhook call failed: ${res.status} ${await res.text()}`);
  }

  console.log(
    `Sent ${month} bonus pool update (${formattedAmount}) to ${crew.length} crew member(s).`
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
