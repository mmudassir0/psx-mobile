/** Cash at the broker: money waiting to be invested, counted in your total. Tap to change it. */
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { fmtDay, fmtNum, fmtPkr } from '../format';
import { cashPref } from '../portfolio/prefs';
import { T } from './kit';

export function CashBox({ shares }: { shares: number }) {
  const cash = cashPref.use();
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState('');
  const done = async () => {
    const n = Math.max(0, Number(text.replace(/[^\d.]/g, '')) || 0);
    await cashPref.set({ amount: n, at: Date.now() });
    setEdit(false);
  };
  if (edit)
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T v="body" style={{ flex: 1, fontSize: 14 }}>
          Cash at the broker (Rs)
        </T>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={done}
          onBlur={done}
          autoFocus
          placeholder="0"
          keyboardType="numeric"
          returnKeyType="done"
          placeholderTextColor={colors.faint}
          style={styles.input}
          accessibilityLabel="Cash at the broker in rupees"
        />
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cash.amount ? `Cash at the broker Rs ${fmtNum(cash.amount, 0)}, change it` : 'Add cash at the broker'}
      onPress={() => {
        setText(cash.amount ? String(Math.round(cash.amount)) : '');
        setEdit(true);
      }}
    >
      {cash.amount > 0 ? (
        <T v="caption" style={{ lineHeight: 18 }}>
          Plus <T style={{ fontFamily: fonts.bold, fontSize: 13 }}>Rs {fmtNum(cash.amount, 0)}</T> cash at the broker{cash.at ? ` (${fmtDay(cash.at)})` : ''}: {fmtPkr(shares + cash.amount)} in all,{' '}
          {Math.round((cash.amount / (shares + cash.amount)) * 100)}% in cash. <T style={{ color: colors.gold, fontSize: 13 }}>Change</T>
        </T>
      ) : (
        <T style={{ color: colors.gold, fontSize: 13, fontFamily: fonts.semibold }}>+ Add cash waiting at your broker</T>
      )}
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    input: {
      minWidth: 120,
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      color: colors.text,
      fontFamily: fonts.mono,
      fontSize: 15,
      textAlign: 'right',
    },
  }),
);
