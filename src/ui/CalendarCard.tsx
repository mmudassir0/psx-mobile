/** Settings: put your holdings' dividend and results dates in the phone's calendar. */
import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { colors } from '../theme';
import { fmtDay } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useReviews } from '../portfolio/useReviews';
import { askCalendar, calendarPref, stopCalendar, supported, syncCalendar } from '../portfolio/calendarSync';
import { Panel } from './bits';
import { Button, T } from './kit';

export function CalendarCard() {
  const s = calendarPref.use();
  const { holdings } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows, loading } = useReviews(holdings, stocks, bySymbol, null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!supported) return null;

  const run = async (force: boolean) => {
    setBusy(true);
    try {
      const n = await syncCalendar(rows, force);
      setMsg(`${n} date${n === 1 ? '' : 's'} in the Sahm calendar.`);
    } catch (e) {
      setMsg(`Couldn't write to the calendar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel style={{ paddingVertical: 12, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="body">Add dates to my calendar</T>
          <T v="caption" style={{ lineHeight: 17 }}>
            Last days to buy, book closures, board meetings and likely results for your holdings, and the State Bank's rate decisions, in a calendar called "Sahm". It updates as dates are announced.
          </T>
        </View>
        <Switch
          value={s.on}
          disabled={busy}
          onValueChange={async (v) => {
            setMsg(null);
            if (!v) {
              await stopCalendar();
              return setMsg('The Sahm calendar was removed.');
            }
            if (!(await askCalendar())) return setMsg('Sahm needs permission to use the calendar. Allow it in the phone settings and try again.');
            await calendarPref.set({ ...s, on: true });
            if (!loading && rows.length) run(true);
            else setMsg('The dates are added as soon as your holdings have loaded.');
          }}
          trackColor={{ true: colors.gold, false: colors.line }}
          thumbColor={colors.surface}
        />
      </View>
      {s.on ? <Button small label={busy ? 'Updating…' : 'Update now'} tone="ghost" disabled={busy || loading} onPress={() => run(true)} /> : null}
      {msg ? <T v="caption">{msg}</T> : s.on && s.at ? <T v="caption">Last updated {fmtDay(s.at)}.</T> : null}
    </Panel>
  );
}
