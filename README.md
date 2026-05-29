# PPTX Conversion Server
### For Church Worship App — Pastor Monitor

Converts `.pptx` sermon slides to pixel-perfect PNG images using LibreOffice.
Uploads PNGs to Firebase Storage and returns public URLs.

---

## How to Deploy (Railway — Free)

### Step 1 — Get your Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click your project → ⚙️ **Project Settings**
3. Go to **Service Accounts** tab
4. Click **Generate new private key** → download the JSON file
5. Keep this file safe — you'll paste its contents as an env variable

### Step 2 — Enable Firebase Storage

1. In Firebase Console → **Storage**
2. Click **Get Started** if not already set up
3. Note your bucket name (looks like `your-app.appspot.com`)

### Step 3 — Deploy to Railway

1. Go to [railway.app](https://railway.app) → Sign up free with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
   - Push this `pptx-server/` folder to a GitHub repo first
   - OR use **Empty project** → drag and drop these files
3. Once deployed, go to your service → **Variables** tab
4. Add these environment variables:

```
FIREBASE_STORAGE_BUCKET    =  your-app.appspot.com
FIREBASE_SERVICE_ACCOUNT   =  { paste the entire JSON content here as one line }
ALLOWED_ORIGIN             =  https://your-church-app.web.app
```

5. Railway will auto-detect the Dockerfile and build it
6. Copy your Railway deployment URL (looks like `https://your-app.up.railway.app`)

### Step 4 — Connect to Pastor Monitor

In your React app's `.env` file (or Vite env):

```
VITE_PPTX_SERVER_URL=https://your-app.up.railway.app
```

Restart your app — done! ✅

---

## How It Works

```
Pastor uploads .pptx
       ↓
Railway server receives file
       ↓
LibreOffice converts each slide → PNG
(100% accurate: backgrounds, fonts, alignment, gradients all preserved)
       ↓
PNGs uploaded to Firebase Storage
       ↓
Public URLs returned to Pastor Monitor
       ↓
Slides display in Pastor Monitor + Projector screen
```

---

## Verify It's Working

Visit: `https://your-app.up.railway.app/health`

Should return: `{"status":"ok","time":"..."}`

---

## Cost

| Service | Free Tier |
|---|---|
| Railway | 500 hours/month free (enough for weekly use) |
| Firebase Storage | 5 GB free |
| Firebase Firestore | 1 GB free |

**Total: $0 for typical church usage** ✅

---

## Troubleshooting

**"LibreOffice produced no PNG output"**
→ LibreOffice isn't installed. The Dockerfile handles this automatically on Railway.

**"CORS error"**
→ Set `ALLOWED_ORIGIN` to your app's domain in Railway env vars.

**"Server error 500"**
→ Check Railway logs. Usually a Firebase credentials issue — make sure `FIREBASE_SERVICE_ACCOUNT` is the full JSON on one line.

**Slides look wrong / missing fonts**
→ The server includes common fonts (Liberation, DejaVu, Noto). For custom fonts, add them to the Dockerfile with `apt-get install fonts-<name>`.
