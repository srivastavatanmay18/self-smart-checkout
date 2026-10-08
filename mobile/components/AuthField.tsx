import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

type Props = TextInputProps & { label: string };

export function AuthField({ label, style, ...props }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
      style={[styles.input, style]}
      accessibilityLabel={props.accessibilityLabel ?? label}
      placeholderTextColor="#95a49d"
        autoCorrect={false}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7, marginTop: 15 },
  label: { color: '#42584f', fontSize: 13, fontWeight: '700' },
  input: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: '#dce6e0', backgroundColor: '#fbfdfc', paddingHorizontal: 14, color: '#18372d', fontSize: 15 },
});
