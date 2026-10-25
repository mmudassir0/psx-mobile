/** Which Pakistani business-news feeds answer, and what their items look like. Run via the Probe workflow. */
const FEEDS: [string, string][] = [
  ['Business Recorder', 'https://www.brecorder.com/feeds/latest-news'],
  ['Business Recorder markets', 'https://www.brecorder.com/feeds/markets'],
  ['Dawn Business', 'https://www.dawn.com/feeds/business'],
  ['Profit', 'https://profit.pakistantoday.com.pk/feed/'],
  ['Express Tribune Business', 'https://tribune.com.pk/feed/business'],
  ['ProPakistani Business', 'https://propakistani.pk/category/business/feed/'],
  ['Mettis Global', 'https://mettisglobal.news/feed'],
  ['Mettis Global rss', 'https://mettisglobal.news/rss'],
  ['The News Business', 'https://www.thenews.com.pk/rss/1/8'],
];
const tag = (x: string, t: string) => x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i'))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() ?? '';
async function main() {
  for (const [name, url] of FEEDS) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Sahm news reader)', Accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(20000) });
      const body = await res.text();
      const items = body.split(/<item[\s>]/i).slice(1);
      console.log(`\n== ${name} ${res.status} ${res.headers.get('content-type')} ${body.length}B, ${items.length} items`);
      for (const it of items.slice(0, 3)) console.log(`  ${tag(it, 'pubDate')} | ${tag(it, 'title').slice(0, 110)} | ${tag(it, 'link').slice(0, 90)}`);
    } catch (e) {
      console.log(`\n== ${name} FAILED ${(e as Error).message}`);
    }
  }
}
main();
