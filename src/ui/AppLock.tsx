/**
 * App lock: when on, Sahm asks for your fingerprint, face or phone PIN when it
 * opens and when you come back after more than a minute away. Your holdings
 * stay hidden behind the cover until then.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { colors, fonts } from '../theme';
import { makePref } from '../prefs';
import { Button, T } from './kit';

export const lockPref = makePref<boolean>('ui.appLock', false);
const GRACE_MS = 60_000;
export const lockSupported = Platform.OS !== 'web';

/** Whether the phone can check it's you (fingerprint, face, or at least a PIN or pattern). */
export async function canLock(): Promise<boolean> {
  if (!lockSupported) return false;
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) > LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

export async function confirmIdentity(message = 'Unlock Sahm'): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: message, cancelLabel: 'Cancel', disableDeviceFallback: false });
    return r.success;
  } catch {
    return false;
  }
}

export function AppLock({ children }: { children: React.ReactNode }) {
  const on = lockPref.use();
  const [state, setState] = useState<'checking' | 'locked' | 'open'>(lockSupported ? 'checking' : 'open');
  const away = useRef<number | null>(null);
  const asking = useRef(false);

  const unlock = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    const ok = await confirmIdentity();
    asking.current = false;
    if (ok) setState('open');
  }, []);

  // first start: locked only when the lock is on
  useEffect(() => {
    if (!lockSupported) return;
    lockPref.get().then((v) => setState(v ? 'locked' : 'open'));
  }, []);
  useEffect(() => {
    if (state === 'locked') unlock();
  }, [state, unlock]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') away.current = Date.now();
      if (s === 'active') {
        const gone = away.current != null && Date.now() - away.current > GRACE_MS;
        away.current = null;
        if (gone) lockPref.get().then((v) => v && setState('locked'));
      }
    });
    return () => sub.remove();
  }, []);
  // turning the lock off in Settings opens it straight away
  useEffect(() => {
    if (!on && state === 'locked') setState('open');
  }, [on, state]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {state !== 'open' ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 32 }]}>
          <T style={{ fontFamily: fonts.heavy, fontSize: 30, color: colors.gold }}>Sahm</T>
          {state === 'locked' ? (
            <>
              <T v="body" style={{ color: colors.text2 }}>
                Locked
              </T>
              <Button label="Unlock" onPress={unlock} />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
