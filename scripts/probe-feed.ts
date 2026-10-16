/** Reads the picks feed and market report exactly as the app does. */
import { fetchFeeds } from '../src/picks/feed';
fetchFeeds()
  .then((fs) => {
    const { market, ...lists } = fs;
    for (const [k, f] of Object.entries(lists)) console.log(`OK ${k}: ${f!.day}, generated ${f!.generatedAt}, picks: ${f!.picks.map((p) => p.symbol).join(', ')}`);
    if (market) console.log(`OK market: ${market.day}, ${Object.entries(market.indices).map(([c, i]) => `${c} ${i.regime} ${i.days}d`).join(', ')}, ${market.sectors.length} sectors, top ${market.sectors[0]?.[0]}`);
    else console.log('no market report');
  })
  .catch((e) => console.log('FAIL', e.message));
