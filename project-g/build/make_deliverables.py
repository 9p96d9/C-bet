# -*- coding: utf-8 -*-
"""納品物を一括で作り直す。

  1. プロジェクトG変換ツール.xlsm            (.bas から vbaProject.bin を生成して組み込む)
  2. サンプルで生成した xlsx           (納品する .bas をそのまま実行)
  3. 変換ログ.txt
  4. スマホ表示のスクリーンショット 3 枚
"""
import os, sys, shutil, subprocess, glob, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "src")
TEST = os.path.join(ROOT, "test")
DIST = os.path.join(ROOT, "dist")
SHOTS = os.path.join(ROOT, "docs")
SAMPLE_DIR = os.path.join(ROOT, "sample", "Sample")
SAMPLE_CSV = os.path.join(SAMPLE_DIR, "サポートルーム_サンプル工程表.csv")

sys.path.insert(0, TEST)
sys.path.insert(0, HERE)

def sh(*args):
    subprocess.run(args, check=True)

def main():
    os.makedirs(DIST, exist_ok=True)
    os.makedirs(SHOTS, exist_ok=True)

    # 1. xlsm
    sh(sys.executable, os.path.join(HERE, "build_xlsm.py"), SRC, DIST)

    # 2-3. サンプル変換 (CSV と同じフォルダーに出るのが本来の動き)
    import harness, vbaint
    before = set(os.listdir(SAMPLE_DIR))
    I = harness.build()
    mod, proc = I.find_proc("Convert")
    msg = vbaint.vba_str(I.call_proc(mod, proc,
                                     [SAMPLE_CSV, harness.date(2026, 9, 1), harness.date(2026, 10, 10)]))
    print("Convert ->", msg)
    made = [n for n in os.listdir(SAMPLE_DIR) if n not in before]
    xlsx = None
    for n in made:
        src = os.path.join(SAMPLE_DIR, n)
        shutil.copy(src, os.path.join(DIST, n))
        if n.endswith(".xlsx"):
            xlsx = os.path.join(DIST, n)
        os.remove(src)          # 入力フォルダーは元の状態に戻す
    print("deliverables:", made)

    # 4. スマホ表示
    shots = [("スマホ表示_01_データ列.png", ["--scroll-x", "0", "--scroll-y", "0"]),
             ("スマホ表示_02_バーと日付.png", ["--scroll-x", "380", "--scroll-y", "90"]),
             ("スマホ表示_03_全体を縮小.png", ["--zoom", "0.30"])]
    for name, extra in shots:
        sh(sys.executable, os.path.join(TEST, "phone_render.py"), xlsx,
           os.path.join(DIST, "_preview.html"), os.path.join(SHOTS, name), *extra)
    os.remove(os.path.join(DIST, "_preview.html"))
    print("screenshots ->", SHOTS)

main()
