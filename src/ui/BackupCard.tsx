/** Export everything that lives only on this phone as text, and paste it back to restore. */
import React, { useState } from 'react';
import { Share, StyleSheet, TextInput, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { fmtDay } from '../format';
import { applyRestore, exportBackup, readBackup } from '../backup';
import { setHoldings } from '../portfolio/holdings';
import { appliedBonusesPref, taxStatusPref } from '../portfolio/prefs';
import { reloadJournal } from '../journal/store';
import { reloadSnapshots } from '../portfolio/track';
import type { Holding } from '../portfolio/review';
import { useUser } from '../store/user';
import { useTheme } from '../store/theme';
import type { ThemePref } from '../theme';
import { Button, T } from './kit';

export function BackupCard() {
  const { reload } = useUser();
  const { setPref } = useTheme();
  const [msg, setMsg] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');
  const parsed = text.trim() ? readBackup(text) : null;

  const doExport = async () => {
    setMsg(null);
    try {
      const json = await exportBackup();
      await Share.share({ message: json, title: 'Sahm backup' });
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const doRestore = async () => {
    if (!parsed?.ok) return;
    const r = parsed.restore;
    await applyRestore(r);
    // Update what's already loaded; the rest is read when Sahm next starts.
    if (r.data['real.holdings']) await setHoldings(r.data['real.holdings'] as Holding[]);
    if (r.data['user.taxStatus']) await taxStatusPref.set(r.data['user.taxStatus'] as 'filer' | 'non-filer');
    if (r.data['real.appliedBonuses']) await appliedBonusesPref.set(r.data['real.appliedBonuses'] as string[]);
    reloadJournal();
    reloadSnapshots();
    // the screens already open take the restored data now, so nothing old is saved over it
    await reload();
    const theme = r.data['sahm:theme'];
    if (theme === 'system' || theme === 'light' || theme === 'dark') setPref(theme as ThemePref);
    setPasting(false);
    setText('');
    setMsg('Restored: holdings, watchlist, practice account, track record and settings.');
  };

  return (
    <View style={styles.card}>
      <T v="caption" style={{ lineHeight: 18 }}>
        Your holdings, watchlist, practice account and Sahm's track record are kept only on this phone. Save a backup somewhere safe (a
        note, or an email to yourself) so a new phone or a reinstall doesn't lose them. API keys are not included.
      </T>
      <Button label="Export backup" tone="ghost" onPress={doExport} />
      {pasting ? (
        <View style={{ gap: 10 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Paste the backup text here"
            placeholderTextColor={colors.faint}
            multiline
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.input}
          />
          {parsed ? (
            parsed.ok ? (
              <T v="caption" style={{ lineHeight: 18 }}>
                Backup from {parsed.restore.exportedAt ? fmtDay(Date.parse(parsed.restore.exportedAt)) : 'an unknown date'}: {parsed.restore.counts.holdings} holdings,{' '}
                {parsed.restore.counts.watchlist} watchlist stocks, {parsed.restore.counts.journal} track-record entries
                {parsed.restore.counts.practice ? ', the practice account' : ''}. Restoring replaces what's on this phone now.
                {parsed.restore.skipped.length ? ` Left out (damaged): ${parsed.restore.skipped.join(', ')}.` : ''}
              </T>
            ) : (
              <T v="caption" style={{ color: colors.downText }}>
                {parsed.error}
              </T>
            )
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="Cancel" tone="ghost" onPress={() => (setPasting(false), setText(''))} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Restore" onPress={doRestore} disabled={!parsed?.ok} />
            </View>
          </View>
        </View>
      ) : (
        <Button label="Restore from backup" tone="ghost" onPress={() => (setPasting(true), setMsg(null))} />
      )}
      {msg ? <T v="caption">{msg}</T> : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 12 },
    input: { minHeight: 120, maxHeight: 220, borderRadius: 12, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.line, padding: 12, fontFamily: fonts.mono, fontSize: 12, color: colors.text, textAlignVertical: 'top' },
  }),
);
