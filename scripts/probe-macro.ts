/** Which public pages give Pakistan's policy rate, inflation, dollar rate, petrol price and T-bill yields (run on GitHub: Probe workflow). */
const URLS = [
  'https://www.sbp.org.pk/',
  'https://www.sbp.org.pk/ecodata/index2.asp',
  'https://www.sbp.org.pk/m_policy/index.htm',
  'https://www.sbp.org.pk/ecodata/kibor_index.asp',
  'https://www.sbp.org.pk/ecodata/MTB-PIB-Auction.asp',
  'https://www.pbs.gov.pk/cpi',
  'https://www.pbs.gov.pk/',
  'https://open.er-api.com/v6/latest/USD',
  'https://psopk.com/en/product-and-services/product-prices/pol',
  'https://www.ogra.org.pk/',
  'https://www.brecorder.com/feeds/markets',
];
const WORDS = /policy rate|inflation|cpi|t-?bill|treasury|kibor|petrol|motor spirit|high speed diesel|interbank|PKR|USD|yield|cut-?off/i;
(async () => {
  for (const u of URLS) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch(u, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36' } });
      clearTimeout(t);
      const txt = await r.text();
      const plain = txt.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
      console.log(`\n===== ${u} → ${r.status} ${r.headers.get('content-type')} ${txt.length} bytes`);
      const hits: string[] = [];
      let m: RegExpExecArray | null;
      const re = new RegExp(WORDS.source, 'gi');
      while ((m = re.exec(plain)) && hits.length < 14) {
        hits.push(plain.slice(Math.max(0, m.index - 80), m.index + 160));
        re.lastIndex = m.index + 200;
      }
      console.log(hits.join('\n---\n') || plain.slice(0, 600));
    } catch (e) {
      console.log(`\n===== ${u} → ERROR ${(e as Error).message}`);
    }
  }
})();
