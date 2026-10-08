import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { ApiHealth, fetchApiHealth } from '@/services/api';

export default function FoundationScreen() {
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHealth(await fetchApiHealth());
    } catch {
      setError('Could not reach the local API. Start the backend and check the API address.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchApiHealth()
      .then((result) => { if (active) setHealth(result); })
      .catch(() => { if (active) setError('Could not reach the local API. Start the backend and check the API address.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>PHASE 1 · PROJECT FOUNDATION</Text>
        <Text style={styles.title}>Self Smart{ '\n' }Checkout</Text>
        <Text style={styles.subtitle}>Native Android app foundation for faster, smarter in-store checkout.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Local services</Text>
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: health?.status === 'ok' ? '#1e9a72' : error ? '#dc7555' : '#d6a73c' }]} />
            <Text style={styles.label}>Express API</Text>
            {loading ? <ActivityIndicator color="#16785c" /> : <Text style={styles.value}>{health?.status === 'ok' ? 'Connected' : 'Unavailable'}</Text>}
          </View>
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: health?.database === 'connected' ? '#1e9a72' : '#d6a73c' }]} />
            <Text style={styles.label}>MongoDB</Text>
            <Text style={styles.value}>{health?.database ?? 'Waiting for API'}</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable onPress={() => void refreshHealth()} style={styles.button}>
            <Text style={styles.buttonText}>{loading ? 'Checking…' : 'Check connection'}</Text>
          </Pressable>
        </View>

        <Text style={styles.note}>Phase 1 foundation status. Authentication and separate role portals are now available.</Text>
        <Link href="/login" style={styles.link}>Return to sign in</Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f7f5' },
  container: { flexGrow: 1, padding: 24, paddingTop: 48 },
  eyebrow: { color: '#16785c', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#16352c', fontSize: 38, lineHeight: 44, fontWeight: '800', marginTop: 14 },
  subtitle: { color: '#64766f', fontSize: 16, lineHeight: 24, marginTop: 12, marginBottom: 30 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, shadowColor: '#18382e', shadowOpacity: 0.08, shadowRadius: 16, elevation: 3 },
  cardTitle: { color: '#1c362e', fontWeight: '700', fontSize: 18, marginBottom: 18 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e7eeea', gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  label: { flex: 1, color: '#51645d', fontSize: 15 },
  value: { color: '#29473d', fontWeight: '600', fontSize: 14, textTransform: 'capitalize' },
  error: { color: '#a84f3b', fontSize: 13, lineHeight: 19, marginTop: 12 },
  button: { minHeight: 48, backgroundColor: '#16785c', alignItems: 'center', justifyContent: 'center', borderRadius: 12, marginTop: 20 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  note: { color: '#819189', fontSize: 13, lineHeight: 20, marginTop: 24 },
  link: { color: '#16785c', fontSize: 14, fontWeight: '700', marginTop: 20 },
});
