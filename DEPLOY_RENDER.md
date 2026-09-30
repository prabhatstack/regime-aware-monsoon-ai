# 🚀 Render Deployment Guide / Render पर Deploy करने का तरीका

इस प्रोजेक्ट को [Render](https://render.com) पर 100% Free में deploy करने के 2 आसान तरीके हैं:

---

## Method 1: Automatic Blueprint (सबसे आसान / 1-Click)

1. [https://dashboard.render.com](https://dashboard.render.com) पर Login करें (GitHub account से login करें)।
2. ऊपर **"New +"** बटन पर click करें और **"Blueprint"** चुनें।
3. अपने GitHub repository को connect करें: `prabhatstack/regime-aware-monsoon-ai`.
4. Render repository में मौजूद `render.yaml` file को automatically detect कर लेगा।
5. **"Apply"** पर click करें।
6. Render आपके models, dependencies, और FastAPI dashboard को automatically build और deploy कर देगा।
7. Deployment complete होते ही आपको live URL (उदा. `https://regime-aware-monsoon-ai.onrender.com`) मिल जाएगा!

---

## Method 2: Manual Web Service

यदि आप manual Web Service बनाना चाहते हैं:

1. Render Dashboard में **"New +"** -> **"Web Service"** पर click करें।
2. Repository select करें: `regime-aware-monsoon-ai`.
3. निम्नलिखित settings भरें:
   - **Name:** `regime-aware-monsoon-ai`
   - **Language / Runtime:** `Python 3`
   - **Branch:** `main`
   - **Build Command:** `pip install --upgrade pip && pip install -r requirements.txt`
   - **Start Command:** `uvicorn src.api.app:app --host 0.0.0.0 --port $PORT`
   - **Plan:** `Free`
4. **Environment Variables** (Add Environment Variable पर click करें):
   - `PYTHON_VERSION` = `3.11.9`
   - `APP_ENV` = `production`
   - `DEBUG` = `false`
   - `CORS_ORIGINS` = `*`
   - `AUTH_SECRET_KEY` = `monsoon_secure_auth_key_2026`
5. **Health Check Path** (Advanced Settings में):
   - `/health`
6. **"Create Web Service"** पर click करें।

---

## Verification Endpoints on Live URL

एक बार deploy हो जाने के बाद, आप इन URLs पर test कर सकते हैं:
- **Interactive UI Dashboard:** `https://<your-render-url>/`
- **Health Check:** `https://<your-render-url>/health`
- **Districts API:** `https://<your-render-url>/api/districts`
- **Forecast API:** `https://<your-render-url>/api/forecast?lead_time_hr=24`
- **Verification Metrics:** `https://<your-render-url>/api/verification`
