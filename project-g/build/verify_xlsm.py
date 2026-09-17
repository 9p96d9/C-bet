# -*- coding: utf-8 -*-
"""生成した xlsm を構造検査して診断レポートを出す。

Excel が無い環境でも、ここまでは機械的に確かめられる。
Excel で開けなかったときは、このスクリプトの出力をそのまま添えて報告する。

  python3 build/verify_xlsm.py dist/プロジェクトG変換ツール.xlsm src
"""
import sys, os, glob, zipfile, hashlib, struct, re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

OK, NG, WARN = "OK  ", "NG  ", "警告"
problems = []

def say(level, msg):
    if level == NG:
        problems.append(msg)
    print("%s %s" % (level, msg))

def sha(b):
    return hashlib.sha256(b).hexdigest()

# ---------------------------------------------------------------- 1. package

def check_package(path):
    print("=" * 70)
    print("1. OPC パッケージ")
    print("=" * 70)
    if not os.path.exists(path):
        say(NG, "ファイルがない: %s" % path)
        return None
    print("     %s  %d bytes  sha256=%s" % (path, os.path.getsize(path),
                                            sha(open(path, "rb").read())[:16]))
    try:
        z = zipfile.ZipFile(path)
    except Exception as e:
        say(NG, "zip として開けない: %r" % e)
        return None
    names = z.namelist()
    bad = z.testzip()
    say(NG if bad else OK, "zip 整合性: %s" % (("壊れたパート " + bad) if bad else "OK"))

    need = ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml",
            "xl/_rels/workbook.xml.rels", "xl/vbaProject.bin"]
    for n in need:
        say(OK if n in names else NG, "パートの存在: %s" % n)

    ct = z.read("[Content_Types].xml").decode("utf-8")
    say(OK if "macroEnabled.main+xml" in ct else NG,
        "ブックのコンテンツ型が macroEnabled であること")
    say(OK if 'Extension="bin"' in ct and "ms-office.vbaProject" in ct else NG,
        "vbaProject の既定コンテンツ型が宣言されていること")

    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8")
    say(OK if "vbaProject.bin" in rels and "relationships/vbaProject" in rels else NG,
        "workbook -> vbaProject のリレーションがあること")

    wbx = z.read("xl/workbook.xml").decode("utf-8")
    m = re.search(r'<workbookPr[^>]*codeName="([^"]+)"', wbx)
    say(OK if m else WARN, "workbookPr codeName = %s" % (m.group(1) if m else "(なし)"))
    sheets = sorted(n for n in names if re.match(r"xl/worksheets/sheet\d+\.xml$", n))
    codes = []
    for n in sheets:
        mm = re.search(r'<sheetPr[^>]*codeName="([^"]+)"', z.read(n).decode("utf-8"))
        codes.append(mm.group(1) if mm else None)
    say(OK if all(codes) else WARN,
        "各シートの codeName = %s" % ", ".join(str(c) for c in codes))
    return z

# ---------------------------------------------------------------- 2. vba

def check_vba(z, srcdir):
    print()
    print("=" * 70)
    print("2. VBA プロジェクト (vbaProject.bin)")
    print("=" * 70)
    if z is None or "xl/vbaProject.bin" not in z.namelist():
        say(NG, "vbaProject.bin が無いので検査できない")
        return
    blob = z.read("xl/vbaProject.bin")
    print("     vbaProject.bin  %d bytes  sha256=%s" % (len(blob), sha(blob)[:16]))
    say(OK if blob[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" else NG,
        "CFB シグネチャ")
    if len(blob) >= 34:
        minor, major, order, ssz, mssz = struct.unpack_from("<HHHHH", blob, 24)
        say(OK if (major, order, ssz, mssz) == (3, 0xFFFE, 9, 6) else NG,
            "CFB ヘッダー: major=%d byteorder=0x%04X sectorShift=%d miniSectorShift=%d"
            " (期待 3 / 0xFFFE / 9 / 6)" % (major, order, ssz, mssz))
        cutoff = struct.unpack_from("<I", blob, 56)[0]
        say(OK if cutoff == 4096 else NG, "MiniStreamCutoff = %d (期待 4096)" % cutoff)

    try:
        import olefile
    except ImportError:
        say(WARN, "olefile が無いのでストリーム一覧を確認できない (pip install olefile)")
        return
    import io
    ole = olefile.OleFileIO(io.BytesIO(blob))
    entries = ["/".join(e) for e in ole.listdir(streams=True, storages=True)]
    for need in ("PROJECT", "PROJECTwm", "VBA/dir", "VBA/_VBA_PROJECT"):
        say(OK if need in entries else NG, "ストリーム: %s" % need)

    proj = ole.openstream("PROJECT").read().decode("cp932", "replace")
    for key in ("ID=", "Name=", "CMG=", "DPB=", "GC="):
        say(OK if key in proj else NG, "PROJECT に %s がある" % key)
    mods = re.findall(r"^(?:Module|Document)=([^\r\n/]+)", proj, re.M)
    print("     PROJECT が宣言するモジュール (%d): %s" % (len(mods), ", ".join(mods)))

    # dir ストリームを展開してモジュール名を数える
    try:
        import msovba
        d = msovba.decompress(ole.openstream("VBA/dir").read())
        say(OK, "dir ストリームを展開できた (%d bytes)" % len(d))
        n = len(re.findall(b"\x19\x00", d))
        cp = None
        i = 0
        while i < len(d) - 6:
            rid, size = struct.unpack_from("<HI", d, i)
            if rid == 0x0003 and size == 2:
                cp = struct.unpack_from("<H", d, i + 6)[0]
                break
            i += 1
        print("     コードページ = %s" % cp)
    except Exception as e:
        say(WARN, "dir ストリームの展開は未確認 (%r)" % e)

    # 各モジュールのソースを取り出して .bas と突き合わせる
    try:
        from oletools.olevba import VBA_Parser
        tmp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_vp_check.bin")
        open(tmp, "wb").write(blob)
        got = {os.path.splitext(nm)[0]: code
               for (_, _, nm, code) in VBA_Parser(tmp).extract_macros()}
        os.remove(tmp)
        print("     olevba が復元したモジュール (%d): %s"
              % (len(got), ", ".join(sorted(got))))
        srcs = sorted(glob.glob(os.path.join(srcdir, "*.bas")))
        if not srcs:
            say(WARN, "%s に .bas が無いので照合は省略" % srcdir)
            return
        mismatch = []
        for f in srcs:
            name = os.path.splitext(os.path.basename(f))[0]
            a = open(f, encoding="utf-8").read().replace("\r\n", "\n").rstrip("\n")
            b = got.get(name, "").replace("\r\n", "\n").rstrip("\n")
            if a != b:
                mismatch.append(name)
        say(OK if not mismatch else NG,
            "埋め込んだ %d モジュールが .bas と完全一致 %s"
            % (len(srcs), ("" if not mismatch else "(不一致: %s)" % ", ".join(mismatch))))
    except ImportError:
        say(WARN, "oletools が無いのでソース照合を省略 (pip install oletools)")

# ---------------------------------------------------------------- 3. sources

def check_sources(srcdir):
    print()
    print("=" * 70)
    print("3. VBA ソース")
    print("=" * 70)
    srcs = sorted(glob.glob(os.path.join(srcdir, "*.bas")))
    say(OK if len(srcs) == 8 else NG, "%s の .bas が 8 本 (実際 %d 本)" % (srcdir, len(srcs)))
    for f in srcs:
        raw = open(f, "rb").read()
        text = raw.decode("utf-8")
        try:
            text.encode("cp932")
            cp = "cp932 OK"
        except UnicodeEncodeError as e:
            cp = "cp932 不可: %r" % text[e.start:e.end]
            problems.append("%s が cp932 で表せない" % os.path.basename(f))
        print("     %-12s %5d 行  sha256=%s  %s"
              % (os.path.basename(f), text.count("\n") + 1, sha(raw)[:16], cp))

def main():
    xlsm = sys.argv[1] if len(sys.argv) > 1 else "dist/プロジェクトG変換ツール.xlsm"
    srcdir = sys.argv[2] if len(sys.argv) > 2 else "src"
    print("環境: python %s / %s" % (sys.version.split()[0], sys.platform))
    z = check_package(xlsm)
    check_vba(z, srcdir)
    check_sources(srcdir)
    print()
    print("=" * 70)
    if problems:
        print("結果: NG %d 件" % len(problems))
        for p in problems:
            print("  - %s" % p)
        return 1
    print("結果: 構造検査はすべて OK")
    print("（ここまでは Excel 無しで確認できる範囲。実機で開けるかは別途確認が要る）")
    return 0

sys.exit(main())
