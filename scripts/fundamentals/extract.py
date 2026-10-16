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
  GEMINI_API_KEY Google Gemini key: used first (Gemini Flash, free tier), when set
  LLM_API_KEY    API key for an OpenAI-compatible chat endpoint (Groq's free tier by default),
                 used when Gemini is busy or out of quota
  LLM_URL        endpoint, default https://api.groq.com/openai/v1/chat/completions
  MODEL          model id, default openai/gpt-oss-120b
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
MODEL = os.environ.get("MODEL") or "openai/gpt-oss-120b"
ENDPOINT = os.environ.get("LLM_URL") or "https://api.groq.com/openai/v1/chat/completions"
GEMINI_KEY = os.environ.get("GEMINI_API_KEY") or ""
GEMINI_MODEL = os.environ.get("GEMINI_MODEL") or "gemini-3.8-flash"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse"
FIELDS = ["total_equity", "total_assets", "total_liabilities", "current_assets", "current_liabilities", "cash"]

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


def ocr_page(path: str, i: int, dpi: int = 300) -> str:
    """OCR one page (0-based); table-friendly page segmentation. Low dpi is enough to find headings."""
    with tempfile.TemporaryDirectory() as d:
        run(["pdftoppm", "-r", str(dpi), "-gray", "-f", str(i + 1), "-l", str(i + 1), "-png", path, f"{d}/p"], timeout=300)
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
        # Quick low-resolution pass to find the statement, then full resolution only on the pages that matter.
        blank = [i for i, p in enumerate(pages) if len(p.strip()) < 200][:60]
        for i in blank:
            pages[i] = ocr_page(path, i, dpi=110)
        method = "ocr"
        idx = locate(pages)
        if not idx:
            return [], pages, method
        for i in idx:
            pages[i] = ocr_page(path, i)
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
 "borrowing_lines": [{"label": "<line label>", "amount": "<number exactly as printed>"}],
      // every interest-bearing borrowing line in the CURRENT column: long-term financing, its current maturity,
      // short-term borrowings, running finance, TFCs/sukuk, loans. NOT leases, NOT payables, NOT customer deposits.
      // Empty list if there are none.
 "cash": "<cash and bank balances as printed or null>"
}
Rules: copy every number character-for-character from the CURRENT period column (keep commas, keep brackets for negatives).
Never add numbers up yourself. If a total is not printed, use null. Do not guess."""


def compact(text: str) -> str:
    """Layout text is mostly padding; keep column breaks but drop the runs of spaces."""
    lines = [re.sub(r" {2,}", "  ", l.rstrip()) for l in text.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines))


class Busy(Exception):
    """The provider is out of quota or overloaded: try the next one."""


def ask_gemini(messages: list[dict]) -> dict:
    """Gemini through the Interactions API (streamed), same request shape as the app."""
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    turns = [m for m in messages if m["role"] != "system"]
    earlier = "\n\n".join(("Earlier input" if m["role"] == "user" else "Your earlier answer") + ": " + m["content"] for m in turns[:-1])
    inp = (earlier + "\n\nNow: " + turns[-1]["content"]) if earlier else turns[-1]["content"]
    body = json.dumps({
        "model": GEMINI_MODEL,
        "system_instruction": system + "\nReply with the JSON object only.",
        "input": inp,
        "stream": True,
        "store": False,
        "generation_config": {"thinking_level": "low", "max_output_tokens": 4000},
    }).encode()
    for attempt in range(4):
        req = urllib.request.Request(GEMINI_URL, data=body, headers={"x-goog-api-key": GEMINI_KEY, "Content-Type": "application/json", "User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                raw = r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 503 and attempt < 3:  # "high demand": usually passes in seconds
                time.sleep(5 * (attempt + 1))
                continue
            if e.code in (429, 403, 404, 503):
                raise Busy(f"gemini HTTP {e.code}")
            raise RuntimeError(f"gemini HTTP {e.code}: {e.read()[:300]!r}")
        text = ""
        for line in raw.splitlines():
            if not line.startswith("data:"):
                continue
            try:
                j = json.loads(line[5:].strip())
            except Exception:
                continue
            if j.get("event_type") == "error":
                raise Busy(f"gemini: {j.get('error', {}).get('message', '')[:200]}")
            d = j.get("delta") or {}
            if j.get("event_type") == "step.delta" and d.get("type") == "text":
                text += d.get("text", "")
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            raise RuntimeError(f"no JSON in Gemini reply: {text[:300]!r}")
        return json.loads(m.group(0))
    raise Busy("gemini busy")


gemini_off = False  # set once Gemini runs out of quota in this run


def ask_model(text: str, token: str, feedback: tuple[dict, list[str]] | None = None) -> dict:
    global gemini_off
    text = compact(text)
    messages = [
        {"role": "system", "content": PROMPT},
        {"role": "user", "content": text[:16000]},
    ]
    if feedback:
        prev, problems = feedback
        messages += [
            {"role": "assistant", "content": json.dumps(prev)},
            {"role": "user", "content": "Your answer failed these checks: " + "; ".join(problems)
             + ". Use the CURRENT period column (the first figure of each pair, the later date). The page may "
               "print two statements side by side; read each figure from its own column. Return the corrected JSON."},
        ]
    if GEMINI_KEY and not gemini_off:
        try:
            return ask_gemini(messages)
        except Busy as e:
            print(f"  Gemini unavailable ({e}); using Groq", flush=True)
            if "429" in str(e) or "quota" in str(e).lower():
                gemini_off = True
    if not token:
        raise RuntimeError("Gemini unavailable and no Groq key")
    body = json.dumps({
        "model": MODEL,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": messages,
    }).encode()
    for attempt in range(7):
        req = urllib.request.Request(ENDPOINT, data=body, headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": UA,
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
            if e.code == 429 and attempt < 6:
                wait = float(e.headers.get("Retry-After") or 60)
                time.sleep(min(wait, 120) + 2)
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


def in_current_column(raw: str, page_text: str) -> bool:
    """Statements print (current, comparative) pairs left to right, sometimes two statements side by side.
    A current-period figure is therefore the 1st, 3rd, ... large number on its line. True if any occurrence is."""
    want = normalize_number(raw)
    for line in page_text.splitlines():
        nums = [normalize_number(t) for t in BIGNUM.findall(line)]
        for k, d in enumerate(nums):
            if d == want and k % 2 == 0:
                return True
            if d == want and len(nums) == 1:
                return True
    return False


# Lines a model sometimes mistakes for debt: money lent out, leases, payables, deposits taken.
NOT_DEBT = re.compile(r"\bto\s+(subsidiar|associat|related|employees)|receivable|investment|advance|prepay|lease|payable|deposit", re.I)


def verify(ans: dict, page_text: str) -> tuple[dict | None, list[str]]:
    problems: list[str] = []
    unit = ans.get("unit") if ans.get("unit") in (1, 1000, 1000000) else None
    if unit is None:
        return None, ["unknown unit"]
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
        if f in ("total_equity", "total_assets") and not in_current_column(str(raw), page_text):
            problems.append(f"{f} {raw} is in the comparative (prior period) column")
            vals[f] = None
            continue
        vals[f] = to_value(raw, unit)
    # Borrowings: each line verified on its own, summed here (the model never adds numbers).
    lines = ans.get("borrowing_lines") or []
    if not isinstance(lines, list):
        lines = []
    total_b, bad = 0.0, False
    for item in lines:
        raw = item.get("amount") if isinstance(item, dict) else item
        label = str(item.get("label", "")) if isinstance(item, dict) else ""
        if NOT_DEBT.search(label):
            problems.append(f"ignored non-borrowing line '{label}'")
            continue
        if raw is None or normalize_number(str(raw)) not in hay_tokens:
            problems.append(f"borrowing line {raw} not found in the statement")
            bad = True
            continue
        total_b += abs(to_value(raw, unit) or 0)
    vals["borrowings"] = None if bad or not lines else total_b
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
    if vals["borrowings"] is not None and vals["borrowings"] > (vals["total_liabilities"] or 0) * 1.001:
        problems.append("borrowings larger than total liabilities")
        vals["borrowings"] = None
    if eq <= 0:
        problems.append("negative equity")
    return vals, problems


# ----------------------------------------------------------------- main ----

def full_reports(company: dict) -> list[dict]:
    full = [r for r in company.get("reports", []) if r["kind"] in ("quarterly", "annual")]
    full.sort(key=lambda r: r["date"], reverse=True)
    return full


def pick_report(company: dict) -> dict | None:
    full = full_reports(company)
    return full[0] if full else None


def download(url: str, dest: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        f.write(r.read())


def process(company: dict, token: str, workdir: str) -> dict:
    """Newest full report first; if it can't be read reliably, the one before it."""
    reports = full_reports(company)[:2]
    if not reports:
        return {"ok": False, "reason": "no full report listed on PSX"}
    result: dict = {}
    for n, rep in enumerate(reports):
        if n:
            time.sleep(12)
        result = process_report(company["symbol"], rep, token, workdir)
        if result["ok"]:
            return result
    return result


def process_report(sym: str, rep: dict, token: str, workdir: str) -> dict:
    pdf = os.path.join(workdir, f"{sym}.pdf")
    download(rep["url"], pdf)
    idx, pages, method = statement_pages(pdf)
    if not idx:
        return {"ok": False, "reason": "balance sheet page not found", "report": rep}
    text = "\n\n".join(pages[i] for i in idx)
    ans = ask_model(text, token)
    vals, problems = verify(ans, text)
    if vals is None:
        # One second look, told exactly which check failed. The new answer is verified the same way.
        time.sleep(12)
        ans = ask_model(text, token, (ans, problems))
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
    token = os.environ.get("LLM_API_KEY", "")
    if not token and not GEMINI_KEY:
        sys.exit("Set GEMINI_API_KEY or LLM_API_KEY")
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

    # Companies with no balance sheet yet come first, so coverage grows every run.
    companies.sort(key=lambda c: (c["symbol"] in prev, c["symbol"]))
    budget = float(args[args.index("--budget-min") + 1]) * 60 if "--budget-min" in args else None
    started = time.time()
    out, failures = dict(prev), {}

    def write():
        tmp = dest + ".tmp"
        json.dump({
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "model": MODEL,
            "companies": dict(sorted(out.items())),
            "failures": dict(sorted(failures.items())),
        }, open(tmp, "w"), indent=1)
        os.replace(tmp, dest)

    with tempfile.TemporaryDirectory() as work:
        for c in companies:
            if budget and time.time() - started > budget:
                print(f"Time budget reached; {c['symbol']} and later wait for the next run", flush=True)
                break
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
            write()  # keep progress even if the job is stopped
            time.sleep(4 if GEMINI_KEY and not gemini_off else 12)  # Groq free tier allows ~8K tokens a minute
    write()


if __name__ == "__main__":
    main()
