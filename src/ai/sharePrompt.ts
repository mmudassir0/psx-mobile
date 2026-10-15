import type { ChatMessage } from './models';

/** One self-contained message for another AI app: instructions, then the data and question. */
export function sharePrompt(messages: ChatMessage[]): string {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const turns = messages.filter((m) => m.role !== 'system');
  const body = turns.map((m) => (m.role === 'user' ? m.content : `(Earlier answer) ${m.content}`)).join('\n\n');
  return [
    'I am using my PSX stock app, Sahm. Please act on the instructions below.',
    '',
    'INSTRUCTIONS',
    system,
    '',
    '----------',
    body,
  ].join('\n');
}
