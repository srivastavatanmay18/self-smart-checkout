import { useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { CustomerFlowSteps } from '@/components/CustomerFlowSteps';
import { parseShopQrData } from '@/utils/shopQr';

export default function ScanShopScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const handled = useRef(false);

  const onBarcodeScanned = ({ data }: { data: string }) => {
    if (handled.current) return;
    handled.current = true;
    setScanned(true);
    const token = parseShopQrData(data);
    if (!token) {
      setScanMessage('This is not a valid Self Smart Checkout Shop QR. Try scanning the permanent code again.');
      return;
    }
    router.push({ pathname: '/customer/verify-shop', params: { token } });
  };

  const scanAgain = () => {
    handled.current = false;
    setScanned(false);
    setScanMessage(null);
  };

  const cameraPermissionAction = () => permission?.canAskAgain === false ? Linking.openSettings() : requestPermission();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Customer home</Text></Pressable>
        <Text style={styles.step}>STEP 1 OF 2</Text>
        <Text style={styles.title}>Scan Shop QR</Text>
        <Text style={styles.subtitle}>Point your camera at the supermarket’s permanent Shop QR to identify it.</Text>
        <CustomerFlowSteps activeStep="shop" />

        {!permission ? <View style={styles.cameraPlaceholder}><Text style={styles.placeholderText}>Checking camera permission…</Text></View> : null}
        {permission && !permission.granted ? (
          <View style={styles.cameraPlaceholder}>
            <Text style={styles.cameraTitle}>Camera access needed</Text>
            <Text style={styles.placeholderText}>{permission.canAskAgain ? 'Allow camera access to scan the permanent Shop QR.' : 'Camera access is off. Open your device settings to allow scanning.'}</Text>
            <PrimaryButton title={permission.canAskAgain ? 'Allow Camera Access' : 'Open Camera Settings'} onPress={() => void cameraPermissionAction()} />
          </View>
        ) : null}
        {permission?.granted ? (
          <View style={styles.cameraFrame}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
            />
            <View pointerEvents="none" style={styles.viewfinder}><View style={styles.cornerTopLeft} /><View style={styles.cornerTopRight} /><View style={styles.cornerBottomLeft} /><View style={styles.cornerBottomRight} /></View>
          </View>
        ) : null}

        {scanMessage ? (
          <View style={styles.errorBox}>
            <Text accessibilityRole="alert" style={styles.errorText}>{scanMessage}</Text>
            <Pressable accessibilityRole="button" onPress={scanAgain}><Text style={styles.retry}>Scan another code</Text></Pressable>
          </View>
        ) : null}
        <Text style={styles.help}>The code contains a random shop reference. Shop details are verified securely with the backend.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f7f5' },
  page: { flexGrow: 1, padding: 22, paddingTop: 16, paddingBottom: 28 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: '#426354', fontWeight: '700', fontSize: 14 },
  step: { color: '#678273', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 16 },
  title: { color: '#16352c', fontSize: 29, fontWeight: '800', marginTop: 7 },
  subtitle: { color: '#64766f', fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 20 },
  cameraFrame: { height: 320, borderRadius: 22, overflow: 'hidden', backgroundColor: '#122b23' },
  viewfinder: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  cornerTopLeft: { position: 'absolute', left: '17%', top: '23%', width: 36, height: 36, borderLeftWidth: 4, borderTopWidth: 4, borderColor: '#d5f0dc', borderTopLeftRadius: 8 },
  cornerTopRight: { position: 'absolute', right: '17%', top: '23%', width: 36, height: 36, borderRightWidth: 4, borderTopWidth: 4, borderColor: '#d5f0dc', borderTopRightRadius: 8 },
  cornerBottomLeft: { position: 'absolute', left: '17%', bottom: '23%', width: 36, height: 36, borderLeftWidth: 4, borderBottomWidth: 4, borderColor: '#d5f0dc', borderBottomLeftRadius: 8 },
  cornerBottomRight: { position: 'absolute', right: '17%', bottom: '23%', width: 36, height: 36, borderRightWidth: 4, borderBottomWidth: 4, borderColor: '#d5f0dc', borderBottomRightRadius: 8 },
  cameraPlaceholder: { minHeight: 230, borderRadius: 22, backgroundColor: '#e9f0ec', alignItems: 'center', justifyContent: 'center', padding: 24 },
  cameraTitle: { color: '#234437', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  placeholderText: { color: '#687c72', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  errorBox: { backgroundColor: '#fff0ec', borderRadius: 14, padding: 14, marginTop: 14 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 19 },
  retry: { color: '#8f392d', fontWeight: '800', fontSize: 13, marginTop: 10 },
  help: { color: '#809088', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 17 },
});
