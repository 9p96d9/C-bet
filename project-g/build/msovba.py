# -*- coding: utf-8 -*-
"""MS-OVBA (VBA プロジェクト バイナリ) の生成。

- 2.4.1 Compression : 圧縮コンテナ
- 2.4.3 Data Encryption : PROJECT ストリームの CMG/DPB/GC
- 2.3.4.2 dir Stream : プロジェクト情報・参照・モジュール一覧
- CFB (MS-CFB) の書き出し
"""
import struct, io, math

ENDOFCHAIN, FREESECT, FATSECT, DIFSECT, MAXREGSECT = 0xFFFFFFFE, 0xFFFFFFFF, 0xFFFFFFFD, 0xFFFFFFFC, 0xFFFFFFFA

# ---------------------------------------------------------------- 2.4.1 compression

def _copytoken_help(diff):
    bit_count = max(4, (diff - 1).bit_length()) if diff > 1 else 4
    bit_count = min(bit_count, 12)
    length_mask = 0xFFFF >> bit_count
    return bit_count, length_mask, (~length_mask) & 0xFFFF, (length_mask + 3)

def compress(data: bytes) -> bytes:
    out = bytearray(b"\x01")
    pos = 0
    n = len(data)
    while pos < n:
        chunk_start = pos
        chunk_end = min(pos + 4096, n)
        tokens = bytearray()
        p = pos
        while p < chunk_end:
            flags = 0
            group = bytearray()
            for bit in range(8):
                if p >= chunk_end:
                    break
                bit_count, length_mask, offset_mask, max_len = _copytoken_help(p - chunk_start)
                best_len, best_off = 0, 0
                if p - chunk_start > 0:
                    max_off = min(p - chunk_start, (offset_mask >> (16 - bit_count)) + 1)
                    lo = p - max_off
                    limit = min(max_len, chunk_end - p)
                    if limit >= 3:
                        for cand in range(lo, p):
                            l = 0
                            while l < limit and data[cand + l] == data[p + l]:
                                l += 1
                            if l > best_len:
                                best_len, best_off = l, p - cand
                                if l == limit:
                                    break
                if best_len >= 3:
                    token = (((best_off - 1) << (16 - bit_count)) | (best_len - 3)) & 0xFFFF
                    group += struct.pack("<H", token)
                    flags |= 1 << bit
                    p += best_len
                else:
                    group.append(data[p])
                    p += 1
            tokens.append(flags)
            tokens += group
        if len(tokens) < 4096:
            header = 0xB000 | (len(tokens) - 1)
            out += struct.pack("<H", header) + tokens
        else:
            raw = data[chunk_start:chunk_start + 4096]
            raw = raw + b"\x00" * (4096 - len(raw))
            out += struct.pack("<H", 0x3000 | 0x0FFF) + raw
        pos = p
    return bytes(out)

def decompress(buf: bytes) -> bytes:
    assert buf[0] == 1, "bad compressed container signature"
    out = bytearray()
    i = 1
    while i < len(buf):
        header = struct.unpack_from("<H", buf, i)[0]
        i += 2
        size = (header & 0x0FFF) + 3
        compressed = (header & 0x8000) != 0
        end = i + size - 2
        if not compressed:
            out += buf[i:end]
            i = end
            continue
        chunk_start = len(out)
        while i < end:
            flags = buf[i]; i += 1
            for bit in range(8):
                if i >= end: break
                if flags & (1 << bit):
                    token = struct.unpack_from("<H", buf, i)[0]; i += 2
                    bit_count, length_mask, offset_mask, _ = _copytoken_help(len(out) - chunk_start)
                    length = (token & length_mask) + 3
                    offset = ((token & offset_mask) >> (16 - bit_count)) + 1
                    src = len(out) - offset
                    for k in range(length):
                        out.append(out[src + k])
                else:
                    out.append(buf[i]); i += 1
    return bytes(out)

# ---------------------------------------------------------------- 2.4.3 encryption

def project_key(project_id: str) -> int:
    return sum(project_id.encode("ascii")) & 0xFF

def encrypt(data: bytes, proj_key: int, seed: int = 0x00) -> str:
    version = 2
    enc = bytearray()
    enc1 = version ^ seed
    enc2 = proj_key ^ enc1
    enc += bytes([seed, enc1, enc2])
    un1, un2 = version, proj_key
    e1, e2 = enc1, enc2
    ignored = (seed & 6) // 2
    for _ in range(ignored):
        b = 0
        eb = (b ^ ((e2 + un1) & 0xFF)) & 0xFF
        enc.append(eb)
        e2, e1 = e1, eb
        un2, un1 = un1, b
    payload = struct.pack("<I", len(data)) + data
    for b in payload:
        eb = (b ^ ((e2 + un1) & 0xFF)) & 0xFF
        enc.append(eb)
        e2, e1 = e1, eb
        un2, un1 = un1, b
    return "".join("%02X" % x for x in enc)

def decrypt(hexstr: str, proj_key: int) -> bytes:
    raw = bytes.fromhex(hexstr)
    seed, e1, e2 = raw[0], raw[1], raw[2]
    version = e1 ^ seed
    key = e2 ^ e1
    assert key == proj_key, "project key mismatch"
    un1, un2 = version, key
    i = 3
    ignored = (seed & 6) // 2
    for _ in range(ignored):
        eb = raw[i]; i += 1
        b = (eb ^ ((e2 + un1) & 0xFF)) & 0xFF
        e2, e1 = e1, eb
        un2, un1 = un1, b
    out = bytearray()
    while i < len(raw):
        eb = raw[i]; i += 1
        b = (eb ^ ((e2 + un1) & 0xFF)) & 0xFF
        out.append(b)
        e2, e1 = e1, eb
        un2, un1 = un1, b
    length = struct.unpack_from("<I", bytes(out), 0)[0]
    return bytes(out[4:4 + length])

# ---------------------------------------------------------------- CFB writer

class CfbEntry:
    def __init__(self, name, kind, data=b"", children=None):
        self.name, self.kind, self.data = name, kind, data
        self.children = children or []
        self.id = -1
        self.left = self.right = self.child = 0xFFFFFFFF
        self.start = ENDOFCHAIN
        self.size = 0

def _sort_key(e):
    return (len(e.name), e.name.upper())

def _build_tree(entries):
    """兄弟を赤黒木の形に並べる。名前長 -> 大文字名 の順に整列した平衡木にする。"""
    entries = sorted(entries, key=_sort_key)
    def build(lst):
        if not lst: return 0xFFFFFFFF
        mid = len(lst) // 2
        node = lst[mid]
        node.left = build(lst[:mid])
        node.right = build(lst[mid + 1:])
        return node.id
    return build(entries)

def write_cfb(root_children) -> bytes:
    SECTOR, MINI, CUTOFF = 512, 64, 4096

    flat = []
    def assign(entries):
        for e in entries:
            e.id = len(flat) + 1
            flat.append(e)
        for e in entries:
            if e.kind == "storage":
                assign(e.children)
    assign(root_children)

    root = CfbEntry("Root Entry", "root")
    root.id = 0
    root.child = _build_tree(root_children)
    for e in flat:
        if e.kind == "storage":
            e.child = _build_tree(e.children)
        else:
            e.size = len(e.data)

    # 小さいストリームはミニストリームへ
    mini_stream = bytearray()
    big = []
    for e in flat:
        if e.kind != "stream":
            continue
        if len(e.data) < CUTOFF:
            e.start = len(mini_stream) // MINI
            mini_stream += e.data
            pad = (-len(mini_stream)) % MINI
            mini_stream += b"\x00" * pad
        else:
            big.append(e)

    # MiniFAT
    n_mini = len(mini_stream) // MINI
    minifat = []
    idx = 0
    for e in flat:
        if e.kind == "stream" and 0 < len(e.data) < CUTOFF:
            cnt = (len(e.data) + MINI - 1) // MINI
            for k in range(cnt):
                minifat.append(e.start + k + 1 if k < cnt - 1 else ENDOFCHAIN)
    while len(minifat) < n_mini:
        minifat.append(FREESECT)
    minifat_bytes = b"".join(struct.pack("<I", x) for x in minifat)
    minifat_bytes += b"\xFF" * ((-len(minifat_bytes)) % SECTOR)

    # ディレクトリ
    def dir_entry(e):
        nm = e.name.encode("utf-16-le") + b"\x00\x00"
        nm = nm + b"\x00" * (64 - len(nm))
        otype = {"root": 5, "storage": 1, "stream": 2}[e.kind]
        return (nm + struct.pack("<HBB", len((e.name) + "\0") * 2, otype, 1)
                + struct.pack("<III", e.left, e.right, e.child)
                + b"\x00" * 16 + struct.pack("<I", 0)
                + b"\x00" * 16
                + struct.pack("<I", e.start) + struct.pack("<Q", e.size))
    dir_entries = [root] + flat
    dir_bytes = b"".join(dir_entry(e) for e in dir_entries)
    dir_bytes += b"\x00" * ((-len(dir_bytes)) % SECTOR)

    # 大きいストリーム / ミニストリーム / MiniFAT / ディレクトリ を連番のセクタに置く
    chains = []
    for e in big:
        d = e.data + b"\x00" * ((-len(e.data)) % SECTOR)
        chains.append(("stream", e, d))
    root.size = len(mini_stream)
    if mini_stream:
        chains.append(("ministream", root, bytes(mini_stream) + b"\x00" * ((-len(mini_stream)) % SECTOR)))
    if minifat_bytes:
        chains.append(("minifat", None, minifat_bytes))
    chains.append(("dir", None, dir_bytes))

    n_data = sum(len(d) // SECTOR for _, _, d in chains)
    n_fat = 1
    while math.ceil((n_data + n_fat) / (SECTOR // 4)) > n_fat:
        n_fat += 1
    assert n_fat <= 109, "DIFAT overflow not supported"

    fat = [FREESECT] * (n_fat * (SECTOR // 4))
    sectors = [None] * (n_data + n_fat)
    cur = 0
    starts = {}
    for kind, owner, d in chains:
        cnt = len(d) // SECTOR
        starts[kind if owner is None else id(owner)] = cur
        for k in range(cnt):
            sectors[cur + k] = d[k * SECTOR:(k + 1) * SECTOR]
            fat[cur + k] = cur + k + 1 if k < cnt - 1 else ENDOFCHAIN
        if kind == "stream":
            owner.start = cur
        elif kind == "ministream":
            root.start = cur
        cur += cnt
    fat_start = cur
    for k in range(n_fat):
        fat[fat_start + k] = FATSECT

    # start が確定したのでディレクトリを作り直す
    dir_bytes = b"".join(dir_entry(e) for e in dir_entries)
    dir_bytes += b"\x00" * ((-len(dir_bytes)) % SECTOR)
    dir_start = starts["dir"]
    for k in range(len(dir_bytes) // SECTOR):
        sectors[dir_start + k] = dir_bytes[k * SECTOR:(k + 1) * SECTOR]

    fat_bytes = b"".join(struct.pack("<I", x) for x in fat)
    for k in range(n_fat):
        sectors[fat_start + k] = fat_bytes[k * SECTOR:(k + 1) * SECTOR]

    header = bytearray(b"\x00" * 512)
    header[0:8] = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
    struct.pack_into("<HHHHH", header, 24, 0x003E, 3, 0xFFFE, 9, 6)
    # 34..39 は Reserved。bytearray 初期化で 0 のまま触らない
    # (ここに書き込むと MiniSectorShift を潰す)
    struct.pack_into("<I", header, 40, 0)                 # NumDirectorySectors (v3: 0)
    struct.pack_into("<I", header, 44, n_fat)
    struct.pack_into("<I", header, 48, dir_start)
    struct.pack_into("<I", header, 52, 0)
    struct.pack_into("<I", header, 56, 4096)
    struct.pack_into("<I", header, 60, starts.get("minifat", ENDOFCHAIN) if minifat_bytes else ENDOFCHAIN)
    struct.pack_into("<I", header, 64, len(minifat_bytes) // SECTOR)
    struct.pack_into("<I", header, 68, ENDOFCHAIN)
    struct.pack_into("<I", header, 72, 0)
    for k in range(109):
        struct.pack_into("<I", header, 76 + k * 4, fat_start + k if k < n_fat else FREESECT)

    return bytes(header) + b"".join(s if s is not None else b"\x00" * SECTOR for s in sectors)
