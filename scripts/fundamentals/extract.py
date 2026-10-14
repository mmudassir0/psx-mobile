"""
Balance-sheet extraction from PSX company reports.

For each company: take its newest full report (quarterly or annual), find the
standalone statement of financial position, have a language model read only
those pages, then verify every figure in code before keeping it:

  * each number must appear literally in the page text it came from;
  * total assets must equal equity + total liabilities (within 1%);
  * current assets / liabilities must not exceed the totals.

Anything that fails a check is recorded as a failure, never published.

Usage:
  python extract.py reports.json out.json [--limit N] [--only SYM,SYM]
Environment:
  GITHUB_TOKEN   token with `models: read` (GitHub Models)
  MODEL          model id, default openai/gpt-4.1-mini
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
from datetime import datetime, timezone

UA = "Mozilla/5.0 (compatible; sahm-fundamentals/1.0)"
MODEL = os.environ.get("MODEL", "openai/gpt-4.1-mini")
ENDPOINT = "https://models.github.ai/inference/chat/completions"
FIELDS = ["total_equity", "total_assets", "total_liabilities", "current_assets", "current_liabilities", "borrowings", "cash"]

HEADING = re.compile(r"statement\s+of\s+financial\s+position|balance\s+sheet", re.I)
BIGNUM = re.compile(r"\(?\d{1,3}(?:,\d{3})+\)?|\(?\d{5,}\)?")


# ---------------------------------------------------------------- text ----

def run(cmd: list[str], timeout: int = 600) -> str:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout


def page_count(path: str) -> int:
    m = re.search(r"Pages:\s+(\d+)", run(["pdfinfo", path]))
    return int(m.group(1)) if m else 0


def text_pages(path: str) -> list[str]:
    pages = run(["pdftotext", "-layout", path, "-"]).split("\f")
    n = page_count(path)
    if n:
        pages = (pages + [""] * n)[:n]
    return pages


def ocr_page(path: str, i: int) -> str:
    """OCR one page (0-based) at 300 dpi; table-friendly page segmentation."""
    with tempfile.TemporaryDirectory() as d:
        run(["pdftoppm", "-r", "300", "-gray", "-f", str(i + 1), "-l", str(i + 1), "-png", path, f"{d}/p"], timeout=300)
        files = sorted(os.listdir(d))
        if not files:
            return ""
        return run(["tesseract", f"{d}/{files[0]}", "-", "--psm", "6"], timeout=300)


def normalize_number(s: str) -> str:
    return re.sub(r"[^\d]", "", s)


# ------------------------------------------------------------- locating ----

ITEMS = re.compile(
    r"total assets|current assets|current liabilities|share capital|reserves|non[- ]current|total liabilities|"
    r"equity and liabilities|unappropriated profit|property,? plant|cash and bank|borrowings|deposits",
    re.I,
)
OTHER_STATEMENT = re.compile(r"profit (or|and) loss|comprehensive income|cash ?flows?|changes in equity", re.I)
NOT_A_STATEMENT = re.compile(r"analysis|at a glance|\byears\b|summary|highlights|review|key figures|horizontal|vertical", re.I)


def head_of(page: str) -> str:
    return "\n".join(page.strip().splitlines()[:12])


def page_score(page: str) -> float:
    """How much a page looks like a standalone statement of financial position, from its labels alone."""
    head = head_of(page)
    if not HEADING.search(head) or NOT_A_STATEMENT.search(head):
        return 0
    if OTHER_STATEMENT.search(head) and not re.search(r"financial\s+position|balance\s+sheet", head, re.I):
        return 0
    if re.search(r"\bcontents\b|^\s*index\s*$|independent auditor|review report", page[:900], re.I | re.M):
        return 0
    items = len(set(m.group(0).lower() for m in ITEMS.finditer(page)))
    if items < 3:
        return 0
    score = items + min(len(BIGNUM.findall(page)), 60) / 20
    if re.search(r"\bconsolidated\b", head, re.I) and not re.search(r"unconsolidated", head, re.I):
        score *= 0.3  # prefer the standalone statement, which matches PSX's EPS and profit
    return score


def is_continuation(page: str) -> bool:
    head = head_of(page)
    if OTHER_STATEMENT.search(head) or HEADING.search(head):
        return False
    return len(set(m.group(0).lower() for m in ITEMS.finditer(page))) >= 2


def locate(pages: list[str]) -> list[int]:
    """Indices of the balance-sheet page and, if it runs over, the next page."""
    scored = [(page_score(p), i) for i, p in enumerate(pages)]
    scored = [x for x in scored if x[0] > 0]
    if not scored:
        return []
    best = max(s for s, _ in scored)
    # earliest strong candidate: the standalone statement comes before the consolidated one
    i = min(i for s, i in scored if s >= best * 0.7)
    picked = [i]
    if i + 1 < len(pages) and is_continuation(pages[i + 1]):
        picked.append(i + 1)
    return picked


def statement_pages(path: str) -> tuple[list[int], list[str], str]:
    """Find the balance sheet, OCR'ing only where the text layer is missing. Returns (indices, page texts, method)."""
    pages = text_pages(path)
    method = "text"
    idx = locate(pages)
    if not idx:
        # The statement may be a scanned page inside a text PDF, or the whole PDF may be scanned.
        blank = [i for i, p in enumerate(pages) if len(p.strip()) < 200][:80]
        for i in blank:
            pages[i] = ocr_page(path, i)
        method = "ocr"
        idx = locate(pages)
        if not idx:
            return [], pages, method
    # Labels found but the numbers are drawn as graphics: OCR those pages.
    for i in idx:
        if len(BIGNUM.findall(pages[i])) < 12:
            pages[i] = ocr_page(path, i)
            method = "ocr"
    return idx, pages, method


# ------------------------------------------------------------------ LLM ----

PROMPT = """You read one company's statement of financial position (balance sheet) from a Pakistani annual or quarterly report.
Return JSON only, no prose, with this shape:
{
 "statement": "standalone" | "consolidated",
 "period_end": "YYYY-MM-DD",          // the CURRENT period column (the most recent date), never the comparative
 "unit": 1 | 1000 | 1000000,          // multiplier for the figures, e.g. (Rupees '000) -> 1000
 "is_bank": true | false,
 "total_equity": "<number exactly as printed>",       // equity attributable to owners / share capital and reserves total
 "total_assets": "<number exactly as printed>",
 "total_liabilities": "<number exactly as printed or null>",
 "current_assets": "<number exactly as printed or null>",       // null for banks
 "current_liabilities": "<number exactly as printed or null>",  // null for banks
 "borrowings": "<one printed line or subtotal of interest-bearing borrowings / long-term financing, or null; never add lines together>",
 "cash": "<cash and bank balances as printed or null>"
}
Rules: copy every number character-for-character from the CURRENT period column (keep commas, keep brackets for negatives).
Never add numbers up yourself. If a total is not printed, use null. Do not guess."""


def ask_model(text: str, token: str) -> dict:
    body = json.dumps({
        "model": MODEL,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": text[:24000]},
        ],
    }).encode()
    for attempt in range(4):
        req = urllib.request.Request(ENDPOINT, data=body, headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                raw = r.read().decode("utf-8", "replace")
            try:
                content = json.loads(raw)["choices"][0]["message"]["content"]
            except Exception:
                raise RuntimeError(f"unexpected model response: {raw[:300]!r}")
            m = re.search(r"\{.*\}", content, re.S)
            if not m:
                raise RuntimeError(f"no JSON in model reply: {content[:300]!r}")
            return json.loads(m.group(0))
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:
                wait = int(e.headers.get("Retry-After") or 30)
                time.sleep(min(wait, 120))
                continue
            raise RuntimeError(f"model HTTP {e.code}: {e.read()[:300]!r}")
    raise RuntimeError("model rate limited")


# --------------------------------------------------------------- checks ----

def to_value(raw, unit: int) -> float | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or s.lower() == "null":
        return None
    neg = s.startswith("(") and s.endswith(")") or s.startswith("-")
    digits = normalize_number(s)
    if not digits:
        return None
    v = int(digits) * unit
    return -v if neg else v


def verify(ans: dict, page_text: str) -> tuple[dict | None, list[str]]:
    problems: list[str] = []
    unit = ans.get("unit") if ans.get("unit") in (1, 1000, 1000000) else None
    if unit is None:
        return None, ["unknown unit"]
    hay = normalize_number(page_text.replace("\n", " "))
    hay_tokens = {normalize_number(t) for t in BIGNUM.findall(page_text)}
    vals: dict[str, float | None] = {}
    for f in FIELDS:
        raw = ans.get(f)
        if raw in (None, "", "null"):
            vals[f] = None
            continue
        d = normalize_number(str(raw))
        if d not in hay_tokens:
            problems.append(f"{f} {raw} not found in the statement")
            vals[f] = None
            continue
        vals[f] = to_value(raw, unit)
    eq, ta, tl = vals["total_equity"], vals["total_assets"], vals["total_liabilities"]
    if eq is None or ta is None:
        return None, problems + ["missing equity or total assets"]
    if tl is not None:
        if abs(ta - (eq + tl)) > 0.01 * ta:
            # Some statements print equity incl. non-controlling interest or surplus separately; reject rather than guess.
            return None, problems + [f"assets {ta:.0f} != equity {eq:.0f} + liabilities {tl:.0f}"]
    else:
        vals["total_liabilities"] = ta - eq
    for f in ("current_assets", "cash"):
        if vals[f] is not None and vals[f] > ta * 1.001:
            problems.append(f"{f} larger than total assets")
            vals[f] = None
    if vals["current_liabilities"] is not None and vals["current_liabilities"] > vals["total_liabilities"] * 1.001:
        problems.append("current liabilities larger than total liabilities")
        vals["current_liabilities"] = None
    if eq <= 0:
        problems.append("negative equity")
    return vals, problems


# ----------------------------------------------------------------- main ----

def pick_report(company: dict) -> dict | None:
    full = [r for r in company.get("reports", []) if r["kind"] in ("quarterly", "annual")]
    full.sort(key=lambda r: r["date"], reverse=True)
    return full[0] if full else None


def download(url: str, dest: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        f.write(r.read())


def process(company: dict, token: str, workdir: str) -> dict:
    sym = company["symbol"]
    rep = pick_report(company)
    if not rep:
        return {"ok": False, "reason": "no full report listed on PSX"}
    pdf = os.path.join(workdir, f"{sym}.pdf")
    download(rep["url"], pdf)
    idx, pages, method = statement_pages(pdf)
    if not idx:
        return {"ok": False, "reason": "balance sheet page not found", "report": rep}
    text = "\n\n".join(pages[i] for i in idx)
    ans = ask_model(text, token)
    vals, problems = verify(ans, text)
    if vals is None:
        return {"ok": False, "reason": "; ".join(problems), "report": rep, "pages": [i + 1 for i in idx], "model": ans}
    return {
        "ok": True,
        "periodEnd": ans.get("period_end"),
        "statement": ans.get("statement"),
        "isBank": bool(ans.get("is_bank")),
        "equity": vals["total_equity"],
        "assets": vals["total_assets"],
        "liabilities": vals["total_liabilities"],
        "currentAssets": vals["current_assets"],
        "currentLiabilities": vals["current_liabilities"],
        "borrowings": vals["borrowings"],
        "cash": vals["cash"],
        "warnings": problems,
        "source": {"title": rep["title"], "url": rep["url"], "date": rep["date"], "pages": [i + 1 for i in idx], "method": method},
    }


def main():
    src, dest = sys.argv[1], sys.argv[2]
    args = sys.argv[3:]
    limit = int(args[args.index("--limit") + 1]) if "--limit" in args else None
    only = set(args[args.index("--only") + 1].split(",")) if "--only" in args else None
    token = os.environ["GITHUB_TOKEN"]
    companies = json.load(open(src))
    if only:
        companies = [c for c in companies if c["symbol"] in only]
    if limit:
        companies = companies[:limit]

    prev = {}
    if os.path.exists(dest):
        try:
            prev = json.load(open(dest)).get("companies", {})
        except Exception:
            prev = {}

    out, failures = dict(prev), {}
    with tempfile.TemporaryDirectory() as work:
        for c in companies:
            sym = c["symbol"]
            rep = pick_report(c)
            old = prev.get(sym)
            if old and rep and old.get("source", {}).get("url") == rep["url"]:
                print(f"{sym}: unchanged ({rep['date']})", flush=True)
                continue
            try:
                r = process(c, token, work)
            except Exception as e:  # network, model or PDF trouble: keep last good data
                r = {"ok": False, "reason": f"error: {e}"}
            if r.pop("ok"):
                out[sym] = r
                print(f"{sym}: ok {r['periodEnd']} equity={r['equity']:.0f} assets={r['assets']:.0f}", flush=True)
            else:
                failures[sym] = r
                print(f"{sym}: FAILED {r.get('reason')}", flush=True)
            time.sleep(4)  # stay well inside the free model rate limit

    json.dump({
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": MODEL,
        "companies": dict(sorted(out.items())),
        "failures": dict(sorted(failures.items())),
    }, open(dest, "w"), indent=1)


if __name__ == "__main__":
    main()
