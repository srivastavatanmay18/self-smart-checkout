import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/services/api';
import { adminApi, type AdminTransaction } from '@/services/admin';
import { formatRupees } from '@/utils/money';
import { productImageSource } from '@/utils/productImages';
import { statusLabel } from '@/utils/statusLabels';

export default function AdminTransactionDetailScreen() {
  const params = useLocalSearchParams<{ orderId?: string | string[] }>();
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const { session } = useAuth();
  const [transaction, setTransaction] = useState<AdminTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTransaction = useCallback(async () => {
    if (!session || !orderId) return;
    setError(null);
    try {
      setTransaction((await adminApi.transaction(orderId, session.token)).transaction);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not load transaction details.');
    } finally {
      setLoading(false);
    }
  }, [orderId, session]);

  useFocusEffect(useCallback(() => { setLoading(true); void loadTransaction(); }, [loadTransaction]));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Transactions</Text></Pressable>
        <Text style={styles.eyebrow}>ORDER DETAIL · READ ONLY</Text>
        <Text style={styles.title}>Transaction</Text>
        {loading ? <View style={styles.state}><ActivityIndicator color="#4d63ad" /><Text style={styles.muted}>Loading transaction…</Text></View> : null}
        {error ? <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><Pressable onPress={() => { setLoading(true); void loadTransaction(); }}><Text style={styles.retry}>Try again</Text></Pressable></View> : null}
        {!loading && !error && transaction ? <>
          <View style={styles.card}>
            <Text style={styles.orderId}>{transaction.orderId}</Text>
            <Detail label="Shop" value={transaction.shopName} />
            <Detail label="Purchase time" value={new Date(transaction.createdAt ?? transaction.paidAt ?? '').toLocaleString()} />
            <Detail label="Paid at" value={transaction.paidAt ? new Date(transaction.paidAt).toLocaleString() : 'Not paid'} />
            <Detail label="Payment status" value={statusLabel(transaction.paymentStatus)} />
            <Detail label="Exit status" value={statusLabel(transaction.exitStatus)} />
            <Detail label="AI verification" value={statusLabel(transaction.aiVerificationStatus)} />
            {transaction.anomalyScore !== null ? <Detail label="Anomaly score" value={`${transaction.anomalyScore}/100`} /> : null}
          </View>

          <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Complete paid cart</Text><Text style={styles.itemCount}>{transaction.numberOfItems} unit(s)</Text></View>
          {transaction.items.map((item, index) => <View key={`${item.productId}-${index}`} style={styles.itemCard}>
            <Image accessibilityLabel={`${item.name} product image`} source={productImageSource(item.image, item.productId)} style={styles.image} resizeMode="cover" />
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>{item.category} · {item.quantity} × {formatRupees(item.unitPrice)}</Text>
              <Text style={styles.itemBarcode}>Barcode {item.barcode}</Text>
            </View>
            <Text style={styles.itemSubtotal}>{formatRupees(item.subtotal)}</Text>
          </View>)}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Payment summary</Text>
            <Detail label="Subtotal" value={formatRupees(transaction.subtotalAmount)} />
            <Detail label="Tax" value={formatRupees(transaction.taxAmount)} />
            <Detail label="Discount" value={`−${formatRupees(transaction.discountAmount)}`} />
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Total amount</Text><Text style={styles.totalAmount}>{formatRupees(transaction.totalAmount)}</Text></View>
          </View>

          <View style={[styles.card, (transaction.aiVerificationStatus === 'CHECK_REQUIRED' || transaction.exitStatus === 'CHECK_REQUIRED') && styles.flaggedCard]}>
            <Text style={styles.sectionTitle}>Verification status</Text>
            <Detail label="AI result" value={statusLabel(transaction.aiVerificationStatus)} />
            {transaction.anomalyScore !== null ? <Detail label="Anomaly score" value={`${transaction.anomalyScore}/100`} /> : null}
            <Detail label="Exit status" value={transaction.exitStatus} />
            {transaction.reasons.length ? <View style={styles.reasonList}><Text style={styles.reasonHeading}>Reasons</Text>{transaction.reasons.map((reason, index) => <Text key={`${index}-${reason}`} style={styles.reason}>• {reason}</Text>)}</View> : <Text style={styles.muted}>No anomaly reasons reported.</Text>}
            <Text style={styles.readOnlyNote}>This admin view is read-only. Guard exit verification is managed in the Guard Portal.</Text>
          </View>
        </> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f6fb' },
  page: { flexGrow: 1, padding: 20, paddingTop: 14, paddingBottom: 36 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: '#475887', fontSize: 13, fontWeight: '800' },
  eyebrow: { color: '#6c78a0', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 12 },
  title: { color: '#263452', fontSize: 27, fontWeight: '900', marginTop: 6, marginBottom: 14 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 15, borderWidth: 1, borderColor: '#e8eaf1', marginBottom: 12 },
  orderId: { color: '#33446e', fontSize: 12, fontWeight: '900', marginBottom: 8 },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#e9ebf1' },
  detailLabel: { color: '#7b8598', fontSize: 11 },
  detailValue: { color: '#46536d', fontSize: 11, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, marginBottom: 9 },
  sectionTitle: { color: '#34425d', fontSize: 14, fontWeight: '900' },
  itemCount: { color: '#7b8598', fontSize: 10, fontWeight: '800' },
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e8eaf1', padding: 10, marginBottom: 8 },
  image: { width: 54, height: 54, borderRadius: 11, backgroundColor: '#eef1f7' },
  itemInfo: { flex: 1 },
  itemName: { color: '#3b4863', fontSize: 12, fontWeight: '900' },
  itemMeta: { color: '#68748b', fontSize: 10, marginTop: 3 },
  itemBarcode: { color: '#969eae', fontSize: 9, marginTop: 3 },
  itemSubtotal: { color: '#435b9a', fontSize: 12, fontWeight: '900' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: '#e9ebf1', paddingTop: 11, marginTop: 5 },
  totalLabel: { color: '#34425d', fontSize: 12, fontWeight: '900' },
  totalAmount: { color: '#344c87', fontSize: 18, fontWeight: '900' },
  flaggedCard: { backgroundColor: '#fffdf8', borderColor: '#e7c783' },
  reasonList: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#eadab8', paddingTop: 9, marginTop: 4 },
  reasonHeading: { color: '#805a1c', fontSize: 11, fontWeight: '900', marginBottom: 4 },
  reason: { color: '#795f34', fontSize: 11, lineHeight: 17 },
  readOnlyNote: { color: '#7d879b', fontSize: 10, lineHeight: 15, marginTop: 10 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  muted: { color: '#7c879b', fontSize: 12, lineHeight: 18 },
  error: { backgroundColor: '#fff0ec', borderRadius: 14, padding: 14 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 19 },
  retry: { color: '#863d31', fontSize: 12, fontWeight: '900', marginTop: 9 },
});
