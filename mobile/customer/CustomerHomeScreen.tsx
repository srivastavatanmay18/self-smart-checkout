import { useCallback, useState } from 'react';
import { Link, router, useFocusEffect } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { PrimaryButton } from '@/components/PrimaryButton';
import { CustomerFlowSteps } from '@/components/CustomerFlowSteps';
import { ApiError } from '@/services/api';
import { shopsApi, type SessionSnapshot } from '@/services/shops';
import { statusLabel } from '@/utils/statusLabels';

export function CustomerHomeScreen() {
  const { session, logout } = useAuth();
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      setSnapshot(await shopsApi.currentSession(session.token));
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : 'Could not reach the shop service. Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(useCallback(() => {
    void loadSession();
  }, [loadSession]));

  const signOut = async () => {
    setLogoutError(null);
    try {
      await logout();
    } catch {
      setLogoutError('Signed out on this device. The server could not be reached to revoke the token.');
    }
  };

  const activeSession = snapshot?.session ?? null;
  const paymentPending = Boolean(activeSession?.pendingOrderId);
  const readyForExit = activeSession?.status === 'READY_FOR_EXIT';
  const sessionCompleted = activeSession?.status === 'COMPLETED';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadSession(); }} tintColor="#16785c" />}
      >
        <Text style={styles.brand}>SELF SMART CHECKOUT</Text>
        <Text style={styles.eyebrow}>CUSTOMER</Text>
        <Text style={styles.title}>Hello, {session?.user.name.split(' ')[0] ?? 'there'}.</Text>
        <Text style={styles.subtitle}>Identify your supermarket before you begin.</Text>

        <CustomerFlowSteps activeStep={readyForExit || sessionCompleted ? 'exit' : paymentPending ? 'payment' : activeSession ? 'shopping' : 'shop'} />

        <View style={styles.hero}>
          <View style={styles.icon}><Text style={styles.iconText}>⌗</Text></View>
          <Text style={styles.heroTitle}>{sessionCompleted ? 'Exit approved' : readyForExit ? 'Payment complete' : paymentPending ? 'Checkout in progress' : activeSession ? 'Ready to shop?' : 'Scan Shop QR to Start Shopping'}</Text>
          <Text style={styles.heroBody}>
            {sessionCompleted
              ? `Your transaction at ${snapshot?.shop?.name ?? activeSession?.shopId} is complete. The guard approved your Exit Pass.`
              : readyForExit
                ? `Your payment at ${snapshot?.shop?.name ?? activeSession?.shopId} succeeded. Open your one-time Exit Pass and show it to the guard.`
              : paymentPending
                ? `Your cart at ${snapshot?.shop?.name ?? activeSession?.shopId} is locked while the sandbox payment is pending.`
                : activeSession
                  ? `Your active session is linked to ${snapshot?.shop?.name ?? activeSession.shopId}. Scan a product barcode to add it to your cart.`
              : 'Scan the permanent code displayed by your supermarket. We’ll confirm the shop before creating a session.'}
          </Text>
          {readyForExit || sessionCompleted ? (
            <PrimaryButton title={sessionCompleted ? 'View Exit Pass Status' : 'Open Exit Pass'} onPress={() => activeSession?.completedOrderId && router.push({ pathname: '/customer/exit-pass', params: { orderId: activeSession.completedOrderId } })} disabled={!activeSession?.completedOrderId} />
          ) : paymentPending ? (
            <PrimaryButton title="Resume Sandbox Payment" onPress={() => router.push('/customer/checkout')} />
          ) : activeSession ? (
            <>
              <PrimaryButton title="Scan Product Barcode" onPress={() => router.push('/customer/scan-product')} />
              <PrimaryButton title="Open Cart" secondary onPress={() => router.push('/customer/cart')} />
              <Pressable accessibilityRole="button" onPress={() => router.push('/customer/scan-shop')} style={styles.switchShop}>
                <Text style={styles.switchShopText}>Scan another Shop QR</Text>
              </Pressable>
            </>
          ) : <PrimaryButton title="Scan Shop QR" onPress={() => router.push('/customer/scan-shop')} />}
        </View>

        {loading ? <View style={styles.infoCard}><Text style={styles.muted}>Checking for an active shopping session…</Text></View> : null}
        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Shop service unavailable</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => { setLoading(true); void loadSession(); }}><Text style={styles.retry}>Try again</Text></Pressable>
          </View>
        ) : null}

        {activeSession ? (
          <View style={styles.infoCard}>
            <Text style={styles.cardLabel}>CURRENT SHOP</Text>
            <Text style={styles.shopName}>{snapshot?.shop?.name ?? activeSession.shopId}</Text>
            <Text style={styles.muted}>{snapshot?.shop?.location ?? activeSession.shopId}</Text>
            <View style={styles.divider} />
            <Text style={styles.meta}>Shop ID  ·  {activeSession.shopId}</Text>
            <Text style={styles.meta}>Session  ·  {activeSession.sessionId}</Text>
            <Text style={styles.meta}>Started  ·  {new Date(activeSession.startedAt).toLocaleString()}</Text>
            <View style={[styles.status, (readyForExit || sessionCompleted) && styles.readyStatus]}><View style={[styles.statusDot, (readyForExit || sessionCompleted) && styles.readyDot]} /><Text accessibilityLabel={`Session status ${statusLabel(sessionCompleted ? 'COMPLETED' : readyForExit ? 'READY_FOR_EXIT' : paymentPending ? 'PENDING' : 'ACTIVE')}`} style={[styles.statusText, (readyForExit || sessionCompleted) && styles.readyText]}>{statusLabel(sessionCompleted ? 'COMPLETED' : readyForExit ? 'READY_FOR_EXIT' : paymentPending ? 'PENDING' : 'ACTIVE')}</Text></View>
          </View>
        ) : null}

        <View style={styles.note}>
          <Text style={styles.noteTitle}>Shopping begins with a verified shop</Text>
          <Text style={styles.noteBody}>Your session is created only after the scanned permanent QR is confirmed by the checkout service.</Text>
        </View>

        {logoutError ? <Text accessibilityRole="alert" style={styles.logoutError}>{logoutError}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.logout}><Text style={styles.logoutText}>Sign out</Text></Pressable>
        <Link href="/foundation" style={styles.foundation}>Local service status</Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f7f5' },
  page: { flexGrow: 1, padding: 22, paddingTop: 30, paddingBottom: 36 },
  brand: { color: '#16785c', fontWeight: '900', letterSpacing: 1.3, fontSize: 12 },
  eyebrow: { color: '#73847c', fontWeight: '900', fontSize: 10, letterSpacing: 1.4, marginTop: 30 },
  title: { color: '#16352c', fontSize: 30, fontWeight: '800', marginTop: 8 },
  subtitle: { color: '#64766f', fontSize: 15, lineHeight: 22, marginTop: 7, marginBottom: 22 },
  hero: { padding: 20, borderRadius: 22, backgroundColor: '#173f32', marginBottom: 16 },
  icon: { width: 48, height: 48, borderRadius: 15, backgroundColor: '#ffffff18', alignItems: 'center', justifyContent: 'center' },
  iconText: { color: '#d4f4df', fontSize: 30, fontWeight: '500', marginTop: -5 },
  heroTitle: { color: '#fff', fontSize: 22, lineHeight: 28, fontWeight: '800', marginTop: 18 },
  heroBody: { color: '#cee0d7', fontSize: 14, lineHeight: 21, marginTop: 9 },
  switchShop: { alignSelf: 'center', paddingVertical: 13, paddingHorizontal: 10, marginTop: 2 },
  switchShopText: { color: '#c6e1d1', fontSize: 13, fontWeight: '800' },
  infoCard: { backgroundColor: '#fff', borderRadius: 18, padding: 18, marginBottom: 14, shadowColor: '#18382e', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  cardLabel: { color: '#83938b', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  shopName: { color: '#1b382f', fontSize: 20, fontWeight: '800', marginTop: 10 },
  muted: { color: '#697a72', fontSize: 14, lineHeight: 20, marginTop: 5 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e3eae5', marginVertical: 14 },
  meta: { color: '#66776f', fontSize: 12, marginTop: 5 },
  status: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, backgroundColor: '#e8f4eb', borderRadius: 18, paddingHorizontal: 10, paddingVertical: 7, marginTop: 15 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#268254' },
  statusText: { color: '#267149', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  readyStatus: { backgroundColor: '#e9efff' },
  readyDot: { backgroundColor: '#4c69aa' },
  readyText: { color: '#465f9d' },
  note: { borderRadius: 16, borderWidth: 1, borderColor: '#dce9e0', backgroundColor: '#edf5ef', padding: 16, marginTop: 2 },
  noteTitle: { color: '#294b3c', fontWeight: '800', fontSize: 14 },
  noteBody: { color: '#668073', fontSize: 13, lineHeight: 19, marginTop: 5 },
  errorCard: { padding: 16, borderRadius: 16, backgroundColor: '#fff0ec', marginBottom: 14 },
  errorTitle: { color: '#963e30', fontSize: 14, fontWeight: '800' },
  errorText: { color: '#9d5b50', fontSize: 13, lineHeight: 19, marginTop: 5 },
  retry: { color: '#8f392d', fontSize: 13, fontWeight: '800', marginTop: 10 },
  logoutError: { color: '#a84f3b', fontSize: 13, lineHeight: 19, marginTop: 10 },
  logout: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: '#d6e3dc', backgroundColor: '#fff', marginTop: 16 },
  logoutText: { color: '#34574a', fontSize: 15, fontWeight: '800' },
  foundation: { alignSelf: 'center', color: '#819189', fontSize: 13, fontWeight: '600', marginTop: 14, padding: 8 },
});
