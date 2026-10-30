/** Your cap on each sector's share of your money, with a warning on Home when one goes over. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtNum } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { shortSector } from '../sectors';
import { sectorLimitsPref, sectorShares, setLimit } from '../portfolio/sectorLimits';
import { Panel } from '../ui/bits';
import { Empty, IconButton, Section, T, ScreenHeader } from '../ui/kit';

const rs = (v: number) => `Rs ${fmtNum(Math.round(v), 0)}`;

function Pct({ value, placeholder, onDone, label }: { value: number | null; placeholder: string; onDone: (v: number | null) => void; label: string }) {
  const [t, setT] = useState(value == null ? '' : String(value));
  useEffect(() => setT(value == null ? '' : String(value)), [value]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <TextInput
        value={t}
        onChangeText={setT}
        onBlur={() => onDone(t.trim() === '' ? null : Number(t.replace(',', '.')))}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        accessibilityLabel={label}
        style={styles.input}
      />
      <T v="caption">%</T>
    </View>
  );
}

export default function SectorLimitsScreen() {
  const nav = useNavigation();
  const { holdings, loaded } = useHoldings();
  const { bySymbol } = useMarket();
  const limits = sectorLimitsPref.use();
  const rows = useMemo(
    () =>
      sectorShares(
        holdings.map((h) => {
          const s = bySymbol.get(h.symbol);
          return { symbol: h.symbol, sector: s?.sector ? shortSector(s.sector) : 'Other', value: (s?.price ?? 0) * h.shares };
        }),
        limits,
      ),
    [holdings, bySymbol, limits],
  );
  const over = rows.filter((r) => r.over > 0);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Sector limits" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loaded && !holdings.length ? (
          <Empty title="No holdings yet" body="Add your holdings to set sector limits." />
        ) : (
          <>
            <Panel style={{ paddingVertical: 12, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <T style={{ flex: 1, fontSize: 14 }}>Limit for every sector</T>
                <Pct value={limits.all} placeholder="none" label="Limit for every sector" onDone={(v) => sectorLimitsPref.set(setLimit(limits, null, v))} />
              </View>
              <T v="caption" style={{ lineHeight: 17 }}>
                Many investors keep any one sector under 25–35% so one bad year for banks or cement doesn't sink the whole portfolio. Set your own figure, or one per sector below.
              </T>
            </Panel>
            {over.length ? (
              <Panel style={{ paddingVertical: 12, gap: 4, borderWidth: 1, borderColor: colors.down }}>
                {over.map((r) => (
                  <T key={r.sector} v="body" style={{ fontSize: 14, lineHeight: 20 }}>
                    <T style={{ fontFamily: fonts.bold }}>{r.sector}</T> is {(r.share * 100).toFixed(0)}% of your money, over your {r.limit}%: about {rs(r.over)} more than the limit.
                  </T>
                ))}
                <T v="caption" style={{ lineHeight: 17 }}>
                  To get back under it, put new money into other sectors (Rebalance shows how), or trim.
                </T>
              </Panel>
            ) : rows.some((r) => r.limit != null) ? (
              <T v="caption" style={{ color: colors.up }}>
                Every sector is within your limits.
              </T>
            ) : null}
            <Section title="Your sectors">
              <Panel style={{ paddingVertical: 4 }}>
                {rows.map((r, i) => (
                  <View key={r.sector} style={[styles.row, i < rows.length - 1 && styles.border]}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                        <T style={{ fontFamily: fonts.semibold, fontSize: 14, flex: 1 }}>{r.sector}</T>
                        <T v="mono" style={{ fontSize: 13.5, color: r.over > 0 ? colors.downText : colors.text }}>
                          {(r.share * 100).toFixed(1)}%
                        </T>
                      </View>
                      <View style={styles.track}>
                        <View style={{ width: `${Math.min(100, r.share * 100)}%`, height: 6, borderRadius: 3, backgroundColor: r.over > 0 ? colors.down : colors.gold }} />
                        {r.limit != null ? <View style={[styles.mark, { left: `${Math.min(100, r.limit)}%` }]} /> : null}
                      </View>
                      <T v="caption" style={{ fontSize: 11.5 }} numberOfLines={1}>
                        {rs(r.value)} · {r.symbols.join(', ')}
                      </T>
                    </View>
                    <Pct
                      value={limits.per[r.sector] ?? null}
                      placeholder={limits.all != null ? String(limits.all) : '–'}
                      label={`Limit for ${r.sector}`}
                      onDone={(v) => sectorLimitsPref.set(setLimit(limits, r.sector, v))}
                    />
                  </View>
                ))}
              </Panel>
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    track: { height: 6, borderRadius: 3, backgroundColor: colors.surface2, justifyContent: 'center' },
    mark: { position: 'absolute', width: 2, height: 12, backgroundColor: colors.text, marginLeft: -1 },
    input: {
      width: 56,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface2,
      color: colors.text,
      fontFamily: fonts.medium,
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: 0,
    },
  }),
);
