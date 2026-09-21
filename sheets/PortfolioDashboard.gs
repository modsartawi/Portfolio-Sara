/**
 * IT Executive Portfolio Hub — spreadsheet edition.
 *
 * Rebuilds four tabs from the raw data tab, reproducing what the React app shows:
 *   Calc      hidden helpers: normalised dates + derived status  (statusOf())
 *   Overview  KPI tiles + department cards                        (<Overview/>)
 *   Projects  search + department/owner filters + RAG table       (<Projects/>)
 *   Timeline  8-quarter Gantt coloured by status                  (<Timeline/>)
 *
 * Install: Extensions > Apps Script, paste, Save, run buildDashboard once
 * (approve the permission prompt). Afterwards use the "Portfolio Hub" menu.
 *
 * The raw data tab is never written to. The four tabs above are DELETED and
 * recreated on every run, so don't hand-edit them — change this file instead.
 */

var MAXROWS = 1000;                 // rows of the data tab the formulas cover
var DEPT_ROWS = 60;                 // max departments rendered on Overview
var QUARTERS = 8;                   // timeline width, matches the app
var HEADERS = ['Project Name', 'Project Impact', 'Start Date', 'End Date', 'Project Owner', 'Department'];
var BUILT = ['Calc', 'Overview', 'Projects', 'Timeline'];

var C = {
  ink: '#1f2430', muted: '#5f6675', line: '#dfe3ea', head: '#eef1f6', panel: '#f8f9fb',
  Active: '#2f6fed', Upcoming: '#e0912f', Completed: '#1f9d55', Undated: '#9aa0a6'
};
var STATUSES = ['Active', 'Upcoming', 'Completed', 'Undated'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Portfolio Hub')
    .addItem('Rebuild dashboard', 'buildDashboard')
    .addToUi();
}

function buildDashboard() {
  var ss = SpreadsheetApp.getActive();
  var data = findDataSheet_(ss);
  var D = quote_(data.getName());

  BUILT.forEach(function (n) {
    var s = ss.getSheetByName(n);
    if (s) ss.deleteSheet(s);
  });

  var calc = buildCalc_(ss, D);
  var over = buildOverview_(ss, D);
  buildProjects_(ss, D);
  buildTimeline_(ss, D);

  calc.hideSheet();
  ss.setActiveSheet(over);
  SpreadsheetApp.flush();
}

/* ------------------------------------------------------------------ Calc */

function buildCalc_(ss, D) {
  var s = ss.insertSheet('Calc');
  shape_(s, MAXROWS, 6);

  s.getRange('A1:F1').setValues([['Start', 'End', 'Status', '', 'Departments', 'Owners']]);

  // Dates arrive as text ("10-Sep-2026") from the CSV, so normalise before use.
  s.getRange('A2').setFormula(
    '=ARRAYFORMULA(IF(' + D + '!A2:A' + MAXROWS + '="","",' + norm_(D + '!C2:C' + MAXROWS) + '))');
  s.getRange('B2').setFormula(
    '=ARRAYFORMULA(IF(' + D + '!A2:A' + MAXROWS + '="","",' + norm_(D + '!D2:D' + MAXROWS) + '))');

  // Mirror of statusOf(): undated / upcoming / completed / active.
  s.getRange('C2').setFormula(
    '=ARRAYFORMULA(IF(' + D + '!A2:A' + MAXROWS + '="","",' +
    'IF((A2:A' + MAXROWS + '="")*(B2:B' + MAXROWS + '=""),"Undated",' +
    'IF((A2:A' + MAXROWS + '<>"")*(TODAY()<A2:A' + MAXROWS + '),"Upcoming",' +
    'IF((B2:B' + MAXROWS + '<>"")*(TODAY()>B2:B' + MAXROWS + '),"Completed","Active")))))');

  // Lists backing the Projects dropdowns.
  s.getRange('E2').setFormula(list_(D + '!F2:F' + MAXROWS));
  s.getRange('F2').setFormula(list_(D + '!E2:E' + MAXROWS));

  s.getRange('A2:B').setNumberFormat('dd-mmm-yyyy');
  s.getRange('A1:F1').setFontWeight('bold');
  protect_(s, 'Derived values. Rebuilt by the Portfolio Hub script.');
  return s;
}

function norm_(ref) {
  return 'IF(ISNUMBER(' + ref + '),' + ref +
    ',IFERROR(DATEVALUE(' + ref + '),IFERROR(DATEVALUE(SUBSTITUTE(' + ref + ',"-"," ")),"")))';
}

function list_(ref) {
  return '=IFERROR(SORT(UNIQUE(FILTER(' + ref + ',' + ref + '<>""))),"")';
}

/* -------------------------------------------------------------- Overview */

function buildOverview_(ss, D) {
  var s = ss.insertSheet('Overview');
  shape_(s, 200, 7);
  s.setTabColor(C.Active);

  title_(s, 'A1', 'Portfolio Overview', 'Projects, owners and delivery status across departments.');

  var kpis = [
    ['Total Projects', '=COUNTA(' + D + '!A2:A' + MAXROWS + ')'],
    ['Departments', '=IFERROR(COUNTA(UNIQUE(FILTER(' + D + '!F2:F' + MAXROWS + ',' + D + '!F2:F' + MAXROWS + '<>""))),0)'],
    ['Owners', '=IFERROR(COUNTA(UNIQUE(FILTER(' + D + '!E2:E' + MAXROWS + ',' + D + '!E2:E' + MAXROWS + '<>""))),0)'],
    ['Active', '=COUNTIF(Calc!C2:C' + MAXROWS + ',"Active")'],
    ['Upcoming', '=COUNTIF(Calc!C2:C' + MAXROWS + ',"Upcoming")']
  ];
  s.getRange(4, 1, 1, kpis.length).setValues([kpis.map(function (k) { return k[0]; })])
    .setFontColor(C.muted).setFontSize(9).setHorizontalAlignment('center');
  s.getRange(5, 1, 1, kpis.length).setFormulas([kpis.map(function (k) { return k[1]; })])
    .setFontSize(22).setFontWeight('bold').setFontColor(C.ink).setHorizontalAlignment('center');
  s.getRange(4, 1, 2, kpis.length).setBackground(C.panel).setBorder(true, true, true, true, true, false, C.line, null);
  s.getRange(5, 1).setFontColor(C.Active);

  title_(s, 'A7', 'Departments', 'Portfolio grouped by owning department.');

  var head = ['Department', 'Projects', 'Owners', 'Active', 'Of Portfolio', 'Share', 'Earliest Start'];
  s.getRange(9, 1, 1, head.length).setValues([head]);
  headerRow_(s.getRange(9, 1, 1, head.length));

  var r0 = 10;
  s.getRange(r0, 1).setFormula(list_(D + '!F2:F' + MAXROWS));
  fill_(s, r0, 2, DEPT_ROWS,
    '=IF($A' + r0 + '="","",COUNTIF(' + D + '!$F$2:$F$' + MAXROWS + ',$A' + r0 + '))');
  fill_(s, r0, 3, DEPT_ROWS,
    '=IF($A' + r0 + '="","",IFERROR(COUNTA(UNIQUE(FILTER(' + D + '!$E$2:$E$' + MAXROWS + ',' +
    D + '!$F$2:$F$' + MAXROWS + '=$A' + r0 + ',' + D + '!$E$2:$E$' + MAXROWS + '<>""))),0))');
  fill_(s, r0, 4, DEPT_ROWS,
    '=IF($A' + r0 + '="","",COUNTIFS(' + D + '!$F$2:$F$' + MAXROWS + ',$A' + r0 +
    ',Calc!$C$2:$C$' + MAXROWS + ',"Active"))');
  fill_(s, r0, 5, DEPT_ROWS,
    '=IF($A' + r0 + '="","",IFERROR($B' + r0 + '/$A$5,0))');
  fill_(s, r0, 6, DEPT_ROWS,
    '=IF($A' + r0 + '="","",REPT("|",ROUND($E' + r0 + '*24)))');
  fill_(s, r0, 7, DEPT_ROWS,
    '=IF($A' + r0 + '="","",IFERROR(MIN(FILTER(Calc!$A$2:$A$' + MAXROWS + ',' +
    D + '!$F$2:$F$' + MAXROWS + '=$A' + r0 + ',Calc!$A$2:$A$' + MAXROWS + '<>"")),""))');

  s.getRange(r0, 2, DEPT_ROWS, 3).setHorizontalAlignment('center');
  s.getRange(r0, 5, DEPT_ROWS, 1).setNumberFormat('0%').setHorizontalAlignment('center');
  s.getRange(r0, 6, DEPT_ROWS, 1).setFontColor(C.Active).setFontFamily('Courier New').setFontSize(8);
  s.getRange(r0, 7, DEPT_ROWS, 1).setNumberFormat('dd-mmm-yyyy').setHorizontalAlignment('center');
  s.getRange(r0, 1, DEPT_ROWS, 1).setFontWeight('bold');
  s.getRange(9, 1, DEPT_ROWS + 1, head.length)
    .setBorder(true, true, true, true, true, true, C.line, SpreadsheetApp.BorderStyle.SOLID);
  band_(s.getRange(r0, 1, DEPT_ROWS, head.length));

  widths_(s, [220, 80, 80, 80, 100, 130, 120]);
  s.setFrozenRows(9);
  s.setHiddenGridlines(true);
  protect_(s, 'Generated view. Rebuilt by the Portfolio Hub script.');
  return s;
}

/* -------------------------------------------------------------- Projects */

function buildProjects_(ss, D) {
  var s = ss.insertSheet('Projects');
  shape_(s, MAXROWS + 10, 7);
  s.setTabColor(C.Completed);

  // Controls. These three cells are the only editable ones on the sheet.
  s.getRange('A1').setValue('Search').setFontColor(C.muted).setFontSize(9);
  s.getRange('C1').setValue('Department').setFontColor(C.muted).setFontSize(9);
  s.getRange('E1').setValue('Owner').setFontColor(C.muted).setFontSize(9);
  ['B1', 'D1', 'F1'].forEach(function (a) {
    s.getRange(a).setBackground('#ffffff').setFontWeight('bold')
      .setBorder(true, true, true, true, false, false, C.line, null);
  });
  s.getRange('D1').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName('Calc').getRange('E2:E200'), true)
    .setAllowInvalid(false).setHelpText('Leave blank for all departments').build());
  s.getRange('F1').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName('Calc').getRange('F2:F200'), true)
    .setAllowInvalid(false).setHelpText('Leave blank for all owners').build());

  var src = '{' + D + '!A2:A' + MAXROWS + ',' + D + '!B2:B' + MAXROWS +
    ',Calc!A2:A' + MAXROWS + ',Calc!B2:B' + MAXROWS + ',' + D + '!E2:E' + MAXROWS +
    ',' + D + '!F2:F' + MAXROWS + ',Calc!C2:C' + MAXROWS + '}';
  var conds = D + '!A2:A' + MAXROWS + '<>"",' +
    '($B$1="")+ISNUMBER(SEARCH($B$1,' + D + '!A2:A' + MAXROWS + '&" "&' + D + '!B2:B' + MAXROWS +
    '&" "&' + D + '!E2:E' + MAXROWS + '&" "&' + D + '!F2:F' + MAXROWS + ')),' +
    '($D$1="")+(' + D + '!F2:F' + MAXROWS + '=$D$1),' +
    '($F$1="")+(' + D + '!E2:E' + MAXROWS + '=$F$1)';

  s.getRange('G1').setFormula(
    '=IFERROR(ROWS(FILTER(' + D + '!A2:A' + MAXROWS + ',' + conds + ')),0)&" of "&COUNTA(' +
    D + '!A2:A' + MAXROWS + ')&" projects"')
    .setFontColor(C.muted).setFontSize(9).setHorizontalAlignment('right');

  var head = ['Project', 'Impact', 'Start', 'End', 'Owner', 'Department', 'Status'];
  s.getRange(2, 1, 1, head.length).setValues([head]);
  headerRow_(s.getRange(2, 1, 1, head.length));

  s.getRange('A3').setFormula(
    '=IFERROR(FILTER(' + src + ',' + conds + '),"No projects match the current filters.")');

  s.getRange(3, 3, MAXROWS, 2).setNumberFormat('dd-mmm-yyyy').setHorizontalAlignment('center');
  s.getRange(3, 1, MAXROWS, 1).setFontWeight('bold');
  s.getRange(3, 7, MAXROWS, 1).setHorizontalAlignment('center');
  s.getRange(3, 1, MAXROWS, head.length).setVerticalAlignment('middle');
  statusColours_(s, s.getRange(3, 7, MAXROWS, 1), function (st) { return '=$G3="' + st + '"'; });
  band_(s.getRange(3, 1, MAXROWS, head.length));

  widths_(s, [220, 300, 110, 110, 130, 130, 110]);
  s.setFrozenRows(2);
  s.setHiddenGridlines(true);
  protect_(s, 'Generated view — edit only the filter cells in row 1.', ['B1', 'D1', 'F1']);
  return s;
}

/* -------------------------------------------------------------- Timeline */

function buildTimeline_(ss, D) {
  var s = ss.insertSheet('Timeline');
  var cols = 5 + QUARTERS;
  shape_(s, MAXROWS + 10, cols);
  s.setTabColor(C.Upcoming);

  var head = ['Project', 'Department', 'Start', 'End', 'Status'];
  s.getRange(1, 1, 1, head.length).setValues([head]);

  // Row 2 holds the real quarter start dates (hidden); row 1 shows "26 Q3".
  var minStart = 'MIN(Calc!A2:A' + MAXROWS + ')';
  s.getRange(2, 6).setFormula(
    '=IFERROR(IF(COUNT(Calc!A2:A' + MAXROWS + ')=0,DATE(YEAR(TODAY()),1,1),' +
    'DATE(YEAR(' + minStart + '),FLOOR((MONTH(' + minStart + ')-1)/3)*3+1,1)),DATE(YEAR(TODAY()),1,1))');
  if (QUARTERS > 1) s.getRange(2, 7, 1, QUARTERS - 1).setFormula('=EDATE(F2,3)');
  s.getRange(1, 6, 1, QUARTERS).setFormula('=TEXT(F2,"yy")&" Q"&ROUNDUP(MONTH(F2)/3)');

  headerRow_(s.getRange(1, 1, 1, cols));
  s.getRange(1, 6, 1, QUARTERS).setHorizontalAlignment('center');

  s.getRange('A3').setFormula(
    '=IFERROR(SORT(FILTER({' + D + '!A2:A' + MAXROWS + ',' + D + '!F2:F' + MAXROWS +
    ',Calc!A2:A' + MAXROWS + ',Calc!B2:B' + MAXROWS + ',Calc!C2:C' + MAXROWS + '},' +
    D + '!A2:A' + MAXROWS + '<>""),3,TRUE),"")');

  s.getRange(3, 3, MAXROWS, 2).setNumberFormat('dd-mmm-yyyy').setHorizontalAlignment('center');
  s.getRange(3, 1, MAXROWS, 1).setFontWeight('bold');
  s.getRange(3, 5, MAXROWS, 1).setHorizontalAlignment('center');
  statusColours_(s, s.getRange(3, 5, MAXROWS, 1), function (st) { return '=$E3="' + st + '"'; });

  // The Gantt itself: a quarter is filled when the project overlaps it.
  statusColours_(s, s.getRange(3, 6, MAXROWS, QUARTERS), function (st) {
    return '=AND($C3<>"",$C3<=EOMONTH(F$2,2),IF($D3="",$C3,$D3)>=F$2,$E3="' + st + '")';
  });

  widths_(s, [220, 130, 110, 110, 110]);
  for (var i = 0; i < QUARTERS; i++) s.setColumnWidth(6 + i, 74);
  s.setFrozenRows(2);
  s.setFrozenColumns(2);
  s.hideRows(2);
  s.setHiddenGridlines(true);
  protect_(s, 'Generated view. Rebuilt by the Portfolio Hub script.');
  return s;
}

/* --------------------------------------------------------------- helpers */

function findDataSheet_(ss) {
  var sheets = ss.getSheets(), names = [];
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    names.push(n);
    if (BUILT.indexOf(n) !== -1) continue;
    if (sheets[i].getLastColumn() < HEADERS.length) continue;
    var row = sheets[i].getRange(1, 1, 1, HEADERS.length).getValues()[0];
    var ok = HEADERS.every(function (h, j) {
      return String(row[j]).trim().toLowerCase() === h.toLowerCase();
    });
    if (ok) return sheets[i];
  }
  throw new Error('No data tab found. Row 1 of the raw tab must read exactly: ' +
    HEADERS.join(' | ') + '. Tabs seen: ' + names.join(', '));
}

function quote_(name) { return "'" + String(name).replace(/'/g, "''") + "'"; }

function shape_(s, rows, cols) {
  var r = s.getMaxRows(), c = s.getMaxColumns();
  if (r < rows) s.insertRowsAfter(r, rows - r); else if (r > rows) s.deleteRows(rows + 1, r - rows);
  if (c < cols) s.insertColumnsAfter(c, cols - c); else if (c > cols) s.deleteColumns(cols + 1, c - cols);
}

function fill_(s, row, col, n, formula) { s.getRange(row, col, n, 1).setFormula(formula); }

function widths_(s, w) { w.forEach(function (x, i) { s.setColumnWidth(i + 1, x); }); }

function headerRow_(range) {
  range.setFontWeight('bold').setFontColor(C.ink).setBackground(C.head)
    .setBorder(true, true, true, true, true, false, C.line, null);
}

function title_(s, a1, t, sub) {
  var r = s.getRange(a1);
  r.setValue(t).setFontSize(15).setFontWeight('bold').setFontColor(C.ink);
  s.getRange(r.getRow() + 1, r.getColumn()).setValue(sub).setFontSize(9).setFontColor(C.muted);
}

function band_(range) {
  range.getBandings().forEach(function (b) { b.remove(); });
  range.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
}

function statusColours_(s, range, formulaFor) {
  var rules = s.getConditionalFormatRules();
  STATUSES.forEach(function (st) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(formulaFor(st))
      .setBackground(C[st]).setFontColor('#ffffff')
      .setRanges([range]).build());
  });
  s.setConditionalFormatRules(rules);
}

function protect_(s, desc, editableA1) {
  try {
    var p = s.protect().setDescription(desc).setWarningOnly(true);
    if (editableA1 && editableA1.length) {
      p.setUnprotectedRanges(editableA1.map(function (a) { return s.getRange(a); }));
    }
  } catch (e) {
    // Protection needs edit rights on the file; the views still work without it.
  }
}
