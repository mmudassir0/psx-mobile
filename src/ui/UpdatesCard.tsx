/** Settings → Updates: when the daily update runs, and a button to run it again now. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Switch, TextInput, View } from 'react-native';
import { colors, fonts } from '../theme';
import { githubToken, recentRuns, REPO, runUpdate, setGithubToken, type RunInfo } from '../store/github';
import { cached } from '../psx/cache';
import { fetchFeeds } from '../picks/feed';
import { Panel } from './bits';
import { Button, T } from './kit';

const when = (t: number) => {
  const d = new Date(t + 5 * 3600_000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const label = (r: RunInfo) => (r.status !== 'completed' ? (r.status === 'queued' ? 'Waiting to start' : 'Running…') : r.conclusion === 'success' ? 'Done' : r.conclusion === 'cancelled' ? 'Cancelled' : 'Failed');
const who = (r: RunInfo) => (r.event === 'workflow_dispatch' ? 'started by you or the timer' : "GitHub's own schedule");

function inSession(now = Date.now()) {
  const d = new Date(now + 5 * 3600_000);
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && m >= 9 * 60 && m < 16 * 60 + 30;
}

export function UpdatesCard() {
  const [token, setToken] = useState<string | null>(null);
  const [typing, setTyping] = useState('');
  const [runs, setRuns] = useState<RunInfo[] | null>(null);
  const [alerts, setAlerts] = useState(false);
  const [again, setAgain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(
    async (t = token) => {
      if (!t) return;
      try {
        const r = await recentRuns(t);
        setRuns(r);
        const live = r[0] && r[0].status !== 'completed';
        if (!live && poll.current) {
          clearInterval(poll.current);
          poll.current = null;
          if (r[0]?.conclusion === 'success') {
            // pull the fresh picks straight away; other cards refresh within the hour or on pull-down
            await cached('picks:feeds', 0, fetchFeeds, { persist: true, force: true }).catch(() => {});
            setMsg('Finished. Pull down on Home to see the new figures.');
          }
        }
      } catch (e) {
        setMsg((e as Error).message);
      }
    },
    [token],
  );

  useEffect(() => {
    githubToken().then((t) => {
      setToken(t);
      if (t) refresh(t);
    });
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    try {
      await runUpdate(token, { alerts, again: alerts && again });
      setMsg(inSession() ? 'Started. The market is open, so it uses the last closing prices; new prices come after 4:30 pm.' : 'Started. It usually takes 5–10 minutes.');
      setTimeout(() => refresh(), 4000);
      if (!poll.current) poll.current = setInterval(() => refresh(), 15_000);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel style={{ paddingVertical: 14, gap: 10 }}>
      <T v="body" style={{ fontSize: 14, lineHeight: 20, color: colors.text2 }}>
        The update runs on its own every weekday at 8:20 am (before the market opens) and 5:20 pm (after the close, with your holdings alert). GitHub's own schedule is a backup and often runs late.
      </T>
      {!token ? (
        <View style={{ gap: 8 }}>
          <T v="caption" style={{ lineHeight: 18 }}>
            To start it yourself, add a GitHub token: on GitHub open Settings → Developer settings → Fine-grained tokens → Generate. Choose only the {REPO} repository, and under Repository permissions set "Actions" to
            "Read and write". Nothing else. Paste it here; it stays in this phone's secure storage.
          </T>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://github.com/settings/personal-access-tokens/new').catch(() => {})}>
            <T style={{ fontFamily: fonts.semibold, color: colors.gold }}>Open GitHub token page ›</T>
          </Pressable>
          <TextInput
            value={typing}
            onChangeText={setTyping}
            placeholder="github_pat_…"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholderTextColor={colors.faint}
            style={{ height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.ground, paddingHorizontal: 12, color: colors.text, fontFamily: fonts.mono }}
          />
          <Button
            label="Save token"
            disabled={typing.trim().length < 20}
            onPress={async () => {
              await setGithubToken(typing);
              setToken(typing.trim());
              setTyping('');
              refresh(typing.trim());
            }}
          />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <T v="body" style={{ flex: 1, fontSize: 14 }}>
              Also send my holdings and price alerts
            </T>
            <Switch value={alerts} onValueChange={setAlerts} trackColor={{ true: colors.gold, false: colors.line }} thumbColor={colors.surface} />
          </View>
          {alerts ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <T v="caption" style={{ flex: 1, lineHeight: 18 }}>
                Even if today's were already sent
              </T>
              <Switch value={again} onValueChange={setAgain} trackColor={{ true: colors.gold, false: colors.line }} thumbColor={colors.surface} />
            </View>
          ) : null}
          <Button label={busy ? 'Starting…' : 'Run update now'} disabled={busy || (!!runs?.[0] && runs[0].status !== 'completed')} onPress={start} />
          {msg ? (
            <T v="caption" style={{ lineHeight: 18, color: colors.text2 }}>
              {msg}
            </T>
          ) : null}
          {runs?.length ? (
            <View style={{ gap: 4 }}>
              <T v="caption" style={{ fontFamily: fonts.bold }}>
                Recent runs
              </T>
              {runs.map((r) => (
                <View key={r.id} style={{ flexDirection: 'row' }}>
                  <T v="caption" style={{ flex: 1 }}>
                    {when(r.createdAt)} · {who(r)}
                  </T>
                  <T v="caption" style={{ color: r.conclusion === 'success' ? colors.up : r.status !== 'completed' ? colors.gold : colors.downText, fontFamily: fonts.semibold }}>
                    {label(r)}
                  </T>
                </View>
              ))}
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={async () => {
              await setGithubToken(null);
              setToken(null);
              setRuns(null);
            }}
          >
            <T v="caption" style={{ color: colors.muted }}>
              Remove token
            </T>
          </Pressable>
        </View>
      )}
    </Panel>
  );
}
