/** Message types shared by the AI chat and its providers. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Generation {
  /** resolves with the full text, also when stopped early */
  done: Promise<string>;
  stop: () => void;
}

