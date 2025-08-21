# Insyd Notifications POC (Monorepo)

A minimal, production-explainable proof-of-concept for a notifications system with:
- **Backend**: Node + Express + SQLite (better-sqlite3)
- **Frontend**: React (CDN + Babel), no build step
- **Realtime**: SSE (Server-Sent Events)

## Quick Start

### 1) Backend
```bash
cd backend
npm install
node server.js
# API: http://localhost:4000
```

### 2) Frontend
Open `frontend/index.html` in your browser.

> Update the API base in the UI if your backend is not on localhost:4000.

## Sample Flow
1. Create users (Asha, Rohan, etc.).  
2. "Asha" follows "Rohan".  
3. Create a post as "Rohan".  
4. Asha sees a notification (and via SSE if connected).

## Deployment (Pointers)
- Backend: Render/Railway/Fly (persist SQLite file); set `PORT` env var.
- Frontend: Vercel/Netlify (static). Update API base URL in UI.

## Documentation
See `docs/SystemDesign.md` for system design notes.
