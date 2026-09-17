#!/usr/bin/env python3
"""
受け入れ 1：ツールの描画結果を PDF 1〜2 頁目と機械的に照合する。

目視ではなく、PDF のベクター座標とツールの SVG 幾何を
どちらも (日付 index, 行番号) 空間に直して 1 本ずつ突き合わせる。

GaNett は休日区間を「丸い点の列」（塗り circle）で描き、線分では描かない。
そのため PDF の線分と比べられるのは「稼働日を 1 日でも含む走り」だけになる。
休日だけの走りは、線分として存在しないことを逆に確かめる。

照合するもの
  1. ノード丸 34 個の位置（＝全折れ線の端点）
  2. 折れ線の走り 1 本ずつ（同一直線上に PDF の線分があるか）
  3. box / bar の上下の辺と左右端
"""
import json, csv, io, datetime, collections, sys
from pathlib import Path
import pymupdf

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
S = ROOT / "sample" / "Sample"
PDF = S / "サポートルーム_サンプル工程表.pdf"
CSVP = S / "サポートルーム_サンプル工程表.csv"
GEOM = ROOT / "out" / ("pdf_period_geometry_manual.json" if "--manual" in sys.argv
                       else "pdf_period_geometry.json")
LOGNAME = "pdf-compare-manual.log" if "--manual" in sys.argv else "pdf-compare.log"
START = datetime.date(2026, 9, 1)
TOL = 0.05

fails, lines = [], []


def chk(ok, label, detail=""):
    if not ok:
        fails.append(label)
    lines.append(f"{'OK' if ok else 'NG'}\t{label}\t{detail}")
    print(f"{'OK' if ok else 'NG'}  {label}  {detail}")


# ---------- 休日（ツールと同じ規則を Python 側でも独立に持つ） ----------
def nth_weekday(y, m, wd, nth):
    d = datetime.date(y, m, 1)
    shift = (wd - d.weekday()) % 7
    return d + datetime.timedelta(days=shift + (nth - 1) * 7)


def equinox(y, spring):
    base = 20.8431 if spring else 23.2488
    return datetime.date(y, 3 if spring else 9,
                         int(base + 0.242194 * (y - 1980) - (y - 1980) // 4))


def holidays(y):
    base = [datetime.date(y, 1, 1), nth_weekday(y, 1, 0, 2), datetime.date(y, 2, 11),
            datetime.date(y, 2, 23), equinox(y, True), datetime.date(y, 4, 29),
            datetime.date(y, 5, 3), datetime.date(y, 5, 4), datetime.date(y, 5, 5),
            nth_weekday(y, 7, 0, 3), datetime.date(y, 8, 11), nth_weekday(y, 9, 0, 3),
            equinox(y, False), nth_weekday(y, 10, 0, 2), datetime.date(y, 11, 3),
            datetime.date(y, 11, 23)]
    s = set(base)
    for d in base:
        if d.weekday() == 6:
            t = d + datetime.timedelta(days=1)
            while t in s:
                t += datetime.timedelta(days=1)
            s.add(t)
    for d in list(s):
        mid, nxt = d + datetime.timedelta(days=1), d + datetime.timedelta(days=2)
        if mid not in s and nxt in s and mid.weekday() != 6:
            s.add(mid)
    return s


HOL = holidays(2026) | holidays(2027)


def is_off(n):
    d = START + datetime.timedelta(days=int(n))
    return d.weekday() >= 5 or d in HOL


def any_working(a, b):
    """[a,b) の列範囲に稼働日が 1 日でもあるか"""
    lo, hi = sorted((a, b))
    for n in range(int(lo), max(int(lo) + 1, int(hi + 0.999))):
        if not is_off(n):
            return True
    return False


# ---------- PDF の格子 ----------
doc = pymupdf.open(PDF)


def grid(page):
    xs = sorted({round(it[1].x0, 3) for g in page.get_drawings()
                 if g.get('fill') and abs(g['fill'][0] - 0.89) < 0.01
                 for it in g['items'] if it[0] == 're' and it[1].height > 600})
    W0 = min(round(b - a, 3) for a, b in zip(xs, xs[1:]))
    idx = [round((x - xs[0]) / W0) for x in xs]
    n = len(xs); sx = sum(idx); sy = sum(xs)
    sxx = sum(i * i for i in idx); sxy = sum(i * x for i, x in zip(idx, xs))
    W = (n * sxy - sx * sy) / (n * sxx - sx * sx)
    return (sy - W * sx) / n - 4 * W, W


X0, W = grid(doc[0])
RH, TOP = 16.5450, 132.00
FIRST_ROW = {0: 1, 1: 43}

segs = []           # (color, n0, r0, n1, r1)
circles = []
for pi, page in enumerate(doc):
    fr = FIRST_ROW[pi]
    tn = lambda x: (x - X0) / W
    tr = lambda y: (y - TOP) / RH + fr - 0.5
    for g in page.get_drawings():
        col = g.get('color')
        if g['items'] and all(it[0] == 'c' for it in g['items']):
            rc = g['rect']
            if 3 < rc.width < 12 and 3 < rc.height < 12:
                circles.append((round(tn(rc.x0 + rc.width / 2), 2), round(tr(rc.y0 + rc.height / 2), 2)))
            continue
        fill = g.get('fill')
        if col and (g.get('width') or 0) >= 1.0:
            key = tuple(round(v, 2) for v in col)
        elif fill and not col:
            # GaNett は barProcessNameAdjust を塗りだけで描く（枠線が無い）
            key = tuple(round(v, 2) for v in fill)
        else:
            continue
        for it in g['items']:
            if it[0] == 'l':
                segs.append((key, tn(it[1].x), tr(it[1].y), tn(it[2].x), tr(it[2].y)))


# ---------- CSV / ツール ----------
rows = list(csv.reader(io.StringIO(CSVP.read_text(encoding="utf-8-sig"))))
H = {h: i for i, h in enumerate(rows[2])}
by_id = {}
for r in rows[3:]:
    if not any(c.strip() for c in r):
        continue
    ln = json.loads(r[H['工程線名']])[0]
    by_id[r[H['工程ID']]] = dict(name=ln['name'], shape=r[H['工程線の形状']],
                                 color=(r[H['工程線の色']] or '#000000').lower(),
                                 bg=(r[H['工程線の背景色']] or '').lower())


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(round(int(h[i:i + 2], 16) / 255, 2) for i in (0, 2, 4))


geom = json.loads(GEOM.read_text(encoding="utf-8"))
chk(len(geom) == len(by_id), "ツールが PDF と同じ本数を描いた", f"{len(geom)} / {len(by_id)}")

# ---------- 1. ノード丸 ----------
my_nodes = []
for g in geom:
    if g['kind'] != 'poly':
        continue
    my_nodes.append((round(g['pts'][0][0], 2), round(g['pts'][0][1], 2)))
    my_nodes.append((round(g['pts'][-1][0], 2), round(g['pts'][-1][1], 2)))
cp, cm = collections.Counter(circles), collections.Counter(my_nodes)
chk(cp == cm, "ノード丸 34 個の位置が PDF と一致（全折れ線の端点）",
    f"PDF {len(circles)} 個 / ツール {len(my_nodes)} 個"
    + ("" if cp == cm else f"  PDFのみ={sorted((cp-cm).elements())} ツールのみ={sorted((cm-cp).elements())}"))


def find_seg(color, horiz, level, lo, hi):
    """color の線分で、水平/垂直が level に乗り [lo,hi] と重なるものを探す"""
    for (k, n0, r0, n1, r1) in segs:
        if k != color:
            continue
        if horiz:
            if abs(r0 - r1) > 0.01 or abs(r0 - level) > TOL:
                continue
            a, b = sorted((n0, n1))
        else:
            if abs(n0 - n1) > 0.01 or abs(n0 - level) > TOL:
                continue
            a, b = sorted((r0, r1))
        if b > lo + 0.05 and a < hi - 0.05:
            return (round(a, 2), round(b, 2))
    return None


# ---------- 2. 折れ線の走り ----------
for g in geom:
    if g['kind'] != 'poly':
        continue
    p = by_id[g['id']]
    color = hexrgb(p['color'])
    pts = g['pts']
    ok_all, notes = True, []
    for i, ((n0, r0), (n1, r1)) in enumerate(zip(pts, pts[1:])):
        horiz = abs(r1 - r0) < 0.01
        vert = abs(n1 - n0) < 0.01
        if abs(n1 - n0) < 0.01 and abs(r1 - r0) < 0.01:
            continue
        if horiz:
            working = any_working(n0, n1)
            hit = find_seg(color, True, r0, min(n0, n1), max(n0, n1))
        elif vert:
            # 縦の走りが属する日 = 右へ続くなら n、左から来たなら n-1
            nxt = pts[i + 2][0] if i + 2 < len(pts) else None
            prv = pts[i - 1][0] if i > 0 else None
            day = int(n0) if (nxt is not None and nxt > n0) else (int(n0) - 1 if (prv is not None and prv < n0) else int(n0))
            working = not is_off(day)
            hit = find_seg(color, False, n0, min(r0, r1), max(r0, r1))
        else:
            working = any_working(n0, n1)
            hit = None
            for (k, a0, b0, a1, b1) in segs:
                if k != color or abs(a0 - a1) < 0.01 or abs(b0 - b1) < 0.01:
                    continue
                if min(a0, a1) < max(n0, n1) and max(a0, a1) > min(n0, n1) \
                        and min(b0, b1) < max(r0, r1) + 0.3 and max(b0, b1) > min(r0, r1) - 0.3:
                    hit = (round(min(a0, a1), 2), round(max(a0, a1), 2)); break
        kind = '横' if horiz else ('縦' if vert else '斜')
        if working and not hit:
            ok_all = False
            notes.append(f"{kind} n[{n0:g},{n1:g}] r[{r0:g},{r1:g}] が PDF に無い")
        elif not working and hit:
            ok_all = False
            notes.append(f"{kind} n[{n0:g},{n1:g}] は休日のみなのに PDF に線分がある")
    chk(ok_all, f"{p['name']} ({p['shape']}) の折れ方が PDF と一致",
        '; '.join(notes) if notes else f"{len(pts) - 1} 走り")

# ---------- 3. box / bar ----------
for g in geom:
    if g['kind'] == 'poly':
        continue
    p = by_id[g['id']]
    color = hexrgb(p['color'])
    b = g['box']
    top, bot = b['rTop'], b['rTop'] + b['rH']
    notes = []
    for lvl, nm in ((top, '上辺'), (bot, '下辺')):
        if not find_seg(color, True, lvl, b['n0'], b['n1']):
            notes.append(f"{nm} r={lvl:.3f} が PDF に無い")
    chk(not notes, f"{p['name']} ({p['shape']}) の上下の辺が PDF と一致",
        '; '.join(notes) or f"上 r={top:.3f} 下 r={bot:.3f} 高さ {b['rH']:.3f}行")

# ---------- 4. 関係線 ----------
# GaNett は関係線も点で描くので、線分ではなく矢じりの位置で見る。
# PDF 実測：先端は (n=6.00, r=24.77)。上側ノード（C1 の開始、行 21）の x に
# まっすぐ縦、下側ノード（D1、行 25）の手前で止まる。
import xml.etree.ElementTree as ET
svg = ET.parse(ROOT / "out" / ("pdf_period_manual.svg" if "--manual" in sys.argv else "pdf_period.svg")).getroot()
relpaths = [e for e in svg.iter('{http://www.w3.org/2000/svg}path')
            if e.get('class') == 'relation']
chk(len(relpaths) == 1, "関係線が 1 本描かれている", f"{len(relpaths)} 本")
if relpaths:
    d = relpaths[0].get('d').split()
    n0, r0 = float(d[1]) / 24, (float(d[2]) - 14) / 28 + 1   # DAY_W=24 / ROW_H=28
    n1, r1 = float(d[4]) / 24, (float(d[5]) - 14) / 28 + 1
    tips = [(round(a0, 2), round(b0, 2)) for (k, a0, b0, a1, b1) in segs
            if abs(a0 - 6.0) < 0.05 and 24.0 < b0 < 25.5]
    chk(abs(n0 - 6.0) < 0.05 and abs(r0 - 21.0) < 0.05,
        "関係線の上端が PDF と一致（C1 開始ノード n=6 行21）", f"ツール n={n0:g} r={r0:g}")
    chk(abs(n1 - 6.0) < 0.05 and abs(r1 - 25.0) < 0.35,
        "関係線の下端が PDF の矢じり位置と一致（行25 の手前）",
        f"ツール n={n1:g} r={r1:g} / PDF矢じり={tips[:2]}")

print()
print(f"{'ALL PASS' if not fails else str(len(fails)) + ' FAILED'}  ({len(lines)} 項目)")
(ROOT / "out" / LOGNAME).write_text("\n".join(lines) + "\n", encoding="utf-8")
sys.exit(0 if not fails else 1)
