/** Renders the small subset of Markdown models write: **bold**, _italic_, "- " bullets, blank-line paragraphs. */
import React from 'react';
import { View } from 'react-native';
import { colors, fonts } from '../theme';
import { T } from './kit';

function inline(text: string, base: object) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <T key={i} style={[base, { fontFamily: fonts.bold, color: colors.text }]}>{part.slice(2, -2)}</T>;
    if (part.startsWith('_') && part.endsWith('_') && part.length > 2) return <T key={i} style={[base, { fontStyle: 'italic', color: colors.faint }]}>{part.slice(1, -1)}</T>;
    return part;
  });
}

export function Md({ text, size = 15 }: { text: string; size?: number }) {
  const base = { fontSize: size, lineHeight: size * 1.45, color: colors.text2 };
  const lines = text.replace(/^#+\s*/gm, '').split('\n');
  return (
    <View style={{ gap: 6 }}>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <View key={i} style={{ height: 2 }} />;
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        if (bullet)
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
              <T style={[base, { color: colors.faint }]}>•</T>
              <T style={[base, { flex: 1 }]}>{inline(bullet[1], base)}</T>
            </View>
          );
        return (
          <T key={i} style={base}>
            {inline(line, base)}
          </T>
        );
      })}
    </View>
  );
}
