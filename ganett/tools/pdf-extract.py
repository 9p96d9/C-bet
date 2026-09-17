#!/usr/bin/env python3
"""
PDF 1 頁目から工程線のベクター座標を抜き、(日付 index, 行番号) 空間に直す。
描画規則を目視ではなく実座標で確定するための道具。
"""
import csv, io, json, datetime, collections
from pathlib import Path
import pymupdf

HERE = Path(__file__).resolve().parent
S = HERE.parent / "sample" / "Sample"
PDF = S / "サポートルーム_サンプル工程表.pdf"
CSV = S / "サポートルーム_サンプル工程表.csv"
START = datetime.date(2026, 9, 1)


def derive_grid(page):
    """灰色の休日列から x 原点と列幅を出す。"""
    xs = sorted({round(it[1].x0, 3) for g in page.get_drawings()
                 if g.get('fill') and abs(g['fill'][0] - 0.89) < 0.01
                 for it in g['items'] if it[0] == 're' and it[1].height > 600})
    W0 = min(round(b - a, 3) for a, b in zip(xs, xs[1:]))
    idx = [round((x - xs[0]) / W0) for x in xs]
    n = len(xs); sx = sum(idx); sy = sum(xs)
    sxx = sum(i * i for i in idx); sxy = sum(i * x for i, x in zip(idx, xs))
    W = (n * sxy - sx * sy) / (n * sxx - sx * sx)
    X0 = (sy - W * sx) / n - 4 * W          # 最初の休日列は 09/05 = index 4
    return X0, W, xs


def node_rows(page, rows_sorted):
    """ノード丸の y を既知の行番号に対応づけて行原点・行高を出す。"""
    ys = sorted({round(g['rect'].y0 + g['rect'].height / 2, 3)
                 for g in page.get_drawings()
                 if g['items'] and all(it[0] == 'c' for it in g['items'])
                 and 3 < g['rect'].width < 12 and 3 < g['rect'].height < 12})
    assert len(ys) == len(rows_sorted), (len(ys), len(rows_sorted))
    n = len(ys); sx = sum(rows_sorted); sy = sum(ys)
    sxx = sum(r * r for r in rows_sorted); sxy = sum(r * y for r, y in zip(rows_sorted, ys))
    RH = (n * sxy - sx * sy) / (n * sxx - sx * sx)
    A = (sy - RH * sx) / n                   # y(r) = A + RH*r
    return A, RH, ys


def load_procs():
    t = CSV.read_text(encoding="utf-8-sig")
    rows = list(csv.reader(io.StringIO(t)))
    H = {h: i for i, h in enumerate(rows[2])}
    out = []
    for r in rows[3:]:
        if not any(c.strip() for c in r):
            continue
        ln = json.loads(r[H['工程線名']])[0]
        out.append({
            'name': ln['name'], 'textSize': ln.get('textSize'),
            'shape': r[H['工程線の形状']], 'arrow': r[H['工程線の矢印']],
            'dash': r[H['実線・点線']], 'weight': r[H['工程線の太さ']],
            'color': r[H['工程線の色']], 'bg': r[H['工程線の背景色']],
            'slant': r[H['工程線の斜行']],
            'srow': int(r[H['開始日の行番号']]), 'erow': int(r[H['終了日の行番号']]),
            'start': datetime.date.fromisoformat(r[H['開始日']][:10]),
            'end': datetime.date.fromisoformat(r[H['終了日']][:10]),
            'mid': r[H['項目ID（中間ノード）']],
            'midDate': (datetime.date.fromisoformat(r[H['中間ノード日付']][:10])
                        if r[H['中間ノード日付']].strip() else None),
        })
    return out


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(round(int(h[i:i + 2], 16) / 255, 2) for i in (0, 2, 4))


def main():
    doc = pymupdf.open(PDF)
    page = doc[0]
    procs = load_procs()
    POLY = ('straight', 'xElbow', 'yElbow', 'crank', 'gate')
    rows_used = sorted({r for p in procs for r in (p['srow'], p['erow']) if p['shape'] in POLY})
    X0, W, _ = derive_grid(page)
    A, RH, _ = node_rows(page, rows_used)
    print(f"格子: x(n) = {X0:.3f} + n*{W:.4f}")
    print(f"      y(r) = {A:.3f} + r*{RH:.4f}  =  上端{A + RH / 2:.2f} + (r-1)*{RH:.4f} + {RH / 2:.4f}")
    print()

    def to_n(x): return (x - X0) / W
    def to_r(y): return (y - A) / RH

    by_color = collections.defaultdict(list)
    for p in procs:
        by_color[hex_rgb(p['color']) if p['color'] else (0.0, 0.0, 0.0)].append(p)

    segs = collections.defaultdict(list)
    for g in page.get_drawings():
        col = g.get('color')
        if not col:
            continue
        key = tuple(round(v, 2) for v in col)
        if key not in by_color:
            continue
        dash = (g.get('dashes') or '[] 0').strip()
        w = round(g.get('width') or 0, 2)
        for it in g['items']:
            if it[0] == 'l':
                a, b = it[1], it[2]
                segs[key].append((a.x, a.y, b.x, b.y, dash, w))
            elif it[0] == 're':
                r = it[1]
                segs[key].append(('re', r.x0, r.y0, r.x1, r.y1, dash, w))

    for key in sorted(by_color, key=lambda k: by_color[k][0]['name']):
        plist = by_color[key]
        print(f"=== 色 {key} → {', '.join(p['name'] for p in plist)} ===")
        for p in plist:
            n0 = (p['start'] - START).days
            n1 = (p['end'] - START).days + 1
            md = (p['midDate'] - START).days if p['midDate'] else None
            print(f"    CSV {p['name']:<5}{p['shape']:<22} n[{n0},{n1}] r[{p['srow']}→{p['erow']}]"
                  f" arrow={p['arrow']} dash={p['dash'] or '-'} w={p['weight'] or '-'}"
                  f" slant={p['slant'] or '-'} midN={md}")
        raw = []
        for s in segs.get(key, []):
            if s[0] == 're':
                _, x0, y0, x1, y1, dash, w = s
                print(f"    RECT n[{to_n(x0):7.3f},{to_n(x1):7.3f}] r[{to_r(y0):6.2f},{to_r(y1):6.2f}] dash={dash} w={w}")
            else:
                raw.append((to_n(s[0]), to_r(s[1]), to_n(s[2]), to_r(s[3]), s[4], s[5]))
        merged = []
        for (n0, r0, n1, r1, dash, w) in raw:
            if merged:
                pn0, pr0, pn1, pr1, pd, pw = merged[-1]
                straight = abs((n1 - n0) * (pr1 - pr0) - (r1 - r0) * (pn1 - pn0)) < 1e-5
                if abs(pn1 - n0) < 1e-4 and abs(pr1 - r0) < 1e-4 and straight and pw == w:
                    merged[-1] = (pn0, pr0, n1, r1, pd if pd == dash else 'mix', w)
                    continue
            merged.append((n0, r0, n1, r1, dash, w))
        for (n0, r0, n1, r1, dash, w) in merged:
            kind = '横' if abs(r1 - r0) < 1e-3 else ('縦' if abs(n1 - n0) < 1e-3 else '斜')
            print(f"      {kind} n {n0:8.3f} → {n1:8.3f}   r {r0:6.2f} → {r1:6.2f}  w={w} dash={dash}")
        print()


if __name__ == '__main__':
    main()
