import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { authApi } from '@/services/auth';
import type { UserRole } from '@/services/auth';

type Props = { role: UserRole; title: string; description: string; accent: string };

export function PortalHomeScreen({ role, title, description, accent }: Props) {
  const { session, logout } = useAuth();
  const [apiStatus, setApiStatus] = useState('Checking protected API access…');
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let active = true;
    authApi.checkPortal(session.token, role)
      .then((result) => { if (active) setApiStatus(`Protected ${result.portal} access confirmed`); })
      .catch(() => { if (active) setApiStatus('Portal is open; the backend could not be reached.'); });
    return () => { active = false; };
  }, [role, session]);

  const signOut = async () => {
    setLogoutError(null);
    try {
      await logout();
    } catch {
      setLogoutError('Signed out on this device. The server could not be reached to revoke the token.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.brand}>SELF SMART CHECKOUT</Text>
        <View style={[styles.roleBadge, { backgroundColor: `${accent}18` }]}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={[styles.roleText, { color: accent }]}>{role.replace('_', ' ')}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{description}</Text>

        <View style={styles.card}>
          <Text style={styles.welcome}>Welcome, {session?.user.name ?? 'there'}</Text>
          <Text style={styles.email}>{session?.user.email}</Text>
          <View style={styles.divider} />
          <Text style={styles.accessLabel}>ACCESS STATUS</Text>
          <Text style={styles.accessValue}>{apiStatus}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Your account</Text>
          <Text style={styles.body}>You are signed in with {role === 'SALESMAN' ? 'store administrator' : role.toLowerCase()} permissions. Other role portals are protected by the API.</Text>
          {session?.user.shopId ? <Text style={styles.body}>Store ID: {session.user.shopId}</Text> : null}
        </View>

        {role === 'SALESMAN' ? (
          <Link href="/admin/shop-qr" asChild>
            <Pressable accessibilityRole="button" style={styles.shopQrAction}>
              <View style={styles.shopQrIcon}><Text style={styles.shopQrIconText}>⌗</Text></View>
              <View style={styles.shopQrCopy}>
                <Text style={styles.shopQrTitle}>Permanent Shop QR</Text>
                <Text style={styles.shopQrDescription}>View and display the store identification code</Text>
              </View>
              <Text style={styles.shopQrChevron}>›</Text>
            </Pressable>
          </Link>
        ) : null}

        {role === 'GUARD' ? (
          <Link href="/guard/scan-exit" asChild>
            <Pressable accessibilityRole="button" style={styles.shopQrAction}>
              <View style={styles.guardScanIcon}><Text style={styles.shopQrIconText}>⌗</Text></View>
              <View style={styles.shopQrCopy}>
                <Text style={styles.shopQrTitle}>Scan Exit QR</Text>
                <Text style={styles.shopQrDescription}>Review a paid order and approve its exit</Text>
              </View>
              <Text style={styles.shopQrChevron}>›</Text>
            </Pressable>
          </Link>
        ) : null}

        {logoutError ? <Text accessibilityRole="alert" style={styles.error}>{logoutError}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.logout}>
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
        <Link href="/foundation" style={styles.foundation}>Local service status</Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f7f5' },
  page: { flexGrow: 1, padding: 24, paddingTop: 40 },
  brand: { color: '#16785c', fontWeight: '900', letterSpacing: 1.3, fontSize: 12 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12, marginTop: 28 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  roleText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  title: { color: '#16352c', fontSize: 32, fontWeight: '800', marginTop: 14 },
  subtitle: { color: '#64766f', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 22 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, marginBottom: 14, shadowColor: '#18382e', shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  shopQrAction: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 15, marginBottom: 12, borderWidth: 1, borderColor: '#e1e5f0' },
  shopQrIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#eef1fb', alignItems: 'center', justifyContent: 'center' },
  shopQrIconText: { color: '#4d63ad', fontSize: 26, fontWeight: '600' },
  guardScanIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#fff2dc', alignItems: 'center', justifyContent: 'center' },
  shopQrCopy: { flex: 1, marginLeft: 12 },
  shopQrTitle: { color: '#34466f', fontSize: 14, fontWeight: '800' },
  shopQrDescription: { color: '#7b859a', fontSize: 12, marginTop: 4 },
  shopQrChevron: { color: '#6576a7', fontSize: 25, marginLeft: 8 },
  welcome: { color: '#1c362e', fontSize: 18, fontWeight: '800' },
  email: { color: '#718179', fontSize: 14, marginTop: 4 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e2ebe5', marginVertical: 16 },
  accessLabel: { color: '#84938c', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  accessValue: { color: '#247454', fontSize: 14, fontWeight: '700', marginTop: 6 },
  sectionTitle: { color: '#1c362e', fontSize: 16, fontWeight: '800', marginBottom: 8 },
  body: { color: '#64766f', fontSize: 14, lineHeight: 21 },
  error: { color: '#a84f3b', fontSize: 13, lineHeight: 19, marginVertical: 8 },
  logout: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: '#d6e3dc', backgroundColor: '#fff', marginTop: 8 },
  logoutText: { color: '#34574a', fontSize: 15, fontWeight: '800' },
  foundation: { alignSelf: 'center', color: '#819189', fontSize: 13, fontWeight: '600', marginTop: 18, padding: 8 },
});
