import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text as RNText,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { changeColor, colors, fonts } from '../theme';
import { arrowPct } from '../format';

type Variant = 'body' | 'caption' | 'label' | 'title' | 'h1' | 'display' | 'mono' | 'monoLg' | 'monoXl';

const variants: Record<Variant, TextStyle> = {
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.text },
  caption: { fontFamily: fonts.medium, fontSize: 12, color: colors.faint },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.muted },
  title: { fontFamily: fonts.heavy, fontSize: 16, color: colors.text },
  h1: { fontFamily: fonts.heavy, fontSize: 24, letterSpacing: -0.4, color: colors.text },
  display: { fontFamily: fonts.heavy, fontSize: 32, letterSpacing: -0.8, color: colors.text },
  mono: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.text },
  monoLg: { fontFamily: fonts.monoBold, fontSize: 20, color: colors.text },
  monoXl: { fontFamily: fonts.monoBold, fontSize: 30, letterSpacing: -0.6, color: colors.text },
};

export function T({ v = 'body', style, ...rest }: TextProps & { v?: Variant }) {
  return <RNText {...rest} style={[variants[v], style]} />;
}

export function Card({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Change({ pct, style }: { pct: number | null | undefined; style?: StyleProp<TextStyle> }) {
  return (
    <T v="mono" style={[{ fontSize: 12, color: changeColor(pct) }, style]}>
      {arrowPct(pct)}
    </T>
  );
}

export function Badge({ label, tone = 'shariah' }: { label: string; tone?: 'shariah' | 'gold' | 'up' | 'down' | 'muted' }) {
  const map = {
    shariah: [colors.shariah, colors.shariahSoft],
    gold: [colors.gold, colors.goldSoft],
    up: [colors.up, colors.upSoft],
    down: [colors.downText, colors.downSoft],
    muted: [colors.muted, colors.surface2],
  } as const;
  const [fg, bg] = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <RNText style={[styles.badgeText, { color: fg }]}>{label}</RNText>
    </View>
  );
}

export function Button({
  label,
  onPress,
  tone = 'gold',
  disabled,
  loading,
  style,
  small,
}: {
  label: string;
  onPress?: () => void;
  tone?: 'gold' | 'up' | 'down' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const bg = tone === 'gold' ? colors.gold : tone === 'up' ? colors.up : tone === 'down' ? colors.down : 'transparent';
  const fg = tone === 'ghost' ? colors.text : colors.ground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        small && { height: 44, borderRadius: 12 },
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        tone === 'ghost' && { borderWidth: 1, borderColor: colors.line },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <RNText style={{ color: fg, fontFamily: fonts.heavy, fontSize: small ? 14 : 16 }}>{label}</RNText>
      )}
    </Pressable>
  );
}

export function Segmented<K extends string>({
  options,
  value,
  onChange,
  colorFor,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
  colorFor?: (k: K) => string;
}) {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        const activeBg = colorFor ? colorFor(o.key) : colors.line;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.key)}
            style={[styles.segmentItem, on && { backgroundColor: activeBg }]}
          >
            <RNText
              style={{
                fontFamily: fonts.bold,
                fontSize: 13,
                color: on ? (colorFor ? colors.ground : colors.text) : colors.faint,
              }}
            >
              {o.label}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      onPress={onPress}
      style={[styles.chip, on && { backgroundColor: colors.shariahSoft, borderColor: colors.shariah }]}
    >
      <RNText style={{ fontFamily: fonts.bold, fontSize: 13, color: on ? colors.shariah : colors.muted }}>{label}</RNText>
    </Pressable>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 10 }}>
      <ActivityIndicator color={colors.gold} />
      {label ? <T v="caption">{label}</T> : null}
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View style={{ padding: 28, alignItems: 'center', gap: 6 }}>
      <T v="title">{title}</T>
      {body ? <T v="caption" style={{ textAlign: 'center', lineHeight: 18 }}>{body}</T> : null}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.surface2 }} />;
}

/** Tiny line-icon set (stroke icons, 24 grid). */
export function Icon({ name, size = 22, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  const p = { stroke: color, strokeWidth: 1.75, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && <Path {...p} d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />}
      {name === 'market' && (
        <>
          <Path {...p} d="M3 3v18h18" />
          <Path {...p} d="m7 15 4-4 3 3 5-6" />
        </>
      )}
      {name === 'trade' && (
        <>
          <Path {...p} d="M7 4v16" />
          <Path {...p} d="m3 8 4-4 4 4" />
          <Path {...p} d="M17 20V4" />
          <Path {...p} d="m21 16-4 4-4-4" />
        </>
      )}
      {name === 'portfolio' && (
        <>
          <Path {...p} d="M21 12a9 9 0 1 1-9-9v9z" />
          <Path {...p} d="M15 3.5A9 9 0 0 1 20.5 9H15z" />
        </>
      )}
      {name === 'ai' && (
        <>
          <Path {...p} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
          <Path {...p} d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
        </>
      )}
      {name === 'search' && (
        <>
          <Circle {...p} cx="11" cy="11" r="7" />
          <Path {...p} d="m20 20-3.5-3.5" />
        </>
      )}
      {name === 'back' && <Path {...p} d="m15 5-7 7 7 7" />}
      {name === 'close' && <Path {...p} d="M6 6l12 12M18 6 6 18" />}
      {name === 'star' && <Path {...p} d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z" />}
      {name === 'starFilled' && (
        <Path fill={color} d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z" />
      )}
      {name === 'refresh' && (
        <>
          <Path {...p} d="M20 11a8 8 0 1 0-2.3 5.7" />
          <Path {...p} d="M20 4v7h-7" />
        </>
      )}
      {name === 'doc' && (
        <>
          <Path {...p} d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <Path {...p} d="M14 3v5h5" />
        </>
      )}
      {name === 'chevron' && <Path {...p} d="m9 5 7 7-7 7" />}
    </Svg>
  );
}

export type IconName =
  | 'home'
  | 'market'
  | 'trade'
  | 'portfolio'
  | 'ai'
  | 'search'
  | 'back'
  | 'close'
  | 'star'
  | 'starFilled'
  | 'refresh'
  | 'doc'
  | 'chevron';

export function IconButton({
  name,
  label,
  onPress,
  color,
  filled = true,
}: {
  name: IconName;
  label: string;
  onPress?: () => void;
  color?: string;
  filled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, !filled && { backgroundColor: 'transparent' }, pressed && { opacity: 0.7 }]}
    >
      <Icon name={name} size={20} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 16 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, alignSelf: 'center' },
  badgeText: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.3 },
  button: { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 4, gap: 4 },
  segmentItem: { flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  chip: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
