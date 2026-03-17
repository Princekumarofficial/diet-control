import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Slider from '@react-native-community/slider';

import { apiFetch } from '@/src/api/client';
import { ShredColors } from '@/src/constants/theme';

type DailyLog = {
  date: string;
  steps_count: number;
  hours_seated: number;
  apt_correctives_done: boolean;
  water_ml: number;
  is_rest_day: boolean;
  planned_workout: string;
  soreness_profile: Record<string, number>;
  whey_scoops: number;
  creatine_g: number;
  took_multivitamin: boolean;
  took_fish_oil: boolean;
};

type DashboardResponse =
  | { status: 'success'; daily_log: DailyLog }
  | { status: 'error'; message: string };

export default function RecoveryScreen() {
  const [dailyLog, setDailyLog] = useState<DailyLog | null>(null);
  const [soreness, setSoreness] = useState<Record<string, number>>({ chest: 0, back: 0, legs: 0 });
  const [steps, setSteps] = useState('');
  const [waterMl, setWaterMl] = useState(0);
  const [isRestDay, setIsRestDay] = useState(false);
  const [plannedWorkout, setPlannedWorkout] = useState('');
  const [aptDone, setAptDone] = useState(false);
  const [wheyScoops, setWheyScoops] = useState(0);
  const [creatineG, setCreatineG] = useState(0);
  const [tookMultivitamin, setTookMultivitamin] = useState(false);
  const [tookFishOil, setTookFishOil] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDailyLog() {
      setIsLoading(true);
      setError(null);

      try {
        const res = await apiFetch('/api/v1/dashboard/today/');
        const json = (await res.json()) as DashboardResponse;

        if (!isMounted) return;

        if (res.ok && json.status === 'success') {
          setDailyLog(json.daily_log);
          setSoreness({ chest: 0, back: 0, legs: 0, ...json.daily_log.soreness_profile });
          setSteps(String(json.daily_log.steps_count || ''));
          setWaterMl(Number(json.daily_log.water_ml || 0));
          setIsRestDay(Boolean(json.daily_log.is_rest_day));
          setPlannedWorkout(json.daily_log.planned_workout || '');
          setAptDone(Boolean(json.daily_log.apt_correctives_done));
          setWheyScoops(Number(json.daily_log.whey_scoops || 0));
          setCreatineG(Number(json.daily_log.creatine_g || 0));
          setTookMultivitamin(Boolean(json.daily_log.took_multivitamin));
          setTookFishOil(Boolean(json.daily_log.took_fish_oil));
        } else {
          setError(json.status === 'error' ? json.message : 'Failed to load recovery data.');
        }
      } catch (e: any) {
        if (!isMounted) return;
        setError(e?.message ?? 'Unexpected error.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadDailyLog();
    return () => {
      isMounted = false;
    };
  }, []);

  const sorenessMax = useMemo(() => Math.max(soreness.chest || 0, soreness.back || 0, soreness.legs || 0), [soreness]);

  const recoverySuggestion = useMemo(() => {
    if (sorenessMax >= 8) {
      return 'High soreness detected. Consider a rest day or mobility-focused session.';
    }

    if (sorenessMax >= 6) {
      return 'Moderate soreness. Swap heavy lifts for lighter volume or accessories.';
    }

    return 'You are clear to train. Keep form strict and monitor fatigue.';
  }, [sorenessMax]);

  function updateSoreness(key: 'chest' | 'back' | 'legs', value: number) {
    setSoreness((prev) => ({ ...prev, [key]: value }));
  }

  function sorenessLabel(value: number) {
    if (value >= 8) return 'High';
    if (value >= 5) return 'Medium';
    if (value >= 1) return 'Low';
    return 'Unrated';
  }

  function applyRecoveryPlan() {
    if (sorenessMax >= 8) {
      setIsRestDay(true);
      setPlannedWorkout('Mobility + Stretching');
    } else if (sorenessMax >= 6) {
      setIsRestDay(false);
      setPlannedWorkout('Light Accessories + Core');
    } else {
      setIsRestDay(false);
      if (!plannedWorkout) {
        setPlannedWorkout('Normal Training');
      }
    }
  }

  async function saveRecovery() {
    if (!dailyLog) return;

    setIsSaving(true);
    setError(null);

    try {
      const payload = {
        soreness_profile: soreness,
        steps_count: Number(steps || 0),
        water_ml: waterMl,
        is_rest_day: isRestDay,
        planned_workout: plannedWorkout,
        apt_correctives_done: aptDone,
        whey_scoops: wheyScoops,
        creatine_g: creatineG,
        took_multivitamin: tookMultivitamin,
        took_fish_oil: tookFishOil,
      };

      const res = await apiFetch(`/api/v1/daily-log/${dailyLog.date}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as DashboardResponse;

      if (res.ok && json.status === 'success') {
        setDailyLog(json.daily_log);
      } else {
        setError(json.status === 'error' ? json.message : 'Failed to save recovery data.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: ShredColors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }}>
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: '#ffffff', fontSize: 28, fontWeight: '800', marginBottom: 6 }}>Gym & Recovery</Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
            Log soreness, lock your workout, and save your arms.
          </Text>
        </View>

        {isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator size="large" color={ShredColors.blue} />
            <Text style={{ color: 'rgba(255,255,255,0.6)', marginTop: 12 }}>Loading recovery...</Text>
          </View>
        ) : null}

        {error && !isLoading ? (
          <View
            style={{
              borderRadius: 16,
              paddingHorizontal: 20,
              paddingVertical: 16,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: 'rgba(255,69,58,0.3)',
              backgroundColor: 'rgba(255,69,58,0.1)',
            }}>
            <Text style={{ color: '#FF726F', fontWeight: '600', marginBottom: 6 }}>⚠️ Recovery Error</Text>
            <Text style={{ color: 'rgba(255,118,115,0.8)', fontSize: 14 }}>{error}</Text>
          </View>
        ) : null}

        {!isLoading ? (
          <>
            <View style={{ backgroundColor: ShredColors.card, borderRadius: 20, padding: 16, marginBottom: 20 }}>
              <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 6 }}>Today's Snapshot</Text>
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginBottom: 12 }}>{recoverySuggestion}</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, borderRadius: 14, padding: 12, backgroundColor: 'rgba(10, 132, 255, 0.12)' }}>
                  <Text style={{ color: '#66B2FF', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>MAX SORENESS</Text>
                  <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '800' }}>{sorenessMax}/10</Text>
                </View>
                <View style={{ flex: 1, borderRadius: 14, padding: 12, backgroundColor: 'rgba(50, 215, 75, 0.12)' }}>
                  <Text style={{ color: '#8CF5A5', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>REST DAY</Text>
                  <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '800' }}>{isRestDay ? 'Yes' : 'No'}</Text>
                </View>
              </View>
            </View>

            <View style={{ backgroundColor: ShredColors.card, borderRadius: 20, padding: 16, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>Soreness Check</Text>
                <Pressable
                  onPress={applyRecoveryPlan}
                  style={({ pressed }) => ({
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    backgroundColor: 'rgba(10, 132, 255, 0.15)',
                    opacity: pressed ? 0.7 : 1,
                  })}>
                  <Text style={{ color: '#66B2FF', fontWeight: '700', fontSize: 12 }}>Auto Plan</Text>
                </Pressable>
              </View>

              {(['chest', 'back', 'legs'] as const).map((group) => (
                <View key={group} style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                      {group.charAt(0).toUpperCase() + group.slice(1)}
                    </Text>
                    <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>
                      {soreness[group] || 0}/10 · {sorenessLabel(soreness[group] || 0)}
                    </Text>
                  </View>
                  <Slider
                    value={soreness[group] || 0}
                    onValueChange={(value) => updateSoreness(group, Math.round(value))}
                    minimumValue={0}
                    maximumValue={10}
                    step={1}
                    minimumTrackTintColor={ShredColors.blue}
                    maximumTrackTintColor="rgba(255,255,255,0.2)"
                    thumbTintColor={ShredColors.blue}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>0</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>10</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={{ backgroundColor: ShredColors.card, borderRadius: 20, padding: 16, marginBottom: 20 }}>
              <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 10 }}>Workout Plan</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ color: 'rgba(255,255,255,0.7)' }}>Rest Day</Text>
                <Pressable
                  onPress={() => setIsRestDay((prev) => !prev)}
                  style={({ pressed }) => ({
                    width: 54,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: isRestDay ? ShredColors.green : 'rgba(255,255,255,0.1)',
                    paddingHorizontal: 4,
                    justifyContent: 'center',
                    opacity: pressed ? 0.8 : 1,
                  })}>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: '#ffffff',
                      alignSelf: isRestDay ? 'flex-end' : 'flex-start',
                    }}
                  />
                </Pressable>
              </View>
              <TextInput
                value={plannedWorkout}
                onChangeText={setPlannedWorkout}
                placeholder="Planned workout (e.g., Arms + Core)"
                placeholderTextColor="rgba(255,255,255,0.4)"
                style={{
                  borderRadius: 12,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: '#ffffff',
                }}
              />
            </View>

            <View style={{ backgroundColor: ShredColors.card, borderRadius: 20, padding: 16, marginBottom: 20 }}>
              <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Steps Today</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 10 }}>
                Use quick targets or type your steps.
              </Text>
              <TextInput
                value={steps}
                onChangeText={setSteps}
                keyboardType="numeric"
                placeholder="Enter steps"
                placeholderTextColor="rgba(255,255,255,0.4)"
                style={{
                  borderRadius: 12,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: '#ffffff',
                  marginBottom: 12,
                }}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[8000, 10000].map((value) => (
                  <Pressable
                    key={`steps-${value}`}
                    onPress={() => setSteps(String(value))}
                    style={({ pressed }) => ({
                      flex: 1,
                      borderRadius: 14,
                      paddingVertical: 12,
                      backgroundColor: 'rgba(10, 132, 255, 0.12)',
                      opacity: pressed ? 0.7 : 1,
                    })}>
                    <Text style={{ color: '#66B2FF', fontWeight: '700', textAlign: 'center' }}>{value} steps</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ backgroundColor: ShredColors.card, borderRadius: 20, padding: 16, marginBottom: 20 }}>
              <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Water Intake</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 10 }}>
                Daily target: 3000 ml ({(waterMl / 1000).toFixed(1)}L)
              </Text>

              <View style={{ marginBottom: 12 }}>
                <View style={{ height: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  <View
                    style={{
                      width: `${Math.min((waterMl / 3000) * 100, 100)}%`,
                      height: '100%',
                      backgroundColor: waterMl >= 3000 ? ShredColors.green : ShredColors.blue,
                    }}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                {[250, 500, 1000].map((value) => (
                  <Pressable
                    key={`water-${value}`}
                    onPress={() => setWaterMl((prev) => Math.max(0, prev + value))}
                    style={({ pressed }) => ({
                      flex: 1,
                      borderRadius: 14,
                      paddingVertical: 12,
                      backgroundColor: 'rgba(10, 132, 255, 0.12)',
                      opacity: pressed ? 0.75 : 1,
                    })}>
                    <Text style={{ color: '#66B2FF', textAlign: 'center', fontWeight: '700' }}>+{value} ml</Text>
                  </Pressable>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => setWaterMl((prev) => Math.max(0, prev - 250))}
                  style={({ pressed }) => ({
                    flex: 1,
                    borderRadius: 14,
                    paddingVertical: 12,
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    opacity: pressed ? 0.75 : 1,
                  })}>
                  <Text style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontWeight: '700' }}>-250 ml</Text>
                </Pressable>

                <Pressable
                  onPress={() => setWaterMl(0)}
                  style={({ pressed }) => ({
                    flex: 1,
                    borderRadius: 14,
                    paddingVertical: 12,
                    backgroundColor: 'rgba(255,69,58,0.16)',
                    opacity: pressed ? 0.75 : 1,
                  })}>
                  <Text style={{ color: '#FF9A95', textAlign: 'center', fontWeight: '700' }}>Reset</Text>
                </Pressable>
              </View>
            </View>

            <View style={{ backgroundColor: ShredColors.card, borderRadius: 20, padding: 16, marginBottom: 20 }}>
              <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Supplement Checklist</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 12 }}>
                Log today's intake to stay consistent.
              </Text>

              <View style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>🥤 Whey Scoops</Text>
                  <Text style={{ color: '#9DD1FF', fontSize: 13, fontWeight: '700' }}>{wheyScoops} scoops</Text>
                </View>
                <Slider
                  value={wheyScoops}
                  onValueChange={(value) => setWheyScoops(Math.round(value))}
                  minimumValue={0}
                  maximumValue={3}
                  step={1}
                  minimumTrackTintColor={ShredColors.blue}
                  maximumTrackTintColor="rgba(255,255,255,0.2)"
                  thumbTintColor={ShredColors.blue}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>0</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>3</Text>
                </View>
              </View>

              <View style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>⚡ Creatine</Text>
                  <Text style={{ color: '#9AFAB0', fontSize: 13, fontWeight: '700' }}>{creatineG}g</Text>
                </View>
                <Slider
                  value={creatineG}
                  onValueChange={(value) => setCreatineG(Math.round(value))}
                  minimumValue={0}
                  maximumValue={5}
                  step={1}
                  minimumTrackTintColor={ShredColors.green}
                  maximumTrackTintColor="rgba(255,255,255,0.2)"
                  thumbTintColor={ShredColors.green}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>0g</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>5g</Text>
                </View>
              </View>

              <View style={{ gap: 10 }}>
                <Pressable
                  onPress={() => setTookMultivitamin((prev) => !prev)}
                  style={({ pressed }) => ({
                    borderRadius: 16,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    backgroundColor: tookMultivitamin ? 'rgba(50, 215, 75, 0.18)' : 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    borderColor: tookMultivitamin ? 'rgba(50, 215, 75, 0.5)' : 'rgba(255,255,255,0.08)',
                    opacity: pressed ? 0.8 : 1,
                  })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#ffffff', fontWeight: '700' }}>💊 Multivitamin</Text>
                    <Text style={{ color: tookMultivitamin ? '#9AFAB0' : 'rgba(255,255,255,0.65)', fontWeight: '700' }}>
                      {tookMultivitamin ? 'Done' : 'Tap to mark'}
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => setTookFishOil((prev) => !prev)}
                  style={({ pressed }) => ({
                    borderRadius: 16,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    backgroundColor: tookFishOil ? 'rgba(50, 215, 75, 0.18)' : 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    borderColor: tookFishOil ? 'rgba(50, 215, 75, 0.5)' : 'rgba(255,255,255,0.08)',
                    opacity: pressed ? 0.8 : 1,
                  })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#ffffff', fontWeight: '700' }}>🐟 Fish Oil</Text>
                    <Text style={{ color: tookFishOil ? '#9AFAB0' : 'rgba(255,255,255,0.65)', fontWeight: '700' }}>
                      {tookFishOil ? 'Done' : 'Tap to mark'}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>

            <View style={{ backgroundColor: ShredColors.card, borderRadius: 20, padding: 16, marginBottom: 24 }}>
              <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 12 }}>APT Correctives</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 12 }}>
                Stomach vacuums + hip flexor stretches.
              </Text>
              <Pressable
                onPress={() => setAptDone((prev) => !prev)}
                style={({ pressed }) => ({
                  borderRadius: 16,
                  paddingVertical: 12,
                  backgroundColor: aptDone ? 'rgba(50, 215, 75, 0.2)' : 'rgba(255,255,255,0.06)',
                  borderWidth: 1,
                  borderColor: aptDone ? 'rgba(50, 215, 75, 0.5)' : 'rgba(255,255,255,0.06)',
                  opacity: pressed ? 0.7 : 1,
                })}>
                <Text style={{ color: aptDone ? '#8CF5A5' : 'rgba(255,255,255,0.7)', textAlign: 'center', fontWeight: '700' }}>
                  {aptDone ? 'Correctives Completed' : 'Mark Correctives Done'}
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={saveRecovery}
              disabled={isSaving}
              style={({ pressed }) => ({
                borderRadius: 18,
                paddingVertical: 16,
                backgroundColor: isSaving ? 'rgba(255,255,255,0.08)' : ShredColors.blue,
                opacity: pressed && !isSaving ? 0.85 : 1,
                marginBottom: 12,
              })}>
              <Text style={{ color: isSaving ? 'rgba(255,255,255,0.4)' : '#ffffff', textAlign: 'center', fontWeight: '800' }}>
                {isSaving ? 'Saving...' : 'Save Recovery'}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

