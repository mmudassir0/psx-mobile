"""Runs the model + checks on saved balance-sheet pages (fixtures/*.json), no PSX access needed."""
import glob, json, os, sys, time
sys.path.insert(0, os.path.dirname(__file__))
import extract as X

token = os.environ["LLM_API_KEY"]
out = {}
for f in sorted(glob.glob(os.path.join(os.path.dirname(__file__), "fixtures", "*.json"))):
    fx = json.load(open(f))
    text = "\n\n".join(fx["text"])
    try:
        ans = X.ask_model(text, token)
        vals, problems = X.verify(ans, text)
        if vals is None:
            time.sleep(12)
            ans = X.ask_model(text, token, (ans, problems))
            vals, problems = X.verify(ans, text)
        out[fx["name"]] = {"model": ans, "values": vals, "problems": problems}
        print(fx["name"], "OK" if vals else "REJECTED", problems, flush=True)
    except Exception as e:
        out[fx["name"]] = {"error": str(e)}
        print(fx["name"], "ERROR", e, flush=True)
    time.sleep(12)
json.dump(out, open(sys.argv[1], "w"), indent=1)
