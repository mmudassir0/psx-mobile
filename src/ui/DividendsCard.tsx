/** A company's dividend history from PSX, per share and per fiscal year. */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { fmtDay } from '../format';
import type { CompanyInfo } from '../psx/types';
import { fetchPayouts } from '../psx/api';
import { cached } from '../psx/cache';
import { dividends, dividendTaxRate, payerKind, Payout, upcomingPayout } from '../analysis/dividends';
import { taxStatusPref } from '../portfolio/prefs';
import { fiscalEndMonth } from '../analysis/fairValue';
import { Panel } from './bits';
import { T } from './kit';

const KIND: Record<string, string> = { YR: 'Final', HYR: 'Half-year', IQ: '1st quarter', IIQ: '2nd quarter', IIIQ: '3rd quarter' };

export function DividendsCard({ company, price, divYield }: { company: CompanyInfo; price: number | null; divYield: number | null }) {
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const status = taxStatusPref.use();
  const rate = dividendTaxRate(status, payerKind(company.sector));
  useEffect(() => {
    cached(`payouts:${company.symbol}`, 6 * 3600_000, () => fetchPayouts(company.symbol), { persist: true })
      .then(setPayouts)
      .catch((e) => setErr((e as Error).message));
  }, [company.symbol]);
  const d = useMemo(
    () =>
      payouts
        ? dividends(payouts, { price, divYield, fiscalEndMonth: fiscalEndMonth(company.fiscalYearEnd), latestFiscalYear: company.financialsAnnual?.periods[0] ?? null })
        : null,
    [payouts, price, divYield, company],
  );
  if (err) return <T v="caption">Couldn't load dividends: {err}</T>;
  if (!d) return <T v="caption">Loading dividends…</T>;
  if (!d.list.length) return <T v="caption">PSX lists no dividend or bonus announcements for this company.</T>;
  return (
    <Panel style={{ paddingVertical: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View>
          <T v="caption">Last 12 months</T>
          <T v="mono" style={{ fontSize: 16 }}>
            Rs {d.ttm.toFixed(2)} a share
          </T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T v="caption">Yield</T>
          <T v="mono" style={{ fontSize: 16 }}>
            {d.ttmYield != null ? `${(d.ttmYield * 100).toFixed(1)}%` : '—'}
          </T>
        </View>
      </View>
      {d.ttm > 0 ? (
        <T v="caption">
          After {(rate * 100).toFixed(1).replace(/\.0$/, '')}% tax ({status === 'filer' ? 'filer' : 'non-filer'}): Rs {(d.ttm * (1 - rate)).toFixed(2)} a share
          {d.ttmYield != null ? `, ${(d.ttmYield * (1 - rate) * 100).toFixed(1)}% yield` : ''}
        </T>
      ) : null}
      {(() => {
        const up = upcomingPayout(d);
        return up ? (
          <View style={styles.next}>
            <T v="body" style={{ fontSize: 13.5, lineHeight: 19, color: colors.text2 }}>
              Next: {up.dps > 0 ? `Rs ${up.dps.toFixed(2)} a share (Rs ${(up.dps * (1 - rate)).toFixed(2)} after tax)` : ''}
              {up.dps > 0 && up.bonusPct > 0 ? ' + ' : ''}
              {up.bonusPct > 0 ? `${up.bonusPct}% bonus shares` : ''}. Book closure {fmtDay(up.bookClosure)}; buy by {fmtDay(up.lastBuyDay)} to qualify.
            </T>
          </View>
        ) : null;
      })()}
      {d.cut ? <T v="body" style={{ color: colors.downText, fontSize: 14 }}>▼ {d.cut}</T> : null}
      {d.lower ? <T v="body" style={{ color: colors.gold, fontSize: 14 }}>▼ {d.lower}</T> : null}
      <View>
        {d.list.slice(0, 8).map((p, i) => (
          <View key={p.announced + ':' + i} style={[styles.row, styles.border]}>
            <View style={{ flex: 1 }}>
              <T v="body" style={{ fontSize: 14, fontFamily: fonts.semibold }}>
                {p.periodType ? KIND[p.periodType] ?? p.periodType : 'Payout'}
                {p.period ? ` · ${p.period.slice(0, 7)}` : ''}
              </T>
              <T v="caption">
                Announced {fmtDay(p.announced)}
                {p.bookClosure ? ` · book closure ${fmtDay(p.bookClosure)}` : ''}
              </T>
            </View>
            <T v="mono" style={{ fontSize: 14 }}>
              {p.dps > 0 ? `Rs ${p.dps.toFixed(2)}` : ''}
              {p.bonusPct > 0 ? `${p.dps > 0 ? ' + ' : ''}${p.bonusPct}% bonus` : ''}
              {p.dps === 0 && p.bonusPct === 0 ? '—' : ''}
            </T>
          </View>
        ))}
      </View>
      <T v="caption" style={{ lineHeight: 18 }}>
        PSX announces dividends as a % of face value; Sahm takes face value as Rs {d.faceValue}, the value that matches PSX's published yield.
        To receive a dividend, buy at least two working days before book closure starts (PSX settles a day after the trade). Tax status is set in Settings.
      </T>
    </Panel>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    next: { backgroundColor: colors.upSoft, borderRadius: 8, padding: 8 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 10 },
    border: { borderTopWidth: 1, borderTopColor: colors.hairline },
  }),
);
