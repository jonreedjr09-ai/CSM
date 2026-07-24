// Google Apps Script — bind this to the "CSM NWA Master Sheet" spreadsheet
// (Extensions > Apps Script from that Sheet, paste this in as Code.gs).
//
// What it does, every time updateBonusPoolChart() runs:
//   1. Reads the "Bonus Pool" row(s) out of the messy TECH Bonus tab.
//   2. Writes a clean Month | Bonus Pool table to a "Bonus Pool Chart Data" tab.
//   3. Creates a column chart from that clean table (once), or resizes its
//      data range to match as new months are added.
//   4. Inserts that chart into the target Slide (once), or calls .refresh()
//      on it so the Slide always shows the latest numbers — no manual
//      "Update" click needed.
//
// One-time setup (run these from the Apps Script editor, top toolbar ▶ Run):
//   1. updateBonusPoolChart   — builds the data tab + chart, inserts it into the Slide.
//      Google will prompt you to authorize the script the first time — approve it.
//   2. installWeeklyTrigger   — schedules updateBonusPoolChart to run every Friday morning.
// After that it's fully automatic.

const SHEET_ID = '1MoxQ2iP3ky_yvp63Ot84M_Fh4ofJsnsb5Lmutkz8Igo'; // CSM NWA Master Sheet
const SLIDE_ID = '1x_WK1lbaxCNWx8A4sPkQcq7kapbnl5Uq0v2439VE_S4';  // Crawlspace Medic — Monthly Bonus Pool
const TECH_BONUS_SHEET_NAME = 'TECH Bonus';
const CHART_DATA_SHEET_NAME = 'Bonus Pool Chart Data';

function updateBonusPoolChart() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const history = readBonusPoolHistory(ss);
  if (history.length === 0) {
    throw new Error(`No "Bonus Pool" row found on the "${TECH_BONUS_SHEET_NAME}" tab.`);
  }

  const dataSheet = writeChartData(ss, history);
  const chart = getOrCreateChart(dataSheet, history.length);
  syncChartToSlide(chart);

  Logger.log(`Synced ${history.length} month(s), latest: ${history[history.length - 1].month}`);
}

function readBonusPoolHistory(ss) {
  const sheet = ss.getSheetByName(TECH_BONUS_SHEET_NAME);
  if (!sheet) throw new Error(`Tab "${TECH_BONUS_SHEET_NAME}" not found.`);

  const values = sheet.getDataRange().getValues();
  let headerRow = -1;
  let bonusPoolCol = -1;
  for (let r = 0; r < values.length; r++) {
    const col = values[r].indexOf('Bonus Pool');
    if (col !== -1) {
      headerRow = r;
      bonusPoolCol = col;
      break;
    }
  }
  if (headerRow === -1) return [];

  const history = [];
  for (let r = headerRow + 1; r < values.length; r++) {
    const month = values[r][0];
    const rawAmount = values[r][bonusPoolCol];
    if (!month || rawAmount === '' || rawAmount == null) break; // stop at the first blank row
    const amount = Number(String(rawAmount).replace(/[^0-9.-]/g, ''));
    if (Number.isNaN(amount)) break;
    history.push({ month: String(month).trim(), amount });
  }
  return history;
}

function writeChartData(ss, history) {
  let dataSheet = ss.getSheetByName(CHART_DATA_SHEET_NAME);
  if (!dataSheet) {
    dataSheet = ss.insertSheet(CHART_DATA_SHEET_NAME);
  }
  dataSheet.getDataRange().clearContent();
  const rows = [['Month', 'Bonus Pool'], ...history.map((h) => [h.month, h.amount])];
  dataSheet.getRange(1, 1, rows.length, 2).setValues(rows);
  return dataSheet;
}

function getOrCreateChart(dataSheet, monthCount) {
  const range = dataSheet.getRange(1, 1, monthCount + 1, 2);
  const existing = dataSheet.getCharts();
  if (existing.length > 0) {
    const updated = existing[0].modify().clearRanges().addRange(range).build();
    dataSheet.updateChart(updated);
    return updated;
  }
  const chart = dataSheet
    .newChart()
    .asColumnChart()
    .addRange(range)
    .setNumHeaders(1)
    .setTitle('Monthly Bonus Pool')
    .setPosition(2, 4, 0, 0)
    .build();
  dataSheet.insertChart(chart);
  return chart;
}

function syncChartToSlide(sheetChart) {
  const presentation = SlidesApp.openById(SLIDE_ID);
  const slide = presentation.getSlides()[0];
  const existingCharts = slide.getSheetsCharts();
  if (existingCharts.length > 0) {
    existingCharts.forEach((c) => c.refresh());
  } else {
    slide.insertSheetsChart(sheetChart);
  }
}

function installWeeklyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'updateBonusPoolChart')
    .forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('updateBonusPoolChart')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(9)
    .create();

  Logger.log('Weekly Friday 9am trigger installed.');
}
