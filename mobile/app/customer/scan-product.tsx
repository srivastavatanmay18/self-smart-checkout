import { useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { CustomerFlowSteps } from '@/components/CustomerFlowSteps';

function validBarcode(value: string): boolean {
  return /^\d{8,14}$/.test(value.trim());
}

export default function ScanProductScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [manualBarcode, setManualBarcode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const handled = useRef(false);

  const openProduct = (value: string) => {
    const barcode = value.trim();
    if (!validBarcode(barcode)) {
      setError('Use a barcode containing 8 to 14 digits.');
      return;
    }
    setError(null);
    router.push({ pathname: '/customer/product', params: { barcode } });
  };

  const onBarcodeScanned = ({ data }: { data: string }) => {
    if (handled.current) return;
    handled.current = true;
    setScanned(true);
    if (!validBarcode(data)) {
      setError('That scan is not a supported product barcode. Try again or enter the barcode below.');
      return;
    }
    openProduct(data);
  };

  const scanAgain = () => {
    handled.current = false;
    setScanned(false);
    setError(null);
  };

  const cameraPermissionAction = () => permission?.canAskAgain === false ? Linking.openSettings() : requestPermission();

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Customer home</Text></Pressable>
        <Text style={styles.eyebrow}>SHOPPING SESSION</Text>
        <Text style={styles.title}>Scan a product</Text>
        <Text style={styles.subtitle}>Scan a product barcode to look up its price and availability in your current shop.</Text>
        <CustomerFlowSteps activeStep="shopping" />

        {!permission ? <View style={styles.permissionCard}><Text style={styles.muted}>Checking camera permission…</Text></View> : null}
        {permission && !permission.granted ? (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>Camera access needed</Text>
            <Text style={styles.muted}>{permission.canAskAgain ? 'Allow camera access to scan EAN and UPC product barcodes. You can still enter a barcode manually.' : 'Camera access is off. Open device settings to enable scanning, or enter a barcode manually.'}</Text>
            {permission.canAskAgain === false ? <PrimaryButton title="Open Camera Settings" secondary onPress={() => void cameraPermissionAction()} /> : null}
            {permission.canAskAgain ? <PrimaryButton title="Allow Camera Access" onPress={() => void cameraPermissionAction()} /> : null}
          </View>
        ) : null}
        {permission?.granted ? (
          <View style={styles.cameraFrame}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
              onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
            />
            <View pointerEvents="none" style={styles.scanOverlay}>
              <View style={styles.scanLine} />
              <Text style={styles.cameraHint}>Align the barcode inside the frame</Text>
            </View>
          </View>
        ) : null}

        {error ? <View style={styles.errorCard}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>{scanned ? <Pressable accessibilityRole="button" onPress={scanAgain}><Text style={styles.retry}>Scan again</Text></Pressable> : null}</View> : null}

        <View style={styles.manualCard}>
          <Text style={styles.manualTitle}>Enter barcode manually</Text>
          <Text style={styles.muted}>Use this if the camera is unavailable or you are demoing from a barcode list.</Text>
          <TextInput
            accessibilityLabel="Product barcode"
            value={manualBarcode}
            onChangeText={(value) => { setManualBarcode(value.replace(/\D/g, '').slice(0, 14)); setError(null); }}
            placeholder="13-digit barcode"
            placeholderTextColor="#96a39d"
            keyboardType="number-pad"
            maxLength={14}
            style={styles.input}
          />
          <PrimaryButton title="Look Up Product" secondary disabled={!manualBarcode.trim()} onPress={() => openProduct(manualBarcode)} />
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/customer/cart')} style={styles.cartLink}><Text style={styles.cartLinkText}>View current cart</Text></Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f7f5' },
  flex: { flex: 1 },
  page: { flexGrow: 1, padding: 22, paddingTop: 16, paddingBottom: 32 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: '#426354', fontWeight: '700', fontSize: 14 },
  eyebrow: { color: '#678273', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 15 },
  title: { color: '#16352c', fontSize: 29, fontWeight: '800', marginTop: 7 },
  subtitle: { color: '#64766f', fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 17 },
  cameraFrame: { height: 270, borderRadius: 20, overflow: 'hidden', backgroundColor: '#122b23' },
  scanOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  scanLine: { width: '76%', height: 96, borderWidth: 2, borderColor: '#d7f2df', borderRadius: 12, backgroundColor: '#ffffff0a' },
  cameraHint: { color: '#fff', backgroundColor: '#10251dbd', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, fontSize: 12, fontWeight: '700', marginTop: 14, overflow: 'hidden' },
  permissionCard: { borderRadius: 20, backgroundColor: '#e9f0ec', padding: 19, alignItems: 'center' },
  permissionTitle: { color: '#234437', fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  muted: { color: '#687c72', fontSize: 13, lineHeight: 19 },
  manualCard: { borderRadius: 18, backgroundColor: '#fff', padding: 17, marginTop: 17, shadowColor: '#18382e', shadowOpacity: 0.04, shadowRadius: 10, elevation: 1 },
  manualTitle: { color: '#1d3b30', fontSize: 16, fontWeight: '800', marginBottom: 5 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#d8e2dc', borderRadius: 12, paddingHorizontal: 14, color: '#203b30', fontSize: 16, letterSpacing: 1, marginTop: 12 },
  errorCard: { borderRadius: 14, backgroundColor: '#fff0ec', padding: 14, marginTop: 13 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 19 },
  retry: { color: '#8f392d', fontWeight: '800', fontSize: 13, marginTop: 10 },
  cartLink: { alignSelf: 'center', padding: 14, marginTop: 2 },
  cartLinkText: { color: '#287254', fontSize: 14, fontWeight: '800' },
});
