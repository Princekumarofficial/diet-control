import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useHeaderHeight } from '@react-navigation/elements';

import { apiFetch } from '@/src/api/client';

type AnalyzeResponse =
  | {
      status: 'success';
      meal: {
        id: number;
        calories: number;
        protein_g: number;
        carbs_g: number;
        fats_g: number;
        meal_summary: string;
        is_high_sodium: boolean;
        is_high_sugar: boolean;
      };
      daily_log: {
        total_daily_calories: number;
        total_daily_protein: number;
        total_daily_carbs: number;
        total_daily_fats: number;
      };
      targets: {
        calorie_target_kcal: number;
        protein_target_g: number;
        carbs_target_g: number;
        fats_target_g: number;
      };
    }
  | { status: 'error'; message: string };

export default function LogMealScreen() {
  const headerHeight = useHeaderHeight();
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const calorieTarget = result?.status === 'success' ? result.targets.calorie_target_kcal : 1800;
  const proteinTarget = result?.status === 'success' ? result.targets.protein_target_g : 100;
  const carbsTarget = result?.status === 'success' ? result.targets.carbs_target_g : 220;
  const fatsTarget = result?.status === 'success' ? result.targets.fats_target_g : 60;

  const canAnalyze = useMemo(() => (Boolean(image) || Boolean(notes.trim())) && !isLoading, [image, notes, isLoading]);

  function reset() {
    setImage(null);
    setNotes('');
    setError(null);
    setResult(null);
  }

  async function pickImage(fromCamera: boolean) {
    setError(null);
    setResult(null);

    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setError('Camera permission denied.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('Media library permission denied.');
        return;
      }
    }

    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.85 });

    if (res.canceled) return;
    setImage(res.assets[0] ?? null);
  }

  async function analyze() {
    if (!image && !notes.trim()) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();

      if (image) {
        const uri = image.uri;
        const name = uri.split('/').pop() ?? 'meal.jpg';
        const ext = (name.split('.').pop() ?? 'jpg').toLowerCase();
        const type = ext === 'png' ? 'image/png' : 'image/jpeg';

        if (Platform.OS === 'web') {
          const blob = await (await fetch(uri)).blob();
          const file = new File([blob], name, { type: blob.type || type });
          form.append('image', file);
        } else {
          form.append('image', {
            uri,
            type,
            name,
          } as any);
        }
      }

      form.append('raw_input_text', notes || '');
      form.append('user_notes', notes || '');

      console.log(`[DEBUG] Sending meal analysis request. HasImage: ${Boolean(image)}, Notes: ${notes || '(empty)'}`);

      const res = await apiFetch('/api/v1/meals/analyze/', {
        method: 'POST',
        body: form,
        headers: Platform.OS === 'web' ? {} : { 'Accept': 'application/json' },
      });

      console.log(`[DEBUG] Response status: ${res.status}`);

      const json = (await res.json()) as AnalyzeResponse;
      console.log(`[DEBUG] Response JSON:`, json);
      
      // Only set result and clear error if status is actually success AND HTTP 200
      if (res.ok && json.status === 'success') {
        setResult(json);
        setError(null);
      } else {
        // API returned an error
        const errorMsg = json.status === 'error' ? json.message : `Request failed (${res.status})`;
        setError(errorMsg);
        setResult(null);
      }
    } catch (e: any) {
      const errorMsg = e?.message ?? 'Unexpected error.';
      setError(errorMsg);
      setResult(null);
      console.error('[ERROR] Meal analysis error:', e);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#000000' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight + (Platform.OS === 'ios' ? 8 : 0)}>
      <ScrollView style={{ flex: 1, backgroundColor: '#000000' }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ marginBottom: 32 }}>
          <Text style={{ color: '#ffffff', fontSize: 32, fontWeight: '800', marginBottom: 8 }}>
            📸 Log Meal
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>Snap your thali or type your meal to track macros</Text>
        </View>

        {!result || result.status !== 'success' ? (
          <>
            {/* Image Selection */}
            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <Pressable
                  onPress={() => pickImage(true)}
                  disabled={isLoading}
                  style={({ pressed }) => ({
                    flex: 1,
                    backgroundColor: 'rgba(10, 132, 255, 0.15)',
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    paddingVertical: 20,
                    opacity: pressed ? 0.75 : 1,
                  })}>
                  <Text style={{ color: '#66B2FF', fontWeight: '600', textAlign: 'center', fontSize: 16 }}>📷 Camera</Text>
                </Pressable>
                <Pressable
                  onPress={() => pickImage(false)}
                  disabled={isLoading}
                  style={({ pressed }) => ({
                    flex: 1,
                    backgroundColor: 'rgba(10, 132, 255, 0.15)',
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    paddingVertical: 20,
                    opacity: pressed ? 0.75 : 1,
                  })}>
                  <Text style={{ color: '#66B2FF', fontWeight: '600', textAlign: 'center', fontSize: 16 }}>🖼️ Gallery</Text>
                </Pressable>
              </View>

              {image ? (
                <View>
                  <View style={{ borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                    <Image source={{ uri: image.uri }} style={{ width: '100%', height: 280 }} resizeMode="cover" />
                  </View>
                  <Pressable
                    onPress={() => setImage(null)}
                    disabled={isLoading}
                    style={({ pressed }) => ({
                      marginTop: 10,
                      borderRadius: 12,
                      paddingVertical: 10,
                      backgroundColor: 'rgba(255,69,58,0.16)',
                      opacity: pressed ? 0.75 : 1,
                    })}>
                    <Text style={{ color: '#FF9A95', fontWeight: '700', textAlign: 'center' }}>Remove Photo</Text>
                  </Pressable>
                </View>
              ) : (
                <View
                  style={{
                    borderRadius: 20,
                    borderWidth: 2,
                    borderStyle: 'dashed',
                    borderColor: 'rgba(255,255,255,0.2)',
                    paddingHorizontal: 24,
                    paddingVertical: 48,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text style={{ fontSize: 48, marginBottom: 12 }}>🍽️</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontSize: 14 }}>
                    Tap camera/gallery or type meal details below
                  </Text>
                </View>
              )}
            </View>

            {/* Notes Section */}
            <View
              style={{
                marginBottom: 24,
                borderRadius: 16,
                backgroundColor: '#1C1C1E',
                paddingHorizontal: 20,
                paddingVertical: 16,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.05)',
              }}>
              <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 16, marginBottom: 4 }}>✏️ Add Notes</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 12 }}>
                e.g., "Also had a whey shake", "Extra salt"
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Type anything to help with analysis..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={{
                  color: '#ffffff',
                  fontSize: 16,
                  minHeight: 44,
                  paddingHorizontal: 0,
                }}
                editable={!isLoading}
                multiline
              />
            </View>

            {/* Analyze Button */}
            <Pressable
              onPress={analyze}
              disabled={!canAnalyze}
              style={({ pressed }) => ({
                borderRadius: 16,
                paddingHorizontal: 24,
                paddingVertical: 16,
                marginBottom: 16,
                backgroundColor: canAnalyze ? '#0A84FF' : 'rgba(255,255,255,0.08)',
                transform: pressed && canAnalyze ? [{ scale: 0.95 }] : [{ scale: 1 }],
              })}>
              {isLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <ActivityIndicator color="white" size="small" />
                  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16 }}>Analyzing...</Text>
                </View>
              ) : (
                <Text
                  style={{
                    color: canAnalyze ? '#ffffff' : 'rgba(255,255,255,0.3)',
                    fontWeight: '700',
                    textAlign: 'center',
                    fontSize: 16,
                  }}>
                  🔍 Analyze Meal
                </Text>
              )}
            </Pressable>

            {/* Error Message */}
            {error && !result ? (
              <View
                style={{
                  borderRadius: 16,
                  paddingHorizontal: 20,
                  paddingVertical: 16,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(255,69,58,0.3)',
                  backgroundColor: 'rgba(255,69,58,0.1)',
                }}>
                <Text style={{ color: '#FF726F', fontWeight: '600', marginBottom: 8 }}>⚠️ Error</Text>
                <Text style={{ color: 'rgba(255,118,115,0.8)', fontSize: 14 }}>{error}</Text>
              </View>
            ) : null}
          </>
        ) : (
          // SUCCESS STATE
          <View>
            {/* Success Header */}
            <View style={{ marginBottom: 24, alignItems: 'center', paddingVertical: 16 }}>
              <Text style={{ fontSize: 48, marginBottom: 8 }}>✅</Text>
              <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '800' }}>Meal Logged!</Text>
              <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, marginTop: 6, textAlign: 'center' }}>
                {result.meal.meal_summary}
              </Text>
            </View>

            {/* Meal Card */}
            <View style={{ borderRadius: 24, marginBottom: 24, paddingHorizontal: 24, paddingVertical: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(50, 215, 75, 0.1)' }}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', marginBottom: 16 }}>THIS MEAL</Text>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
                <View style={{ flex: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 20, backgroundColor: 'rgba(10, 132, 255, 0.15)' }}>
                  <Text style={{ color: '#66B2FF', fontSize: 11, fontWeight: '700', marginBottom: 8 }}>CALORIES</Text>
                  <Text style={{ color: '#B3D9FF', fontSize: 32, fontWeight: '800' }}>{result.meal.calories}</Text>
                </View>
                <View style={{ flex: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 20, backgroundColor: 'rgba(50, 215, 75, 0.15)' }}>
                  <Text style={{ color: '#66E880', fontSize: 11, fontWeight: '700', marginBottom: 8 }}>PROTEIN</Text>
                  <Text style={{ color: '#B3FF99', fontSize: 32, fontWeight: '800' }}>{result.meal.protein_g}g</Text>
                </View>
                <View style={{ flex: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 20, backgroundColor: 'rgba(255, 214, 10, 0.15)' }}>
                  <Text style={{ color: '#FFD84D', fontSize: 11, fontWeight: '700', marginBottom: 8 }}>CARBS</Text>
                  <Text style={{ color: '#FFE58C', fontSize: 32, fontWeight: '800' }}>{result.meal.carbs_g}g</Text>
                </View>
                <View style={{ flex: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 20, backgroundColor: 'rgba(255, 159, 10, 0.18)' }}>
                  <Text style={{ color: '#FFD3A4', fontSize: 11, fontWeight: '700', marginBottom: 8 }}>FATS</Text>
                  <Text style={{ color: '#FFE1BF', fontSize: 32, fontWeight: '800' }}>{result.meal.fats_g}g</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {result.meal.is_high_sodium && (
                  <View style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(255, 69, 58, 0.2)' }}>
                    <Text style={{ color: '#FF9999', fontWeight: '600', fontSize: 12 }}>⚠️ High Sodium</Text>
                  </View>
                )}
                {result.meal.is_high_sugar && (
                  <View style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(255, 69, 58, 0.2)' }}>
                    <Text style={{ color: '#FF9999', fontWeight: '600', fontSize: 12 }}>⚠️ High Sugar</Text>
                  </View>
                )}
                {!result.meal.is_high_sodium && !result.meal.is_high_sugar && (
                  <View style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(50, 215, 75, 0.2)' }}>
                    <Text style={{ color: '#99FF99', fontWeight: '600', fontSize: 12 }}>✅ Healthy Choice</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Daily Totals */}
            <View style={{ borderRadius: 24, backgroundColor: '#1C1C1E', paddingHorizontal: 24, paddingVertical: 24, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', marginBottom: 16 }}>TODAY'S TOTAL</Text>

              <View style={{ gap: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Calories</Text>
                  <View>
                    <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '800' }}>{result.daily_log.total_daily_calories}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'right' }}>/ {calorieTarget} kcal</Text>
                  </View>
                </View>

                <View style={{ height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  <View
                    style={{
                      width: `${Math.min((result.daily_log.total_daily_calories / calorieTarget) * 100, 100)}%`,
                      height: '100%',
                      backgroundColor: result.daily_log.total_daily_calories > calorieTarget ? '#FF453A' : '#0A84FF',
                    }}
                  />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Protein</Text>
                  <View>
                    <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '800' }}>{result.daily_log.total_daily_protein}g</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'right' }}>/ {proteinTarget}g</Text>
                  </View>
                </View>

                <View style={{ height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  <View
                    style={{
                      width: `${Math.min((result.daily_log.total_daily_protein / proteinTarget) * 100, 100)}%`,
                      height: '100%',
                      backgroundColor: result.daily_log.total_daily_protein >= proteinTarget ? '#32D74B' : '#0A84FF',
                    }}
                  />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Carbs</Text>
                  <View>
                    <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '800' }}>{result.daily_log.total_daily_carbs}g</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'right' }}>/ {carbsTarget}g</Text>
                  </View>
                </View>

                <View style={{ height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  <View
                    style={{
                      width: `${Math.min((result.daily_log.total_daily_carbs / carbsTarget) * 100, 100)}%`,
                      height: '100%',
                      backgroundColor: result.daily_log.total_daily_carbs > carbsTarget ? '#FF453A' : '#FFD60A',
                    }}
                  />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Fats</Text>
                  <View>
                    <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '800' }}>{result.daily_log.total_daily_fats}g</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'right' }}>/ {fatsTarget}g</Text>
                  </View>
                </View>

                <View style={{ height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  <View
                    style={{
                      width: `${Math.min((result.daily_log.total_daily_fats / fatsTarget) * 100, 100)}%`,
                      height: '100%',
                      backgroundColor: result.daily_log.total_daily_fats > fatsTarget ? '#FF453A' : '#FF9F0A',
                    }}
                  />
                </View>
              </View>
            </View>

            {/* Action Button */}
            <View style={{ gap: 12, marginBottom: 16 }}>
              <Pressable
                onPress={reset}
                style={({ pressed }) => ({
                  borderRadius: 16,
                  paddingHorizontal: 24,
                  paddingVertical: 16,
                  backgroundColor: 'rgba(10, 132, 255, 0.15)',
                  opacity: pressed ? 0.75 : 1,
                })}>
                <Text style={{ color: '#66B2FF', fontWeight: '700', textAlign: 'center', fontSize: 16 }}>➕ Log Another Meal</Text>
              </Pressable>
            </View>
          </View>
        )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
