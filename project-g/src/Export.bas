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
