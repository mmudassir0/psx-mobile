/** Watchlist groups: the chips above the watchlist in Market, and the "lists" row on a stock page. */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { addGroup, deleteGroup, renameGroup, toggleInGroup, watchGroupsPref } from '../portfolio/watchGroups';
import { useUser } from '../store/user';
import { Button, T } from './kit';

/** Chips to pick a group in the watchlist, with new / rename / delete. `value` null means the whole watchlist. */
export function GroupBar({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const groups = watchGroupsPref.use();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const current = groups.find((g) => g.id === value) ?? null;
  const create = () => {
    const next = addGroup(groups, name);
    watchGroupsPref.set(next);
    if (next.length > groups.length) onChange(next[next.length - 1].id);
    setName('');
    setAdding(false);
  };
  return (
    <View style={{ gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="All" on={value === null} onPress={() => onChange(null)} />
        {groups.map((g) => (
          <Chip key={g.id} label={`${g.name} · ${g.symbols.length}`} on={value === g.id} onPress={() => onChange(g.id)} />
        ))}
        <Chip label="+ New list" on={false} onPress={() => (setAdding(true), setEditing(false))} />
        {current ? <Chip label="Edit" on={false} onPress={() => (setEditing((v) => !v), setName(current.name), setAdding(false))} /> : null}
      </ScrollView>
      {adding || editing ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            placeholder="e.g. Banks to buy"
            placeholderTextColor={colors.faint}
            style={styles.input}
            onSubmitEditing={() => (adding ? create() : (watchGroupsPref.set(renameGroup(groups, current!.id, name)), setEditing(false)))}
          />
          {adding ? (
            <Button label="Add" small onPress={create} disabled={!name.trim()} />
          ) : (
            <>
              <Button label="Save" small onPress={() => (watchGroupsPref.set(renameGroup(groups, current!.id, name)), setEditing(false))} />
              <Button label="Delete" small tone="ghost" onPress={() => (watchGroupsPref.set(deleteGroup(groups, current!.id)), onChange(null), setEditing(false))} />
            </>
          )}
        </View>
      ) : null}
      {current && !current.symbols.length ? <T v="caption">Empty: open a stock and tap "{current.name}" under Lists to add it.</T> : null}
    </View>
  );
}

/** On a stock page: which of your lists it's in; tap to add or remove (adding also stars it). */
export function StockLists({ symbol }: { symbol: string }) {
  const groups = watchGroupsPref.use();
  const { isWatched, toggleWatch } = useUser();
  if (!groups.length) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <T v="caption">Lists</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {groups.map((g) => {
          const on = g.symbols.includes(symbol);
          return (
            <Chip
              key={g.id}
              small
              label={`${on ? '✓ ' : '+ '}${g.name}`}
              on={on}
              onPress={() => {
                watchGroupsPref.set(toggleInGroup(groups, g.id, symbol));
                if (!on && !isWatched(symbol)) toggleWatch(symbol);
              }}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

function Chip({ label, on, onPress, small }: { label: string; on: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[styles.chip, small && { height: 28, paddingHorizontal: 10 }, on && styles.chipOn]}>
      <T style={{ fontFamily: fonts.bold, fontSize: small ? 12 : 13, color: on ? colors.onGold : colors.text2 }}>{label}</T>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    chip: { paddingHorizontal: 14, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
    chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
    input: { flex: 1, height: 40, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, fontSize: 14.5, color: colors.text, fontFamily: fonts.regular },
  }),
);
