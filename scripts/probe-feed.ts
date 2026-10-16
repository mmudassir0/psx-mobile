/** Reads the picks feed exactly as the app does. */
import { fetchFeed } from '../src/picks/feed';
fetchFeed()
  .then((f) => console.log(`OK feed for ${f.day}, generated ${f.generatedAt}, market ${f.marketOk ? 'strong' : 'weak'}, picks: ${f.picks.map((p) => p.symbol).join(', ')}`))
  .catch((e) => console.log('FAIL', e.message));
