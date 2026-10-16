/** Lists Groq models and tries the made-up sample screenshot on any that accept images. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { checkHoldings, READ_SYSTEM } from '../src/portfolio/screenshot';
(async () => {
  const key = process.env.GROQ_KEY;
  if (!key) return console.log('no GROQ_KEY');
  const models = (await (await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } })).json()).data.map((m: { id: string }) => m.id).sort();
  console.log('models:', models.join(', '));
  const data = readFileSync(join(__dirname, 'fixtures', 'portfolio_sample.jpg')).toString('base64');
  for (const m of models.filter((id: string) => /llama-4|vision|scout|maverick|qwen|gemma/i.test(id))) {
    const t0 = Date.now();
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: m,
        temperature: 0,
        messages: [
          { role: 'system', content: READ_SYSTEM },
          { role: 'user', content: [{ type: 'text', text: 'Read the holdings from these 1 screenshot(s).' }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${data}` } }] },
        ],
      }),
    });
    const j = await res.json();
    const text = j.choices?.[0]?.message?.content ?? JSON.stringify(j).slice(0, 300);
    console.log(`\n${m}: HTTP ${res.status} ${((Date.now() - t0) / 1000).toFixed(1)}s\n${text.slice(0, 500)}\nchecked: ${JSON.stringify(checkHoldings(text))}`);
  }
})();
