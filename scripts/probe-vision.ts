/** Sends the sample (made-up) broker screenshot to Gemini exactly as the app does, and checks the answer. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { FLASH, GEMINI_URL, parseInteractionSse } from '../src/ai/gemini';
import { checkHoldings, READ_SYSTEM } from '../src/portfolio/screenshot';
(async () => {
  const key = process.env.GEMINI_KEY;
  if (!key) return console.log('no GEMINI_KEY');
  const data = readFileSync(join(__dirname, 'fixtures', 'portfolio_sample.jpg')).toString('base64');
  const body = {
    model: FLASH.id,
    system_instruction: READ_SYSTEM,
    input: [{ type: 'text', text: 'Read the holdings from these 1 screenshot(s).' }, { type: 'image', data, mime_type: 'image/jpeg' }],
    stream: true,
    store: false,
    generation_config: { thinking_level: 'low', max_output_tokens: 4000 },
  };
  for (let a = 0; a < 4; a++) {
    const t0 = Date.now();
    const res = await fetch(GEMINI_URL, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const raw = await res.text();
    console.log(`HTTP ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (res.status === 503) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    const r = parseInteractionSse(raw + '\n');
    console.log('answer:', r.text || raw.slice(0, 600));
    console.log('checked:', JSON.stringify(checkHoldings(r.text)));
    break;
  }
})();
