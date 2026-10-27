/**
 * "Hide Sahm on screen": blanks Sahm in the recent-apps view and blocks
 * screenshots and screen recording (Android's secure-window flag). Off by default,
 * since it also stops you taking screenshots of Sahm yourself.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { makePref } from './prefs';
import { logProblem } from './log';

export const hideScreenPref = makePref<boolean>('ui.hideScreen', false);

export function useScreenGuard() {
  const on = hideScreenPref.use();
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      try {
        const SC = await import('expo-screen-capture');
        if (on) await SC.preventScreenCaptureAsync('sahm');
        else await SC.allowScreenCaptureAsync('sahm');
      } catch (e) {
        logProblem('screen guard', e);
      }
    })();
  }, [on]);
}
