import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { AdminTransaction } from '@/services/admin';
import { formatRupees } from '@/utils/money';
import { statusLabel } from '@/utils/statusLabels';

export function AdminTransactionCard({ transaction }: { transaction: AdminTransaction }) {
  const flagged = transaction.aiVerificationStatus === 'CHECK_REQUIRED' || transaction.exitStatus === 'CHECK_REQUIRED';
  const aiStatusLabel = transaction.aiVerificationStatus ? statusLabel(transaction.aiVerificationStatus) : 'NO AI RESULT';
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/admin/transaction', params: { orderId: transaction.orderId } })} style={[styles.card, flagged && styles.flaggedCard]}>
      <View style={styles.cardHeading}><Text style={styles.orderId} numberOfLines={1}>{transaction.orderId}</Text><Text accessibilityLabel={`AI verification ${aiStatusLabel}`} style={[styles.aiPill, flagged ? styles.aiFlagged : transaction.aiVerificationStatus === 'VERIFIED' ? styles.aiVerified : styles.aiUnknown]}>{aiStatusLabel}</Text></View>
      <Text style={styles.shop}>{transaction.shopName} · {new Date(transaction.createdAt ?? '').toLocaleString()}</Text>
      <View style={styles.summary}><Text style={styles.total}>{formatRupees(transaction.totalAmount)}</Text><Text style={styles.itemCount}>{transaction.numberOfItems} item(s)</Text></View>
      <View style={styles.statusRow}><Text style={styles.statusText}>Payment · {statusLabel(transaction.paymentStatus)}</Text><Text style={styles.statusText}>Exit · {statusLabel(transaction.exitStatus)}</Text></View>
      {transaction.anomalyScore !== null ? <Text style={styles.score}>Anomaly score · {transaction.anomalyScore}/100</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 15, padding: 14, marginBottom: 9, borderWidth: 1, borderColor: '#e8eaf1' },
  flaggedCard: { borderColor: '#e7c783', backgroundColor: '#fffdf8' },
  cardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  orderId: { flex: 1, color: '#384764', fontSize: 11, fontWeight: '900' },
  aiPill: { overflow: 'hidden', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, fontSize: 8, fontWeight: '900' },
  aiFlagged: { color: '#87580e', backgroundColor: '#f8e9c9' },
  aiVerified: { color: '#2d724b', backgroundColor: '#e6f4ea' },
  aiUnknown: { color: '#68738c', backgroundColor: '#eef0f5' },
  shop: { color: '#858da0', fontSize: 10, marginTop: 6 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  total: { color: '#344c87', fontSize: 15, fontWeight: '900' },
  itemCount: { color: '#747f94', fontSize: 10, fontWeight: '700' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 8 },
  statusText: { color: '#66738b', fontSize: 9, fontWeight: '800' },
  score: { color: '#8b641e', fontSize: 10, fontWeight: '800', marginTop: 6 },
});
