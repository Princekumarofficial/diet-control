import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { apiFetch } from '@/src/api/client';
import { ShredColors } from '@/src/constants/theme';

type MealItem = {
  id: number;
  timestamp: string;
  date: string;
  meal_type: string;
  raw_input_text: string;
  meal_summary: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  is_high_sodium: boolean;
  is_high_sugar: boolean;
};

type HistoryResponse =
  | {
      status: 'success';
      count: number;
      page: number;
      page_size: number;
      has_next: boolean;
      results: MealItem[];
    }
  | { status: 'error'; message: string };

type Row =
  | { kind: 'header'; date: string; id: string }
  | { kind: 'meal'; meal: MealItem; id: string };

function formatDateLabel(dateIso: string) {
  const d = new Date(dateIso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimeLabel(timestampIso: string) {
  const d = new Date(timestampIso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function MealHistoryScreen() {
  const [meals, setMeals] = useState<MealItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const grouped: Record<string, MealItem[]> = {};
    for (const meal of meals) {
      if (!grouped[meal.date]) grouped[meal.date] = [];
      grouped[meal.date].push(meal);
    }

    const dates = Object.keys(grouped).sort((a, b) => (a > b ? -1 : 1));
    const output: Row[] = [];
    for (const date of dates) {
      output.push({ kind: 'header', date, id: `header-${date}` });
      for (const meal of grouped[date]) {
        output.push({ kind: 'meal', meal, id: `meal-${meal.id}` });
      }
    }
    return output;
  }, [meals]);

  const fetchPage = useCallback(async (nextPage: number, append: boolean) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setError(null);
    }

    try {
      const res = await apiFetch(`/api/v1/meals/history/?page=${nextPage}&page_size=12`);
      const json = (await res.json()) as HistoryResponse;

      if (res.ok && json.status === 'success') {
        setMeals((prev) => (append ? [...prev, ...json.results] : json.results));
        setHasNext(json.has_next);
        setPage(nextPage);
      } else {
        const msg = json.status === 'error' ? json.message : 'Failed to load meal history.';
        setError(msg);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error.');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(1, false);
  }, [fetchPage]);

  async function deleteMeal(mealId: number) {
    if (deletingId !== null) return;
    setDeletingId(mealId);

    try {
      const res = await apiFetch(`/api/v1/meals/${mealId}/`, { method: 'DELETE' });
      const json = await res.json();

      if (res.ok && json.status === 'success') {
        setMeals((prev) => prev.filter((m) => m.id !== mealId));
      } else {
        setError(json?.message ?? 'Failed to delete meal.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error.');
    } finally {
      setDeletingId(null);
    }
  }

  function confirmDelete(mealId: number) {
    Alert.alert('Delete meal', 'This will remove the meal from your history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteMeal(mealId);
        },
      },
    ]);
  }

  function renderRightActions(mealId: number) {
    return (
      <Pressable
        onPress={() => confirmDelete(mealId)}
        style={{
          width: 96,
          marginBottom: 10,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255,69,58,0.92)',
        }}>
        <Text style={{ color: '#fff', fontWeight: '800' }}>Delete</Text>
      </Pressable>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: ShredColors.bg, paddingHorizontal: 16, paddingTop: 20 }}>
      <View style={{ marginBottom: 16 }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>Meal History</Text>
        <Text style={{ color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Swipe left to delete. Browse previous days.</Text>
      </View>

      {error ? (
        <View
          style={{
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: 'rgba(255,69,58,0.3)',
            backgroundColor: 'rgba(255,69,58,0.1)',
          }}>
          <Text style={{ color: '#FF726F', fontWeight: '700' }}>⚠️ {error}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <View style={{ paddingTop: 50, alignItems: 'center' }}>
          <ActivityIndicator color={ShredColors.blue} size="large" />
          <Text style={{ color: 'rgba(255,255,255,0.6)', marginTop: 10 }}>Loading meals...</Text>
        </View>
      ) : rows.length === 0 ? (
        <View
          style={{
            marginTop: 40,
            borderRadius: 20,
            backgroundColor: ShredColors.card,
            padding: 22,
            alignItems: 'center',
          }}>
          <Text style={{ fontSize: 44, marginBottom: 10 }}>🍽️</Text>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 }}>No meals yet</Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
            Log your first meal to start building history.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 28 }}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return (
                <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, marginBottom: 8, marginTop: 10 }}>
                  {formatDateLabel(item.date)}
                </Text>
              );
            }

            const meal = item.meal;
            return (
              <Swipeable overshootRight={false} renderRightActions={() => renderRightActions(meal.id)}>
                <View
                  style={{
                    backgroundColor: ShredColors.card,
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.06)',
                  }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{meal.meal_type || 'Meal'}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>{formatTimeLabel(meal.timestamp)}</Text>
                  </View>

                  {meal.meal_summary ? (
                    <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, marginBottom: 8 }}>{meal.meal_summary}</Text>
                  ) : null}

                  {meal.raw_input_text ? (
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 10 }}>{meal.raw_input_text}</Text>
                  ) : null}

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(10,132,255,0.15)' }}>
                      <Text style={{ color: '#7EC0FF', fontWeight: '700', fontSize: 12 }}>{meal.calories} kcal</Text>
                    </View>
                    <View style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(50,215,75,0.16)' }}>
                      <Text style={{ color: '#9AFAB0', fontWeight: '700', fontSize: 12 }}>{meal.protein_g}g protein</Text>
                    </View>
                    <View style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,214,10,0.15)' }}>
                      <Text style={{ color: '#FFE58C', fontWeight: '700', fontSize: 12 }}>{meal.carbs_g}g carbs</Text>
                    </View>
                    {meal.is_high_sodium ? (
                      <View style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,69,58,0.15)' }}>
                        <Text style={{ color: '#FF9A95', fontWeight: '700', fontSize: 12 }}>Sodium</Text>
                      </View>
                    ) : null}
                    {meal.is_high_sugar ? (
                      <View style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,69,58,0.15)' }}>
                        <Text style={{ color: '#FF9A95', fontWeight: '700', fontSize: 12 }}>Sugar</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Swipeable>
            );
          }}
          ListFooterComponent={
            hasNext ? (
              <Pressable
                disabled={isLoadingMore}
                onPress={() => fetchPage(page + 1, true)}
                style={({ pressed }) => ({
                  marginTop: 8,
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: 'center',
                  backgroundColor: 'rgba(10,132,255,0.16)',
                  opacity: pressed || isLoadingMore ? 0.75 : 1,
                })}>
                <Text style={{ color: '#7EC0FF', fontWeight: '700' }}>{isLoadingMore ? 'Loading...' : 'Load Older Meals'}</Text>
              </Pressable>
            ) : (
              <Text style={{ color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginTop: 6 }}>You reached the oldest meals.</Text>
            )
          }
        />
      )}

      {deletingId !== null ? (
        <View style={{ position: 'absolute', right: 16, bottom: 16, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: '#fff', fontSize: 12 }}>Deleting meal...</Text>
        </View>
      ) : null}
    </View>
  );
}
