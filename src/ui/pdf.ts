/** Makes a PDF from HTML and opens the share sheet, with a readable file name instead of "Print-1a2b….pdf". Web prints instead. */
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

/** "Shariah momentum: lab report" → "Sahm-Shariah-momentum-lab-report.pdf" (letters, digits and dashes only, so it's safe in a file address) */
export function pdfName(title: string): string {
  const clean = title
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `Sahm-${clean || 'report'}.pdf`;
}

export async function sharePdf(html: string, title: string, size?: { width: number; height: number }): Promise<void> {
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, ...(size ?? {}) });
  let file = uri;
  try {
    // a named copy in the cache; the share still works from the original if the move fails
    const named = `${FileSystem.cacheDirectory}${pdfName(title)}`;
    await FileSystem.deleteAsync(named, { idempotent: true });
    await FileSystem.moveAsync({ from: uri, to: named });
    file = named;
  } catch {
    file = uri;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error("This phone can't share files from apps");
  await Sharing.shareAsync(file, { mimeType: 'application/pdf', dialogTitle: title, UTI: 'com.adobe.pdf' });
}
