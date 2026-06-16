# LogRaider - Agent Instructions

## Project Overview
LogRaider is a cross-platform desktop log management application with a web-based Admin Portal. The system consists of:
- **Desktop Client** (Electron) - runs on Windows, Mac, Linux
- **API Server** (Node.js/Express) - REST API + WebSocket for real-time sync
- **Admin Portal** (Web App) - for managing users and teams

## Current Architecture

### Directory Structure
```
lograider/
├── AGENTS.md                 # This file - implementation tracking
├── docker-compose.yml        # Docker deployment config
├── package.json              # Desktop client dependencies
├── src/                      # Desktop client source
│   ├── main.js               # Electron main process
│   ├── preload.js            # Context isolation bridge
│   ├── database.js           # Local SQLite wrapper
│   ├── api-client.js         # HTTP client for server API
│   ├── index.html            # Login/Registration page
│   ├── dashboard.html        # Main desktop app UI
│   ├── renderer.js           # Desktop client frontend logic
│   └── styles.css            # Shared styles
├── server/                   # API Server (Docker)
│   ├── Dockerfile
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js          # Express entry point
│       ├── schema.sql        # Canonical SQL schema + seed data
│       ├── db/               # PostgreSQL connection & migration
│       ├── routes/           # API route handlers
│       ├── middleware/       # Auth, admin, team middleware
│       ├── websocket/        # Real-time WebSocket server
│       ├── utils/            # Utility functions
│       └── lradmin/          # Admin Portal (served at /lradmin)
│           ├── index.html
│           ├── css/
│           └── js/
└── assets/                   # App icons
```

### Data Model

**User**
- `id` (UUID), `username` (unique), `email` (unique), `passwordHash`
- `status`: "pending" | "activated" | "disabled"
- `role`: "user" | "admin"
- `activatedAt`, `createdAt`, `updatedAt`

**Team**
- `id` (UUID), `teamId` (unique, user-created), `name`
- `ownerId` (FK → User), `createdAt`, `updatedAt`

**TeamMembership**
- `id`, `teamId` (FK), `userId` (FK)
- `role`: "TeamAdmin" | "TeamUser"
- `status`: "pending" | "active" | "removed"
- `invitedBy` (FK), `invitedAt`, `joinedAt`

**LogEntry**
- `id` (UUID), `teamId` (FK), `createdBy` (FK)
- `level`: "info" | "warn" | "error" | "debug"
- `source`, `message`, `metadata` (JSON), `timestamp`
- `createdAt`, `updatedAt`

**InviteToken**
- `id`, `teamId` (FK), `email`, `role`
- `token` (unique), `invitedBy` (FK), `expiresAt`, `usedAt`

**AuditLog**
- `id`, `actorId` (FK), `action`, `targetType`, `targetId`
- `metadata` (JSON), `createdAt`

### Roles & Permissions

| Action | Admin | TeamAdmin | TeamUser |
|--------|-------|-----------|----------|
| Manage users (activate/disable) | ✅ | ❌ | ❌ |
| View all teams | ✅ | ❌ | ❌ |
| Create teams | ✅ | ✅ | ❌ |
| Invite team members | ✅ | ✅ | ❌ |
| Set team member roles | ✅ | ✅ | ❌ |
| Create log entries | ❌ | ✅ | ❌ |
| Edit/delete log entries | ❌ | ✅ | ❌ |
| View log entries | ❌ | ✅ | ✅ |

### Authentication Flow

1. **Registration** - User creates account in desktop app → `status: "pending"`
2. **Activation** - Admin activates account → `status: "activated"`, `role: "user"`
3. **License Activated** - Client detects activated status, shows badge
4. **Team Creation** - Activated user creates team → becomes TeamAdmin
5. **Team Invites** - TeamAdmin invites others → InviteToken created
6. **Sync** - WebSocket connection per team for real-time updates

### Admin Portal Screens

1. **Login** - Admin credentials
2. **Dashboard** - Stats overview
3. **Pending Users** - Activate/Reject pending registrations
4. **All Users** - Search, filter, manage all users
5. **Teams** - Browse all teams
6. **Team Detail** - Members, roles, invites

### API Endpoints

**Auth:**
- `POST /api/auth/register` - New user registration
- `POST /api/auth/login` - User login
- `GET /api/auth/status` - Check activation status
- `GET /api/auth/verify` - Verify token + get user/team info

**Admin (admin role required):**
- `POST /api/admin/login`
- `GET /api/admin/users`
- `POST /api/admin/users/:id/activate`
- `POST /api/admin/users/:id/disable`
- `GET /api/admin/teams`
- `GET /api/admin/teams/:id`

**Teams:**
- `POST /api/teams` - Create team
- `GET /api/teams/:id/members`
- `POST /api/teams/:id/invite`
- `PATCH /api/teams/:id/members/:userId/role`

**Logs:**
- `GET /api/logs` - List with filters (teamId, level, source, search)
- `POST /api/logs` - Create log entry (TeamAdmin only)
- `PUT /api/logs/:id` - Update log entry (TeamAdmin only)
- `DELETE /api/logs/:id` - Delete log entry (TeamAdmin only)

**WebSocket:**
- `wss://server/ws/:teamId` - Real-time log stream + team updates

### Real-time Sync Architecture
- WebSocket per team connection
- Server broadcasts new log entries, member changes, role changes
- Desktop clients maintain local SQLite, merge conflicts by timestamp
- Auth via JWT token in WebSocket query parameter

## Deployment

### Docker (Server-side only)
The API server and PostgreSQL run in Docker containers:

```bash
# Start server + database
docker-compose up -d

# View logs
docker-compose logs -f app
docker-compose logs -f db

# Stop
docker-compose down

# Rebuild
docker-compose up -d --build
```

**Docker Compose services:**
- `app` - Node.js Express API server (port 3000)
- `db` - PostgreSQL 15 (port 5432)
- Schema auto-initializes from `server/src/schema.sql`

**Environment variables** (copy `.env.example` to `.env`):
- `DB_PASSWORD` - PostgreSQL password
- `JWT_SECRET` - JWT signing key
- `PORT` - Server port (default 3000)

**Desktop client runs locally** (no Docker required).

## COMMIT & PUSH POLICY

### ⚠️ IMPORTANT: Commit Rules

1. **DO NOT commit or push automatically.**
2. **Only commit and push to master when the user explicitly says:**
   > "Commit the changes"
3. When that command is given:
   - Stage all changes
   - Write a descriptive commit message summarizing what was built/changed
   - Push to `origin master`
4. Always update AGENTS.md to reflect new features, changes, or bug fixes
   - Commit AGENTS.md together with the feature changes

### Workflow
```
User: "Build feature X"
→ Agent: Implements feature X
→ Agent: Updates AGENTS.md
→ Agent: WAITS (no commit)

User: "Commit the changes"
→ Agent: git add . && git commit -m "..." && git push
```

## First Admin User

The seed script (`server/src/schema.sql`) includes the first admin user:
- **Email:** vj@eafx.com
- **Password:** Raid#2026#Logger#889977
- **Role:** admin
- **Status:** activated

## Build Commands

### Desktop Client
```bash
npm start           # Run desktop app
npm run dev         # Run with dev tools
npm run build       # Build installers for all platforms
npm run build:win   # Windows installer
npm run build:mac   # macOS DMG
npm run build:linux # Linux AppImage/DEB
```

### Server
```bash
cd server && npm start
cd server && npm run dev    # With nodemon
cd server && npm test
```

### Admin Portal (integrated in server)
Served automatically at `/lradmin` when server is running.

## Dependencies

### Desktop Client (package.json)
- electron
- electron-builder
- better-sqlite3
- electron-updater

### Server (server/package.json)
- express
- pg (PostgreSQL client)
- better-sqlite3 (dev/local)
- jsonwebtoken
- bcrypt
- ws (WebSocket)
- cors
- helmet
- dotenv
- uuid
