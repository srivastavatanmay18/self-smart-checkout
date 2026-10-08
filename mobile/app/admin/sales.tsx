import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { AdminTransactionCard } from '@/components/AdminTransactionCard';
import { ApiError } from '@/services/api';
import { adminApi, type AdminSalesAnalytics } from '@/services/admin';
import { formatRupees } from '@/utils/money';

export default function AdminSalesScreen() {
  const { session } = useAuth();
  const [period, setPeriod] = useState<'today' | '7d'>('7d');
  const [analytics, setAnalytics] = useState<AdminSalesAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async (selectedPeriod = period) => {
    if (!session) return;
    setError(null);
    try {
      setAnalytics(await adminApi.sales(selectedPeriod, session.token));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not load sales analytics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, session]);

  useFocusEffect(useCallback(() => { setLoading(true); void loadAnalytics(); }, [loadAnalytics]));
  const choosePeriod = (selected: 'today' | '7d') => { setPeriod(selected); setLoading(true); void loadAnalytics(selected); };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadAnalytics(); }} tintColor="#4d63ad" />}>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/admin')} style={styles.back}><Text style={styles.backText}>‹  Store dashboard</Text></Pressable>
        <Text style={styles.eyebrow}>STORE ADMIN · ANALYTICS</Text>
        <Text style={styles.title}>Sales</Text>
        <Text style={styles.subtitle}>Paid sales and transaction trends from your shop.</Text>
        <View style={styles.periodRow}>
          <PeriodButton label="Today" active={period === 'today'} onPress={() => choosePeriod('today')} />
          <PeriodButton label="Recent 7 days" active={period === '7d'} onPress={() => choosePeriod('7d')} />
        </View>

        {loading ? <View style={styles.state}><ActivityIndicator color="#4d63ad" /><Text style={styles.muted}>Loading sales data…</Text></View> : null}
        {error ? <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><Pressable onPress={() => { setLoading(true); void loadAnalytics(); }}><Text style={styles.retry}>Try again</Text></Pressable></View> : null}
        {analytics ? (
          <>
            <View style={styles.metrics}>
              <Metric label="Total sales" value={formatRupees(analytics.summary.totalSales)} />
              <Metric label="Orders" value={String(analytics.summary.numberOfOrders)} />
              <Metric label="Paid orders" value={String(analytics.summary.paidOrders)} />
              <Metric label="Completed exits" value={String(analytics.summary.completedOrders)} />
              <Metric label="Cancelled / failed" value={String(analytics.summary.cancelledOrFailedOrders)} />
              <Metric label="Average order value" value={formatRupees(analytics.summary.averageOrderValue)} />
            </View>

            <Text style={styles.sectionTitle}>Top-selling products</Text>
            {analytics.topSellingProducts.length === 0 ? <View style={styles.empty}><Text style={styles.muted}>No paid product sales in this period.</Text></View> : analytics.topSellingProducts.map((product, index) => (
              <View key={product.productId} style={styles.productRow}>
                <Text style={styles.rank}>{index + 1}</Text>
                <View style={styles.productCopy}><Text style={styles.productName}>{product.name}</Text><Text style={styles.muted}>{product.quantitySold} unit(s) sold</Text></View>
                <Text style={styles.productSales}>{formatRupees(product.salesAmount)}</Text>
              </View>
            ))}

            <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Recent transactions</Text><Pressable onPress={() => router.push('/admin/transactions')}><Text style={styles.viewAll}>View all</Text></Pressable></View>
            {analytics.recentTransactions.length === 0 ? <View style={styles.empty}><Text style={styles.muted}>No orders in this period.</Text></View> : analytics.recentTransactions.map((transaction) => <AdminTransactionCard key={transaction.orderId} transaction={transaction} />)}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function PeriodButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.period, active && styles.periodActive]}><Text style={[styles.periodText, active && styles.periodTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f6fb' },
  page: { flexGrow: 1, padding: 20, paddingTop: 14, paddingBottom: 36 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: '#475887', fontSize: 13, fontWeight: '800' },
  eyebrow: { color: '#6c78a0', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 12 },
  title: { color: '#263452', fontSize: 28, fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#68738c', fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 14 },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  period: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#e9ecf3' },
  periodActive: { backgroundColor: '#4d63ad' },
  periodText: { color: '#66718b', fontSize: 11, fontWeight: '900' },
  periodTextActive: { color: '#fff' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  metric: { flexGrow: 1, flexBasis: '47%', minWidth: 140, backgroundColor: '#fff', borderRadius: 15, padding: 13, borderWidth: 1, borderColor: '#e8eaf1' },
  metricLabel: { color: '#818a9d', fontSize: 10, fontWeight: '800' },
  metricValue: { color: '#334776', fontSize: 19, fontWeight: '900', marginTop: 6 },
  sectionTitle: { color: '#34425d', fontSize: 16, fontWeight: '900', marginTop: 20, marginBottom: 9 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#fff', borderRadius: 13, padding: 12, marginBottom: 7 },
  rank: { color: '#6478b3', fontSize: 13, fontWeight: '900', width: 20 },
  productCopy: { flex: 1 },
  productName: { color: '#414e69', fontSize: 11, fontWeight: '900' },
  productSales: { color: '#405995', fontSize: 11, fontWeight: '900' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  viewAll: { color: '#5369ac', fontSize: 11, fontWeight: '900', marginTop: 18 },
  empty: { backgroundColor: '#fff', borderRadius: 13, padding: 14 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  muted: { color: '#7c879b', fontSize: 11, lineHeight: 17 },
  error: { backgroundColor: '#fff0ec', borderRadius: 14, padding: 14 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 19 },
  retry: { color: '#863d31', fontSize: 12, fontWeight: '900', marginTop: 9 },
});
