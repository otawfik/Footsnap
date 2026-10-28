/**
 * Match rows (SPEC §3): the three-row MatchMarket you pick from, the CompactMatchRow for lists
 * and finished games, and the LiveRow for what's on now. Predictions are % chance, picks are
 * free points.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KitChip, LiveDot, OutcomeRow, pctText, tap, teamName } from './ui';
import type { Match } from '../lib/types';
import type { Outcome, Prediction } from '../lib/model';
import { outcome as resultOf, pick as leadOf } from '../lib/model';
import type { ClubColors } from '../lib/colors';
import { isFinished, isLive } from '../lib/football';
import { locked, points, type UserPick } from '../lib/picks';
import { color, font, radius, space, type } from '../constants/design';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 24-hour kick-off time in the device's time zone ("16:30"). */
export const clock = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** "Sun 1 Nov" */
export const shortDate = (iso: string | Date) => {
  const d = new Date(iso);
  return `${WD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
};
/** "Wednesday 28 October" */
export const longDate = (iso: string | Date) => {
  const d = new Date(iso);
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
};
/** "Saturday 31 Oct" for day group headers */
export const dayHeader = (iso: string | Date) => {
  const d = new Date(iso);
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
};

export function dayLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const diff = Math.round((new Date(d.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return shortDate(iso);
}

/** "Sat 12:30", "Today 20:00" */
export const kickoff = (iso: string) => `${dayLabel(iso).replace(/^(\w{3}) .*/, '$1')} ${clock(iso)}`;

export function statusLabel(m: Match) {
  if (m.status === 'PAUSED') return 'Half time';
  if (m.status === 'EXTRA_TIME') return 'Extra time';
  if (m.status === 'PENALTY_SHOOTOUT') return 'Penalties';
  if (isLive(m)) return 'Live';
  if (isFinished(m)) return 'FT';
  if (m.status === 'POSTPONED') return 'Postponed';
  if (m.status === 'SUSPENDED') return 'Suspended';
  if (m.status === 'CANCELLED') return 'Cancelled';
  return clock(m.utcDate);
}

const outcomeName = (m: Match, o: Outcome) => (o === 'H' ? teamName(m.homeTeam) : o === 'A' ? teamName(m.awayTeam) : 'Draw');

/**
 * The market: a meta line, then home / Draw / away OutcomeRows, then a footer with your pick
 * and the points it's worth. Locked (kicked off) or finished: rows aren't pressable and the
 * result gets a check. `press` adds the per-matchday Press toggle to the footer.
 */
export function MatchMarket({
  match: m,
  prediction: p,
  pick,
  onPick,
  homeColors,
  awayColors,
  venue,
  competition,
  onOpen,
  press,
  divider = true,
}: {
  match: Match;
  prediction: Prediction | null;
  pick?: UserPick;
  onPick?: (o: Outcome) => void;
  homeColors?: ClubColors;
  awayColors?: ClubColors;
  venue?: string;
  competition?: string;
  onOpen?: () => void;
  press?: { available: boolean; onToggle: () => void };
  divider?: boolean;
}) {
  const isLocked = locked(m);
  const done = isFinished(m);
  const result = done ? resultOf(m) : null;
  const lead = p ? leadOf(p) : null;
  const when = isLive(m) ? statusLabel(m) : `${shortDate(m.utcDate)}, ${clock(m.utcDate)}`;
  const meta = [competition, when].filter(Boolean).join(' · ');
  const row = (o: Outcome, label: string, kit: ClubColors | null | undefined, pct: number | null) => (
    <OutcomeRow
      key={o}
      kit={kit}
      label={label}
      pct={pct}
      picked={pick?.outcome === o}
      lead={lead === o}
      result={result === o}
      disabled={isLocked || !onPick}
      onPress={() => onPick?.(o)}
    />
  );
  const pressed = !!pick?.snapped;
  let left: React.ReactNode;
  let right: string;
  if (done && pick) {
    const pts = points(pick.outcome === result, pick.snapped);
    left = <Text style={[styles.footText, { color: color.accentText }]} numberOfLines={1}>Your pick · {outcomeName(m, pick.outcome)}{pressed ? ' · Pressed' : ''}</Text>;
    right = pts > 0 ? `+${pts} points` : pts < 0 ? `−${-pts} points` : 'No points';
  } else if (pick) {
    left = <Text style={[styles.footText, { color: color.accentText }]} numberOfLines={1}>Your pick · {outcomeName(m, pick.outcome)}</Text>;
    right = isLocked ? (pressed ? 'Pressed · +4 if right' : '+2 points if right') : pressed ? '+4 if right, −2 if wrong' : '+2 points if right';
  } else {
    left = <Text style={styles.footText} numberOfLines={1}>{isLocked ? (done ? 'Full time' : 'Picks locked at kick-off') : 'Tap an outcome to pick'}</Text>;
    right = isLocked ? '' : 'Locks at kick-off';
  }
  const showPress = !!press && !!pick && !isLocked && (press.available || pressed);

  return (
    <View style={[styles.market, divider && styles.divider]}>
      <Pressable
        onPress={onOpen}
        disabled={!onOpen}
        style={styles.meta}
        hitSlop={{ top: 6, bottom: 6 }}
        accessibilityRole={onOpen ? 'button' : undefined}
        accessibilityLabel={`${m.homeTeam.name} against ${m.awayTeam.name}, ${meta}. Open match`}
      >
        <Text style={[styles.metaText, isLive(m) && { color: color.live }]} numberOfLines={1}>{meta}</Text>
        <View style={styles.metaRight}>
          {venue ? <Text style={[styles.metaText, { flexShrink: 1 }]} numberOfLines={1}>{venue}</Text> : null}
          {onOpen ? <Ionicons name="chevron-forward" size={14} color={color.text3} /> : null}
        </View>
      </Pressable>
      {row('H', teamName(m.homeTeam), homeColors, p?.home ?? null)}
      {row('D', 'Draw', null, p?.draw ?? null)}
      {row('A', teamName(m.awayTeam), awayColors, p?.away ?? null)}
      <View style={styles.foot}>
        <View style={{ flex: 1, minWidth: 0 }}>{left}</View>
        {right ? <Text style={styles.footText}>{right}</Text> : null}
        {showPress ? (
          <Pressable
            onPress={() => {
              tap('light');
              press!.onToggle();
            }}
            hitSlop={8}
            style={[styles.press, pressed && { backgroundColor: color.accent, borderColor: color.accent }]}
            accessibilityRole="switch"
            accessibilityState={{ checked: pressed }}
            accessibilityLabel={pressed ? 'Pressed: right +4, wrong −2. Tap to undo' : 'Press this pick: right +4, wrong −2. One per matchday'}
          >
            <Ionicons name="flash" size={13} color={pressed ? color.onAccent : color.accentText} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A compact fixture: two stacked team lines, the time, then three 1 / X / 2 tiles. Once kicked
 * off or finished, the score replaces the tiles.
 */
export function CompactMatchRow({
  match: m,
  prediction: p,
  homeColors,
  awayColors,
  onPress,
  pick,
  time,
  divider = true,
}: {
  match: Match;
  prediction?: Prediction | null;
  homeColors?: ClubColors;
  awayColors?: ClubColors;
  onPress?: () => void;
  pick?: UserPick;
  /** override the time label (default: "Sat 12:30", "Live", "FT") */
  time?: string;
  divider?: boolean;
}) {
  const live = isLive(m);
  const done = isFinished(m);
  const scored = live || done;
  const h = m.score.fullTime.home;
  const a = m.score.fullTime.away;
  const w = m.score.winner;
  const lead = p ? leadOf(p) : null;
  const label = time ?? (live ? statusLabel(m) : done ? 'FT' : kickoff(m.utcDate));
  const pts = done && pick ? points(pick.outcome === resultOf(m), pick.snapped) : null;
  const tile = (pct: number, sym: string, top: boolean) => (
    <View style={[styles.tile, top && { backgroundColor: color.raised }]}>
      <Text style={[styles.tilePct, top && { color: color.text }]}>{pctText(pct, false)}</Text>
      <Text style={styles.tileSym}>{sym}</Text>
    </View>
  );
  const team = (t: Match['homeTeam'], c: ClubColors | undefined, dim: boolean) => (
    <View style={styles.cteam}>
      <KitChip colors={c} size={16} />
      <Text style={[styles.cname, dim && { color: color.text2 }]} numberOfLines={1}>{teamName(t)}</Text>
    </View>
  );
  const a11y = scored
    ? `${m.homeTeam.name} ${h ?? 0}, ${m.awayTeam.name} ${a ?? 0}, ${live ? statusLabel(m) : 'full time'}`
    : `${m.homeTeam.name} against ${m.awayTeam.name}, ${label}${p ? `. Chance: home ${pctText(p.home)}, draw ${pctText(p.draw)}, away ${pctText(p.away)}` : ''}`;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={a11y}>
      {({ pressed }) => (
        <View style={[styles.crow, divider && styles.divider, pressed && { opacity: 0.7 }]}>
          <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
            {team(m.homeTeam, homeColors, done && w === 'AWAY_TEAM')}
            {team(m.awayTeam, awayColors, done && w === 'HOME_TEAM')}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {live ? <LiveDot size={6} /> : null}
              <Text style={[styles.ctime, live && { color: color.live }]}>{label}</Text>
            </View>
            {pts !== null ? <Text style={[styles.ctime, { color: pts > 0 ? color.win : pts < 0 ? color.loss : color.text3 }]}>{pts > 0 ? `+${pts}` : pts < 0 ? `−${-pts}` : '0'} pts</Text> : null}
          </View>
          {scored ? (
            <View style={styles.cscore}>
              <Text style={[styles.cscoreNum, done && w === 'AWAY_TEAM' && { color: color.text2 }]}>{h ?? 0}</Text>
              <Text style={[styles.cscoreNum, done && w === 'HOME_TEAM' && { color: color.text2 }]}>{a ?? 0}</Text>
            </View>
          ) : p ? (
            <View style={styles.tiles}>
              {tile(p.home, '1', lead === 'H')}
              {tile(p.draw, 'X', lead === 'D')}
              {tile(p.away, '2', lead === 'A')}
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

/** What's on now: both teams, the score at numLarge, the live dot and status. */
export function LiveRow({ match: m, homeColors, awayColors, onPress, competition, divider = true }: { match: Match; homeColors?: ClubColors; awayColors?: ClubColors; onPress?: () => void; competition?: string; divider?: boolean }) {
  const h = m.score.fullTime.home ?? 0;
  const a = m.score.fullTime.away ?? 0;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={`${statusLabel(m)}: ${m.homeTeam.name} ${h}, ${m.awayTeam.name} ${a}`}>
      {({ pressed }) => (
        <View style={[styles.lrow, divider && styles.divider, pressed && { opacity: 0.7 }]}>
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <LiveDot size={7} />
              <Text style={[styles.metaText, { color: color.live }]}>{statusLabel(m)}</Text>
              {competition ? <Text style={styles.metaText} numberOfLines={1}>· {competition}</Text> : null}
            </View>
            <View style={styles.cteam}>
              <KitChip colors={homeColors} size={16} />
              <Text style={styles.cname} numberOfLines={1}>{teamName(m.homeTeam)}</Text>
            </View>
            <View style={styles.cteam}>
              <KitChip colors={awayColors} size={16} />
              <Text style={styles.cname} numberOfLines={1}>{teamName(m.awayTeam)}</Text>
            </View>
          </View>
          <Text style={type.numLarge}>{h}–{a}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  divider: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  market: { paddingTop: 10, paddingBottom: 12 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, marginBottom: 6, minHeight: 22 },
  metaRight: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1, justifyContent: 'flex-end' },
  metaText: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: color.text3, flexShrink: 1 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 6, minHeight: 24 },
  footText: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: color.text3 },
  press: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: color.hairlineStrong, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },

  crow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: space.md },
  cteam: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cname: { fontFamily: font.medium, fontSize: 15, lineHeight: 20, color: color.text, flexShrink: 1 },
  ctime: { fontFamily: font.medium, fontSize: 13, color: color.text3, fontVariant: ['tabular-nums'] },
  tiles: { flexDirection: 'row', gap: 6 },
  tile: { width: 44, height: 46, borderRadius: radius.sm, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' },
  tilePct: { fontFamily: font.semibold, fontSize: 15, color: color.text2, fontVariant: ['tabular-nums'] },
  tileSym: { fontFamily: font.semibold, fontSize: 10.5, color: color.text3, marginTop: 1 },
  cscore: { width: 44, alignItems: 'center', gap: 7 },
  cscoreNum: { fontFamily: font.semibold, fontSize: 17, lineHeight: 20, color: color.text, fontVariant: ['tabular-nums'] },
  lrow: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingVertical: space.md },
});
