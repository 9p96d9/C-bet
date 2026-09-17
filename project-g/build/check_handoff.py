# -*- coding: utf-8 -*-
"""引き渡し用 md の自己検査。

A_プロジェクトG_コード一式.md **だけ**を入力に全ファイルを復元し、
ハッシュが原本と一致すること、そこからビルドと構造検査が通ること、
出来た vbaProject.bin が原本とバイト一致することを確かめる。

受け取り側が md を書き出すときと同じ条件 (UTF-8 / LF / 末尾改行 1 つ) で
復元しているので、ここが通れば「md の書き写しで壊れる」経路は潰せている。

  python3 build/check_handoff.py handoff/A_プロジェクトG_コード一式.md .
"""
import re, os, sys, hashlib, shutil, subprocess, tempfile

MD = sys.argv[1]
ORIG_ROOT = sys.argv[2]
text = open(MD, encoding="utf-8").read()

# マニフェスト表から期待ハッシュを拾う
manifest = dict(re.findall(r"^\| *\d+ *\| *`([^`]+)` *\| *\d+ *\| *`([0-9a-f]{64})` *\|", text, re.M))
print("マニフェストのファイル数:", len(manifest))

# 各節の本文を取り出す
F = "`" * 3
pat = re.compile(r"^## \d+\. `([^`]+)`\n.*?\nSHA-256: `([0-9a-f]{64})`\n\n"
                 + re.escape(F) + r"[a-z]*\n(.*?)\n" + re.escape(F) + r"\n",
                 re.S | re.M)
found = pat.findall(text)
print("抽出できた節の数:", len(found))

work = tempfile.mkdtemp()
ok = True
for path, want, code in found:
    dest = os.path.join(work, path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    # 指示どおり UTF-8 / LF / 末尾改行 1 つで書き出す
    open(dest, "w", encoding="utf-8", newline="\n").write(code + "\n")
    got = hashlib.sha256(open(dest, "rb").read()).hexdigest()
    same_manifest = (got == want == manifest.get(path, ""))
    orig = hashlib.sha256(open(os.path.join(ORIG_ROOT, path), "rb").read()).hexdigest()
    same_orig = (got == orig)
    if not (same_manifest and same_orig):
        ok = False
        print("  NG %-24s 節=%s 期待=%s 原本=%s" % (path, got[:12], want[:12], orig[:12]))
    else:
        print("  OK %-24s %s" % (path, got[:16]))
print("ハッシュ全一致:", ok)
if not ok:
    sys.exit(1)

# md から復元したものだけでビルドできるか
os.makedirs(os.path.join(work, "dist"), exist_ok=True)
r = subprocess.run([sys.executable, os.path.join(work, "build", "build_xlsm.py"),
                    os.path.join(work, "src"), os.path.join(work, "dist")],
                   capture_output=True, text=True, cwd=work)
print("\n--- build_xlsm.py ---")
print(r.stdout.strip() or r.stderr.strip()[-800:])
if r.returncode != 0:
    sys.exit(1)

r = subprocess.run([sys.executable, os.path.join(work, "build", "verify_xlsm.py"),
                    os.path.join(work, "dist", "プロジェクトG変換ツール.xlsm"),
                    os.path.join(work, "src")], capture_output=True, text=True, cwd=work)
print("\n--- verify_xlsm.py (末尾) ---")
print("\n".join(r.stdout.strip().split("\n")[-4:]))
built = os.path.join(work, "dist", "プロジェクトG変換ツール.xlsm")
ref = os.path.join(ORIG_ROOT, "dist", "プロジェクトG変換ツール.xlsm")
import zipfile
a = zipfile.ZipFile(built).read("xl/vbaProject.bin")
b = zipfile.ZipFile(ref).read("xl/vbaProject.bin")
print("\nvbaProject.bin が原本とバイト一致:", hashlib.sha256(a).hexdigest() == hashlib.sha256(b).hexdigest())
shutil.rmtree(work)
sys.exit(r.returncode)
