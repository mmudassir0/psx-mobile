/** Second look: SBP's indicator snapshot in full, and where PBS and OGRA put inflation and petrol prices. */
const get = async (u: string) => {
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36' } });
  return { status: r.status, html: await r.text() };
};
const plain = (h: string) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
(async () => {
  const sbp = await get('https://www.sbp.org.pk/');
  const p = plain(sbp.html);
  const i = p.indexOf('A snapshot of');
  console.log('===== SBP snapshot\n' + p.slice(i, i + 3500));
  const j = p.search(/inflation/i);
  console.log('\n===== SBP inflation mentions');
  for (const m of p.matchAll(/.{0,120}inflation.{0,160}/gi)) console.log('- ' + m[0]);
  const pbs = await get('https://www.pbs.gov.pk/');
  console.log('\n===== PBS links with cpi/inflation');
  for (const m of pbs.html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]{0,120})<\/a>/gi)) if (/cpi|inflation|price/i.test(m[1] + m[2])) console.log(m[1], '|', m[2].trim());
  const pp = plain(pbs.html);
  for (const m of pp.matchAll(/.{0,100}(CPI|inflation).{0,200}/gi)) console.log('* ' + m[0]);
  const ogra = await get('https://www.ogra.org.pk/');
  console.log('\n===== OGRA links');
  for (const m of ogra.html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]{0,100})<\/a>/gi)) if (/price|notif/i.test(m[1] + m[2])) console.log(m[1], '|', m[2].trim());
  for (const u of ['https://www.pbs.gov.pk/cpi-1', 'https://www.pbs.gov.pk/content/consumer-price-index-cpi', 'https://www.pbs.gov.pk/press-releases']) {
    try {
      const r = await get(u);
      console.log(`\n===== ${u} → ${r.status}`);
      for (const m of plain(r.html).matchAll(/.{0,100}(year-on-year|YoY|CPI).{0,200}/gi)) console.log('* ' + m[0]);
    } catch (e) {
      console.log(u, 'ERROR', (e as Error).message);
    }
  }
})();
