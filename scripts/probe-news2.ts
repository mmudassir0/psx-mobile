/** Real headlines through the news matcher: what Sahm would show. Run via the Probe workflow. */
import { fetchSymbols } from '../src/psx/api';
import { buildMatcher, buildNews, NEWS_FEEDS, parseRss } from '../src/analysis/news';

async function main() {
  const syms = await fetchSymbols();
  const companies = syms.filter((s) => !/ETF|MODARABA|MUTUAL|FUND|BOND|TFC|SUKUK/i.test(s.sectorName ?? '')).map((s) => ({ symbol: s.symbol, name: s.name }));
  console.log(`${companies.length} companies`);
  const matcher = buildMatcher(companies);
  const collected = [];
  for (let i = 0; i < NEWS_FEEDS.length; i++) {
    const f = NEWS_FEEDS[i];
    const xml = await (await fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Sahm news reader)' } })).text();
    const items = parseRss(xml);
    console.log(`${f.source}: ${items.length} items`);
    for (const item of items) collected.push({ source: i, item });
  }
  const rows = buildNews(collected, matcher, Date.now());
  console.log(`\n${rows.length} kept of ${collected.length}\n`);
  for (const [t, s, title, , symbols, market] of rows)
    console.log(`${new Date(t + 5 * 3600e3).toISOString().slice(5, 16)} ${NEWS_FEEDS[s].source.padEnd(17)} ${symbols.length ? `[${symbols.join(',')}]` : ''}${market ? ' (market)' : ''}  ${title}`);
}
main();
