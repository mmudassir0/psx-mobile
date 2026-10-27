/** Looks for PSX's order book (market depth) for one stock. */
import { fetchRaw } from '../src/psx/api';
(async () => {
  for (const [path, xhr] of [
    ['/company/LUCK', false],
    ['/market-depth/LUCK', true],
    ['/depth/LUCK', true],
    ['/company/depth/LUCK', true],
    ['/market-watch/depth/LUCK', true],
    ['/orderbook/LUCK', true],
  ] as [string, boolean][]) {
    try {
      const h = await fetchRaw(path, undefined, xhr);
      const i = h.search(/depth|order book|bid vol|buy volume/i);
      console.log(path, 'OK', h.length, i >= 0 ? h.slice(Math.max(0, i - 300), i + 900).replace(/\s+/g, ' ') : '(no depth words)');
    } catch (e) {
      console.log(path, 'ERR', (e as Error).message.slice(0, 120));
    }
  }
})();
