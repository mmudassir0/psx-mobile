import React, { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, space, tabular, themed } from '../../theme';
import { fmtCompact, fmtDay, fmtNum, fmtPct } from '../../format';
import type { CompanyInfo, FinTable, Stock } from '../../psx/types';
import { KV, Panel } from '../../ui/bits';
import { balanceSheetFor, computeRatios } from '../../analysis/ratios';
import { Loading, Section, Segmented, T } from '../../ui/kit';
import { FairValueCard } from '../../ui/FairValueCard';
import { FairValue, MIN_PEERS } from '../../analysis/fairValue';

/** PSX reports money in thousands of rupees, EPS and ratios as-is. */
function cell(label: string, v: number | null): string {
  if (v == null) return '—';
  if (/EPS$/i.test(label)) return fmtNum(v, 2);
  if (/%|PEG/i.test(label)) return fmtNum(v, 2);
  return fmtCompact(v * 1000);
}

function shortLabel(label: string): string {
  return label
    .replace('Profit after Taxation', 'Profit after tax')
    .replace('Gross Profit Margin (%)', 'Gross margin')
    .replace('Net Profit Margin (%)', 'Net margin')
    .replace('EPS Growth (%)', 'EPS growth');
}

function Table({ t }: { t: FinTable }) {
  return (
    <Panel style={{ paddingVertical: 8 }}>
      <View style={[styles.tr, styles.border]}>
        <T v="caption" style={styles.th0}>
          {' '}
        </T>
        {t.periods.map((p) => (
          <T key={p} v="caption" style={styles.th}>
            {p}
          </T>
        ))}
      </View>
      {t.rows.map((r, i) => (
        <View key={r.label} style={[styles.tr, i < t.rows.length - 1 && styles.border]}>
          <T v="body" style={styles.td0} numberOfLines={2}>
            {shortLabel(r.label)}
          </T>
          {r.values.map((v, j) => (
            <T key={j} style={[styles.td, { color: v != null && v < 0 ? colors.downText : colors.text }]}>
              {cell(r.label, v)}
            </T>
          ))}
        </View>
      ))}
    </Panel>
  );
}

/** EPS per period as bars, oldest on the left. */
function EpsBars({ t }: { t: FinTable }) {
  const row = t.rows.find((r) => /^EPS$/i.test(r.label));
  if (!row) return null;
  const pts = t.periods.map((p, i) => ({ p, v: row.values[i] })).reverse();
  const max = Math.max(...pts.map((x) => Math.abs(x.v ?? 0)), 0.01);
  return (
    <Panel style={{ paddingVertical: 16, gap: 10 }}>
      <T v="label">Earnings per share (Rs.)</T>
      <View style={styles.bars}>
        {pts.map((x) => (
          <View key={x.p} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <T v="mono" style={{ fontSize: 13, color: x.v != null && x.v < 0 ? colors.downText : colors.text }}>
              {x.v == null ? '—' : fmtNum(x.v, 2)}
            </T>
            <View style={styles.barWell}>
              <View
                style={{
                  height: `${(Math.abs(x.v ?? 0) / max) * 100}%`,
                  backgroundColor: x.v != null && x.v < 0 ? colors.down : colors.gold,
                  borderRadius: 6,
                }}
              />
            </View>
            <T v="caption" numberOfLines={1}>
              {x.p}
            </T>
          </View>
        ))}
      </View>
    </Panel>
  );
}

const pct = (v: number | null) => (v == null ? '—' : fmtPct(v * 100, false));
const x = (v: number | null, suffix = '×') => (v == null ? '—' : fmtNum(v, 2) + suffix);
const rs = (v: number | null) => (v == null ? '—' : `Rs. ${fmtCompact(v)}`);

export function FundamentalsTab({ company, stock, err, fair }: { company: CompanyInfo | null; stock?: Stock; err: string | null; fair?: FairValue | null }) {
  const [period, setPeriod] = useState<'annual' | 'quarterly'>('annual');
  const bs = useMemo(() => balanceSheetFor(company?.symbol ?? stock?.symbol ?? ''), [company?.symbol, stock?.symbol]);
  const r = useMemo(() => computeRatios(bs, company, stock), [bs, company, stock]);
  if (!company) return err ? <T v="caption">Couldn't load company data: {err}</T> : <Loading />;

  const fin = period === 'annual' ? company.financialsAnnual : company.financialsQuarterly;
  const annualEps = company.financialsAnnual?.rows.find((r) => /^EPS$/i.test(r.label))?.values[0] ?? null;
  const price = stock?.price ?? company.close;
  const floatShares = company.shares != null && company.freeFloatPct != null ? (company.shares * company.freeFloatPct) / 100 : null;

  return (
    <View style={{ gap: space.section }}>
      <Section title="Fair value">
        {fair && price ? (
          <FairValueCard f={fair} price={price} />
        ) : (
          <T v="caption" style={{ lineHeight: 18 }}>
            Not enough data to estimate a fair value: it needs profits with at least {MIN_PEERS} comparable companies in the
            sector, or the balance sheet.
          </T>
        )}
      </Section>

      <Section title="Valuation">
        <Panel>
          <KV label="P/E ratio" sub="Trailing 12 months" value={company.pe != null ? fmtNum(company.pe) : '—'} />
          <KV
            label="Earnings per share"
            sub={company.financialsAnnual ? `Fiscal ${company.financialsAnnual.periods[0]}` : undefined}
            value={annualEps != null ? `Rs. ${fmtNum(annualEps)}` : '—'}
          />
          <KV
            label="Earnings yield"
            value={annualEps != null && price ? fmtPct((annualEps / price) * 100, false) : '—'}
          />
          <KV label="Price to book" sub={r.bookValuePerShare != null ? `Book value Rs. ${fmtNum(r.bookValuePerShare)} a share` : undefined} value={x(r.priceToBook)} />
          <KV label="Price to sales" value={x(r.priceToSales)} />
          <KV label="Dividend yield" value={stock?.divYield != null ? fmtPct(stock.divYield, false) : '—'} />
          <KV label="Payout ratio" sub={r.dividendCover != null ? `Dividend covered ${fmtNum(r.dividendCover, 1)}× by earnings` : undefined} value={pct(r.payoutRatio)} />
          <KV label="Market cap" value={company.marketCap != null ? `Rs. ${fmtCompact(company.marketCap)}` : '—'} />
          <KV label="1-year change" value={fmtPct(company.change1y)} color={(company.change1y ?? 0) < 0 ? colors.downText : undefined} />
          <KV label="Year to date" value={fmtPct(company.ytd)} color={(company.ytd ?? 0) < 0 ? colors.downText : undefined} last />
        </Panel>
      </Section>

      <Section title="Results">
        <Segmented
          options={[
            { key: 'annual', label: 'Annual' },
            { key: 'quarterly', label: 'Quarterly' },
          ]}
          value={period}
          onChange={setPeriod}
        />
        {fin ? (
          <>
            <EpsBars t={fin} />
            <Table t={fin} />
            <T v="caption">Sales and profit in rupees. Fiscal year ends in {company.fiscalYearEnd ?? '—'}.</T>
          </>
        ) : (
          <T v="caption">PSX has no {period} results for this company.</T>
        )}
      </Section>

      {company.ratios ? (
        <Section title="Ratios">
          <Table t={company.ratios} />
          <T v="caption">Margins and growth in %. PEG = P/E divided by EPS growth; below 1 can mean growth is cheap.</T>
        </Section>
      ) : null}

      <Section title="Returns and balance sheet">
        {bs ? (
          <>
            <Panel>
              <KV label="Return on equity (ROE)" sub={r.profitBasis === 'ttm' ? 'Trailing 12-month profit ÷ equity' : 'Fiscal-year profit ÷ equity'} value={pct(r.roe)} />
              <KV label="Return on assets (ROA)" value={pct(r.roa)} />
              {!bs.isBank ? <KV label="Current ratio" sub="Current assets ÷ current liabilities" value={x(r.currentRatio, ' : 1')} /> : null}
              <KV label="Debt to equity" sub="Interest-bearing borrowings ÷ equity" value={pct(r.debtToEquity)} />
              <KV label="Liabilities to equity" value={pct(r.liabilitiesToEquity)} />
              <KV label="Equity to assets" value={pct(r.equityToAssets)} last />
            </Panel>
            <Panel>
              <KV label="Total assets" value={rs(bs.assets)} />
              <KV label="Shareholders' equity" value={rs(bs.equity)} />
              <KV label="Total liabilities" value={rs(bs.liabilities)} />
              {bs.borrowings != null ? <KV label="Borrowings" value={rs(bs.borrowings)} /> : null}
              {bs.cash != null ? <KV label="Cash and bank" value={rs(bs.cash)} /> : null}
              {!bs.isBank && bs.currentAssets != null ? <KV label="Current assets" value={rs(bs.currentAssets)} /> : null}
              {!bs.isBank && bs.currentLiabilities != null ? <KV label="Current liabilities" value={rs(bs.currentLiabilities)} last /> : null}
            </Panel>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(bs.source.url)}>
              <T v="caption" style={{ lineHeight: 18 }}>
                {bs.statement === 'consolidated' ? 'Consolidated' : 'Standalone'} balance sheet
                {bs.periodEnd ? ` as at ${fmtDay(Date.parse(bs.periodEnd + 'T12:00:00Z'))}` : ''}, from the company's report
                filed {fmtDay(Date.parse(bs.source.date + 'T12:00:00Z'))} (page {bs.source.pages.join(', ')}).{' '}
                <T v="caption" style={{ color: colors.gold }}>
                  Open report
                </T>
              </T>
            </Pressable>
          </>
        ) : (
          <T v="caption" style={{ lineHeight: 18 }}>
            ROE, ROA, book value, current ratio and debt ratios need the balance sheet from this company's latest report. It
            hasn't been read yet; it arrives with a future update.
          </T>
        )}
      </Section>

      <Section title="Shares">
        <Panel>
          <KV label="Total shares" value={fmtCompact(company.shares)} />
          <KV label="Free float" value={floatShares != null ? fmtCompact(floatShares) : '—'} />
          <KV label="Free float %" value={company.freeFloatPct != null ? fmtPct(company.freeFloatPct, false) : '—'} last />
        </Panel>
      </Section>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 6 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    th0: { flex: 1.35 },
    th: { flex: 1, textAlign: 'right', fontFamily: fonts.semibold },
    td0: { flex: 1.35, fontSize: 13.5, lineHeight: 18, color: colors.text2 },
    td: { flex: 1, textAlign: 'right', fontSize: 13.5, fontFamily: fonts.monoMedium, ...tabular },
    bars: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
    barWell: { height: 90, width: '70%', justifyContent: 'flex-end' },
  }),
);
