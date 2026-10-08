import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { AdminTransactionCard } from '@/components/AdminTransactionCard';
import { ApiError } from '@/services/api';
import { adminApi, type AdminTransaction } from '@/services/admin';

export default function AdminFlaggedTransactionsScreen() {
  const { session } = useAuth();
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFlagged = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      setTransactions((await adminApi.flaggedTransactions(session.token)).transactions);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not load flagged transactions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(useCallback(() => { setLoading(true); void loadFlagged(); }, [loadFlagged]));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadFlagged(); }} tintColor="#4d63ad" />}>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/admin')} style={styles.back}><Text style={styles.backText}>‹  Store dashboard</Text></Pressable>
        <Text style={styles.eyebrow}>STORE ADMIN · REVIEW</Text>
        <Text style={styles.title}>Flagged transactions</Text>
        <Text style={styles.subtitle}>Read-only visibility into transactions marked CHECK_REQUIRED by the anomaly review or guard item check.</Text>
        <View style={styles.notice}><Text style={styles.noticeTitle}>Guard decisions stay with the guard</Text><Text style={styles.noticeText}>This screen does not approve exits or change guard verification status.</Text></View>
        {loading ? <View style={styles.state}><ActivityIndicator color="#4d63ad" /><Text style={styles.muted}>Loading flagged transactions…</Text></View> : null}
        {error ? <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><Pressable onPress={() => { setLoading(true); void loadFlagged(); }}><Text style={styles.retry}>Try again</Text></Pressable></View> : null}
        {!loading && !error && transactions.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No transactions need attention</Text><Text style={styles.muted}>CHECK_REQUIRED transactions for this shop will appear here.</Text></View> : null}
        {!loading && !error ? transactions.map((transaction) => <View key={transaction.orderId}>
          <AdminTransactionCard transaction={transaction} />
          {transaction.reasons.length ? <View style={styles.reasons}><Text style={styles.reasonsTitle}>Review reasons</Text>{transaction.reasons.map((reason, index) => <Text key={`${transaction.orderId}-${index}`} style={styles.reason}>• {reason}</Text>)}</View> : null}
        </View>) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f6fb' },
  page: { flexGrow: 1, padding: 20, paddingTop: 14, paddingBottom: 36 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: '#475887', fontSize: 13, fontWeight: '800' },
  eyebrow: { color: '#6c78a0', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 12 },
  title: { color: '#263452', fontSize: 27, fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#68738c', fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 14 },
  notice: { backgroundColor: '#fff7e9', borderColor: '#f0ddb8', borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 14 },
  noticeTitle: { color: '#79561f', fontSize: 12, fontWeight: '900' },
  noticeText: { color: '#886b3c', fontSize: 11, lineHeight: 17, marginTop: 4 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  muted: { color: '#7c879b', fontSize: 12, lineHeight: 18 },
  error: { backgroundColor: '#fff0ec', borderRadius: 14, padding: 14 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 19 },
  retry: { color: '#863d31', fontSize: 12, fontWeight: '900', marginTop: 9 },
  empty: { backgroundColor: '#fff', borderRadius: 15, padding: 16 },
  emptyTitle: { color: '#394761', fontSize: 14, fontWeight: '900', marginBottom: 5 },
  reasons: { backgroundColor: '#fffaf0', borderWidth: 1, borderColor: '#f0ddb8', borderRadius: 13, padding: 12, marginTop: -4, marginBottom: 11 },
  reasonsTitle: { color: '#805a1c', fontSize: 11, fontWeight: '900', marginBottom: 4 },
  reason: { color: '#795f34', fontSize: 11, lineHeight: 17 },
});
