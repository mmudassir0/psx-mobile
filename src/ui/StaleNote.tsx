/** A small warning when the daily data is behind. */
import React from 'react';
import { View } from 'react-native';
import { colors } from '../theme';
import { freshness } from '../picks/build';
import { T } from './kit';

export function StaleNote({ feed }: { feed: { day: string; stale?: boolean } | null | undefined }) {
  const msg = freshness(feed);
  if (!msg) return null;
  return (
    <View style={{ backgroundColor: colors.goldSoft, borderRadius: 10, padding: 10 }}>
      <T v="caption" style={{ color: colors.text2, lineHeight: 18 }}>
        {msg}
      </T>
    </View>
  );
}
