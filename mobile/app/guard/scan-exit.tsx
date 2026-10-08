import { useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ApiError } from '@/services/api';
import { exitPassApi, type GuardExitReview } from '@/services/exitPasses';
import { formatRupees } from '@/utils/money';
import { productImageSource } from '@/utils/productImages';
import { statusLabel } from '@/utils/statusLabels';
import { StatusPill } from '@/components/StatusPill';

function isExitToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value.trim());
}

export default function GuardScanExitScreen() {
  const { session } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [manualToken, setManualToken] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [review, setReview] = useState<GuardExitReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [recordingCheck, setRecordingCheck] = useState(false);
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [showReasonEntry, setShowReasonEntry] = useState(false);
  const [checkReason, setCheckReason] = useState('');
  const [checkRecordedOnCurrentScan, setCheckRecordedOnCurrentScan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  const verifyToken = async (value: string) => {
    const normalized = value.trim();
    if (!isExitToken(normalized)) {
      setError("That QR is not a supported Exit Pass. Scan a customer's Exit QR or enter its token.");
      return;
    }
    if (!session) {
      setError('Sign in with a guard account to verify Exit Passes.');
      return;
    }
    setToken(normalized);
    setCheckRecordedOnCurrentScan(false);
    setShowReasonEntry(false);
    setLoading(true);
    setError(null);
    try {
      setReview(await exitPassApi.verifyForGuard(normalized, session.token));
    } catch (requestError) {
      setReview(null);
      setError(requestError instanceof ApiError ? requestError.message : 'Could not verify this Exit Pass. Check the connection and try again.');
      handled.current = false;
    } finally {
      setLoading(false);
    }
  };

  const recordCheckRequired = async () => {
    if (!session || !token || !review?.exitPass.canApprove || recordingCheck) return;
    const reason = checkReason.trim();
    if (reason.length < 3) {
      setError('Add a short reason so the transaction stays available for follow-up inspection.');
      return;
    }
    setRecordingCheck(true);
    setError(null);
    try {
      setReview(await exitPassApi.markCheckRequired(token, reason, session.token));
      setShowReasonEntry(false);
      setCheckRecordedOnCurrentScan(true);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not record the inspection status. Retry or scan again.');
    } finally {
      setRecordingCheck(false);
    }
  };

  const approve = async () => {
    if (!session || !token || !review?.exitPass.canApprove || approving) return;
    setApproving(true);
    setError(null);
    try {
      setReview(await exitPassApi.approveForGuard(token, session.token));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not approve this exit. Scan the pass again and retry.');
      if (requestError instanceof ApiError && requestError.status === 409) {
        try {
          setReview(await exitPassApi.verifyForGuard(token, session.token));
        } catch {
          // Keep the approval error visible if the follow-up verification also fails.
        }
      }
    } finally {
      setApproving(false);
    }
  };

  const confirmApproval = () => {
    setConfirmingApproval(true);
    Alert.alert(
      'Approve this exit?',
      'Confirm only after you have physically compared the customer’s items with the complete paid cart shown here. This action uses the pass and completes the session.',
      [
        { text: 'Continue checking', style: 'cancel', onPress: () => setConfirmingApproval(false) },
        { text: 'Approve exit', onPress: () => { setConfirmingApproval(false); void approve(); } },
      ],
      { cancelable: true, onDismiss: () => setConfirmingApproval(false) },
    );
  };

  const cameraPermissionAction = () => permission?.canAskAgain === false ? Linking.openSettings() : requestPermission();

  const scanAnother = () => {
    handled.current = false;
    setToken(null);
    setReview(null);
    setManualToken('');
    setCheckReason('');
    setShowReasonEntry(false);
    setCheckRecordedOnCurrentScan(false);
    setError(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Guard dashboard</Text></Pressable>
        <Text style={styles.eyebrow}>GUARD · EXIT CONTROL</Text>
        <Text style={styles.title}>Scan Exit QR</Text>
        <Text style={styles.subtitle}>Compare the displayed paid order with the items in the customer’s bags. The guard performs this physical check.</Text>

        {!review && !error && !loading ? (
          <>
            {!permission ? <View style={styles.infoCard}><Text style={styles.muted}>Checking camera permission…</Text></View> : null}
            {permission && !permission.granted ? (
              <View style={styles.infoCard}>
                <Text style={styles.cardTitle}>Camera access needed</Text>
                <Text style={styles.muted}>{permission.canAskAgain ? 'Allow camera access to scan a customer’s one-time Exit QR. You can also enter the token manually.' : 'Camera access is off. Open device settings to enable scanning, or enter the token manually.'}</Text>
                {permission.canAskAgain === false ? <PrimaryButton title="Open Camera Settings" secondary onPress={() => void cameraPermissionAction()} /> : null}
                {permission.canAskAgain ? <PrimaryButton title="Allow Camera Access" onPress={() => void cameraPermissionAction()} /> : null}
              </View>
            ) : null}
            {permission?.granted ? (
              <View style={styles.cameraFrame}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => {
                    if (handled.current) return;
                    handled.current = true;
                    void verifyToken(data);
                  }}
                />
                <View pointerEvents="none" style={styles.scanOverlay}>
                  <View style={styles.scanSquare} />
                  <Text style={styles.cameraHint}>Align the Exit QR inside the frame</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.manualCard}>
              <Text style={styles.cardTitle}>Enter Exit token manually</Text>
              <Text style={styles.muted}>Use this if the guard camera is unavailable.</Text>
              <TextInput
                accessibilityLabel="Exit pass token"
                value={manualToken}
                onChangeText={(value) => setManualToken(value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 43))}
                placeholder="43-character token"
                placeholderTextColor="#96a39d"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <PrimaryButton title="Verify Exit Pass" secondary disabled={manualToken.length !== 43} onPress={() => { handled.current = true; void verifyToken(manualToken); }} />
            </View>
          </>
        ) : null}

        {loading ? <View style={styles.stateCard}><ActivityIndicator color="#9b6a16" /><Text style={styles.muted}>Checking token, payment, shop, and expiry…</Text></View> : null}
        {error ? (
          <View style={styles.errorCard}>
            <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={scanAnother} style={styles.inlineAction}><Text style={styles.inlineActionText}>Scan another QR</Text></Pressable>
          </View>
        ) : null}

        {review ? (
          <>
            <View style={[styles.resultBanner, review.approved && styles.approvedBanner, !review.exitPass.canApprove && !review.approved && styles.blockedBanner]}>
              <Text style={styles.resultTitle}>{review.approved ? 'Exit approved' : review.exitPass.status === 'CHECK_REQUIRED' ? 'Manual item inspection required' : review.exitPass.canApprove ? 'Paid order ready for comparison' : 'Exit cannot be approved'}</Text>
              <Text style={styles.resultBody}>{review.approved ? 'This Exit Pass is now used and the shopping session is complete.' : review.exitPass.checkRequiredReason ?? review.exitPass.blockedReason ?? 'Compare each displayed item with the customer’s bags before choosing an action.'}</Text>
            </View>

            <View style={[styles.aiCard, review.aiVerification?.status === 'CHECK_REQUIRED' && styles.aiRiskCard]}>
              <View style={styles.aiHeadingRow}>
                <Text style={styles.aiTitle}>AI VERIFICATION</Text>
                {review.aiVerification ? <StatusPill status={review.aiVerification.status} /> : <StatusPill status="UNAVAILABLE" />}
              </View>
              <Text style={styles.aiScore}>Anomaly Score: {review.aiVerification ? `${review.aiVerification.anomalyScore}/100` : '—'}</Text>
              <Text style={styles.aiExplanation}>Transparent transaction rules · decision support only. This result uses order data; it does not see or inspect physical bags. Compare the displayed items in person regardless of the result.</Text>
              {review.aiVerification?.reasons.length ? review.aiVerification.reasons.map((reason, index) => (
                <Text key={`${index}-${reason}`} style={styles.aiReason}>• {reason}</Text>
              )) : (
                <Text style={styles.aiNoReasons}>{review.aiVerification ? 'No unusual transaction inconsistencies were found by these rules.' : 'No paid-order verification is available. Continue with the manual transaction checks.'}</Text>
              )}
              {review.aiVerification?.createdAt ? <Text style={styles.aiMeta}>Assessed {new Date(review.aiVerification.createdAt).toLocaleString()} · {review.aiVerification.engineVersion}</Text> : null}
            </View>

            <View style={styles.detailsCard}>
              <Text style={styles.sectionTitle}>VERIFY ITEMS BEFORE APPROVING EXIT</Text>
              <Text style={styles.manualCheckNote}>Physically compare the customer’s items with this paid order. The app does not visually inspect bags.</Text>
              <Detail label="Customer reference" value={review.transaction.customerReference} />
              <Detail label="Order ID" value={review.transaction.orderId} />
              <Detail label="Shop" value={`${review.transaction.shop.name} · ${review.transaction.shop.shopId}`} />
              <Detail label="Total number of items" value={String(review.transaction.totalItemCount)} />
              <Detail label="Payment status" value={statusLabel(review.transaction.paymentStatus)} />
              <Detail label="Exit pass status" value={statusLabel(review.exitPass.status)} />
              <Detail label="Purchase time" value={review.transaction.purchasedAt ? new Date(review.transaction.purchasedAt).toLocaleString() : 'Not available'} />
              <View style={styles.itemDivider} />
              {review.transaction.items.map((item) => (
                <View key={item.productId} style={styles.itemRow}>
                  <Image accessibilityLabel={`${item.name} product image`} source={productImageSource(item.image, item.productId)} resizeMode="cover" style={styles.productImage} />
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>{item.category}</Text>
                    <Text style={styles.itemMeta}>Quantity · {item.quantity}</Text>
                    <Text style={styles.itemMeta}>Price per item · {formatRupees(item.unitPrice)}</Text>
                    <Text style={styles.itemSubtotal}>Item subtotal · {formatRupees(item.subtotal)}</Text>
                  </View>
                </View>
              ))}
              <View style={styles.itemDivider} />
              <View style={styles.amountRow}><Text style={styles.totalLabel}>Total amount paid</Text><Text style={styles.total}>{formatRupees(review.transaction.totalAmount)}</Text></View>
            </View>

            {review.exitPass.checkRequiredReason ? (
              <View style={styles.checkRecordCard}>
                <Text style={styles.checkRecordTitle}>CHECK REQUIRED · FOLLOW-UP INSPECTION</Text>
                <Text style={styles.checkRecordText}>{review.exitPass.checkRequiredReason}</Text>
                {review.exitPass.checkRequiredAt ? <Text style={styles.checkRecordMeta}>Recorded {new Date(review.exitPass.checkRequiredAt).toLocaleString()}</Text> : null}
                {checkRecordedOnCurrentScan ? <Text style={styles.checkRecordText}>Session remains ready for exit. Inspect the items in person, then rescan the QR to continue.</Text> : null}
              </View>
            ) : null}

        {review.exitPass.canApprove && !review.approved && !checkRecordedOnCurrentScan ? (
              <>
                <Pressable accessibilityRole="button" accessibilityLabel="Items verified, approve exit" accessibilityHint="Completes this shopping session after a confirmation prompt." accessibilityState={{ disabled: approving || recordingCheck || confirmingApproval, busy: approving }} disabled={approving || recordingCheck || confirmingApproval} onPress={confirmApproval} style={[styles.approveButton, (approving || recordingCheck || confirmingApproval) && styles.disabled]}>
                  <Text style={styles.approveText}>{approving ? 'Approving exit…' : 'ITEMS VERIFIED — APPROVE EXIT'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Mismatch or check required" accessibilityHint="Opens a reason field before recording a manual inspection requirement." disabled={approving || recordingCheck || confirmingApproval} onPress={() => { setShowReasonEntry(true); setError(null); }} style={[styles.checkButton, (approving || recordingCheck || confirmingApproval) && styles.disabled]}>
                  <Text style={styles.checkButtonText}>MISMATCH / CHECK REQUIRED</Text>
                </Pressable>
                {showReasonEntry ? (
                  <View style={styles.reasonCard}>
                    <Text style={styles.cardTitle}>Record a manual inspection reason</Text>
                    <TextInput
                      accessibilityLabel="Check required reason"
                      value={checkReason}
                      onChangeText={setCheckReason}
                      placeholder="Describe the mismatch or item needing a closer check"
                      placeholderTextColor="#938679"
                      multiline
                      maxLength={500}
                      style={styles.reasonInput}
                    />
                    <Pressable accessibilityRole="button" disabled={recordingCheck || checkReason.trim().length < 3} onPress={() => void recordCheckRequired()} style={[styles.recordButton, (recordingCheck || checkReason.trim().length < 3) && styles.disabled]}>
                      <Text style={styles.recordButtonText}>{recordingCheck ? 'Recording check…' : 'Record CHECK REQUIRED'}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : null}
            {checkRecordedOnCurrentScan ? <Pressable accessibilityRole="button" onPress={scanAnother} style={styles.scanAnother}><Text style={styles.scanAnotherText}>RESCAN AFTER PHYSICAL INSPECTION</Text></Pressable> : null}
            {!checkRecordedOnCurrentScan ? <Pressable accessibilityRole="button" onPress={scanAnother} style={styles.scanAnother}><Text style={styles.scanAnotherText}>Scan another Exit QR</Text></Pressable> : null}
          </>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f6f8' },
  flex: { flex: 1 },
  page: { flexGrow: 1, padding: 22, paddingTop: 15, paddingBottom: 36 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: '#67512d', fontWeight: '800', fontSize: 14 },
  eyebrow: { color: '#9a732e', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 15 },
  title: { color: '#2c2d31', fontSize: 30, fontWeight: '900', marginTop: 7 },
  subtitle: { color: '#777980', fontSize: 14, lineHeight: 21, marginTop: 6, marginBottom: 18 },
  cameraFrame: { height: 285, borderRadius: 20, overflow: 'hidden', backgroundColor: '#211e18' },
  scanOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  scanSquare: { width: 205, height: 205, borderWidth: 2, borderColor: '#fff0cb', borderRadius: 22, backgroundColor: '#ffffff08' },
  cameraHint: { color: '#fff', backgroundColor: '#211e18c9', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, fontSize: 12, fontWeight: '700', marginTop: 14, overflow: 'hidden' },
  infoCard: { borderRadius: 18, backgroundColor: '#fff', padding: 18, marginBottom: 14 },
  manualCard: { borderRadius: 18, backgroundColor: '#fff', padding: 17, marginTop: 15 },
  cardTitle: { color: '#34343a', fontSize: 16, fontWeight: '900', marginBottom: 5 },
  muted: { color: '#74777d', fontSize: 13, lineHeight: 19 },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#e1dfda', borderRadius: 12, paddingHorizontal: 13, color: '#292a2e', fontSize: 14, marginTop: 12, letterSpacing: 0.6 },
  stateCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  errorCard: { borderRadius: 16, backgroundColor: '#fff0ec', padding: 16 },
  errorText: { color: '#963e30', fontSize: 13, lineHeight: 20 },
  inlineAction: { alignSelf: 'flex-start', paddingVertical: 10 },
  inlineActionText: { color: '#863d31', fontSize: 13, fontWeight: '900' },
  resultBanner: { backgroundColor: '#eaf2f8', borderRadius: 17, padding: 17, marginBottom: 12 },
  approvedBanner: { backgroundColor: '#e8f4eb' },
  blockedBanner: { backgroundColor: '#fff0ec' },
  resultTitle: { color: '#263848', fontSize: 18, fontWeight: '900' },
  resultBody: { color: '#647481', fontSize: 13, lineHeight: 19, marginTop: 5 },
  aiCard: { backgroundColor: '#f0f5fb', borderWidth: 1, borderColor: '#d9e5f0', borderRadius: 18, padding: 16, marginBottom: 12 },
  aiRiskCard: { backgroundColor: '#fff6e8', borderColor: '#f0d5a7' },
  aiHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  aiTitle: { color: '#354757', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  aiScore: { color: '#253a4c', fontSize: 17, fontWeight: '900', marginTop: 10 },
  aiExplanation: { color: '#607283', fontSize: 12, lineHeight: 18, marginTop: 6 },
  aiReason: { color: '#72521e', fontSize: 12, lineHeight: 18, marginTop: 7 },
  aiNoReasons: { color: '#506b5c', fontSize: 12, lineHeight: 18, marginTop: 7 },
  aiMeta: { color: '#7a8792', fontSize: 10, marginTop: 9 },
  detailsCard: { backgroundColor: '#fff', borderRadius: 18, padding: 17 },
  sectionTitle: { color: '#34343a', fontSize: 16, fontWeight: '900', marginBottom: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
  detailLabel: { color: '#777980', fontSize: 12 },
  detailValue: { color: '#34343a', fontSize: 12, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  manualCheckNote: { color: '#776b58', fontSize: 12, lineHeight: 18, marginTop: -2, marginBottom: 9 },
  itemDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e6e7e7', marginVertical: 10 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 8 },
  productImage: { width: 78, height: 78, borderRadius: 13, backgroundColor: '#edf2ee' },
  itemCopy: { flex: 1 },
  itemName: { color: '#3a3b3e', fontSize: 13, fontWeight: '800' },
  itemMeta: { color: '#81838a', fontSize: 11, marginTop: 3 },
  itemSubtotal: { color: '#3b5b44', fontSize: 13, fontWeight: '900' },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: '#38393e', fontSize: 14, fontWeight: '900' },
  total: { color: '#315e43', fontSize: 18, fontWeight: '900' },
  approveButton: { minHeight: 58, justifyContent: 'center', alignItems: 'center', backgroundColor: '#176b47', borderRadius: 14, marginTop: 15, borderWidth: 2, borderColor: '#0d5738', paddingHorizontal: 12 },
  approveText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  checkButton: { minHeight: 54, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff4e3', borderWidth: 2, borderColor: '#d99b39', borderRadius: 14, marginTop: 10, paddingHorizontal: 12 },
  checkButtonText: { color: '#75470c', fontSize: 14, fontWeight: '900', textAlign: 'center', paddingHorizontal: 12 },
  reasonCard: { borderRadius: 17, backgroundColor: '#fff', padding: 16, marginTop: 11 },
  reasonInput: { minHeight: 82, borderWidth: 1, borderColor: '#e4d7c7', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: '#3c3933', fontSize: 13, textAlignVertical: 'top', marginTop: 7 },
  recordButton: { minHeight: 47, justifyContent: 'center', alignItems: 'center', backgroundColor: '#b9852c', borderRadius: 12, marginTop: 10 },
  recordButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  checkRecordCard: { borderRadius: 16, backgroundColor: '#fff5e2', padding: 15, marginTop: 12 },
  checkRecordTitle: { color: '#8a6117', fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  checkRecordText: { color: '#655840', fontSize: 13, lineHeight: 19, marginTop: 5 },
  checkRecordMeta: { color: '#84765f', fontSize: 11, marginTop: 8 },
  disabled: { opacity: 0.55 },
  scanAnother: { alignSelf: 'center', padding: 15, marginTop: 3 },
  scanAnotherText: { color: '#776138', fontSize: 13, fontWeight: '900' },
});
