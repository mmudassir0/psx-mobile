/** Saves daily Brent crude prices (US EIA via FRED) for the oil study. */
import { writeFileSync } from 'fs';
(async () => {
  for (const id of ['DCOILBRENTEU', 'DCOILWTICO']) {
    try {
      const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=2021-01-01`);
      const text = await res.text();
      writeFileSync(`/tmp/out/${id}.csv`, text);
      const lines = text.trim().split('\n');
      console.log(`${id}: HTTP ${res.status}, ${lines.length - 1} rows, ${lines[1]} … ${lines[lines.length - 1]}`);
    } catch (e) {
      console.log(`${id}: ${(e as Error).message}`);
    }
  }
})();
