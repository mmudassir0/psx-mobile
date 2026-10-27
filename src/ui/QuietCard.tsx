/** Settings: quiet hours (alerts wait until morning) and one evening summary instead of separate alerts. */
import React from 'react';
import { Platform, Switch, View } from 'react-native';
import { colors } from '../theme';
import { quietPref } from '../notify';
import { DIGEST_TIMES, QUIET_TIMES, WAKE_TIMES, type QuietSettings } from '../quietCore';
import { Panel } from './bits';
import { Segmented, T } from './kit';

function Row({ title, body, on, set }: { title: string; body: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body">{title}</T>
        <T v="caption" style={{ lineHeight: 17 }}>
          {body}
        </T>
      </View>
      <Switch value={on} onValueChange={set} trackColor={{ true: colors.gold, false: colors.line }} thumbColor={colors.surface} />
    </View>
  );
}

const opts = (l: string[]) => l.map((k) => ({ key: k, label: k }));

export function QuietCard() {
  const s = quietPref.use();
  if (Platform.OS !== 'android') return null;
  const put = (p: Partial<QuietSettings>) => quietPref.set({ ...s, ...p });
  return (
    <Panel style={{ paddingVertical: 12, gap: 12 }}>
      <Row
        title="One evening summary"
        body="Price, chart-line and market-hours alerts are kept and come together in one notification at the time you pick, instead of one by one through the day."
        on={s.digest}
        set={(v) => put({ digest: v })}
      />
      {s.digest ? <Segmented options={opts(DIGEST_TIMES)} value={s.digestAt} onChange={(k) => put({ digestAt: k })} /> : null}
      <Row title="Quiet hours" body="Nothing from Sahm's alerts in this window: anything that comes up waits until it ends." on={s.quiet} set={(v) => put({ quiet: v })} />
      {s.quiet ? (
        <View style={{ gap: 8 }}>
          <T v="caption">From</T>
          <Segmented options={opts(QUIET_TIMES)} value={s.from} onChange={(k) => put({ from: k })} />
          <T v="caption">Until</T>
          <Segmented options={opts(WAKE_TIMES)} value={s.to} onChange={(k) => put({ to: k })} />
        </View>
      ) : null}
      <T v="caption" style={{ lineHeight: 17 }}>
        Reminders you set for a time (morning brief, note dates, investing day) still come at that time. Alerts sent from the daily server job follow your ntfy app's own settings.
      </T>
    </Panel>
  );
}
