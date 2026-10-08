import { useState } from 'react';
import { Link, Redirect, router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthField } from '@/components/AuthField';
import { AuthLoading } from '@/components/AuthLoading';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/auth/AuthContext';
import { portalPath } from '@/auth/routes';
import { ApiError } from '@/services/api';

export default function LoginScreen() {
  const { isLoading: sessionLoading, session, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sessionLoading) return <AuthLoading />;
  if (session) return <Redirect href={portalPath(session.user.role)} />;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const authenticatedSession = await login(email.trim(), password);
      router.replace(portalPath(authenticatedSession.user.role));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Sign-in could not be completed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Text style={styles.kicker}>SELF SMART CHECKOUT</Text>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your secure account. We’ll open your workspace automatically.</Text>

          <View style={styles.card}>
            <AuthField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
            <AuthField label="Password" value={password} onChangeText={setPassword} placeholder="Enter your password" secureTextEntry autoCapitalize="none" autoComplete="password" textContentType="password" />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <PrimaryButton title="Log in" onPress={() => void submit()} loading={submitting} disabled={!email.trim() || !password} />

            <Link href="/register" style={styles.link}>New here? Create a customer account</Link>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f7f5' },
  flex: { flex: 1 },
  page: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 38 },
  kicker: { color: '#16785c', fontSize: 12, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#16352c', fontSize: 34, fontWeight: '800', marginTop: 12 },
  subtitle: { color: '#64766f', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 22 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, shadowColor: '#18382e', shadowOpacity: 0.07, shadowRadius: 16, elevation: 3 },
  error: { color: '#a84f3b', fontSize: 13, lineHeight: 19, marginTop: 14 },
  link: { alignSelf: 'center', color: '#16785c', fontSize: 14, fontWeight: '700', marginTop: 18 },
});
