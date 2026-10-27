/** Settings: the daily offline copy, its last time, and a button to make one now. */
import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { colors } from '../theme';
import { fmtDay } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useUser } from '../store/user';
import { offlinePref, saveOffline } from '../offline';
import { Panel } from './bits';
import { Button, T } from './kit';

const time = (t: number) => {
  const d = new Date(t + 5 * 3600_000);
  return `${fmtDay(t)}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

export function OfflineCard() {
  const s = offlinePref.use();
  const { holdings } = useHoldings();
  const { watchlist } = useUser();
  const [progress, setProgress] = useState<string | null>(null);
  const symbols = [...holdings.map((h) => h.symbol), ...watchlist];
  const run = async () => {
    setProgress('Starting…');
    try {
      const r = await saveOffline(symbols, (d, t) => setProgress(`Saving ${d} of ${t}…`));
      setProgress(r.failed ? `Saved, but ${r.failed} download${r.failed === 1 ? '' : 's'} failed: try again on a better connection.` : null);
    } catch (e) {
      setProgress((e as Error).message);
    }
  };
  return (
    <Panel style={{ paddingVertical: 12, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="body">Keep an offline copy</T>
          <T v="caption" style={{ lineHeight: 17 }}>
            Once a day after the close, Sahm saves everything your holdings and watchlist need (results, dividends, charts, announcements) and the daily
            picks, mood, calendar, news and economy figures, so the app works fully without internet. Prices then show from the last time you were online.
          </T>
        </View>
        <Switch value={s.auto} onValueChange={(v) => offlinePref.set({ ...s, auto: v })} trackColor={{ true: colors.gold, false: colors.line }} thumbColor={colors.surface} />
      </View>
      <Button small tone="ghost" label={progress?.startsWith('Saving') || progress === 'Starting…' ? progress : 'Save a copy now'} disabled={!!progress && (progress.startsWith('Saving') || progress === 'Starting…')} onPress={run} />
      {progress && !progress.startsWith('Saving') && progress !== 'Starting…' ? <T v="caption">{progress}</T> : null}
      <T v="caption">{s.at ? `Last copy ${time(s.at)}: ${s.stocks} stocks${s.failed ? `, ${s.failed} downloads failed` : ''}.` : 'No offline copy yet.'}</T>
    </Panel>
  );
}
