import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export function AuthLoading() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#16785c" />
      <Text style={styles.text}>Restoring your secure session…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f5', alignItems: 'center', justifyContent: 'center', gap: 14 },
  text: { color: '#64766f', fontSize: 14 },
});
