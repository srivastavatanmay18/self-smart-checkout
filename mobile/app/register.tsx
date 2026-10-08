import { useState } from 'react';
import { Link, Redirect, router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthField } from '@/components/AuthField';
import { AuthLoading } from '@/components/AuthLoading';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/services/api';

export default function RegisterScreen() {
  const { isLoading: sessionLoading, session, register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sessionLoading) return <AuthLoading />;
  if (session) return <Redirect href="/customer" />;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await register(name.trim(), email.trim(), password);
      router.replace('/customer');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not connect to the registration service. Check that the API is running.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Text style={styles.kicker}>CUSTOMER ACCOUNT</Text>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Customer registration is open. Staff access is issued by the store.</Text>
          <AuthField label="Full name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" autoComplete="name" textContentType="name" />
          <AuthField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
          <AuthField label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <PrimaryButton title="Create customer account" onPress={() => void submit()} loading={submitting} disabled={name.trim().length < 2 || !email.trim() || password.length < 8} />
          <Link href="/login" style={styles.link}>Already have an account? Sign in</Link>
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
  title: { color: '#16352c', fontSize: 32, fontWeight: '800', marginTop: 12 },
  subtitle: { color: '#64766f', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 14 },
  error: { color: '#a84f3b', fontSize: 13, lineHeight: 19, marginTop: 14 },
  link: { alignSelf: 'center', color: '#16785c', fontSize: 14, fontWeight: '700', marginTop: 20 },
});
