/**
 * Sahm's motion: small, quick and purposeful. Cards rise in, numbers count to their value,
 * chart lines draw themselves, pressed things give a little, a moving price flashes.
 * Everything here turns itself off when the phone asks for reduced motion.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Path, type PathProps } from 'react-native-svg';
import { colors } from '../theme';

const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

/** Fades and lifts its children in once, `delay` ms after it first appears. Stagger siblings by ~60 ms. */
export function Rise({ delay = 0, style, children }: { delay?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    p.value = withDelay(delay, withTiming(1, { duration: 520, easing: EASE }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ends at exactly opacity 1 and no offset, so nothing is left out of place
  const a = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 14 }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/**
 * A number that counts to its value: from 0 the first time, then from the old value to the new one
 * (a price that moves glides there). Returns the number to show; format it yourself.
 */
export function useCountUp(value: number | null | undefined, ms = 900): number | null {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState<number | null>(value == null ? null : reduce ? value : 0);
  const from = useRef(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (value == null || !Number.isFinite(value)) {
      setShown(value ?? null);
      return;
    }
    if (reduce) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = from.current;
    const t0 = Date.now();
    const step = () => {
      const p = Math.min(1, (Date.now() - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const v = start + (value - start) * e;
      setShown(v);
      from.current = v;
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [value, ms, reduce]);
  return shown;
}

const APressable = Animated.createAnimatedComponent(Pressable);

/** A Pressable that gives a little under the finger (springs to 97%) and settles back. Takes the same style as a Pressable. */
export function Press({ style, children, scaleTo = 0.97, ...rest }: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; scaleTo?: number; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable
      {...rest}
      onPressIn={(e) => {
        if (!reduce) s.value = withSpring(scaleTo, { damping: 18, stiffness: 420 });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, { damping: 14, stiffness: 300 });
        rest.onPressOut?.(e);
      }}
      style={[style, a]}
    >
      {children}
    </APressable>
  );
}

const APath = Animated.createAnimatedComponent(Path);

/** Total length of a polyline, for drawing it in. */
export function polyLength(pts: [number, number][]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** An SVG path that draws itself from start to end. `length` is the path's length (polyLength); `drawKey` restarts it. */
export function DrawPath({ length, delay = 150, ms = 1200, drawKey, ...props }: PathProps & { length: number; delay?: number; ms?: number; drawKey?: string | number }) {
  const reduce = useReducedMotion();
  const off = useSharedValue(reduce ? 0 : length);
  useEffect(() => {
    if (reduce) {
      off.value = 0;
      return;
    }
    off.value = length;
    const t = setTimeout(() => {
      off.value = withTiming(0, { duration: ms, easing: Easing.bezier(0.4, 0, 0.2, 1) });
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey, length, reduce]);
  const ap = useAnimatedProps(() => ({ strokeDashoffset: off.value }));
  return <APath {...props} strokeDasharray={`${length} ${length}`} animatedProps={ap} />;
}

/** Briefly tints its background green or red when `value` moves (a live price). */
export function Flash({ value, style, children }: { value: number | null | undefined; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const prev = useRef(value);
  const o = useSharedValue(0);
  const [dir, setDir] = useState<1 | -1>(1);
  useEffect(() => {
    const was = prev.current;
    prev.current = value;
    if (reduce || was == null || value == null || was === value) return;
    setDir(value > was ? 1 : -1);
    o.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 650 }));
  }, [value, reduce, o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={style}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -6, right: -6, top: 0, bottom: 0, borderRadius: 8, backgroundColor: dir > 0 ? colors.upSoft : colors.downSoft }, a]} />
      {children}
    </Animated.View>
  );
}

/** Grows a bar from zero to its size once (along x unless `vertical`). */
export function GrowBar({ delay = 0, vertical, fromTop, style }: { delay?: number; vertical?: boolean; fromTop?: boolean; style: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => {
      p.value = withTiming(1, { duration: 800, easing: EASE });
    }, delay);
    return () => clearTimeout(t);
  }, [delay, reduce, p]);
  const a = useAnimatedStyle(() => ({ transform: vertical ? [{ scaleY: p.value }] : [{ scaleX: p.value }] }));
  return <Animated.View style={[style, a, { transformOrigin: vertical ? (fromTop ? 'top' : 'bottom') : 'left' }]} />;
}

/** A small dot that sends out a soft ring now and then (market open, live). */
export function PulseDot({ color, size = 8 }: { color: string; size?: number }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    p.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
  }, [reduce, p]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - p.value), transform: [{ scale: 1 + p.value * 1.6 }] }));
  return (
    <Animated.View style={{ width: size, height: size }}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, ring]} />
      <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </Animated.View>
  );
}
