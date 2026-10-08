import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/services/api';
import { exitPassApi, type CustomerExitPass } from '@/services/exitPasses';
import { formatRupees } from '@/utils/money';
import { CustomerFlowSteps } from '@/components/CustomerFlowSteps';
import { statusLabel } from '@/utils/statusLabels';

export default function ExitPassScreen() {
  const { orderId: orderParam } = useLocalSearchParams<{ orderId?: string | string[] }>();
  const orderId = Array.isArray(orderParam) ? orderParam[0] : orderParam;
  const { session } = useAuth();
  const [pass, setPass] = useState<CustomerExitPass | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPass = useCallback(async () => {
    if (!session || !orderId) {
      setError('The paid order reference is missing. Open the Exit Pass from your customer home screen.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError(null);
    try {
      setPass(await exitPassApi.customerPass(orderId, session.token));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not load your Exit Pass. Check your connection and retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId, session]);

  useFocusEffect(useCallback(() => {
    void loadPass();
  }, [loadPass]));

  const active = pass?.exitPass.status === 'ACTIVE' || pass?.exitPass.status === 'CHECK_REQUIRED';
  const checkRequired = pass?.exitPass.status === 'CHECK_REQUIRED';
  const used = pass?.exitPass.status === 'USED';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadPass(); }} tintColor="#16785c" />}
      >
        <Pressable accessibilityRole="button" onPress={() => router.replace('/customer')} style={styles.back}><Text style={styles.backText}>‹  Customer home</Text></Pressable>
        <Text style={styles.eyebrow}>CUSTOMER · EXIT PASS</Text>
        <Text style={styles.title}>Payment Successful</Text>
        <Text style={styles.subtitle}>Show your one-time code to a guard to complete your exit.</Text>
        <CustomerFlowSteps activeStep="exit" />

        {loading ? <View style={styles.stateCard}><ActivityIndicator color="#16785c" /><Text style={styles.stateText}>Loading your Exit Pass…</Text></View> : null}
        {error ? (
          <View style={styles.errorCard}>
            <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => { setLoading(true); void loadPass(); }} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
          </View>
        ) : null}

        {pass ? (
          <>
            <View style={styles.shopCard}>
              <Text style={styles.label}>SHOP</Text>
              <Text style={styles.shopName}>{pass.shop.name}</Text>
              <Text style={styles.shopLocation}>{pass.shop.location} · {pass.shop.shopId}</Text>
            </View>

            <View style={styles.qrCard}>
              {active && pass.exitPass.qrCode ? (
                <>
                  <Image accessibilityLabel="One-time Exit QR code" source={{ uri: pass.exitPass.qrCode }} resizeMode="contain" style={styles.qrImage} />
                  <Text style={styles.qrHint}>{checkRequired ? 'A guard requested a further manual item inspection. Keep this pass available while the items are checked. ' : 'This code is unique to this paid order. '}Expires at {new Date(pass.exitPass.expiresAt).toLocaleTimeString()}.</Text>
                </>
              ) : (
                <View style={[styles.qrPlaceholder, used && styles.usedPlaceholder]}>
                  <Text style={styles.placeholderIcon}>{used ? '✓' : '⌛'}</Text>
                  <Text style={styles.placeholderTitle}>{used ? 'Exit approved' : `Pass ${statusLabel(pass.exitPass.status)}`}</Text>
                  <Text style={styles.qrHint}>{used ? 'This code has been used and cannot be scanned again.' : 'This code is no longer valid. Contact a store staff member.'}</Text>
                </View>
              )}
              <View style={[styles.statusPill, pass.exitPass.status === 'ACTIVE' && styles.activePill, used && styles.usedPill]}>
                <Text accessibilityLabel={`Exit pass status ${statusLabel(pass.exitPass.status)}`} style={[styles.statusText, (pass.exitPass.status === 'ACTIVE' || used) && styles.activeStatusText]}>EXIT PASS · {statusLabel(pass.exitPass.status)}</Text>
              </View>
            </View>

            <View style={styles.orderCard}>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Order ID</Text><Text style={styles.detailValue}>{pass.order.orderId}</Text></View>
              <View style={styles.divider} />
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Total paid</Text><Text style={styles.total}>{formatRupees(pass.order.totalAmount)}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Payment</Text><Text style={styles.paymentValue}>{statusLabel(pass.order.paymentStatus)}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Pass expires</Text><Text style={styles.detailValue}>{new Date(pass.exitPass.expiresAt).toLocaleString()}</Text></View>
              {pass.exitPass.verifiedAt ? <View style={styles.detailRow}><Text style={styles.detailLabel}>Exit approved</Text><Text style={styles.detailValue}>{new Date(pass.exitPass.verifiedAt).toLocaleString()}</Text></View> : null}
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
  title: { color: '#16352c', fontSize: 29, fontWeight: '900', marginTop: 7 },
  subtitle: { color: '#64766f', fontSize: 14, lineHeight: 21, marginTop: 6, marginBottom: 17 },
  stateCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  stateText: { color: '#64766f', fontSize: 14 },
  errorCard: { borderRadius: 16, backgroundColor: '#fff0ec', padding: 16 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 20 },
  retry: { alignSelf: 'flex-start', paddingVertical: 10 },
  retryText: { color: '#863d31', fontWeight: '800', fontSize: 13 },
  shopCard: { backgroundColor: '#e8f2ed', borderRadius: 17, padding: 16, marginBottom: 12 },
  label: { color: '#789084', fontSize: 9, letterSpacing: 1.1, fontWeight: '900' },
  shopName: { color: '#234739', fontSize: 19, fontWeight: '900', marginTop: 5 },
  shopLocation: { color: '#6b8175', fontSize: 12, marginTop: 3 },
  qrCard: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 12, shadowColor: '#18382e', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  qrImage: { width: 250, height: 250 },
  qrHint: { color: '#718078', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8 },
  qrPlaceholder: { width: 250, minHeight: 230, borderRadius: 17, backgroundColor: '#fff8e9', alignItems: 'center', justifyContent: 'center', padding: 20 },
  usedPlaceholder: { backgroundColor: '#e8f4eb' },
  placeholderIcon: { color: '#9b742d', fontSize: 44, fontWeight: '800' },
  placeholderTitle: { color: '#4b4935', fontSize: 17, fontWeight: '900', marginTop: 8 },
  statusPill: { backgroundColor: '#fff3db', borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8, marginTop: 15 },
  activePill: { backgroundColor: '#e9f4eb' },
  usedPill: { backgroundColor: '#e9efff' },
  statusText: { color: '#87651f', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  activeStatusText: { color: '#267149' },
  orderCard: { backgroundColor: '#fff', borderRadius: 18, padding: 17 },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 7 },
  detailLabel: { color: '#728078', fontSize: 12 },
  detailValue: { color: '#294539', fontSize: 12, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  total: { color: '#176143', fontSize: 17, fontWeight: '900' },
  paymentValue: { color: '#267149', fontSize: 12, fontWeight: '900' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e3eae5', marginVertical: 7 },
});
