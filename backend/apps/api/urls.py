from django.urls import path

from .views import (
    CoachChatView,
    CoachHistoryView,
    DashboardTodayView,
    DailyLogUpdateView,
    MealAnalyzeView,
    MealDeleteView,
    MealHistoryView,
    ProfileBodyFatEstimateView,
    UserProfileView,
    WeeklyChartsView,
)

urlpatterns = [
    path("dashboard/today/", DashboardTodayView.as_view()),
    path("coach/chat/", CoachChatView.as_view()),
    path("coach/history/", CoachHistoryView.as_view()),
    path("profile/", UserProfileView.as_view()),
    path("profile/estimate-body-fat/", ProfileBodyFatEstimateView.as_view()),
    path("meals/analyze/", MealAnalyzeView.as_view()),
    path("meals/history/", MealHistoryView.as_view()),
    path("meals/<int:meal_id>/", MealDeleteView.as_view()),
    path("daily-log/<date>/", DailyLogUpdateView.as_view()),
    path("charts/weekly/", WeeklyChartsView.as_view()),
]

