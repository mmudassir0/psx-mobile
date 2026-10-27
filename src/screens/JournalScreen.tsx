/** Search your notes and trades: "why did I buy LUCK", "banks", "sold 2025". */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay, fmtNum } from '../format';
import { notesPref } from '../portfolio/notes';
import { tradesPref } from '../portfolio/trades';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { searchJournal, type Hit, type JournalNote } from '../portfolio/journal';
import { Panel } from '../ui/bits';
import { Empty, Icon, IconButton, T } from '../ui/kit';

const day = (d: string) => fmtDay(Date.parse(d + 'T12:00:00Z'));

export default function JournalScreen() {
  const nav = useNavigation();
  const notes = notesPref.use();
  const trades = tradesPref.use();
  const { holdings } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const [q, setQ] = useState('');
  const noteList: JournalNote[] = useMemo(() => Object.entries(notes).map(([symbol, n]) => ({ symbol, ...n })), [notes]);
  const known = useMemo(() => new Set([...stocks.map((s) => s.symbol), ...holdings.map((h) => h.symbol), ...noteList.map((n) => n.symbol), ...trades.map((t) => t.symbol)]), [stocks, holdings, noteList, trades]);
  const { hits, query } = useMemo(() => searchJournal(q, noteList, trades, known), [q, noteList, trades, known]);
  // with nothing typed: your notes, newest first
  const shown: Hit[] = useMemo(
    () => (q.trim() ? hits : noteList.map((n): Hit => ({ kind: 'note', day: new Date(n.at + 5 * 3600_000).toISOString().slice(0, 10), symbol: n.symbol, note: n, score: 0 })).sort((a, b) => (a.day < b.day ? 1 : -1))),
    [q, hits, noteList],
  );
  const empty = !noteList.length && !trades.length;
  const examples = [noteList[0] ? `why did I buy ${noteList[0].symbol}` : null, trades.length ? `sold ${trades[trades.length - 1].day.slice(0, 4)}` : null, 'dividend'].filter(Boolean) as string[];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          My journal
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {empty ? (
          <Empty title="Nothing written yet" body="Write a note on a stock (on its page, or under a holding) and record trades with 'Bought or sold'. Then you can search them here." />
        ) : (
          <>
            <View style={styles.search}>
              <Icon name="search" size={18} color={colors.faint} />
              <TextInput
                value={q}
                onChangeText={setQ}
                autoFocus
                placeholder="Ask your notes, e.g. why did I buy…"
                placeholderTextColor={colors.faint}
                style={styles.input}
                accessibilityLabel="Search your notes and trades"
              />
            </View>
            {!q.trim() ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {examples.map((e) => (
                  <Pressable key={e} accessibilityRole="button" onPress={() => setQ(e)} style={styles.chip}>
                    <T style={{ fontSize: 13, color: colors.text2 }}>{e}</T>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {q.trim() && !hits.length ? (
              <Empty
                title="Nothing found"
                body={query.symbols.length ? `No notes or trades for ${query.symbols.join(', ')}${query.side ? ` (${query.side === 'buy' ? 'buys' : 'sales'})` : ''}.` : 'Try a symbol, or a word from your notes.'}
              />
            ) : null}
            {shown.length ? (
              <Panel style={{ paddingVertical: 4 }}>
                {shown.slice(0, 80).map((h, i, all) => (
                  <Pressable key={`${h.kind}${h.symbol}${h.day}${i}`} accessibilityRole="button" onPress={() => nav.navigate('Stock', { symbol: h.symbol })} style={[styles.row, i < all.length - 1 && styles.border]}>
                    <T style={{ fontSize: 15, width: 24 }}>{h.kind === 'note' ? '📝' : h.trade.side === 'buy' ? '🟢' : '🔴'}</T>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                        <T style={{ fontFamily: fonts.bold, fontSize: 14, flex: 1 }}>
                          {h.symbol}
                          {h.kind === 'trade' ? ` · ${h.trade.side === 'buy' ? 'bought' : 'sold'} ${fmtNum(h.trade.shares, 0)} at Rs ${h.trade.price.toFixed(2)}` : ''}
                        </T>
                        <T v="caption">{day(h.day)}</T>
                      </View>
                      {h.kind === 'note' ? (
                        <>
                          <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>
                            “{h.note.why}”
                          </T>
                          <T v="caption" style={{ fontSize: 11.5 }}>
                            {[
                              h.note.then.price != null ? `Then Rs ${h.note.then.price.toFixed(2)}` : null,
                              bySymbol.get(h.symbol)?.price ? `now Rs ${bySymbol.get(h.symbol)!.price!.toFixed(2)}` : null,
                              h.note.then.divYield != null ? `yield then ${h.note.then.divYield.toFixed(1)}%` : null,
                              h.note.checkOn ? `look again ${day(h.note.checkOn)}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </T>
                        </>
                      ) : h.trade.realised != null ? (
                        <T v="caption" style={{ color: h.trade.realised >= 0 ? colors.up : colors.downText }}>
                          {h.trade.realised >= 0 ? 'Profit' : 'Loss'} Rs {fmtNum(Math.abs(Math.round(h.trade.realised)), 0)}
                        </T>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </Panel>
            ) : null}
            <T v="caption" style={{ lineHeight: 17 }}>
              Searches only what's on this phone: your notes and the trades recorded in Sahm.
            </T>
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
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 14 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14 },
    input: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 15, paddingVertical: 0 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.surface },
    row: { flexDirection: 'row', gap: 10, paddingVertical: 11 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
