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
