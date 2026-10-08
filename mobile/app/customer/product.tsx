import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ApiError } from '@/services/api';
import { cartApi } from '@/services/cart';
import { productsApi, type ProductDetails } from '@/services/products';
import { formatRupees } from '@/utils/money';
import { productImageSource } from '@/utils/productImages';
import { CustomerFlowSteps } from '@/components/CustomerFlowSteps';
import { statusLabel } from '@/utils/statusLabels';

export default function ProductScreen() {
  const { barcode: routeBarcode } = useLocalSearchParams<{ barcode?: string }>();
  const barcode = Array.isArray(routeBarcode) ? routeBarcode[0] : routeBarcode;
  const { session } = useAuth();
  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validBarcode = typeof barcode === 'string' && /^\d{8,14}$/.test(barcode);

  useEffect(() => {
    let active = true;
    if (!validBarcode || !session) return () => { active = false; };
    productsApi.lookupByBarcode(barcode, session.token)
      .then((result) => { if (active) setProduct(result.product); })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(requestError instanceof ApiError ? requestError.message : 'Could not look up this product. Check your connection and try again.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [barcode, session, validBarcode]);

  const addToCart = async () => {
    if (!product || product.availability !== 'AVAILABLE' || !session) return;
    setAdding(true);
    setError(null);
    try {
      await cartApi.addItem(product.productId, session.token);
      router.replace('/customer/cart');
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not add this product to your cart. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const displayError = error ?? (!validBarcode ? 'This barcode is not valid. Scan or enter an 8 to 14 digit barcode.' : null);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Scan another product</Text></Pressable>
        <Text style={styles.eyebrow}>PRODUCT LOOKUP</Text>
        <Text style={styles.title}>Product details</Text>
        <Text style={styles.subtitle}>Barcode · {barcode ?? '—'}</Text>
        <CustomerFlowSteps activeStep="shopping" />

        {loading && validBarcode ? <View style={styles.card}><Text style={styles.loading}>Looking up product…</Text></View> : null}
        {product ? (
          <View style={styles.card}>
            <Image accessibilityLabel={`${product.name} product image`} source={productImageSource(product.image, product.productId)} style={styles.productImage} resizeMode="cover" />
            <View style={styles.categoryPill}><Text style={styles.categoryText}>{product.category}</Text></View>
            <Text style={styles.productName}>{product.name}</Text>
            <Text style={styles.price}>{formatRupees(product.price)}</Text>
            <View style={styles.divider} />
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Availability</Text><Text accessibilityLabel={`Availability ${statusLabel(product.availability === 'AVAILABLE' ? 'ACTIVE' : 'OUT_OF_STOCK')}`} style={[styles.detailValue, product.availability === 'AVAILABLE' ? styles.available : styles.unavailable]}>{product.availability === 'AVAILABLE' ? `Available · ${product.stock} in stock` : 'Out of stock'}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Shop</Text><Text style={styles.detailValue}>{product.shopId}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Barcode</Text><Text style={styles.detailValue}>{product.barcode}</Text></View>
          </View>
        ) : null}
        {displayError ? <View style={styles.errorCard}><Text accessibilityRole="alert" style={styles.errorText}>{displayError}</Text></View> : null}
        {product?.availability === 'AVAILABLE' ? <PrimaryButton title="Add to Cart" loading={adding} onPress={() => void addToCart()} /> : null}
        {product?.availability === 'OUT_OF_STOCK' ? <View style={styles.outOfStock}><Text style={styles.outOfStockText}>This product cannot be added while it is out of stock.</Text></View> : null}
        {(!loading || !validBarcode) && !product ? <PrimaryButton title="Scan Another Barcode" secondary onPress={() => router.replace('/customer/scan-product')} /> : null}
        {product ? <Pressable accessibilityRole="button" onPress={() => router.push('/customer/cart')} style={styles.cartLink}><Text style={styles.cartLinkText}>View current cart</Text></Pressable> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f7f5' },
  page: { flexGrow: 1, padding: 22, paddingTop: 16, paddingBottom: 34 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: '#426354', fontWeight: '700', fontSize: 14 },
  eyebrow: { color: '#678273', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 15 },
  title: { color: '#16352c', fontSize: 29, fontWeight: '800', marginTop: 7 },
  subtitle: { color: '#64766f', fontSize: 13, marginTop: 7, marginBottom: 20 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, shadowColor: '#18382e', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  productImage: { width: 148, height: 148, alignSelf: 'center', borderRadius: 20, backgroundColor: '#edf3ef', marginBottom: 15 },
  categoryPill: { alignSelf: 'flex-start', backgroundColor: '#e8f2ed', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 16 },
  categoryText: { color: '#287254', fontSize: 11, fontWeight: '800' },
  productName: { color: '#1b382f', fontSize: 23, lineHeight: 29, fontWeight: '800', marginTop: 16 },
  price: { color: '#176c4d', fontSize: 27, fontWeight: '900', marginTop: 9 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e3eae5', marginVertical: 17 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  detailLabel: { color: '#738179', fontSize: 13 },
  detailValue: { color: '#354f43', fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  available: { color: '#267149' },
  unavailable: { color: '#a24839' },
  loading: { color: '#60776a', fontSize: 15, fontWeight: '700', padding: 12 },
  errorCard: { borderRadius: 14, backgroundColor: '#fff0ec', padding: 15 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 19 },
  outOfStock: { borderRadius: 14, backgroundColor: '#fff0ec', padding: 14, marginTop: 14 },
  outOfStockText: { color: '#963e30', fontSize: 13, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  cartLink: { alignSelf: 'center', padding: 14, marginTop: 4 },
  cartLinkText: { color: '#287254', fontSize: 14, fontWeight: '800' },
});
