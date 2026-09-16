# -*- coding: utf-8 -*-
"""納品する .bas を読み込み、Excel モックの上で Main.Convert を実行する。"""
import sys, os, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vbaint, excel_mock
from vbaint import Interp, VDate, EPOCH
from excel_mock import ApplicationObj, WorkbookObj, SheetData
import datetime

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src")

TOOL_SHEETS = ["00_Control", "T09_Audit", "T10_Layout", "使い方"]

def date(y, m, d):
    return VDate((datetime.date(y, m, d) - EPOCH).days)

def build(srcdir=None):
    I = Interp()
    for f in sorted(glob.glob(os.path.join(srcdir or SRC, "*.bas"))):
        I.load(f)
    I.finish_load()

    app = ApplicationObj()
    tool = WorkbookObj(app, [SheetData(n) for n in TOOL_SHEETS], name="プロジェクトG変換ツール.xlsm")
    app.workbooks.append(tool)
    app.active_wb = tool
    app.this_workbook = tool
    ApplicationObj.g_thisworkbook = lambda self, a, k: self.this_workbook

    I.globals["application"] = app
    I.globals["thisworkbook"] = tool
    I.app = app
    I.tool = tool
    return I

def convert(I, csv_path, d1, d2):
    mod, proc = I.find_proc("Convert")
    return I.call_proc(mod, proc, [csv_path, d1, d2])

def run_conversion_via_control(I, csv_path, d1, d2):
    """00_Control にセットして RunConversion を押したのと同じ経路を通す。"""
    ctl = I.tool.find_sheet("00_Control")
    ctl.vba_get("Range", ["B3"]).vba_set("Value", [], csv_path)
    ctl.vba_get("Range", ["B5"]).vba_set("Value", [], d1)
    ctl.vba_get("Range", ["E5"]).vba_set("Value", [], d2)
    mod, proc = I.find_proc("RunConversion")
    I.call_proc(mod, proc, [])
    return vbaint.vba_str(ctl.vba_get("Range", ["B9"]).vba_get("Value"))
