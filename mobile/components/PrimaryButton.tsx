import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

type Props = { title: string; onPress: () => void; loading?: boolean; disabled?: boolean; secondary?: boolean };

export function PrimaryButton({ title, onPress, loading = false, disabled = false, secondary = false }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.secondary, (disabled || loading) && styles.disabled, pressed && !disabled && !loading && styles.pressed]}
    >
      {loading ? <ActivityIndicator color={secondary ? '#16785c' : '#fff'} /> : <Text style={[styles.text, secondary && styles.secondaryText]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 52, paddingHorizontal: 18, borderRadius: 13, backgroundColor: '#16785c', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  secondary: { backgroundColor: '#e8f2ed', borderWidth: 1, borderColor: '#d2e5da' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82 },
  text: { color: '#fff', fontSize: 15, fontWeight: '800' },
  secondaryText: { color: '#16785c' },
});
