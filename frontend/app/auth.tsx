import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';

import { apiFetchPublic } from '@/src/api/client';
import { useAuth } from '@/src/context/auth';
import { ShredColors } from '@/src/constants/theme';

type AuthResponse =
  | {
      status: 'success';
      token: string;
      profile: {
        username: string;
      };
    }
  | { status: 'error'; message: string };

export default function AuthScreen() {
  const { isAuthenticated, setToken } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  async function submit() {
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required.');
      return;
    }

    if (mode === 'register' && !geminiKey.trim()) {
      setError('Gemini API key is required for registration.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const path = mode === 'register' ? '/api/v1/auth/register/' : '/api/v1/auth/login/';
      const payload: Record<string, string> = {
        username: username.trim(),
        password,
      };
      if (mode === 'register') {
        payload.email = email.trim();
        payload.gemini_api_key = geminiKey.trim();
      }

      const res = await apiFetchPublic(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as AuthResponse;
      if (res.ok && json.status === 'success') {
        setToken(json.token);
      } else {
        setError(json.status === 'error' ? json.message : 'Authentication failed.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: ShredColors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 30 }}>
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: '#fff', fontSize: 30, fontWeight: '800', marginBottom: 8 }}>Project Shred</Text>
          <Text style={{ color: 'rgba(255,255,255,0.65)' }}>Sign in to your account or create a new one.</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
          {(['login', 'register'] as const).map((m) => {
            const active = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={({ pressed }) => ({
                  flex: 1,
                  borderRadius: 12,
                  paddingVertical: 10,
                  backgroundColor: active ? 'rgba(10,132,255,0.2)' : 'rgba(255,255,255,0.08)',
                  opacity: pressed ? 0.75 : 1,
                })}>
                <Text style={{ color: active ? '#9DD1FF' : 'rgba(255,255,255,0.75)', textAlign: 'center', fontWeight: '700' }}>
                  {m.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ gap: 12, marginBottom: 16 }}>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            placeholder="Username"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={{ borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', color: '#fff', paddingHorizontal: 12, paddingVertical: 12 }}
          />

          {mode === 'register' ? (
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email (optional)"
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={{ borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', color: '#fff', paddingHorizontal: 12, paddingVertical: 12 }}
            />
          ) : null}

          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={{ borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', color: '#fff', paddingHorizontal: 12, paddingVertical: 12 }}
          />

          {mode === 'register' ? (
            <TextInput
              value={geminiKey}
              onChangeText={setGeminiKey}
              autoCapitalize="none"
              placeholder="Your Gemini API key"
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={{ borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', color: '#fff', paddingHorizontal: 12, paddingVertical: 12 }}
            />
          ) : null}
        </View>

        {error ? (
          <View style={{ borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14, backgroundColor: 'rgba(255,69,58,0.14)' }}>
            <Text style={{ color: '#FF9A95' }}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={isSubmitting}
          style={({ pressed }) => ({
            borderRadius: 14,
            paddingVertical: 14,
            backgroundColor: isSubmitting ? 'rgba(255,255,255,0.1)' : ShredColors.blue,
            opacity: pressed ? 0.8 : 1,
          })}>
          {isSubmitting ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700' }}>Please wait...</Text>
            </View>
          ) : (
            <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>{mode === 'register' ? 'Create account' : 'Sign in'}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
