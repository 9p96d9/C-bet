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
