# -*- coding: utf-8 -*-
"""原因切り分け用の xlsm を段階的に作る。

本番ビルドは「独自生成の vbaProject.bin」「型ライブラリ参照 4 つ」
「文書モジュール 5 本」「実モジュール 8 本」を同時に含んでいる。
どれが Excel に拒まれているのか分からないので、1 つずつ足した
はしごを作って、どこで壊れるかを 1 往復で特定する。

  P1  最小モジュール 1 本 + VBA 参照のみ            + 文書モジュールなし
  P2  P1 に 型ライブラリ参照 4 つ
  P3  P2 に 文書モジュール 5 本
  P4  参照 4 つ + 実モジュール 8 本                 + 文書モジュールなし
  (P5 = 本番。P3 と P4 を合わせたもの)
"""
import os, sys, shutil, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import build_vba

# build_xlsm.py は import しただけで main() が走る作りだが、あの 2 ファイルは
# 既に相手へ渡してハッシュ照合済みなので、デバッグ中は 1 バイトも変えない。
# 捨てる出力先を argv に積んでから読み込み、生成物は即消す。
_throwaway = tempfile.mkdtemp()
_argv = sys.argv
sys.argv = ["build_xlsm.py", os.path.join(ROOT, "src"), _throwaway]
try:
    import build_xlsm
finally:
    sys.argv = _argv
    shutil.rmtree(_throwaway, ignore_errors=True)

PROBE_SRC = '''Attribute VB_Name = "Probe"
Option Explicit

' 型ライブラリ参照を一切使わない最小マクロ。
' Alt+F8 -> ProbeHello で実行する。
Public Sub ProbeHello()
    MsgBox "このブックの VBA は動いています。", vbInformation, "Probe"
End Sub
'''

ALL_REFS = list(build_vba.REFERENCES)
VBA_ONLY = [r for r in ALL_REFS if r[0] == "VBA"]
DOCS = list(build_vba.DEFAULT_DOCS)

PROBES = [
    ("P1_最小_参照VBAのみ_文書なし", "probe", VBA_ONLY, []),
    ("P2_最小_参照4つ_文書なし",     "probe", ALL_REFS, []),
    ("P3_最小_参照4つ_文書あり",     "probe", ALL_REFS, DOCS),
    ("P4_本番8本_参照4つ_文書なし",  "real",  ALL_REFS, []),
]

def build_one(name, kind, refs, docs, outdir):
    if kind == "probe":
        src = tempfile.mkdtemp()
        open(os.path.join(src, "Probe.bas"), "w", encoding="utf-8", newline="\n").write(PROBE_SRC)
    else:
        src = os.path.join(ROOT, "src")

    saved = build_vba.REFERENCES
    build_vba.REFERENCES = refs
    try:
        vba, mods = build_vba.build(src, docs)
    finally:
        build_vba.REFERENCES = saved

    tmp = os.path.join(outdir, "_tmp.xlsx")
    build_xlsm.build_workbook(tmp)
    out = os.path.join(outdir, name + ".xlsm")
    build_xlsm.inject_vba(tmp, out, vba)
    os.remove(tmp)
    if kind == "probe":
        shutil.rmtree(src)
    print("  %-34s %6d bytes  参照 %d  文書 %d  モジュール %d"
          % (name + ".xlsm", os.path.getsize(out), len(refs), len(docs), len(mods)))
    return out

def main():
    outdir = os.path.join(ROOT, "probes")
    if os.path.isdir(outdir):
        shutil.rmtree(outdir)
    os.makedirs(outdir)
    print("切り分け用 xlsm:")
    for name, kind, refs, docs in PROBES:
        build_one(name, kind, refs, docs, outdir)
    shutil.copy(os.path.join(ROOT, "dist", "プロジェクトG変換ツール.xlsm"),
                os.path.join(outdir, "P5_本番_参照4つ_文書あり.xlsm"))
    print("  %-34s %6d bytes  (本番のコピー)"
          % ("P5_本番_参照4つ_文書あり.xlsm",
             os.path.getsize(os.path.join(outdir, "P5_本番_参照4つ_文書あり.xlsm"))))

main()
