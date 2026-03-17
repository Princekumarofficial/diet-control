# Project Shred: Codebase Overview

This document is a technical overview of the current implementation across backend and frontend.

It is meant to answer:
- What features are implemented right now
- How the code is structured
- What coding practices and conventions are being used
- How UI/UX is designed and themed
- How to run, build, and deploy the app

## 1) Product Summary

Project Shred is an AI-assisted fitness tracking app focused on:
- Meal logging from photo or text
- Daily calories/protein/carbs tracking
- Recovery and soreness planning
- Supplement and hydration tracking
- AI coach chat based on logged data
- Body profile and metabolic target personalization

Core stack:
- Frontend: Expo + React Native + Expo Router + TypeScript
- Backend: Django + Django REST Framework
- AI services: Google Gemini models (meal parsing, body-fat estimate, coach response)
- Persistence: SQLite (backend `db.sqlite3`)
- Deployment: Docker + Nginx, optimized for Raspberry Pi workflows

## 2) Implemented Features

### 2.1 Dashboard (Home)
- Circular progress rings for calories and protein against dynamic targets.
- Dynamic damage-control indicators (water goal, step goal).
- Action cards generated from backend signals:
  - High sodium / high sugar / calorie overage
  - Protein gap and hydration reminders
  - Supplement reminders
- Weekly calorie bar chart against daily target.
- Weight tracker:
  - Save daily weight
  - 7-day or 30-day trend
  - Bar and line visualization modes

Primary frontend file:
- `frontend/app/(tabs)/index.tsx`

### 2.2 Log Meal
- Image capture via camera or gallery.
- Optional text-only meal logging.
- Sends multipart form payload to backend `meals/analyze` endpoint.
- AI response includes:
  - calories, protein, carbs
  - meal summary
  - high sodium / high sugar flags
- Post-analysis UI includes:
  - per-meal macro card
  - day totals and progress bars
  - warning chips

Primary frontend file:
- `frontend/app/(tabs)/log-meal.tsx`

### 2.3 Recovery
- Soreness sliders per muscle group (chest, back, legs).
- Automatic recovery plan suggestion based on soreness score.
- Daily update inputs:
  - steps
  - water
  - rest day toggle
  - planned workout
  - APT corrective completion
  - supplements checklist (whey, creatine, multivitamin, fish oil)
- Saves all fields to daily log via PATCH.

Primary frontend file:
- `frontend/app/(tabs)/recovery.tsx`

### 2.4 Meal History
- Paginated meal history endpoint consumption.
- Grouping by date in UI.
- Swipe-to-delete interaction for meal rows.
- Badge-style nutrient/flag chips.

Primary frontend file:
- `frontend/app/(tabs)/two.tsx`

### 2.5 AI Coach Chat
- Loads chat history from backend.
- Sends user prompt to backend coach endpoint.
- Displays role-based bubble chat UI.
- Includes quick prompt shortcuts.
- Renders lightweight markdown-style emphasis and bullet/numbered lines.

Primary frontend file:
- `frontend/app/(tabs)/coach.tsx`

### 2.6 Profile and Personalization
- Editable fields:
  - sex, age, height, body fat
  - activity level
  - goal (cut/maintain/gain)
  - target deficit kcal
- Auto-estimate body fat from uploaded image.
- Reflects computed metabolic targets.

Primary frontend file:
- `frontend/app/profile.tsx`

## 3) Backend API Surface (Current)

Base prefix:
- `/api/v1/`

Endpoints (from `backend/apps/api/urls.py`):
- `GET /dashboard/today/`
- `POST /coach/chat/`
- `GET /coach/history/`
- `GET /profile/`
- `PATCH /profile/`
- `POST /profile/estimate-body-fat/`
- `POST /meals/analyze/`
- `GET /meals/history/`
- `DELETE /meals/<meal_id>/`
- `PATCH /daily-log/<date>/`
- `GET /charts/weekly/?days=7..90`

Main implementation file:
- `backend/apps/api/views.py`

## 4) Data Model Overview

Defined in:
- `backend/apps/core/models.py`

### 4.1 `DailyLog`
Tracks day-level health and behavior:
- date, weight
- steps, seated hours, APT corrective completion, water
- rest day, planned workout, soreness profile
- supplement status
- computed properties for total calories/protein/carbs from related meals

### 4.2 `MealEntry`
Tracks each meal event:
- timestamp, meal type, raw input text
- calories/protein/carbs
- meal summary
- high sodium/high sugar flags

### 4.3 `CoachMessage`
Persists chat conversation history:
- role (user/assistant)
- content
- timestamp

### 4.4 `UserProfile`
Stores personalization context:
- demographics and body metrics
- activity level and goal
- configurable target deficit

## 5) AI/ML Integration Design

### 5.1 Meal Analysis Service
File:
- `backend/apps/core/services/gemini_meal.py`

Behavior:
- Uses a strict JSON contract with prompt guidance for Indian mess-thali context.
- Supports both image and text flows.
- Includes schema-driven generation attempt, then fallback generation.
- Contains robust key normalization/parsing heuristics for model output variability.

Current model configured in code:
- `gemini-3.1-flash-lite-preview`

### 5.2 Body Fat Estimate
File:
- `backend/apps/core/services/gemini_body.py`

Behavior:
- Sends physique image and expects strict JSON response.
- Validates output range (3-60%) before saving.

Current model configured in code:
- `gemini-2.5-flash`

### 5.3 Coach Chat (LangGraph)
File:
- `backend/apps/core/services/coach_graph.py`

Behavior:
- Graph stages: collect context -> generate coach reply -> finalize.
- Context combines recent logs, meals, current metrics, and chat history.
- Response style constraints are encoded in system prompt.
- Conversation is persisted in `CoachMessage` table.

Current model configured in code:
- `gemini-2.5-flash`

## 6) Metabolic Target Logic

File:
- `backend/apps/core/services/metabolism.py`

Implemented calculations:
- BMR:
  - Katch-McArdle when body fat is available and valid
  - Mifflin-St Jeor fallback when anthropometrics are available
  - static default fallback otherwise
- TDEE estimate with activity multiplier
- Additional step burn for steps above baseline
- workout boost and seated-time penalty
- Goal-specific calorie target (gain/maintain/cut)
- protein target based on goal and bodyweight

## 7) Damage Control Engine

Implemented in:
- `backend/apps/api/views.py` (`_damage_control_payload`)

Window:
- Last 24 hours of meals

Signals:
- total calories in window
- high sodium flag
- high sugar flag

Actions:
- raises water target for sodium events
- raises step target for calorie overage
- recommends skipping carbs for overage/sugar conditions
- emits action cards consumed directly by dashboard UI

## 8) Frontend Architecture

Routing and navigation:
- Expo Router with stack + tab layout
- Root stack in `frontend/app/_layout.tsx`
- Tab nav in `frontend/app/(tabs)/_layout.tsx`

API access pattern:
- Centralized fetch wrapper in `frontend/src/api/client.ts`
- Supports:
  - primary API URL
  - fallback URL list
  - failover attempts with logging

State pattern:
- Screen-local state via hooks (`useState`, `useEffect`, `useMemo`, `useCallback`)
- No global state manager currently used

Visual primitives:
- Handcrafted components per screen (cards, badges, progress bars, rings)
- SVG used for circular progress and line chart elements

## 9) UI/UX Theme System

Color system defined in:
- `frontend/src/constants/theme.ts`

Palette:
- Background: `#000000`
- Card: `#1C1C1E`
- Primary blue: `#0A84FF`
- Success green: `#32D74B`
- Warning red: `#FF453A`

Visual style characteristics:
- Dark-first interface
- High-contrast metric-first cards
- Bold typography for critical numeric values
- Status conveyed through color + icon chips
- Clear error states with bordered, tinted warning containers
- Touch-friendly controls with rounded corners and press opacity feedback

Interaction patterns:
- Loading indicators on all async actions
- Explicit success and error states
- Input validation before save/submit
- Swipe gesture for destructive actions in history
- Suggested quick prompts for coach chat onboarding

## 10) Coding Practices and Conventions

### 10.1 Type Safety and Contracts
- Frontend TypeScript `strict: true` (`frontend/tsconfig.json`).
- Screen-local response union types model success/error payloads.
- Backend returns explicit `status: success|error` payload envelopes.

### 10.2 Backend Organization
- Business logic extracted into service modules (`core/services/*`).
- API layer in `apps/api/views.py` orchestrates request/response.
- ORM models in `apps/core/models.py`.

### 10.3 Defensive Programming
- Backend wraps API handlers with targeted exception branches.
- AI parsing includes normalization and fallback handling.
- Frontend checks `res.ok` and payload status before state transitions.

### 10.4 Environment and Config Strategy
- Backend env loaded from `.env` (`python-dotenv`).
- Frontend runtime API env via Expo public vars:
  - `EXPO_PUBLIC_API_URL`
  - `EXPO_PUBLIC_API_URL_FALLBACKS`

### 10.5 Current Quality Gaps
- Automated tests are currently placeholders:
  - `backend/apps/api/tests.py`
  - `backend/apps/core/tests.py`
- No authentication/authorization layer is present yet.
- Some product docs and code behavior differ slightly (model/version/target details).

## 11) Build and Deployment

### 11.1 Backend (Docker)
Core files:
- `backend/Dockerfile`
- `backend/docker-compose.rpi.http.yml`
- `backend/docker-compose.rpi.https.yml`
- `backend/deploy-rpi-http.sh`
- `backend/deploy-rpi-https.sh`

Deployment script behavior:
- Validates Docker/Compose
- Ensures `.env` exists
- Runs migrations and Django checks
- Starts backend + Nginx stack

### 11.2 Frontend (Expo)
Key scripts (`frontend/package.json`):
- local run (`start`, `android`, `ios`, `web`)
- native Android build scripts
- Dockerized Android build scripts
- EAS cloud build profiles (`preview`, `production`)

Configuration:
- `frontend/app.json`
- `frontend/eas.json`

## 12) Basic Repository Structure

High-level:
- `backend/`
  - Django project config and apps
  - AI service integrations
  - Docker deployment artifacts
- `frontend/`
  - Expo Router app screens
  - API client and theme constants
  - Android native project + build scripts

Important files by concern:
- API behavior: `backend/apps/api/views.py`
- Data models: `backend/apps/core/models.py`
- Meal AI: `backend/apps/core/services/gemini_meal.py`
- Coach AI: `backend/apps/core/services/coach_graph.py`
- Metabolism logic: `backend/apps/core/services/metabolism.py`
- App tabs: `frontend/app/(tabs)/_layout.tsx`
- Dashboard UI: `frontend/app/(tabs)/index.tsx`
- Meal logging UI: `frontend/app/(tabs)/log-meal.tsx`
- API client: `frontend/src/api/client.ts`
- Theme tokens: `frontend/src/constants/theme.ts`

## 13) Suggested Next Improvements

1. Add full backend test coverage for API endpoints and metabolism logic.
2. Add frontend integration tests for core user flows (log meal, save recovery, update profile).
3. Introduce auth and user isolation if multi-user support is planned.
4. Align README product spec with actual runtime model/version details.
5. Add centralized frontend domain types to reduce per-screen duplication.
