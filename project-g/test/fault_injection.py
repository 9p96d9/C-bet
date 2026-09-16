# -*- coding: utf-8 -*-
"""機械検査が空回りしていないことを確かめる。

納品する .bas に故意の欠陥を 1 つずつ入れて実行し、6章の検査が
その欠陥を NG として掴むかを見る。掴めない検査は検査として無意味。
"""
import os, sys, shutil, glob, tempfile, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness, vbaint

CSV = sys.argv[1] if len(sys.argv) > 1 else None

FAULTS = [
    ("位置: バーを 1 日遅らせる", "Render.bas",
     'F$" & Layout.ROW_DAY & ">=$C" & r & ","',
     'F$" & Layout.ROW_DAY & ">$C" & r & ","'),
    ("行: シート行を +1 ずらす", "Layout.bas",
     "SheetRowOf = gridRow + HEADER_ROWS",
     "SheetRowOf = gridRow + HEADER_ROWS + 1"),
    ("データ列: C に終了日を書く", "Render.bas",
     "ws.Cells(r, Layout.COL_START).Value = p.DateStart",
     "ws.Cells(r, Layout.COL_START).Value = p.DateEnd"),
    ("保護: シート保護を外す", "Export.bas",
     "    ws.Protect DrawingObjects:=True, Contents:=True, Scenarios:=True, _",
     "    If False Then ws.Protect DrawingObjects:=True, Contents:=True, Scenarios:=True, _"),
    ("保護: C/D をロックしたままにする", "Export.bas",
     "            ws.Cells(r, Layout.COL_START).Locked = False",
     "            ws.Cells(r, Layout.COL_START).Locked = True"),
    ("_data: 1 行落とす", "Export.bas",
     "    For i = 0 To ps.Count - 1\n        row = t.Rows(headerRow + 1 + ps.Items(i).SrcIndex)",
     "    For i = 0 To ps.Count - 2\n        row = t.Rows(headerRow + 1 + ps.Items(i).SrcIndex)"),
    ("ヘッダー: 行 2 の日付を 1 日ずらす", "Render.bas",
     "        ws.Cells(Layout.ROW_DAY, c).Value = d",
     "        ws.Cells(Layout.ROW_DAY, c).Value = d + 1"),
    ("_data: 非表示にしない", "Export.bas",
     "    wsData.Visible = xlSheetVeryHidden",
     "    wsData.Visible = xlSheetVisible"),
]

def run_with(srcdir, workdir):
    I = harness.build(srcdir)
    csv = os.path.join(workdir, os.path.basename(CSV))
    mod, proc = I.find_proc("Convert")
    I.call_proc(mod, proc, [csv, harness.date(2026, 9, 1), harness.date(2026, 10, 10)])
    log = open(os.path.join(workdir, "変換ログ.txt"), encoding="utf-8-sig").read()
    return log

def main():
    base = tempfile.mkdtemp()
    ok = True
    for label, fname, old, new in FAULTS:
        srcdir = os.path.join(base, "src_%d" % FAULTS.index((label, fname, old, new)))
        shutil.copytree(os.path.join(os.path.dirname(harness.SRC), "src"), srcdir)
        path = os.path.join(srcdir, fname)
        s = open(path, encoding="utf-8").read()
        if old not in s:
            print("SETUP-FAIL  %s : pattern not found in %s" % (label, fname)); ok = False; continue
        open(path, "w", encoding="utf-8").write(s.replace(old, new, 1))
        work = os.path.join(base, "work_%d" % FAULTS.index((label, fname, old, new)))
        os.makedirs(work)
        shutil.copy(CSV, work)
        try:
            log = run_with(srcdir, work)
        except Exception as e:
            print("CAUGHT(例外) %-34s %s: %s" % (label, type(e).__name__, str(e)[:60]))
            continue
        ngs = [l for l in log.splitlines() if l.startswith("NG")]
        if "不合格" in log:
            print("CAUGHT      %-34s -> %s" % (label, ngs[0][:78] if ngs else "(不合格)"))
        else:
            print("MISSED      %-34s -> 検査が素通りした" % label); ok = False
    print()
    print("すべての故障を検知:", ok)
    return 0 if ok else 1

sys.exit(main())
