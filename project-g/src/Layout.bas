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
