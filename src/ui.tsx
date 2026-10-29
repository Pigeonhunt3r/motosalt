import { colors, u } from "./theme";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type { TextInputProps } from "react-native";
import Icon from "./components/Icon";

export function Card({
  children,
  tint = false,
}: {
  children: ReactNode;
  tint?: boolean;
}) {
  return (
    <View style={[u.card, tint && { backgroundColor: "#edf2df" }]}>
      {children}
    </View>
  );
}
export function Title({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={u.title}>
      {children}
    </Text>
  );
}
export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={u.heading}>
      {children}
    </Text>
  );
}
export function Body({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <Text style={[u.body, muted && { color: colors.muted }]}>{children}</Text>
  );
}
export function Hint({ children }: { children: ReactNode }) {
  return <Text style={u.hint}>{children}</Text>;
}
export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={u.eyebrow}>{children}</Text>;
}
export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      style={({ pressed }) => [
        u.button,
        secondary && u.secondary,
        (pressed || disabled || busy) && { opacity: 0.55 },
      ]}
    >
      <Text style={[u.buttonText, secondary && { color: colors.ink }]}>
        {label}
      </Text>
      {busy ? (
        <ActivityIndicator color={secondary ? colors.ink : colors.green} />
      ) : (
        <Icon
          name="arrow"
          size={20}
          color={secondary ? colors.ink : colors.green}
        />
      )}
    </Pressable>
  );
}
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[u.chip, selected && u.chipSelected]}
    >
      <Text style={[u.chipText, selected && { color: colors.paper }]}>
        {label}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6, flexGrow: 1 }}>
      <Text style={u.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#8c9583"
        {...props}
        style={[
          u.input,
          props.multiline && { minHeight: 85, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={u.toggle}>
      <Text style={[u.body, { flex: 1 }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "#cfd8c3", true: "#6e8856" }}
        thumbColor={colors.paper}
      />
    </View>
  );
}
export function Page({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      contentContainerStyle={u.page}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {children}
    </ScrollView>
  );
}
export function Badge({
  label,
  warning = false,
}: {
  label: string;
  warning?: boolean;
}) {
  return (
    <View style={[u.badge, warning && { backgroundColor: "#f5e6dc" }]}>
      <Text style={[u.badgeText, warning && { color: colors.danger }]}>
        {label}
      </Text>
    </View>
  );
}
