import { ScrollView, StyleSheet, Text, View } from 'react-native';

export type CustomerFlowStep = 'shop' | 'shopping' | 'cart' | 'checkout' | 'payment' | 'exit';

const STEPS: { id: CustomerFlowStep; label: string }[] = [
  { id: 'shop', label: 'SCAN SHOP' },
  { id: 'shopping', label: 'SHOPPING' },
  { id: 'cart', label: 'CART' },
  { id: 'checkout', label: 'CHECKOUT' },
  { id: 'payment', label: 'PAYMENT' },
  { id: 'exit', label: 'EXIT PASS' },
];

export function CustomerFlowSteps({ activeStep }: { activeStep: CustomerFlowStep }) {
  const activeIndex = STEPS.findIndex((step) => step.id === activeStep);
  return (
    <View style={styles.card}>
      <Text style={styles.label}>YOUR SHOPPING JOURNEY</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.steps} accessibilityLabel="Customer shopping progress">
        {STEPS.map((step, index) => {
          const complete = index < activeIndex;
          const current = index === activeIndex;
          return (
            <View key={step.id} style={styles.step} accessibilityLabel={`${step.label}${current ? ', current step' : complete ? ', complete' : ''}`}>
              <View style={styles.markerRow}>
                <View style={[styles.marker, complete && styles.completeMarker, current && styles.currentMarker]}>
                  <Text style={[styles.markerText, (complete || current) && styles.activeMarkerText]}>{complete ? '✓' : String(index + 1)}</Text>
                </View>
                {index < STEPS.length - 1 ? <View style={[styles.connector, complete && styles.completeConnector]} /> : null}
              </View>
              <Text style={[styles.stepLabel, current && styles.currentLabel]}>{step.label}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 13, paddingHorizontal: 12, marginBottom: 15, borderWidth: 1, borderColor: '#e5ece7' },
  label: { color: '#84938c', fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginBottom: 11 },
  steps: { paddingRight: 8 },
  step: { width: 68 },
  markerRow: { flexDirection: 'row', alignItems: 'center' },
  marker: { width: 25, height: 25, borderRadius: 13, borderWidth: 1, borderColor: '#d9e3dc', backgroundColor: '#f7faf8', alignItems: 'center', justifyContent: 'center' },
  completeMarker: { borderColor: '#287653', backgroundColor: '#287653' },
  currentMarker: { borderWidth: 2, borderColor: '#16785c', backgroundColor: '#e8f2ed' },
  markerText: { color: '#84938c', fontSize: 10, fontWeight: '900' },
  activeMarkerText: { color: '#16785c' },
  connector: { height: 2, width: 39, backgroundColor: '#e4ebe6' },
  completeConnector: { backgroundColor: '#7eb497' },
  stepLabel: { color: '#84938c', fontSize: 8, fontWeight: '800', marginTop: 6, letterSpacing: 0.2 },
  currentLabel: { color: '#176447' },
});
