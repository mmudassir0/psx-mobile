"""Checks the page finder and the verifier on saved statement pages (no network)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import extract as X

failed = 0
def check(label, ok, detail=None):
    global failed
    print(("PASS " if ok else "FAIL ") + label + (f"  {detail}" if detail is not None else ""))
    if not ok:
        failed += 1

fx = json.load(open(os.path.join(os.path.dirname(__file__), "fixtures", "LUCK_annual.json")))
text = "\n\n".join(fx["text"])
good = {
    "unit": 1000, "total_equity": "216,641,607", "total_assets": "301,409,878", "total_liabilities": "84,768,271",
    "current_assets": "127,042,576", "current_liabilities": "53,105,221", "cash": "1,530,592",
    "borrowing_lines": [{"label": "Long-term financing", "amount": "7,339,816"}, {"label": "Current maturity", "amount": "1,822,195"},
                        {"label": "Short term borrowings", "amount": "9,610,000"}],
}
v, p = X.verify(good, text)
check("accepts a correct reading", v is not None and not p, p)
check("scales by unit", v and v["total_equity"] == 216_641_607_000)
check("sums verified borrowing lines", v and v["borrowings"] == (7_339_816 + 1_822_195 + 9_610_000) * 1000, v and v["borrowings"])

v, p = X.verify(dict(good, total_equity="216,641,600"), text)
check("rejects a number not on the page", v is None, p)
v, p = X.verify(dict(good, total_liabilities="53,105,221"), text)
check("rejects totals that don't balance", v is None, p)
v, p = X.verify(dict(good, borrowing_lines=[{"label": "a", "amount": "7,339,816"}, {"label": "b", "amount": "99,999,999"}]), text)
check("drops borrowings with an invented line", v is not None and v["borrowings"] is None, p)
v, p = X.verify(dict(good, borrowing_lines=[{"label": "Long-term financing"}]), text)
check("drops borrowings given as labels only", v is not None and v["borrowings"] is None, p)
v, p = X.verify(dict(good, borrowing_lines=good["borrowing_lines"] + [{"label": "Long term loan to subsidiary", "amount": "199,261"}]), text)
check("ignores loans made to others", v is not None and v["borrowings"] == (7_339_816 + 1_822_195 + 9_610_000) * 1000, v and v["borrowings"])
v, p = X.verify(dict(good, unit=7), text)
check("rejects unknown units", v is None)
v, p = X.verify(dict(good, total_liabilities=None), text)
check("derives liabilities when not printed", v and v["total_liabilities"] == (301_409_878 - 216_641_607) * 1000)

pages = ["Contents\nStatement of Financial Position 12\n" + "x\n" * 5, fx["text"][0]]
check("skips table of contents", X.locate(pages) == [1], X.locate(pages))
check("compact keeps numbers", "216,641,607" in X.compact(text) and len(X.compact(text)) < len(text) * 0.6)

print("\n" + ("all extractor checks passed" if not failed else f"{failed} extractor check(s) failed"))
sys.exit(1 if failed else 0)
