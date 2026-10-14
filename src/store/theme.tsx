import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { applyTheme, ThemeName, ThemePref } from '../theme';
import { load, save } from '../storage';

const KEY = 'sahm:theme';
/** White is the default look; dark and "follow the phone" are options in Settings. */
const DEFAULT_PREF: ThemePref = 'light';

interface ThemeState {
  pref: ThemePref;
  name: ThemeName;
  setPref: (p: ThemePref) => void;
}

const Ctx = createContext<ThemeState | null>(null);

/**
 * Applies the chosen palette before its children render, and remounts them
 * when the palette changes so every themed stylesheet is rebuilt.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref | null>(null);

  useEffect(() => {
    load<ThemePref>(KEY, DEFAULT_PREF).then(setPrefState);
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    save(KEY, p);
  }, []);

  if (pref == null) return null;
  const name: ThemeName = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  applyTheme(name);

  return (
    <Ctx.Provider value={{ pref, name, setPref }}>
      <React.Fragment key={name}>{children}</React.Fragment>
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}
