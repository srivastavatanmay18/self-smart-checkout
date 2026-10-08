import { StyleSheet, Text, View } from 'react-native';
import { statusLabel } from '@/utils/statusLabels';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

function toneFor(status: string): Tone {
  const value = status.toUpperCase();
  if (['SUCCESS', 'PAID', 'VERIFIED', 'USED', 'COMPLETED', 'ACTIVE'].includes(value)) return 'success';
  if (['CHECK_REQUIRED', 'PENDING', 'PENDING_PAYMENT', 'READY_FOR_EXIT'].includes(value)) return 'warning';
  if (['FAILED', 'CANCELLED', 'PAYMENT_FAILED', 'PAYMENT_CANCELLED', 'EXPIRED', 'REVOKED'].includes(value)) return 'danger';
  return 'neutral';
}

export function StatusPill({ status, prefix }: { status: string | null | undefined; prefix?: string }) {
  const tone = toneFor(status ?? '');
  const label = `${prefix ? `${prefix} · ` : ''}${statusLabel(status)}`;
  const palette = {
    success: { backgroundColor: '#e8f4eb', borderColor: '#c7e4d0', color: '#246345' },
    warning: { backgroundColor: '#fff5e2', borderColor: '#f0ddb8', color: '#805a1c' },
    danger: { backgroundColor: '#fff0ec', borderColor: '#f0d0c9', color: '#963e30' },
    neutral: { backgroundColor: '#eef1f5', borderColor: '#dfe4ea', color: '#5c6674' },
  }[tone];
  return (
    <View accessibilityRole="text" accessibilityLabel={label} style={[styles.pill, { backgroundColor: palette.backgroundColor, borderColor: palette.borderColor }]}>
      <Text style={[styles.text, { color: palette.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center', borderRadius: 16, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  text: { fontSize: 10, lineHeight: 15, fontWeight: '900', letterSpacing: 0.25 },
});
