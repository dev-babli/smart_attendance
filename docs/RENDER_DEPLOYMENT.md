# Render Deployment (Python Face Recognition)

Deploy the Python attendance engine to Render so it runs in the cloud. The dashboard stays on Vercel; Python POSTs recognized faces to your Vercel API.

---

## Prerequisites

- GitHub repo with the project (pushed)
- Vercel deployment URL (e.g. `https://your-app.vercel.app`)
- **Camera access:** Render runs in the cloud and cannot use a local DroidCam. You need:
  - **Option A:** RTSP camera (e.g. Hikvision) with a public or VPN-accessible URL
  - **Option B:** [Pinggy](https://pinggy.io) or ngrok tunnel from your PC to expose DroidCam to the internet (temporary for demos)
  - **Option C:** Run Python locally instead; use Render only when you have cloud-accessible camera

---

## Step 1: Create a Web Service on Render

1. Go to [render.com](https://render.com) → **Dashboard** → **New** → **Web Service**
2. Connect your GitHub repo
3. Choose the repo and branch (e.g. `main`)

---

## Step 2: Configure the Web Service

| Field | Value |
|-------|-------|
| **Name** | `smart-attendance-python` (or any name) |
| **Region** | Choose closest to your camera/Vercel |
| **Root Directory** | `face-recognition-poc` |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt && pip install opencv-python-headless` |
| **Start Command** | `python attendance_poc.py` |

Use `opencv-python-headless` because Render has no display (replaces `opencv-python` for server use).

---

## Step 3: Environment Variables

In **Environment** → **Environment Variables**, add:

| Variable | Value | Required |
|----------|-------|----------|
| `ATTENDANCE_API_URL` | `https://your-app.vercel.app` | Yes |
| `VIDEO_SOURCE` | `rtsp://user:pass@host:554/...` or `http://...` | Yes |
| `ATTENDANCE_API_KEY` | Same as Vercel | If you use API key auth |
| `STREAM_PORT` | `5000` | Optional (default 5000) |

`VIDEO_SOURCE` must be an RTSP URL or HTTP stream that Render can reach over the internet.

---

## Step 4: Instance Type

- **Free:** Web Services sleep after ~15 minutes of inactivity; not suitable for 24/7 attendance
- **Starter ($7/mo):** Always on, good for production

---

## Step 5: Deploy

1. Click **Create Web Service**
2. Render will build and start the service
3. Your Python API will be at `https://your-service.onrender.com`

---

## Step 6: Connect Vercel to the Camera Stream

In your **Vercel** project → **Settings** → **Environment Variables**:

| Variable | Value |
|----------|-------|
| `CAMERA_STREAM_URL` | `https://your-service.onrender.com` |

The dashboard will then proxy the MJPEG stream from Render.

---

## Camera Setup Options

### A. RTSP Camera (Hikvision, etc.)

```text
VIDEO_SOURCE=rtsp://admin:password@192.168.1.100:554/Streaming/Channels/101
```

Render must be able to reach this URL. Use a static IP, VPN, or Tailscale.

### B. Pinggy Tunnel (DroidCam from PC)

1. On your PC, run DroidCam and note the URL (e.g. `http://192.168.1.5:4747/video`)
2. Install [Pinggy](https://pinggy.io) and run: `ssh -p 443 -R0:localhost:4747 a.pinggy.io`
3. Use the Pinggy public URL as `VIDEO_SOURCE` (free tier has time limits)

### C. Local Python Instead

If you cannot expose the camera to Render, run `attendance_poc.py` locally and set `ATTENDANCE_API_URL` to your Vercel URL. See [DEPLOYMENT.md](../DEPLOYMENT.md) for the Windows setup.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on `face_recognition` | dlib can be slow to build. Consider removing `face_recognition` from requirements and using the OpenCV fallback. |
| No video input | Ensure `VIDEO_SOURCE` is reachable from Render (test with `curl` from another cloud host). |
| Service sleeps (free tier) | Upgrade to Starter or use a cron job to ping the service. |
| MJPEG not loading in dashboard | Check `CAMERA_STREAM_URL` and CORS; Render Web Services allow all origins by default. |
