/** Reads the picks feed exactly as the app does. */
import { fetchFeeds } from '../src/picks/feed';
fetchFeeds()
  .then((fs) => { for (const [k, f] of Object.entries(fs)) console.log(`OK ${k}: ${f!.day}, generated ${f!.generatedAt}, picks: ${f!.picks.map((p) => p.symbol).join(', ')}`); })
  .catch((e) => console.log('FAIL', e.message));
