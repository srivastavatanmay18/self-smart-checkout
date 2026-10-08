import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/services/api';
import { adminApi, type AdminProduct } from '@/services/admin';
import { formatRupees } from '@/utils/money';
import { productImageSource } from '@/utils/productImages';

export default function AdminProductDetailScreen() {
  const params = useLocalSearchParams<{ productId?: string | string[] }>();
  const productId = Array.isArray(params.productId) ? params.productId[0] : params.productId;
  const { session } = useAuth();
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [stockText, setStockText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadProduct = useCallback(async () => {
    if (!session || !productId) return;
    setError(null);
    try {
      const result = await adminApi.product(productId, session.token);
      setProduct(result.product);
      setStockText(String(result.product.stock));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not load this product.');
    } finally {
      setLoading(false);
    }
  }, [productId, session]);

  useFocusEffect(useCallback(() => { void loadProduct(); }, [loadProduct]));

  const saveStock = async () => {
    const stock = Number(stockText);
    if (!session || !product || !Number.isInteger(stock) || stock < 0) {
      setError('Stock must be a whole number greater than or equal to zero.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await adminApi.updateProduct(product.productId, { stock }, session.token);
      setProduct(result.product);
      setStockText(String(result.product.stock));
      setMessage('Stock quantity updated.');
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not update stock.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    if (!session || !product || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await adminApi.updateProduct(product.productId, { isActive: !product.isActive }, session.token);
      setProduct(result.product);
      setMessage(result.product.isActive ? 'Product activated for customer shopping.' : 'Product deactivated. Existing paid orders are unchanged.');
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not update product status.');
    } finally {
      setSaving(false);
    }
  };

  const archiveProduct = () => {
    if (!product || !session || saving || !product.isActive) return;
    Alert.alert('Delete this product?', 'The product will be removed from active customer shopping. Existing paid order records remain available.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete product', style: 'destructive', onPress: () => { void (async () => {
        setSaving(true);
        setError(null);
        setMessage(null);
        try {
          const result = await adminApi.deactivateProduct(product.productId, session.token);
          setProduct(result.product);
          setMessage('Product deleted from active inventory. Its paid-order history is preserved.');
        } catch (requestError) {
          setError(requestError instanceof ApiError ? requestError.message : 'Could not delete product.');
        } finally {
          setSaving(false);
        }
      })(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Inventory</Text></Pressable>
        <Text style={styles.eyebrow}>PRODUCT DETAILS</Text>
        <Text style={styles.title}>{product?.name ?? 'Product'}</Text>
        <Text style={styles.subtitle}>{product?.category ?? 'Shop inventory'}</Text>
        {loading ? <View style={styles.card}><ActivityIndicator color="#4d63ad" /><Text style={styles.muted}>Loading product details…</Text></View> : null}
        {error ? <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text></View> : null}
        {product ? (
          <>
            <View style={styles.card}>
              <Image accessibilityLabel={`${product.name} product image`} source={productImageSource(product.image ?? undefined, product.productId)} style={styles.image} resizeMode="cover" />
              <Text style={styles.name}>{product.name}</Text>
              <Text style={styles.price}>{formatRupees(product.price)}</Text>
              <Detail label="Barcode / EAN" value={product.barcode} />
              <Detail label="Product ID" value={product.productId} />
              <Detail label="Category" value={product.category} />
              <Detail label="Shop" value={product.shopId} />
              <Detail label="Status" value={product.isActive ? 'ACTIVE' : 'INACTIVE'} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Update stock</Text>
              <Text style={styles.muted}>Current stock: {product.stock} units</Text>
              <View style={styles.stockRow}>
                <TextInput accessibilityLabel="Stock quantity" value={stockText} onChangeText={setStockText} keyboardType="number-pad" style={styles.input} />
                <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveStock()} style={[styles.stockButton, saving && styles.disabled]}><Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save stock'}</Text></Pressable>
              </View>
            </View>

            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/admin/product-form', params: { productId: product.productId } })} style={styles.secondaryButton}><Text style={styles.secondaryText}>Edit product details</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void toggleActive()} style={styles.statusButton}><Text style={styles.statusButtonText}>{saving ? 'Saving…' : product.isActive ? 'Set product inactive' : 'Set product active'}</Text></Pressable>
            {product.isActive ? <Pressable accessibilityRole="button" disabled={saving} onPress={archiveProduct} style={styles.deleteButton}><Text style={styles.deleteButtonText}>Delete product</Text></Pressable> : null}
            {message ? <Text style={styles.success}>{message}</Text> : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f6fb' },
  page: { flexGrow: 1, padding: 20, paddingTop: 14, paddingBottom: 34 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: '#475887', fontSize: 13, fontWeight: '800' },
  eyebrow: { color: '#6c78a0', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 12 },
  title: { color: '#263452', fontSize: 26, fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#68738c', fontSize: 13, marginTop: 4, marginBottom: 14 },
  card: { backgroundColor: '#fff', borderRadius: 17, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e9ebf1' },
  image: { width: 120, height: 120, alignSelf: 'center', borderRadius: 18, backgroundColor: '#eef1f7' },
  name: { color: '#34425d', fontSize: 17, fontWeight: '900', textAlign: 'center', marginTop: 10 },
  price: { color: '#435b9a', fontSize: 19, fontWeight: '900', textAlign: 'center', marginVertical: 10 },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#e9ebf1' },
  detailLabel: { color: '#80899b', fontSize: 11 },
  detailValue: { color: '#45516a', fontSize: 11, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  cardTitle: { color: '#34425d', fontSize: 14, fontWeight: '900', marginBottom: 5 },
  muted: { color: '#7c879b', fontSize: 12, lineHeight: 18 },
  stockRow: { flexDirection: 'row', gap: 9, marginTop: 10 },
  input: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: '#e1e5ee', borderRadius: 11, paddingHorizontal: 12, color: '#34425d', fontSize: 13 },
  stockButton: { justifyContent: 'center', backgroundColor: '#4d63ad', borderRadius: 11, paddingHorizontal: 13 },
  buttonText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  secondaryButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: '#e8edfb', borderRadius: 12, marginBottom: 9 },
  secondaryText: { color: '#495f9f', fontSize: 13, fontWeight: '900' },
  statusButton: { minHeight: 46, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e0bf94', borderRadius: 12 },
  statusButtonText: { color: '#8a6433', fontSize: 12, fontWeight: '900' },
  deleteButton: { minHeight: 46, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#ebc9c3', backgroundColor: '#fff7f5', borderRadius: 12, marginTop: 9 },
  deleteButtonText: { color: '#964b41', fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  success: { color: '#2d724b', fontSize: 12, textAlign: 'center', marginTop: 11 },
  error: { backgroundColor: '#fff0ec', borderRadius: 14, padding: 14, marginBottom: 12 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 19 },
});
