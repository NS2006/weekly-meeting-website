-- One-time local setup: the app's own role and its two databases (the second one is Prisma Migrate's shadow database).
-- Run as the PostgreSQL superuser, passing the password that backend/.env uses:
--   psql -h localhost -U postgres -v app_password=<password from .env> -f src/database/setup-local.sql
-- The role owns only its databases: no superuser and no create-database rights. Safe to run again.

SELECT format('CREATE ROLE weekly_meeting LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'weekly_meeting')
\gexec

SELECT 'CREATE DATABASE weekly_meeting OWNER weekly_meeting'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'weekly_meeting')
\gexec

SELECT 'CREATE DATABASE weekly_meeting_shadow OWNER weekly_meeting'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'weekly_meeting_shadow')
\gexec
