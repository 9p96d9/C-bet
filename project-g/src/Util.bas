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
