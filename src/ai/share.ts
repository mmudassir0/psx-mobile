/**
 * "Ask in another app": turns Sahm's prompt into one self-contained message
 * for the Gemini, Claude or ChatGPT app, opened through Android's share sheet.
 * The answer then comes from the user's own account in that app.
 */
import { Share } from 'react-native';
import type { ChatMessage } from './models';
import { sharePrompt } from './sharePrompt';

export { sharePrompt };

export async function shareToApp(messages: ChatMessage[], title: string): Promise<void> {
  await Share.share({ message: sharePrompt(messages), title }, { dialogTitle: 'Ask in Gemini, Claude or ChatGPT' });
}
