#!/usr/bin/env python3
"""
配布用 zip を作る。

Windows のエクスプローラーは、zip の各エントリに UTF-8 フラグ
（general purpose bit flag の bit 11 = 0x800）が立っていないと、
ファイル名を CP932（Shift-JIS）として読む。日本語名はそこで文字化けする。

Linux の zip コマンドはこのフラグを立てないことがあるので、
Python の zipfile で作る。zipfile は名前に非 ASCII が含まれるとき
自動で 0x800 を立てる。作ったあとに必ず検査する。
"""
import sys, zipfile, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAME = "プロジェクトG_ステップ1_往路"
OUT = ROOT.parent / f"{NAME}.zip"
SKIP_DIRS = {"node_modules", ".git", "__pycache__"}


def collect(base: Path):
    for p in sorted(base.rglob("*")):
        if any(part in SKIP_DIRS for part in p.relative_to(base).parts):
            continue
        if p.is_symlink() or not p.is_file():
            continue
        yield p


def main():
    if OUT.exists():
        OUT.unlink()
    files = list(collect(ROOT))
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in files:
            arc = f"{NAME}/{p.relative_to(ROOT).as_posix()}"
            z.write(p, arc)

    # 検査：全エントリが UTF-8 フラグ付きで、名前が往復すること
    bad_flag, bad_name = [], []
    with zipfile.ZipFile(OUT) as z:
        infos = z.infolist()
        for i in infos:
            nonascii = any(ord(c) > 127 for c in i.filename)
            if nonascii and not (i.flag_bits & 0x800):
                bad_flag.append(i.filename)
            # 生バイトが UTF-8 として読み直せること
            try:
                raw = i.orig_filename.encode("utf-8")
                if raw.decode("utf-8") != i.orig_filename:
                    bad_name.append(i.filename)
            except UnicodeError:
                bad_name.append(i.filename)

    size = OUT.stat().st_size
    ja = sum(1 for i in infos if any(ord(c) > 127 for c in i.filename))
    print(f"{OUT.name}  {size:,} bytes  {len(infos)} ファイル（うち日本語名 {ja}）")
    print(f"  UTF-8 フラグなし : {len(bad_flag)} 件")
    print(f"  名前が往復しない : {len(bad_name)} 件")
    for f in (bad_flag + bad_name)[:5]:
        print("    ", f)
    ok = not bad_flag and not bad_name
    print("=> Windows で文字化けしない形式" if ok else "=> 不備あり")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
