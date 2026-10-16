/** Reads three phone-sized made-up screenshots the way the app does (Groq only), printing each status line. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { readScreenshots } from '../src/portfolio/screenshot';
(async () => {
  const groq = process.env.GROQ_KEY;
  if (!groq) return console.log('no GROQ_KEY');
  const data = readFileSync(join(__dirname, 'fixtures', 'phone_sample.jpg')).toString('base64');
  const t0 = Date.now();
  try {
    const r = await readScreenshots({ groq }, [0, 1, 2].map(() => ({ data, mime: 'image/jpeg' })), undefined, (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${s}`));
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s done`, JSON.stringify(r));
  } catch (e) {
    console.log('failed:', (e as Error).message);
  }
})();
