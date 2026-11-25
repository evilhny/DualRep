# DualRep

### Push together. Stay consistent.

**DualRep is a self-hosted push-up tracking Progressive Web App (PWA) built specifically for two people: Icefox and Damian.**

Icefox and Damian share one dashboard to log push-up workouts, track consistency, protect streaks with rest days, and motivate each other. Each person's activity is tracked separately, while both can see the shared training journey.


## Features

- **Designed for two people:** Built specifically around the two users, **Icefox** and **Damian**.
- **Individual activity tracking:** Keep each person's workout history and progress separate.
- **Push-up logging:** Record sets and repetitions for supported push-up variations.
- **Progress dashboard:** View current streaks, weekly totals, and recent activity.
- **Shared activity calendar:** See both users' workout activity in one monthly calendar.
- **Manual rest days:** Mark a rest day for either person. Rest days protect the streak without adding push-up repetitions.
- **Weekly activity chart:** Compare daily activity and distinguish rest days from workout days.
- **Discord notifications:** Optional workout reminders and partner activity notifications.
- **Personal notification settings:** Configure notification preferences independently.
- **Progressive Web App:** Install DualRep on supported devices for an app-like experience.
- **Self-hosted data:** Store workout and application data in your own PostgreSQL database.

## Screenshots

![DualRep Dashboard](docs/screenshots/dashboard.png)

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | React, TypeScript |
| Build tool | Vite |
| Styling | CSS |
| Icons | Lucide React |
| PWA | vite-plugin-pwa |
| Backend | Node.js, Express |
| Database | PostgreSQL |
| Database driver | node-postgres (`pg`) |
| Notifications | Discord integration |

## Project Structure

```text
DualRep/
├── client/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── api.ts
│   │   ├── App.tsx
│   │   └── ...
│   ├── package.json
│   └── vite.config.ts
│
├── server/
│   ├── auth.js
│   ├── database.js
│   ├── index.js
│   ├── package.json
│   └── ...
│
└── .gitignore
```

## Getting Started

### Prerequisites

- Node.js 24 (recommended)
- npm
- Git
- PostgreSQL

### 1. Clone the repository

```bash
git clone https://github.com/evilhny/DualRep.git
cd DualRep
```

### 2. Set up PostgreSQL

Install PostgreSQL if it is not already installed.

Create a database and a dedicated application user.

Open the PostgreSQL shell:

```bash
sudo -u postgres psql
```

Execute the following SQL:

```sql
CREATE USER dualrep_appuser WITH PASSWORD 'your_secure_password';

CREATE DATABASE dualrep OWNER dualrep_appuser;
```

Exit PostgreSQL:

```sql
\q
```

The application uses PostgreSQL for persistent storage. Its database connection is configured through environment variables.

### 3. Install backend dependencies

```bash
cd server
npm install
```

### 4. Configure environment variables

Create a `.env` file inside the `server` directory.

```env
# PostgreSQL connection
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=dualrep
PGUSER=dualrep_appuser
PGPASSWORD=your_secure_password

# Optional Discord integration
DISCORD_BOT_TOKEN=
DISCORD_ICEFOX_USER_ID=
DISCORD_DAMIAN_USER_ID=
```

**Important:**
- Replace the PostgreSQL password with the password configured in Step 2.
- Keep `.env` private and never commit it to Git.
- For production deployments, use secure environment-variable management rather than committing credentials.
- PostgreSQL should not be exposed publicly unless there is a specific requirement and appropriate network security.

### 5. Start the backend

From the `server` directory:

```bash
npm start
```

The backend listens on:

```text
http://127.0.0.1:3001
```

### 6. Install frontend dependencies

Open a second terminal:

```bash
cd DualRep/client
npm install
```

### 7. Start the frontend development server

```bash
npm run dev
```

Vite starts the development server and proxies `/api` requests to the backend on port `3001`.

Open the local URL displayed by Vite.

## Production Build

Build the frontend:

```bash
cd client
npm run build
```

The production build is generated in:

```text
client/dist/
```

Start the backend from the server directory:

```bash
cd server
npm start
```

For a public deployment:

- Use a reverse proxy such as Nginx.
- Configure HTTPS.
- Keep PostgreSQL accessible only to trusted connections.
- Configure application environment variables securely.
- Run the backend using a process manager such as PM2 or systemd.

## Database and Backups

DualRep uses **PostgreSQL** as its primary database, accessed through the Node.js `pg` package.

The database stores application data such as:

- User and session information.
- Workout sets and repetition counts.
- Push-up variation types.
- Manual rest-day records.
- Notification preferences.
- Discord reminder settings.

### Database backups

Use PostgreSQL's `pg_dump` utility to create backups.

Example:

```bash
pg_dump -h 127.0.0.1 \
  -U dualrep_appuser \
  -d dualrep \
  -F c \
  -f dualrep-backup.dump
```

You can restore a backup using:

```bash
pg_restore -h 127.0.0.1 \
  -U dualrep_appuser \
  -d dualrep \
  --clean --if-exists \
  dualrep-backup.dump
```

**Backup recommendations:**

- Schedule regular database backups.
- Keep backup files outside the application directory.
- Store a copy somewhere separate from the VPS.
- Never commit database backups, credentials, or `.env` files to Git.

## Discord Integration

Discord integration is optional. When configured, DualRep can send workout reminders and partner activity notifications.

Configure the following environment variables in `server/.env`:

```env
DISCORD_BOT_TOKEN=
DISCORD_ICEFOX_USER_ID=
DISCORD_DAMIAN_USER_ID=
```

The core workout-tracking features do not require Discord credentials.

## The Two Users

DualRep is intentionally designed for these two participants:

| User | Purpose |
|---|---|
| **Icefox** | Tracks personal push-up activity and progress |
| **Damian** | Tracks personal push-up activity and progress |

Both users share the same application and calendar, while their workout records and progress remain associated with the correct person.

## Contributing

DualRep is a personal project. Suggestions, bug reports, and improvements are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Test the frontend and backend.
5. Submit a pull request.

## License

No license has been specified yet. Unless a license is added to this repository, all rights are reserved.
