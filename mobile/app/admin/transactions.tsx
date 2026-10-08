import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/services/api';
import { adminApi, type AdminTransaction } from '@/services/admin';
import { AdminTransactionCard } from '@/components/AdminTransactionCard';

export default function AdminTransactionsScreen() {
  const { session } = useAuth();
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTransactions = useCallback(async (query = appliedSearch) => {
    if (!session) return;
    setError(null);
    try {
      setTransactions((await adminApi.transactions(session.token, query)).transactions);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not load transaction history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appliedSearch, session]);

  useFocusEffect(useCallback(() => { setLoading(true); void loadTransactions(); }, [loadTransactions]));
  const runSearch = () => { setAppliedSearch(search.trim()); setLoading(true); void loadTransactions(search.trim()); };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadTransactions(); }} tintColor="#4d63ad" />} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Pressable accessibilityRole="button" onPress={() => router.replace('/admin')} style={styles.back}><Text style={styles.backText}>‹  Store dashboard</Text></Pressable>
        <Text style={styles.eyebrow}>STORE ADMIN · SALES</Text>
        <Text style={styles.title}>Transactions</Text>
        <Text style={styles.subtitle}>Recent orders from your shop, with payment, exit and AI review status.</Text>
        <View style={styles.searchRow}>
          <TextInput accessibilityLabel="Search by order ID" value={search} onChangeText={setSearch} onSubmitEditing={runSearch} placeholder="Search Order ID" placeholderTextColor="#98a0ad" autoCapitalize="none" style={styles.input} />
          <Pressable accessibilityRole="button" onPress={runSearch} style={styles.searchButton}><Text style={styles.searchText}>Search</Text></Pressable>
        </View>
        {loading ? <View style={styles.state}><ActivityIndicator color="#4d63ad" /><Text style={styles.muted}>Loading transactions…</Text></View> : null}
        {error ? <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><Pressable onPress={() => { setLoading(true); void loadTransactions(); }}><Text style={styles.retry}>Try again</Text></Pressable></View> : null}
        {!loading && !error && transactions.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No transactions found</Text><Text style={styles.muted}>{appliedSearch ? 'Try a different order ID.' : 'Orders from this shop will appear here.'}</Text></View> : null}
        {!loading && !error ? transactions.map((transaction) => <AdminTransactionCard key={transaction.orderId} transaction={transaction} />) : null}
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
  title: { color: '#263452', fontSize: 28, fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#68738c', fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 14 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 13 },
  input: { flex: 1, minHeight: 46, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e1e5ee', borderRadius: 11, paddingHorizontal: 12, color: '#36435e', fontSize: 12 },
  searchButton: { justifyContent: 'center', backgroundColor: '#e7edff', borderRadius: 11, paddingHorizontal: 13 },
  searchText: { color: '#465d9f', fontSize: 12, fontWeight: '900' },
  state: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  muted: { color: '#7c879b', fontSize: 12, lineHeight: 18 },
  error: { backgroundColor: '#fff0ec', borderRadius: 14, padding: 14 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 19 },
  retry: { color: '#863d31', fontSize: 12, fontWeight: '900', marginTop: 9 },
  empty: { backgroundColor: '#fff', borderRadius: 15, padding: 16 },
  emptyTitle: { color: '#394761', fontSize: 14, fontWeight: '900', marginBottom: 5 },
});
