import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/services/api';
import { adminApi, type AdminProduct } from '@/services/admin';
import { productImageSource } from '@/utils/productImages';
import { formatRupees } from '@/utils/money';

export default function AdminInventoryScreen() {
  const { session } = useAuth();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = useCallback(async (query = appliedSearch) => {
    if (!session) return;
    setError(null);
    try {
      setProducts((await adminApi.products(session.token, query)).products);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not load inventory. Check the backend connection and retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appliedSearch, session]);

  useFocusEffect(useCallback(() => { setLoading(true); void loadProducts(); }, [loadProducts]));

  const searchProducts = () => {
    setLoading(true);
    setAppliedSearch(search.trim());
    void loadProducts(search.trim());
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadProducts(); }} tintColor="#4d63ad" />} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Pressable accessibilityRole="button" onPress={() => router.replace('/admin')} style={styles.back}><Text style={styles.backText}>‹  Store dashboard</Text></Pressable>
        <Text style={styles.eyebrow}>STORE ADMIN · PRODUCTS</Text>
        <Text style={styles.title}>Inventory</Text>
        <Text style={styles.subtitle}>Manage shop products, barcodes, prices, and stock.</Text>

        <View style={styles.searchRow}>
          <TextInput accessibilityLabel="Search inventory" value={search} onChangeText={setSearch} onSubmitEditing={searchProducts} placeholder="Search name, category, barcode" placeholderTextColor="#98a0ad" autoCapitalize="none" style={styles.searchInput} />
          <Pressable accessibilityRole="button" onPress={searchProducts} style={styles.searchButton}><Text style={styles.searchButtonText}>Search</Text></Pressable>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/admin/product-form')} style={styles.addButton}><Text style={styles.addButtonText}>＋  Add product</Text></Pressable>

        {loading ? <View style={styles.state}><ActivityIndicator color="#4d63ad" /><Text style={styles.muted}>Loading products…</Text></View> : null}
        {error ? <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><Pressable onPress={() => { setLoading(true); void loadProducts(); }}><Text style={styles.retry}>Try again</Text></Pressable></View> : null}
        {!loading && !error && products.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No products found</Text><Text style={styles.muted}>{appliedSearch ? 'Try a different name, category, or barcode.' : 'Add the first product for this shop.'}</Text></View> : null}
        {!loading && !error ? products.map((product) => (
          <Pressable accessibilityRole="button" key={product.productId} onPress={() => router.push({ pathname: '/admin/product', params: { productId: product.productId } })} style={styles.productCard}>
            <Image accessibilityLabel={`${product.name} product image`} source={productImageSource(product.image ?? undefined, product.productId)} style={styles.productImage} resizeMode="cover" />
            <View style={styles.productCopy}>
              <View style={styles.nameRow}><Text style={styles.productName} numberOfLines={2}>{product.name}</Text><Text style={[styles.status, product.isActive ? styles.active : styles.inactive]}>{product.isActive ? 'ACTIVE' : 'INACTIVE'}</Text></View>
              <Text style={styles.productMeta}>{product.category} · {product.barcode}</Text>
              <View style={styles.bottomRow}><Text style={styles.price}>{formatRupees(product.price)}</Text><Text style={[styles.stock, product.stock <= 5 && styles.lowStock]}>{product.stock} in stock</Text></View>
            </View>
          </Pressable>
        )) : null}
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
  subtitle: { color: '#68738c', fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 15 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  searchInput: { flex: 1, minHeight: 47, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e1e5ee', borderRadius: 12, paddingHorizontal: 12, color: '#36435e', fontSize: 12 },
  searchButton: { justifyContent: 'center', backgroundColor: '#e7edff', borderRadius: 12, paddingHorizontal: 14 },
  searchButtonText: { color: '#465d9f', fontSize: 12, fontWeight: '900' },
  addButton: { minHeight: 47, justifyContent: 'center', alignItems: 'center', backgroundColor: '#4d63ad', borderRadius: 12, marginBottom: 14 },
  addButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  productCard: { flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 9, borderWidth: 1, borderColor: '#e9ebf1' },
  productImage: { width: 66, height: 66, borderRadius: 12, backgroundColor: '#eef1f7' },
  productCopy: { flex: 1, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 7 },
  productName: { flex: 1, color: '#34425d', fontSize: 12, lineHeight: 17, fontWeight: '900' },
  status: { overflow: 'hidden', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, fontSize: 8, fontWeight: '900' },
  active: { color: '#34744e', backgroundColor: '#e7f4eb' },
  inactive: { color: '#866a3d', backgroundColor: '#f6eedc' },
  productMeta: { color: '#858da0', fontSize: 10, marginTop: 4 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 },
  price: { color: '#30436e', fontSize: 13, fontWeight: '900' },
  stock: { color: '#627c69', fontSize: 10, fontWeight: '800' },
  lowStock: { color: '#a6573c' },
  state: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  muted: { color: '#7c879b', fontSize: 12, lineHeight: 18 },
  error: { backgroundColor: '#fff0ec', borderRadius: 14, padding: 15 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 19 },
  retry: { color: '#863d31', fontSize: 12, fontWeight: '900', marginTop: 9 },
  empty: { backgroundColor: '#fff', borderRadius: 15, padding: 17 },
  emptyTitle: { color: '#3a4864', fontSize: 14, fontWeight: '900', marginBottom: 5 },
});
