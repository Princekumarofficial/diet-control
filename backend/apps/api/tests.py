from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from apps.core.models import DailyLog, MealEntry, UserProfile


class AuthFlowTests(APITestCase):
	def test_register_requires_gemini_key(self):
		res = self.client.post(
			'/api/v1/auth/register/',
			{'username': 'u1', 'password': 'StrongPass123!'},
			format='json',
		)
		self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(res.data['status'], 'error')

	def test_register_and_login_success(self):
		register = self.client.post(
			'/api/v1/auth/register/',
			{
				'username': 'u1',
				'password': 'StrongPass123!',
				'email': 'u1@example.com',
				'gemini_api_key': 'gk_u1',
			},
			format='json',
		)
		self.assertEqual(register.status_code, status.HTTP_201_CREATED)
		self.assertEqual(register.data['status'], 'success')
		self.assertIn('token', register.data)

		login = self.client.post(
			'/api/v1/auth/login/',
			{'username': 'u1', 'password': 'StrongPass123!'},
			format='json',
		)
		self.assertEqual(login.status_code, status.HTTP_200_OK)
		self.assertEqual(login.data['status'], 'success')
		self.assertIn('token', login.data)

	def test_change_password_rotates_token_and_login_uses_new_password(self):
		User = get_user_model()
		user = User.objects.create_user(username='u2', password='OldPass123!')
		UserProfile.objects.create(user=user, gemini_api_key='gk_u2')
		token = Token.objects.create(user=user)
		self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

		change = self.client.post(
			'/api/v1/auth/change-password/',
			{'current_password': 'OldPass123!', 'new_password': 'NewPass456!'},
			format='json',
		)
		self.assertEqual(change.status_code, status.HTTP_200_OK)
		self.assertEqual(change.data['status'], 'success')
		self.assertIn('token', change.data)
		self.assertNotEqual(change.data['token'], token.key)

		self.client.credentials()

		old_login = self.client.post(
			'/api/v1/auth/login/',
			{'username': 'u2', 'password': 'OldPass123!'},
			format='json',
		)
		self.assertEqual(old_login.status_code, status.HTTP_401_UNAUTHORIZED)

		new_login = self.client.post(
			'/api/v1/auth/login/',
			{'username': 'u2', 'password': 'NewPass456!'},
			format='json',
		)
		self.assertEqual(new_login.status_code, status.HTTP_200_OK)
		self.assertEqual(new_login.data['status'], 'success')

	def test_delete_account_removes_user(self):
		User = get_user_model()
		user = User.objects.create_user(username='u3', password='DeletePass123!')
		UserProfile.objects.create(user=user, gemini_api_key='gk_u3')
		token = Token.objects.create(user=user)
		self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

		res = self.client.post('/api/v1/auth/delete-account/', {'password': 'DeletePass123!'}, format='json')
		self.assertEqual(res.status_code, status.HTTP_200_OK)
		self.assertEqual(res.data['status'], 'success')
		self.assertFalse(User.objects.filter(username='u3').exists())


class PerUserIsolationTests(APITestCase):
	def setUp(self):
		User = get_user_model()
		self.user_a = User.objects.create_user(username='alice', password='AlicePass123!')
		self.user_b = User.objects.create_user(username='bob', password='BobPass123!')

		UserProfile.objects.create(user=self.user_a, gemini_api_key='gk_a')
		UserProfile.objects.create(user=self.user_b, gemini_api_key='gk_b')

		self.token_a = Token.objects.create(user=self.user_a)
		self.token_b = Token.objects.create(user=self.user_b)

		today = timezone.localdate()

		self.log_a = DailyLog.objects.create(user=self.user_a, date=today)
		self.log_b = DailyLog.objects.create(user=self.user_b, date=today)

		self.meal_a = MealEntry.objects.create(
			daily_log=self.log_a,
			meal_type='lunch',
			raw_input_text='alice meal',
			calories=500,
			protein_g=30,
			carbs_g=55,
			fats_g=15,
		)
		self.meal_b = MealEntry.objects.create(
			daily_log=self.log_b,
			meal_type='dinner',
			raw_input_text='bob meal',
			calories=900,
			protein_g=45,
			carbs_g=100,
			fats_g=30,
		)

	def test_dashboard_returns_only_authenticated_users_daily_totals(self):
		self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_a.key}')
		res_a = self.client.get('/api/v1/dashboard/today/')
		self.assertEqual(res_a.status_code, status.HTTP_200_OK)
		self.assertEqual(res_a.data['daily_log']['total_daily_calories'], 500)

		self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_b.key}')
		res_b = self.client.get('/api/v1/dashboard/today/')
		self.assertEqual(res_b.status_code, status.HTTP_200_OK)
		self.assertEqual(res_b.data['daily_log']['total_daily_calories'], 900)

	def test_meal_history_returns_only_owned_meals(self):
		self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_a.key}')
		res = self.client.get('/api/v1/meals/history/?page=1&page_size=20')
		self.assertEqual(res.status_code, status.HTTP_200_OK)
		ids = [item['id'] for item in res.data['results']]
		self.assertIn(self.meal_a.id, ids)
		self.assertNotIn(self.meal_b.id, ids)

	def test_cannot_delete_other_users_meal(self):
		self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_a.key}')
		res = self.client.delete(f'/api/v1/meals/{self.meal_b.id}/')
		self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
