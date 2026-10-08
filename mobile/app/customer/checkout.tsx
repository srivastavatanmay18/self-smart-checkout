import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/services/api';
import { checkoutApi, type CheckoutOrder } from '@/services/checkout';
import { formatRupees } from '@/utils/money';
import { CustomerFlowSteps } from '@/components/CustomerFlowSteps';
import { statusLabel } from '@/utils/statusLabels';

export default function CheckoutScreen() {
  const { session } = useAuth();
  const [order, setOrder] = useState<CheckoutOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCheckout = useCallback(async () => {
    if (!session) {
      setLoading(false);
      setError('Sign in as a customer to check out.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await checkoutApi.create(session.token);
      setOrder(result.order);
    } catch (requestError) {
      setError(requestError instanceof ApiError
        ? requestError.message
        : 'Could not prepare checkout. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useFocusEffect(useCallback(() => {
    let focused = true;
    void (async () => {
      if (!session) {
        if (focused) {
          setLoading(false);
          setError('Sign in as a customer to check out.');
        }
        return;
      }
      if (focused) {
        setLoading(true);
        setError(null);
      }
      try {
        const result = await checkoutApi.create(session.token);
        if (focused) setOrder(result.order);
      } catch (requestError) {
        if (focused) {
          setError(requestError instanceof ApiError
            ? requestError.message
            : 'Could not prepare checkout. Check your connection and try again.');
        }
      } finally {
        if (focused) setLoading(false);
      }
    })();
    return () => { focused = false; };
  }, [session]));

  const runPayment = async (outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED') => {
    if (!session || !order || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await checkoutApi.simulatePayment(order.orderId, outcome, session.token);
      setOrder(result.order);
      if (result.order.paymentStatus === 'SUCCESS' && result.exitPass) {
        router.replace({ pathname: '/customer/exit-pass', params: { orderId: order.orderId } });
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError
        ? requestError.message
        : 'The sandbox payment could not be completed. Your cart has not been marked paid.');
      if (requestError instanceof ApiError && requestError.status === 409) {
        try {
          const refreshed = await checkoutApi.paymentStatus(order.orderId, session.token);
          setOrder(refreshed.order);
        } catch {
          // Keep the original actionable stock or payment error visible.
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const taxRate = order ? order.taxRateBps / 100 : 0;
  const discountRate = order ? order.discountRateBps / 100 : 0;
  const paid = order?.paymentStatus === 'SUCCESS';
  const retryable = order?.paymentStatus === 'FAILED' || order?.paymentStatus === 'CANCELLED';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Back</Text></Pressable>
        <Text style={styles.eyebrow}>CUSTOMER · SECURE CHECKOUT</Text>
        <Text style={styles.title}>Review & pay</Text>
        <Text style={styles.subtitle}>Confirm your items and complete a sandbox payment. No real money is charged.</Text>
        <CustomerFlowSteps activeStep={order && (order.paymentStatus === 'FAILED' || order.paymentStatus === 'CANCELLED') ? 'payment' : 'checkout'} />

        {loading ? <View style={styles.stateCard}><ActivityIndicator color="#16785c" /><Text style={styles.stateText}>Validating cart and stock…</Text></View> : null}

        {error ? (
          <View style={styles.errorCard}>
            <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void loadCheckout()} style={styles.tryAgain}><Text style={styles.tryAgainText}>Review checkout again</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.replace('/customer/cart')} style={styles.textAction}><Text style={styles.textActionText}>Return to cart</Text></Pressable>
          </View>
        ) : null}

        {!loading && order ? (
          <>
            <View style={styles.orderMeta}>
              <View><Text style={styles.metaLabel}>SHOP</Text><Text style={styles.metaValue}>{order.shopId}</Text></View>
              <View style={styles.metaRight}><Text style={styles.metaLabel}>ITEMS</Text><Text style={styles.metaValue}>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</Text></View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Order summary</Text>
              {order.items.map((item, index) => (
                <View key={item.productId} style={[styles.line, index > 0 && styles.lineBorder]}>
                  <View style={styles.lineCopy}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>{item.category} · {formatRupees(item.unitPrice)} × {item.quantity}</Text>
                  </View>
                  <Text style={styles.lineAmount}>{formatRupees(item.subtotal)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.totalsCard}>
              <View style={styles.totalRow}><Text style={styles.totalLabel}>Cart subtotal</Text><Text style={styles.totalValue}>{formatRupees(order.subtotalAmount)}</Text></View>
              <View style={styles.totalRow}><Text style={styles.totalLabel}>Tax ({taxRate.toFixed(taxRate % 1 === 0 ? 0 : 2)}%)</Text><Text style={styles.totalValue}>+ {formatRupees(order.taxAmount)}</Text></View>
              <View style={styles.totalRow}><Text style={styles.totalLabel}>Discount ({discountRate.toFixed(discountRate % 1 === 0 ? 0 : 2)}%)</Text><Text style={styles.discountValue}>− {formatRupees(order.discountAmount)}</Text></View>
              <View style={styles.totalDivider} />
              <View style={styles.totalRow}><Text style={styles.finalLabel}>Amount payable</Text><Text style={styles.finalAmount}>{formatRupees(order.finalAmount)}</Text></View>
            </View>

            <View style={[styles.paymentCard, paid && styles.successCard, retryable && styles.retryCard]}>
              <Text style={styles.paymentEyebrow}>TEST / SANDBOX</Text>
              <Text style={styles.paymentTitle}>{paid ? 'Payment successful' : retryable ? 'Payment not completed' : 'Sandbox payment'}</Text>
              <Text style={styles.paymentCopy}>
                {paid
                  ? 'The backend confirmed payment success. Your one-time Exit Pass is ready to show the guard.'
                  : retryable
                    ? `${order.failureReason ?? `Payment ${order.paymentStatus.toLowerCase()}.`} Your cart remains unpaid and can be retried.`
                    : 'Choose a simulated outcome below. The backend records the result; this flow never contacts a payment provider.'}
              </Text>
              <View style={styles.statusPill}><Text accessibilityLabel={`Payment status ${statusLabel(order.paymentStatus)}`} style={styles.statusText}>{statusLabel(order.paymentStatus)}</Text></View>
              <Text style={styles.orderId}>Order {order.orderId}</Text>

              {paid ? (
                <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: '/customer/exit-pass', params: { orderId: order.orderId } })} style={styles.primaryButton}><Text style={styles.primaryButtonText}>View Exit Pass</Text></Pressable>
              ) : (
                <>
                  <Pressable accessibilityRole="button" disabled={busy} onPress={() => void runPayment('SUCCESS')} style={[styles.primaryButton, busy && styles.disabled]}>
                    <Text style={styles.primaryButtonText}>{busy ? 'Processing sandbox payment…' : retryable ? 'Retry successful test payment' : 'Pay now · simulate success'}</Text>
                  </Pressable>
                  <View style={styles.secondaryActions}>
                    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void runPayment('FAILED')} style={[styles.secondaryButton, busy && styles.disabled]}><Text style={styles.secondaryText}>Simulate failure</Text></Pressable>
                    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void runPayment('CANCELLED')} style={[styles.secondaryButton, busy && styles.disabled]}><Text style={styles.secondaryText}>Cancel payment</Text></Pressable>
                  </View>
                </>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f7f5' },
  page: { flexGrow: 1, padding: 22, paddingTop: 15, paddingBottom: 36 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: '#426354', fontWeight: '700', fontSize: 14 },
  eyebrow: { color: '#678273', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 16 },
  title: { color: '#16352c', fontSize: 30, fontWeight: '800', marginTop: 7 },
  subtitle: { color: '#64766f', fontSize: 14, lineHeight: 21, marginTop: 6, marginBottom: 18 },
  stateCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  stateText: { color: '#64766f', fontSize: 14 },
  errorCard: { borderRadius: 16, backgroundColor: '#fff0ec', padding: 16, marginBottom: 14 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 20 },
  tryAgain: { alignSelf: 'flex-start', paddingVertical: 10, marginTop: 5 },
  tryAgainText: { color: '#863d31', fontWeight: '800', fontSize: 13 },
  textAction: { alignSelf: 'flex-start', paddingVertical: 5 },
  textActionText: { color: '#65746d', fontWeight: '700', fontSize: 12 },
  orderMeta: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#e8f2ed', borderRadius: 15, padding: 15, marginBottom: 12 },
  metaRight: { alignItems: 'flex-end' },
  metaLabel: { color: '#789084', fontSize: 9, letterSpacing: 1, fontWeight: '900' },
  metaValue: { color: '#285240', fontWeight: '800', fontSize: 13, marginTop: 4 },
  sectionCard: { backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 16, paddingTop: 17, marginBottom: 12, shadowColor: '#18382e', shadowOpacity: 0.04, shadowRadius: 9, elevation: 1 },
  sectionTitle: { color: '#203e32', fontSize: 16, fontWeight: '900', paddingBottom: 5 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 14 },
  lineBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e6ece8' },
  lineCopy: { flex: 1 },
  itemName: { color: '#254438', fontSize: 14, fontWeight: '800' },
  itemMeta: { color: '#718078', fontSize: 12, marginTop: 4 },
  lineAmount: { color: '#285c43', fontSize: 14, fontWeight: '900' },
  totalsCard: { backgroundColor: '#fff', borderRadius: 18, padding: 17, marginBottom: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginVertical: 5 },
  totalLabel: { color: '#64766d', fontSize: 13 },
  totalValue: { color: '#294539', fontSize: 13, fontWeight: '700' },
  discountValue: { color: '#258050', fontSize: 13, fontWeight: '800' },
  totalDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e1e9e4', marginVertical: 11 },
  finalLabel: { color: '#1d3c2f', fontSize: 15, fontWeight: '900' },
  finalAmount: { color: '#176143', fontSize: 20, fontWeight: '900' },
  paymentCard: { borderRadius: 19, padding: 18, backgroundColor: '#173f32', marginTop: 2 },
  successCard: { backgroundColor: '#1c6041' },
  retryCard: { backgroundColor: '#674430' },
  paymentEyebrow: { color: '#bcdfc9', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  paymentTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 8 },
  paymentCopy: { color: '#d2e5d9', fontSize: 13, lineHeight: 19, marginTop: 6 },
  statusPill: { alignSelf: 'flex-start', borderRadius: 18, backgroundColor: '#ffffff20', paddingHorizontal: 11, paddingVertical: 7, marginTop: 13 },
  statusText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  orderId: { color: '#bfdbca', fontSize: 10, marginTop: 12 },
  primaryButton: { minHeight: 50, justifyContent: 'center', alignItems: 'center', borderRadius: 13, backgroundColor: '#b9efd2', paddingHorizontal: 14, marginTop: 17 },
  primaryButtonText: { color: '#174835', fontSize: 14, textAlign: 'center', fontWeight: '900' },
  secondaryActions: { flexDirection: 'row', gap: 9, marginTop: 9 },
  secondaryButton: { flex: 1, minHeight: 43, justifyContent: 'center', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#ffffff54', paddingHorizontal: 8 },
  secondaryText: { color: '#fff', fontSize: 11, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.55 },
});
