# HackUTD workspace

Starter full-stack app for the NVIDIA and CBRE tracks.

## Stack

- Next.js and TypeScript frontend
- Next.js Route Handlers for the backend API
- Supabase PostgreSQL for cloud persistence
- Supabase Storage/Auth can be added without changing the app structure

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` from `.env.example` and add the project URL and anon key
   from the Supabase dashboard.

3. Run `supabase/migrations/001_initial_schema.sql` in the Supabase SQL Editor.

4. Start the app:

   ```bash
   npm run dev
   ```

The frontend is available at `http://localhost:3000`. The API includes:

- `GET /api/health` - checks environment configuration and Supabase connectivity
- `GET /api/projects` - lists projects
- `POST /api/projects` - creates a project from `{ "name": "...", "description": "..." }`