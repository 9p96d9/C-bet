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
