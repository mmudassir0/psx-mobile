/** Downloads from GitHub (the daily files) with a time limit and plain error messages. */
import { logProblem } from './log';

export class NetError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'NetError';
  }
}

/** Fetches JSON, giving up after `timeoutMs` so a weak signal can't leave a screen spinning forever. */
export async function getJson(url: string, timeoutMs = 20_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) throw new NetError('Not published yet', 404);
    if (!res.ok) throw new NetError(`The server answered ${res.status}`, res.status);
    return await res.json();
  } catch (e) {
    if (e instanceof NetError) {
      if (e.status !== 404) logProblem(`download ${shortName(url)}`, e);
      throw e;
    }
    const aborted = (e as Error)?.name === 'AbortError';
    const err = new NetError(aborted ? 'The connection is too slow right now' : 'No internet connection');
    // being offline is normal and not worth logging; a download that hangs is
    if (aborted) logProblem(`download ${shortName(url)}`, err);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const shortName = (url: string) => url.replace(/\?.*$/, '').split('/').pop() ?? url;
