import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, space, themed } from '../theme';
import { BUILD, VERSION, updatesSupported, useUpdate } from '../store/update';
import { Button, T } from './kit';

const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

/** Shown on Home when a newer build is on GitHub. */
export function UpdateBanner() {
  const { status, latest, progress, error, download, install, paused, openInBrowser, redownload } = useUpdate();
  if (!latest || !['available', 'downloading', 'ready', 'error'].includes(status)) return null;
  if (status === 'error' && progress === 0 && latest.build <= BUILD) return null;
  const notes = latest.notes.split('\n')[0];
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', columnGap: 8, rowGap: 2 }}>
        <T style={{ fontFamily: fonts.heavy, fontSize: 15, color: colors.gold }}>Update available</T>
        <T v="caption">
          v{latest.version} · build {latest.build} · {mb(latest.size)}
        </T>
      </View>
      {notes ? (
        <T v="body" style={{ color: colors.text2, fontSize: 14 }} numberOfLines={3}>
          {notes}
        </T>
      ) : null}
      {status === 'downloading' ? (
        <View style={{ gap: 6 }}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <T v="caption">
            {paused ? `Paused at ${Math.round(progress * 100)}% while Sahm is in the background; it carries on when you come back.` : `Downloading… ${Math.round(progress * 100)}%. Keep Sahm open until it finishes.`}
          </T>
        </View>
      ) : status === 'ready' ? (
        <Button small label="Install update" onPress={install} />
      ) : (
        <Button small label={status === 'error' ? 'Try again' : 'Download and install'} onPress={download} />
      )}
      {status === 'error' && error ? (
        <T v="caption" style={{ color: colors.down }}>
          {error}
        </T>
      ) : null}
      {status === 'downloading' || status === 'error' || status === 'available' ? (
        <Pressable accessibilityRole="link" onPress={openInBrowser} hitSlop={8}>
          <T style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.gold }}>Download in browser instead ›</T>
        </Pressable>
      ) : null}
      {status === 'ready' ? (
        <>
          <T v="caption">If Android asks, allow Sahm to install apps, then come back and tap Install update.</T>
          <T v="caption">Android says the package is invalid? The download got damaged:</T>
          <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
            <Pressable accessibilityRole="button" onPress={redownload} hitSlop={8}>
              <T style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.gold }}>Download again ›</T>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={openInBrowser} hitSlop={8}>
              <T style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.gold }}>Download in browser ›</T>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

/** Small footer row: current version + manual check. */
export function VersionRow() {
  const { status, error, check, latest } = useUpdate();
  if (!updatesSupported) return null;
  const msg =
    status === 'checking'
      ? 'Checking…'
      : status === 'current'
        ? "You're on the latest version"
        : status === 'available' || status === 'ready' || status === 'downloading'
          ? `Version ${latest?.version} (build ${latest?.build}) is ready above`
          : status === 'error'
            ? (error ?? 'Could not check')
            : 'Check for updates';
  return (
    <Pressable accessibilityRole="button" onPress={() => check(true)} style={({ pressed }) => [styles.version, pressed && { opacity: 0.7 }]}>
      <T v="caption">
        Sahm {VERSION}
        {BUILD ? ` · build ${BUILD}` : ''}
      </T>
      <T v="caption" style={{ color: status === 'error' ? colors.down : colors.gold }}>
        {msg}
      </T>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: {
      marginHorizontal: space.gutter,
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 16,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.gold + '55',
    },
    track: { height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' },
    fill: { height: 6, borderRadius: 3, backgroundColor: colors.gold },
    version: { alignItems: 'center', gap: 2, paddingVertical: 8 },
  }),
);
