# -*- coding: utf-8 -*-
"""出力 xlsx をスマホ画面幅で描画してスクリーンショットを撮る (受け入れ試験 5)。

本物の Excel モバイルアプリではなく、保存された xlsx の中身
(セル値・表示形式・列幅・塗り・罫線・ウィンドウ枠の固定・条件付き書式の
評価結果) から同じ見え方を組み立てたもの。Excel / LibreOffice Calc が
この環境に無いための代替であることを実装メモに明記する。
"""
import os, sys, html, datetime, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import excel_mock
from excel_mock import effective_format, bgr_to_hex
from vbaint import VDate, EPOCH
from openpyxl.utils import get_column_letter

import argparse
ap = argparse.ArgumentParser()
ap.add_argument("xlsx"); ap.add_argument("html"); ap.add_argument("png")
ap.add_argument("--w", type=int, default=390)
ap.add_argument("--h", type=int, default=844)
ap.add_argument("--zoom", type=float, default=1.0)
ap.add_argument("--scroll-x", type=int, default=0)
ap.add_argument("--scroll-y", type=int, default=0)
A = ap.parse_args()
XLSX, OUT_HTML, OUT_PNG = A.xlsx, A.html, A.png
VIEW_W, VIEW_H = A.w, A.h

JP_DOW = "日月火水木金土"

def networkdays(sd, expr):
    """=NETWORKDAYS(C11,D11) を表示用に計算する (Excel なら値が出る列)。"""
    m = re.match(r"=NETWORKDAYS\(([A-Z]+)(\d+),([A-Z]+)(\d+)\)$", expr.replace(" ", ""))
    if not m: return ""
    from openpyxl.utils import column_index_from_string as ci
    a = sd.cells.get((int(m.group(2)), ci(m.group(1))))
    b = sd.cells.get((int(m.group(4)), ci(m.group(3))))
    if not a or not b or a.value is None or b.value is None: return ""
    d1 = EPOCH + datetime.timedelta(days=int(a.value))
    d2 = EPOCH + datetime.timedelta(days=int(b.value))
    n = 0
    d = d1
    while d <= d2:
        if d.weekday() < 5: n += 1
        d += datetime.timedelta(days=1)
    return str(n)

def fmt(value, nf):
    if value is None: return ""
    if isinstance(value, VDate):
        d = EPOCH + datetime.timedelta(days=int(value))
        if nf == "d": return str(d.day)
        if nf == "aaa": return JP_DOW[(d.weekday() + 1) % 7]
        if nf.startswith("m") and "月" in nf: return "%d月" % d.month
        if "yy" in nf: return d.strftime("%Y/%m/%d")
        return d.strftime("%Y/%m/%d")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        # 表示形式が日付なら日付として見せる (openpyxl が数値で返す "aaa" 等)
        if nf in ("d", "aaa") or ("月" in nf):
            d = EPOCH + datetime.timedelta(days=int(value))
            if nf == "d": return str(d.day)
            if nf == "aaa": return JP_DOW[(d.weekday() + 1) % 7]
            return "%d月" % d.month
        return str(int(value)) if value == int(value) else str(value)
    return str(value)

def px(width):
    return max(8, int(round(width * 7 + 5)))

def border_css(bd):
    out = []
    for edge, key in (("left", "left"), ("top", "top"), ("right", "right"), ("bottom", "bottom")):
        t = bd.get(key)
        if not t or t[0] == -4142: continue
        ls, col, wt = t
        style = "dashed" if ls == -4115 else "solid"
        w = {1: 1, 2: 1, -4138: 2, 4: 3}.get(wt, 1)
        c = "#" + bgr_to_hex(col if col is not None else 0)
        out.append("border-%s:%dpx %s %s" % (edge, w, style, c))
    return out

def main():
    sheets, _ = excel_mock.load_workbook_data(XLSX)
    sd = [s for s in sheets if not s.name.startswith("_")][0]
    maxr, maxc = sd.max_used()
    freeze_r, freeze_c = sd.freeze or (0, 0)
    merged = {}
    skip = set()
    for (r1, c1, r2, c2) in sd.merges:
        merged[(r1, c1)] = (r2 - r1 + 1, c2 - c1 + 1)
        for r in range(r1, r2 + 1):
            for c in range(c1, c2 + 1):
                if (r, c) != (r1, c1): skip.add((r, c))

    cols = [c for c in range(1, maxc + 1) if c not in sd.col_hidden]
    left_px = sum(px(sd.col_width.get(c, 8.43)) for c in cols[:freeze_c])

    rows_html = []
    for r in range(1, maxr + 1):
        tds = []
        for c in cols:
            if (r, c) in skip: continue
            cd = sd.cells.get((r, c))
            fill, bd = effective_format(sd, r, c)
            css = ["width:%dpx" % px(sd.col_width.get(c, 8.43)),
                   "min-width:%dpx" % px(sd.col_width.get(c, 8.43))]
            if fill is not None: css.append("background:#" + bgr_to_hex(fill))
            css += border_css(bd)
            if cd:
                if cd.bold: css.append("font-weight:700")
                if cd.font_color is not None: css.append("color:#" + bgr_to_hex(cd.font_color))
                if cd.halign: css.append("text-align:" + cd.halign)
            sticky = ""
            if c <= freeze_c and r <= freeze_r:
                sticky = "position:sticky;left:0;top:%dpx;z-index:6;" % ((r - 1) * 20)
            elif c <= freeze_c:
                sticky = "position:sticky;left:0;z-index:4;"
            elif r <= freeze_r:
                sticky = "position:sticky;top:%dpx;z-index:3;" % ((r - 1) * 20)
            if sticky and fill is None:
                css.append("background:#ffffff")
            span = ""
            if (r, c) in merged:
                rs, cs = merged[(r, c)]
                if cs > 1: span += ' colspan="%d"' % cs
                if rs > 1: span += ' rowspan="%d"' % rs
            text = fmt(cd.value if cd else None, cd.number_format if cd else "General")
            if cd and cd.formula and not text:
                text = networkdays(sd, cd.formula)
            tds.append('<td%s style="%s%s">%s</td>' % (span, sticky, ";".join(css), html.escape(text)))
        rows_html.append("<tr>" + "".join(tds) + "</tr>")

    doc = """<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s</title>
<style>
  html,body{margin:0;padding:0;background:#fff;
    font-family:"Noto Sans CJK JP","Noto Sans JP",sans-serif;}
  .wrap{overflow:auto;height:100vh;}
  table{border-collapse:separate;border-spacing:0;font-size:9px;line-height:1;
        zoom:ZOOMVAL;}
  td{height:20px;padding:0 1px;white-space:nowrap;overflow:visible;
     border-right:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0;}
</style></head><body><div class="wrap"><table>%s</table></div></body></html>
""".replace("ZOOMVAL", str(A.zoom)) % (html.escape(sd.name), "".join(rows_html))
    open(OUT_HTML, "w", encoding="utf-8").write(doc)

    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        exe = "/opt/pw-browsers/chromium"
        b = p.chromium.launch(executable_path=exe if os.path.exists(exe) else None,
                              args=["--no-sandbox"])
        pg = b.new_page(viewport={"width": VIEW_W, "height": VIEW_H}, device_scale_factor=2)
        pg.goto("file://" + os.path.abspath(OUT_HTML))
        pg.wait_for_timeout(300)
        pg.eval_on_selector(".wrap", "el => { el.scrollLeft = %d; el.scrollTop = %d; }"
                            % (A.scroll_x, A.scroll_y))
        pg.wait_for_timeout(300)
        pg.screenshot(path=OUT_PNG)
        b.close()
    print("wrote", OUT_HTML, "and", OUT_PNG)

main()
