import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors, space } from '../../theme';
import { fmtDateTime } from '../../format';
import { analysisMessages, StockPack, stockContext } from '../../ai/context';
import type { Generation } from '../../ai/models';
import { canRun, useAi } from '../../store/ai';
import { load, save } from '../../storage';
import { ModelCard } from '../../ui/ModelCard';
import { Md } from '../../ui/Md';
import { Panel } from '../../ui/bits';
import { Button, Section, T } from '../../ui/kit';

interface Saved {
  day: string;
  at: number;
  model: string;
  text: string;
}

const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10); // PKT date

/** AI verdict for one stock, written by the on-phone model from the app's own numbers. */
export function AiTab({ symbol, pack, ready }: { symbol: string; pack: StockPack; ready: boolean }) {
  const ai = useAi();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showData, setShowData] = useState(false);
  const handle = useRef<Generation | null>(null);
  const [phaseNote, setPhaseNote] = useState<string | null>(null);
  const key = `ai.analysis.${symbol}`;
  const context = useMemo(() => (ready ? stockContext(pack) : ''), [ready, pack]);

  useEffect(() => {
    load<Saved | null>(key, null).then((s) => s && s.day === today() && setSaved(s));
    return () => handle.current?.stop();
  }, [key]);

  const run = async () => {
    if (!canRun(ai.phase) || !context || !ai.model) return;
    const model = ai.model.name;
    setError(null);
    setText('');
    setSaved(null);
    setRunning(true);
    setPhaseNote('Reading the data…');
    try {
      const h = await ai.run(analysisMessages(context), (t) => {
        setPhaseNote(null);
        setText(t);
      });
      handle.current = h;
      const out = await h.done;
      if (out.trim()) {
        const s = { day: today(), at: Date.now(), model, text: out };
        setSaved(s);
        save(key, s);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      setPhaseNote(null);
      handle.current = null;
    }
  };

  const shown = running ? text : saved?.text ?? text;

  return (
    <View style={{ gap: space.section }}>
      <ModelCard />

      <Section title="AI analysis">
        <Panel style={{ paddingVertical: 16, gap: 12 }}>
          {shown ? (
            <Md text={shown + (running ? ' ▍' : '')} />
          ) : (
            <T v="body" style={{ color: colors.text2 }}>
              The on-phone model reads this stock's technicals, results, ratios and announcements, then writes a verdict with
              entry, stop and target levels taken from the data.
            </T>
          )}
          {running && phaseNote ? <T v="caption">{ai.phase === 'loading' ? 'Loading the model…' : phaseNote}</T> : null}
          {error ? <T v="caption" style={{ color: colors.downText }}>Stopped: {error}</T> : null}
          {saved && !running ? (
            <T v="caption">
              Written {fmtDateTime(saved.at)} by {saved.model}
            </T>
          ) : null}
          {running ? (
            <Button label="Stop" tone="ghost" onPress={() => handle.current?.stop()} />
          ) : (
            <Button
              label={!ready ? 'Loading data…' : saved ? 'Write again' : 'Analyze with AI'}
              onPress={run}
              disabled={!ready || !canRun(ai.phase)}
            />
          )}
        </Panel>
        <T v="caption" style={{ lineHeight: 18 }}>
          The model only explains numbers Sahm computed; it can still misjudge them. Not investment advice.
        </T>
      </Section>

      {ready ? (
        <Section title="What the AI reads" action={showData ? 'Hide' : 'Show'} onAction={() => setShowData((v) => !v)}>
          {showData ? (
            <Panel style={{ paddingVertical: 12 }}>
              <T selectable style={{ fontFamily: 'monospace', fontSize: 11.5, lineHeight: 16, color: colors.text2 }}>
                {context}
              </T>
            </Panel>
          ) : (
            <T v="caption">The exact data pack sent to the model, so you can check its answer against it.</T>
          )}
        </Section>
      ) : null}
    </View>
  );
}
