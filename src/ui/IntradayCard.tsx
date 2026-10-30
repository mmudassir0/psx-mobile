/** Background alerts on this phone: lines crossed and big moves while PSX is open, and the day's summary after the close. */
import React, { useState } from 'react';
import { Platform, Switch, View } from 'react-native';
import { colors, fonts } from '../theme';
import { ensureReady } from '../notify';
import { bigMovePref, daySummaryPref, intradayPref, setIntraday } from '../portfolio/intraday';
import { Panel } from './bits';
import { Segmented, T } from './kit';
import { ToolIcon } from './ToolIcon';

const MOVES = [
  { key: '0', label: 'Off' },
  { key: '3', label: '3%' },
  { key: '5', label: '5%' },
  { key: '7', label: '7%' },
] as const;

export function IntradayCard() {
  const on = intradayPref.use();
  const move = bigMovePref.use();
  const summary = daySummaryPref.use();
  const [msg, setMsg] = useState<string | null>(null);
  if (Platform.OS !== 'android') return null;
  return (
    <Panel style={{ paddingVertical: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.goldSoft : colors.surface2 }}>
          <ToolIcon name="bell" size={18} color={on ? colors.gold : colors.faint} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>Background alerts</T>
          <T v="caption">{on ? 'On: works even when Sahm is closed' : 'Off: alerts only when you open Sahm'}</T>
        </View>
        <Switch
          value={on}
          onValueChange={async (v) => {
            setMsg(null);
            if (v && !(await ensureReady())) return setMsg('Allow notifications for Sahm first.');
            const err = await setIntraday(v);
            if (err) setMsg(err);
          }}
          trackColor={{ true: colors.gold, false: colors.line }}
          thumbColor={colors.surface}
        />
      </View>
      <T v="caption" style={{ lineHeight: 17 }}>
        While PSX is open, Sahm checks live prices about every 15 minutes and tells you when a stock crosses one of your alert lines, targets or chart levels, or a holding moves a lot. After the close it checks your chart lines
        and sends one line on your day. Android picks the exact moment and may check less often to save battery. Nothing is downloaded outside market hours.
      </T>
      {on ? (
        <View style={{ gap: 10 }}>
          <View style={{ gap: 6 }}>
            <T v="label">Tell me when a holding moves</T>
            <Segmented options={MOVES.map((m) => ({ key: m.key, label: m.label }))} value={String(move) as (typeof MOVES)[number]['key']} onChange={(k) => bigMovePref.set(Number(k))} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="body">Evening summary</T>
              <T v="caption">What your holdings did today, with the best and weakest.</T>
            </View>
            <Switch value={summary} onValueChange={(v) => daySummaryPref.set(v)} trackColor={{ true: colors.gold, false: colors.line }} thumbColor={colors.surface} />
          </View>
        </View>
      ) : null}
      {msg ? (
        <T v="caption" style={{ color: colors.downText }}>
          {msg}
        </T>
      ) : null}
    </Panel>
  );
}
