# -*- coding: utf-8 -*-
"""納品する .bas から vbaProject.bin を作る (MS-OVBA)。"""
import struct, os, glob, sys
import msovba
from msovba import CfbEntry, compress, encrypt, project_key, write_cfb

DEFAULT_DOCS = [("ThisWorkbook", "workbook"), ("Sheet1", "worksheet"),
                ("Sheet2", "worksheet"), ("Sheet3", "worksheet"), ("Sheet4", "worksheet")]

PROJECT_ID = "{B3A9E2C1-7D64-4F18-9A52-0C6E1F3D8B47}"
PROJECT_NAME = "ProjectGConv"
CODEPAGE = 932                      # 日本語コメントを含むため Shift-JIS
LCID = 0x0411                       # ja-JP
SYSKIND = 0x00000003                # 64-bit Windows

REFERENCES = [
    ("stdole", "*\\G{00020430-0000-0000-C000-000000000046}#2.0#0#C:\\Windows\\SysWOW64\\stdole2.tlb#OLE Automation"),
    ("Office", "*\\G{2DF8D04C-5BFA-101B-BDE5-00AA0044DE52}#2.8#0#C:\\Program Files\\Common Files\\Microsoft Shared\\OFFICE16\\MSO.DLL#Microsoft Office 16.0 Object Library"),
    ("Excel", "*\\G{00020813-0000-0000-C000-000000000046}#1.9#0#C:\\Program Files\\Microsoft Office\\Root\\Office16\\EXCEL.EXE#Microsoft Excel 16.0 Object Library"),
    ("VBA", "*\\G{000204EF-0000-0000-C000-000000000046}#4.2#9#C:\\Program Files\\Common Files\\Microsoft Shared\\VBA\\VBA7.1\\VBE7.DLL#Visual Basic For Applications"),
]

def rec(rid, payload):
    return struct.pack("<HI", rid, len(payload)) + payload

def mbcs(s):
    return s.encode("cp%d" % CODEPAGE)

def utf16(s):
    return s.encode("utf-16-le")

DOC_ATTRS = {
    "workbook": "0{00020819-0000-0000-C000-000000000046}",
    "worksheet": "0{00020820-0000-0000-C000-000000000046}",
}

def doc_module_source(name, kind):
    return "\r\n".join([
        'Attribute VB_Name = "%s"' % name,
        'Attribute VB_Base = "%s"' % DOC_ATTRS[kind],
        'Attribute VB_GlobalNameSpace = False',
        'Attribute VB_Creatable = False',
        'Attribute VB_PredeclaredId = True',
        'Attribute VB_Exposed = True',
        'Attribute VB_TemplateDerived = False',
        'Attribute VB_Customizable = True',
        '',
    ])

def dir_stream(modules):
    b = bytearray()
    # --- PROJECTINFORMATION
    b += rec(0x0001, struct.pack("<I", SYSKIND))
    b += rec(0x004A, struct.pack("<I", 0x00000001))            # PROJECTCOMPATVERSION
    b += rec(0x0002, struct.pack("<I", LCID))
    b += rec(0x0014, struct.pack("<I", LCID))
    b += rec(0x0003, struct.pack("<H", CODEPAGE))
    b += rec(0x0004, mbcs(PROJECT_NAME))
    b += rec(0x0005, b"") + struct.pack("<HI", 0x0040, 0)      # DocString (空)
    b += rec(0x0006, b"") + struct.pack("<HI", 0x003D, 0)      # HelpFilePath (空)
    b += rec(0x0007, struct.pack("<I", 0))
    b += rec(0x0008, struct.pack("<I", 0))
    b += struct.pack("<HI", 0x0009, 4) + struct.pack("<IH", 0, 0)   # PROJECTVERSION
    b += rec(0x000C, b"") + struct.pack("<HI", 0x003C, 0)      # Constants (空)
    # --- PROJECTREFERENCES
    for name, libid in REFERENCES:
        b += rec(0x0016, mbcs(name)) + struct.pack("<HI", 0x003E, len(utf16(name))) + utf16(name)
        payload = struct.pack("<I", len(mbcs(libid))) + mbcs(libid) + struct.pack("<IH", 0, 0)
        b += struct.pack("<HI", 0x000D, len(payload)) + payload
    # --- PROJECTMODULES
    b += rec(0x000F, struct.pack("<H", len(modules)))
    b += rec(0x0013, struct.pack("<H", 0xFFFF))
    for name, _src, is_doc in modules:
        b += rec(0x0019, mbcs(name))
        b += rec(0x0047, utf16(name))
        b += rec(0x001A, mbcs(name)) + struct.pack("<HI", 0x0032, len(utf16(name))) + utf16(name)
        b += rec(0x001C, b"") + struct.pack("<HI", 0x0048, 0)
        b += rec(0x0031, struct.pack("<I", 0))                 # TextOffset = 0
        b += rec(0x001E, struct.pack("<I", 0))
        b += rec(0x002C, struct.pack("<H", 0xFFFF))
        b += struct.pack("<HI", 0x0022 if is_doc else 0x0021, 0)   # 文書 / 標準モジュール
        b += struct.pack("<HI", 0x002B, 0)                     # モジュール終端
    b += struct.pack("<HI", 0x0010, 0)                         # dir 終端
    return bytes(b)

def project_stream(modules):
    key = project_key(PROJECT_ID)
    lines = ['ID="%s"' % PROJECT_ID]
    for name, _src, is_doc in modules:
        lines.append(("Document=%s/&H00000000" % name) if is_doc else ("Module=%s" % name))
    lines += [
        'Name="%s"' % PROJECT_NAME,
        'HelpContextID="0"',
        'VersionCompatible32="393222000"',
        'CMG="%s"' % encrypt(struct.pack("<I", 0), key, seed=0x3A),        # 保護なし
        'DPB="%s"' % encrypt(b"\x00", key, seed=0x5C),                      # パスワードなし
        'GC="%s"' % encrypt(b"\xFF", key, seed=0x71),                       # 可視
        "",
        "[Host Extender Info]",
        "&H00000001={3832D640-CF90-11CF-8E43-00A0C911005A};VBE;&H00000000",
        "",
        "[Workspace]",
    ]
    for name, _src, _d in modules:
        lines.append("%s=0, 0, 0, 0, C" % name)
    return ("\r\n".join(lines) + "\r\n").encode("cp%d" % CODEPAGE)

def projectwm_stream(modules):
    b = bytearray()
    for name, _src, _d in modules:
        b += mbcs(name) + b"\x00" + utf16(name) + b"\x00\x00"
    b += b"\x00\x00"
    return bytes(b)

def load_modules(srcdir, doc_modules):
    """標準モジュール (.bas) + 文書モジュール (ThisWorkbook / 各シート)。

    文書モジュールは Excel が xlsm の VBA プロジェクトに必ず持つもの。
    中身は空 (属性行だけ) だが、無いとプロジェクトの形が Excel の想定と
    変わるので、本物と同じ構成にしておく。
    """
    mods = []
    for name, kind in doc_modules:
        mods.append((name, doc_module_source(name, kind), True))
    for path in sorted(glob.glob(os.path.join(srcdir, "*.bas"))):
        text = open(path, encoding="utf-8").read()
        name = os.path.splitext(os.path.basename(path))[0]
        body = text.replace("\r\n", "\n").replace("\n", "\r\n")
        mods.append((name, body, False))
    return mods

def build(srcdir, doc_modules=()):
    modules = load_modules(srcdir, doc_modules)
    vba_children = [
        CfbEntry("_VBA_PROJECT", "stream", b"\xcc\x61\xff\xff\x00\x00\x00"),
        CfbEntry("dir", "stream", compress(dir_stream(modules))),
    ]
    for name, src, _d in modules:
        vba_children.append(CfbEntry(name, "stream", compress(src.encode("cp%d" % CODEPAGE))))
    root = [
        CfbEntry("PROJECT", "stream", project_stream(modules)),
        CfbEntry("PROJECTwm", "stream", projectwm_stream(modules)),
        CfbEntry("VBA", "storage", children=vba_children),
    ]
    return write_cfb(root), modules

if __name__ == "__main__":
    src = sys.argv[1]
    out = sys.argv[2]
    data, mods = build(src, DEFAULT_DOCS)
    open(out, "wb").write(data)
    print("wrote %s (%d bytes), %d modules: %s"
          % (out, len(data), len(mods), ", ".join(m[0] for m in mods)))
