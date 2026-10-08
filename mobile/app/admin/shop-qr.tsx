import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/services/api';
import { shopsApi, type ShopQrImage } from '@/services/shops';

export default function ShopQrScreen() {
  const { session } = useAuth();
  const shopId = session?.user.shopId ?? 'SHOP_001';
  const [result, setResult] = useState<ShopQrImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadQr = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await shopsApi.permanentQr(shopId, session.token));
    } catch (requestError) {
      setError(requestError instanceof ApiError
        ? requestError.message
        : 'Could not load the permanent Shop QR. Check that the backend is running and the demo shop is seeded.');
    } finally {
      setLoading(false);
    }
  }, [session, shopId]);

  useFocusEffect(useCallback(() => {
    void loadQr();
  }, [loadQr]));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Store admin</Text></Pressable>
        <Text style={styles.eyebrow}>STORE TOOLS</Text>
        <Text style={styles.title}>Permanent Shop QR</Text>
        <Text style={styles.subtitle}>Display this code at the store entrance so customers can identify the supermarket and start a shopping session.</Text>

        {loading ? <View style={styles.card}><Text style={styles.loading}>Loading Shop QR…</Text></View> : null}
        {result ? (
          <View style={styles.card}>
            <Image accessibilityLabel={`Permanent Shop QR for ${result.shop.name}`} source={{ uri: result.qrCode }} style={styles.qr} />
            <Text style={styles.shopName}>{result.shop.name}</Text>
            <Text style={styles.location}>{result.shop.location}</Text>
            <View style={styles.shopId}><Text style={styles.shopIdText}>SHOP ID  ·  {result.shop.shopId}</Text></View>
          </View>
        ) : null}
        {error ? <View style={styles.errorCard}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text></View> : null}
        <View style={styles.note}>
          <Text style={styles.noteTitle}>Permanent store code</Text>
          <Text style={styles.noteBody}>This QR contains only a random shop reference. Customer and store details are returned by the authenticated backend after scanning.</Text>
        </View>
        {!loading && !result ? (
          <Pressable accessibilityRole="button" onPress={() => void loadQr()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f6fb' },
  page: { flexGrow: 1, padding: 22, paddingTop: 16, paddingBottom: 32 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: '#475887', fontWeight: '700', fontSize: 14 },
  eyebrow: { color: '#6c78a0', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 18 },
  title: { color: '#263452', fontSize: 28, fontWeight: '800', marginTop: 7 },
  subtitle: { color: '#68738c', fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 20 },
  card: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 22, padding: 20, shadowColor: '#22315a', shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  qr: { width: 260, height: 260, resizeMode: 'contain', backgroundColor: '#fff' },
  shopName: { color: '#2c3b5c', fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 9 },
  location: { color: '#74809a', fontSize: 14, marginTop: 5, textAlign: 'center' },
  shopId: { borderRadius: 16, backgroundColor: '#eef1fa', paddingVertical: 8, paddingHorizontal: 11, marginTop: 15 },
  shopIdText: { color: '#566586', fontSize: 10, letterSpacing: 0.6, fontWeight: '900' },
  loading: { color: '#66738e', fontSize: 15, fontWeight: '700', padding: 14 },
  errorCard: { borderRadius: 14, backgroundColor: '#fff0ec', padding: 15 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 19 },
  note: { borderRadius: 16, borderWidth: 1, borderColor: '#dfe4f0', backgroundColor: '#eef1f8', padding: 16, marginTop: 15 },
  noteTitle: { color: '#465778', fontWeight: '800', fontSize: 14 },
  noteBody: { color: '#687690', fontSize: 13, lineHeight: 19, marginTop: 5 },
  retry: { alignItems: 'center', padding: 15, marginTop: 8 },
  retryText: { color: '#465a91', fontWeight: '800' },
});
