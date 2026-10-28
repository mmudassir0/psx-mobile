import React, { useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useUser } from '../store/user';
import { VoiceButton } from '../ui/VoiceButton';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, themed } from '../theme';
import { fmtCompact, fmtPct } from '../format';
import { useMarket } from '../store/market';
import { usePicksFeed } from '../picks/feed';
import { chatContext } from '../ai/chat';
import { isLabQuestion, labResultText } from '../lab/aiLab';
import { labPrompt, readLabReply } from '../lab/aiStrategy';
import { labAskedPref, loadLab, rememberHunted } from '../lab/store';
import { runBacktest } from '../lab/engine';
import { BASE } from '../lab/templates';
import { PORTFOLIO_QUESTIONS, portfolioContext } from '../ai/portfolioContext';
import { useHoldings } from '../portfolio/holdings';
import { useReviews } from '../portfolio/useReviews';
import { snapshots, trackReturns, indexReturns, type Snap } from '../portfolio/track';
import { cached } from '../psx/cache';
import { fetchSeries } from '../psx/api';
import type { SeriesPoint } from '../psx/types';
import { CHAT_SYSTEM } from '../ai/context';
import type { ChatMessage, Generation } from '../ai/models';
import { useAi } from '../store/ai';
import { ModelCard } from '../ui/ModelCard';
import { shareToApp } from '../ai/share';
import { Md } from '../ui/Md';
import { Card, Icon, T } from '../ui/kit';

const SUGGESTIONS = ['How is the market doing today?', 'Compare LUCK and DGKC', 'Shariah banks with the best dividend yield', 'Which cement stock looks cheapest?'];

interface Turn {
  q: string;
  a: string;
  status: 'reading' | 'writing' | 'done' | 'error';
  note?: string;
  /** the full prompt, for "Ask in another app" */
  prompt?: ChatMessage[];
  /** asked about my portfolio (follow-ups keep it) */
  mine?: boolean;
  /** a backtest the lab ran for this question, to open */
  lab?: string;
}

/** Market snapshot plus "Ask Sahm": questions answered by the online AI from live PSX data. */
export default function AIScreen() {
  const nav = useNavigation();
  const { stocks, indices, bySymbol } = useMarket();
  const { holdings } = useHoldings();
  const { watchlist: voiceWatch } = useUser();
  const voiceSymbols = useMemo(() => [...new Set([...holdings.map((h) => h.symbol), ...voiceWatch])], [holdings, voiceWatch]);
  const { rows } = useReviews(holdings, stocks, bySymbol, null);
  const [last30, setLast30] = useState<{ you: number | null; kse: number | null }>({ you: null, kse: null });
  React.useEffect(() => {
    // the last 30 days' tracked return against the KSE-100, for "how did I do" questions
    (async () => {
      const snaps: Snap[] = await snapshots();
      const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const list = snaps.filter((s) => s.day >= from);
      if (list.length < 2) return;
      const tr = trackReturns(list);
      const kse = await cached<SeriesPoint[]>('eod:KSE100', 30 * 60_000, () => fetchSeries('eod', 'KSE100'), { persist: true }).catch(() => [] as SeriesPoint[]);
      const ix = indexReturns(
        kse,
        tr.map((t) => t.day),
      );
      setLast30({ you: tr[tr.length - 1].ret, kse: ix[ix.length - 1] });
    })().catch(() => {});
  }, []);
  const { market } = usePicksFeed();
  const ai = useAi();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [voiceMsg, setVoiceMsg] = useState<string | null>(null);
  const handle = useRef<Generation | null>(null);
  const scroll = useRef<ScrollView>(null);
  const busy = turns.some((t) => t.status === 'reading' || t.status === 'writing');

  const snap = useMemo(() => {
    const traded = stocks.filter((s) => (s.volume ?? 0) > 0 && s.changePct != null);
    const up = traded.filter((s) => (s.changePct as number) > 0).length;
    const down = traded.filter((s) => (s.changePct as number) < 0).length;
    const flat = traded.length - up - down;
    const volume = traded.reduce((sum, s) => sum + (s.volume ?? 0), 0);
    const shariah = traded.filter((s) => s.shariah);
    const shUp = shariah.filter((s) => (s.changePct as number) > 0).length;
    const best = [...traded].filter((s) => (s.volume ?? 0) >= 100_000).sort((a, b) => (b.changePct as number) - (a.changePct as number))[0];
    const busiest = [...traded].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0];
    return { traded: traded.length, up, down, flat, volume, shariah: shariah.length, shUp, best, busiest };
  }, [stocks]);

  const kse = indices.find((i) => i.code === 'KSE100');
  const kmi = indices.find((i) => i.code === 'KMI30');
  const breadth = snap.traded ? (snap.up / snap.traded) * 100 : 0;

  const patch = (i: number, p: Partial<Turn>) => setTurns((ts) => ts.map((t, k) => (k === i ? { ...t, ...p } : t)));

  const ask = async (question: string, mine = false) => {
    const q = question.trim();
    if (!q || busy || !ai.available) return;
    const idx = turns.length;
    const history = turns.filter((t) => t.status === 'done').slice(-2);
    // typed questions about "my portfolio / my holdings", and follow-ups to one, get the portfolio too
    mine = mine || /\b(my|mine|i own|i hold)\b/i.test(q) || history.some((t) => t.mine);
    setTurns((ts) => [...ts, { q, a: '', status: 'reading', mine }]);
    setInput('');
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    try {
      const base = await chatContext(q, stocks, indices, market);
      // a backtest question: the AI turns it into rules, the lab runs them, and the answer comes from the result
      let labText: string | null = null;
      if (isLabQuestion(q)) {
        try {
          patch(idx, { note: 'Building a backtest in the lab…' });
          const lab = await loadLab();
          if (lab) {
            const start = { ...BASE, id: `ai-${Date.now().toString(36)}`, name: 'From the AI chat' };
            const rr = await ai.run(
              () => labPrompt(q, start),
              () => {},
              700,
            );
            const got = readLabReply(await rr.gen.done, start);
            if (got) {
              const res = runBacktest(lab, got.strategy);
              rememberHunted([got.strategy]);
              const asked = await labAskedPref.get();
              await labAskedPref.set([{ q, at: new Date().toISOString().slice(0, 10), strategy: { ...got.strategy, name: q.length > 40 ? `${q.slice(0, 38)}…` : q } }, ...asked].slice(0, 20));
              labText = labResultText(lab, got.strategy, res) + (got.note ? `\nAssumed: ${got.note}` : '');
              patch(idx, { lab: got.strategy.id });
            }
          }
        } catch {
          // answer without the lab
        }
      }
      const mineText = mine && rows.length ? portfolioContext(rows, { tracked30: last30.you, index30: last30.kse }) : null;
      const text = [labText, mineText, base.text].filter(Boolean).join('\n\n');
      const compact = [labText, mineText, base.compact].filter(Boolean).join('\n\n');
      const symbols = base.symbols;
      patch(idx, { status: 'writing', note: symbols.length ? `Read live data for ${symbols.join(', ')}` : undefined });
      const build = (tier: 'small' | 'large'): ChatMessage[] => {
        const m: ChatMessage[] = [{ role: 'system', content: `${CHAT_SYSTEM}\n----------\n${tier === 'small' ? compact : text}` }];
        for (const h of history) m.push({ role: 'user', content: h.q }, { role: 'assistant', content: h.a });
        m.push({ role: 'user', content: q });
        return m;
      };
      patch(idx, { prompt: build('large') });
      const r = await ai.run(build, (a) => patch(idx, { a }), 500);
      handle.current = r.gen;
      const a = await r.gen.done;
      patch(idx, { a, status: 'done', note: `${symbols.length ? `Read live data for ${symbols.join(', ')} · ` : ''}${r.engine()}` });
    } catch (e) {
      patch(idx, { status: 'error', note: (e as Error).message });
    } finally {
      handle.current = null;
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  const ready = ai.available;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.mark}>
              <Icon name="ai" size={20} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="h1" style={{ fontSize: 20 }}>
                Sahm AI
              </T>
              <T v="caption">Answers from live PSX data, written on your phone</T>
            </View>
          </View>

          {!ai.available ? <ModelCard /> : null}

          {turns.length === 0 ? (
            <>
              <Card style={{ gap: 12 }}>
                <T v="title" style={{ fontSize: 15 }}>
                  Today at a glance
                </T>
                <T v="body" style={{ color: colors.text2 }}>
                  {kse ? `KSE-100 is ${kse.changePct != null && kse.changePct >= 0 ? 'up' : 'down'} ${fmtPct(Math.abs(kse.changePct ?? 0), false)}` : 'Index data is loading'}
                  {kmi ? `, KMI-30 ${kmi.changePct != null && kmi.changePct >= 0 ? 'up' : 'down'} ${fmtPct(Math.abs(kmi.changePct ?? 0), false)}.` : '.'}{' '}
                  {snap.traded ? `${snap.up} of ${snap.traded} traded stocks rose, ${snap.down} fell. ${fmtCompact(snap.volume)} shares changed hands.` : ''}
                </T>
                {snap.traded ? (
                  <View style={{ gap: 6 }}>
                    <View style={styles.breadth}>
                      <View style={{ flex: snap.up, backgroundColor: colors.up }} />
                      <View style={{ flex: snap.flat, backgroundColor: colors.faint }} />
                      <View style={{ flex: snap.down, backgroundColor: colors.down }} />
                    </View>
                    <T v="caption">
                      ▲ {snap.up} advancing · {snap.flat} unchanged · ▼ {snap.down} declining ({breadth.toFixed(0)}% up)
                    </T>
                  </View>
                ) : null}
                {snap.best ? (
                  <T v="caption" style={{ lineHeight: 18 }}>
                    Biggest liquid gainer: {snap.best.symbol} {fmtPct(snap.best.changePct)}. Most traded: {snap.busiest?.symbol} ({fmtCompact(snap.busiest?.volume)} shares). Shariah stocks: {snap.shUp} of {snap.shariah}{' '}
                    up.
                  </T>
                ) : null}
              </Card>

              {rows.length ? (
                <View style={{ gap: 10 }}>
                  <T v="title" style={{ fontSize: 15 }}>
                    About my portfolio
                  </T>
                  <T v="caption">Your holdings, gains and Sahm's view of each are sent with the question.</T>
                  {PORTFOLIO_QUESTIONS.map((sug) => (
                    <Pressable
                      key={sug}
                      accessibilityRole="button"
                      disabled={!ready}
                      onPress={() => ask(sug, true)}
                      style={({ pressed }) => [styles.suggestion, { borderWidth: 1, borderColor: colors.goldSoft }, (!ready || pressed) && { opacity: 0.55 }]}
                    >
                      <T style={{ fontSize: 15 }}>💼</T>
                      <T v="body" style={{ fontSize: 14.5, flex: 1 }}>
                        {sug}
                      </T>
                      <Icon name="chevron" size={16} color={colors.faint} />
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View style={{ gap: 10 }}>
                <T v="title" style={{ fontSize: 15 }}>
                  Ask Sahm
                </T>
                {SUGGESTIONS.map((sug) => (
                  <Pressable key={sug} accessibilityRole="button" disabled={!ready} onPress={() => ask(sug)} style={({ pressed }) => [styles.suggestion, (!ready || pressed) && { opacity: 0.55 }]}>
                    <T v="body" style={{ fontSize: 14.5, flex: 1 }}>
                      {sug}
                    </T>
                    <Icon name="chevron" size={16} color={colors.faint} />
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            turns.map((t, i) => (
              <View key={i} style={{ gap: 10 }}>
                <View style={styles.userBubble}>
                  <T v="body" style={{ fontSize: 14.5, color: colors.text }}>
                    {t.q}
                  </T>
                </View>
                <View style={styles.answer}>
                  {t.status === 'reading' ? (
                    <T v="caption">Reading the market data…</T>
                  ) : t.a ? (
                    <Md text={t.a + (t.status === 'writing' ? ' ▍' : '')} size={14.5} />
                  ) : t.status === 'writing' ? (
                    <T v="caption">Thinking…</T>
                  ) : null}
                  {t.note ? (
                    <T v="caption" style={{ color: t.status === 'error' ? colors.downText : colors.faint }}>
                      {t.status === 'error' ? `Stopped: ${t.note}` : t.note}
                    </T>
                  ) : null}
                  {t.lab && t.status === 'done' ? (
                    <Pressable accessibilityRole="button" onPress={() => nav.navigate('LabResult', { id: t.lab! })} hitSlop={8}>
                      <T style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.gold }}>🧪 Open this test in the lab ›</T>
                    </Pressable>
                  ) : null}
                  {t.prompt && (t.status === 'done' || t.status === 'error') ? (
                    <Pressable accessibilityRole="button" onPress={() => shareToApp(t.prompt!, t.q)} hitSlop={8}>
                      <T style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.gold }}>Ask in Gemini, Claude or ChatGPT ›</T>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))
          )}
          <T v="caption" style={{ lineHeight: 18 }}>
            Answers use only the data Sahm sends with each question. Information, not investment advice.
          </T>
        </ScrollView>

        {voiceMsg ? (
          <T v="caption" style={{ paddingHorizontal: 18, paddingVertical: 6, backgroundColor: colors.nav }}>
            {voiceMsg}
          </T>
        ) : null}
        <View style={styles.inputBar}>
          {Platform.OS !== 'web' ? (
            <VoiceButton
              symbols={voiceSymbols}
              disabled={!ready || busy}
              onStatus={setVoiceMsg}
              onText={(t) => {
                setInput(t);
                ask(t);
              }}
            />
          ) : null}
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={ready ? 'Ask about a stock, sector or the market' : 'Set up AI in Settings to ask questions'}
            placeholderTextColor={colors.faint}
            editable={ready && !busy}
            onSubmitEditing={() => ask(input)}
            returnKeyType="send"
            style={styles.input}
          />
          {busy ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Stop" onPress={() => handle.current?.stop()} style={styles.send}>
              <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: colors.onGold }} />
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!ready || !input.trim()} onPress={() => ask(input)} style={[styles.send, (!ready || !input.trim()) && { opacity: 0.4 }]}>
              <Icon name="chevron" size={20} color={colors.onGold} />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    content: { paddingHorizontal: 20, paddingTop: 8, gap: 18, paddingBottom: 24 },
    mark: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
    breadth: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.surface2 },
    suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
    userBubble: { alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: colors.goldSoft, borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10 },
    answer: { gap: 8, paddingRight: 8 },
    inputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.navLine, backgroundColor: colors.nav },
    input: { flex: 1, height: 46, borderRadius: 23, backgroundColor: colors.surface, paddingHorizontal: 18, fontFamily: fonts.regular, fontSize: 15, color: colors.text },
    send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  }),
);
