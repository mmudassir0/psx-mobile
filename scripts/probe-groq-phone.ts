/** Sends a phone-sized made-up screenshot to Groq's vision model, 1 and 3 at a time, and prints status, errors and token use. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { checkHoldings, GROQ_VISION, READ_SYSTEM } from '../src/portfolio/screenshot';
(async () => {
  const key = process.env.GROQ_KEY;
  if (!key) return console.log('no GROQ_KEY');
  const data = readFileSync(join(__dirname, 'fixtures', 'phone_sample.jpg')).toString('base64');
  console.log('base64 KB', Math.round(data.length / 1024));
  for (const n of [1, 3, 1]) {
    const t0 = Date.now();
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_VISION,
        temperature: 0,
        messages: [
          { role: 'system', content: READ_SYSTEM },
          { role: 'user', content: [{ type: 'text', text: `Read the holdings from these ${n} screenshot(s).` }, ...Array.from({ length: n }, () => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${data}` } }))] },
        ],
      }),
    });
    const j = await res.json().catch(() => ({}));
    const text = j.choices?.[0]?.message?.content ?? '';
    console.log(`\n${n} image(s): HTTP ${res.status} ${((Date.now() - t0) / 1000).toFixed(1)}s usage ${JSON.stringify(j.usage ?? null)}`);
    console.log('error:', JSON.stringify(j.error ?? null));
    console.log('headers:', ['x-ratelimit-limit-tokens', 'x-ratelimit-remaining-tokens', 'x-ratelimit-limit-requests', 'retry-after'].map((h) => `${h}=${res.headers.get(h)}`).join(' '));
    console.log('checked:', JSON.stringify(checkHoldings(text)));
    await new Promise((r) => setTimeout(r, 15000));
  }
})();
