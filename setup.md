# 🗺️ JobMap Setup Guide

A creative 3D Map Job Tracker.

## 🛠️ Tech Stack Checklist

### ☁️ Cloud Accounts (Sign up needed)
- [ ] **Mapbox** ([mapbox.com](https://www.mapbox.com/)) $ightarrow$ Need an API Access Token for 3D maps.
- [ ] **Supabase** ([supabase.com](https://supabase.com/)) $ightarrow$ Database with PostGIS for spatial data.
- [ ] **Vercel** ([vercel.com](https://vercel.com/)) $ightarrow$ For hosting the Next.js app.
- [ ] **GitHub** ([github.com](https://github.com/)) $ightarrow$ Version control.

### 💻 Local Environment
- [ ] **Node.js** (v18+) $ightarrow$ [nodejs.org](https://nodejs.org/)
- [ ] **Git** $ightarrow$ Installed by default on macOS.
- [ ] **IDE** $ightarrow$ VS Code or Cursor (Recommended for AI coding).

## 🚀 Quick Start Sequence
1. Create GitHub Repo $ightarrow$ Connect to Vercel.
2. Create Supabase Project $ightarrow$ Enable `postgis` extension.
3. Get Mapbox Token $ightarrow$ Add to `.env.local`.
4. `npx create-next-app@latest .` (Initialize project in this folder).
