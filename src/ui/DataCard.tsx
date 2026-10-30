/** Settings → Data: data saver, and how much Sahm downloaded today and this month. */
import React, { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { colors, fonts } from '../theme';
import { dataSaverPref } from '../store/market';
import { currentUsage, fmtBytes, onUsage } from '../dataMeter';
import { Panel } from './bits';
import { T } from './kit';

export function DataCard() {
  const saver = dataSaverPref.use();
  const [u, setU] = useState(currentUsage());
  useEffect(() => onUsage(setU), []);
  return (
    <Panel style={{ paddingVertical: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>Data saver</T>
          <T v="caption" style={{ lineHeight: 17 }}>
            {saver
              ? 'Live prices every 3 minutes while PSX is open, the screener every 3 hours. Pull down on any screen for fresh prices.'
              : 'Live prices every 30 seconds just after you open Sahm, then every minute. Nothing is downloaded again after the close until the next session.'}
          </T>
        </View>
        <Switch value={saver} onValueChange={(v) => dataSaverPref.set(v)} trackColor={{ true: colors.gold, false: colors.line }} thumbColor={colors.surface} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, backgroundColor: colors.surface2, borderRadius: 12, padding: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="caption">Today</T>
          <T v="mono" style={{ fontSize: 15 }}>
            {fmtBytes(u.today)}
          </T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="caption">This month</T>
          <T v="mono" style={{ fontSize: 15 }}>
            {fmtBytes(u.thisMonth)}
          </T>
        </View>
      </View>
      <T v="caption" style={{ lineHeight: 16, fontSize: 11.5 }}>
        Sizes as received; the network compresses most of it, so your data plan usually sees less.
      </T>
    </Panel>
  );
}
