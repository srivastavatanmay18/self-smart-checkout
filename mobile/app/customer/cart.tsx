import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/services/api';
import { cartApi, type CartSnapshot } from '@/services/cart';
import { formatRupees } from '@/utils/money';
import { CustomerFlowSteps } from '@/components/CustomerFlowSteps';

export default function CartScreen() {
  const { session } = useAuth();
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCart = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      const result = await cartApi.current(session.token);
      setCart(result.cart);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not load your cart. Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(useCallback(() => {
    void loadCart();
  }, [loadCart]));

  const mutateCart = async (productId: string, mutation: (accessToken: string) => Promise<{ cart: CartSnapshot }>) => {
    if (!session) {
      setError('Sign in as a customer to update your cart.');
      return;
    }
    setBusyProductId(productId);
    setError(null);
    try {
      setCart((await mutation(session.token)).cart);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not update your cart. Please try again.');
    } finally {
      setBusyProductId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadCart(); }} tintColor="#16785c" />}
      >
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Continue shopping</Text></Pressable>
        <Text style={styles.eyebrow}>CURRENT SESSION</Text>
        <Text style={styles.title}>Your Cart</Text>
        <Text style={styles.subtitle}>{cart?.shop?.name ?? (cart ? cart.shopId : 'Items stay with your active shopping session.')}</Text>
        <CustomerFlowSteps activeStep="cart" />

        {loading ? <View style={styles.stateCard}><ActivityIndicator size="small" color="#16785c" /><Text style={styles.stateText}>Loading your cart…</Text></View> : null}
        {error ? <View style={styles.errorCard}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => { setLoading(true); void loadCart(); }}><Text style={styles.retry}>Try again</Text></Pressable></View> : null}

        {!loading && !error && cart?.items.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>⌑</Text></View>
            <Text style={styles.emptyTitle}>Your cart is empty</Text>
            <Text style={styles.emptyText}>Scan a product barcode to add items to this shopping session.</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/customer/scan-product')} style={styles.emptyAction}><Text style={styles.emptyActionText}>Scan a product</Text></Pressable>
          </View>
        ) : null}

        {cart?.items.map((item) => {
          const busy = busyProductId === item.productId;
          const disableActions = busyProductId !== null;
          return (
            <View key={item.productId} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <View style={styles.itemCopy}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemCategory}>{item.category} · {formatRupees(item.price)} each</Text>
                </View>
                <Text style={styles.subtotal}>{formatRupees(item.subtotal)}</Text>
              </View>
              <View style={styles.itemFooter}>
                <View style={styles.quantityControls}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Decrease ${item.name} quantity`}
                    disabled={disableActions || item.quantity <= 1}
                    onPress={() => void mutateCart(item.productId, (token) => cartApi.setQuantity(item.productId, item.quantity - 1, token))}
                    style={[styles.quantityButton, (disableActions || item.quantity <= 1) && styles.disabled]}
                  ><Text style={styles.quantityButtonText}>−</Text></Pressable>
                  <Text accessibilityLabel={`Quantity ${item.quantity}`} style={styles.quantity}>{busy ? '…' : item.quantity}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Increase ${item.name} quantity`}
                    disabled={disableActions}
                    onPress={() => void mutateCart(item.productId, (token) => cartApi.addItem(item.productId, token))}
                    style={[styles.quantityButton, disableActions && styles.disabled]}
                  ><Text style={styles.quantityButtonText}>+</Text></Pressable>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={disableActions}
                  onPress={() => void mutateCart(item.productId, (token) => cartApi.removeItem(item.productId, token))}
                  style={styles.removeButton}
                ><Text style={styles.removeText}>Remove</Text></Pressable>
              </View>
            </View>
          );
        })}

        {cart && cart.items.length > 0 ? (
          <View style={styles.totalCard}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Items</Text><Text style={styles.totalValue}>{cart.itemCount}</Text></View>
            <View style={styles.totalDivider} />
            <View style={styles.totalRow}><Text style={styles.totalTitle}>Cart total</Text><Text style={styles.totalAmount}>{formatRupees(cart.totalAmount)}</Text></View>
            <Text style={styles.sessionNote}>Saved to session {cart.sessionId}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/customer/checkout')} style={styles.checkoutButton}>
              <Text style={styles.checkoutButtonText}>Proceed to Checkout</Text>
            </Pressable>
          </View>
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => router.push('/customer/scan-product')} style={styles.addMore}><Text style={styles.addMoreText}>＋  Scan another product</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f7f5' },
  page: { flexGrow: 1, padding: 22, paddingTop: 16, paddingBottom: 36 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: '#426354', fontWeight: '700', fontSize: 14 },
  eyebrow: { color: '#678273', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 15 },
  title: { color: '#16352c', fontSize: 30, fontWeight: '800', marginTop: 7 },
  subtitle: { color: '#64766f', fontSize: 14, marginTop: 6, marginBottom: 18 },
  stateCard: { flexDirection: 'row', gap: 11, alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  stateText: { color: '#64766f', fontSize: 14 },
  errorCard: { borderRadius: 14, backgroundColor: '#fff0ec', padding: 15 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 19 },
  retry: { color: '#8f392d', fontWeight: '800', fontSize: 13, marginTop: 10 },
  emptyCard: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, padding: 24, marginTop: 7 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#eaf3ed', alignItems: 'center', justifyContent: 'center' },
  emptyIconText: { color: '#26704e', fontSize: 32, fontWeight: '700', marginTop: -5 },
  emptyTitle: { color: '#1c382e', fontSize: 19, fontWeight: '800', marginTop: 15 },
  emptyText: { color: '#718179', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  emptyAction: { paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#e8f2ed', borderRadius: 12, marginTop: 17 },
  emptyActionText: { color: '#16785c', fontWeight: '800', fontSize: 13 },
  itemCard: { backgroundColor: '#fff', borderRadius: 17, padding: 16, marginBottom: 11, shadowColor: '#18382e', shadowOpacity: 0.04, shadowRadius: 9, elevation: 1 },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemCopy: { flex: 1 },
  itemName: { color: '#1c382e', fontSize: 15, lineHeight: 21, fontWeight: '800' },
  itemCategory: { color: '#7a8881', fontSize: 12, marginTop: 4 },
  subtotal: { color: '#1f684b', fontSize: 16, fontWeight: '900' },
  itemFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  quantityControls: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  quantityButton: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#e8f2ed', alignItems: 'center', justifyContent: 'center' },
  quantityButtonText: { color: '#216a4a', fontSize: 20, fontWeight: '700', marginTop: -2 },
  quantity: { minWidth: 18, color: '#244335', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.45 },
  removeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  removeText: { color: '#a24d3f', fontSize: 12, fontWeight: '800' },
  totalCard: { backgroundColor: '#173f32', borderRadius: 19, padding: 18, marginTop: 6 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: '#c3d9cd', fontSize: 13 },
  totalValue: { color: '#e4f1e9', fontSize: 13, fontWeight: '700' },
  totalDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#ffffff3a', marginVertical: 14 },
  totalTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  totalAmount: { color: '#fff', fontSize: 22, fontWeight: '900' },
  sessionNote: { color: '#adccba', fontSize: 10, marginTop: 13 },
  checkoutButton: { minHeight: 50, justifyContent: 'center', alignItems: 'center', backgroundColor: '#b9efd2', borderRadius: 13, marginTop: 17, paddingHorizontal: 16 },
  checkoutButtonText: { color: '#174835', fontSize: 15, fontWeight: '900' },
  addMore: { alignSelf: 'center', padding: 15, marginTop: 2 },
  addMoreText: { color: '#287254', fontSize: 14, fontWeight: '800' },
});
