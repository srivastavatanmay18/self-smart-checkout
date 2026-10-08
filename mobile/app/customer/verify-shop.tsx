import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { PrimaryButton } from '@/components/PrimaryButton';
import { CustomerFlowSteps } from '@/components/CustomerFlowSteps';
import { ApiError } from '@/services/api';
import { shopsApi, type ShopSummary } from '@/services/shops';

export default function VerifyShopScreen() {
  const { token: routeToken } = useLocalSearchParams<{ token?: string }>();
  const token = Array.isArray(routeToken) ? routeToken[0] : routeToken;
  const { session } = useAuth();
  const [shop, setShop] = useState<ShopSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!token || !session) return () => { active = false; };
    shopsApi.identify(token, session.token)
      .then((result) => { if (active) setShop(result.shop); })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(requestError instanceof ApiError ? requestError.message : 'Could not verify this shop. Check your connection and try again.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, session]);

  const startShopping = async () => {
    if (!shop || !token || !session) return;
    setStarting(true);
    setError(null);
    try {
      await shopsApi.startSession(shop.shopId, token, session.token);
      router.replace('/customer');
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not start a shopping session. Please try again.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Scan again</Text></Pressable>
        <Text style={styles.step}>STEP 2 OF 2</Text>
        <Text style={styles.title}>Verify Shop</Text>
        <Text style={styles.subtitle}>We checked the scanned permanent QR with the checkout service.</Text>
        <CustomerFlowSteps activeStep="shop" />

        {loading && token ? (
          <View style={styles.card}><Text style={styles.loading}>Verifying shop…</Text></View>
        ) : null}
        {shop ? (
          <View style={styles.card}>
            <View style={styles.check}><Text style={styles.checkText}>✓</Text></View>
            <Text style={styles.identified}>SHOP IDENTIFIED</Text>
            <Text style={styles.shopName}>{shop.name}</Text>
            <Text style={styles.location}>{shop.location}</Text>
            <View style={styles.divider} />
            <Text style={styles.shopIdLabel}>SHOP ID</Text>
            <Text style={styles.shopId}>{shop.shopId}</Text>
            <Text style={styles.confirmation}>Confirm this is the supermarket where you are shopping.</Text>
          </View>
        ) : null}
        {error || !token ? <View style={styles.errorCard}><Text accessibilityRole="alert" style={styles.errorText}>{error ?? 'The Shop QR could not be read. Scan the permanent code again.'}</Text></View> : null}

        {shop ? <PrimaryButton title="Start Shopping Session" loading={starting} onPress={() => void startShopping()} /> : null}
        {(!loading || !token) && !shop ? <PrimaryButton title="Scan Shop QR Again" secondary onPress={() => router.replace('/customer/scan-shop')} /> : null}
        <Text style={styles.secure}>A new active session will be linked to your signed-in customer account and this shop.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f7f5' },
  page: { flexGrow: 1, padding: 22, paddingTop: 16, paddingBottom: 34 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: '#426354', fontWeight: '700', fontSize: 14 },
  step: { color: '#678273', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 16 },
  title: { color: '#16352c', fontSize: 29, fontWeight: '800', marginTop: 7 },
  subtitle: { color: '#64766f', fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 20 },
  card: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 22, padding: 24, shadowColor: '#18382e', shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  check: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#e6f4e9', alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#26754b', fontSize: 28, fontWeight: '800' },
  identified: { color: '#52816a', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 17 },
  shopName: { color: '#173c2e', fontSize: 23, fontWeight: '800', textAlign: 'center', marginTop: 7 },
  location: { color: '#718179', fontSize: 14, marginTop: 5, textAlign: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e3eae5', alignSelf: 'stretch', marginTop: 22, marginBottom: 17 },
  shopIdLabel: { color: '#84938c', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  shopId: { color: '#34584a', fontSize: 14, fontWeight: '800', marginTop: 5 },
  confirmation: { color: '#64766f', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 18 },
  loading: { color: '#60776a', fontSize: 15, fontWeight: '700', padding: 12 },
  errorCard: { borderRadius: 14, backgroundColor: '#fff0ec', padding: 15 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 19 },
  secure: { color: '#819088', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 17 },
});
