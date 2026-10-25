/**
 * Starting the daily update yourself from the app. GitHub needs a token for
 * that: a fine-grained personal access token limited to this repository with
 * "Actions: read and write" only, which can start and read the job but can't
 * change code, secrets or anything else. It's kept in the phone's secure
 * storage, like the AI keys, and only sent to api.github.com.
 */
import * as SecureStore from 'expo-secure-store';

export const REPO = 'mmudassir0/psx-mobile';
const WORKFLOW = 'picks.yml';
const K_TOKEN = 'github_token';

export async function githubToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(K_TOKEN);
  } catch {
    return null;
  }
}
export async function setGithubToken(v: string | null): Promise<void> {
  try {
    if (v && v.trim()) await SecureStore.setItemAsync(K_TOKEN, v.trim());
    else await SecureStore.deleteItemAsync(K_TOKEN);
  } catch {
    // web preview has no secure store
  }
}

const api = async (token: string, path: string, init?: RequestInit) => {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init?.headers ?? {}) },
  });
  if (res.status === 401) throw new Error('GitHub refused the token: check it was copied whole and hasn\'t expired');
  if (res.status === 403 || res.status === 404) throw new Error(`GitHub answered ${res.status}: the token needs "Actions: read and write" on ${REPO}`);
  if (!res.ok && res.status !== 204) throw new Error(`GitHub answered ${res.status}`);
  return res.status === 204 ? null : res.json();
};

/** Starts the update. `alerts` also sends the holdings and price alerts; `again` sends them even if today's went already. */
export async function runUpdate(token: string, opts: { alerts: boolean; again: boolean }): Promise<void> {
  await api(token, `/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { alerts: String(opts.alerts), again: String(opts.again) } }),
  });
}

export interface RunInfo {
  id: number;
  status: 'queued' | 'in_progress' | 'completed' | string;
  conclusion: 'success' | 'failure' | 'cancelled' | null | string;
  event: string;
  createdAt: number;
  updatedAt: number;
}

export async function recentRuns(token: string, n = 5): Promise<RunInfo[]> {
  const j = await api(token, `/actions/workflows/${WORKFLOW}/runs?per_page=${n}`);
  return (j?.workflow_runs ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as number,
    status: r.status as string,
    conclusion: (r.conclusion as string) ?? null,
    event: r.event as string,
    createdAt: Date.parse(r.created_at as string),
    updatedAt: Date.parse(r.updated_at as string),
  }));
}
