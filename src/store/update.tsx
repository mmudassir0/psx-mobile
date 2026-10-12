import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

const REPO = 'mmudassir0/psx-mobile';
/** Build number baked in by CI (GitHub run number). 0 in dev builds. */
export const BUILD = Number(process.env.EXPO_PUBLIC_BUILD || 0);
export const VERSION = Application.nativeApplicationVersion ?? '0.0.0';
const RECHECK_MS = 60 * 60 * 1000;

export interface Release {
  version: string;
  build: number;
  notes: string;
  apkUrl: string;
  size: number;
  publishedAt: string;
}

export type UpdateStatus = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'error';

/** Parse a GitHub release payload. Tags look like v0.4.0-build.7. */
export function parseRelease(r: any): Release | null {
  const m = /^v(\d+\.\d+\.\d+)-build\.(\d+)$/.exec(r?.tag_name ?? '');
  const apk = (r?.assets ?? []).find((a: any) => String(a.name).endsWith('.apk'));
  if (!m || !apk) return null;
  const body = String(r.body ?? '');
  const notes = body
    .split('\n')
    .filter((l) => l.trim() && !/^(Co-Authored-By|Claude-Session):/i.test(l.trim()))
    .join('\n')
    .trim();
  return { version: m[1], build: Number(m[2]), notes, apkUrl: apk.browser_download_url, size: apk.size, publishedAt: r.published_at };
}

async function fetchLatest(): Promise<Release> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (res.status === 404) throw new Error('Update server not reachable (is the repo public?)');
  if (!res.ok) throw new Error(`Update check failed (${res.status})`);
  const rel = parseRelease(await res.json());
  if (!rel) throw new Error('Latest release has no APK');
  return rel;
}

interface UpdateState {
  status: UpdateStatus;
  latest: Release | null;
  progress: number; // 0..1
  error: string | null;
  check: (manual?: boolean) => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
}

const Ctx = createContext<UpdateState | null>(null);
export const updatesSupported = Platform.OS === 'android';

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [latest, setLatest] = useState<Release | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const lastCheck = useRef(0);
  const busy = useRef(false);

  const check = useCallback(async (manual = false) => {
    if (!updatesSupported || busy.current) return;
    if (!manual && Date.now() - lastCheck.current < RECHECK_MS) return;
    lastCheck.current = Date.now();
    setStatus((s) => (s === 'ready' || s === 'downloading' ? s : 'checking'));
    setError(null);
    try {
      const rel = await fetchLatest();
      setLatest(rel);
      setStatus((s) => (s === 'ready' || s === 'downloading' ? s : rel.build > BUILD ? 'available' : 'current'));
    } catch (e) {
      // quiet on automatic checks, visible on manual ones
      setError((e as Error).message);
      setStatus(manual ? 'error' : 'idle');
    }
  }, []);

  const download = useCallback(async () => {
    if (!latest || busy.current) return;
    busy.current = true;
    setStatus('downloading');
    setProgress(0);
    setError(null);
    try {
      const dest = `${FileSystem.cacheDirectory}Sahm-${latest.version}-${latest.build}.apk`;
      const info = await FileSystem.getInfoAsync(dest);
      if (!(info.exists && info.size === latest.size)) {
        const dl = FileSystem.createDownloadResumable(latest.apkUrl, dest, {}, (p) => {
          const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : latest.size;
          setProgress(total > 0 ? p.totalBytesWritten / total : 0);
        });
        const out = await dl.downloadAsync();
        if (!out || out.status !== 200) throw new Error(`Download failed (${out?.status ?? 'no response'})`);
      }
      setProgress(1);
      setFile(dest);
      setStatus('ready');
      await openInstaller(dest);
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    } finally {
      busy.current = false;
    }
  }, [latest]);

  const install = useCallback(async () => {
    if (!file) return download();
    try {
      await openInstaller(file);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [file, download]);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  return <Ctx.Provider value={{ status, latest, progress, error, check, download, install }}>{children}</Ctx.Provider>;
}

async function openInstaller(fileUri: string) {
  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
}

export function useUpdate() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUpdate outside UpdateProvider');
  return v;
}
