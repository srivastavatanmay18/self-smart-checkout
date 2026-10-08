import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/services/api';
import { adminApi, type AdminDashboard } from '@/services/admin';
import { formatRupees } from '@/utils/money';

export default function AdminPortal() {
  const { session } = useAuth();
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      setDashboard(await adminApi.dashboard(session.token));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not load store metrics. Check the backend connection and retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(useCallback(() => { void loadDashboard(); }, [loadDashboard]));

  const go = (path: '/admin/inventory' | '/admin/sales' | '/admin/transactions' | '/admin/flagged' | '/admin/shop-qr') => router.push(path);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadDashboard(); }} tintColor="#4d63ad" />}>
        <Text style={styles.eyebrow}>SALESMAN · STORE ADMIN</Text>
        <Text style={styles.title}>Store dashboard</Text>
        <Text style={styles.subtitle}>{dashboard ? `${dashboard.shop.name} · ${dashboard.shop.shopId}` : 'Live store inventory and sales overview.'}</Text>

        {loading ? <View style={styles.stateCard}><ActivityIndicator color="#4d63ad" /><Text style={styles.muted}>Loading live store data…</Text></View> : null}
        {error ? <View style={styles.errorCard}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><Pressable onPress={() => { setLoading(true); void loadDashboard(); }}><Text style={styles.retryText}>Try again</Text></Pressable></View> : null}

        {dashboard ? (
          <>
            <View style={styles.metrics}>
              <Metric label="Total products" value={String(dashboard.stats.totalProducts)} helper={`${dashboard.stats.activeProducts} active`} />
              <Metric label="Inventory units" value={String(dashboard.stats.totalInventoryUnits)} helper="Recorded in stock" />
              <Metric label="Today's orders" value={String(dashboard.stats.todayOrders)} helper="Created today" />
              <Metric label="Today's sales" value={formatRupees(dashboard.stats.todaySales)} helper="Successfully paid" />
              <Metric label="Completed exits" value={String(dashboard.stats.completedTransactions)} helper="Verified today" />
              <Metric label="Pending / check required" value={String(dashboard.stats.pendingTransactions)} helper="Awaiting payment or exit review" />
              <Metric label="Low stock products" value={String(dashboard.stats.lowStockProducts)} helper={`At or below ${dashboard.stats.lowStockThreshold} units`} />
            </View>

            <Text style={styles.sectionTitle}>Store tools</Text>
            <View style={styles.actions}>
              <Action title="Inventory" detail="Search, add and update products" onPress={() => go('/admin/inventory')} />
              <Action title="Sales analytics" detail="Today and recent 7 days" onPress={() => go('/admin/sales')} />
              <Action title="Transactions" detail="Recent orders and paid carts" onPress={() => go('/admin/transactions')} />
              <Action title="Flagged transactions" detail="AI and manual checks" onPress={() => go('/admin/flagged')} />
              <Action title="Permanent Shop QR" detail="Display the customer entry QR" onPress={() => go('/admin/shop-qr')} />
            </View>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Low stock</Text>
              <Pressable onPress={() => go('/admin/inventory')}><Text style={styles.viewAll}>View inventory</Text></Pressable>
            </View>
            {dashboard.lowStockItems.length === 0 ? (
              <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Stock levels look good</Text><Text style={styles.muted}>No active products are at or below the low-stock threshold.</Text></View>
            ) : dashboard.lowStockItems.map((product) => (
              <Pressable key={product.productId} onPress={() => router.push({ pathname: '/admin/product', params: { productId: product.productId } })} style={styles.stockRow}>
                <View style={styles.stockCopy}><Text style={styles.stockName}>{product.name}</Text><Text style={styles.stockBarcode}>{product.barcode} · {product.category}</Text></View>
                <Text style={styles.stockAmount}>{product.stock} left</Text>
              </Pressable>
            ))}
          </>
        ) : !loading && !error ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Store dashboard unavailable</Text><Text style={styles.muted}>Sign in with a salesman account assigned to a shop.</Text></View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricHelper}>{helper}</Text></View>;
}

function Action({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.action}><Text style={styles.actionTitle}>{title}  ›</Text><Text style={styles.actionDetail}>{detail}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f6fb' },
  page: { flexGrow: 1, padding: 20, paddingTop: 18, paddingBottom: 36 },
  eyebrow: { color: '#6c78a0', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 8 },
  title: { color: '#263452', fontSize: 29, fontWeight: '900', marginTop: 7 },
  subtitle: { color: '#68738c', fontSize: 14, lineHeight: 20, marginTop: 5, marginBottom: 17 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flexGrow: 1, flexBasis: '47%', minWidth: 145, backgroundColor: '#fff', borderRadius: 17, padding: 14, borderWidth: 1, borderColor: '#e7eaf2' },
  metricLabel: { color: '#7b8499', fontSize: 11, fontWeight: '800' },
  metricValue: { color: '#273858', fontSize: 23, fontWeight: '900', marginTop: 7 },
  metricHelper: { color: '#8a92a4', fontSize: 10, lineHeight: 15, marginTop: 4 },
  sectionTitle: { color: '#2d3c5a', fontSize: 17, fontWeight: '900', marginTop: 21, marginBottom: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { flexGrow: 1, flexBasis: '47%', minWidth: 155, minHeight: 81, justifyContent: 'center', backgroundColor: '#eaf0ff', borderRadius: 15, padding: 13 },
  actionTitle: { color: '#394e89', fontSize: 13, fontWeight: '900' },
  actionDetail: { color: '#737f9e', fontSize: 10, lineHeight: 15, marginTop: 5 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  viewAll: { color: '#5369ac', fontSize: 12, fontWeight: '800' },
  stockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: '#fff', borderRadius: 13, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: '#eceef3' },
  stockCopy: { flex: 1 },
  stockName: { color: '#36435e', fontSize: 12, fontWeight: '800' },
  stockBarcode: { color: '#8c93a2', fontSize: 10, marginTop: 4 },
  stockAmount: { color: '#a6573c', fontSize: 12, fontWeight: '900' },
  stateCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 15, padding: 16 },
  errorCard: { backgroundColor: '#fff0ec', borderRadius: 15, padding: 15 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 19 },
  retryText: { color: '#863d31', fontSize: 12, fontWeight: '900', marginTop: 10 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 15, padding: 16 },
  emptyTitle: { color: '#394761', fontSize: 13, fontWeight: '900', marginBottom: 5 },
  muted: { color: '#7d8798', fontSize: 12, lineHeight: 18 },
});
