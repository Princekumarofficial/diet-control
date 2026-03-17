import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { apiFetch } from '@/src/api/client';
import { ShredColors } from '@/src/constants/theme';

type DailyLog = {
  date: string;
  weight_kg: string | null;
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
  total_daily_calories: number;
  total_daily_protein: number;
};

type MetabolicTargets = {
  bmr_kcal: number;
  calories_burned_estimate: number;
  calorie_target_kcal: number;
  protein_target_g: number;
};

type DamageControl = {
  window_hours: number;
  calories_24h: number;
  flags: {
    has_high_sodium: boolean;
    has_high_sugar: boolean;
    calorie_overage: boolean;
  };
  targets: {
    water_goal_ml: number;
    steps_goal: number;
    skip_carbs_next_meal: boolean;
  };
  action_cards: Array<{
    type: 'high_sodium' | 'calorie_overage' | 'high_sugar' | 'on_track';
    title: string;
    message: string;
  }>;
};

type DashboardResponse =
  | { status: 'success'; daily_log: DailyLog; damage_control: DamageControl; targets: MetabolicTargets }
  | { status: 'error'; message: string };

type WeeklyResponse =
  | { status: 'success'; days: { date: string; calories: number; protein_g: number; weight_kg: number | null }[] }
  | { status: 'error'; message: string };

type WeeklyDay = {
  date: string;
  calories: number;
  protein_g: number;
  weight_kg: number | null;
};

type WeightChartMode = 'bar' | 'line';

type RingProps = {
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
  trackColor: string;
};

function ProgressRing({ size, strokeWidth, progress, color, trackColor }: RingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(progress, 0), 1);
  const dashOffset = circumference * (1 - clamped);

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

export default function DashboardScreen() {
  const [dailyLog, setDailyLog] = useState<DailyLog | null>(null);
  const [damageControl, setDamageControl] = useState<DamageControl | null>(null);
  const [weekly, setWeekly] = useState<WeeklyDay[]>([]);
  const [targets, setTargets] = useState<MetabolicTargets | null>(null);
  const [weightSeries, setWeightSeries] = useState<WeeklyDay[]>([]);
  const [weightDays, setWeightDays] = useState<7 | 30>(7);
  const [weightChartMode, setWeightChartMode] = useState<WeightChartMode>('bar');
  const [isLoading, setIsLoading] = useState(true);
  const [isWeightLoading, setIsWeightLoading] = useState(false);
  const [isSavingWeight, setIsSavingWeight] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [dailyRes, weeklyRes] = await Promise.all([
        apiFetch('/api/v1/dashboard/today/'),
        apiFetch('/api/v1/charts/weekly/?days=7'),
      ]);

      const dailyJson = (await dailyRes.json()) as DashboardResponse;
      const weeklyJson = (await weeklyRes.json()) as WeeklyResponse;

      if (dailyRes.ok && dailyJson.status === 'success') {
        setDailyLog(dailyJson.daily_log);
        setDamageControl(dailyJson.damage_control);
        setTargets(dailyJson.targets);
      } else {
        setDailyLog(null);
        setDamageControl(null);
        setTargets(null);
        setError(dailyJson.status === 'error' ? dailyJson.message : 'Failed to load dashboard.');
      }

      if (weeklyRes.ok && weeklyJson.status === 'success') {
        setWeekly(weeklyJson.days);
      } else {
        setWeekly([]);
        setError((prev) => prev ?? (weeklyJson.status === 'error' ? weeklyJson.message : 'Failed to load charts.'));
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadWeightSeries = useCallback(async (days: 7 | 30) => {
    setIsWeightLoading(true);
    try {
      const res = await apiFetch(`/api/v1/charts/weekly/?days=${days}`);
      const json = (await res.json()) as WeeklyResponse;
      if (res.ok && json.status === 'success') {
        setWeightSeries(json.days);
      } else {
        setWeightSeries([]);
        setError((prev) => prev ?? (json.status === 'error' ? json.message : 'Failed to load weight trend.'));
      }
    } catch (e: any) {
      setError((prev) => prev ?? (e?.message ?? 'Unexpected error.'));
    } finally {
      setIsWeightLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    loadWeightSeries(weightDays);
  }, [loadWeightSeries, weightDays]);

  useEffect(() => {
    setWeightInput(dailyLog?.weight_kg ?? '');
  }, []);

  useEffect(() => {
    setWeightInput(dailyLog?.weight_kg ?? '');
  }, [dailyLog?.date, dailyLog?.weight_kg]);

  async function saveWeight() {
    if (!dailyLog || isSavingWeight) return;

    setIsSavingWeight(true);
    setError(null);

    try {
      const trimmed = weightInput.trim();
      const weightValue = trimmed ? Number(trimmed) : null;

      if (trimmed && (Number.isNaN(weightValue) || weightValue! <= 0 || weightValue! > 300)) {
        setError('Enter a valid weight in kg.');
        return;
      }

      const res = await apiFetch(`/api/v1/daily-log/${dailyLog.date}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight_kg: weightValue }),
      });

      const json = (await res.json()) as DashboardResponse;
      if (res.ok && json.status === 'success') {
        setDailyLog(json.daily_log);
        await loadDashboard();
        await loadWeightSeries(weightDays);
      } else {
        setError(json.status === 'error' ? json.message : 'Failed to save weight.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error.');
    } finally {
      setIsSavingWeight(false);
    }
  }

  const calories = dailyLog?.total_daily_calories ?? 0;
  const protein = dailyLog?.total_daily_protein ?? 0;
  const calorieTarget = targets?.calorie_target_kcal ?? 1800;
  const proteinTarget = targets?.protein_target_g ?? 100;

  const actions = useMemo(() => {
    if (!dailyLog) return [] as { title: string; tone: 'warn' | 'good' | 'info'; detail: string }[];

    const cards: { title: string; tone: 'warn' | 'good' | 'info'; detail: string }[] = (damageControl?.action_cards ?? []).map(
      (card) => ({
        title: card.title,
        tone: card.type === 'on_track' ? 'good' : card.type === 'high_sugar' ? 'info' : 'warn',
        detail: card.message,
      })
    );

    if (dailyLog.total_daily_protein < proteinTarget) {
      cards.push({
        title: '🥤 Protein Gap',
        tone: 'info',
        detail: `Add a whey shake or extra dal to hit ${proteinTarget}g today.`,
      });
    }

    const waterTarget = damageControl?.targets.water_goal_ml ?? 3000;
    if (dailyLog.water_ml < waterTarget) {
      cards.push({
        title: '💧 Hydration Check',
        tone: 'info',
        detail: `Target ${(waterTarget / 1000).toFixed(1)}L water. Keep a bottle visible during study hours.`,
      });
    }

    if (!dailyLog.took_multivitamin) {
      cards.push({
        title: '✅ Supplement',
        tone: 'good',
        detail: 'Take your multivitamin to support recovery and focus.',
      });
    }

    if (cards.length === 0) {
      cards.push({
        title: '🔥 All Clear',
        tone: 'good',
        detail: 'You are on track today. Keep the momentum going.',
      });
    }

    return cards;
  }, [dailyLog, damageControl, proteinTarget]);

  const weeklyMax = useMemo(() => {
    const maxValue = Math.max(calorieTarget, ...weekly.map((day) => day.calories));
    return Math.max(maxValue, 1);
  }, [weekly]);

  const weeklyWeightRange = useMemo(() => {
    const values = weightSeries.map((day) => day.weight_kg).filter((v): v is number => v !== null);
    if (values.length === 0) return { min: 0, max: 1 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { min, max: max === min ? min + 1 : max };
  }, [weightSeries]);

  const weightLinePoints = useMemo(() => {
    const width = 300;
    const height = 120;
    const top = 10;
    const bottom = 102;
    const n = weightSeries.length;
    if (n === 0) return '';

    return weightSeries
      .map((day, index) => {
        const x = n === 1 ? width / 2 : (index / (n - 1)) * width;
        const value = day.weight_kg;
        const normalized = value === null ? 0.5 : (value - weeklyWeightRange.min) / (weeklyWeightRange.max - weeklyWeightRange.min);
        const y = bottom - normalized * (bottom - top);
        return `${x},${y}`;
      })
      .join(' ');
  }, [weightSeries, weeklyWeightRange]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: ShredColors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }}>
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: '#ffffff', fontSize: 28, fontWeight: '800', marginBottom: 6 }}>Project Shred</Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Your daily control center</Text>
        </View>

        {isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator size="large" color={ShredColors.blue} />
            <Text style={{ color: 'rgba(255,255,255,0.6)', marginTop: 12 }}>Loading dashboard...</Text>
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
            <Text style={{ color: '#FF726F', fontWeight: '600', marginBottom: 6 }}>⚠️ Dashboard Error</Text>
            <Text style={{ color: 'rgba(255,118,115,0.8)', fontSize: 14 }}>{error}</Text>
          </View>
        ) : null}

        {!isLoading && dailyLog ? (
          <>
            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 28 }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: ShredColors.card,
                  borderRadius: 24,
                  paddingVertical: 20,
                  position: 'relative',
                  alignItems: 'center',
                }}>
                <ProgressRing
                  size={140}
                  strokeWidth={10}
                  progress={calories / calorieTarget}
                  color={calories > calorieTarget ? ShredColors.red : ShredColors.blue}
                  trackColor="rgba(255,255,255,0.1)"
                />
                <View style={{ position: 'absolute', alignItems: 'center', top: 46 }}>
                  <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '800' }}>{calories}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>/ {calorieTarget} kcal</Text>
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.7)', marginTop: 12, fontSize: 12 }}>Calories</Text>
              </View>

              <View
                style={{
                  flex: 1,
                  backgroundColor: ShredColors.card,
                  borderRadius: 24,
                  paddingVertical: 20,
                  position: 'relative',
                  alignItems: 'center',
                }}>
                <ProgressRing
                  size={140}
                  strokeWidth={10}
                  progress={protein / proteinTarget}
                  color={protein >= proteinTarget ? ShredColors.green : ShredColors.blue}
                  trackColor="rgba(255,255,255,0.1)"
                />
                <View style={{ position: 'absolute', alignItems: 'center', top: 46 }}>
                  <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '800' }}>{protein}g</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>/ {proteinTarget}g</Text>
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.7)', marginTop: 12, fontSize: 12 }}>Protein</Text>
              </View>
            </View>

            {damageControl ? (
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                <View style={{ flex: 1, borderRadius: 16, padding: 12, backgroundColor: 'rgba(10,132,255,0.12)' }}>
                  <Text style={{ color: '#66B2FF', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>WATER GOAL</Text>
                  <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '800' }}>{(damageControl.targets.water_goal_ml / 1000).toFixed(1)}L</Text>
                </View>
                <View style={{ flex: 1, borderRadius: 16, padding: 12, backgroundColor: 'rgba(50,215,75,0.12)' }}>
                  <Text style={{ color: '#8CF5A5', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>STEP GOAL</Text>
                  <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '800' }}>{damageControl.targets.steps_goal}</Text>
                </View>
              </View>
            ) : null}

            {targets ? (
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                <View style={{ flex: 1, borderRadius: 16, padding: 12, backgroundColor: 'rgba(255,214,10,0.14)' }}>
                  <Text style={{ color: '#FFE58C', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>EST BURN</Text>
                  <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '800' }}>{targets.calories_burned_estimate} kcal</Text>
                </View>
                <View style={{ flex: 1, borderRadius: 16, padding: 12, backgroundColor: 'rgba(255,255,255,0.08)' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>BMR</Text>
                  <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '800' }}>{targets.bmr_kcal} kcal</Text>
                </View>
              </View>
            ) : null}

            <View style={{ marginBottom: 24 }}>
              <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Weight Tracker</Text>
              <View
                style={{
                  backgroundColor: ShredColors.card,
                  borderRadius: 20,
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <TextInput
                    value={weightInput}
                    onChangeText={setWeightInput}
                    placeholder="Enter kg"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    keyboardType="decimal-pad"
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      backgroundColor: 'rgba(255,255,255,0.06)',
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: '#fff',
                    }}
                  />
                  <Pressable
                    onPress={saveWeight}
                    disabled={isSavingWeight}
                    style={({ pressed }) => ({
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      backgroundColor: isSavingWeight ? 'rgba(255,255,255,0.08)' : 'rgba(10,132,255,0.2)',
                      opacity: pressed && !isSavingWeight ? 0.75 : 1,
                    })}>
                    <Text style={{ color: isSavingWeight ? 'rgba(255,255,255,0.5)' : '#8BC6FF', fontWeight: '700' }}>
                      {isSavingWeight ? 'Saving...' : 'Save'}
                    </Text>
                  </Pressable>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  {[7, 30].map((days) => {
                    const active = weightDays === days;
                    return (
                      <Pressable
                        key={`weight-days-${days}`}
                        onPress={() => setWeightDays(days as 7 | 30)}
                        style={({ pressed }) => ({
                          borderRadius: 12,
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                          backgroundColor: active ? 'rgba(10,132,255,0.22)' : 'rgba(255,255,255,0.06)',
                          opacity: pressed ? 0.75 : 1,
                        })}>
                        <Text style={{ color: active ? '#9DD1FF' : 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 12 }}>
                          {days} days
                        </Text>
                      </Pressable>
                    );
                  })}

                  {(['bar', 'line'] as WeightChartMode[]).map((mode) => {
                    const active = weightChartMode === mode;
                    return (
                      <Pressable
                        key={`weight-mode-${mode}`}
                        onPress={() => setWeightChartMode(mode)}
                        style={({ pressed }) => ({
                          borderRadius: 12,
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                          backgroundColor: active ? 'rgba(50,215,75,0.22)' : 'rgba(255,255,255,0.06)',
                          opacity: pressed ? 0.75 : 1,
                        })}>
                        <Text style={{ color: active ? '#9AFAB0' : 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 12 }}>
                          {mode.toUpperCase()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {isWeightLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                    <ActivityIndicator color={ShredColors.green} />
                  </View>
                ) : weightChartMode === 'bar' ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 6 }}>
                      {weightSeries.map((day, index) => {
                        const w = day.weight_kg;
                        const normalized =
                          w === null ? 0.1 : (w - weeklyWeightRange.min) / (weeklyWeightRange.max - weeklyWeightRange.min);
                        const height = 18 + normalized * 62;

                        return (
                          <View key={`w-${day.date}`} style={{ flex: 1, alignItems: 'center' }}>
                            <View
                              style={{
                                width: '100%',
                                height,
                                borderRadius: 10,
                                backgroundColor: w === null ? 'rgba(255,255,255,0.12)' : 'rgba(50,215,75,0.55)',
                              }}
                            />
                            {index % Math.max(1, Math.floor(weightSeries.length / 8)) === 0 ? (
                              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 6 }}>
                                {new Date(day.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                              </Text>
                            ) : (
                              <Text style={{ color: 'transparent', fontSize: 10, marginTop: 6 }}>.</Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <View style={{ marginBottom: 6 }}>
                    <Svg width="100%" height={120} viewBox="0 0 300 120">
                      <Polyline
                        points={weightLinePoints}
                        fill="none"
                        stroke="rgba(50,215,75,0.9)"
                        strokeWidth={3}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                      {weightLinePoints
                        .split(' ')
                        .filter(Boolean)
                        .map((point, idx) => {
                          const [cx, cy] = point.split(',').map(Number);
                          return <Circle key={`pt-${idx}`} cx={cx} cy={cy} r={3} fill="#9AFAB0" />;
                        })}
                    </Svg>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>Start</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>Now</Text>
                    </View>
                  </View>
                )}

                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
                  Last {weightDays} days • {weeklyWeightRange.min.toFixed(1)}kg to {weeklyWeightRange.max.toFixed(1)}kg
                </Text>
              </View>
            </View>

            <View style={{ marginBottom: 28 }}>
              <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Action Required</Text>
              <View style={{ gap: 12 }}>
                {actions.map((action, index) => {
                  const toneColor =
                    action.tone === 'warn'
                      ? ShredColors.red
                      : action.tone === 'good'
                      ? ShredColors.green
                      : ShredColors.blue;

                  return (
                    <View
                      key={`${action.title}-${index}`}
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.03)',
                        borderRadius: 16,
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.05)',
                      }}>
                      <Text style={{ color: toneColor, fontWeight: '700', marginBottom: 6 }}>{action.title}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{action.detail}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Weekly Deficit</Text>
              <View
                style={{
                  backgroundColor: ShredColors.card,
                  borderRadius: 24,
                  paddingHorizontal: 16,
                  paddingVertical: 20,
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                  {weekly.map((day) => {
                    const height = Math.max(12, (day.calories / weeklyMax) * 120);
                    const dayIndex = new Date(day.date).getDay();
                    const label = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayIndex];

                    return (
                      <View key={day.date} style={{ alignItems: 'center', flex: 1 }}>
                        <View
                          style={{
                            width: '100%',
                            height,
                            borderRadius: 12,
                            backgroundColor: day.calories > calorieTarget ? ShredColors.red : ShredColors.blue,
                          }}
                        />
                        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 8 }}>{label}</Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 12 }}>
                  Target: {calorieTarget} kcal/day
                </Text>
              </View>
            </View>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}
