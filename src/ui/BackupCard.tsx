/** Export everything that lives only on this phone as text, and paste it back to restore. */
import React, { useState } from 'react';
import { Alert, Platform, Share, StyleSheet, Switch, TextInput, View } from 'react-native';
import { driveReminderPref, driveSavedPref, pickBackupFile, scheduleDriveReminder, shareBackupFile } from '../driveBackup';
import { colors, fonts, themed } from '../theme';
import { fmtDay } from '../format';
import { applyRestore, exportBackup, readBackup, type Restore } from '../backup';
import { autoBackupPref, chooseFolder, disable, enable, folderName, listBackups, supported as autoSupported, backupNow } from '../autoBackup';
import { setHoldings } from '../portfolio/holdings';
import { appliedBonusesPref, taxStatusPref } from '../portfolio/prefs';
import { reloadJournal } from '../journal/store';
import { reloadSnapshots } from '../portfolio/track';
import { reloadAllPrefs } from '../prefs';
import { rescheduleNotes } from '../portfolio/notes';
import { schedulePlan } from '../portfolio/monthlyPlan';
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
  const driveReminder = driveReminderPref.use();
  const driveSaved = driveSavedPref.use();

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
    await restoreFrom(parsed.restore);
  };
  const restoreFrom = async (r: Restore) => {
    await applyRestore(r);
    // Update what's already loaded; the rest is read when Sahm next starts.
    if (r.data['real.holdings']) await setHoldings(r.data['real.holdings'] as Holding[]);
    if (r.data['user.taxStatus']) await taxStatusPref.set(r.data['user.taxStatus'] as 'filer' | 'non-filer');
    if (r.data['real.appliedBonuses']) await appliedBonusesPref.set(r.data['real.appliedBonuses'] as string[]);
    reloadJournal();
    reloadSnapshots();
    rescheduleNotes();
    schedulePlan();
    await reloadAllPrefs();
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
        Your holdings, watchlist, practice account and Sahm's track record are kept only on this phone. Save a backup somewhere safe (a note, or an email to yourself) so a new phone or a reinstall doesn't lose them. API
        keys are not included.
      </T>
      <Button label="Export backup" tone="ghost" onPress={doExport} />
      {Platform.OS !== 'web' ? (
        <View style={{ gap: 8 }}>
          <Button
            label="Save to Google Drive"
            tone="ghost"
            onPress={async () => {
              setMsg(null);
              try {
                await shareBackupFile();
                setMsg('Choose "Drive" in the list to keep it in your Google account.');
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          />
          <Button
            label="Restore from a file (Drive or Downloads)"
            tone="ghost"
            onPress={async () => {
              setMsg(null);
              try {
                const r = await pickBackupFile();
                if (!r) return;
                if (!r.ok) return setMsg(r.error);
                await restoreFrom(r.restore);
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <T v="caption" style={{ flex: 1 }}>
              Remind me every Sunday evening{driveSaved ? ` · last saved ${fmtDay(driveSaved)}` : ''}
            </T>
            <Switch
              value={driveReminder}
              onValueChange={async (v) => {
                await driveReminderPref.set(v);
                await scheduleDriveReminder(v);
              }}
              trackColor={{ true: colors.gold, false: colors.line }}
              thumbColor={colors.surface}
            />
          </View>
        </View>
      ) : null}
      {pasting ? (
        <View style={{ gap: 10 }}>
          <TextInput value={text} onChangeText={setText} placeholder="Paste the backup text here" placeholderTextColor={colors.faint} multiline autoCorrect={false} autoCapitalize="none" style={styles.input} />
          {parsed ? (
            parsed.ok ? (
              <T v="caption" style={{ lineHeight: 18 }}>
                Backup from {parsed.restore.exportedAt ? fmtDay(Date.parse(parsed.restore.exportedAt)) : 'an unknown date'}: {parsed.restore.counts.holdings} holdings, {parsed.restore.counts.watchlist} watchlist stocks,{' '}
                {parsed.restore.counts.journal} track-record entries
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
      {autoSupported ? <AutoBackupBox onRestore={restoreFrom} /> : null}
    </View>
  );
}

/** Weekly backups into a folder you pick once, and restoring from that folder after a reinstall. */
function AutoBackupBox({ onRestore }: { onRestore: (r: Restore) => Promise<void> }) {
  const auto = autoBackupPref.use();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await f();
    } catch (e) {
      setNote((e as Error).message || 'That folder could not be used; try another');
    } finally {
      setBusy(false);
    }
  };
  const turnOn = () =>
    run(async () => {
      const dir = await chooseFolder();
      if (!dir) return;
      await enable(dir);
      setNote(`First backup saved in ${folderName(dir)}.`);
    });
  const restoreFromFolder = () =>
    run(async () => {
      const dir = auto.dir ?? (await chooseFolder());
      if (!dir) return;
      const list = (await listBackups(dir)).filter((b) => b.restore);
      if (!list.length) return setNote(`No Sahm backups found in ${folderName(dir)}.`);
      const b = list[0];
      const c = b.restore!.counts;
      Alert.alert(
        `Restore the backup from ${fmtDay(Date.parse(b.day + 'T12:00:00Z'))}?`,
        `${c.holdings} holdings, ${c.watchlist} watchlist stocks, ${c.journal} track-record entries. It replaces what's on this phone now.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Restore', style: 'destructive', onPress: () => run(() => onRestore(b.restore!)) },
        ],
      );
    });
  const nextIn = auto.lastAt ? Math.max(0, Math.ceil((auto.lastAt + 7 * 864e5 - Date.now()) / 864e5)) : 0;
  return (
    <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 12 }}>
      <T v="body" style={{ fontFamily: fonts.semibold }}>
        Automatic backup
      </T>
      {auto.dir ? (
        <>
          <T v="caption" style={{ lineHeight: 18 }}>
            Every week into{' '}
            <T v="caption" style={{ fontFamily: fonts.bold }}>
              {folderName(auto.dir)}
            </T>
            , keeping the last 4. Last one {auto.lastAt ? fmtDay(auto.lastAt) : 'not yet'}
            {auto.lastAt ? (nextIn ? `, next in ${nextIn} day${nextIn > 1 ? 's' : ''} (when you open Sahm)` : ', next when you open Sahm') : ''}.
          </T>
          {auto.error ? (
            <T v="caption" style={{ color: colors.downText }}>
              The last try failed: {auto.error}. Choose the folder again.
            </T>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Back up now"
                tone="ghost"
                disabled={busy}
                onPress={() =>
                  run(async () => {
                    await backupNow(auto.dir!);
                    await autoBackupPref.set({ ...auto, lastAt: Date.now(), error: null });
                    setNote('Saved.');
                  })
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={auto.error ? 'Choose again' : 'Change folder'} tone="ghost" disabled={busy} onPress={turnOn} />
            </View>
          </View>
          <Button label="Turn off" tone="ghost" small disabled={busy} onPress={() => run(disable)} />
        </>
      ) : (
        <>
          <T v="caption" style={{ lineHeight: 18 }}>
            Pick a folder once (a new folder inside Download is a good choice) and Sahm saves a backup there every week. Files in that folder stay when the app is removed, so a new phone or a reinstall can restore from
            them.
          </T>
          <Button label="Choose a folder" disabled={busy} onPress={turnOn} />
        </>
      )}
      <Button label="Restore from the backup folder" tone="ghost" disabled={busy} onPress={restoreFromFolder} />
      {note ? <T v="caption">{note}</T> : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 12 },
    input: {
      minHeight: 120,
      maxHeight: 220,
      borderRadius: 12,
      backgroundColor: colors.ground,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 12,
      fontFamily: fonts.mono,
      fontSize: 12,
      color: colors.text,
      textAlignVertical: 'top',
    },
  }),
);
