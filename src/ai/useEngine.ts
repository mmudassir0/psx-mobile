/** Status of the on-phone AI engine (Ollama in Termux): reachable, which model, and a way to re-check. */
import { useCallback, useEffect, useState } from 'react';
import { chooseModel, listModels, ModelInfo } from './ollama';
import { AiSettings, loadAiSettings, saveAiSettings } from './settings';

export type EngineState =
  | { status: 'checking' }
  | { status: 'off'; error: string }
  | { status: 'no-model' }
  | { status: 'ready'; model: string };

export function useEngine() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [state, setState] = useState<EngineState>({ status: 'checking' });

  const check = useCallback(async (s?: AiSettings) => {
    const cur = s ?? settings ?? (await loadAiSettings());
    setSettings(cur);
    setState({ status: 'checking' });
    try {
      const ms = await listModels(cur.url);
      setModels(ms);
      const model = chooseModel(ms, cur.model);
      setState(model ? { status: 'ready', model } : { status: 'no-model' });
    } catch (e) {
      setModels([]);
      setState({ status: 'off', error: (e as Error).message });
    }
  }, [settings]);

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback(
    async (next: Partial<AiSettings>) => {
      const merged = { ...(settings ?? (await loadAiSettings())), ...next };
      await saveAiSettings(merged);
      await check(merged);
    },
    [settings, check],
  );

  return { settings, models, state, check: () => check(), update };
}
