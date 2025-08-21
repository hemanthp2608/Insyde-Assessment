# Insyd Notifications POC — System Design

## Context & Goal
Insyd is a social web for the Architecture industry. Users follow each other and engage via posts, blogs, chats, jobs, etc. The platform needs a **notifications** system to keep users engaged by alerting them to relevant activity from people they follow, people who follow them, and organic discovery.

This POC targets a bootstrapped startup stage with ~**100 DAUs** and aims to be **simple, explainable, and shippable**. It intentionally omits non-essentials (auth, caching, responsive UI) to focus on the core notification pipeline.

## Scope of the POC
Events that produce notifications (subset for demo):
- A user you follow publishes a post
- Someone follows you
- (Manual) Admin/test-triggered notification

**Delivery channels** in POC:
- In-app list (REST)
- Real-time stream (SSE) for live toasts/badges

## High-Level Architecture
```
[React Frontend]  <----HTTP REST---->  [Node/Express API]
     |                                        |
     |                              [SQLite (file DB)]
     |                                        |
     <---SSE /notifications stream-------------
```

- **Backend**: Node.js + Express
- **DB**: SQLite (single-file; easy to run locally and on free hosts)
- **Real-time**: **Server-Sent Events (SSE)** from backend to clients
- **Frontend**: React 18 via CDN (no build toolchain)

## Data Model (SQLite)
- **users** (id, name, created_at)
- **follows** (follower_id, followee_id, created_at)
- **posts** (id, user_id, content, created_at)
- **notifications** (id, user_id, type, actor_id, object_type, object_id, content, is_read, created_at)

Notes:
- `user_id` is the **recipient** of the notification.
- `actor_id` is the user who performed the action (e.g., author of a post, follower).
- `object_type`/`object_id` identify the domain object (e.g., "post", 42).

## Flow of Execution
1. **Event** occurs (e.g., User A posts).
2. **Fan-out** to recipients (all followers of A).
3. Create a `notifications` row per recipient.
4. If the recipient is connected via SSE, push the notification packet immediately.
5. Frontend consumes either:
   - `/notifications?userId=X` (initial list and pagination),
   - `/stream/notifications?userId=X` (real-time updates).

## Scale Considerations (for ~100 DAUs)
- SQLite handles this easily; typical TPS is low for early-stage.
- SSE keeps one HTTP connection per active client—fine at this scale.
- **N+1 Fan-out** on write is acceptable (easier than fan-out on read for POC).

## Evolution Path (beyond POC)
- Swap SQLite with Postgres/MySQL
- Background workers & queues (e.g., BullMQ, RabbitMQ) for high-fanout
- Multi-channel delivery (push/mobile, email)
- De-duplication / bundling (e.g., “12 new likes on your post”)
- Rate-limiting and preferences per user
- Durable pub/sub (e.g., Redis Streams, Kafka) for real-time
- Caching hot reads (Redis) and web sockets for rich interactivity
- Observability: metrics, tracing, error budgets

## Performance
- Indexes on `follows(followee_id)` and `notifications(user_id, is_read, created_at)`
- Simple payloads (lean JSON)
- SSE reconnect logic handled by the browser `EventSource`

## Limitations
- No authentication; `userId` is a request parameter
- No retries/bulk-batching beyond SQLite transaction
- Single-node server; not horizontally scalable as-is
- SSE is uni-directional (client receives only)

## API Summary
- `POST /users {name}` → create user
- `GET /users` → list users
- `POST /follow {followerId, followeeId}` → follow
- `POST /posts {userId, content}` → create post (notifies followers)
- `POST /notify/test` → manual/test notification
- `GET /notifications?userId=...` → list notifications (most recent first)
- `POST /notifications/:id/read` → mark read
- `GET /stream/notifications?userId=...` → SSE real-time stream

## Dev & Deploy
- Local: `npm install` in `/backend`, `node server.js`
- Frontend is static—open `frontend/index.html` with Live Server or serve via Express static
- Deploy:
  - Backend on Render/Railway/Fly with SQLite file persisted.
  - Frontend on Vercel/Netlify or as Express static.
