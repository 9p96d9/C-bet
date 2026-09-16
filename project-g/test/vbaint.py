# -*- coding: utf-8 -*-
"""納品する .bas を実際に実行するための VBA サブセット・インタプリタ。

このコンテナには Excel も LibreOffice Calc も無いため、設計A 8章の受け入れ
試験を「納品物そのもの」に対して回す手段としてこれを使う。Excel の
オブジェクトモデルは excel_mock.py が提供する。
"""
import math, re, datetime

# ---------------------------------------------------------------- values

class _Singleton:
    def __init__(self, n): self.n = n
    def __repr__(self): return self.n
    def __bool__(self): return False

EMPTY = _Singleton("Empty")
NOTHING = _Singleton("Nothing")
MISSING = _Singleton("Missing")

EPOCH = datetime.date(1899, 12, 30)

class VDate(float):
    """VBA の Date。内部はシリアル値なので数値として比較・演算できる。"""
    def __repr__(self): return "VDate(%s)" % float(self)

def to_date(v):
    if isinstance(v, VDate): return v
    if isinstance(v, bool): return VDate(-1 if v else 0)
    if isinstance(v, (int, float)): return VDate(float(v))
    if isinstance(v, str): return VDate(parse_date_string(v))
    if v is EMPTY: return VDate(0.0)
    raise VBAError(13, "Type mismatch")

def parse_date_string(s):
    s = s.strip()
    for fmt in ("%Y/%m/%d %H:%M:%S", "%Y/%m/%d", "%Y-%m-%d", "%Y/%m/%d %H:%M"):
        try:
            dt = datetime.datetime.strptime(s, fmt)
            return (dt.date() - EPOCH).days + (dt.hour*3600+dt.minute*60+dt.second)/86400.0
        except ValueError:
            pass
    raise VBAError(13, "Type mismatch: %r is not a date" % s)

def serial_to_dt(x):
    days = int(math.floor(x))
    frac = x - days
    d = EPOCH + datetime.timedelta(days=days)
    secs = int(round(frac * 86400))
    return datetime.datetime(d.year, d.month, d.day) + datetime.timedelta(seconds=secs)

class VArray:
    __slots__ = ("lo", "hi", "data", "etype", "allocated")
    def __init__(self, lo=0, hi=-1, etype="Variant", allocated=False):
        self.lo, self.hi, self.etype, self.allocated = lo, hi, etype, allocated
        self.data = [default_of(etype) for _ in range(max(0, hi - lo + 1))]
    def get(self, i):
        if not self.allocated or i < self.lo or i > self.hi:
            raise VBAError(9, "Subscript out of range (%s)" % i)
        return self.data[i - self.lo]
    def set(self, i, v):
        if not self.allocated or i < self.lo or i > self.hi:
            raise VBAError(9, "Subscript out of range (%s)" % i)
        self.data[i - self.lo] = coerce(v, self.etype)
    def copy(self):
        a = VArray(self.lo, self.lo - 1, self.etype, self.allocated)
        a.hi = self.hi
        a.data = [deep_copy(x) for x in self.data]
        return a

class VStruct:
    __slots__ = ("tname", "fields")
    def __init__(self, tname, fields):
        self.tname, self.fields = tname, fields
    def copy(self):
        return VStruct(self.tname, {k: deep_copy(v) for k, v in self.fields.items()})

def deep_copy(v):
    if isinstance(v, (VStruct, VArray)): return v.copy()
    return v

class VBAError(Exception):
    def __init__(self, number, description=""):
        super().__init__("%s: %s" % (number, description))
        self.number, self.description = number, description

# ---------------------------------------------------------------- types

NUMERIC = ("Long", "Integer", "Double", "Single", "Byte", "Currency")

def default_of(t):
    t = (t or "Variant")
    if t in NUMERIC: return 0
    if t == "String": return ""
    if t == "Boolean": return False
    if t == "Date": return VDate(0.0)
    if t == "Object": return NOTHING
    return EMPTY

def bankers_round(x):
    f = math.floor(x)
    d = x - f
    if d > 0.5: return int(f) + 1
    if d < 0.5: return int(f)
    return int(f) if int(f) % 2 == 0 else int(f) + 1

def coerce(v, t):
    if t is None or t == "Variant" or t == "Object": return v
    if isinstance(v, _Singleton):
        return default_of(t) if v is EMPTY else v
    if t == "String":
        return vba_str(v)
    if t == "Boolean":
        return bool(v) if not isinstance(v, str) else (v != "")
    if t == "Date":
        return to_date(v)
    if t in ("Long", "Integer", "Byte"):
        if isinstance(v, bool): return -1 if v else 0
        if isinstance(v, str): return bankers_round(parse_number(v))
        return bankers_round(float(v))
    if t in ("Double", "Single", "Currency"):
        if isinstance(v, bool): return -1.0 if v else 0.0
        if isinstance(v, str): return parse_number(v)
        return float(v)
    return v

def parse_number(s):
    s = s.strip()
    if s == "": raise VBAError(13, "Type mismatch (empty string as number)")
    if s[:2].lower() == "&h": return float(int(s[2:], 16))
    try: return float(s)
    except ValueError: raise VBAError(13, "Type mismatch: %r" % s)

def vba_str(v):
    if isinstance(v, bool): return "True" if v else "False"
    if isinstance(v, VDate):
        dt = serial_to_dt(float(v))
        if float(v) == int(float(v)): return dt.strftime("%Y/%m/%d")
        return dt.strftime("%Y/%m/%d %H:%M:%S")
    if isinstance(v, float):
        if v == int(v) and abs(v) < 1e15: return str(int(v))
        return repr(v)
    if isinstance(v, int): return str(v)
    if v is EMPTY: return ""
    if v is NOTHING: raise VBAError(91, "Object variable not set")
    if isinstance(v, str): return v
    if hasattr(v, "vba_default"): return vba_str(v.vba_default())
    raise VBAError(13, "Type mismatch in CStr(%r)" % (v,))

def truthy(v):
    if isinstance(v, bool): return v
    if isinstance(v, str): return v != "" and v != "0"
    if isinstance(v, _Singleton): return False
    if isinstance(v, (int, float)): return v != 0
    return v is not None

# ---------------------------------------------------------------- lexer

KEYWORDS = set("""Option Explicit Public Private Const Type End Sub Function Dim ReDim Preserve Set
If Then ElseIf Else For To Step Next Do While Loop Until Select Case Exit On Error Resume GoTo
Call As New ByVal ByRef Optional And Or Not Xor Mod Is Like Nothing True False Empty Null
Open Close Print Get Put Input Output Append Binary Random Access Read Write Lock Shared Len
Attribute Erase Kill With Declare Property Let Static Rem Each In""".split())
KW_LOWER = {k.lower(): k for k in KEYWORDS}

TOKEN_RE = re.compile(r"""
    (?P<ws>[ \t]+)
  | (?P<comment>'[^\n]*)
  | (?P<str>"(?:[^"]|"")*")
  | (?P<hex>&[hH][0-9A-Fa-f]+)
  | (?P<num>(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?[#!&%@]?)
  | (?P<id>[A-Za-z_぀-ヿ一-鿿＀-￯][A-Za-z0-9_぀-ヿ一-鿿＀-￯]*[$%&!#@]?)
  | (?P<cont>\x01)
  | (?P<op>:=|<=|>=|<>|[-+*/\\^&=<>(),.:#])
  | (?P<nl>\n)
""", re.VERBOSE)

class Tok:
    __slots__ = ("kind", "val", "line")
    def __init__(self, kind, val, line): self.kind, self.val, self.line = kind, val, line
    def __repr__(self): return "%s(%r)" % (self.kind, self.val)

def tokenize(src):
    # 行継続 " _" を畳む
    src = src.replace("\r\n", "\n").replace("\r", "\n")
    # 行継続は畳むが、行番号がずれないよう \x01 を残して数える
    src = re.sub(r"[ \t]_[ \t]*\n[ \t]*", " \x01", src)
    toks, pos, line = [], 0, 1
    while pos < len(src):
        m = TOKEN_RE.match(src, pos)
        if not m:
            raise SyntaxError("line %d: cannot tokenize %r" % (line, src[pos:pos+30]))
        pos = m.end()
        kind = m.lastgroup
        val = m.group()
        if kind in ("ws", "comment"):
            continue
        if kind == "cont":
            line += 1
            continue
        if kind == "nl":
            if toks and toks[-1].kind != "nl": toks.append(Tok("nl", "\n", line))
            line += 1
            continue
        if kind == "str":
            toks.append(Tok("str", val[1:-1].replace('""', '"'), line))
        elif kind == "hex":
            toks.append(Tok("num", float(int(val[2:], 16)), line))
        elif kind == "num":
            if val[-1] in "#!&%@": val = val[:-1]
            toks.append(Tok("num", float(val), line))
        elif kind == "id":
            low = val.lower()
            if low in KW_LOWER and not val.endswith("$"):
                toks.append(Tok("kw", KW_LOWER[low], line))
            else:
                toks.append(Tok("id", val, line))
        else:
            toks.append(Tok("op", val, line))
    toks.append(Tok("nl", "\n", line))
    toks.append(Tok("eof", None, line))
    return toks

# ---------------------------------------------------------------- AST

class Node:
    def __init__(self, kind, **kw):
        self.kind = kind
        self.__dict__.update(kw)
    def __repr__(self): return "<%s>" % self.kind

# ---------------------------------------------------------------- parser

class Parser:
    def __init__(self, toks, modname):
        self.t, self.i, self.mod = toks, 0, modname

    # -- helpers
    def peek(self, k=0): return self.t[self.i + k]
    def at_kw(self, *names):
        tk = self.peek()
        return tk.kind == "kw" and tk.val in names
    def at_op(self, *ops):
        tk = self.peek()
        return tk.kind == "op" and tk.val in ops
    def at_nl(self): return self.peek().kind == "nl"
    def next(self):
        tk = self.t[self.i]; self.i += 1; return tk
    def expect_kw(self, name):
        tk = self.next()
        if tk.kind != "kw" or tk.val != name:
            raise SyntaxError("line %d: expected %s, got %r" % (tk.line, name, tk.val))
        return tk
    def expect_op(self, op):
        tk = self.next()
        if tk.kind != "op" or tk.val != op:
            raise SyntaxError("line %d: expected %r, got %r" % (tk.line, op, tk.val))
        return tk
    def expect_id(self):
        tk = self.next()
        if tk.kind not in ("id", "kw"):
            raise SyntaxError("line %d: expected identifier, got %r" % (tk.line, tk.val))
        return tk.val
    def skip_nl(self):
        while self.at_nl(): self.next()
    inline = 0

    def end_stmt(self):
        if self.inline:
            if self.at_op(":"): self.next()
            return
        if self.at_op(":"): self.next(); return
        if self.at_nl(): self.next(); return
        if self.peek().kind == "eof": return
        tk = self.peek()
        raise SyntaxError("line %d: unexpected %r at end of statement" % (tk.line, tk.val))

    # -- module
    def parse_module(self):
        mod = Node("module", name=self.mod, consts=[], types=[], vars=[], procs=[])
        self.skip_nl()
        while self.peek().kind != "eof":
            if self.at_kw("Attribute"):
                while not self.at_nl(): self.next()
                self.skip_nl(); continue
            if self.at_kw("Option"):
                while not self.at_nl(): self.next()
                self.skip_nl(); continue
            vis = "Private"
            if self.at_kw("Public", "Private"):
                vis = self.next().val
            if self.at_kw("Const"):
                self.next()
                for c in self.parse_const_items():
                    c.vis = vis; mod.consts.append(c)
                self.skip_nl(); continue
            if self.at_kw("Type"):
                self.next(); mod.types.append(self.parse_type(vis)); self.skip_nl(); continue
            if self.at_kw("Sub", "Function"):
                mod.procs.append(self.parse_proc(vis)); self.skip_nl(); continue
            if self.at_kw("Dim", "Static"):
                self.next()
                for d in self.parse_dim_items(): mod.vars.append(d)
                self.skip_nl(); continue
            # 修飾子だけ付いた変数宣言 (Public x As Long)
            if self.peek().kind == "id":
                for d in self.parse_dim_items(): mod.vars.append(d)
                self.skip_nl(); continue
            tk = self.peek()
            raise SyntaxError("line %d: unexpected %r at module level" % (tk.line, tk.val))
        return mod

    def parse_const_items(self):
        out = []
        while True:
            name = self.expect_id()
            typ = None
            if self.at_kw("As"): self.next(); typ = self.parse_typename()
            self.expect_op("=")
            out.append(Node("const", name=name, type=typ, expr=self.parse_expr()))
            if self.at_op(","): self.next(); continue
            break
        return out

    def parse_typename(self):
        if self.at_kw("New"): self.next()
        name = self.expect_id()
        while self.at_op("."):
            self.next(); name += "." + self.expect_id()
        return name

    def parse_type(self, vis):
        name = self.expect_id()
        self.skip_nl()
        fields = []
        while not (self.at_kw("End") and self.peek(1).kind == "kw" and self.peek(1).val == "Type"):
            fname = self.expect_id()
            dims = None
            if self.at_op("("):
                dims = self.parse_dim_bounds()
            self.expect_kw("As")
            ftype = self.parse_typename()
            fields.append(Node("field", name=fname, type=ftype, dims=dims))
            self.skip_nl()
        self.next(); self.expect_kw("Type")
        return Node("typedef", name=name, fields=fields, vis=vis)

    def parse_dim_bounds(self):
        self.expect_op("(")
        if self.at_op(")"):
            self.next(); return []
        bounds = []
        while True:
            e1 = self.parse_expr()
            if self.at_kw("To"):
                self.next(); bounds.append((e1, self.parse_expr()))
            else:
                bounds.append((None, e1))
            if self.at_op(","): self.next(); continue
            break
        self.expect_op(")")
        return bounds

    def parse_dim_items(self):
        out = []
        while True:
            name = self.expect_id()
            dims = None
            if self.at_op("("): dims = self.parse_dim_bounds()
            typ = None
            if self.at_kw("As"): self.next(); typ = self.parse_typename()
            out.append(Node("dim", name=name, type=typ, dims=dims))
            if self.at_op(","): self.next(); continue
            break
        return out

    def parse_proc(self, vis):
        pkind = self.next().val           # Sub | Function
        name = self.expect_id()
        params = []
        if self.at_op("("):
            self.next()
            if not self.at_op(")"):
                while True:
                    optional = False
                    byval = False
                    if self.at_kw("Optional"): self.next(); optional = True
                    if self.at_kw("ByVal"): self.next(); byval = True
                    elif self.at_kw("ByRef"): self.next()
                    pname = self.expect_id()
                    pdims = None
                    if self.at_op("("): pdims = self.parse_dim_bounds()
                    ptype = None
                    if self.at_kw("As"): self.next(); ptype = self.parse_typename()
                    pdef = None
                    if self.at_op("="): self.next(); pdef = self.parse_expr()
                    params.append(Node("param", name=pname, type=ptype, byval=byval,
                                       optional=optional, default=pdef, dims=pdims))
                    if self.at_op(","): self.next(); continue
                    break
            self.expect_op(")")
        rtype = None
        if self.at_kw("As"):
            self.next(); rtype = self.parse_typename()
            if self.at_op("("):
                self.next(); self.expect_op(")"); rtype = rtype + "()"
        body = self.parse_block(("End",))
        self.expect_kw("End")
        self.next()                        # Sub | Function
        return Node("proc", ptype=pkind, name=name, params=params, rtype=rtype,
                    body=body, vis=vis, module=self.mod)

    TERMINATORS = {
        "End": None, "Else": None, "ElseIf": None, "Next": None,
        "Loop": None, "Case": None, "Wend": None,
    }

    def parse_block(self, stops):
        stmts = []
        self.skip_nl()
        while True:
            tk = self.peek()
            if tk.kind == "eof": break
            if tk.kind == "kw" and tk.val in self.TERMINATORS: break
            stmts.append(self.parse_stmt())
            self.skip_nl()
        return stmts

    def parse_stmt(self):
        tk = self.peek()
        line = tk.line

        # label
        if tk.kind == "id" and self.peek(1).kind == "op" and self.peek(1).val == ":" \
           and self.peek(2).kind == "nl":
            name = self.next().val; self.next(); self.next()
            return Node("label", name=name, line=line)

        if tk.kind == "kw":
            v = tk.val
            if v in ("Dim", "Static"):
                self.next()
                items = self.parse_dim_items(); self.end_stmt()
                return Node("dim_stmt", items=items, line=line)
            if v == "Const":
                self.next(); items = self.parse_const_items(); self.end_stmt()
                return Node("const_stmt", items=items, line=line)
            if v == "ReDim":
                self.next()
                preserve = False
                if self.at_kw("Preserve"): self.next(); preserve = True
                target = self.parse_atom()
                while self.at_op("."):
                    self.next()
                    target = Node("member", obj=target, name=self.expect_id())
                bounds = self.parse_dim_bounds()
                self.end_stmt()
                return Node("redim", target=target, bounds=bounds, preserve=preserve, line=line)
            if v == "Set":
                self.next()
                lhs = self.parse_postfix(self.parse_atom())
                self.expect_op("=")
                rhs = self.parse_expr(); self.end_stmt()
                return Node("set", target=lhs, expr=rhs, line=line)
            if v == "If": return self.parse_if()
            if v == "For": return self.parse_for()
            if v == "Do": return self.parse_do()
            if v == "Select": return self.parse_select()
            if v == "Exit":
                self.next(); what = self.next().val; self.end_stmt()
                return Node("exit", what=what, line=line)
            if v == "On": return self.parse_on_error()
            if v == "GoTo":
                self.next(); name = self.expect_id(); self.end_stmt()
                return Node("goto", name=name, line=line)
            if v == "Call":
                self.next()
                e = self.parse_expr(); self.end_stmt()
                return Node("callstmt", expr=e, line=line)
            if v == "Open": return self.parse_open()
            if v == "Close":
                self.next(); nums = []
                while not self.at_nl() and self.peek().kind != "eof":
                    if self.at_op("#"): self.next()
                    nums.append(self.parse_expr())
                    if self.at_op(","): self.next(); continue
                    break
                self.end_stmt()
                return Node("close", nums=nums, line=line)
            if v == "Print":
                self.next(); self.expect_op("#")
                num = self.parse_expr()
                args = []
                if self.at_op(","):
                    self.next()
                    args.append(self.parse_expr())
                self.end_stmt()
                return Node("printf", num=num, args=args, line=line)
            if v in ("Get", "Put"):
                self.next(); self.expect_op("#")
                num = self.parse_expr(); self.expect_op(",")
                pos = None if self.at_op(",") else self.parse_expr()
                self.expect_op(",")
                var = self.parse_expr(); self.end_stmt()
                return Node("fileio", op=v, num=num, pos=pos, var=var, line=line)
            if v == "Kill":
                self.next(); e = self.parse_expr(); self.end_stmt()
                return Node("kill", expr=e, line=line)
            if v == "Erase":
                self.next(); e = self.parse_expr(); self.end_stmt()
                return Node("erase", expr=e, line=line)
            if v == "Rem":
                while not self.at_nl(): self.next()
                self.end_stmt(); return Node("nop", line=line)

        # 代入 または 手続き呼び出し
        return self.parse_assign_or_call()

    def parse_assign_or_call(self):
        line = self.peek().line
        start = self.i
        lhs = self.parse_postfix(self.parse_atom())
        if self.at_op("="):
            self.next()
            rhs = self.parse_expr(); self.end_stmt()
            return Node("assign", target=lhs, expr=rhs, line=line)
        # 引数を括弧なしで並べる呼び出し
        args = []
        if not (self.at_nl() or self.at_op(":") or self.at_kw("Else") or self.peek().kind == "eof"):
            while True:
                args.append(self.parse_arg())
                if self.at_op(","): self.next(); continue
                break
        self.end_stmt()
        return Node("callstmt", expr=lhs, extra_args=args, line=line)

    def parse_arg(self):
        if self.peek().kind == "id" and self.peek(1).kind == "op" and self.peek(1).val == ":=":
            name = self.next().val; self.next()
            return Node("named", name=name, expr=self.parse_expr())
        if self.at_op(","):
            return Node("omitted")
        return self.parse_expr()

    def parse_if(self):
        line = self.peek().line
        self.expect_kw("If")
        cond = self.parse_expr()
        self.expect_kw("Then")
        if not self.at_nl():
            # 単一行 If
            then_body = [self.parse_single_line_stmt()]
            else_body = []
            if self.at_kw("Else"):
                self.next()
                else_body = [self.parse_single_line_stmt()]
            if self.at_nl(): self.next()
            return Node("if", branches=[(cond, then_body)], orelse=else_body, line=line)
        branches = []
        body = self.parse_block(("End", "Else", "ElseIf"))
        branches.append((cond, body))
        orelse = []
        while self.at_kw("ElseIf"):
            self.next()
            c2 = self.parse_expr(); self.expect_kw("Then")
            branches.append((c2, self.parse_block(("End", "Else", "ElseIf"))))
        if self.at_kw("Else"):
            self.next()
            orelse = self.parse_block(("End",))
        self.expect_kw("End"); self.expect_kw("If")
        return Node("if", branches=branches, orelse=orelse, line=line)

    def parse_single_line_stmt(self):
        self.inline += 1
        try:
            return self.parse_stmt()
        finally:
            self.inline -= 1

    def parse_for(self):
        line = self.peek().line
        self.expect_kw("For")
        var = self.parse_postfix(self.parse_atom())
        self.expect_op("=")
        start = self.parse_expr()
        self.expect_kw("To")
        stop = self.parse_expr()
        step = None
        if self.at_kw("Step"): self.next(); step = self.parse_expr()
        body = self.parse_block(("Next",))
        self.expect_kw("Next")
        if not self.at_nl() and not self.at_op(":"):
            self.parse_postfix(self.parse_atom())
        return Node("for", var=var, start=start, stop=stop, step=step, body=body, line=line)

    def parse_do(self):
        line = self.peek().line
        self.expect_kw("Do")
        pre = None; until = False
        if self.at_kw("While"): self.next(); pre = self.parse_expr()
        elif self.at_kw("Until"): self.next(); pre = self.parse_expr(); until = True
        body = self.parse_block(("Loop",))
        self.expect_kw("Loop")
        post = None; post_until = False
        if self.at_kw("While"): self.next(); post = self.parse_expr()
        elif self.at_kw("Until"): self.next(); post = self.parse_expr(); post_until = True
        return Node("do", pre=pre, until=until, post=post, post_until=post_until,
                    body=body, line=line)

    def parse_select(self):
        line = self.peek().line
        self.expect_kw("Select"); self.expect_kw("Case")
        subject = self.parse_expr()
        self.skip_nl()
        cases = []; default = []
        while self.at_kw("Case"):
            self.next()
            if self.at_kw("Else"):
                self.next()
                if self.at_op(":"): self.next()
                default = self.parse_block(("End", "Case"))
                continue
            vals = []
            while True:
                vals.append(self.parse_expr())
                if self.at_op(","): self.next(); continue
                break
            if self.at_op(":"): self.next()
            cases.append((vals, self.parse_block(("End", "Case"))))
        self.expect_kw("End"); self.expect_kw("Select")
        return Node("select", subject=subject, cases=cases, default=default, line=line)

    def parse_on_error(self):
        line = self.peek().line
        self.expect_kw("On"); self.expect_kw("Error")
        if self.at_kw("Resume"):
            self.next(); self.expect_kw("Next"); self.end_stmt()
            return Node("onerror", mode="resume", label=None, line=line)
        self.expect_kw("GoTo")
        tk = self.next()
        label = "0" if tk.kind == "num" else tk.val
        self.end_stmt()
        return Node("onerror", mode=("off" if label == "0" else "goto"), label=label, line=line)

    def parse_open(self):
        line = self.peek().line
        self.expect_kw("Open")
        path = self.parse_expr()
        self.expect_kw("For")
        mode = self.next().val
        access = None
        if self.at_kw("Access"):
            self.next(); access = self.next().val
        if self.at_kw("Lock", "Shared"):
            self.next()
            if self.at_kw("Read", "Write"): self.next()
        self.expect_kw("As")
        if self.at_op("#"): self.next()
        num = self.parse_expr()
        if self.at_kw("Len"):
            self.next(); self.expect_op("="); self.parse_expr()
        self.end_stmt()
        return Node("open", path=path, mode=mode, access=access, num=num, line=line)

    # -- expressions (VBA の優先順位)
    def parse_expr(self): return self.parse_or()

    def parse_or(self):
        left = self.parse_and()
        while self.at_kw("Or", "Xor"):
            op = self.next().val
            left = Node("binop", op=op, left=left, right=self.parse_and())
        return left

    def parse_and(self):
        left = self.parse_not()
        while self.at_kw("And"):
            self.next()
            left = Node("binop", op="And", left=left, right=self.parse_not())
        return left

    def parse_not(self):
        if self.at_kw("Not"):
            self.next()
            return Node("unop", op="Not", operand=self.parse_not())
        return self.parse_cmp()

    def parse_cmp(self):
        left = self.parse_concat()
        while self.at_op("=", "<>", "<", ">", "<=", ">=") or self.at_kw("Is", "Like"):
            tk = self.next()
            left = Node("binop", op=tk.val, left=left, right=self.parse_concat())
        return left

    def parse_concat(self):
        left = self.parse_add()
        while self.at_op("&"):
            self.next()
            left = Node("binop", op="&", left=left, right=self.parse_add())
        return left

    def parse_add(self):
        left = self.parse_mod()
        while self.at_op("+", "-"):
            op = self.next().val
            left = Node("binop", op=op, left=left, right=self.parse_mod())
        return left

    def parse_mod(self):
        left = self.parse_idiv()
        while self.at_kw("Mod"):
            self.next()
            left = Node("binop", op="Mod", left=left, right=self.parse_idiv())
        return left

    def parse_idiv(self):
        left = self.parse_mul()
        while self.at_op("\\"):
            self.next()
            left = Node("binop", op="\\", left=left, right=self.parse_mul())
        return left

    def parse_mul(self):
        left = self.parse_unary()
        while self.at_op("*", "/"):
            op = self.next().val
            left = Node("binop", op=op, left=left, right=self.parse_unary())
        return left

    def parse_unary(self):
        if self.at_op("-"):
            self.next()
            return Node("unop", op="-", operand=self.parse_unary())
        if self.at_op("+"):
            self.next()
            return self.parse_unary()
        return self.parse_pow()

    def parse_pow(self):
        base = self.parse_postfix(self.parse_atom())
        if self.at_op("^"):
            self.next()
            return Node("binop", op="^", left=base, right=self.parse_unary())
        return base

    def parse_atom(self):
        tk = self.next()
        if tk.kind == "num": return Node("num", value=tk.val)
        if tk.kind == "str": return Node("str", value=tk.val)
        if tk.kind == "id": return Node("name", name=tk.val)
        if tk.kind == "kw":
            if tk.val == "True": return Node("bool", value=True)
            if tk.val == "False": return Node("bool", value=False)
            if tk.val == "Nothing": return Node("nothing")
            if tk.val == "Empty": return Node("empty")
            if tk.val == "Null": return Node("empty")
            if tk.val == "New": return self.parse_atom()
            if tk.val in ("Len", "Error", "Input", "Write", "Read", "Access", "Get", "Put",
                          "Close", "Open", "Print", "Type", "Property", "Let", "Each", "In"):
                return Node("name", name=tk.val)
        if tk.kind == "op":
            if tk.val == "(":
                e = self.parse_expr(); self.expect_op(")")
                return Node("paren", expr=e)
            if tk.val == "#":
                return Node("filenum", expr=self.parse_atom())
        raise SyntaxError("line %d: unexpected %r in expression" % (tk.line, tk.val))

    def parse_postfix(self, node):
        while True:
            if self.at_op("."):
                self.next()
                node = Node("member", obj=node, name=self.expect_id())
            elif self.at_op("("):
                self.next()
                args = []
                if not self.at_op(")"):
                    while True:
                        if self.at_op(","):
                            args.append(Node("omitted"))
                        else:
                            args.append(self.parse_arg())
                        if self.at_op(","): self.next(); continue
                        break
                self.expect_op(")")
                node = Node("call", func=node, args=args)
            else:
                break
        return node

# ---------------------------------------------------------------- refs

class Box:
    __slots__ = ("value", "vtype")
    def __init__(self, value, vtype=None):
        self.value, self.vtype = value, vtype

class Ref:
    def get(self): raise NotImplementedError
    def set(self, v): raise NotImplementedError

class BoxRef(Ref):
    __slots__ = ("box",)
    def __init__(self, box): self.box = box
    def get(self): return self.box.value
    def set(self, v): self.box.value = coerce_assign(v, self.box.vtype)

class ArrRef(Ref):
    __slots__ = ("arr", "idx")
    def __init__(self, arr, idx): self.arr, self.idx = arr, idx
    def get(self): return self.arr.get(self.idx)
    def set(self, v): self.arr.set(self.idx, coerce_assign(v, self.arr.etype))

class FieldRef(Ref):
    __slots__ = ("st", "name", "ftype")
    def __init__(self, st, name, ftype): self.st, self.name, self.ftype = st, name, ftype
    def get(self): return self.st.fields[self.name]
    def set(self, v): self.st.fields[self.name] = coerce_assign(v, self.ftype)

class PropRef(Ref):
    __slots__ = ("obj", "name", "args")
    def __init__(self, obj, name, args=()): self.obj, self.name, self.args = obj, name, args
    def get(self): return self.obj.vba_get(self.name, list(self.args))
    def set(self, v): self.obj.vba_set(self.name, list(self.args), v)

def coerce_assign(v, t):
    if isinstance(v, (VStruct, VArray)): return v.copy()
    return coerce(v, t)

# ---------------------------------------------------------------- signals

class ExitFor(Exception): pass
class ExitDo(Exception): pass
class ExitProc(Exception): pass
class GotoSignal(Exception):
    def __init__(self, label): self.label = label

# ---------------------------------------------------------------- errors

class ErrObject:
    type_name = "ErrObject"
    def __init__(self): self.number, self.description = 0, ""
    def vba_get(self, name, args=(), kwargs=None):
        n = name.lower()
        if n == "number": return self.number
        if n == "description": return self.description
        if n == "clear":
            self.number, self.description = 0, ""
            return EMPTY
        if n == "raise":
            raise VBAError(int(num(args[0])), vba_str(args[2]) if len(args) > 2 else "")
        raise VBAError(438, "Err." + name)
    def vba_set(self, name, args, v):
        n = name.lower()
        if n == "number": self.number = int(num(v))
        elif n == "description": self.description = vba_str(v)
        else: raise VBAError(438, "Err." + name)

# ---------------------------------------------------------------- env

class Env:
    __slots__ = ("vars", "interp", "module", "proc", "_errmode", "_errlabel")
    def __init__(self, interp, module, proc):
        self.vars, self.interp, self.module, self.proc = {}, interp, module, proc
        self._errmode, self._errlabel = "none", None
    def declare(self, name, value, vtype=None):
        self.vars[name.lower()] = Box(value, vtype)
    def bind(self, name, box):
        self.vars[name.lower()] = box
    def lookup(self, name):
        return self.vars.get(name.lower())

# ---------------------------------------------------------------- interpreter

class Module:
    def __init__(self, name):
        self.name = name
        self.consts, self.vars, self.procs, self.types = {}, {}, {}, {}

class InterpBase:
    def __init__(self):
        self.modules = {}
        self.types = {}
        self.err = ErrObject()
        self.files = {}
        self.globals = {}
        self.max_steps = 200000000
        self.steps = 0

    # -- loading -------------------------------------------------------
    def load(self, path, name=None):
        src = open(path, encoding="utf-8").read()
        name = name or path.split("/")[-1].rsplit(".", 1)[0]
        ast = Parser(tokenize(src), name).parse_module()
        mod = Module(name)
        self.modules[name.lower()] = mod
        for t in ast.types:
            self.types[t.name.lower()] = t
        for p in ast.procs:
            mod.procs[p.name.lower()] = p
        mod._pending_consts = ast.consts
        mod._pending_vars = ast.vars
        return mod

    def finish_load(self):
        for mod in self.modules.values():
            env = Env(self, mod, None)
            for c in getattr(mod, "_pending_consts", []):
                mod.consts[c.name.lower()] = (c.name, coerce(self.eval(c.expr, env), c.type), c.vis)
            for d in getattr(mod, "_pending_vars", []):
                mod.vars[d.name.lower()] = Box(self.make_default(d, env), d.type)

    def make_default(self, d, env):
        if d.dims is not None:
            return self.make_array(d, env)
        return self.default_for_type(d.type)

    def make_array(self, d, env):
        if not d.dims:
            return VArray(0, -1, self.elem_type(d.type), allocated=False)
        lo, hi = d.dims[0]
        lov = 0 if lo is None else int(self.eval(lo, env))
        hiv = int(self.eval(hi, env))
        if lo is None: lov, hiv = 0, hiv
        return VArray(lov, hiv, self.elem_type(d.type), allocated=True)

    def elem_type(self, t):
        t = t or "Variant"
        return t[:-2] if t.endswith("()") else t

    def default_for_type(self, t):
        if t and t.lower() in self.types:
            return self.new_struct(t)
        return default_of(t)

    def new_struct(self, tname):
        td = self.types[tname.lower()]
        fields = {}
        env = Env(self, None, None)
        for f in td.fields:
            if f.dims is not None:
                fields[f.name] = self.make_array(f, env)
            else:
                fields[f.name] = self.default_for_type(f.type)
        return VStruct(td.name, fields)

    def field_type(self, st, fname):
        td = self.types.get(st.tname.lower())
        if td:
            for f in td.fields:
                if f.name.lower() == fname.lower(): return f.type
        return None

    # -- procedure calls ----------------------------------------------
    def find_proc(self, name, from_module=None):
        low = name.lower()
        if from_module and low in from_module.procs:
            return from_module, from_module.procs[low]
        for mod in self.modules.values():
            p = mod.procs.get(low)
            if p is not None and p.vis != "Private":
                return mod, p
        return None, None

    def call_proc(self, mod, proc, argrefs):
        env = Env(self, mod, proc)
        params = proc.params
        for i, prm in enumerate(params):
            if i < len(argrefs) and argrefs[i] is not None:
                a = argrefs[i]
                if prm.byval:
                    v = a.get() if isinstance(a, Ref) else a
                    env.declare(prm.name, coerce_assign(v, prm.type), prm.type)
                else:
                    if isinstance(a, Ref) and isinstance(a, BoxRef):
                        env.bind(prm.name, a.box)
                    elif isinstance(a, Ref):
                        env.declare(prm.name, a.get(), prm.type)
                    else:
                        env.declare(prm.name, a, prm.type)
            else:
                if prm.default is not None:
                    env.declare(prm.name, self.eval(prm.default, env), prm.type)
                else:
                    env.declare(prm.name, MISSING if prm.optional else
                                (self.make_array(prm, env) if prm.dims is not None
                                 else self.default_for_type(prm.type)), prm.type)
        if proc.ptype == "Function":
            env.declare(proc.name, self.default_for_type(proc.rtype), proc.rtype)

        try:
            self.exec_block(proc.body, env)
        except ExitProc:
            pass

        # ByRef で受けた非 Box 参照を書き戻す
        for i, prm in enumerate(params):
            if i < len(argrefs) and not prm.byval and isinstance(argrefs[i], Ref) \
               and not isinstance(argrefs[i], BoxRef):
                box = env.lookup(prm.name)
                if box is not None:
                    argrefs[i].set(box.value)

        if proc.ptype == "Function":
            return env.lookup(proc.name).value
        return EMPTY

    # -- statements ----------------------------------------------------
    def exec_block(self, stmts, env):
        i = 0
        while i < len(stmts):
            st = stmts[i]
            try:
                self.exec_stmt(st, env)
            except GotoSignal as g:
                tgt = None
                for j, s2 in enumerate(stmts):
                    if s2.kind == "label" and s2.name.lower() == g.label.lower():
                        tgt = j; break
                if tgt is None:
                    raise
                i = tgt + 1
                continue
            i += 1

    def run_protected(self, fn, env):
        """On Error の面倒を見ながら 1 文を実行する。"""
        try:
            fn()
        except VBAError as e:
            mode = env._errmode
            self.err.number, self.err.description = e.number, e.description
            if mode == "resume":
                return
            if mode == "goto":
                raise GotoSignal(env._errlabel)
            raise

    def exec_stmt(self, st, env):
        k = st.kind
        if k == "nop" or k == "label":
            return
        if k == "onerror":
            if st.mode == "resume":
                env._errmode = "resume"
            elif st.mode == "off":
                env._errmode = "none"
            else:
                env._errmode = "goto"; env._errlabel = st.label
            return
        if k == "goto":
            raise GotoSignal(st.name)

        self.run_protected(lambda: self._exec(st, env), env)

    def _exec(self, st, env):
        k = st.kind
        if k == "dim_stmt":
            for d in st.items:
                if d.dims is not None:
                    env.declare(d.name, self.make_array(d, env), d.type)
                else:
                    env.declare(d.name, self.default_for_type(d.type), d.type)
            return
        if k == "const_stmt":
            for c in st.items:
                env.declare(c.name, coerce(self.eval(c.expr, env), c.type), c.type)
            return
        if k == "redim":
            self.do_redim(st, env); return
        if k == "assign":
            if st.target.kind == "call" and st.target.func.kind == "name" \
               and st.target.func.name.lower() in ("mid", "mid$"):
                self.do_mid_assign(st, env); return
            ref = self.resolve_ref(st.target, env)
            ref.set(self.eval(st.expr, env)); return
        if k == "set":
            ref = self.resolve_ref(st.target, env)
            v = self.eval(st.expr, env)
            if isinstance(ref, BoxRef): ref.box.value = v
            else: ref.set(v)
            return
        if k == "callstmt":
            self.eval_call_stmt(st, env); return
        if k == "if":
            for cond, body in st.branches:
                if truthy(self.eval(cond, env)):
                    self.exec_block(body, env); return
            self.exec_block(st.orelse, env); return
        if k == "for":
            self.do_for(st, env); return
        if k == "do":
            self.do_loop(st, env); return
        if k == "select":
            self.do_select(st, env); return
        if k == "exit":
            w = st.what.lower()
            if w == "for": raise ExitFor()
            if w == "do": raise ExitDo()
            raise ExitProc()
        if k == "open":
            self.do_open(st, env); return
        if k == "close":
            for n in st.nums:
                num = int(self.eval(n, env))
                f = self.files.pop(num, None)
                if f: f.close()
            return
        if k == "printf":
            num = int(self.eval(st.num, env))
            data = "".join(vba_str(self.eval(a, env)) for a in st.args) + "\r\n"
            self.files[num].write(data.encode("utf-8"))
            return
        if k == "fileio":
            self.do_fileio(st, env); return
        if k == "kill":
            import os
            p = vba_str(self.eval(st.expr, env))
            if os.path.exists(p): os.remove(p)
            return
        if k == "erase":
            ref = self.resolve_ref(st.expr, env)
            a = ref.get()
            if isinstance(a, VArray):
                a.allocated = False; a.data = []; a.lo, a.hi = 0, -1
            return
        raise SyntaxError("cannot execute %s" % k)

    def do_redim(self, st, env):
        ref = self.resolve_ref(st.target, env)
        old = ref.get()
        lo, hi = st.bounds[0]
        lov = 0 if lo is None else int(self.eval(lo, env))
        hiv = int(self.eval(hi, env))
        etype = old.etype if isinstance(old, VArray) else "Variant"
        if isinstance(ref, BoxRef) and ref.box.vtype:
            etype = self.elem_type(ref.box.vtype)
        new = VArray(lov, hiv, etype, allocated=True)
        if st.preserve and isinstance(old, VArray) and old.allocated:
            for i in range(max(lov, old.lo), min(hiv, old.hi) + 1):
                new.data[i - lov] = old.data[i - old.lo]
        ref.set(new) if not isinstance(ref, BoxRef) else setattr(ref.box, "value", new)

    def do_mid_assign(self, st, env):
        args = st.target.args
        ref = self.resolve_ref(args[0], env)
        s = vba_str(ref.get())
        start = int(self.eval(args[1], env))
        ln = int(self.eval(args[2], env)) if len(args) > 2 else None
        rep = vba_str(self.eval(st.expr, env))
        if ln is None: ln = len(rep)
        ln = min(ln, len(rep), len(s) - start + 1)
        ref.set(s[:start-1] + rep[:ln] + s[start-1+ln:])

    def do_for(self, st, env):
        ref = self.resolve_ref(st.var, env)
        start = self.eval(st.start, env)
        stop = self.eval(st.stop, env)
        step = self.eval(st.step, env) if st.step is not None else 1
        i = float(start); stopf = float(stop); stepf = float(step)
        try:
            while (stepf > 0 and i <= stopf) or (stepf < 0 and i >= stopf):
                ref.set(i)
                try:
                    self.exec_block(st.body, env)
                except ExitFor:
                    return
                i = float(ref.get()) + stepf
        finally:
            pass

    def do_loop(self, st, env):
        try:
            if st.post is not None:
                while True:
                    self.exec_block(st.body, env)
                    c = truthy(self.eval(st.post, env))
                    if st.post_until: c = not c
                    if not c: break
                return
            while True:
                if st.pre is not None:
                    c = truthy(self.eval(st.pre, env))
                    if st.until: c = not c
                    if not c: break
                self.exec_block(st.body, env)
        except ExitDo:
            return

    def do_select(self, st, env):
        subj = self.eval(st.subject, env)
        for vals, body in st.cases:
            for v in vals:
                if vba_eq(subj, self.eval(v, env)):
                    self.exec_block(body, env); return
        self.exec_block(st.default, env)

    def do_open(self, st, env):
        import os
        path = vba_str(self.eval(st.path, env))
        num = int(self.eval(st.num, env))
        mode = st.mode.lower()
        acc = (st.access or "").lower()
        if mode == "output":
            f = open(path, "wb")
        elif mode == "append":
            f = open(path, "ab")
        elif mode == "binary":
            if acc == "read":
                f = open(path, "rb")
            else:
                if not os.path.exists(path): open(path, "wb").close()
                f = open(path, "r+b")
        elif mode == "input":
            f = open(path, "rb")
        else:
            raise VBAError(53, "unsupported Open mode " + st.mode)
        self.files[num] = f

    def do_fileio(self, st, env):
        num = int(self.eval(st.num, env))
        f = self.files[num]
        pos = int(self.eval(st.pos, env)) if st.pos is not None else None
        ref = self.resolve_ref(st.var, env)
        if st.op == "Get":
            target = ref.get()
            if pos is not None: f.seek(pos - 1)
            if isinstance(target, VArray):
                n = target.hi - target.lo + 1
                data = f.read(n)
                for i, b in enumerate(data):
                    target.data[i] = b
            else:
                raise VBAError(13, "Get # supports Byte arrays only")
        else:
            if pos is not None: f.seek(pos - 1)
            v = ref.get()
            if isinstance(v, VArray):
                f.write(bytes(int(x) & 0xFF for x in v.data))
            else:
                f.write(vba_str(v).encode("utf-8"))

# ---------------------------------------------------------------- operators

def vba_eq(a, b):
    if isinstance(a, str) or isinstance(b, str):
        if isinstance(a, str) and isinstance(b, str): return a == b
        if a is EMPTY: return b == "" if isinstance(b, str) else False
        if b is EMPTY: return a == "" if isinstance(a, str) else False
        try: return float(a) == float(b)
        except Exception: return vba_str(a) == vba_str(b)
    if a is EMPTY: a = 0
    if b is EMPTY: b = 0
    if isinstance(a, _Singleton) or isinstance(b, _Singleton): return a is b
    return float(a) == float(b)

def num(v):
    if isinstance(v, bool): return -1 if v else 0
    if isinstance(v, (int, float)): return float(v)
    if isinstance(v, str): return parse_number(v)
    if v is EMPTY: return 0.0
    raise VBAError(13, "Type mismatch (numeric expected, got %r)" % (v,))

def trunc(x): return int(x) if x >= 0 else -int(-x)

def binop(op, a, b):
    if op == "&":
        return vba_str(a) + vba_str(b)
    if op in ("=", "<>", "<", ">", "<=", ">="):
        if isinstance(a, str) and isinstance(b, str):
            r = (a > b) - (a < b)
        else:
            if op == "=": return vba_eq(a, b)
            if op == "<>": return not vba_eq(a, b)
            x, y = num(a), num(b)
            r = (x > y) - (x < y)
        return {"=": r == 0, "<>": r != 0, "<": r < 0, ">": r > 0,
                "<=": r <= 0, ">=": r >= 0}[op]
    if op == "Is":
        return a is b
    if op in ("And", "Or", "Xor"):
        if isinstance(a, bool) and isinstance(b, bool):
            return {"And": a and b, "Or": a or b, "Xor": a != b}[op]
        x, y = int(num(a)), int(num(b))
        return {"And": x & y, "Or": x | y, "Xor": x ^ y}[op]
    if op == "+":
        if isinstance(a, str) and isinstance(b, str): return a + b
        r = num(a) + num(b)
        return VDate(r) if (isinstance(a, VDate) or isinstance(b, VDate)) else r
    if op == "-":
        r = num(a) - num(b)
        if isinstance(a, VDate) and isinstance(b, VDate): return r
        return VDate(r) if isinstance(a, VDate) else r
    if op == "*": return num(a) * num(b)
    if op == "/":
        d = num(b)
        if d == 0: raise VBAError(11, "Division by zero")
        return num(a) / d
    if op == "\\":
        d = bankers_round(num(b))
        if d == 0: raise VBAError(11, "Division by zero")
        return trunc(bankers_round(num(a)) / d)
    if op == "Mod":
        d = bankers_round(num(b))
        if d == 0: raise VBAError(11, "Division by zero")
        x = bankers_round(num(a))
        return x - trunc(x / d) * d
    if op == "^": return num(a) ** num(b)
    if op == "Like":
        import fnmatch
        return fnmatch.fnmatchcase(vba_str(a), vba_str(b).replace("#", "?"))
    raise SyntaxError("bad operator " + op)

# ---------------------------------------------------------------- constants

VB_CONSTS = {
    "vblf": "\n", "vbcr": "\r", "vbcrlf": "\r\n", "vbtab": "\t", "vbnullstring": "",
    "vbbinarycompare": 0, "vbtextcompare": 1,
    "vbsunday": 1, "vbmonday": 2, "vbtuesday": 3, "vbwednesday": 4,
    "vbthursday": 5, "vbfriday": 6, "vbsaturday": 7,
    "vbempty": 0, "vbnull": 1, "vbinteger": 2, "vblong": 3, "vbsingle": 4,
    "vbdouble": 5, "vbdate": 7, "vbstring": 8, "vbobject": 9, "vbboolean": 11,
    "vbvariant": 12, "vbbyte": 17,
    # Excel
    "xlexpression": 2, "xlcellvalue": 1,
    "xlcontinuous": 1, "xldash": -4115, "xldot": -4118, "xllinestylenone": -4142,
    "xlhairline": 1, "xlthin": 2, "xlmedium": -4138, "xlthick": 4,
    "xledgeleft": 7, "xledgetop": 8, "xledgebottom": 9, "xledgeright": 10,
    "xlleft": -4131, "xlright": -4152, "xltop": -4160, "xlbottom": -4107,
    "xlcenter": -4108, "xlgeneral": 1,
    "xlnone": -4142, "xlsolid": 1, "xlautomatic": -4105,
    "xlvalidatedate": 4, "xlvalidatewholenumber": 1, "xlvalidatecustom": 7,
    "xlvalidalertstop": 1, "xlbetween": 1,
    "xlsheetvisible": -1, "xlsheethidden": 0, "xlsheetveryhidden": 2,
    "xlcalculationmanual": -4135, "xlcalculationautomatic": -4105,
    "xlbuttoncontrol": 0, "xlopenxmlworkbook": 51,
}

# ---------------------------------------------------------------- builtins

def _fmt(value, fmt):
    if fmt == "":
        return vba_str(value)
    dt = serial_to_dt(float(num(value)))
    out = fmt
    reps = [("yyyy", "%04d" % dt.year), ("mm", "%02d" % dt.month), ("dd", "%02d" % dt.day),
            ("hh", "%02d" % dt.hour), ("nn", "%02d" % dt.minute), ("ss", "%02d" % dt.second)]
    for k, v in reps:
        out = out.replace(k, "\x00%s\x00" % v)
    return out.replace("\x00", "")

class Builtins:
    def __init__(self, interp): self.i = interp

    def call(self, name, args, kwargs, env):
        n = name.lower().rstrip("$")
        fn = getattr(self, "fn_" + n, None)
        if fn is None: return None, False
        return fn(args, env), True

    # strings
    def fn_len(self, a, e):
        v = a[0]
        if isinstance(v, VArray): raise VBAError(13, "Len on array")
        return len(vba_str(v))
    def fn_left(self, a, e): return vba_str(a[0])[:max(0, int(num(a[1])))]
    def fn_right(self, a, e):
        k = max(0, int(num(a[1]))); s = vba_str(a[0])
        return s[len(s)-k:] if k else ""
    def fn_mid(self, a, e):
        s = vba_str(a[0]); st = int(num(a[1]))
        if len(a) > 2 and a[2] is not MISSING:
            return s[st-1:st-1+max(0, int(num(a[2])))]
        return s[st-1:]
    def fn_trim(self, a, e): return vba_str(a[0]).strip(" \t")
    def fn_ltrim(self, a, e): return vba_str(a[0]).lstrip(" \t")
    def fn_rtrim(self, a, e): return vba_str(a[0]).rstrip(" \t")
    def fn_ucase(self, a, e): return vba_str(a[0]).upper()
    def fn_lcase(self, a, e): return vba_str(a[0]).lower()
    def fn_space(self, a, e): return " " * max(0, int(num(a[0])))
    def fn_string(self, a, e):
        c = a[1]
        return (chr(int(num(c))) if not isinstance(c, str) else c[0]) * int(num(a[0]))
    def fn_instr(self, a, e):
        if len(a) >= 3 and not isinstance(a[0], str):
            start, s, sub = int(num(a[0])), vba_str(a[1]), vba_str(a[2])
        else:
            start, s, sub = 1, vba_str(a[0]), vba_str(a[1])
        if sub == "": return start
        return s.find(sub, start - 1) + 1
    def fn_instrrev(self, a, e):
        s, sub = vba_str(a[0]), vba_str(a[1])
        return s.rfind(sub) + 1
    def fn_replace(self, a, e):
        return vba_str(a[0]).replace(vba_str(a[1]), vba_str(a[2]))
    def fn_split(self, a, e):
        sep = vba_str(a[1]) if len(a) > 1 else " "
        parts = vba_str(a[0]).split(sep)
        arr = VArray(0, len(parts) - 1, "String", allocated=True)
        arr.data = list(parts)
        return arr
    def fn_join(self, a, e):
        arr = a[0]; sep = vba_str(a[1]) if len(a) > 1 else " "
        return sep.join(vba_str(x) for x in arr.data)
    def fn_strreverse(self, a, e): return vba_str(a[0])[::-1]
    def fn_asc(self, a, e):
        s = vba_str(a[0])
        return ord(s[0]) if s else 0
    def fn_ascw(self, a, e):
        s = vba_str(a[0]); c = ord(s[0]) if s else 0
        return c - 65536 if c > 32767 else c
    def fn_chr(self, a, e): return chr(int(num(a[0])) & 0xFF)
    def fn_chrw(self, a, e):
        c = int(num(a[0]))
        return chr(c + 65536 if c < 0 else c)

    # conversion
    def fn_cstr(self, a, e): return vba_str(a[0])
    def fn_clng(self, a, e): return coerce(a[0], "Long")
    def fn_cint(self, a, e): return coerce(a[0], "Integer")
    def fn_cdbl(self, a, e): return coerce(a[0], "Double")
    def fn_cbool(self, a, e): return coerce(a[0], "Boolean")
    def fn_cdate(self, a, e): return to_date(a[0])
    def fn_val(self, a, e):
        m = re.match(r"\s*[-+]?(\d+\.?\d*|\.\d+)", vba_str(a[0]))
        return float(m.group()) if m else 0.0
    def fn_isdate(self, a, e):
        v = a[0]
        if isinstance(v, VDate): return True
        if isinstance(v, str):
            try: parse_date_string(v); return True
            except Exception: return False
        return False
    def fn_isnumeric(self, a, e):
        v = a[0]
        if isinstance(v, (int, float)) and not isinstance(v, bool): return True
        if isinstance(v, str):
            try: parse_number(v); return True
            except Exception: return False
        return False
    def fn_isempty(self, a, e): return a[0] is EMPTY
    def fn_isnull(self, a, e): return a[0] is EMPTY or a[0] is NOTHING
    def fn_isobject(self, a, e):
        return a[0] is NOTHING or hasattr(a[0], "vba_get")
    def fn_ismissing(self, a, e): return a[0] is MISSING
    def fn_vartype(self, a, e):
        v = a[0]
        if isinstance(v, bool): return 11
        if isinstance(v, VDate): return 7
        if isinstance(v, str): return 8
        if isinstance(v, int): return 3
        if isinstance(v, float): return 5
        if v is EMPTY: return 0
        return 9
    def fn_typename(self, a, e):
        v = a[0]
        if isinstance(v, bool): return "Boolean"
        if isinstance(v, VDate): return "Date"
        if isinstance(v, str): return "String"
        if isinstance(v, int): return "Long"
        if isinstance(v, float): return "Double"
        if v is EMPTY: return "Empty"
        if v is NOTHING: return "Nothing"
        if isinstance(v, VStruct): return v.tname
        return getattr(v, "type_name", "Object")

    # math
    def fn_abs(self, a, e): return abs(num(a[0]))
    def fn_int(self, a, e): return math.floor(num(a[0]))
    def fn_fix(self, a, e): return trunc(num(a[0]))
    def fn_round(self, a, e):
        d = int(num(a[1])) if len(a) > 1 else 0
        f = 10 ** d
        return bankers_round(num(a[0]) * f) / f
    def fn_sgn(self, a, e):
        x = num(a[0]); return (x > 0) - (x < 0)
    def fn_rgb(self, a, e):
        r, g, b = (int(num(x)) & 255 for x in a[:3])
        return r + g * 256 + b * 65536

    # dates
    def fn_dateserial(self, a, e):
        y, m, d = int(num(a[0])), int(num(a[1])), int(num(a[2]))
        base = datetime.date(y, 1, 1)
        base = base.replace(year=y + (m - 1) // 12, month=(m - 1) % 12 + 1)
        return VDate((base - EPOCH).days + (d - 1))
    def fn_datevalue(self, a, e): return to_date(a[0])
    def fn_year(self, a, e): return serial_to_dt(num(a[0])).year
    def fn_month(self, a, e): return serial_to_dt(num(a[0])).month
    def fn_day(self, a, e): return serial_to_dt(num(a[0])).day
    def fn_weekday(self, a, e):
        first = int(num(a[1])) if len(a) > 1 and a[1] is not MISSING else 1
        dow = (int(math.floor(num(a[0]))) + 6) % 7 + 1      # 1=Sunday
        return (dow - first) % 7 + 1
    def fn_now(self, a, e):
        n = datetime.datetime.now()
        return VDate((n.date() - EPOCH).days + (n.hour*3600+n.minute*60+n.second)/86400.0)
    def fn_date(self, a, e):
        return VDate((datetime.date.today() - EPOCH).days)
    def fn_format(self, a, e):
        return _fmt(a[0], vba_str(a[1]) if len(a) > 1 else "")

    # arrays
    def fn_ubound(self, a, e):
        arr = a[0]
        if not isinstance(arr, VArray) or not arr.allocated:
            raise VBAError(9, "Subscript out of range (UBound on unallocated array)")
        return arr.hi
    def fn_lbound(self, a, e):
        arr = a[0]
        if not isinstance(arr, VArray) or not arr.allocated:
            raise VBAError(9, "Subscript out of range (LBound on unallocated array)")
        return arr.lo
    def fn_array(self, a, e):
        arr = VArray(0, len(a) - 1, "Variant", allocated=True)
        arr.data = list(a)
        return arr

    # files
    def fn_freefile(self, a, e):
        n = 1
        while n in self.i.files: n += 1
        return n
    def fn_filelen(self, a, e):
        import os
        return os.path.getsize(vba_str(a[0]))
    def fn_dir(self, a, e):
        import os, glob as _g
        p = vba_str(a[0])
        if p == "": return ""
        hits = _g.glob(p)
        return os.path.basename(hits[0]) if hits else ""

# ---------------------------------------------------------------- evaluation

def _is_named(n): return isinstance(n, Node) and n.kind == "named"
def _is_omitted(n): return isinstance(n, Node) and n.kind == "omitted"

class _InterpEval:
    """Interp に混ぜ込む式評価。可読性のため別クラスにして継承で合成する。"""

    # -- module lookup helpers
    def module_named(self, name, env):
        if env is not None and env.lookup(name) is not None: return None
        return self.modules.get(name.lower())

    def module_member(self, mod, name):
        low = name.lower()
        if low in mod.consts: return ("const", mod.consts[low][1])
        if low in mod.vars: return ("var", mod.vars[low])
        if low in mod.procs: return ("proc", mod.procs[low])
        return (None, None)

    def lookup_name(self, name, env):
        """(kind, payload) を返す。kind は box / const / proc / builtinconst / global。"""
        low = name.lower()
        box = env.lookup(name) if env is not None else None
        if box is not None: return ("box", box)
        mod = env.module if env is not None else None
        if mod is not None:
            if low in mod.consts: return ("const", mod.consts[low][1])
            if low in mod.vars: return ("box", mod.vars[low])
            if low in mod.procs: return ("proc", (mod, mod.procs[low]))
        for m in self.modules.values():
            if low in m.consts and m.consts[low][2] != "Private":
                return ("const", m.consts[low][1])
        for m in self.modules.values():
            if low in m.vars: return ("box", m.vars[low])
        for m in self.modules.values():
            p = m.procs.get(low)
            if p is not None and p.vis != "Private": return ("proc", (m, p))
        if low in VB_CONSTS: return ("const", VB_CONSTS[low])
        if low.rstrip("$") in VB_CONSTS: return ("const", VB_CONSTS[low.rstrip("$")])
        if low in self.globals: return ("const", self.globals[low])
        if low == "err": return ("const", self.err)
        return (None, None)

    # -- lvalues
    def resolve_ref(self, node, env):
        k = node.kind
        if k == "paren":
            return self.resolve_ref(node.expr, env)
        if k == "name":
            kind, payload = self.lookup_name(node.name, env)
            if kind == "box": return BoxRef(payload)
            raise VBAError(2000, "cannot assign to %s" % node.name)
        if k == "member":
            if node.obj.kind == "name":
                mod = self.module_named(node.obj.name, env)
                if mod is not None:
                    mk, mp = self.module_member(mod, node.name)
                    if mk == "var": return BoxRef(mp)
                    raise VBAError(2000, "cannot assign to %s.%s" % (node.obj.name, node.name))
            base = self.eval(node.obj, env)
            if isinstance(base, VStruct):
                fname = self.real_field(base, node.name)
                return FieldRef(base, fname, self.field_type(base, fname))
            if hasattr(base, "vba_set"):
                return PropRef(base, node.name)
            raise VBAError(438, "cannot set member %s on %r" % (node.name, base))
        if k == "call":
            container = self.eval_container(node.func, env)
            args = [self.eval(a, env) for a in node.args if not _is_omitted(a)]
            if isinstance(container, VArray):
                return ArrRef(container, int(num(args[0])))
            if hasattr(container, "vba_set"):
                return PropRef(container, "Item", args)
            # obj.Prop(args) = v
            if node.func.kind == "member":
                base = self.eval(node.func.obj, env)
                if hasattr(base, "vba_set"):
                    return PropRef(base, node.func.name, args)
            raise VBAError(438, "cannot assign through call")
        raise VBAError(2000, "not an lvalue: %s" % k)

    def real_field(self, st, name):
        for k in st.fields:
            if k.lower() == name.lower(): return k
        raise VBAError(438, "%s has no field %s" % (st.tname, name))

    def eval_container(self, node, env):
        """配列 / オブジェクトを、呼び出さずに取り出す。"""
        if node.kind == "name":
            kind, payload = self.lookup_name(node.name, env)
            if kind == "box": return payload.value
            if kind == "const": return payload
            return None
        if node.kind == "member":
            if node.obj.kind == "name":
                mod = self.module_named(node.obj.name, env)
                if mod is not None:
                    mk, mp = self.module_member(mod, node.name)
                    if mk == "var": return mp.value
                    if mk == "const": return mp
                    return None
            base = self.eval(node.obj, env)
            if isinstance(base, VStruct):
                return base.fields[self.real_field(base, node.name)]
            return None
        return None

    # -- expressions
    def eval(self, node, env):
        k = node.kind
        if k == "num": return node.value
        if k == "str": return node.value
        if k == "bool": return node.value
        if k == "nothing": return NOTHING
        if k == "empty": return EMPTY
        if k == "paren": return self.eval(node.expr, env)
        if k == "filenum": return self.eval(node.expr, env)
        if k == "unop":
            v = self.eval(node.operand, env)
            if node.op == "-": return -num(v)
            if isinstance(v, bool): return not v
            return ~int(num(v))
        if k == "binop":
            if node.op == "And":
                a = self.eval(node.left, env)
                if isinstance(a, bool) and not a: return False
                return binop("And", a, self.eval(node.right, env))
            if node.op == "Or":
                a = self.eval(node.left, env)
                if isinstance(a, bool) and a: return True
                return binop("Or", a, self.eval(node.right, env))
            return binop(node.op, self.eval(node.left, env), self.eval(node.right, env))
        if k == "name":
            return self.eval_name(node, env)
        if k == "member":
            return self.eval_member(node, [], {}, env)
        if k == "call":
            return self.invoke(node.func, node.args, env)
        raise SyntaxError("cannot evaluate %s" % k)

    def eval_name(self, node, env):
        kind, payload = self.lookup_name(node.name, env)
        if kind == "box":
            v = payload.value
            if v is EMPTY and payload.vtype in (None, "Variant"): return EMPTY
            return v
        if kind == "const": return payload
        if kind == "proc":
            mod, proc = payload
            return self.call_proc(mod, proc, [])
        ok, val = self.try_builtin(node.name, [], {}, env)
        if ok: return val
        raise VBAError(2000, "undefined name: %s" % node.name)

    def try_builtin(self, name, args, kwargs, env):
        v, hit = self.builtins.call(name, args, kwargs, env)
        return (hit, v)

    def eval_member(self, node, args, kwargs, env):
        if node.obj.kind == "name":
            mod = self.module_named(node.obj.name, env)
            if mod is not None:
                mk, mp = self.module_member(mod, node.name)
                if mk == "const": return mp
                if mk == "var":
                    v = mp.value
                    if isinstance(v, VArray) and args: return v.get(int(num(args[0])))
                    return v
                if mk == "proc":
                    raise VBAError(2000, "proc reached via eval_member")
                raise VBAError(2000, "%s has no member %s" % (mod.name, node.name))
        base = self.eval(node.obj, env)
        if isinstance(base, VStruct):
            v = base.fields[self.real_field(base, node.name)]
            if isinstance(v, VArray) and args: return v.get(int(num(args[0])))
            return v
        if base is NOTHING:
            raise VBAError(91, "Object variable or With block variable not set")
        if hasattr(base, "vba_get"):
            return base.vba_get(node.name, args, kwargs)
        raise VBAError(438, "Object doesn't support this property or method: %s" % node.name)

    # -- invocation
    def invoke(self, funcnode, argnodes, env, extra=()):
        argnodes = list(argnodes) + list(extra)

        # VBA プロシージャ?
        target = None
        if funcnode.kind == "name":
            kind, payload = self.lookup_name(funcnode.name, env)
            if kind == "proc": target = payload
            elif kind == "box" and isinstance(payload.value, VArray):
                a = [self.eval(x, env) for x in argnodes]
                return payload.value.get(int(num(a[0])))
            elif kind in ("box", "const"):
                base = payload.value if kind == "box" else payload
                if hasattr(base, "vba_get"):
                    a, kw = self.eval_args(argnodes, env)
                    return base.vba_get("Item", a, kw)
        elif funcnode.kind == "member" and funcnode.obj.kind == "name":
            mod = self.module_named(funcnode.obj.name, env)
            if mod is not None:
                mk, mp = self.module_member(mod, funcnode.name)
                if mk == "proc": target = (mod, mp)
                elif mk == "var" and isinstance(mp.value, VArray):
                    a = [self.eval(x, env) for x in argnodes]
                    return mp.value.get(int(num(a[0])))
                elif mk in ("var", "const"):
                    return mp.value if mk == "var" else mp

        if target is not None:
            mod, proc = target
            refs = self.make_argrefs(argnodes, proc.params, env)
            return self.call_proc(mod, proc, refs)

        # 構造体フィールドの配列 / オブジェクトのメンバ
        if funcnode.kind == "member":
            a, kw = self.eval_args(argnodes, env)
            return self.eval_member(funcnode, a, kw, env)

        if funcnode.kind == "name":
            a, kw = self.eval_args(argnodes, env)
            hit, v = self.try_builtin(funcnode.name, a, kw, env)
            if hit: return v
            raise VBAError(2000, "undefined procedure: %s" % funcnode.name)

        base = self.eval(funcnode, env)
        a, kw = self.eval_args(argnodes, env)
        if hasattr(base, "vba_get"):
            return base.vba_get("Item", a, kw)
        raise VBAError(438, "not callable")

    def eval_args(self, argnodes, env):
        args, kwargs = [], {}
        for n in argnodes:
            if _is_named(n):
                kwargs[n.name] = self.eval(n.expr, env)
            elif _is_omitted(n):
                args.append(MISSING)
            else:
                args.append(self.eval(n, env))
        return args, kwargs

    def make_argrefs(self, argnodes, params, env):
        refs = []
        positional = [n for n in argnodes if not _is_named(n)]
        named = {n.name.lower(): n.expr for n in argnodes if _is_named(n)}
        for i, prm in enumerate(params):
            node = None
            if i < len(positional):
                node = positional[i]
            elif prm.name.lower() in named:
                node = named[prm.name.lower()]
            if node is None or _is_omitted(node):
                refs.append(None); continue
            if prm.byval:
                refs.append(self.eval(node, env))
            else:
                try:
                    refs.append(self.resolve_ref(node, env))
                except VBAError:
                    refs.append(self.eval(node, env))
        return refs

    def eval_call_stmt(self, st, env):
        expr = st.expr
        extra = getattr(st, "extra_args", []) or []
        if expr.kind == "call":
            self.invoke(expr.func, expr.args, env, extra)
        else:
            self.invoke(expr, [], env, extra)

class Interp(_InterpEval, InterpBase):
    def __init__(self):
        InterpBase.__init__(self)
        self.builtins = Builtins(self)
