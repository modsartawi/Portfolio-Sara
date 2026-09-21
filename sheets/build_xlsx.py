#!/usr/bin/env python3
"""Build the Excel edition of the IT Executive Portfolio Hub dashboard.

Produces sheets/IT_Executive_Portfolio_Hub.xlsx: a Data tab (seeded from the live
Google Sheet) plus Calc / Overview / Projects / Timeline tabs that reproduce the
React app's three views with formulas only.

Needs Excel 2021, Microsoft 365 or Excel on the web — the views rely on the
dynamic-array functions FILTER, UNIQUE, SORT and LET.

    python3 sheets/build_xlsx.py [--csv URL] [--out PATH]
"""

import argparse
import csv
import datetime as dt
import io
import os
import urllib.request

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

CSV_URL = ("https://docs.google.com/spreadsheets/d/"
           "1iXx4Y9fvqXShd4Wljqqv5Vr61elOSiuZU4w-rTI0nq0/gviz/tq?tqx=out:csv&gid=0")

MAXROWS = 1000          # rows of the Data tab the formulas cover
DEPT_ROWS = 60          # department rows rendered on Overview
QUARTERS = 8            # timeline width, matches the app
HEADERS = ["Project Name", "Project Impact", "Start Date", "End Date",
           "Project Owner", "Department"]

INK, MUTED, LINE, HEAD, PANEL = "FF1F2430", "FF5F6675", "FFDFE3EA", "FFEEF1F6", "FFF8F9FB"
STATUS = {"Active": "FF2F6FED", "Upcoming": "FFE0912F",
          "Completed": "FF1F9D55", "Undated": "FF9AA0A6"}
DATEFMT = "DD-MMM-YYYY"

thin = Side(style="thin", color=LINE)
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)


# ----------------------------------------------------------------- data ---

def fetch_rows(url):
    """Read the live sheet; leave the Data tab empty if it cannot be read.

    A 200 with an empty body is a real failure mode here (Google serves one when
    the link-share is revoked, or from a network that intercepts the request), so
    say so loudly rather than silently shipping an empty workbook.
    """
    try:
        with urllib.request.urlopen(url, timeout=25) as r:
            text = r.read().decode("utf-8")
    except Exception as e:                                  # offline build
        print("  ! could not reach the sheet (%s) - Data tab left empty" % e)
        return []
    if not text.strip():
        print("  ! the sheet returned an empty body - Data tab left empty.")
        print("    Check the link-share is still on, or paste rows into Data by hand.")
        return []
    rows = list(csv.reader(io.StringIO(text)))
    if rows and rows[0][:1] == [HEADERS[0]]:
        rows = rows[1:]
    if not rows:
        print("  ! the sheet has a header but no project rows - Data tab left empty")
    return rows


def as_date(v):
    """'10-Sep-2026' and friends -> a real date, so Excel can compare them."""
    v = (v or "").strip()
    for f in ("%d-%b-%Y", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%d %b %Y"):
        try:
            return dt.datetime.strptime(v, f).date()
        except ValueError:
            pass
    return v or None


# ---------------------------------------------------------------- style ---

def style(cell, *, bold=False, size=None, colour=None, fill=None,
          align=None, fmt=None, border=False):
    if bold or size or colour:
        cell.font = Font(bold=bold, size=size or 11, color=colour or INK)
    if fill:
        cell.fill = PatternFill("solid", fgColor=fill)
    if align:
        cell.alignment = Alignment(horizontal=align, vertical="center")
    if fmt:
        cell.number_format = fmt
    if border:
        cell.border = BOX


def header_row(ws, row, ncols):
    for c in range(1, ncols + 1):
        style(ws.cell(row=row, column=c), bold=True, fill=HEAD, border=True)


def widths(ws, ws_widths):
    for i, w in enumerate(ws_widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


def status_colours(ws, ref, formula_for):
    for name, colour in STATUS.items():
        ws.conditional_formatting.add(ref, FormulaRule(
            formula=[formula_for(name)],
            fill=PatternFill("solid", bgColor=colour),
            font=Font(color="FFFFFFFF")))


def down(ws, col, template, rows=DEPT_ROWS, first=10):
    """Fill a template down `rows` rows; {r} is the row, {m} the data extent."""
    for i in range(rows):
        r = first + i
        ws.cell(row=r, column=col).value = template.format(r=r, m=MAXROWS)


# ----------------------------------------------------------------- tabs ---

def build_data(wb, rows):
    ws = wb.create_sheet("Data")
    ws.append(HEADERS)
    header_row(ws, 1, len(HEADERS))
    for r in rows:
        r = (list(r) + [""] * 6)[:6]
        ws.append([r[0], r[1], as_date(r[2]), as_date(r[3]), r[4], r[5]])
    for r in range(2, ws.max_row + 1):
        for c in (3, 4):
            style(ws.cell(row=r, column=c), fmt=DATEFMT, align="center")
    widths(ws, [30, 40, 14, 14, 18, 16])
    ws.freeze_panes = "A2"
    return ws


def build_calc(wb):
    """Hidden helpers: normalised dates, derived status, dropdown lists."""
    ws = wb.create_sheet("Calc")
    ws.append(["Start", "End", "Status", "", "Departments", "Owners"])
    header_row(ws, 1, 6)

    def norm(ref):
        return ('IF(ISNUMBER({r}),{r},IFERROR(DATEVALUE({r}),'
                'IFERROR(DATEVALUE(SUBSTITUTE({r},"-"," ")),"")))').format(r=ref)

    for r in range(2, MAXROWS + 1):
        ws.cell(row=r, column=1).value = \
            '=IF(Data!A{r}="","",{n})'.format(r=r, n=norm("Data!C%d" % r))
        ws.cell(row=r, column=2).value = \
            '=IF(Data!A{r}="","",{n})'.format(r=r, n=norm("Data!D%d" % r))
        ws.cell(row=r, column=3).value = (
            '=IF(Data!A{r}="","",'
            'IF(AND(A{r}="",B{r}=""),"Undated",'
            'IF(AND(A{r}<>"",TODAY()<A{r}),"Upcoming",'
            'IF(AND(B{r}<>"",TODAY()>B{r}),"Completed","Active"))))').format(r=r)
        style(ws.cell(row=r, column=1), fmt=DATEFMT)
        style(ws.cell(row=r, column=2), fmt=DATEFMT)

    ws["E2"] = ('=IFERROR(SORT(UNIQUE(FILTER(Data!F2:F{m},Data!F2:F{m}<>""))),"")'
                .format(m=MAXROWS))
    ws["F2"] = ('=IFERROR(SORT(UNIQUE(FILTER(Data!E2:E{m},Data!E2:E{m}<>""))),"")'
                .format(m=MAXROWS))
    widths(ws, [14, 14, 14, 3, 20, 20])
    ws.sheet_state = "hidden"
    return ws


def build_overview(wb):
    ws = wb.create_sheet("Overview")
    ws.sheet_properties.tabColor = STATUS["Active"][2:]
    ws.sheet_view.showGridLines = False

    ws["A1"] = "Portfolio Overview"
    style(ws["A1"], bold=True, size=15)
    ws["A2"] = "Projects, owners and delivery status across departments."
    style(ws["A2"], size=9, colour=MUTED)

    kpis = [
        ("Total Projects", '=COUNTA(Data!A2:A{m})'),
        ("Departments", '=IFERROR(COUNTA(UNIQUE(FILTER(Data!F2:F{m},Data!F2:F{m}<>""))),0)'),
        ("Owners", '=IFERROR(COUNTA(UNIQUE(FILTER(Data!E2:E{m},Data!E2:E{m}<>""))),0)'),
        ("Active", '=COUNTIF(Calc!C2:C{m},"Active")'),
        ("Upcoming", '=COUNTIF(Calc!C2:C{m},"Upcoming")'),
    ]
    for i, (label, formula) in enumerate(kpis, start=1):
        lab, val = ws.cell(row=4, column=i), ws.cell(row=5, column=i)
        lab.value = label
        style(lab, size=9, colour=MUTED, align="center", fill=PANEL, border=True)
        val.value = formula.format(m=MAXROWS)
        style(val, bold=True, size=20, align="center", fill=PANEL, border=True,
              colour=STATUS["Active"] if i == 1 else INK)

    ws["A7"] = "Departments"
    style(ws["A7"], bold=True, size=15)
    ws["A8"] = "Portfolio grouped by owning department."
    style(ws["A8"], size=9, colour=MUTED)

    head = ["Department", "Projects", "Owners", "Active",
            "Of Portfolio", "Share", "Earliest Start"]
    for i, h in enumerate(head, start=1):
        ws.cell(row=9, column=i).value = h
    header_row(ws, 9, len(head))

    ws["A10"] = ('=IFERROR(SORT(UNIQUE(FILTER(Data!$F$2:$F${m},Data!$F$2:$F${m}<>""))),"")'
                 .format(m=MAXROWS))
    cols = {
        2: '=IF($A{r}="","",COUNTIF(Data!$F$2:$F${m},$A{r}))',
        3: ('=IF($A{r}="","",LET(k,(Data!$F$2:$F${m}=$A{r})*(Data!$E$2:$E${m}<>""),'
            'IF(SUM(k)=0,0,COUNTA(UNIQUE(FILTER(Data!$E$2:$E${m},k))))))'),
        4: '=IF($A{r}="","",COUNTIFS(Data!$F$2:$F${m},$A{r},Calc!$C$2:$C${m},"Active"))',
        5: '=IF($A{r}="","",IFERROR($B{r}/$A$5,0))',
        6: '=IF($A{r}="","",REPT("|",ROUND($E{r}*24,0)))',
        7: ('=IF($A{r}="","",LET(v,MINIFS(Calc!$A$2:$A${m},Data!$F$2:$F${m},$A{r},'
            'Calc!$A$2:$A${m},"<>"),IF(v=0,"",v)))'),
    }
    for col, f in cols.items():
        down(ws, col, f)

    for r in range(10, 10 + DEPT_ROWS):
        style(ws.cell(row=r, column=1), bold=True, border=True)
        for c in (2, 3, 4):
            style(ws.cell(row=r, column=c), align="center", border=True)
        style(ws.cell(row=r, column=5), align="center", fmt="0%", border=True)
        bar = ws.cell(row=r, column=6)
        bar.font = Font(name="Consolas", size=8, color=STATUS["Active"])
        bar.border = BOX
        style(ws.cell(row=r, column=7), align="center", fmt=DATEFMT, border=True)

    widths(ws, [30, 11, 11, 11, 13, 20, 16])
    ws.freeze_panes = "A10"
    return ws


PROJ_CONDS = (
    '(Data!$A$2:$A${m}<>"")'
    '*(((${sb}="")+ISNUMBER(SEARCH(${sb},Data!$A$2:$A${m}&" "&Data!$B$2:$B${m}'
    '&" "&Data!$E$2:$E${m}&" "&Data!$F$2:$F${m})))>0)'
    '*(((${db}="")+(Data!$F$2:$F${m}=${db}))>0)'
    '*(((${ob}="")+(Data!$E$2:$E${m}=${ob}))>0)'
).format(m=MAXROWS, sb="B$1", db="D$1", ob="F$1")


def build_projects(wb):
    ws = wb.create_sheet("Projects")
    ws.sheet_properties.tabColor = STATUS["Completed"][2:]
    ws.sheet_view.showGridLines = False

    for cell, label in (("A1", "Search"), ("C1", "Department"), ("E1", "Owner")):
        ws[cell] = label
        style(ws[cell], size=9, colour=MUTED, align="right")
    for cell in ("B1", "D1", "F1"):
        style(ws[cell], bold=True, fill="FFFFFFFF", border=True)

    for cell, src in (("D1", "Calc!$E$2:$E$200"), ("F1", "Calc!$F$2:$F$200")):
        dv = DataValidation(type="list", formula1=src, allow_blank=True,
                            showDropDown=False)
        dv.prompt, dv.promptTitle = "Leave blank for all", "Filter"
        ws.add_data_validation(dv)
        dv.add(ws[cell])

    ws["G1"] = ('=SUMPRODUCT({c})&" of "&COUNTA(Data!$A$2:$A${m})&" projects"'
                .format(c=PROJ_CONDS, m=MAXROWS))
    style(ws["G1"], size=9, colour=MUTED, align="right")

    head = ["Project", "Impact", "Start", "End", "Owner", "Department", "Status"]
    for i, h in enumerate(head, start=1):
        ws.cell(row=2, column=i).value = h
    header_row(ws, 2, len(head))

    ws["A3"] = (
        '=IFERROR(FILTER(CHOOSE({{1,2,3,4,5,6,7}},'
        'Data!$A$2:$A${m},Data!$B$2:$B${m},Calc!$A$2:$A${m},Calc!$B$2:$B${m},'
        'Data!$E$2:$E${m},Data!$F$2:$F${m},Calc!$C$2:$C${m}),{c}),'
        '"No projects match the current filters.")'
    ).format(m=MAXROWS, c=PROJ_CONDS)

    last = MAXROWS + 2
    for r in range(3, last + 1):
        style(ws.cell(row=r, column=1), bold=True)
        for c in (3, 4):
            style(ws.cell(row=r, column=c), align="center", fmt=DATEFMT)
        style(ws.cell(row=r, column=7), align="center")
    status_colours(ws, "G3:G%d" % last, lambda s: '=$G3="%s"' % s)

    widths(ws, [30, 46, 14, 14, 20, 20, 14])
    ws.freeze_panes = "A3"
    return ws


def build_timeline(wb):
    ws = wb.create_sheet("Timeline")
    ws.sheet_properties.tabColor = STATUS["Upcoming"][2:]
    ws.sheet_view.showGridLines = False

    for i, h in enumerate(["Project", "Department", "Start", "End", "Status"], start=1):
        ws.cell(row=1, column=i).value = h

    mn = "MIN(Calc!$A$2:$A$%d)" % MAXROWS
    ws.cell(row=2, column=6).value = (
        '=IF(COUNT(Calc!$A$2:$A${m})=0,DATE(YEAR(TODAY()),1,1),'
        'DATE(YEAR({mn}),INT((MONTH({mn})-1)/3)*3+1,1))').format(m=MAXROWS, mn=mn)
    for q in range(1, QUARTERS):
        prev = get_column_letter(5 + q)
        ws.cell(row=2, column=6 + q).value = "=EDATE(%s2,3)" % prev
    for q in range(QUARTERS):
        col = get_column_letter(6 + q)
        c = ws.cell(row=1, column=6 + q)
        c.value = '=TEXT({c}2,"yy")&" Q"&ROUNDUP(MONTH({c}2)/3,0)'.format(c=col)
        style(c, align="center")
    header_row(ws, 1, 5 + QUARTERS)

    ws["A3"] = (
        '=IFERROR(SORT(FILTER(CHOOSE({{1,2,3,4,5}},'
        'Data!$A$2:$A${m},Data!$F$2:$F${m},Calc!$A$2:$A${m},Calc!$B$2:$B${m},'
        'Calc!$C$2:$C${m}),Data!$A$2:$A${m}<>""),3,1),"")').format(m=MAXROWS)

    last = MAXROWS + 2
    for r in range(3, last + 1):
        style(ws.cell(row=r, column=1), bold=True)
        for c in (3, 4):
            style(ws.cell(row=r, column=c), align="center", fmt=DATEFMT)
        style(ws.cell(row=r, column=5), align="center")
    status_colours(ws, "E3:E%d" % last, lambda s: '=$E3="%s"' % s)

    # The Gantt: fill a quarter when the project overlaps it.
    gantt = "F3:%s%d" % (get_column_letter(5 + QUARTERS), last)
    status_colours(ws, gantt, lambda s: (
        '=AND($C3<>"",$C3<=EOMONTH(F$2,2),IF($D3="",$C3,$D3)>=F$2,$E3="%s")' % s))

    widths(ws, [30, 20, 14, 14, 14] + [10] * QUARTERS)
    ws.row_dimensions[2].hidden = True
    ws.freeze_panes = "C3"
    return ws


# ----------------------------------------------------------------- main ---

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=CSV_URL)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__),
                                                  "IT_Executive_Portfolio_Hub.xlsx"))
    a = ap.parse_args()

    rows = fetch_rows(a.csv)
    print("  seeding Data with %d project rows" % len(rows))

    wb = Workbook()
    wb.remove(wb.active)
    build_data(wb, rows)
    build_calc(wb)
    build_overview(wb)
    build_projects(wb)
    build_timeline(wb)
    wb.move_sheet("Data", offset=4)          # data last, Overview first
    wb.calculation.fullCalcOnLoad = True
    wb.save(a.out)
    print("  wrote %s" % a.out)


if __name__ == "__main__":
    main()
