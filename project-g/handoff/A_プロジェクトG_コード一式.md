# プロジェクトG 変換ツール ― コード一式

この 1 ファイルに、`プロジェクトG変換ツール.xlsm` を生成するのに必要なものが全部入っている。
手順は別紙 `B_プロジェクトG_実装手順.md` を見ること。

## 読む人（LLM）への指示

1. 下の各節を **1 文字も変えずに** 指定されたパスへ書き出す。
   整形・改行幅の調整・コメントの翻訳・「改善」は**一切しない**。
   バイト単位で一致していないと、後段のハッシュ照合と VBA の埋め込みが壊れる。
2. 書き出しは **UTF-8（BOM なし）・改行 LF** で固定。
   Windows で作業する場合もエディタの自動 CRLF 変換を切ること。
3. 書き出し後、必ず下の一覧の SHA-256 と突き合わせる。1 つでも違えば次に進まない。

```bash
# 照合コマンド（プロジェクトのルートで実行）
sha256sum src/*.bas build/*.py
```

## ファイル一覧

| # | パス | 行数 | SHA-256 | 役割 |
|---|---|---:|---|---|
| 1 | `src/Util.bas` | 492 | `6fa2e838d4999e5007794d215c5aacea0734b17792640776a597d8540183fa34` | 文字列 / UTF-8 / 見出し名マップ / JSON / 色 / ログ |
| 2 | `src/CsvReader.bas` | 254 | `74ed91bc1115ff13d05ced4e2871c175d18e257ad7d0cb00450bcc0d1226be9a` | RFC 4180 パーサ、メタ行の期間、ISO 日時の日付部 |
| 3 | `src/Model.bas` | 249 | `91d96f85c4b5e8d12462a6800bdea940ff7bc23282c73c638a3dec8eda591a5c` | 工程レコードの型と CSV からの正規化 |
| 4 | `src/Layout.bas` | 291 | `62b9cf7d4721a5362ee3e0820d25a8ab97f0558a194533c78f3f49b9e7bd167f` | 表示期間 → 日付列、行 → シート行、行見出し、行の割り当て |
| 5 | `src/Render.bas` | 314 | `ecf5a5c14272c16c9ae0392435df5c9aadf7a27e3bfc26a12fd7d522afd72658` | T10_Layout にセルだけで描く（Shape 不使用） |
| 6 | `src/Export.bas` | 182 | `7b91889ecb8b4abc5a11ccad23d33216cf2e1e8102aa01bdc839389f77fa4b0d` | 業者用 xlsx として別名保存、保護・入力規則・非表示シート |
| 7 | `src/Verify.bas` | 483 | `c7219a41e7208ac34bc5314d4ec21b6b4a90298fe5f4196f5b2fe3b38f1c9bfc` | 出力 xlsx を読み戻して機械検査 |
| 8 | `src/Main.bas` | 262 | `5c8f83526e3048525e16c3c9d39dc32fa67866f99d2a680093a3b19ba3060610` | 00_Control の操作と変換の全体進行 |
| 9 | `build/msovba.py` | 309 | `07f8c2f3812f34c02a39658fd58e8dc1d96ac9a09471fe0d1b6c940fa7e981c8` | MS-OVBA の圧縮・データ暗号化・CFB の書き出し |
| 10 | `build/build_vba.py` | 153 | `195813238768a7b86dc48176b6ba217c04f85ae70c3f6b2d180d78946efab14d` | dir / PROJECT / PROJECTwm を組んで vbaProject.bin を作る |
| 11 | `build/build_xlsm.py` | 149 | `68469bc9534397d7e8447f5ea0a70ff6a1fcf541351c142755fe440dd25464c0` | openpyxl でブックを作り zip に vbaProject.bin を注入 |
| 12 | `build/verify_xlsm.py` | 194 | `01f8fbf3d54192ac2b930b25fd0388cadab091cd4d833f6b12775b5d393f718a` | 生成物の構造検査（Excel 無しで回せる範囲） |

合計 12 ファイル / 3332 行。

このほかに、変換の入力となる CSV（工程表 CSV（プロジェクトG が出力するもの））が要る。
サンプルは別途受け取ること。CSV が無くても xlsm のビルド自体はできる。

---

## 1. `src/Util.bas`

文字列 / UTF-8 / 見出し名マップ / JSON / 色 / ログ

SHA-256: `6fa2e838d4999e5007794d215c5aacea0734b17792640776a597d8540183fa34`

```vb
Attribute VB_Name = "Util"
Option Explicit
'==============================================================================
' Util - 文字列 / UTF-8 / 見出し名マップ / JSON / 色 の共通処理
'
' 外部参照 (Scripting.Dictionary, ADODB.Stream, FileSystemObject) は
' 一切使わない。参照設定の無い素の Excel で動かすため。
'==============================================================================

' 見出し名 -> 列番号 の対応表。列番号決め打ちを禁止しているため
' (共通仕様 8章-5) 全ての列アクセスはこの表を経由する。
Public Type StrMap
    Keys() As String
    Vals() As Long
    Count As Long
End Type

Public Const LOG_SEP As String = "------------------------------------------------------------"

'--- 見出し名マップ -----------------------------------------------------------

Public Sub MapInit(ByRef m As StrMap)
    m.Count = 0
    ReDim m.Keys(0 To 15)
    ReDim m.Vals(0 To 15)
End Sub

Public Sub MapAdd(ByRef m As StrMap, ByVal k As String, ByVal v As Long)
    If m.Count > UBound(m.Keys) Then
        ReDim Preserve m.Keys(0 To m.Count * 2)
        ReDim Preserve m.Vals(0 To m.Count * 2)
    End If
    m.Keys(m.Count) = k
    m.Vals(m.Count) = v
    m.Count = m.Count + 1
End Sub

Public Function MapFind(ByRef m As StrMap, ByVal k As String) As Long
    Dim i As Long
    For i = 0 To m.Count - 1
        If m.Keys(i) = k Then
            MapFind = i
            Exit Function
        End If
    Next i
    MapFind = -1
End Function

Public Function MapHas(ByRef m As StrMap, ByVal k As String) As Boolean
    MapHas = (MapFind(m, k) >= 0)
End Function

' 見つからない場合は -1 を返す。呼び出し側で必須列の欠落を検出する。
Public Function MapGet(ByRef m As StrMap, ByVal k As String) As Long
    Dim i As Long
    i = MapFind(m, k)
    If i < 0 Then
        MapGet = -1
    Else
        MapGet = m.Vals(i)
    End If
End Function

'--- UTF-8 入出力 -------------------------------------------------------------

' UTF-8 (BOM 有無どちらも可) のテキストファイルを読む。
Public Function ReadTextUtf8(ByVal path As String) As String
    Dim f As Integer
    Dim n As Long
    Dim b() As Byte

    n = FileLen(path)
    If n = 0 Then
        ReadTextUtf8 = ""
        Exit Function
    End If

    ReDim b(0 To n - 1)
    f = FreeFile
    Open path For Binary Access Read As #f
    Get #f, 1, b
    Close #f

    ReadTextUtf8 = Utf8BytesToString(b)
End Function

' UTF-8 BOM 付きでテキストファイルを書く (メモ帳で文字化けしないため)。
Public Sub WriteTextUtf8(ByVal path As String, ByVal text As String)
    Dim f As Integer
    Dim b() As Byte
    Dim bom(0 To 2) As Byte

    bom(0) = 239
    bom(1) = 187
    bom(2) = 191

    f = FreeFile
    Open path For Output As #f
    Close #f

    f = FreeFile
    Open path For Binary Access Write As #f
    Put #f, 1, bom
    If Len(text) > 0 Then
        b = StringToUtf8Bytes(text)
        Put #f, 4, b
    End If
    Close #f
End Sub

Public Function Utf8BytesToString(ByRef b() As Byte) As String
    Dim i As Long
    Dim last As Long
    Dim p As Long
    Dim buf As String
    Dim c As Long
    Dim cp As Long
    Dim nExtra As Long
    Dim j As Long
    Dim hi As Long
    Dim lo As Long

    i = LBound(b)
    last = UBound(b)

    ' BOM を読み飛ばす
    If last - i >= 2 Then
        If b(i) = 239 And b(i + 1) = 187 And b(i + 2) = 191 Then i = i + 3
    End If

    ' 復号後の文字数はバイト数を超えない
    buf = Space$(last - i + 1)
    p = 0

    Do While i <= last
        c = b(i)
        If c < 128 Then
            cp = c
            nExtra = 0
        ElseIf (c And 224) = 192 Then
            cp = c And 31
            nExtra = 1
        ElseIf (c And 240) = 224 Then
            cp = c And 15
            nExtra = 2
        ElseIf (c And 248) = 240 Then
            cp = c And 7
            nExtra = 3
        Else
            ' 不正な先頭バイト。置換文字にして 1 バイト進める。
            cp = 65533
            nExtra = 0
        End If

        For j = 1 To nExtra
            i = i + 1
            If i > last Then
                cp = 65533
                Exit For
            End If
            If (b(i) And 192) <> 128 Then
                cp = 65533
                i = i - 1
                Exit For
            End If
            cp = cp * 64 + (b(i) And 63)
        Next j

        If cp > 65535 Then
            ' BMP 外はサロゲートペアに分解する
            cp = cp - 65536
            hi = 55296 + (cp \ 1024)
            lo = 56320 + (cp Mod 1024)
            p = p + 1
            Mid$(buf, p, 1) = ChrW$(hi)
            p = p + 1
            Mid$(buf, p, 1) = ChrW$(lo)
        Else
            p = p + 1
            Mid$(buf, p, 1) = ChrW$(cp)
        End If

        i = i + 1
    Loop

    Utf8BytesToString = Left$(buf, p)
End Function

Public Function StringToUtf8Bytes(ByVal s As String) As Byte()
    Dim out() As Byte
    Dim n As Long
    Dim i As Long
    Dim p As Long
    Dim cp As Long
    Dim c As Long
    Dim c2 As Long

    n = Len(s)
    ReDim out(0 To n * 4)
    p = 0
    i = 1

    Do While i <= n
        c = AscW(Mid$(s, i, 1))
        If c < 0 Then c = c + 65536

        If c >= 55296 And c <= 56319 And i < n Then
            c2 = AscW(Mid$(s, i + 1, 1))
            If c2 < 0 Then c2 = c2 + 65536
            If c2 >= 56320 And c2 <= 57343 Then
                cp = 65536 + (c - 55296) * 1024 + (c2 - 56320)
                i = i + 1
            Else
                cp = c
            End If
        Else
            cp = c
        End If

        If cp < 128 Then
            out(p) = cp: p = p + 1
        ElseIf cp < 2048 Then
            out(p) = 192 + (cp \ 64): p = p + 1
            out(p) = 128 + (cp Mod 64): p = p + 1
        ElseIf cp < 65536 Then
            out(p) = 224 + (cp \ 4096): p = p + 1
            out(p) = 128 + ((cp \ 64) Mod 64): p = p + 1
            out(p) = 128 + (cp Mod 64): p = p + 1
        Else
            out(p) = 240 + (cp \ 262144): p = p + 1
            out(p) = 128 + ((cp \ 4096) Mod 64): p = p + 1
            out(p) = 128 + ((cp \ 64) Mod 64): p = p + 1
            out(p) = 128 + (cp Mod 64): p = p + 1
        End If

        i = i + 1
    Loop

    If p = 0 Then
        ReDim out(0 To 0)
        StringToUtf8Bytes = out
    Else
        ReDim Preserve out(0 To p - 1)
        StringToUtf8Bytes = out
    End If
End Function

'--- JSON -------------------------------------------------------------------

' 工程線名 列は [{"name":"A1", "nameBold":false, ...}] という JSON 配列。
' 先頭要素の name を取り出す。"nameBold" 等の類似キーには一致しない。
Public Function JsonFirstName(ByVal s As String) As String
    Dim i As Long
    Dim n As Long
    Dim ch As String

    If Len(s) = 0 Then
        JsonFirstName = ""
        Exit Function
    End If

    i = InStr(1, s, """name""", vbBinaryCompare)
    If i = 0 Then
        JsonFirstName = ""
        Exit Function
    End If

    i = i + 6
    n = Len(s)

    ' ':' まで読み飛ばす
    Do While i <= n
        ch = Mid$(s, i, 1)
        If ch = ":" Then
            i = i + 1
            Exit Do
        ElseIf ch <> " " Then
            JsonFirstName = ""
            Exit Function
        End If
        i = i + 1
    Loop

    ' 開き引用符まで読み飛ばす
    Do While i <= n
        ch = Mid$(s, i, 1)
        If ch = """" Then
            i = i + 1
            Exit Do
        ElseIf ch <> " " Then
            ' 文字列以外 (null 等)
            JsonFirstName = ""
            Exit Function
        End If
        i = i + 1
    Loop

    JsonFirstName = JsonReadString(s, i)
End Function

' i は開き引用符の次の位置。閉じ引用符までをエスケープ解除して返す。
Private Function JsonReadString(ByVal s As String, ByVal i As Long) As String
    Dim n As Long
    Dim buf As String
    Dim p As Long
    Dim ch As String
    Dim esc As String
    Dim hex4 As String

    n = Len(s)
    buf = Space$(n)
    p = 0

    Do While i <= n
        ch = Mid$(s, i, 1)
        If ch = """" Then
            Exit Do
        ElseIf ch = "\" Then
            i = i + 1
            esc = Mid$(s, i, 1)
            Select Case esc
                Case "n": ch = vbLf
                Case "r": ch = vbCr
                Case "t": ch = vbTab
                Case "b": ch = Chr$(8)
                Case "f": ch = Chr$(12)
                Case "u"
                    hex4 = Mid$(s, i + 1, 4)
                    i = i + 4
                    ch = ChrW$(CLng("&H" & hex4))
                Case Else
                    ch = esc
            End Select
            p = p + 1
            Mid$(buf, p, 1) = ch
        Else
            p = p + 1
            Mid$(buf, p, 1) = ch
        End If
        i = i + 1
    Loop

    JsonReadString = Left$(buf, p)
End Function

'--- 色 ---------------------------------------------------------------------

' "#rrggbb" -> VBA の色値。空や不正なら既定色を返す。
Public Function HexToColor(ByVal hexColor As String, ByVal fallback As Long) As Long
    Dim s As String
    s = Trim$(hexColor)
    If Left$(s, 1) = "#" Then s = Mid$(s, 2)
    If Len(s) <> 6 Then
        HexToColor = fallback
        Exit Function
    End If
    If Not IsHex6(s) Then
        HexToColor = fallback
        Exit Function
    End If
    HexToColor = RGB(CLng("&H" & Mid$(s, 1, 2)), CLng("&H" & Mid$(s, 3, 2)), CLng("&H" & Mid$(s, 5, 2)))
End Function

Private Function IsHex6(ByVal s As String) As Boolean
    Dim i As Long
    Dim c As Long
    For i = 1 To 6
        c = Asc(UCase$(Mid$(s, i, 1)))
        If Not ((c >= 48 And c <= 57) Or (c >= 65 And c <= 70)) Then
            IsHex6 = False
            Exit Function
        End If
    Next i
    IsHex6 = True
End Function

' 線色から淡色 (白へ 75% 寄せ) を作る。box 系で背景色が無いときの塗り。
Public Function TintColor(ByVal c As Long, ByVal ratio As Double) As Long
    Dim r As Long
    Dim g As Long
    Dim b As Long
    r = c And 255
    g = (c \ 256) And 255
    b = (c \ 65536) And 255
    r = 255 - CLng((255 - r) * ratio)
    g = 255 - CLng((255 - g) * ratio)
    b = 255 - CLng((255 - b) * ratio)
    TintColor = RGB(r, g, b)
End Function

'--- その他 -----------------------------------------------------------------

Public Function FileExistsAt(ByVal path As String) As Boolean
    Dim s As String
    On Error GoTo NotFound
    If Len(Trim$(path)) = 0 Then
        FileExistsAt = False
        Exit Function
    End If
    s = Dir$(path)
    FileExistsAt = (Len(s) > 0)
    Exit Function
NotFound:
    FileExistsAt = False
End Function

Public Function FolderOf(ByVal path As String) As String
    Dim i As Long
    i = InStrRev(path, "\")
    If i = 0 Then i = InStrRev(path, "/")
    If i = 0 Then
        FolderOf = ""
    Else
        FolderOf = Left$(path, i - 1)
    End If
End Function

Public Function BaseNameOf(ByVal path As String) As String
    Dim i As Long
    Dim s As String
    i = InStrRev(path, "\")
    If i = 0 Then i = InStrRev(path, "/")
    If i > 0 Then s = Mid$(path, i + 1) Else s = path
    i = InStrRev(s, ".")
    If i > 1 Then s = Left$(s, i - 1)
    BaseNameOf = s
End Function

' 区切り文字は元のパスに合わせる。Windows では "\" になる。
Public Function JoinPath(ByVal folder As String, ByVal name As String) As String
    Dim sep As String

    If Len(folder) = 0 Then
        JoinPath = name
        Exit Function
    End If

    If Right$(folder, 1) = "\" Or Right$(folder, 1) = "/" Then
        JoinPath = folder & name
        Exit Function
    End If

    If InStr(1, folder, "\") > 0 Then
        sep = "\"
    ElseIf InStr(1, folder, "/") > 0 Then
        sep = "/"
    Else
        sep = "\"
    End If

    JoinPath = folder & sep & name
End Function

Public Function Ymd(ByVal d As Date) As String
    Ymd = Format$(d, "yyyymmdd")
End Function

Public Function Ymd2(ByVal d As Date) As String
    Ymd2 = Format$(d, "yyyy/mm/dd")
End Function

'--- 変換ログ ---------------------------------------------------------------
' 1 回の実行につき 1 本のログを組み立てる (設計A 1章)。

Private mLog As String
Private mNgCount As Long

Public Sub LogReset()
    mLog = ""
    mNgCount = 0
End Sub

Public Sub LogLine(ByVal s As String)
    mLog = mLog & s & vbCrLf
End Sub

Public Sub LogNg(ByVal s As String)
    mNgCount = mNgCount + 1
    mLog = mLog & "NG   " & s & vbCrLf
End Sub

Public Sub LogOk(ByVal s As String)
    mLog = mLog & "OK   " & s & vbCrLf
End Sub

Public Function LogNgCount() As Long
    LogNgCount = mNgCount
End Function

Public Function LogText() As String
    LogText = mLog
End Function
```

## 2. `src/CsvReader.bas`

RFC 4180 パーサ、メタ行の期間、ISO 日時の日付部

SHA-256: `74ed91bc1115ff13d05ced4e2871c175d18e257ad7d0cb00450bcc0d1226be9a`

```vb
Attribute VB_Name = "CsvReader"
Option Explicit
'==============================================================================
' CsvReader - RFC 4180 準拠の CSV パーサ
'
' プロジェクトG の CSV は 工程線名 列に JSON が入り、カンマと二重引用符を含む。
' Split(",") では壊れるため、引用符を解釈する状態機械で読む。
' 列数・行数は固定と仮定しない (共通仕様 8章-1)。
'==============================================================================

Public Type CsvTable
    Rows() As Variant       ' 各要素は String() (1 行分のフィールド)
    Count As Long
End Type

Private Const ST_FIELD As Long = 0
Private Const ST_QUOTED As Long = 1
Private Const ST_AFTERQ As Long = 2

Public Function LoadCsv(ByVal path As String) As CsvTable
    LoadCsv = ParseCsvText(Util.ReadTextUtf8(path))
End Function

Public Function ParseCsvText(ByVal text As String) As CsvTable
    Dim t As CsvTable
    Dim n As Long
    Dim i As Long
    Dim state As Long
    Dim ch As String
    Dim nextCh As String
    Dim fld As String
    Dim fldP As Long
    Dim row() As String
    Dim rowN As Long
    Dim endOfRow As Boolean
    Dim endOfField As Boolean

    n = Len(text)
    t.Count = 0
    ReDim t.Rows(0 To 63)

    ReDim row(0 To 15)
    rowN = 0
    fld = Space$(256)
    fldP = 0
    state = ST_FIELD
    i = 1

    Do While i <= n
        ch = Mid$(text, i, 1)
        endOfRow = False
        endOfField = False

        Select Case state

            Case ST_FIELD
                If ch = """" And fldP = 0 Then
                    state = ST_QUOTED
                ElseIf ch = "," Then
                    endOfField = True
                ElseIf ch = vbCr Then
                    nextCh = Mid$(text, i + 1, 1)
                    If nextCh = vbLf Then i = i + 1
                    endOfField = True
                    endOfRow = True
                ElseIf ch = vbLf Then
                    endOfField = True
                    endOfRow = True
                Else
                    fldP = fldP + 1
                    If fldP > Len(fld) Then fld = fld & Space$(Len(fld))
                    Mid$(fld, fldP, 1) = ch
                End If

            Case ST_QUOTED
                If ch = """" Then
                    state = ST_AFTERQ
                Else
                    fldP = fldP + 1
                    If fldP > Len(fld) Then fld = fld & Space$(Len(fld))
                    Mid$(fld, fldP, 1) = ch
                End If

            Case ST_AFTERQ
                If ch = """" Then
                    ' "" は 1 個の " を表す
                    fldP = fldP + 1
                    If fldP > Len(fld) Then fld = fld & Space$(Len(fld))
                    Mid$(fld, fldP, 1) = """"
                    state = ST_QUOTED
                ElseIf ch = "," Then
                    state = ST_FIELD
                    endOfField = True
                ElseIf ch = vbCr Then
                    nextCh = Mid$(text, i + 1, 1)
                    If nextCh = vbLf Then i = i + 1
                    state = ST_FIELD
                    endOfField = True
                    endOfRow = True
                ElseIf ch = vbLf Then
                    state = ST_FIELD
                    endOfField = True
                    endOfRow = True
                End If

        End Select

        If endOfField Then
            If rowN > UBound(row) Then ReDim Preserve row(0 To rowN * 2)
            row(rowN) = Left$(fld, fldP)
            rowN = rowN + 1
            fldP = 0
        End If

        If endOfRow Then
            PushRow t, row, rowN
            ReDim row(0 To 15)
            rowN = 0
        End If

        i = i + 1
    Loop

    ' 最終行に改行が無い場合の取りこぼしを拾う
    If fldP > 0 Or rowN > 0 Then
        If rowN > UBound(row) Then ReDim Preserve row(0 To rowN * 2)
        row(rowN) = Left$(fld, fldP)
        rowN = rowN + 1
        PushRow t, row, rowN
    End If

    ParseCsvText = t
End Function

Private Sub PushRow(ByRef t As CsvTable, ByRef row() As String, ByVal rowN As Long)
    Dim trimmed() As String
    Dim i As Long

    If rowN = 0 Then Exit Sub

    ' 末尾の空フィールドだけの行 (ファイル末尾の空行) は捨てる
    If rowN = 1 Then
        If Len(row(0)) = 0 Then Exit Sub
    End If

    ReDim trimmed(0 To rowN - 1)
    For i = 0 To rowN - 1
        trimmed(i) = row(i)
    Next i

    If t.Count > UBound(t.Rows) Then
        ReDim Preserve t.Rows(0 To t.Count * 2)
    End If
    t.Rows(t.Count) = trimmed
    t.Count = t.Count + 1
End Sub

' 行 rowIndex (0 起点) のフィールド数
Public Function FieldCount(ByRef t As CsvTable, ByVal rowIndex As Long) As Long
    Dim r() As String
    If rowIndex < 0 Or rowIndex >= t.Count Then
        FieldCount = 0
        Exit Function
    End If
    r = t.Rows(rowIndex)
    FieldCount = UBound(r) - LBound(r) + 1
End Function

' 行 rowIndex の 列 colIndex (どちらも 0 起点)。範囲外は空文字。
Public Function FieldAt(ByRef t As CsvTable, ByVal rowIndex As Long, ByVal colIndex As Long) As String
    Dim r() As String
    If rowIndex < 0 Or rowIndex >= t.Count Then
        FieldAt = ""
        Exit Function
    End If
    If colIndex < 0 Then
        FieldAt = ""
        Exit Function
    End If
    r = t.Rows(rowIndex)
    If colIndex > UBound(r) Then
        FieldAt = ""
    Else
        FieldAt = r(colIndex)
    End If
End Function

' 見出し行から 見出し名 -> 列番号 の対応表を作る。
Public Function BuildHeaderMap(ByRef t As CsvTable, ByVal headerRow As Long) As StrMap
    Dim m As StrMap
    Dim r() As String
    Dim i As Long

    Util.MapInit m
    If headerRow < 0 Or headerRow >= t.Count Then
        BuildHeaderMap = m
        Exit Function
    End If

    r = t.Rows(headerRow)
    For i = LBound(r) To UBound(r)
        If Len(r(i)) > 0 Then
            If Not Util.MapHas(m, r(i)) Then Util.MapAdd m, r(i), i
        End If
    Next i

    BuildHeaderMap = m
End Function

' メタ行 (0 行目=見出し, 1 行目=値) から 工程表の期間 を取り出す。
' "2026/09/01-2026/11/30" 形式。成功したら True。
Public Function MetaPeriod(ByRef t As CsvTable, ByRef dStart As Date, ByRef dEnd As Date) As Boolean
    Dim m As StrMap
    Dim c As Long
    Dim s As String
    Dim i As Long

    MetaPeriod = False
    If t.Count < 2 Then Exit Function

    m = BuildHeaderMap(t, 0)
    c = Util.MapGet(m, "工程表の期間")
    If c < 0 Then Exit Function

    s = Trim$(FieldAt(t, 1, c))
    i = InStr(1, s, "-")
    If i = 0 Then Exit Function

    On Error GoTo BadDate
    dStart = CDate(Trim$(Left$(s, i - 1)))
    dEnd = CDate(Trim$(Mid$(s, i + 1)))
    MetaPeriod = True
    Exit Function

BadDate:
    MetaPeriod = False
End Function

' ISO 日時 "2026-09-07T00:00:00+09:00" の日付部だけを Date にする。
' 時刻・タイムゾーンは捨てる (共通仕様 3.3)。
Public Function IsoDatePart(ByVal s As String) As Date
    Dim d As String
    d = Trim$(s)
    If Len(d) < 10 Then
        IsoDatePart = 0
        Exit Function
    End If
    d = Left$(d, 10)
    On Error GoTo Bad
    IsoDatePart = DateSerial(CLng(Left$(d, 4)), CLng(Mid$(d, 6, 2)), CLng(Mid$(d, 9, 2)))
    Exit Function
Bad:
    IsoDatePart = 0
End Function
```

## 3. `src/Model.bas`

工程レコードの型と CSV からの正規化

SHA-256: `91d96f85c4b5e8d12462a6800bdea940ff7bc23282c73c638a3dec8eda591a5c`

```vb
Attribute VB_Name = "Model"
Option Explicit
'==============================================================================
' Model - 工程レコードの型と、CSV からの正規化
'
' 工程 = ノード間のエッジ (共通仕様 3.2)。1 行 1 工程。
' 列は必ず見出し名で引く (共通仕様 8章-5)。
'==============================================================================

Public Const STATUS_DRAWN As String = "drawn"
Public Const STATUS_DELETED As String = "deleted"
Public Const STATUS_OUTSIDE As String = "outside"

Public Type ProcRec
    SrcIndex As Long            ' CSV 内の工程順 (0 起点)
    ProcId As String
    Name As String              ' 工程線名 JSON の name
    StartNodeId As String
    EndNodeId As String
    StartNodeName As String
    EndNodeName As String
    GridStartRow As Long        ' 開始日の行番号 (プロジェクトG の行)
    GridEndRow As Long          ' 終了日の行番号 (プロジェクトG の行)
    DateStart As Date
    DateEnd As Date
    Shape As String
    Arrow As String
    DashKind As String
    Thickness As Double
    LineColorHex As String
    BackColorHex As String
    Slant As String
    MidNodeDate As String
    StartNodeShape As String
    EndNodeShape As String
    DeletedFlag As String
    HalfDayFlag As String

    ' --- 配置結果 (Layout が埋める) ---
    Status As String
    AssignedGridRow As Long     ' 実際に描いた プロジェクトG の行
    SheetRow As Long            ' T10_Layout のシート行
    Relocated As Boolean        ' 行衝突で本来の行から移したか
    ClipStart As Date
    ClipEnd As Date
    Clipped As Boolean
End Type

Public Type ProcSet
    Items() As ProcRec
    Count As Long
End Type

' 描画に最低限必要な列。1 つでも欠ければ変換を中止する。
Private Function RequiredColumns() As Variant
    RequiredColumns = Array( _
        "工程ID", "工程線名", "開始日の行番号", "終了日の行番号", _
        "開始日", "終了日", "工程線の形状")
End Function

' 見出し行に必須列が揃っているか。欠落があれば名前をログに出す。
Public Function CheckColumns(ByRef hdr As StrMap) As Boolean
    Dim req As Variant
    Dim i As Long
    Dim ok As Boolean

    req = RequiredColumns()
    ok = True
    For i = LBound(req) To UBound(req)
        If Util.MapGet(hdr, CStr(req(i))) < 0 Then
            Util.LogLine "必須列が見つかりません: " & CStr(req(i))
            ok = False
        End If
    Next i
    CheckColumns = ok
End Function

' CSV の工程データ行 (dataStartRow 以降) を ProcRec 配列にする。
Public Function LoadProcs(ByRef t As CsvTable, ByRef hdr As StrMap, ByVal dataStartRow As Long) As ProcSet
    Dim ps As ProcSet
    Dim i As Long
    Dim n As Long
    Dim p As ProcRec
    Dim raw As String

    n = t.Count - dataStartRow
    If n < 1 Then
        ps.Count = 0
        ReDim ps.Items(0 To 0)
        LoadProcs = ps
        Exit Function
    End If

    ReDim ps.Items(0 To n - 1)
    ps.Count = 0

    For i = dataStartRow To t.Count - 1
        p = NewProc()
        p.SrcIndex = i - dataStartRow

        p.ProcId = Fld(t, hdr, i, "工程ID")
        p.Name = Util.JsonFirstName(Fld(t, hdr, i, "工程線名"))
        p.StartNodeId = Fld(t, hdr, i, "項目ID（開始日ノード）")
        p.EndNodeId = Fld(t, hdr, i, "項目ID（終了日ノード）")
        p.StartNodeName = Fld(t, hdr, i, "項目名（開始日ノード）")
        p.EndNodeName = Fld(t, hdr, i, "項目名（終了日ノード）")
        p.GridStartRow = ToLong(Fld(t, hdr, i, "開始日の行番号"))
        p.GridEndRow = ToLong(Fld(t, hdr, i, "終了日の行番号"))
        p.DateStart = CsvReader.IsoDatePart(Fld(t, hdr, i, "開始日"))
        p.DateEnd = CsvReader.IsoDatePart(Fld(t, hdr, i, "終了日"))
        p.Shape = Fld(t, hdr, i, "工程線の形状")
        p.Arrow = Fld(t, hdr, i, "工程線の矢印")
        p.DashKind = Fld(t, hdr, i, "実線・点線")

        raw = Trim$(Fld(t, hdr, i, "工程線の太さ"))
        If Len(raw) = 0 Then
            p.Thickness = 2#             ' 空 = 既定 2 (共通仕様 3.3)
        Else
            p.Thickness = ToDouble(raw, 2#)
        End If

        p.LineColorHex = Fld(t, hdr, i, "工程線の色")
        p.BackColorHex = Fld(t, hdr, i, "工程線の背景色")
        p.Slant = Fld(t, hdr, i, "工程線の斜行")
        p.MidNodeDate = Fld(t, hdr, i, "中間ノード日付")
        p.StartNodeShape = Fld(t, hdr, i, "開始日ノード形状")
        p.EndNodeShape = Fld(t, hdr, i, "終了日ノード形状")
        p.DeletedFlag = Trim$(Fld(t, hdr, i, "工程削除"))
        p.HalfDayFlag = Trim$(Fld(t, hdr, i, "0.5日"))

        ps.Items(ps.Count) = p
        ps.Count = ps.Count + 1
    Next i

    LoadProcs = ps
End Function

Private Function NewProc() As ProcRec
    Dim p As ProcRec
    p.Status = STATUS_DRAWN
    p.AssignedGridRow = 0
    p.SheetRow = 0
    p.Relocated = False
    p.Clipped = False
    NewProc = p
End Function

Private Function Fld(ByRef t As CsvTable, ByRef hdr As StrMap, ByVal rowIndex As Long, ByVal colName As String) As String
    Fld = CsvReader.FieldAt(t, rowIndex, Util.MapGet(hdr, colName))
End Function

Private Function ToLong(ByVal s As String) As Long
    Dim v As String
    v = Trim$(s)
    If Len(v) = 0 Then
        ToLong = 0
        Exit Function
    End If
    On Error GoTo Bad
    ToLong = CLng(v)
    Exit Function
Bad:
    ToLong = 0
End Function

Private Function ToDouble(ByVal s As String, ByVal fallback As Double) As Double
    On Error GoTo Bad
    ToDouble = CDbl(Trim$(s))
    Exit Function
Bad:
    ToDouble = fallback
End Function

' スコープ外の値が入っていたら警告する (共通仕様 3.3 の 0.5日 / 工程削除)。
Public Sub WarnUnsupported(ByRef ps As ProcSet)
    Dim i As Long
    Dim nHalf As Long

    nHalf = 0
    For i = 0 To ps.Count - 1
        If Len(ps.Items(i).HalfDayFlag) > 0 Then
            nHalf = nHalf + 1
            Util.LogLine "警告 0.5日 は v1 未対応です: 工程ID=" & ps.Items(i).ProcId & _
                         " 値=" & ps.Items(i).HalfDayFlag
        End If
    Next i
    If nHalf = 0 Then Util.LogLine "0.5日 に値のある工程: 0 件 (v1 未対応のため値があれば警告)"
End Sub

' 工程ID は復路の突き合わせキー (共通仕様 3.3)。重複していたら復路で
' どちらの工程か決められないので警告する。往路の描画自体は続ける。
Public Sub WarnDuplicateIds(ByRef ps As ProcSet)
    Dim i As Long
    Dim j As Long
    Dim n As Long

    For i = 0 To ps.Count - 1
        For j = 0 To i - 1
            If ps.Items(j).ProcId = ps.Items(i).ProcId Then
                n = n + 1
                Util.LogLine "警告 工程ID が重複しています: " & ps.Items(i).ProcId & _
                             " (CSV の " & (j + 1) & " 本目と " & (i + 1) & " 本目)。" & _
                             "復路の突き合わせができません"
                Exit For
            End If
        Next j
    Next i

    If n = 0 Then Util.LogLine "工程ID の重複: なし"
End Sub

' T09_Audit 用の監査列の並び。見出し名で引ける形で出す (設計A 3章)。
Public Function AuditHeaders() As Variant
    AuditHeaders = Array( _
        "工程ID", "工程線名", "開始日の行番号", "終了日の行番号", "開始日", "終了日", _
        "工程線の形状", "工程線の矢印", "実線・点線", "工程線の太さ", "工程線の色", _
        "工程線の背景色", "工程線の斜行", "中間ノード日付", "開始日ノード形状", _
        "終了日ノード形状", "工程削除", "項目名（開始日ノード）", "項目名（終了日ノード）", _
        "配置状態", "割当行", "シート行", "行衝突で移動")
End Function

Public Function AuditValue(ByRef p As ProcRec, ByVal colName As String) As Variant
    Select Case colName
        Case "工程ID":                 AuditValue = p.ProcId
        Case "工程線名":               AuditValue = p.Name
        Case "開始日の行番号":         AuditValue = p.GridStartRow
        Case "終了日の行番号":         AuditValue = p.GridEndRow
        Case "開始日":                 AuditValue = p.DateStart
        Case "終了日":                 AuditValue = p.DateEnd
        Case "工程線の形状":           AuditValue = p.Shape
        Case "工程線の矢印":           AuditValue = p.Arrow
        Case "実線・点線":             AuditValue = p.DashKind
        Case "工程線の太さ":           AuditValue = p.Thickness
        Case "工程線の色":             AuditValue = p.LineColorHex
        Case "工程線の背景色":         AuditValue = p.BackColorHex
        Case "工程線の斜行":           AuditValue = p.Slant
        Case "中間ノード日付":         AuditValue = p.MidNodeDate
        Case "開始日ノード形状":       AuditValue = p.StartNodeShape
        Case "終了日ノード形状":       AuditValue = p.EndNodeShape
        Case "工程削除":               AuditValue = p.DeletedFlag
        Case "項目名（開始日ノード）": AuditValue = p.StartNodeName
        Case "項目名（終了日ノード）": AuditValue = p.EndNodeName
        Case "配置状態":               AuditValue = p.Status
        Case "割当行":                 AuditValue = p.AssignedGridRow
        Case "シート行":               AuditValue = p.SheetRow
        Case "行衝突で移動":           AuditValue = p.Relocated
        Case Else:                     AuditValue = ""
    End Select
End Function
```

## 4. `src/Layout.bas`

表示期間 → 日付列、行 → シート行、行見出し、行の割り当て

SHA-256: `62b9cf7d4721a5362ee3e0820d25a8ab97f0558a194533c78f3f49b9e7bd167f`

```vb
Attribute VB_Name = "Layout"
Option Explicit
'==============================================================================
' Layout - 表示期間 -> 日付列、プロジェクトG の行 -> シート行、行見出し、行の割り当て
'
' 共通仕様 4章の格子定義を、設計A 4.3 の「データ列 4 本を挟む」読み替え
' (最初の日付列 = F 列) つきで実装する。
'==============================================================================

' シート上の固定位置。日付列は FIRST_DATE_COL から右へ 1 日 1 列。
Public Const COL_ROWHEAD As Long = 1        ' A 行見出し
Public Const COL_NAME As Long = 2           ' B 工程線名
Public Const COL_START As Long = 3          ' C 開始日 (業者が編集)
Public Const COL_END As Long = 4            ' D 終了日 (業者が編集)
Public Const COL_DAYS As Long = 5           ' E 日数
Public Const FIRST_DATE_COL As Long = 6     ' F 表示期間の初日
Public Const HEADER_ROWS As Long = 3        ' 1:月 2:日 3:曜日

Public Const ROW_MONTH As Long = 1
Public Const ROW_DAY As Long = 2
Public Const ROW_DOW As Long = 3

Public Type Grid
    PeriodStart As Date
    PeriodEnd As Date
    DayCount As Long
    MaxGridRow As Long          ' 再現する プロジェクトG の行の最大値
    LastDateCol As Long
    IdCol As Long               ' 工程ID を隠し持つ列 (設計A 4.5)
End Type

'--- 座標変換 ---------------------------------------------------------------

' 日付 index n (Start が 0) -> シートの列番号
Public Function DateCol(ByVal n As Long) As Long
    DateCol = FIRST_DATE_COL + n
End Function

' シートの列番号 -> 日付。範囲外は 0。
Public Function ColDate(ByRef g As Grid, ByVal col As Long) As Date
    Dim n As Long
    n = col - FIRST_DATE_COL
    If n < 0 Or n >= g.DayCount Then
        ColDate = 0
    Else
        ColDate = g.PeriodStart + n
    End If
End Function

' 日付 -> シートの列番号。期間外は 0。
Public Function DateToCol(ByRef g As Grid, ByVal d As Date) As Long
    Dim n As Long
    n = CLng(d - g.PeriodStart)
    If n < 0 Or n >= g.DayCount Then
        DateToCol = 0
    Else
        DateToCol = FIRST_DATE_COL + n
    End If
End Function

' プロジェクトG の行番号 -> シート行 (共通仕様 4章: 行 r+3)
Public Function SheetRowOf(ByVal gridRow As Long) As Long
    SheetRowOf = gridRow + HEADER_ROWS
End Function

' 土曜・日曜。祝日は v1 スコープ外 (共通仕様 4章)。
Public Function IsWeekend(ByVal d As Date) As Boolean
    Dim w As Long
    w = Weekday(d, vbSunday)        ' 1=日 .. 7=土
    IsWeekend = (w = 1 Or w = 7)
End Function

'--- 格子の構築 -------------------------------------------------------------

Public Function BuildGrid(ByRef ps As ProcSet, ByVal dStart As Date, ByVal dEnd As Date) As Grid
    Dim g As Grid
    Dim i As Long
    Dim mx As Long

    g.PeriodStart = dStart
    g.PeriodEnd = dEnd
    g.DayCount = CLng(dEnd - dStart) + 1

    ' 空行も再現するため、行 1 から最大行まで格子を張る (共通仕様 4章)
    mx = 1
    For i = 0 To ps.Count - 1
        If ps.Items(i).Status <> STATUS_DELETED Then
            If ps.Items(i).GridStartRow > mx Then mx = ps.Items(i).GridStartRow
            If ps.Items(i).GridEndRow > mx Then mx = ps.Items(i).GridEndRow
        End If
    Next i
    g.MaxGridRow = mx
    g.LastDateCol = FIRST_DATE_COL + g.DayCount - 1
    g.IdCol = g.LastDateCol + 1

    BuildGrid = g
End Function

'--- 除外判定とクリップ -----------------------------------------------------

' 工程削除 / 期間外 を判定し、残りにクリップ後の日付を入れる。
Public Sub ClassifyProcs(ByRef ps As ProcSet, ByVal dStart As Date, ByVal dEnd As Date)
    Dim i As Long
    Dim p As ProcRec

    For i = 0 To ps.Count - 1
        p = ps.Items(i)

        If Len(p.DeletedFlag) > 0 Then
            p.Status = STATUS_DELETED
        ElseIf p.DateStart = 0 Or p.DateEnd = 0 Then
            p.Status = STATUS_OUTSIDE
        Else
            p.ClipStart = p.DateStart
            p.ClipEnd = p.DateEnd
            If p.ClipStart < dStart Then p.ClipStart = dStart
            If p.ClipEnd > dEnd Then p.ClipEnd = dEnd
            If p.ClipStart > p.ClipEnd Then
                p.Status = STATUS_OUTSIDE
            Else
                p.Status = STATUS_DRAWN
                p.Clipped = (p.ClipStart <> p.DateStart) Or (p.ClipEnd <> p.DateEnd)
            End If
        End If

        ps.Items(i) = p
    Next i
End Sub

'--- 行の割り当て -----------------------------------------------------------

' 行 = 開始日の行番号 (設計A 4.2)。
' 同じ行に 2 工程が開始する場合は 設計A 4.3 に従い、開始日の早い方が
' 本来の行を保ち、残りを次の空行へ落とす。後勝ちの上書きはしない。
Public Sub AssignRows(ByRef ps As ProcSet, ByRef g As Grid)
    Dim used() As Boolean
    Dim limit As Long
    Dim i As Long
    Dim j As Long
    Dim ord() As Long
    Dim nOrd As Long
    Dim r As Long
    Dim p As ProcRec

    limit = g.MaxGridRow + ps.Count + 2
    ReDim used(0 To limit)
    For i = 0 To limit
        used(i) = False
    Next i

    ' 描画対象を (開始行, 開始日, CSV 順) で並べる。
    ' こうすると各行で最も早く始まる工程が本来の行を保つ。
    ReDim ord(0 To ps.Count)
    nOrd = 0
    For i = 0 To ps.Count - 1
        If ps.Items(i).Status = STATUS_DRAWN Then
            ord(nOrd) = i
            nOrd = nOrd + 1
        End If
    Next i
    SortOrder ps, ord, nOrd

    ' 第 1 巡: 衝突しない工程を本来の行に固定する
    For j = 0 To nOrd - 1
        i = ord(j)
        r = ps.Items(i).GridStartRow
        If r >= 1 And r <= limit Then
            If Not used(r) Then
                used(r) = True
                p = ps.Items(i)
                p.AssignedGridRow = r
                p.SheetRow = SheetRowOf(r)
                p.Relocated = False
                ps.Items(i) = p
            End If
        End If
    Next j

    ' 第 2 巡: 溢れた工程を次の空行へ
    For j = 0 To nOrd - 1
        i = ord(j)
        If ps.Items(i).AssignedGridRow = 0 Then
            r = NextFreeRow(used, ps.Items(i).GridStartRow, limit)
            used(r) = True
            p = ps.Items(i)
            p.AssignedGridRow = r
            p.SheetRow = SheetRowOf(r)
            p.Relocated = True
            ps.Items(i) = p
            Util.LogLine "警告 行衝突: 工程ID=" & p.ProcId & " (" & p.Name & ") の開始行 " & _
                         p.GridStartRow & " は既に使用済みのため 行 " & r & " に配置しました"
            If r > g.MaxGridRow Then g.MaxGridRow = r
        End If
    Next j
End Sub

Private Function NextFreeRow(ByRef used() As Boolean, ByVal fromRow As Long, ByVal limit As Long) As Long
    Dim r As Long
    r = fromRow + 1
    If r < 1 Then r = 1
    Do While r <= limit
        If Not used(r) Then
            NextFreeRow = r
            Exit Function
        End If
        r = r + 1
    Loop
    NextFreeRow = limit
End Function

' 挿入ソート。キーは 開始行 -> 開始日 -> CSV 順。
Private Sub SortOrder(ByRef ps As ProcSet, ByRef ord() As Long, ByVal n As Long)
    Dim i As Long
    Dim j As Long
    Dim key As Long

    For i = 1 To n - 1
        key = ord(i)
        j = i - 1
        Do While j >= 0
            If Less(ps, key, ord(j)) Then
                ord(j + 1) = ord(j)
                j = j - 1
            Else
                Exit Do
            End If
        Loop
        ord(j + 1) = key
    Next i
End Sub

Private Function Less(ByRef ps As ProcSet, ByVal a As Long, ByVal b As Long) As Boolean
    If ps.Items(a).GridStartRow <> ps.Items(b).GridStartRow Then
        Less = (ps.Items(a).GridStartRow < ps.Items(b).GridStartRow)
    ElseIf ps.Items(a).DateStart <> ps.Items(b).DateStart Then
        Less = (ps.Items(a).DateStart < ps.Items(b).DateStart)
    Else
        Less = (ps.Items(a).SrcIndex < ps.Items(b).SrcIndex)
    End If
End Function

'--- 行見出し ---------------------------------------------------------------

' プロジェクトG の行 -> 行見出し。その行にノードを持つ項目名を集め、
' 複数あれば "/" で連結する (共通仕様 4章)。名前が無い行は空。
' 表示期間で除外された工程のノードも見出しには残す。行の位置が
' 表示期間によって動くと PDF と突き合わせられなくなるため。
Public Function BuildRowHeads(ByRef ps As ProcSet, ByRef g As Grid) As Variant
    Dim heads() As String
    Dim ids() As String
    Dim i As Long
    Dim r As Long

    ReDim heads(0 To g.MaxGridRow)
    ReDim ids(0 To g.MaxGridRow)
    For r = 0 To g.MaxGridRow
        heads(r) = ""
        ids(r) = ""
    Next r

    For i = 0 To ps.Count - 1
        If ps.Items(i).Status <> STATUS_DELETED Then
            AddHead heads, ids, g.MaxGridRow, ps.Items(i).GridStartRow, _
                    ps.Items(i).StartNodeId, ps.Items(i).StartNodeName
            AddHead heads, ids, g.MaxGridRow, ps.Items(i).GridEndRow, _
                    ps.Items(i).EndNodeId, ps.Items(i).EndNodeName
        End If
    Next i

    BuildRowHeads = heads
End Function

Private Sub AddHead(ByRef heads() As String, ByRef ids() As String, ByVal maxRow As Long, _
                    ByVal r As Long, ByVal nodeId As String, ByVal nodeName As String)
    Dim marker As String

    If r < 0 Or r > maxRow Then Exit Sub
    If Len(nodeId) = 0 Then Exit Sub

    ' 同じノードを二度数えない
    marker = "|" & nodeId & "|"
    If InStr(1, ids(r), marker, vbBinaryCompare) > 0 Then Exit Sub
    ids(r) = ids(r) & marker

    If Len(nodeName) = 0 Then Exit Sub
    If Len(heads(r)) = 0 Then
        heads(r) = nodeName
    Else
        heads(r) = heads(r) & "/" & nodeName
    End If
End Sub
```

## 5. `src/Render.bas`

T10_Layout にセルだけで描く（Shape 不使用）

SHA-256: `ecf5a5c14272c16c9ae0392435df5c9aadf7a27e3bfc26a12fd7d522afd72658`

```vb
Attribute VB_Name = "Render"
Option Explicit
'==============================================================================
' Render - T10_Layout にセルだけで描く
'
' Shape (図形) は使わない (共通仕様 8章-2)。バーは条件付き書式で描く。
' 静的な塗り/罫線をバーに使わないので、業者が C/D を直すとバーが追従し、
' 古い塗りが残る (ゴースト) 問題も起きない。設計A 4.4 の推奨に従った。
'==============================================================================

Private Const WEEKEND_FILL As Long = &HEEEEEE     ' #EEEEEE (灰は R=G=B なので並び順は不問)
Private Const DEFAULT_LINE As Long = 0            ' 線色が空のときの既定 (PDF のバー3 が黒)
Private Const TINT_RATIO As Double = 0.25         ' 背景色が無い box 系の淡色

Public Sub RenderLayout(ByVal ws As Object, ByRef ps As ProcSet, ByRef g As Grid)
    Dim heads As Variant

    ClearSheet ws
    heads = Layout.BuildRowHeads(ps, g)

    DrawHeaders ws, g
    DrawWeekends ws, g
    DrawRowHeads ws, g, heads
    DrawProcs ws, ps, g
    ApplySizes ws, g
End Sub

Private Sub ClearSheet(ByVal ws As Object)
    ws.Cells.Clear
    ws.Cells.FormatConditions.Delete
    ws.Cells.Validation.Delete
End Sub

'--- ヘッダー ---------------------------------------------------------------

Private Sub DrawHeaders(ByVal ws As Object, ByRef g As Grid)
    Dim n As Long
    Dim c As Long
    Dim d As Date
    Dim runStart As Long
    Dim i As Long

    ws.Cells(Layout.ROW_DOW, Layout.COL_ROWHEAD).Value = "項目"
    ws.Cells(Layout.ROW_DOW, Layout.COL_NAME).Value = "工程名"
    ws.Cells(Layout.ROW_DOW, Layout.COL_START).Value = "開始日"
    ws.Cells(Layout.ROW_DOW, Layout.COL_END).Value = "終了日"
    ws.Cells(Layout.ROW_DOW, Layout.COL_DAYS).Value = "日数"
    ws.Range(ws.Cells(Layout.ROW_DOW, Layout.COL_ROWHEAD), _
             ws.Cells(Layout.ROW_DOW, Layout.COL_DAYS)).Font.Bold = True

    ' 行 2 = 日、行 3 = 曜日。どちらも実日付を入れて表示形式で見せる。
    ' 条件付き書式の式が行 2 の日付を参照するため、文字列にはしない。
    For n = 0 To g.DayCount - 1
        c = Layout.DateCol(n)
        d = g.PeriodStart + n

        ws.Cells(Layout.ROW_DAY, c).Value = d
        ws.Cells(Layout.ROW_DAY, c).NumberFormat = "d"
        ws.Cells(Layout.ROW_DAY, c).HorizontalAlignment = xlCenter

        ws.Cells(Layout.ROW_DOW, c).Value = d
        ws.Cells(Layout.ROW_DOW, c).NumberFormat = "aaa"
        ws.Cells(Layout.ROW_DOW, c).HorizontalAlignment = xlCenter
    Next n

    ' 行 1 = 月。同じ月の日付列を結合する。
    runStart = Layout.DateCol(0)
    For n = 1 To g.DayCount
        If n = g.DayCount Then
            MergeMonth ws, runStart, Layout.DateCol(n - 1), g
        Else
            If Month(g.PeriodStart + n) <> Month(g.PeriodStart + n - 1) Or _
               Year(g.PeriodStart + n) <> Year(g.PeriodStart + n - 1) Then
                MergeMonth ws, runStart, Layout.DateCol(n - 1), g
                runStart = Layout.DateCol(n)
            End If
        End If
    Next n
End Sub

Private Sub MergeMonth(ByVal ws As Object, ByVal c1 As Long, ByVal c2 As Long, ByRef g As Grid)
    Dim rng As Object
    Set rng = ws.Range(ws.Cells(Layout.ROW_MONTH, c1), ws.Cells(Layout.ROW_MONTH, c2))
    rng.Value = Layout.ColDate(g, c1)
    rng.NumberFormat = "m""月"""
    rng.HorizontalAlignment = xlCenter
    If c2 > c1 Then rng.Merge
End Sub

'--- 土日列 -----------------------------------------------------------------

Private Sub DrawWeekends(ByVal ws As Object, ByRef g As Grid)
    Dim n As Long
    Dim c As Long
    Dim lastRow As Long

    lastRow = Layout.SheetRowOf(g.MaxGridRow)
    For n = 0 To g.DayCount - 1
        If Layout.IsWeekend(g.PeriodStart + n) Then
            c = Layout.DateCol(n)
            ws.Range(ws.Cells(Layout.ROW_DAY, c), ws.Cells(lastRow, c)).Interior.Color = WEEKEND_FILL
        End If
    Next n
End Sub

'--- 行見出し ---------------------------------------------------------------

Private Sub DrawRowHeads(ByVal ws As Object, ByRef g As Grid, ByVal heads As Variant)
    Dim r As Long
    Dim h() As String

    h = heads
    For r = 1 To g.MaxGridRow
        If r <= UBound(h) Then
            If Len(h(r)) > 0 Then
                ws.Cells(Layout.SheetRowOf(r), Layout.COL_ROWHEAD).Value = h(r)
            End If
        End If
    Next r
End Sub

'--- 工程 -------------------------------------------------------------------

Private Sub DrawProcs(ByVal ws As Object, ByRef ps As ProcSet, ByRef g As Grid)
    Dim i As Long
    Dim p As ProcRec
    Dim nOut As Long
    Dim nDel As Long
    Dim nClip As Long

    nOut = 0
    nDel = 0
    nClip = 0

    For i = 0 To ps.Count - 1
        p = ps.Items(i)
        Select Case p.Status
            Case STATUS_DELETED
                nDel = nDel + 1
            Case STATUS_OUTSIDE
                nOut = nOut + 1
            Case Else
                If p.Clipped Then nClip = nClip + 1
                DrawOneProc ws, p, g
        End Select
    Next i

    Util.LogLine "描画: " & (ps.Count - nOut - nDel) & " 件 / 期間外で除外: " & nOut & _
                 " 件 / 工程削除で除外: " & nDel & " 件 / 期間端でクリップ: " & nClip & " 件"
End Sub

Private Sub DrawOneProc(ByVal ws As Object, ByRef p As ProcRec, ByRef g As Grid)
    Dim r As Long
    Dim c1 As Long
    Dim c2 As Long
    Dim lineColor As Long
    Dim fillColor As Long
    Dim rng As Object

    r = p.SheetRow
    c1 = Layout.DateToCol(g, p.ClipStart)
    c2 = Layout.DateToCol(g, p.ClipEnd)
    If c1 = 0 Or c2 = 0 Then Exit Sub

    lineColor = Util.HexToColor(p.LineColorHex, DEFAULT_LINE)

    ' --- データ列 (設計A 4.3) ---
    ws.Cells(r, Layout.COL_NAME).Value = p.Name
    ws.Cells(r, Layout.COL_START).Value = p.DateStart
    ws.Cells(r, Layout.COL_START).NumberFormat = "yyyy/mm/dd"
    ws.Cells(r, Layout.COL_END).Value = p.DateEnd
    ws.Cells(r, Layout.COL_END).NumberFormat = "yyyy/mm/dd"
    ws.Cells(r, Layout.COL_DAYS).Formula = "=NETWORKDAYS(" & _
        ws.Cells(r, Layout.COL_START).Address(False, False) & "," & _
        ws.Cells(r, Layout.COL_END).Address(False, False) & ")"
    ws.Cells(r, g.IdCol).Value = p.ProcId

    ' --- バー本体 (条件付き書式) ---
    Set rng = ws.Range(ws.Cells(r, Layout.FIRST_DATE_COL), ws.Cells(r, g.LastDateCol))

    Select Case p.Shape
        Case "boxS", "boxM", "boxL"
            fillColor = Util.HexToColor(p.BackColorHex, Util.TintColor(lineColor, TINT_RATIO))
            AddBoxRules ws, rng, r, lineColor, fillColor
        Case "barAutoAdjust"
            fillColor = Util.HexToColor(p.BackColorHex, lineColor)
            AddFillRule ws, rng, r, fillColor
        Case "barProcessNameAdjust"
            fillColor = Util.HexToColor(p.BackColorHex, Util.TintColor(lineColor, TINT_RATIO))
            AddFillRule ws, rng, r, fillColor
        Case Else
            ' straight / xElbow / yElbow / crank / gate は下罫線 1 本に落とす。
            ' 折れ線・斜行・縦線は共通仕様 6章で意図的に捨てている。
            AddLineRule ws, rng, r, lineColor, p.DashKind, p.Thickness
    End Select

    ' --- 工程線名は開始セルに (設計A 4.2) ---
    If Len(p.Name) > 0 Then
        ws.Cells(r, c1).Value = p.Name
        ws.Cells(r, c1).Font.Bold = True
        ws.Cells(r, c1).Font.Color = lineColor
        ws.Cells(r, c1).HorizontalAlignment = xlLeft
        ws.Cells(r, c1).WrapText = False
    End If

    ' --- 矢印 ---
    If p.Arrow = "arrow" And p.ClipEnd = p.DateEnd Then
        If c2 + 1 <= g.LastDateCol Then
            If Len(CStr(ws.Cells(r, c2 + 1).Value)) = 0 Then
                ws.Cells(r, c2 + 1).Value = ChrW$(9654)          ' 右向き三角 U+25B6
                ws.Cells(r, c2 + 1).Font.Color = lineColor
                ws.Cells(r, c2 + 1).HorizontalAlignment = xlLeft
            End If
        End If
    End If

    ' --- 終了行が違う場合の行き先マーカー ---
    If p.GridEndRow <> p.GridStartRow And p.GridEndRow >= 1 And p.GridEndRow <= g.MaxGridRow Then
        MarkEndRow ws, Layout.SheetRowOf(p.GridEndRow), c2, lineColor
    End If
End Sub

Private Sub MarkEndRow(ByVal ws As Object, ByVal r As Long, ByVal c As Long, ByVal lineColor As Long)
    If Len(CStr(ws.Cells(r, c).Value)) > 0 Then Exit Sub
    ws.Cells(r, c).Value = ChrW$(9660)                            ' 下向き三角 U+25BC
    ws.Cells(r, c).Font.Color = lineColor
    ws.Cells(r, c).HorizontalAlignment = xlCenter
End Sub

'--- 条件付き書式のルール ---------------------------------------------------
' 式は行 2 の日付と、その行の C/D を見る。日付を直せばバーが動く。

Private Function InRangeFormula(ByVal r As Long) As String
    InRangeFormula = "=AND(F$" & Layout.ROW_DAY & "<>""""," & _
                     "F$" & Layout.ROW_DAY & ">=$C" & r & "," & _
                     "F$" & Layout.ROW_DAY & "<=$D" & r & ")"
End Function

Private Function EqualsFormula(ByVal r As Long, ByVal col As String) As String
    EqualsFormula = "=AND(F$" & Layout.ROW_DAY & "<>""""," & _
                    "F$" & Layout.ROW_DAY & "=$" & col & r & ")"
End Function

Private Sub AddLineRule(ByVal ws As Object, ByVal rng As Object, ByVal r As Long, _
                        ByVal lineColor As Long, ByVal dashKind As String, ByVal thickness As Double)
    Dim fc As Object
    Set fc = rng.FormatConditions.Add(xlExpression, , InRangeFormula(r))
    fc.Borders(xlBottom).LineStyle = LineStyleOf(dashKind)
    fc.Borders(xlBottom).Color = lineColor
    fc.Borders(xlBottom).Weight = WeightOf(thickness)
End Sub

Private Sub AddFillRule(ByVal ws As Object, ByVal rng As Object, ByVal r As Long, ByVal fillColor As Long)
    Dim fc As Object
    Set fc = rng.FormatConditions.Add(xlExpression, , InRangeFormula(r))
    fc.Interior.Color = fillColor
End Sub

' box 系は 塗り + 外枠。左右の枠は開始列 / 終了列だけに出したいので
' ルールを 3 本に分ける (セル単位に別の書式を当てられないため)。
Private Sub AddBoxRules(ByVal ws As Object, ByVal rng As Object, ByVal r As Long, _
                        ByVal lineColor As Long, ByVal fillColor As Long)
    Dim fc As Object

    Set fc = rng.FormatConditions.Add(xlExpression, , EqualsFormula(r, "C"))
    fc.Borders(xlLeft).LineStyle = xlContinuous
    fc.Borders(xlLeft).Color = lineColor

    Set fc = rng.FormatConditions.Add(xlExpression, , EqualsFormula(r, "D"))
    fc.Borders(xlRight).LineStyle = xlContinuous
    fc.Borders(xlRight).Color = lineColor

    Set fc = rng.FormatConditions.Add(xlExpression, , InRangeFormula(r))
    fc.Interior.Color = fillColor
    fc.Borders(xlTop).LineStyle = xlContinuous
    fc.Borders(xlTop).Color = lineColor
    fc.Borders(xlBottom).LineStyle = xlContinuous
    fc.Borders(xlBottom).Color = lineColor
End Sub

Private Function LineStyleOf(ByVal dashKind As String) As Long
    If dashKind = "dash" Then
        LineStyleOf = xlDash
    Else
        LineStyleOf = xlContinuous
    End If
End Function

' 太さ 1 -> 細、2 -> 中、2.5 以上 -> 太 (設計A 4.2)
Private Function WeightOf(ByVal thickness As Double) As Long
    If thickness >= 2.5 Then
        WeightOf = xlThick
    ElseIf thickness >= 2# Then
        WeightOf = xlMedium
    Else
        WeightOf = xlThin
    End If
End Function

'--- 幅・固定 ---------------------------------------------------------------

Private Sub ApplySizes(ByVal ws As Object, ByRef g As Grid)
    ws.Columns(Layout.COL_ROWHEAD).ColumnWidth = 18
    ws.Columns(Layout.COL_NAME).ColumnWidth = 12
    ws.Columns(Layout.COL_START).ColumnWidth = 11
    ws.Columns(Layout.COL_END).ColumnWidth = 11
    ws.Columns(Layout.COL_DAYS).ColumnWidth = 6

    ' 日付列はまとめて設定する。列数は表示期間で変わるので 1 列ずつ触らない。
    ws.Range(ws.Cells(1, Layout.FIRST_DATE_COL), ws.Cells(1, g.LastDateCol)) _
        .EntireColumn.ColumnWidth = 3.5

    ws.Columns(g.IdCol).Hidden = True
End Sub
```

## 6. `src/Export.bas`

業者用 xlsx として別名保存、保護・入力規則・非表示シート

SHA-256: `7b91889ecb8b4abc5a11ccad23d33216cf2e1e8102aa01bdc839389f77fa4b0d`

```vb
Attribute VB_Name = "Export"
Option Explicit
'==============================================================================
' Export - T10_Layout を業者用 xlsx として別名保存する
'
' 出力はマクロなし (FileFormat:=51)。入力 CSV も xlsm も上書きしない
' (共通仕様 8章-3)。同名ファイルがあれば連番を付ける。
'==============================================================================

Public Const SHEET_OUT As String = "工程表"
Public Const SHEET_DATA As String = "_data"

' 業者が直せるのは 開始日 (C) と 終了日 (D) だけ。
' それ以外は全てロックする (共通仕様 7章)。

Public Function ExportXlsx(ByVal srcWs As Object, ByRef ps As ProcSet, ByRef g As Grid, _
                           ByRef t As CsvTable, ByVal headerRow As Long, _
                           ByVal outPath As String) As String
    Dim wb As Object
    Dim ws As Object
    Dim wsData As Object

    srcWs.Copy
    Set wb = Application.ActiveWorkbook
    Set ws = wb.Worksheets(1)
    ws.Name = SHEET_OUT

    Set wsData = wb.Worksheets.Add(, ws)
    wsData.Name = SHEET_DATA
    FillData wsData, ps, t, headerRow

    FreezeHeader ws
    ApplyValidation ws, ps, g
    ProtectSheet ws, ps
    HideData wb, wsData

    SaveAsXlsx wb, outPath
    wb.Close False

    ExportXlsx = outPath
End Function

'--- _data (復路の入口。元 CSV を列ごとそのまま持たせる) ---------------------

Private Sub FillData(ByVal ws As Object, ByRef ps As ProcSet, ByRef t As CsvTable, ByVal headerRow As Long)
    Dim hdr() As String
    Dim row() As String
    Dim nCols As Long
    Dim i As Long
    Dim c As Long
    Dim extra As Variant
    Dim k As Long

    hdr = t.Rows(headerRow)
    nCols = UBound(hdr) - LBound(hdr) + 1

    For c = 0 To nCols - 1
        ws.Cells(1, c + 1).Value = hdr(c)
    Next c

    ' 配置結果を右に足す。復路が「どの工程をどの行に描いたか」を辿れるように。
    extra = Array("配置状態", "割当行", "シート行", "行衝突で移動")
    For k = LBound(extra) To UBound(extra)
        ws.Cells(1, nCols + 1 + k).Value = CStr(extra(k))
    Next k

    ' 工程は CSV 順のまま。行数 = CSV 工程数 (設計A 6章の検査)。
    For i = 0 To ps.Count - 1
        row = t.Rows(headerRow + 1 + ps.Items(i).SrcIndex)
        For c = LBound(row) To UBound(row)
            ws.Cells(i + 2, c + 1).Value = "'" & row(c)
        Next c
        ws.Cells(i + 2, nCols + 1).Value = ps.Items(i).Status
        ws.Cells(i + 2, nCols + 2).Value = ps.Items(i).AssignedGridRow
        ws.Cells(i + 2, nCols + 3).Value = ps.Items(i).SheetRow
        ws.Cells(i + 2, nCols + 4).Value = ps.Items(i).Relocated
    Next i
End Sub

'--- 見出しの固定 -----------------------------------------------------------

Private Sub FreezeHeader(ByVal ws As Object)
    ws.Activate
    ws.Range("B4").Select
    Application.ActiveWindow.FreezePanes = False
    Application.ActiveWindow.SplitRow = Layout.HEADER_ROWS
    Application.ActiveWindow.SplitColumn = Layout.COL_ROWHEAD
    Application.ActiveWindow.FreezePanes = True
End Sub

'--- 入力規則 ---------------------------------------------------------------

' C は 工程表の期間 内の日付、D は C 以上かつ期間内。
' 工程のある行だけに付ける。空行は編集させない。
Private Sub ApplyValidation(ByVal ws As Object, ByRef ps As ProcSet, ByRef g As Grid)
    Dim i As Long
    Dim r As Long
    Dim cStart As Object
    Dim cEnd As Object

    For i = 0 To ps.Count - 1
        If ps.Items(i).Status = STATUS_DRAWN Then
            r = ps.Items(i).SheetRow

            Set cStart = ws.Cells(r, Layout.COL_START)
            cStart.Validation.Delete
            cStart.Validation.Add xlValidateDate, xlValidAlertStop, xlBetween, _
                                  g.PeriodStart, g.PeriodEnd
            cStart.Validation.ErrorTitle = "開始日"
            cStart.Validation.ErrorMessage = "工程表の期間内 (" & Util.Ymd2(g.PeriodStart) & _
                                             " ～ " & Util.Ymd2(g.PeriodEnd) & ") の日付を入れてください。"

            Set cEnd = ws.Cells(r, Layout.COL_END)
            cEnd.Validation.Delete
            cEnd.Validation.Add xlValidateDate, xlValidAlertStop, xlBetween, _
                                cStart.Address(False, False), g.PeriodEnd
            cEnd.Validation.ErrorTitle = "終了日"
            cEnd.Validation.ErrorMessage = "開始日以降で、工程表の期間内 (～ " & _
                                           Util.Ymd2(g.PeriodEnd) & ") の日付を入れてください。"
        End If
    Next i
End Sub

'--- 保護 -------------------------------------------------------------------

Private Sub ProtectSheet(ByVal ws As Object, ByRef ps As ProcSet)
    Dim i As Long
    Dim r As Long

    ws.Cells.Locked = True

    ' 描いた工程の行の C/D だけ開ける。空行と見出しは触らせない。
    For i = 0 To ps.Count - 1
        If ps.Items(i).Status = STATUS_DRAWN Then
            r = ps.Items(i).SheetRow
            ws.Cells(r, Layout.COL_START).Locked = False
            ws.Cells(r, Layout.COL_END).Locked = False
        End If
    Next i

    ws.Protect DrawingObjects:=True, Contents:=True, Scenarios:=True, _
               AllowInsertingRows:=False, AllowDeletingRows:=False, _
               AllowInsertingColumns:=False, AllowDeletingColumns:=False, _
               AllowSorting:=False, AllowFiltering:=False
End Sub

Private Sub HideData(ByVal wb As Object, ByVal wsData As Object)
    wsData.Visible = xlSheetVeryHidden
    wb.Protect Structure:=True, Windows:=False
End Sub

'--- 保存 -------------------------------------------------------------------

Private Sub SaveAsXlsx(ByVal wb As Object, ByVal path As String)
    Dim prev As Boolean
    prev = Application.DisplayAlerts
    Application.DisplayAlerts = False
    wb.SaveAs Filename:=path, FileFormat:=51
    Application.DisplayAlerts = prev
End Sub

' <CSV名>_<Start>-<End>.xlsx。既にあれば _2, _3 ... を付けて上書きしない。
Public Function UniqueOutPath(ByVal csvPath As String, ByVal dStart As Date, ByVal dEnd As Date) As String
    Dim folder As String
    Dim base As String
    Dim stem As String
    Dim candidate As String
    Dim n As Long

    folder = Util.FolderOf(csvPath)
    base = Util.BaseNameOf(csvPath)
    stem = base & "_" & Util.Ymd(dStart) & "-" & Util.Ymd(dEnd)

    candidate = Util.JoinPath(folder, stem & ".xlsx")
    n = 1
    Do While Util.FileExistsAt(candidate)
        n = n + 1
        candidate = Util.JoinPath(folder, stem & "_" & n & ".xlsx")
    Loop

    UniqueOutPath = candidate
End Function
```

## 7. `src/Verify.bas`

出力 xlsx を読み戻して機械検査

SHA-256: `c7219a41e7208ac34bc5314d4ec21b6b4a90298fe5f4196f5b2fe3b38f1c9bfc`

```vb
Attribute VB_Name = "Verify"
Option Explicit
'==============================================================================
' Verify - 出力 xlsx を読み戻して機械検査する (設計A 6章)
'
' 目視は最終確認であって合否の根拠にしない (共通仕様 8章-4)。
' 合否はすべてセル値・セル書式・CSV 値の突き合わせで決める。
'
' 検査は「出力ファイルから読み直した値」だけを使う。描画側と同じ関数で
' 期待値を作ると、描画側がずれたときに検査も一緒にずれて素通りする。
' 行の期待値 (+3) も Layout ではなく本モジュールの定数で持つ。
'
' バーは条件付き書式で描いているので、塗り / 罫線は DisplayFormat
' (条件付き書式の評価結果) で読む。Excel が実際に表示している書式そのもの。
'==============================================================================

' 共通仕様 4章「行 r+3」。描画側の定数とは別に持ち、片方だけずれたら気づけるようにする。
Private Const EXPECTED_HEADER_ROWS As Long = 3

' 出力シートの日付列の右隣 = 工程ID を隠している列。ファイルから求める。
Private Function FindIdCol(ByVal ws As Object) As Long
    Dim c As Long
    c = Layout.FIRST_DATE_COL
    Do While Len(CStr(ws.Cells(Layout.ROW_DAY, c).Value)) > 0
        c = c + 1
    Loop
    FindIdCol = c
End Function

Private Function LastUsedRow(ByVal ws As Object) As Long
    LastUsedRow = ws.UsedRange.Row + ws.UsedRange.Rows.Count - 1
End Function

' 出力ファイルの工程ID 列を走査して、各工程が実際に何行目にいるかを得る。
Private Function ResolveRows(ByVal ws As Object, ByVal idCol As Long, ByVal lastRow As Long, _
                             ByRef ps As ProcSet) As Variant
    Dim rows() As Long
    Dim i As Long
    Dim r As Long
    Dim id As String
    Dim missing As Long

    ReDim rows(0 To ps.Count)
    For i = 0 To ps.Count - 1
        rows(i) = 0
    Next i

    For r = EXPECTED_HEADER_ROWS + 1 To lastRow
        id = CStr(ws.Cells(r, idCol).Value)
        If Len(id) > 0 Then
            ' 工程ID が重複する CSV でも取り違えないよう、未割当の先頭に当てる
            For i = 0 To ps.Count - 1
                If ps.Items(i).ProcId = id And rows(i) = 0 Then
                    rows(i) = r
                    Exit For
                End If
            Next i
        End If
    Next r

    For i = 0 To ps.Count - 1
        If ps.Items(i).Status = STATUS_DRAWN And rows(i) = 0 Then
            missing = missing + 1
            Util.LogNg "行: 工程ID=" & ps.Items(i).ProcId & " が出力シートに見つかりません"
        End If
    Next i

    ResolveRows = rows
End Function

' _data から 割当行 / 行衝突で移動 を読む。行の期待値をモデルではなく
' 出力ファイル側から取るため。
Private Function DataLong(ByVal wsData As Object, ByRef hdr As StrMap, _
                          ByVal rowIndex As Long, ByVal colName As String) As Long
    Dim c As Long
    c = Util.MapGet(hdr, colName)
    If c < 0 Then
        DataLong = -1
        Exit Function
    End If
    On Error GoTo Bad
    DataLong = CLng(wsData.Cells(rowIndex + 2, c).Value)
    Exit Function
Bad:
    DataLong = -1
End Function

Private Function DataHeaderMap(ByVal wsData As Object) As StrMap
    Dim hdr As StrMap
    Dim i As Long
    Util.MapInit hdr
    i = 1
    Do While Len(CStr(wsData.Cells(1, i).Value)) > 0
        Util.MapAdd hdr, CStr(wsData.Cells(1, i).Value), i
        i = i + 1
    Loop
    DataHeaderMap = hdr
End Function

Public Function VerifyOutput(ByVal outPath As String, ByRef ps As ProcSet, ByRef g As Grid, _
                             ByRef t As CsvTable, ByVal headerRow As Long) As Boolean
    Dim wb As Object
    Dim ws As Object
    Dim wsData As Object
    Dim before As Long
    Dim idCol As Long
    Dim lastRow As Long
    Dim rows As Variant

    before = Util.LogNgCount()

    Util.LogLine ""
    Util.LogLine Util.LOG_SEP
    Util.LogLine "機械検査 (設計A 6章)"
    Util.LogLine Util.LOG_SEP

    Set wb = Application.Workbooks.Open(outPath, , True)
    On Error GoTo Cleanup

    Set ws = wb.Worksheets(Export.SHEET_OUT)
    Set wsData = wb.Worksheets(Export.SHEET_DATA)

    idCol = FindIdCol(ws)
    lastRow = LastUsedRow(ws)
    rows = ResolveRows(ws, idCol, lastRow, ps)

    CheckCounts ps
    CheckHeader ws, g
    CheckRowsAndData ws, wsData, ps, rows
    CheckPositions ws, ps, g, rows
    CheckDataSheet wsData, ps, t, headerRow
    CheckProtection ws, ps, rows

Cleanup:
    If Err.Number <> 0 Then
        Util.LogNg "検査中にエラーが発生しました: " & Err.Number & " " & Err.Description
        Err.Clear
    End If
    On Error Resume Next
    wb.Close False
    On Error GoTo 0

    VerifyOutput = (Util.LogNgCount() = before)
End Function

'--- 件数 -------------------------------------------------------------------

' 描いた工程数 + 期間外除外数 + 削除除外数 = CSV 工程数
Private Sub CheckCounts(ByRef ps As ProcSet)
    Dim i As Long
    Dim nDrawn As Long
    Dim nOut As Long
    Dim nDel As Long

    For i = 0 To ps.Count - 1
        Select Case ps.Items(i).Status
            Case STATUS_DRAWN:   nDrawn = nDrawn + 1
            Case STATUS_OUTSIDE: nOut = nOut + 1
            Case STATUS_DELETED: nDel = nDel + 1
        End Select
    Next i

    If nDrawn + nOut + nDel = ps.Count Then
        Util.LogOk "件数: 描画 " & nDrawn & " + 期間外 " & nOut & " + 削除 " & nDel & _
                   " = CSV 工程数 " & ps.Count
    Else
        Util.LogNg "件数: 描画 " & nDrawn & " + 期間外 " & nOut & " + 削除 " & nDel & _
                   " が CSV 工程数 " & ps.Count & " と一致しません"
    End If
End Sub

'--- ヘッダー ---------------------------------------------------------------

' 日付列数 = End - Start + 1、行 2 の値が連続日付
Private Sub CheckHeader(ByVal ws As Object, ByRef g As Grid)
    Dim n As Long
    Dim c As Long
    Dim v As Variant
    Dim bad As Long
    Dim expect As Long

    expect = CLng(g.PeriodEnd - g.PeriodStart) + 1
    If g.DayCount = expect Then
        Util.LogOk "ヘッダー: 日付列数 " & g.DayCount & " = End - Start + 1"
    Else
        Util.LogNg "ヘッダー: 日付列数 " & g.DayCount & " が End - Start + 1 = " & expect & " と違います"
    End If

    bad = 0
    For n = 0 To g.DayCount - 1
        c = Layout.DateCol(n)
        v = ws.Cells(Layout.ROW_DAY, c).Value
        If Not IsDate(v) Then
            bad = bad + 1
        ElseIf CDate(v) <> g.PeriodStart + n Then
            bad = bad + 1
        End If
    Next n

    ' 日付列の右隣が空であること (列数がちょうどであることの裏取り)
    If Len(CStr(ws.Cells(Layout.ROW_DAY, g.LastDateCol + 1).Value)) > 0 Then
        bad = bad + 1
    End If

    If bad = 0 Then
        Util.LogOk "ヘッダー: 行 " & Layout.ROW_DAY & " が " & Util.Ymd2(g.PeriodStart) & _
                   " から " & Util.Ymd2(g.PeriodEnd) & " の連続日付"
    Else
        Util.LogNg "ヘッダー: 行 " & Layout.ROW_DAY & " の日付が " & bad & " 箇所ずれています"
    End If
End Sub

'--- 行 と データ列 ---------------------------------------------------------

Private Sub CheckRowsAndData(ByVal ws As Object, ByVal wsData As Object, _
                             ByRef ps As ProcSet, ByVal rowsV As Variant)
    Dim hdr As StrMap
    Dim rows() As Long
    Dim i As Long
    Dim p As ProcRec
    Dim r As Long
    Dim assigned As Long
    Dim moved As Long
    Dim expect As Long
    Dim badRow As Long
    Dim badData As Long
    Dim nReloc As Long
    Dim vS As Variant
    Dim vE As Variant

    rows = rowsV
    hdr = DataHeaderMap(wsData)

    For i = 0 To ps.Count - 1
        p = ps.Items(i)
        If p.Status = STATUS_DRAWN And rows(i) > 0 Then
            r = rows(i)

            ' 期待値は _data (出力ファイル) から取る。描画側の計算は使わない。
            assigned = DataLong(wsData, hdr, p.SrcIndex, "割当行")
            moved = DataLong(wsData, hdr, p.SrcIndex, "行衝突で移動")

            If assigned < 0 Then
                badRow = badRow + 1
                Util.LogNg "行: 工程ID=" & p.ProcId & " の割当行を _data から読めません"
            Else
                If assigned = p.GridStartRow Then
                    expect = p.GridStartRow + EXPECTED_HEADER_ROWS
                Else
                    nReloc = nReloc + 1
                    expect = assigned + EXPECTED_HEADER_ROWS
                    If moved = 0 Then
                        badRow = badRow + 1
                        Util.LogNg "行: 工程ID=" & p.ProcId & " は行を移しているのに _data の" & _
                                   " 行衝突で移動 が False です"
                    End If
                End If

                If r <> expect Then
                    badRow = badRow + 1
                    Util.LogNg "行: 工程ID=" & p.ProcId & " は出力の " & r & " 行目にいますが、" & _
                               "期待は 開始日の行番号(" & p.GridStartRow & ") + " & _
                               EXPECTED_HEADER_ROWS & " = " & expect & " です"
                End If
            End If

            ' データ列: C/D が CSV の 開始日 / 終了日
            vS = ws.Cells(r, Layout.COL_START).Value
            vE = ws.Cells(r, Layout.COL_END).Value
            If Not IsDate(vS) Then
                badData = badData + 1
                Util.LogNg "データ列: 工程ID=" & p.ProcId & " の C が日付ではありません"
            ElseIf CDate(vS) <> p.DateStart Then
                badData = badData + 1
                Util.LogNg "データ列: 工程ID=" & p.ProcId & " の C=" & Util.Ymd2(CDate(vS)) & _
                           " が CSV の開始日 " & Util.Ymd2(p.DateStart) & " と違います"
            End If
            If Not IsDate(vE) Then
                badData = badData + 1
                Util.LogNg "データ列: 工程ID=" & p.ProcId & " の D が日付ではありません"
            ElseIf CDate(vE) <> p.DateEnd Then
                badData = badData + 1
                Util.LogNg "データ列: 工程ID=" & p.ProcId & " の D=" & Util.Ymd2(CDate(vE)) & _
                           " が CSV の終了日 " & Util.Ymd2(p.DateEnd) & " と違います"
            End If
        End If
    Next i

    If badRow = 0 Then
        Util.LogOk "行: 出力ファイル上の行が 開始日の行番号 + " & EXPECTED_HEADER_ROWS & _
                   " と一致 (行衝突で移した " & nReloc & " 件は _data の割当行と一致)"
    End If
    If badData = 0 Then
        Util.LogOk "データ列: 全工程の C/D が CSV の開始日/終了日と一致"
    End If
End Sub

'--- 位置 -------------------------------------------------------------------

' 塗り / 罫線の最初の列の日付 = 開始日、最後の列の日付 = 終了日。
' 期間端でクリップされた工程はクリップ後の日付で判定する。
Private Sub CheckPositions(ByVal ws As Object, ByRef ps As ProcSet, ByRef g As Grid, _
                           ByVal rowsV As Variant)
    Dim rows() As Long
    Dim i As Long
    Dim p As ProcRec
    Dim c As Long
    Dim firstC As Long
    Dim lastC As Long
    Dim bad As Long
    Dim wantFill As Boolean
    Dim wantColor As Long

    rows = rowsV
    For i = 0 To ps.Count - 1
        p = ps.Items(i)
        If p.Status = STATUS_DRAWN And rows(i) > 0 Then

            wantFill = IsFilledShape(p.Shape)
            wantColor = ExpectedPaintColor(p)

            firstC = 0
            lastC = 0
            For c = Layout.FIRST_DATE_COL To g.LastDateCol
                If IsPainted(ws.Cells(rows(i), c), wantFill, wantColor) Then
                    If firstC = 0 Then firstC = c
                    lastC = c
                End If
            Next c

            If firstC = 0 Then
                bad = bad + 1
                Util.LogNg "位置: 工程ID=" & p.ProcId & " (" & p.Name & ") のバーが 1 列も描かれていません"
            Else
                If Layout.ColDate(g, firstC) <> p.ClipStart Then
                    bad = bad + 1
                    Util.LogNg "位置: 工程ID=" & p.ProcId & " の最初の列が " & _
                               Util.Ymd2(Layout.ColDate(g, firstC)) & "、開始日は " & Util.Ymd2(p.ClipStart)
                End If
                If Layout.ColDate(g, lastC) <> p.ClipEnd Then
                    bad = bad + 1
                    Util.LogNg "位置: 工程ID=" & p.ProcId & " の最後の列が " & _
                               Util.Ymd2(Layout.ColDate(g, lastC)) & "、終了日は " & Util.Ymd2(p.ClipEnd)
                End If
            End If
        End If
    Next i

    If bad = 0 Then
        Util.LogOk "位置: 全工程のバーが 開始日 の列に始まり 終了日 の列で終わる"
    End If
End Sub

Private Function IsFilledShape(ByVal shape As String) As Boolean
    Select Case shape
        Case "boxS", "boxM", "boxL", "barAutoAdjust", "barProcessNameAdjust"
            IsFilledShape = True
        Case Else
            IsFilledShape = False
    End Select
End Function

Private Function ExpectedPaintColor(ByRef p As ProcRec) As Long
    Dim lineColor As Long
    lineColor = Util.HexToColor(p.LineColorHex, 0)
    Select Case p.Shape
        Case "boxS", "boxM", "boxL", "barProcessNameAdjust"
            ExpectedPaintColor = Util.HexToColor(p.BackColorHex, Util.TintColor(lineColor, 0.25))
        Case "barAutoAdjust"
            ExpectedPaintColor = Util.HexToColor(p.BackColorHex, lineColor)
        Case Else
            ExpectedPaintColor = lineColor
    End Select
End Function

' DisplayFormat は条件付き書式を適用したあとの、実際に見えている書式。
Private Function IsPainted(ByVal cell As Object, ByVal wantFill As Boolean, ByVal wantColor As Long) As Boolean
    If wantFill Then
        IsPainted = (cell.DisplayFormat.Interior.Color = wantColor)
    Else
        If cell.DisplayFormat.Borders(xlEdgeBottom).LineStyle = xlLineStyleNone Then
            IsPainted = False
        Else
            IsPainted = (cell.DisplayFormat.Borders(xlEdgeBottom).Color = wantColor)
        End If
    End If
End Function

'--- _data ------------------------------------------------------------------

' 行数 = CSV 工程数、工程ID が全件一致
Private Sub CheckDataSheet(ByVal ws As Object, ByRef ps As ProcSet, ByRef t As CsvTable, ByVal headerRow As Long)
    Dim hdr As StrMap
    Dim idCol As Long
    Dim i As Long
    Dim nRows As Long
    Dim bad As Long
    Dim v As String

    ' _data の見出しも名前で引く (共通仕様 8章-5)
    Util.MapInit hdr
    i = 1
    Do While Len(CStr(ws.Cells(1, i).Value)) > 0
        Util.MapAdd hdr, CStr(ws.Cells(1, i).Value), i
        i = i + 1
    Loop
    idCol = Util.MapGet(hdr, "工程ID")

    If idCol < 0 Then
        Util.LogNg "_data: 工程ID 列が見つかりません"
        Exit Sub
    End If

    nRows = 0
    Do While Len(CStr(ws.Cells(nRows + 2, idCol).Value)) > 0
        nRows = nRows + 1
    Loop

    If nRows = ps.Count Then
        Util.LogOk "_data: 行数 " & nRows & " = CSV 工程数 " & ps.Count
    Else
        Util.LogNg "_data: 行数 " & nRows & " が CSV 工程数 " & ps.Count & " と違います"
    End If

    For i = 0 To ps.Count - 1
        v = CStr(ws.Cells(i + 2, idCol).Value)
        If v <> ps.Items(i).ProcId Then
            bad = bad + 1
            Util.LogNg "_data: " & (i + 2) & " 行目の工程ID が " & v & "、CSV は " & ps.Items(i).ProcId
        End If
    Next i

    If bad = 0 Then Util.LogOk "_data: 工程ID が CSV と全件一致"

    If ws.Visible = xlSheetVeryHidden Then
        Util.LogOk "_data: 非表示 (xlSheetVeryHidden)"
    Else
        Util.LogNg "_data: 非表示になっていません"
    End If
End Sub

'--- 保護 -------------------------------------------------------------------

' シート保護が有効、C/D 以外がロック
Private Sub CheckProtection(ByVal ws As Object, ByRef ps As ProcSet, ByVal rowsV As Variant)
    Dim rows() As Long
    Dim i As Long
    Dim r As Long
    Dim badOpen As Long
    Dim badLock As Long

    If ws.ProtectContents Then
        Util.LogOk "保護: シート保護が有効"
    Else
        Util.LogNg "保護: シート保護が有効になっていません"
    End If

    For i = 0 To ps.Count - 1
        If ps.Items(i).Status = STATUS_DRAWN Then
            r = ps.Items(i).SheetRow

            If ws.Cells(r, Layout.COL_START).Locked Then badOpen = badOpen + 1
            If ws.Cells(r, Layout.COL_END).Locked Then badOpen = badOpen + 1

            If Not ws.Cells(r, Layout.COL_ROWHEAD).Locked Then badLock = badLock + 1
            If Not ws.Cells(r, Layout.COL_NAME).Locked Then badLock = badLock + 1
            If Not ws.Cells(r, Layout.COL_DAYS).Locked Then badLock = badLock + 1
            If Not ws.Cells(r, Layout.FIRST_DATE_COL).Locked Then badLock = badLock + 1
        End If
    Next i

    If badOpen = 0 Then
        Util.LogOk "保護: 全工程行の C/D が編集可"
    Else
        Util.LogNg "保護: C/D がロックされたままの箇所が " & badOpen & " 件あります"
    End If

    If badLock = 0 Then
        Util.LogOk "保護: C/D 以外 (A/B/E/日付列) がロック"
    Else
        Util.LogNg "保護: ロックされていない箇所が " & badLock & " 件あります"
    End If
End Sub
```

## 8. `src/Main.bas`

00_Control の操作と変換の全体進行

SHA-256: `5c8f83526e3048525e16c3c9d39dc32fa67866f99d2a680093a3b19ba3060610`

```vb
Attribute VB_Name = "Main"
Option Explicit
'==============================================================================
' Main - 00_Control の操作と変換の全体進行
'
' CSV 選択 -> Start/End 入力 -> 変換実行 -> xlsx を別名保存 -> 機械検査 -> ログ
'==============================================================================

Public Const TOOL_VERSION As String = "A-1.0.0"

Public Const SH_CONTROL As String = "00_Control"
Public Const SH_AUDIT As String = "T09_Audit"
Public Const SH_LAYOUT As String = "T10_Layout"
Public Const SH_HELP As String = "使い方"

' 00_Control の入力位置 (設計A 3章)
Public Const CELL_CSV As String = "B3"
Public Const CELL_START As String = "B5"
Public Const CELL_END As String = "E5"
Public Const CELL_RESULT As String = "B9"
Public Const CELL_VERSION As String = "B14"

Public Const LOG_NAME As String = "変換ログ.txt"
Public Const DEFAULT_SPAN_DAYS As Long = 40      ' 既定の表示期間 (設計A 7章)

Private Const CSV_META_HEADER_ROW As Long = 0
Private Const CSV_DATA_HEADER_ROW As Long = 2    ' 3 行目が工程データ見出し
Private Const CSV_DATA_FIRST_ROW As Long = 3

'==============================================================================
' 入口
'==============================================================================

Public Sub Auto_Open()
    On Error Resume Next
    EnsureUi
    ThisWorkbook.Saved = True
End Sub

' CSV を選ぶ。選んだら メタの期間から Start/End の既定値も入れる。
Public Sub SelectCsv()
    Dim ws As Object
    Dim picked As Variant
    Dim t As CsvTable
    Dim pStart As Date
    Dim pEnd As Date
    Dim dEnd As Date

    Set ws = ThisWorkbook.Worksheets(SH_CONTROL)
    picked = Application.GetOpenFilename("CSV ファイル (*.csv),*.csv", , "プロジェクトG の工程表 CSV を選んでください")
    If VarType(picked) = vbBoolean Then Exit Sub

    ws.Range(CELL_CSV).Value = CStr(picked)

    t = CsvReader.LoadCsv(CStr(picked))
    If CsvReader.MetaPeriod(t, pStart, pEnd) Then
        dEnd = pStart + DEFAULT_SPAN_DAYS - 1
        If dEnd > pEnd Then dEnd = pEnd
        ws.Range(CELL_START).Value = pStart
        ws.Range(CELL_END).Value = dEnd
        ws.Range(CELL_START).NumberFormat = "yyyy/mm/dd"
        ws.Range(CELL_END).NumberFormat = "yyyy/mm/dd"
    End If

    ws.Range(CELL_RESULT).Value = "CSV を選びました。Start / End を確認して「変換実行」を押してください。"
End Sub

' 変換実行。00_Control の値だけを見る。
Public Sub RunConversion()
    Dim ws As Object
    Dim csvPath As String
    Dim dStart As Date
    Dim dEnd As Date
    Dim result As String

    Set ws = ThisWorkbook.Worksheets(SH_CONTROL)
    ws.Range(CELL_VERSION).Value = TOOL_VERSION

    csvPath = Trim$(CStr(ws.Range(CELL_CSV).Value))
    If Not IsDate(ws.Range(CELL_START).Value) Then
        ws.Range(CELL_RESULT).Value = "Start が日付ではありません。"
        Exit Sub
    End If
    If Not IsDate(ws.Range(CELL_END).Value) Then
        ws.Range(CELL_RESULT).Value = "End が日付ではありません。"
        Exit Sub
    End If
    dStart = CDate(ws.Range(CELL_START).Value)
    dEnd = CDate(ws.Range(CELL_END).Value)

    result = Convert(csvPath, dStart, dEnd)
    ws.Range(CELL_RESULT).Value = result
End Sub

'==============================================================================
' 変換本体。テストから直接呼べるよう、UI に触らない形で分けてある。
'==============================================================================

Public Function Convert(ByVal csvPath As String, ByVal dStart As Date, ByVal dEnd As Date) As String
    Dim t As CsvTable
    Dim hdr As StrMap
    Dim ps As ProcSet
    Dim g As Grid
    Dim pStart As Date
    Dim pEnd As Date
    Dim outPath As String
    Dim logPath As String
    Dim passed As Boolean
    Dim prevCalc As Long
    Dim msg As String

    Util.LogReset
    Util.LogLine "プロジェクトG 工程表変換 (設計A 往路) " & TOOL_VERSION
    Util.LogLine "実行日時: " & Format$(Now, "yyyy/mm/dd hh:nn:ss")
    Util.LogLine Util.LOG_SEP

    '--- 入力の確認 ---
    If Not Util.FileExistsAt(csvPath) Then
        Convert = "CSV が見つかりません: " & csvPath
        Exit Function
    End If
    If dStart > dEnd Then
        Convert = "Start が End より後です。"
        Exit Function
    End If

    Util.LogLine "入力 CSV: " & csvPath
    Util.LogLine "表示期間: " & Util.Ymd2(dStart) & " ～ " & Util.Ymd2(dEnd) & _
                 " (" & (CLng(dEnd - dStart) + 1) & " 日)"

    '--- 読み込み ---
    t = CsvReader.LoadCsv(csvPath)
    If t.Count <= CSV_DATA_FIRST_ROW Then
        Convert = "CSV に工程データ行がありません。"
        Exit Function
    End If

    If CsvReader.MetaPeriod(t, pStart, pEnd) Then
        Util.LogLine "工程表の期間 (CSV メタ): " & Util.Ymd2(pStart) & " ～ " & Util.Ymd2(pEnd)
        If dStart < pStart Or dEnd > pEnd Then
            Convert = "表示期間が 工程表の期間 (" & Util.Ymd2(pStart) & " ～ " & _
                      Util.Ymd2(pEnd) & ") の外に出ています。"
            Exit Function
        End If
    Else
        Util.LogLine "警告 工程表の期間 をメタ行から読めませんでした。期間の妥当性検査は省略します。"
        pStart = dStart
        pEnd = dEnd
    End If

    hdr = CsvReader.BuildHeaderMap(t, CSV_DATA_HEADER_ROW)
    Util.LogLine "工程データ見出し: " & hdr.Count & " 列"
    If Not Model.CheckColumns(hdr) Then
        Convert = "必須列が足りません。変換ログを見てください。"
        Exit Function
    End If

    ps = Model.LoadProcs(t, hdr, CSV_DATA_FIRST_ROW)
    Util.LogLine "読み込み工程数: " & ps.Count & " 件"
    Model.WarnUnsupported ps
    Model.WarnDuplicateIds ps

    '--- 配置 ---
    Layout.ClassifyProcs ps, dStart, dEnd
    g = Layout.BuildGrid(ps, dStart, dEnd)
    g.PeriodStart = dStart
    g.PeriodEnd = dEnd
    Layout.AssignRows ps, g
    g.LastDateCol = Layout.FIRST_DATE_COL + g.DayCount - 1
    g.IdCol = g.LastDateCol + 1
    Util.LogLine "再現する プロジェクトG の行: 1 ～ " & g.MaxGridRow

    '--- 描画 ---
    prevCalc = Application.Calculation
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual

    FillAudit ps
    Render.RenderLayout ThisWorkbook.Worksheets(SH_LAYOUT), ps, g

    Application.Calculation = prevCalc
    Application.ScreenUpdating = True

    '--- 出力 ---
    outPath = Export.UniqueOutPath(csvPath, dStart, dEnd)
    Export.ExportXlsx ThisWorkbook.Worksheets(SH_LAYOUT), ps, g, t, CSV_DATA_HEADER_ROW, outPath
    Util.LogLine "出力 xlsx: " & outPath

    '--- 検査 ---
    passed = Verify.VerifyOutput(outPath, ps, g, t, CSV_DATA_HEADER_ROW)

    Util.LogLine ""
    Util.LogLine Util.LOG_SEP
    If passed Then
        Util.LogLine "合格"
        msg = "合格 → " & outPath
    Else
        Util.LogLine "不合格 (NG " & Util.LogNgCount() & " 件)"
        msg = "不合格 (NG " & Util.LogNgCount() & " 件) 変換ログを見てください。xlsx は残してあります → " & outPath
    End If
    Util.LogLine Util.LOG_SEP

    logPath = Util.JoinPath(Util.FolderOf(csvPath), LOG_NAME)
    Util.WriteTextUtf8 logPath, Util.LogText()

    Convert = msg
End Function

'==============================================================================
' T09_Audit
'==============================================================================

Private Sub FillAudit(ByRef ps As ProcSet)
    Dim ws As Object
    Dim cols As Variant
    Dim i As Long
    Dim c As Long

    Set ws = ThisWorkbook.Worksheets(SH_AUDIT)
    ws.Cells.Clear

    cols = Model.AuditHeaders()
    For c = LBound(cols) To UBound(cols)
        ws.Cells(1, c + 1).Value = CStr(cols(c))
    Next c
    ws.Range(ws.Cells(1, 1), ws.Cells(1, UBound(cols) + 1)).Font.Bold = True

    For i = 0 To ps.Count - 1
        For c = LBound(cols) To UBound(cols)
            ws.Cells(i + 2, c + 1).Value = Model.AuditValue(ps.Items(i), CStr(cols(c)))
        Next c
        ws.Cells(i + 2, 5).NumberFormat = "yyyy/mm/dd"
        ws.Cells(i + 2, 6).NumberFormat = "yyyy/mm/dd"
    Next i
End Sub

'==============================================================================
' ボタン。初回に開いたときだけ作る。
'==============================================================================

Public Sub EnsureUi()
    Dim ws As Object
    Set ws = ThisWorkbook.Worksheets(SH_CONTROL)
    AddButtonIfMissing ws, "btnSelectCsv", "CSV 選択", "SelectCsv", 430, 30, 110, 24
    AddButtonIfMissing ws, "btnRun", "変換実行", "RunConversion", 430, 62, 110, 24
End Sub

Private Sub AddButtonIfMissing(ByVal ws As Object, ByVal shapeName As String, ByVal caption As String, _
                               ByVal macroName As String, ByVal l As Double, ByVal t As Double, _
                               ByVal w As Double, ByVal h As Double)
    Dim shp As Object
    Dim i As Long

    For i = 1 To ws.Shapes.Count
        If ws.Shapes(i).Name = shapeName Then Exit Sub
    Next i

    Set shp = ws.Shapes.AddFormControl(xlButtonControl, l, t, w, h)
    shp.Name = shapeName
    shp.OnAction = macroName
    shp.TextFrame.Characters.Text = caption
End Sub
```

## 9. `build/msovba.py`

MS-OVBA の圧縮・データ暗号化・CFB の書き出し

SHA-256: `07f8c2f3812f34c02a39658fd58e8dc1d96ac9a09471fe0d1b6c940fa7e981c8`

```python
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
```

## 10. `build/build_vba.py`

dir / PROJECT / PROJECTwm を組んで vbaProject.bin を作る

SHA-256: `195813238768a7b86dc48176b6ba217c04f85ae70c3f6b2d180d78946efab14d`

```python
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
```

## 11. `build/build_xlsm.py`

openpyxl でブックを作り zip に vbaProject.bin を注入

SHA-256: `68469bc9534397d7e8447f5ea0a70ff6a1fcf541351c142755fe440dd25464c0`

```python
# -*- coding: utf-8 -*-
"""プロジェクトG変換ツール.xlsm を組み立てる。

openpyxl で 4 シートのブックを作り、zip を開いて vbaProject.bin と
関連する content-types / relationship を差し込む (openpyxl 単体では
マクロ有効ブックを新規に作れないため)。
"""
import os, sys, shutil, zipfile, re, datetime
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_vba

TOOL_VERSION = "A-1.0.0"

SHEETS = [("00_Control", "Sheet1"), ("T09_Audit", "Sheet2"),
          ("T10_Layout", "Sheet3"), ("使い方", "Sheet4")]

HOWTO = [
    ("プロジェクトG 工程表変換ツール（設計A 往路）使い方", True),
    ("", False),
    ("■ 配布物を開くまで", True),
    ("1. 受け取った ZIP を右クリック → プロパティ → 全般タブ下部の「セキュリティ:」で", False),
    ("   「許可する」にチェック → OK。（Mark of the Web の解除。これをしないと", False),
    ("   展開した xlsm が保護ビューで開き、マクロが動きません）", False),
    ("2. ZIP を展開する。展開後のフォルダーから xlsm を開く。", False),
    ("3. 「コンテンツの有効化」を押してマクロを有効にする。", False),
    ("", False),
    ("■ 変換の手順", True),
    ("4. 00_Control シートの「CSV 選択」ボタンで プロジェクトG の CSV を選ぶ。", False),
    ("   （ボタンが出ていないときは Alt+F8 → SelectCsv → 実行）", False),
    ("5. Start / End を確認する。既定は CSV の「工程表の期間」の先頭から 40 日。", False),
    ("   Start ≤ End、かつ「工程表の期間」の中に収まっている必要がある。", False),
    ("6. 「変換実行」ボタンを押す。（Alt+F8 → RunConversion でも同じ）", False),
    ("7. CSV と同じフォルダーに次の 2 つができる。", False),
    ("     ・<CSV名>_<Start>-<End>.xlsx … 業者に送るファイル（マクロなし）", False),
    ("     ・変換ログ.txt … 読み込み件数・除外件数・機械検査の結果", False),
    ("8. 変換ログ.txt の末尾が「合格」であることを確認してから業者に送る。", False),
    ("   「不合格」のときは NG 行に理由が出ている。xlsx は消さずに残してある。", False),
    ("", False),
    ("■ 出力 xlsx について（業者向けの説明）", True),
    ("・直してよいのは C 列（開始日）と D 列（終了日）だけ。他はロックしてある。", False),
    ("・日付を直すとバーが自動で動く（条件付き書式で描いているため）。", False),
    ("・行の挿入・削除・並べ替えはできない。プロジェクトG の行番号と対応が取れなくなるため。", False),
    ("・スマホ / タブレットの Excel でも開ける。マクロは入っていない。", False),
    ("", False),
    ("■ 仕様上の注意", True),
    ("・S / M / L は プロジェクトG 上のバーの高さの違い。Excel では同じ高さで描く。", False),
    ("・折れ線・斜行・crank / gate の縦線・ノードの丸・関係線は描かない。", False),
    ("  xlsx は業者が日程を直すためのガント投影であり、意図的に落としている。", False),
    ("・終了行が開始行と違う工程は、終了行側に ▼ を置いて行き先だけ示す。", False),
    ("・土日は灰色。祝日は v1 では扱わない（プロジェクトG の画面では祝日も灰色になる）。", False),
    ("・0.5 日・詳細工程列・復路は v1 では扱わない。", False),
    ("・同じ行に 2 本以上の工程が始まる場合、2 本目以降は次の空行に落とし、", False),
    ("  変換ログに「警告 行衝突」として出す。上書きはしない。", False),
]

def build_workbook(path):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, code in SHEETS:
        ws = wb.create_sheet(name)
        ws.sheet_properties.codeName = code
    wb.code_name = "ThisWorkbook"

    ctl = wb["00_Control"]
    ctl["A1"] = "プロジェクトG 工程表変換ツール（設計A 往路）"
    ctl["A1"].font = Font(bold=True, size=14)
    ctl["A3"] = "CSV パス"
    ctl["A5"] = "Start"
    ctl["D5"] = "End"
    ctl["A7"] = "※ Start / End は「工程表の期間」の中で指定する。既定は先頭から 40 日。"
    ctl["A9"] = "結果"
    ctl["A11"] = "ボタンが出ていないときは Alt+F8 から SelectCsv / RunConversion を実行する。"
    ctl["A12"] = "詳しい手順は「使い方」シート。"
    ctl["A14"] = "版"
    ctl["B14"] = TOOL_VERSION
    for a in ("A3", "A5", "D5", "A9", "A14"):
        ctl[a].font = Font(bold=True)
    fill = PatternFill("solid", start_color="FFF6E0", end_color="FFF6E0")
    thin = Side(style="thin", color="BFBFBF")
    for a in ("B3", "B5", "E5"):
        ctl[a].fill = fill
        ctl[a].border = Border(left=thin, right=thin, top=thin, bottom=thin)
    ctl["B5"].number_format = "yyyy/mm/dd"
    ctl["E5"].number_format = "yyyy/mm/dd"
    ctl["B9"].alignment = Alignment(wrap_text=False)
    ctl.column_dimensions["A"].width = 12
    ctl.column_dimensions["B"].width = 58
    ctl.column_dimensions["C"].width = 3
    ctl.column_dimensions["D"].width = 8
    ctl.column_dimensions["E"].width = 16

    hlp = wb["使い方"]
    for i, (text, bold) in enumerate(HOWTO, start=1):
        hlp.cell(i, 1).value = text
        if bold:
            hlp.cell(i, 1).font = Font(bold=True)
    hlp.column_dimensions["A"].width = 100

    wb["T09_Audit"]["A1"] = "（変換実行で自動生成されます）"
    wb["T10_Layout"]["A1"] = "（変換実行で自動生成されます）"
    wb.active = 0
    wb.save(path)

VBA_REL = ('<Relationship Id="rIdVbaProject" '
           'Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" '
           'Target="vbaProject.bin"/>')

def inject_vba(xlsx_path, xlsm_path, vba_bin):
    zin = zipfile.ZipFile(xlsx_path)
    items = {n: zin.read(n) for n in zin.namelist()}
    zin.close()

    ct = items["[Content_Types].xml"].decode("utf-8")
    ct = ct.replace(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
        "application/vnd.ms-excel.sheet.macroEnabled.main+xml")
    if 'Extension="bin"' not in ct:
        ct = ct.replace("<Types ", "<Types ", 1)
        ct = re.sub(r"(<Types[^>]*>)",
                    r'\1<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>',
                    ct, count=1)
    items["[Content_Types].xml"] = ct.encode("utf-8")

    rels = items["xl/_rels/workbook.xml.rels"].decode("utf-8")
    rels = rels.replace("</Relationships>", VBA_REL + "</Relationships>")
    items["xl/_rels/workbook.xml.rels"] = rels.encode("utf-8")

    items["xl/vbaProject.bin"] = vba_bin

    with zipfile.ZipFile(xlsm_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for name in ["[Content_Types].xml"] + [n for n in items if n != "[Content_Types].xml"]:
            zout.writestr(name, items[name])

def main():
    srcdir, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    tmp_xlsx = os.path.join(outdir, "_tool_tmp.xlsx")
    out = os.path.join(outdir, "プロジェクトG変換ツール.xlsm")
    build_workbook(tmp_xlsx)
    vba, mods = build_vba.build(srcdir, build_vba.DEFAULT_DOCS)
    inject_vba(tmp_xlsx, out, vba)
    os.remove(tmp_xlsx)
    print("wrote %s (%d bytes)" % (out, os.path.getsize(out)))
    print("modules: %s" % ", ".join(m[0] for m in mods))

main()
```

## 12. `build/verify_xlsm.py`

生成物の構造検査（Excel 無しで回せる範囲）

SHA-256: `01f8fbf3d54192ac2b930b25fd0388cadab091cd4d833f6b12775b5d393f718a`

```python
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
```

