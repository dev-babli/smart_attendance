# Free Hosting Stack & Middleman Self-Service

Best free plan to host the full project and let the middleman configure everything from the dashboard.

---

## 1. Recommended Free Hosting Stack

| Component | Service | Free Tier | Notes |
|-----------|---------|-----------|-------|
| **Frontend + API** | Vercel | 100 GB bandwidth/mo | Next.js dashboard & API routes |
| **Python (face recognition)** | Render | Web Service sleeps after 15 min | Or Railway $5 credit/mo |
| **Database (settings + logs)** | Upstash Redis | 10K commands/day | Via Vercel → Integrations → Upstash Redis |
| **WhatsApp** | Twilio | Free trial / sandbox | No Meta approval needed |

### One-time setup (tech person)

1. **GitHub**: Push repo
2. **Vercel**: Import repo, add Upstash Redis integration, add env vars (below)
3. **Render**: Deploy Python from `render.yaml` (Blueprint), set env vars
4. **Twilio**: Create account, join WhatsApp sandbox, get SID & Token

### Env vars (set once)

**Vercel** (minimal – rest can come from dashboard):

| Variable | Value |
|----------|-------|
| `TWILIO_ACCOUNT_SID` | From Twilio Console |
| `TWILIO_AUTH_TOKEN` | From Twilio Console |
| `KV_REST_API_URL` | From Upstash (auto if you add integration) |
| `KV_REST_API_TOKEN` | From Upstash |

**Render**:

| Variable | Value |
|----------|-------|
| `ATTENDANCE_API_URL` | `https://your-app.vercel.app` |
| `VIDEO_SOURCE` | Initial RTSP/HTTP URL (or set from dashboard) |
| `HEADLESS` | `1` |

---

## 2. What the Middleman Can Change Today vs Proposed

| Setting | Today | Proposed |
|---------|-------|----------|
| Camera URL (RTSP) | ✅ Dashboard (Demo Setup) | Same |
| Demo phone (who gets WhatsApp) | ❌ Env var | Dashboard |
| Twilio sandbox join phrase | ❌ Env var | Dashboard |
| Camera stream URL (where Python is) | ❌ Env var | Dashboard |
| Twilio SID / Token | ❌ Env var | Dashboard (optional) |

---

## 3. Proposed: App Settings (Dashboard-Configurable)

Add an **App Settings** store in KV and a **Settings** page (or expand Demo Setup) so the middleman can edit:

| Field | Purpose |
|-------|---------|
| Demo phone | Default recipient for attendance WhatsApp |
| Twilio sandbox join phrase | Word clients send to join (e.g. `positive-express`) |
| Camera stream URL | `https://your-render-service.onrender.com` for Live Feed |
| (Optional) Twilio SID / Token | Full self-service; store in KV, read by API |

### Implementation outline

1. **Store**: `src/lib/appSettingsStore.ts` – read/write `{ demo_phone, twilio_sandbox_join, camera_stream_url, twilio_sid?, twilio_token? }` in KV
2. **API**: `GET /api/app-settings`, `PATCH /api/app-settings` – require API key or simple auth
3. **Dashboard**: Settings page or expanded Demo Setup card with form fields
4. **Fallback**: All consumers read from store first, then `process.env`
5. **Twilio**: If stored in settings, `send-whatsapp` and `attendance-event` use those; else use env

---

## 4. Flow for the Middleman

1. Open dashboard
2. Go to **Demo Setup** (or **Settings**)
3. Edit and save:
   - Camera URL (RTSP) – Python picks up within ~60s
   - Demo phone – used for new attendance events
   - Twilio sandbox join phrase – shown to clients
   - Camera stream URL – if Python is on Render
4. No env edits, no redeploys

---

## 5. Free Stack Limits

| Service | Limit | Impact |
|---------|-------|--------|
| Vercel | 100 GB bandwidth | Enough for demos |
| Render free | Service sleeps after 15 min | Cold start ~1 min on first request |
| Upstash | 10K commands/day | Fine for settings + logs |
| Twilio sandbox | Must re-join every 24h | Demo limitation |

For production use, consider Render Starter ($7/mo) for always-on Python.
