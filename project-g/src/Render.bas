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
