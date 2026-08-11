// Google Apps Script — bind this to the "Job Audit Sheet" spreadsheet
// (Extensions > Apps Script from that Sheet, paste this in as Code.gs).
//
// What it does, every time updateBonusPoolChart() runs:
//   1. Reads the Month | Total Revenue | Potential | Current summary table
//      (the one with rows like "August | | $1,613.09 | $1,436.08").
//   2. Writes a clean Month | Potential | Actual table to a
//      "Bonus Pool Chart Data" tab.
//   3. Creates a two-series column chart from that clean table (once), or
//      resizes its data range to match as new months get filled in.
//   4. Inserts that chart into the target Slide (once), or calls .refresh()
//      on it so the Slide always shows the latest numbers — no manual
//      "Update" click needed.
//
// One-time setup (run these from the Apps Script editor, top toolbar ▶ Run):
//   1. updateBonusPoolChart   — builds the data tab + chart, inserts it into the Slide.
//      Google will prompt you to authorize the script the first time — approve it.
//   2. installWeeklyTrigger   — schedules updateBonusPoolChart to run every Friday morning.
// After that it's fully automatic.

const SHEET_ID = '1wZgv2fty0WkC0QBhgX8jHcqWnmYPxDmSnPNP4NrrCUo'; // Job Audit Sheet
const SLIDE_ID = '1x_WK1lbaxCNWx8A4sPkQcq7kapbnl5Uq0v2439VE_S4';  // Crawlspace Medic — Monthly Bonus Pool
const CHART_DATA_SHEET_NAME = 'Bonus Pool Chart Data';

function updateBonusPoolChart() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const history = readBonusPoolHistory(ss);
  if (history.length === 0) {
    throw new Error('Could not find the Month / Total Revenue / Potential / Current summary table.');
  }

  const dataSheet = writeChartData(ss, history);
  const chart = getOrCreateChart(dataSheet, history.length);
  syncChartToSlide(chart);

  Logger.log(`Synced ${history.length} month(s), latest: ${history[history.length - 1].month}`);
}

function readBonusPoolHistory(ss) {
  // Scans every sheet/tab for the "Total Revenue" header, since that block
  // sits a few columns to the right of the per-job table, not at A1.
  let headerRow = -1;
  let revenueCol = -1;
  let values = null;

  for (const sheet of ss.getSheets()) {
    const data = sheet.getDataRange().getValues();
    for (let r = 0; r < data.length; r++) {
      const col = data[r].indexOf('Total Revenue');
      if (col !== -1) {
        headerRow = r;
        revenueCol = col;
        values = data;
        break;
      }
    }
    if (values) break;
  }
  if (!values) return [];

  const monthCol = revenueCol - 1;
  const potentialCol = revenueCol + 1;
  const currentCol = revenueCol + 2;

  const history = [];
  for (let r = headerRow + 1; r < values.length; r++) {
    const month = values[r][monthCol];
    const rawPotential = values[r][potentialCol];
    const rawCurrent = values[r][currentCol];
    if (!month) break;
    if (rawPotential === '' && rawCurrent === '') break; // future months with no data yet
    history.push({
      month: String(month).trim(),
      potential: toNumber(rawPotential),
      current: toNumber(rawCurrent),
    });
  }
  return history;
}

function toNumber(raw) {
  if (raw === '' || raw == null) return 0;
  const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

function writeChartData(ss, history) {
  let dataSheet = ss.getSheetByName(CHART_DATA_SHEET_NAME);
  if (!dataSheet) {
    dataSheet = ss.insertSheet(CHART_DATA_SHEET_NAME);
  }
  dataSheet.getDataRange().clearContent();
  const rows = [
    ['Month', 'Potential Pool', 'Actual Pool'],
    ...history.map((h) => [h.month, h.potential, h.current]),
  ];
  dataSheet.getRange(1, 1, rows.length, 3).setValues(rows);
  return dataSheet;
}

function getOrCreateChart(dataSheet, monthCount) {
  const range = dataSheet.getRange(1, 1, monthCount + 1, 3);
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
    .setTitle('Monthly Bonus Pool — Potential vs. Actual')
    .setPosition(2, 5, 0, 0)
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
