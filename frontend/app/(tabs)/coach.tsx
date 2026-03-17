import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';

import { apiFetch } from '@/src/api/client';
import { ShredColors } from '@/src/constants/theme';

type CoachMsg = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type CoachHistoryResponse =
  | {
      status: 'success';
      messages: { id: number; role: 'user' | 'assistant'; content: string; created_at: string }[];
    }
  | { status: 'error'; message: string };

type CoachChatResponse =
  | { status: 'success'; reply: string }
  | { status: 'error'; message: string };

function renderInlineMarkdown(text: string, baseColor: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    const isBold = /^\*\*[^*]+\*\*$/.test(part);
    const clean = isBold ? part.slice(2, -2) : part;
    return (
      <Text key={`${clean}-${idx}`} style={{ color: baseColor, fontWeight: isBold ? '800' : '400' }}>
        {clean}
      </Text>
    );
  });
}

function renderCoachMessageContent(text: string, isUser: boolean) {
  const color = '#fff';
  const lines = (text || '').split('\n');

  return (
    <View style={{ gap: 4 }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        const bulletLine = /^[-*]\s+/.test(trimmed);
        const orderedLine = /^\d+\.\s+/.test(trimmed);
        const content = trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');

        if (!isUser && (bulletLine || orderedLine)) {
          return (
            <View key={`${line}-${idx}`} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Text style={{ color, marginRight: 6 }}>{orderedLine ? `${trimmed.match(/^\d+/)?.[0]}.` : '•'}</Text>
              <Text style={{ color, flex: 1, lineHeight: 20 }}>{renderInlineMarkdown(content, color)}</Text>
            </View>
          );
        }

        return (
          <Text key={`${line}-${idx}`} style={{ color, lineHeight: 20 }}>
            {renderInlineMarkdown(line, color)}
          </Text>
        );
      })}
    </View>
  );
}

const QUICK_PROMPTS = [
  'Review my diet today and give me 3 fixes.',
  'I am sore and tired. What workout should I do?',
  'Make a plan to hit protein target by tonight.',
  'How do I recover after a high-sodium meal?',
];

export default function CoachScreen() {
  const headerHeight = useHeaderHeight();
  const [messages, setMessages] = useState<CoachMsg[]>([]);
  const [input, setInput] = useState('');
  const [showSuggestedPrompts, setShowSuggestedPrompts] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<CoachMsg>>(null);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
  }, []);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiFetch('/api/v1/coach/history/?limit=40');
      const json = (await res.json()) as CoachHistoryResponse;

      if (res.ok && json.status === 'success') {
        setMessages(
          json.messages.map((m) => ({
            id: String(m.id),
            role: m.role,
            content: m.content,
          }))
        );
      } else {
        setError(json.status === 'error' ? json.message : 'Failed to load coach history.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error.');
    } finally {
      setIsLoading(false);
      scrollToEnd();
    }
  }, [scrollToEnd]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function sendMessage(text: string) {
    const message = text.trim();
    if (!message || isSending) return;

    setIsSending(true);
    setError(null);

    const userMsg: CoachMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    scrollToEnd();

    try {
      const res = await apiFetch('/api/v1/coach/chat/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const json = (await res.json()) as CoachChatResponse;

      if (res.ok && json.status === 'success') {
        const assistantMsg: CoachMsg = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: json.reply,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        scrollToEnd();
      } else {
        setError(json.status === 'error' ? json.message : 'Coach request failed.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: ShredColors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight + (Platform.OS === 'ios' ? 8 : 0)}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
        <Text style={{ color: 'rgba(255,255,255,0.65)' }}>
          Personalized guidance using your meals, recovery, weight, and habits.
        </Text>
      </View>

      {error ? (
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: 'rgba(255,69,58,0.35)',
            backgroundColor: 'rgba(255,69,58,0.12)',
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}>
          <Text style={{ color: '#FF8D88' }}>{error}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={ShredColors.blue} size="large" />
          <Text style={{ color: 'rgba(255,255,255,0.6)', marginTop: 10 }}>Loading coach chat...</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 14, gap: 10 }}
          renderItem={({ item }) => {
            const isUser = item.role === 'user';
            return (
              <View style={{ alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                <View
                  style={{
                    maxWidth: '90%',
                    borderRadius: 16,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: isUser ? 'rgba(10,132,255,0.23)' : 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    borderColor: isUser ? 'rgba(10,132,255,0.4)' : 'rgba(255,255,255,0.1)',
                  }}>
                  {renderCoachMessageContent(item.content, isUser)}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View
              style={{
                backgroundColor: ShredColors.card,
                marginTop: 24,
                borderRadius: 18,
                padding: 18,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
              }}>
              <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}>Start with a quick prompt</Text>
              <Text style={{ color: 'rgba(255,255,255,0.65)' }}>Your coach uses your tracked data to personalize responses.</Text>
            </View>
          }
        />
      )}

      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        <View style={{ marginBottom: 10 }}>
          <Pressable
            onPress={() => setShowSuggestedPrompts((prev) => !prev)}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              borderRadius: 12,
              backgroundColor: 'rgba(255,255,255,0.08)',
              paddingHorizontal: 10,
              paddingVertical: 7,
              opacity: pressed ? 0.75 : 1,
              marginBottom: showSuggestedPrompts ? 8 : 0,
            })}>
            <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '700' }}>
              {showSuggestedPrompts ? 'Hide Suggestions' : 'Show Suggestions'}
            </Text>
          </Pressable>

          {showSuggestedPrompts ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {QUICK_PROMPTS.map((prompt) => (
                <Pressable
                  key={prompt}
                  onPress={() => sendMessage(prompt)}
                  disabled={isSending}
                  style={({ pressed }) => ({
                    borderRadius: 12,
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    opacity: pressed || isSending ? 0.75 : 1,
                  })}>
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{prompt}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 8,
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: 8,
            marginBottom: 16,
          }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask your coach anything..."
            placeholderTextColor="rgba(255,255,255,0.45)"
            multiline
            style={{ flex: 1, color: '#fff', maxHeight: 100, paddingHorizontal: 6, paddingVertical: 4 }}
          />
          <Pressable
            onPress={() => sendMessage(input)}
            disabled={isSending || !input.trim()}
            style={({ pressed }) => ({
              borderRadius: 12,
              backgroundColor: isSending || !input.trim() ? 'rgba(255,255,255,0.12)' : ShredColors.blue,
              paddingHorizontal: 14,
              paddingVertical: 10,
              opacity: pressed ? 0.75 : 1,
            })}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{isSending ? '...' : 'Send'}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
