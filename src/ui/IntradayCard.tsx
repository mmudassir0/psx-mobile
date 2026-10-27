/** Settings: alerts during market hours, checked in the background about every 15 minutes. */
import React, { useState } from 'react';
import { Platform, Switch, View } from 'react-native';
import { colors } from '../theme';
import { ensureReady } from '../notify';
import { intradayPref, setIntraday } from '../portfolio/intraday';
import { Panel } from './bits';
import { T } from './kit';

export function IntradayCard() {
  const on = intradayPref.use();
  const [msg, setMsg] = useState<string | null>(null);
  if (Platform.OS !== 'android') return null;
  return (
    <Panel style={{ paddingVertical: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="body">Alerts during market hours</T>
          <T v="caption" style={{ lineHeight: 17 }}>
            While PSX is open, Sahm checks live prices about every 15 minutes, even when it's closed, and tells you when a stock crosses one of your price alerts, target or rethink prices, or chart levels. Android picks
            the exact moment and may check less often to save battery.
          </T>
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
      {msg ? (
        <T v="caption" style={{ color: colors.downText }}>
          {msg}
        </T>
      ) : null}
    </Panel>
  );
}
