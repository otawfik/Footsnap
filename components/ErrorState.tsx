import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

/** A failed load, with what it means and a retry. */
export function ErrorState({ message, code, onRetry }: { message: string; code?: string; onRetry?: () => void }) {
  // NO_KEY is a server misconfiguration; users get a plain message, the server response says what's wrong
  const title =
    code === 'NO_KEY' ? 'Live data unavailable' : code === 'RATE_LIMIT' ? 'Busy for a moment' : "Couldn't load this";
  const detail =
    code === 'NO_KEY' ? "FootSnap can't reach its data service right now. Please try again in a little while." : message;
  return (
    <View style={styles.box}>
      <Ionicons name={code === 'RATE_LIMIT' ? 'time-outline' : 'cloud-offline-outline'} size={22} color={Colors.draw} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
      {onRetry ? (
        <TouchableOpacity onPress={onRetry} style={styles.retry} accessibilityRole="button">
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.draw + '40',
    backgroundColor: Colors.draw + '0D',
  },
  title: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  detail: { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  retry: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  retryText: { fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.semibold },
});
