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
