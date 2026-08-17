import { useEffect, useState } from "react"
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native"
import { useRouter } from "expo-router"
import { useAuth } from "../lib/auth"
import { colors, fonts, radius } from "../theme/tokens"
import PrimaryButton from "../components/PrimaryButton"

// Port of frontend/src/app/login/page.tsx: centered card with email +
// password, inline error, link to register.

const fieldStyle = {
  backgroundColor: colors["surface-2"],
  borderWidth: 1,
  borderColor: colors["edge-strong"],
  borderRadius: radius.field,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontFamily: fonts.sans,
  fontSize: 15,
  color: colors.ink,
} as const

export default function LoginScreen() {
  const { user, loading, login } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Redirect already-authenticated users away from this form immediately.
  useEffect(() => {
    if (!loading && user) router.replace("/")
  }, [user, loading, router])

  async function handleSubmit() {
    setError("")
    setSubmitting(true)
    try {
      await login(email, password)
      router.replace("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.")
    } finally {
      setSubmitting(false)
    }
  }

  // Render nothing while loading or redirecting to avoid a flash.
  if (loading || user) return null

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors["surface-0"] }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}>
        <View
          style={{
            backgroundColor: colors["surface-1"],
            borderWidth: 1,
            borderColor: colors.edge,
            borderRadius: radius.card,
            paddingHorizontal: 24,
            paddingVertical: 32,
          }}
        >
          <Text
            style={{ fontFamily: fonts.serifMedium, fontSize: 24, color: colors.ink, marginBottom: 4 }}
          >
            Sign in
          </Text>
          <Text
            style={{ fontFamily: fonts.sans, fontSize: 14, color: colors["ink-muted"], marginBottom: 24 }}
          >
            Welcome back to Plexive
          </Text>

          <View style={{ gap: 16 }}>
            <TextInput
              placeholder="Email"
              placeholderTextColor={colors["ink-muted"]}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={fieldStyle}
            />
            <TextInput
              placeholder="Password"
              placeholderTextColor={colors["ink-muted"]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={fieldStyle}
            />
            {error !== "" && (
              <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.bad }}>
                {error}
              </Text>
            )}
            <PrimaryButton
              label={submitting ? "Signing in..." : "Sign in"}
              onPress={handleSubmit}
              disabled={submitting}
            />
          </View>

          <Text
            style={{
              fontFamily: fonts.sans,
              fontSize: 14,
              color: colors["ink-muted"],
              textAlign: "center",
              marginTop: 24,
            }}
          >
            Don&apos;t have an account?{" "}
            <Text style={{ color: colors.lamp }} onPress={() => router.replace("/register")}>
              Register
            </Text>
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
