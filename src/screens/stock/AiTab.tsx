import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors, space } from '../../theme';
import { fmtDateTime } from '../../format';
import { analysisMessages, StockPack, stockContext } from '../../ai/context';
import { decide, verdictText } from '../../ai/verdict';
import type { Generation } from '../../ai/models';
import { useAi } from '../../store/ai';
import { load, save } from '../../storage';
import { ModelCard } from '../../ui/ModelCard';
import { Md } from '../../ui/Md';
import { Panel } from '../../ui/bits';
import { VerdictCard } from '../../ui/VerdictCard';
import { Button, Loading, Section, T } from '../../ui/kit';

interface Saved {
  day: string;
  at: number;
  model: string;
  text: string;
}

const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10); // PKT date

/** Rule-based verdict (instant) plus an AI explanation of it. */
export function AiTab({ symbol, pack, ready }: { symbol: string; pack: StockPack; ready: boolean }) {
  const ai = useAi();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [engine, setEngine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showData, setShowData] = useState(false);
  const handle = useRef<Generation | null>(null);
  const key = `ai.explain.${symbol}`;
  const context = useMemo(() => (ready ? stockContext(pack) : ''), [ready, pack]);
  const compact = useMemo(() => (ready ? stockContext(pack, true) : ''), [ready, pack]);
  const verdict = useMemo(() => (ready ? decide(pack) : null), [ready, pack]);

  useEffect(() => {
    load<Saved | null>(key, null).then((s) => s && s.day === today() && setSaved(s));
    return () => handle.current?.stop();
  }, [key]);

  const run = async () => {
    if (!ai.available || !context || !verdict) return;
    setError(null);
    setText('');
    setSaved(null);
    setRunning(true);
    try {
      const r = await ai.run((tier) => analysisMessages(tier === 'small' ? compact : context, verdictText(verdict), verdict.call, tier), setText, 450);
      handle.current = r.gen;
      setEngine(r.engine());
      const out = await r.gen.done;
      setEngine(r.engine());
      if (out.trim()) {
        const s = { day: today(), at: Date.now(), model: r.engine(), text: out };
        setSaved(s);
        save(key, s);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      handle.current = null;
    }
  };

  const shown = running ? text : saved?.text ?? text;

  if (!ready) return <Loading />;

  return (
    <View style={{ gap: space.section }}>
      <Section title="Sahm verdict">
        {verdict ? <VerdictCard v={verdict} /> : <T v="caption">Not enough trading history for a verdict yet.</T>}
        <T v="caption" style={{ lineHeight: 18 }}>
          Decided by fixed rules from the technicals and the company's results; the same data always gives the same verdict.
        </T>
      </Section>

      {verdict ? (
        <Section title="AI explanation">
          {!ai.available ? <ModelCard /> : null}
          <Panel style={{ paddingVertical: 16, gap: 12 }}>
            {shown ? (
              <Md text={shown + (running ? ' ▍' : '')} />
            ) : (
              <T v="body" style={{ color: colors.text2 }}>
                The AI reads all of this stock's data and explains the verdict in plain words: why, what to watch, the risks and
                what recent announcements suggest.
              </T>
            )}
            {running && !text ? (
              <T v="caption">{ai.phase === 'loading' ? 'Loading the on-phone model…' : `Reading the data${engine ? ` · ${engine}` : ''}…`}</T>
            ) : null}
            {error ? <T v="caption" style={{ color: colors.downText }}>Stopped: {error}</T> : null}
            {saved && !running ? (
              <T v="caption">
                Written {fmtDateTime(saved.at)} by {saved.model}
              </T>
            ) : null}
            {running ? (
              <Button label="Stop" tone="ghost" onPress={() => handle.current?.stop()} />
            ) : (
              <Button label={saved ? 'Explain again' : 'Explain with AI'} onPress={run} disabled={!ai.available} />
            )}
          </Panel>
          <T v="caption" style={{ lineHeight: 18 }}>
            Not investment advice.
          </T>
        </Section>
      ) : null}

      <Section title="What the AI reads" action={showData ? 'Hide' : 'Show'} onAction={() => setShowData((v) => !v)}>
        {showData ? (
          <Panel style={{ paddingVertical: 12 }}>
            <T selectable style={{ fontFamily: 'monospace', fontSize: 11.5, lineHeight: 16, color: colors.text2 }}>
              {verdict ? verdictText(verdict) + '\n\n' : ''}
              {context}
            </T>
          </Panel>
        ) : (
          <T v="caption">The exact data sent to the model, so you can check its answer against it.</T>
        )}
      </Section>
    </View>
  );
}
