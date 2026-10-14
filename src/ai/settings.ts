import { load, save } from '../storage';
import { DEFAULT_URL } from './ollama';

export interface AiSettings {
  url: string;
  model: string | null;
}

const KEY = 'ai.settings';
export async function loadAiSettings(): Promise<AiSettings> {
  return load<AiSettings>(KEY, { url: DEFAULT_URL, model: null });
}
export async function saveAiSettings(s: AiSettings): Promise<void> {
  await save(KEY, s);
}
