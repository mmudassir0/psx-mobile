/** Settings: the before-the-open notification, on or off, and its time. */
import React from 'react';
import { Pressable, Switch, View } from 'react-native';
import { colors, fonts } from '../theme';
import { ensureReady } from '../notify';
import { MORNING_TIMES, morningPref } from '../portfolio/useMorningBrief';
import { Panel } from './bits';
import { T } from './kit';

const label = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h}:${String(m).padStart(2, '0')} am`;
};

export function MorningCard() {
  const s = morningPref.use();
  return (
    <Panel style={{ paddingVertical: 12, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="body">Before the market opens</T>
          <T v="caption" style={{ lineHeight: 17 }}>
            On trading days: last days to buy for a dividend, book closures, results due, notes to look at and price lines that are close. Only when there's something to say.
          </T>
        </View>
        <Switch
          value={s.on}
          onValueChange={async (v) => {
            if (v && !(await ensureReady())) return;
            morningPref.set({ ...s, on: v });
          }}
          trackColor={{ true: colors.gold, false: colors.line }}
          thumbColor={colors.surface}
        />
      </View>
      {s.on ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {MORNING_TIMES.map((t) => (
            <Pressable
              key={t}
              accessibilityRole="radio"
              accessibilityState={{ selected: s.time === t }}
              onPress={() => morningPref.set({ ...s, time: t })}
              style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: 'center', backgroundColor: s.time === t ? colors.gold : colors.surface2 }}
            >
              <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: s.time === t ? colors.onGold : colors.text2 }}>{label(t)}</T>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Panel>
  );
}
