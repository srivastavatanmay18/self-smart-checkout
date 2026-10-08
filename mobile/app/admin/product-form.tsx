import { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/services/api';
import { adminApi } from '@/services/admin';

type ProductForm = { name: string; barcode: string; price: string; category: string; stock: string; image: string };
const EMPTY_FORM: ProductForm = { name: '', barcode: '', price: '', category: '', stock: '', image: '' };

export default function AdminProductFormScreen() {
  const params = useLocalSearchParams<{ productId?: string | string[] }>();
  const productId = Array.isArray(params.productId) ? params.productId[0] : params.productId;
  const editing = Boolean(productId);
  const { session } = useAuth();
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProduct = useCallback(async () => {
    if (!editing || !session || !productId) return;
    try {
      const { product } = await adminApi.product(productId, session.token);
      setForm({ name: product.name, barcode: product.barcode, price: String(product.price), category: product.category, stock: String(product.stock), image: product.image ?? '' });
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not load this product.');
    } finally {
      setLoading(false);
    }
  }, [editing, productId, session]);

  useFocusEffect(useCallback(() => { void loadProduct(); }, [loadProduct]));

  const change = (key: keyof ProductForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!session) return;
    const price = Number(form.price);
    const stock = Number(form.stock);
    if (!form.name.trim() || !form.category.trim() || !/^\d{8,14}$/.test(form.barcode.trim()) || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
      setError('Enter a name, category, 8–14 digit barcode, non-negative price, and whole-number stock.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing && productId) {
        await adminApi.updateProduct(productId, {
          name: form.name.trim(), barcode: form.barcode.trim(), price,
          category: form.category.trim(), stock, image: form.image.trim() || null,
        }, session.token);
        router.replace({ pathname: '/admin/product', params: { productId } });
      } else {
        await adminApi.createProduct({
          name: form.name.trim(), barcode: form.barcode.trim(), price,
          category: form.category.trim(), stock, ...(form.image.trim() ? { image: form.image.trim() } : {}),
        }, session.token);
        router.replace('/admin/inventory');
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not save product. Check the fields and retry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  {editing ? 'Product details' : 'Inventory'}</Text></Pressable>
        <Text style={styles.eyebrow}>STORE ADMIN · INVENTORY</Text>
        <Text style={styles.title}>{editing ? 'Edit product' : 'Add product'}</Text>
        <Text style={styles.subtitle}>This product will belong to your signed-in shop.</Text>

        {loading ? <View style={styles.state}><ActivityIndicator color="#4d63ad" /><Text style={styles.muted}>Loading product…</Text></View> : null}
        {error ? <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text></View> : null}
        {!loading ? (
          <View style={styles.formCard}>
            <Field label="Product name" value={form.name} onChangeText={(value) => change('name', value)} placeholder="e.g. Fresh orange juice 1 L" />
            <Field label="Barcode / EAN" value={form.barcode} onChangeText={(value) => change('barcode', value.replace(/\D/g, '').slice(0, 14))} keyboardType="number-pad" placeholder="8 to 14 digits" />
            <Field label="Price (₹)" value={form.price} onChangeText={(value) => change('price', value)} keyboardType="decimal-pad" placeholder="0.00" />
            <Field label="Category" value={form.category} onChangeText={(value) => change('category', value)} placeholder="Beverages, Snacks…" />
            <Field label="Stock quantity" value={form.stock} onChangeText={(value) => change('stock', value.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" placeholder="0" />
            <Field label="Image URL or asset reference (optional)" value={form.image} onChangeText={(value) => change('image', value)} autoCapitalize="none" placeholder="https://… or product asset key" />
            <Text style={styles.helper}>Barcode must be unique within your shop. Product IDs and shop assignment are generated by the backend.</Text>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.saveButton, saving && styles.disabled]}><Text style={styles.saveText}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create product'}</Text></Pressable>
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} placeholderTextColor="#9aa2b0" style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f6fb' },
  flex: { flex: 1 },
  page: { flexGrow: 1, padding: 20, paddingTop: 14, paddingBottom: 34 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: '#475887', fontSize: 13, fontWeight: '800' },
  eyebrow: { color: '#6c78a0', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 12 },
  title: { color: '#263452', fontSize: 28, fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#68738c', fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 15 },
  formCard: { backgroundColor: '#fff', borderRadius: 17, padding: 16, borderWidth: 1, borderColor: '#e9ebf1' },
  field: { marginBottom: 12 },
  fieldLabel: { color: '#5f6b83', fontSize: 11, fontWeight: '800', marginBottom: 5 },
  input: { minHeight: 45, borderWidth: 1, borderColor: '#e1e5ee', borderRadius: 11, paddingHorizontal: 12, color: '#34425d', fontSize: 12 },
  helper: { color: '#828ca0', fontSize: 10, lineHeight: 15, marginTop: 1, marginBottom: 12 },
  saveButton: { minHeight: 49, justifyContent: 'center', alignItems: 'center', backgroundColor: '#4d63ad', borderRadius: 12, marginTop: 3 },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  muted: { color: '#7c879b', fontSize: 12 },
  error: { backgroundColor: '#fff0ec', borderRadius: 14, padding: 14, marginBottom: 12 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 19 },
});
