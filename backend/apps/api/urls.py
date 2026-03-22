from django.urls import path

from .views import (
    AuthChangePasswordView,
    AuthDeleteAccountView,
    AuthLoginView,
    AuthLogoutView,
    AuthMeView,
    AuthRegisterView,
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
    path("auth/register/", AuthRegisterView.as_view()),
    path("auth/login/", AuthLoginView.as_view()),
    path("auth/logout/", AuthLogoutView.as_view()),
    path("auth/me/", AuthMeView.as_view()),
    path("auth/change-password/", AuthChangePasswordView.as_view()),
    path("auth/delete-account/", AuthDeleteAccountView.as_view()),
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

