# Perfect Shapes Global

Vercel-ready Perfect Shapes with a global top-20 leaderboard for every shape.

## One-time Vercel setup

1. Import this folder as a new Vercel project.
2. In the Vercel project, open **Storage**, create a **Neon Postgres** database, and connect it.
3. Confirm Vercel added `DATABASE_URL` to the project environment variables.
4. Redeploy. The API creates its table and index automatically on first use.

For local development, copy `.env.example` to `.env.local`, add a Postgres connection string, run `npm install`, then `npm run dev`.

Each shape has its own top 20. A name is requested only when the score reaches the cutoff. A tie with 20th place is decided by a server-side 50/50 coin flip.

