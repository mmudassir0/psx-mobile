/** Settings → Problem log: what went wrong lately, and one tap to send it. */
import React, { useEffect, useState } from 'react';
import { Alert, Platform, Share, View } from 'react-native';
import { colors, fonts } from '../theme';
import { clearProblems, onProblems, problems, reportText, type LogEntry } from '../log';
import { BUILD, VERSION } from '../store/update';
import { layoutPref } from '../nav/layout';
import { fmtDateTime } from '../format';
import { Panel } from './bits';
import { Button, T } from './kit';

export function ProblemLogCard() {
  const [list, setList] = useState<LogEntry[] | null>(null);
  const layout = layoutPref.use();
  useEffect(() => {
    problems().then(setList);
    return onProblems(setList);
  }, []);
  if (!list) return null;

  const send = () => {
    const c = (Platform as unknown as { constants?: { Brand?: string; Model?: string } }).constants;
    const header = [
      `Sahm ${VERSION}${BUILD ? ` (build ${BUILD})` : ''} · ${Platform.OS} ${Platform.Version}${c?.Model ? ` · ${c.Brand ?? ''} ${c.Model}`.replace('  ', ' ') : ''}`,
      `Layout ${layout} · sent ${fmtDateTime(Date.now())}`,
    ];
    Share.share({ message: reportText(list, header) }).catch(() => {});
  };
  const clear = () =>
    Alert.alert('Clear the problem log?', 'The list is emptied. New problems are logged again as they happen.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => clearProblems() },
    ]);

  const recent = [...list].reverse().slice(0, 3);
  return (
    <Panel style={{ paddingVertical: 14, gap: 10 }}>
      <T v="body" style={{ fontFamily: fonts.semibold }}>
        {list.length ? `${list.length} problem${list.length === 1 ? '' : 's'} logged` : 'No problems logged'}
      </T>
      {recent.map((e, i) => (
        <View key={i} style={{ gap: 1 }}>
          <T v="caption" style={{ color: colors.text2, fontFamily: fonts.semibold }}>
            {fmtDateTime(e.t)} · {e.where}
          </T>
          <T v="caption" numberOfLines={2}>
            {e.msg}
          </T>
        </View>
      ))}
      <T v="caption" style={{ lineHeight: 18 }}>
        Crashes, failed downloads and AI errors, kept on this phone. If something goes wrong, tap Send and paste it to Claude. It has no share amounts, costs or keys.
      </T>
      {list.length ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label="Send" style={{ flex: 1 }} onPress={send} />
          <Button label="Clear" tone="ghost" style={{ flex: 1 }} onPress={clear} />
        </View>
      ) : null}
    </Panel>
  );
}
