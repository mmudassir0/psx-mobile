/** Models Sahm can download and run on the phone. Official Qwen GGUF builds from Hugging Face. */
export interface LocalModel {
  id: string;
  name: string;
  file: string;
  url: string;
  /** exact file size; a finished download must match it */
  bytes: number;
  blurb: string;
}

export const MODELS: LocalModel[] = [
  {
    id: 'qwen2.5-1.5b',
    name: 'Fast · Qwen2.5 1.5B',
    file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    bytes: 1_117_320_736,
    blurb: 'Quicker answers, good for summaries.',
  },
  {
    id: 'qwen2.5-3b',
    name: 'Smart · Qwen2.5 3B',
    file: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    bytes: 2_104_932_768,
    blurb: 'More careful reasoning, about half the speed.',
  },
];

export const modelById = (id: string | null | undefined) => MODELS.find((m) => m.id === id) ?? null;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Generation {
  /** resolves with the full text, also when stopped early */
  done: Promise<string>;
  stop: () => void;
}

export const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;
