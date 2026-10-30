/** Practice tab: this month's challenge against the KSE-100, the streak and the months before. */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { colors, fonts } from '../theme';
import { makePref } from '../prefs';
import { useMarket } from '../store/market';
import { monthOf, NO_CHALLENGE, resultOf, stepChallenge, streak, type ChallengeState } from '../paper/challenge';
import { Panel } from './bits';
import { T } from './kit';
import { ToolIcon } from './ToolIcon';
import { GrowBar } from './motion';

export const challengePref = makePref<ChallengeState>('paper.challenge', NO_CHALLENGE);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(2)}%`;

export function ChallengeCard({ value, account }: { value: number; account: number }) {
  const st = challengePref.use();
  const { indices, ready } = useMarket();
  const kse = indices.find((i) => i.code === 'KSE100')?.current ?? 0;
  useEffect(() => {
    if (!ready || !(kse > 0) || !(value > 0)) return;
    const next = stepChallenge(st, { month: monthOf(Date.now()), account, value, index: kse });
    if (JSON.stringify(next) !== JSON.stringify(st)) challengePref.set(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, kse, value, account]);
  if (!st.current) return null;
  const r = resultOf(st.current);
  const ahead = r.ret - r.indexRet;
  const win = ahead > 0;
  const s = streak(st.history);
  const scale = Math.max(0.02, Math.abs(r.ret), Math.abs(r.indexRet));
  const Bar = ({ label, v, strong }: { label: string; v: number; strong?: boolean }) => (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="caption">{label}</T>
        <T v="mono" style={{ fontSize: 13, color: v >= 0 ? colors.up : colors.downText }}>
          {pct(v)}
        </T>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' }}>
        <GrowBar style={{ height: 6, width: `${Math.min(100, (Math.abs(v) / scale) * 100)}%`, borderRadius: 3, backgroundColor: v >= 0 ? colors.up : colors.down, opacity: strong ? 1 : 0.45 }} />
      </View>
    </View>
  );
  return (
    <Panel style={{ paddingVertical: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' }}>
          <ToolIcon name="trophy" size={18} color={colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>{monthName(st.current.month)} challenge</T>
          <T v="caption">Beat the KSE-100 this month with your practice money</T>
        </View>
      </View>
      <Bar label="You" v={r.ret} strong />
      <Bar label="KSE-100" v={r.indexRet} />
      <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: win ? colors.up : ahead < 0 ? colors.downText : colors.text2 }}>
        {Math.abs(ahead) < 0.0005 ? 'Level with the market so far.' : win ? `Ahead of the market by ${(ahead * 100).toFixed(2)} points.` : `Behind the market by ${(-ahead * 100).toFixed(2)} points.`}
        {s > 0 ? `  ${s} month${s === 1 ? '' : 's'} in a row beaten.` : ''}
      </T>
      {st.history.length ? (
        <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 10 }}>
          <T v="label">Past months</T>
          {[...st.history]
            .reverse()
            .slice(0, 6)
            .map((h) => {
              const beat = h.ret > h.indexRet;
              return (
                <View key={h.month} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ToolIcon name={beat ? 'check' : 'close'} size={14} color={beat ? colors.up : colors.faint} />
                  <T v="body" style={{ flex: 1, fontSize: 13.5 }}>
                    {monthName(h.month)}
                  </T>
                  <T v="mono" style={{ fontSize: 12.5, color: colors.text2 }}>
                    {pct(h.ret)} vs {pct(h.indexRet)}
                  </T>
                </View>
              );
            })}
        </View>
      ) : null}
      <T v="caption" style={{ lineHeight: 17 }}>
        Counted from where your practice account and the index stood when the month began (or when you started). Resetting the account starts the month again.
      </T>
    </Panel>
  );
}
