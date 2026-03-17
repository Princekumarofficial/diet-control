import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { apiFetch } from '@/src/api/client';
import { ShredColors } from '@/src/constants/theme';

type Profile = {
  id: number;
  sex: 'male' | 'female' | 'other';
  age_years: number;
  height_cm: number | null;
  body_fat_percent: number | null;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
  goal: 'cut' | 'maintain' | 'gain';
  target_deficit_kcal: number;
};

type Targets = {
  bmr_kcal: number;
  calories_burned_estimate: number;
  calorie_target_kcal: number;
  protein_target_g: number;
};

type ProfileResponse =
  | { status: 'success'; profile: Profile; targets: Targets }
  | { status: 'error'; message: string };

type BodyFatEstimateResponse =
  | { status: 'success'; body_fat_percent: number; profile: Profile }
  | { status: 'error'; message: string };

export default function ProfileModalScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);

  const [heightInput, setHeightInput] = useState('');
  const [bodyFatInput, setBodyFatInput] = useState('');
  const [ageInput, setAgeInput] = useState('22');
  const [deficitInput, setDeficitInput] = useState('400');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hydrateInputs = useCallback((p: Profile) => {
    setHeightInput(p.height_cm === null ? '' : String(p.height_cm));
    setBodyFatInput(p.body_fat_percent === null ? '' : String(p.body_fat_percent));
    setAgeInput(String(p.age_years));
    setDeficitInput(String(p.target_deficit_kcal));
  }, []);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/v1/profile/');
      const json = (await res.json()) as ProfileResponse;
      if (res.ok && json.status === 'success') {
        setProfile(json.profile);
        setTargets(json.targets);
        hydrateInputs(json.profile);
      } else {
        setError(json.status === 'error' ? json.message : 'Failed to load profile.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error.');
    } finally {
      setIsLoading(false);
    }
  }, [hydrateInputs]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const canSave = useMemo(() => !isSaving && !!profile, [isSaving, profile]);

  async function saveProfile() {
    if (!profile || isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      const ageValue = Number(ageInput);
      const heightValue = heightInput.trim() ? Number(heightInput) : null;
      const bodyFatValue = bodyFatInput.trim() ? Number(bodyFatInput) : null;
      const deficitValue = Number(deficitInput);

      if (Number.isNaN(ageValue) || ageValue < 14 || ageValue > 90) {
        setError('Age must be between 14 and 90.');
        return;
      }
      if (heightValue !== null && (Number.isNaN(heightValue) || heightValue < 120 || heightValue > 230)) {
        setError('Height must be between 120 and 230 cm.');
        return;
      }
      if (bodyFatValue !== null && (Number.isNaN(bodyFatValue) || bodyFatValue < 3 || bodyFatValue > 60)) {
        setError('Body fat must be between 3 and 60%.');
        return;
      }
      if (Number.isNaN(deficitValue) || deficitValue < 200 || deficitValue > 900) {
        setError('Deficit must be between 200 and 900 kcal.');
        return;
      }

      const payload = {
        sex: profile.sex,
        age_years: Math.round(ageValue),
        height_cm: heightValue,
        body_fat_percent: bodyFatValue,
        activity_level: profile.activity_level,
        goal: profile.goal,
        target_deficit_kcal: Math.round(deficitValue),
      };

      const res = await apiFetch('/api/v1/profile/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as ProfileResponse;
      if (res.ok && json.status === 'success') {
        setProfile(json.profile);
        setTargets(json.targets);
        hydrateInputs(json.profile);
      } else {
        setError(json.status === 'error' ? json.message : 'Failed to save profile.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error.');
    } finally {
      setIsSaving(false);
    }
  }

  async function estimateBodyFatFromImage() {
    if (isEstimating) return;

    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setError('Media library permission denied.');
      return;
    }

    const pickRes = await ImagePicker.launchImageLibraryAsync({ quality: 0.9 });
    if (pickRes.canceled) return;

    const picked = pickRes.assets[0];
    if (!picked) return;

    setIsEstimating(true);
    try {
      const uri = picked.uri;
      const name = uri.split('/').pop() ?? 'body.jpg';
      const ext = (name.split('.').pop() ?? 'jpg').toLowerCase();
      const type = ext === 'png' ? 'image/png' : 'image/jpeg';

      const form = new FormData();
      if (Platform.OS === 'web') {
        const blob = await (await fetch(uri)).blob();
        const file = new File([blob], name, { type: blob.type || type });
        form.append('image', file);
      } else {
        form.append('image', { uri, type, name } as any);
      }

      const res = await apiFetch('/api/v1/profile/estimate-body-fat/', {
        method: 'POST',
        body: form,
        headers: Platform.OS === 'web' ? {} : { Accept: 'application/json' },
      });
      const json = (await res.json()) as BodyFatEstimateResponse;

      if (res.ok && json.status === 'success') {
        setBodyFatInput(String(json.body_fat_percent));
        if (profile) {
          setProfile({ ...profile, body_fat_percent: json.body_fat_percent });
        }
      } else {
        setError(json.status === 'error' ? json.message : 'Body fat estimation failed.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error.');
    } finally {
      setIsEstimating(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: ShredColors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 20, paddingBottom: 30 }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 6 }}>Profile Setup</Text>
        <Text style={{ color: 'rgba(255,255,255,0.65)', marginBottom: 20 }}>
          We use this to compute daily burn, calorie target, and macro targets.
        </Text>

        {isLoading ? (
          <View style={{ paddingVertical: 30, alignItems: 'center' }}>
            <ActivityIndicator color={ShredColors.blue} />
          </View>
        ) : null}

        {targets ? (
          <View style={{ borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', padding: 14, marginBottom: 18 }}>
            <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 8 }}>Today&apos;s Calculated Targets</Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)' }}>Burn: {targets.calories_burned_estimate} kcal</Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)' }}>Target: {targets.calorie_target_kcal} kcal</Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)' }}>Protein: {targets.protein_target_g} g</Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)' }}>BMR: {targets.bmr_kcal} kcal</Text>
          </View>
        ) : null}

        <View style={{ gap: 10, marginBottom: 20 }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>Sex</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['male', 'female', 'other'] as const).map((sex) => {
              const active = profile?.sex === sex;
              return (
                <Pressable
                  key={sex}
                  onPress={() => profile && setProfile({ ...profile, sex })}
                  style={({ pressed }) => ({
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    backgroundColor: active ? 'rgba(10,132,255,0.24)' : 'rgba(255,255,255,0.08)',
                    opacity: pressed ? 0.75 : 1,
                  })}>
                  <Text style={{ color: active ? '#A7D4FF' : 'rgba(255,255,255,0.75)', fontWeight: '700' }}>{sex.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 10, marginBottom: 20 }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>Age (years)</Text>
          <TextInput
            value={ageInput}
            onChangeText={setAgeInput}
            keyboardType="number-pad"
            placeholder="22"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={{ borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', color: '#fff', paddingHorizontal: 12, paddingVertical: 12 }}
          />
        </View>

        <View style={{ gap: 10, marginBottom: 20 }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>Height (cm)</Text>
          <TextInput
            value={heightInput}
            onChangeText={setHeightInput}
            keyboardType="decimal-pad"
            placeholder="175"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={{ borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', color: '#fff', paddingHorizontal: 12, paddingVertical: 12 }}
          />
        </View>

        <View style={{ gap: 10, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>Body Fat (%)</Text>
            <Pressable
              onPress={estimateBodyFatFromImage}
              disabled={isEstimating}
              style={({ pressed }) => ({
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 7,
                backgroundColor: 'rgba(255,214,10,0.2)',
                opacity: pressed || isEstimating ? 0.75 : 1,
              })}>
              <Text style={{ color: '#FFE58C', fontWeight: '700', fontSize: 12 }}>{isEstimating ? 'Estimating...' : 'Auto from Photo'}</Text>
            </Pressable>
          </View>
          <TextInput
            value={bodyFatInput}
            onChangeText={setBodyFatInput}
            keyboardType="decimal-pad"
            placeholder="18"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={{ borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', color: '#fff', paddingHorizontal: 12, paddingVertical: 12 }}
          />
        </View>

        <View style={{ gap: 10, marginBottom: 20 }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>Daily Activity Level</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['sedentary', 'light', 'moderate', 'active', 'athlete'] as const).map((level) => {
              const active = profile?.activity_level === level;
              return (
                <Pressable
                  key={level}
                  onPress={() => profile && setProfile({ ...profile, activity_level: level })}
                  style={({ pressed }) => ({
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    backgroundColor: active ? 'rgba(50,215,75,0.2)' : 'rgba(255,255,255,0.08)',
                    opacity: pressed ? 0.75 : 1,
                  })}>
                  <Text style={{ color: active ? '#9AFAB0' : 'rgba(255,255,255,0.75)', fontWeight: '700', fontSize: 12 }}>
                    {level.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 10, marginBottom: 20 }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>Goal</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['cut', 'maintain', 'gain'] as const).map((goal) => {
              const active = profile?.goal === goal;
              return (
                <Pressable
                  key={goal}
                  onPress={() => profile && setProfile({ ...profile, goal })}
                  style={({ pressed }) => ({
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    backgroundColor: active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
                    opacity: pressed ? 0.75 : 1,
                  })}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{goal.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 10, marginBottom: 26 }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>Cut Deficit (kcal)</Text>
          <TextInput
            value={deficitInput}
            onChangeText={setDeficitInput}
            keyboardType="number-pad"
            placeholder="400"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={{ borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', color: '#fff', paddingHorizontal: 12, paddingVertical: 12 }}
          />
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Only used when goal is CUT.</Text>
        </View>

        {error ? (
          <View style={{ borderRadius: 12, padding: 12, marginBottom: 14, backgroundColor: 'rgba(255,69,58,0.14)' }}>
            <Text style={{ color: '#FF9A95' }}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={saveProfile}
          disabled={!canSave}
          style={({ pressed }) => ({
            borderRadius: 14,
            paddingVertical: 14,
            backgroundColor: canSave ? ShredColors.blue : 'rgba(255,255,255,0.12)',
            opacity: pressed ? 0.75 : 1,
          })}>
          <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>{isSaving ? 'Saving...' : 'Save Profile'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
