/**
 * Small pieces the Duel board and lobby share: the energy gem, numbers that tick
 * to a new value, and the credits coin for the end sheet.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { View, Text, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { color, font, gem } from '../../constants/design';

const svgId = (raw: string) => raw.replace(/[^a-zA-Z0-9]/g, '');

// ---------------------------------------------------------------- energy gem

/** The energy gem: the same gem as the card cost (lit top-left), ringed off the ground. Grey when spent. */
export function EnergyGem({ value, d = 40, spent }: { value: number; d?: number; spent?: boolean }) {
  const id = `eg${svgId(useId())}`;
  const o = d + 6;
  return (
    <View style={{ width: o, height: o }} accessible accessibilityLabel={`${value} energy left`}>
      <Svg width={o} height={o}>
        <Defs>
          <RadialGradient id={id} cx="34%" cy="28%" r="75%" fx="34%" fy="28%">
            {(spent
              ? [
                  [0, '#6A6F7A'],
                  [0.6, '#3D414A'],
                  [1, '#25282E'],
                ]
              : [
                  [0, gem.hi],
                  [0.4, gem.mid],
                  [0.74, gem.low],
                  [1, gem.edge],
                ]
            ).map(([o, c]) => (
              <Stop key={String(o)} offset={o as number} stopColor={c as string} />
            ))}
          </RadialGradient>
        </Defs>
        <Circle cx={o / 2} cy={o / 2} r={o / 2 - 0.5} fill={color.bg} stroke={color.hairlineStrong} strokeWidth={1} />
        <Circle cx={o / 2} cy={o / 2} r={d / 2} fill={`url(#${id})`} />
        <Circle
          cx={o / 2}
          cy={o / 2 - 0.5}
          r={d / 2 - 0.75}
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth={1}
          strokeDasharray={`${d * 0.9} ${d * 3}`}
          strokeDashoffset={d * 1.6}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text
          style={[
            styles.gemNum,
            {
              fontSize: d * 0.48,
              lineHeight: d * 0.6,
              opacity: spent ? 0.7 : 1,
            },
          ]}
          allowFontScaling={false}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- ticking number

/**
 * A number that counts to its new value over `ms` (200 by default), one integer at a
 * time, in tabular figures: no rolling digits. Under reduced motion it jumps.
 */
export function TickNumber({ value, style, ms = 200 }: { value: number; style?: StyleProp<TextStyle>; ms?: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduced || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const a = from.current;
    const t0 = Date.now();
    let raf = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - t0) / ms);
      setShown(Math.round(a + (value - a) * t));
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, reduced, ms]);
  return <Text style={[{ fontVariant: ['tabular-nums'] }, style]}>{shown}</Text>;
}

// ---------------------------------------------------------------- coin

/** The credits coin (the same drawing as ui's Credits pill), for the prize line on the end sheet. */
export function CoinMark({ s = 16 }: { s?: number }) {
  const id = `coin${svgId(useId())}`;
  return (
    <Svg width={s} height={s} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <RadialGradient id={id} cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#FFF0B8" />
          <Stop offset="0.45" stopColor={color.gold} />
          <Stop offset="1" stopColor="#A9822F" />
        </RadialGradient>
      </Defs>
      <Circle cx={s / 2} cy={s / 2} r={s / 2} fill={`url(#${id})`} />
      <Circle cx={s / 2} cy={s / 2} r={s / 2 - 0.75} stroke="rgba(120,80,20,0.5)" strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  gemNum: {
    fontFamily: font.cardHeavy,
    fontWeight: '800',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
