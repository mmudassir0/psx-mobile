/** Third look: the CPI numbers behind PBS's homepage chart, PBS price statistics, and OGRA's notified petrol prices. */
const get = async (u: string) => {
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36' } });
  return { status: r.status, html: await r.text() };
};
const plain = (h: string) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
(async () => {
  const pbs = await get('https://www.pbs.gov.pk/');
  console.log('===== PBS scripts mentioning CPI');
  for (const m of pbs.html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    const s = m[1];
    if (/cpi|consumer price|inflation/i.test(s)) console.log('--- script', s.length, '\n', s.replace(/\s+/g, ' ').slice(0, 2500));
  }
  for (const m of pbs.html.matchAll(/.{0,200}(Consumer Price Index|CPI).{0,400}/gi)) console.log('* ' + m[0].replace(/\s+/g, ' ').slice(0, 600));
  const ps = await get('https://www.pbs.gov.pk/price-statistics/');
  console.log('\n===== PBS price statistics', ps.status);
  for (const m of ps.html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]{0,160})<\/a>/gi)) if (/cpi|inflation|monthly review|price/i.test(m[1] + m[2])) console.log(m[1], '|', m[2].trim());
  const og = await get('https://www.ogra.org.pk/notified-petroleum-prices');
  console.log('\n===== OGRA notified', og.status);
  console.log(plain(og.html).slice(0, 2500));
  for (const m of og.html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]{0,160})<\/a>/gi)) if (/pdf|notif|price/i.test(m[1] + m[2])) console.log(m[1], '|', m[2].trim());
})();
