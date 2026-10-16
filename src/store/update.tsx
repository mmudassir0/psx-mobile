import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
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
  /** download paused because Sahm went to the background; it carries on when Sahm is back */
  paused: boolean;
  /** hand the download to the phone's browser, which keeps going in the background */
  openInBrowser: () => void;
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

  // Android cuts an app's connections soon after it leaves the screen, so the
  // download is paused when Sahm goes to the background and resumed from the
  // same byte when it comes back.
  const dl = useRef<FileSystem.DownloadResumable | null>(null);
  const pausing = useRef(false);
  const [paused, setPaused] = useState(false);

  const download = useCallback(async () => {
    if (!latest || busy.current) return;
    busy.current = true;
    setStatus('downloading');
    setError(null);
    setPaused(false);
    try {
      const dest = `${FileSystem.cacheDirectory}Sahm-${latest.version}-${latest.build}.apk`;
      const info = await FileSystem.getInfoAsync(dest);
      if (!(info.exists && info.size === latest.size)) {
        const onProgress = (p: FileSystem.DownloadProgressData) => {
          const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : latest.size;
          setProgress((old) => Math.max(old, total > 0 ? p.totalBytesWritten / total : 0));
        };
        let out: FileSystem.FileSystemDownloadResult | undefined;
        if (dl.current) {
          out = await dl.current.resumeAsync();
        } else {
          setProgress(0);
          dl.current = FileSystem.createDownloadResumable(latest.apkUrl, dest, {}, onProgress);
          out = await dl.current.downloadAsync();
        }
        if (!out) {
          // paused for the background; the AppState listener resumes it
          if (pausing.current) return;
          throw new Error('Download stopped');
        }
        if (out.status !== 200 && out.status !== 206) throw new Error(`Download failed (${out.status})`);
        const done = await FileSystem.getInfoAsync(dest);
        if (done.exists && latest.size && done.size !== latest.size) {
          dl.current = null;
          await FileSystem.deleteAsync(dest, { idempotent: true });
          throw new Error('The download was incomplete; tap Try again');
        }
      }
      dl.current = null;
      setProgress(1);
      setFile(dest);
      setStatus('ready');
      await openInstaller(dest);
    } catch (e) {
      // A paused download keeps what it has; one that failed outright starts over.
      const resumable = !!dl.current?.savable().resumeData;
      if (!resumable) dl.current = null;
      if (pausing.current) {
        // the connection was cut as Sahm went to the background: carry on when it's back
        setPaused(true);
        return;
      }
      setError(
        resumable
          ? `${(e as Error).message}. Try again carries on from ${Math.round(progressRef.current * 100)}%.`
          : `${(e as Error).message}. If it keeps stopping, use Download in browser: the browser keeps going when you switch apps.`,
      );
      setStatus('error');
    } finally {
      busy.current = false;
    }
  }, [latest]);

  const progressRef = useRef(0);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (s) => {
      if (s === 'background' && busy.current) {
        pausing.current = true;
        try {
          await dl.current?.pauseAsync();
          setPaused(true);
        } catch {
          // already finished or failed
        }
      } else if (s === 'active' && pausing.current) {
        pausing.current = false;
        setPaused(false);
        download();
      }
    });
    return () => sub.remove();
  }, [download]);

  const openInBrowser = useCallback(() => {
    if (latest) Linking.openURL(latest.apkUrl);
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

  return <Ctx.Provider value={{ status, latest, progress, error, check, download, install, paused, openInBrowser }}>{children}</Ctx.Provider>;
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
