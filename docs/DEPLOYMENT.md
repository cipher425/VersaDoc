# Deployment (free tiers)

Same setup as TicketHub: MongoDB Atlas + Render (API) + Vercel (web).

## 1. MongoDB Atlas
Use your existing Atlas cluster with a **new database name** in the URI: `.../versadoc?retryWrites=true&w=majority`. Network Access must allow `0.0.0.0/0` for Render.

## 2. API on Render
New **Web Service** → your repo.

| Setting | Value |
|---|---|
| Root Directory | `server` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/api/v1/health` |

Environment variables:

```
NODE_ENV=production
NODE_VERSION=22
MONGODB_URI=mongodb+srv://.../versadoc?retryWrites=true&w=majority
JWT_ACCESS_SECRET=<random 48+ bytes hex>
CLIENT_URL=https://your-app.vercel.app      # set after step 3
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
```

Seed once from your PC (pointing `server/.env` at the same Atlas database): `npm run seed`.

## 3. Web on Vercel
1. In `client/vercel.json` replace `YOUR-API.onrender.com` with your Render host, commit and push.
2. Vercel → Add New Project → your repo → **Root Directory `client`**, Framework **Vite** → Deploy.
3. Copy the Vercel URL into Render's `CLIENT_URL` (no trailing slash).

## 4. Check
- `https://<render>/api/v1/health` → `{"status":"ok","db":"up"}`
- Log in on the Vercel site, refresh the page (still logged in), edit + commit, open a merge request.
- Public page: `https://<vercel>/p/<slug>`.

Free Render instances sleep after ~15 minutes idle; the first request can take ~40 s.
