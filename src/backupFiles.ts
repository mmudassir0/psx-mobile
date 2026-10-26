/** Names of the automatic backup files (pure, so the tests can check them). */
export const KEEP = 4;

/** "Download" or "Sahm" from a folder address like content://…/tree/primary%3ADownload%2FSahm */
export function folderName(dir: string): string {
  const tail = decodeURIComponent(dir.split('/tree/').pop() ?? dir);
  const path = tail.includes(':') ? tail.slice(tail.indexOf(':') + 1) : tail;
  return path.split('/').filter(Boolean).pop() || (/drive/i.test(dir) ? 'Google Drive' : 'chosen folder');
}

/** The day in a backup file's address ("…Sahm%20backup%202026-10-26.json" → "2026-10-26"), or null. */
export function backupDay(uri: string): string | null {
  const name = decodeURIComponent(uri).split('/').pop() ?? '';
  const m = name.match(/Sahm backup (\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** Which backups to delete so the newest `keep` stay. */
export function toPrune(uris: string[], keep = KEEP): string[] {
  const ours = uris.filter((u) => backupDay(u)).sort((a, b) => (backupDay(b)! < backupDay(a)! ? -1 : 1));
  return ours.slice(keep);
}

