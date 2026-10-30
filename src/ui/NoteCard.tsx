/** Your note on a stock: why you own it, when to look again, and the figures then against now. */
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { fmtDay } from '../format';
import { deleteNote, dueNotes, inMonths, moved, notesPref, saveNote, type NoteFigures } from '../portfolio/notes';
import { Panel } from './bits';
import { Button, T } from './kit';
import { ToolIcon } from './ToolIcon';

const WHEN = [
  { months: 3, label: '3 months' },
  { months: 6, label: '6 months' },
  { months: 12, label: '1 year' },
  { months: 0, label: 'No date' },
];
const dayT = (d: string) => Date.parse(d + 'T12:00:00Z');

export function NoteCard({ symbol, now, owned }: { symbol: string; now: NoteFigures; owned: boolean }) {
  const notes = notesPref.use();
  const note = notes[symbol];
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [months, setMonths] = useState(6);
  const due = !!note && dueNotes({ [symbol]: note }).length > 0;

  const start = () => {
    setText(note?.why ?? '');
    setMonths(6);
    setEditing(true);
  };
  const save = async () => {
    if (!text.trim()) return;
    // the figures are kept from when the note was first written, unless it's rewritten from scratch
    const keep = note && note.why.trim() === text.trim();
    await saveNote(symbol, { why: text.trim(), checkOn: months ? inMonths(months) : null, at: Date.now(), then: keep ? note.then : now });
    setEditing(false);
  };
  const stillHolds = (m: number) => saveNote(symbol, { ...note!, checkOn: inMonths(m), at: Date.now(), then: now });

  if (editing)
    return (
      <Panel style={{ paddingVertical: 14, gap: 10 }}>
        <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>
          Why {owned ? 'you own' : "you're watching"} {symbol}
        </T>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          placeholder="e.g. Strong bank, P/E of 4, pays about 12% in dividends. Sell if dividends are cut."
          placeholderTextColor={colors.faint}
          style={styles.input}
        />
        <T v="caption">Remind me to check it in</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {WHEN.map((w) => (
            <Pressable key={w.months} accessibilityRole="button" onPress={() => setMonths(w.months)} style={[styles.chip, months === w.months && styles.chipOn]}>
              <T style={{ fontFamily: fonts.semibold, fontSize: 13, color: months === w.months ? colors.onGold : colors.text }}>{w.label}</T>
            </Pressable>
          ))}
        </View>
        <T v="caption" style={{ lineHeight: 17 }}>
          Today's price, P/E, dividend yield and fair value are saved with the note, so you can compare later.
        </T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label="Cancel" tone="ghost" onPress={() => setEditing(false)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Save note" disabled={!text.trim()} onPress={save} />
          </View>
        </View>
        {note ? (
          <Pressable onPress={() => (deleteNote(symbol), setEditing(false))} hitSlop={6}>
            <T v="caption" style={{ color: colors.downText }}>
              Delete the note
            </T>
          </Pressable>
        ) : null}
      </Panel>
    );

  if (!note)
    return (
      <Pressable accessibilityRole="button" onPress={start} style={styles.empty}>
        <ToolIcon name="pencil" size={20} color={colors.gold} />
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.semibold, fontSize: 14 }}>{owned ? 'Why do you own this?' : 'Add a note'}</T>
          <T v="caption">Write your reason and Sahm reminds you to check it later.</T>
        </View>
        <T style={{ color: colors.gold, fontFamily: fonts.bold }}>+</T>
      </Pressable>
    );

  const r2 = (v: number) => `Rs ${v.toFixed(2)}`;
  const lines = [
    ['Price', moved(note.then.price, now.price, r2)],
    ['P/E', moved(note.then.pe, now.pe, (v) => v.toFixed(1))],
    ['Dividend yield', moved(note.then.divYield, now.divYield, (v) => `${v.toFixed(1)}%`)],
    ['Fair value', moved(note.then.fair, now.fair, r2)],
  ].filter((l): l is [string, string] => !!l[1]);
  return (
    <Panel style={[{ paddingVertical: 14, gap: 8 }, due && { borderColor: colors.gold, borderWidth: 1.5 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <T style={{ fontFamily: fonts.bold, fontSize: 14, flex: 1 }}>{due ? 'Time to check your note' : 'Your note'}</T>
        <Pressable onPress={start} hitSlop={8}>
          <T style={{ fontFamily: fonts.semibold, color: colors.gold, fontSize: 13 }}>Edit</T>
        </Pressable>
      </View>
      <T v="body" style={{ fontSize: 14.5, lineHeight: 21 }}>
        "{note.why}"
      </T>
      <T v="caption">
        Written {fmtDay(note.at)}
        {note.checkOn ? ` · check ${due ? 'was due' : 'on'} ${fmtDay(dayT(note.checkOn))}` : ''}
      </T>
      {lines.length ? (
        <View style={{ gap: 3, marginTop: 2 }}>
          <T v="label">Then → now</T>
          {lines.map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row' }}>
              <T v="caption" style={{ flex: 1, color: colors.text2 }}>
                {k}
              </T>
              <T v="mono" style={{ fontSize: 13 }}>
                {v}
              </T>
            </View>
          ))}
        </View>
      ) : null}
      {due ? (
        <View style={{ gap: 8, marginTop: 4 }}>
          <T v="caption" style={{ lineHeight: 17 }}>
            Does your reason still hold? If it does, check again later; if not, edit the note or think about selling.
          </T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="Still holds: 6 months" small onPress={() => stillHolds(6)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Edit" small tone="ghost" onPress={start} />
            </View>
          </View>
        </View>
      ) : null}
    </Panel>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    input: {
      minHeight: 90,
      borderRadius: 12,
      backgroundColor: colors.ground,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 12,
      fontSize: 14.5,
      color: colors.text,
      fontFamily: fonts.regular,
      textAlignVertical: 'top',
    },
    chip: { paddingHorizontal: 12, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
    chipOn: { backgroundColor: colors.gold },
    empty: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line },
  }),
);
