/** A small ⓘ next to a term: tap for what it means in plain words, with an example from your own holdings. */
import React, { useMemo, useState } from 'react';
import { langPref, UR_TERMS } from '../i18n';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { TERMS, pickExample, type TermId } from '../analysis/glossary';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { T } from './kit';

function Sheet({ id, onClose }: { id: TermId; onClose: () => void }) {
  const lang = langPref.use();
  const ur = lang === 'ur' ? UR_TERMS[id] : null;
  const term = TERMS[id];
  const rtl = ur ? ({ writingDirection: 'rtl', textAlign: 'right' } as const) : null;
  const { holdings } = useHoldings();
  const { bySymbol } = useMarket();
  const example = useMemo(
    () =>
      pickExample(
        term,
        holdings.map((h) => {
          const s = bySymbol.get(h.symbol);
          return { symbol: h.symbol, shares: h.shares, price: s?.price ?? 0, pe: s?.pe ?? null, divYield: s?.divYield ?? null, marketCap: s?.marketCap ?? null };
        }),
      ),
    [term, holdings, bySymbol],
  );
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={styles.card} onPress={() => {}}>
          <T style={[{ fontFamily: fonts.bold, fontSize: 16 }, rtl]}>{ur?.title ?? term.title}</T>
          <T v="body" style={[{ fontSize: 14.5, lineHeight: ur ? 26 : 21 }, rtl]}>
            {ur?.body ?? term.body}
          </T>
          {example ? (
            <View style={styles.example}>
              <T style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.gold }}>{ur ? 'آپ کے شیئرز کے ساتھ (انگریزی میں)' : 'With your shares'}</T>
              <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>
                {example}
              </T>
            </View>
          ) : null}
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={{ alignSelf: 'flex-end', paddingTop: 4 }}>
            <T style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.gold }}>{ur ? 'ٹھیک ہے' : 'Got it'}</T>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function Explain({ id, size = 15 }: { id: TermId; size?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`What is ${TERMS[id].title}?`} hitSlop={10} onPress={() => setOpen(true)}>
        <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2 }]}>
          <T style={{ fontFamily: fonts.bold, fontSize: size * 0.68, lineHeight: size * 0.9, color: colors.faint }}>i</T>
        </View>
      </Pressable>
      {open ? <Sheet id={id} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** A label with its ⓘ. */
export function Termed({ label, id, v = 'caption', style }: { label: string; id: TermId; v?: 'caption' | 'title' | 'label'; style?: object }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <T v={v} style={style}>
        {label}
      </T>
      <Explain id={id} size={v === 'title' ? 17 : 14} />
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    dot: { borderWidth: 1.2, borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
    scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 22 },
    card: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, gap: 10 },
    example: { backgroundColor: colors.surface2, borderRadius: 14, padding: 12, gap: 4 },
  }),
);
