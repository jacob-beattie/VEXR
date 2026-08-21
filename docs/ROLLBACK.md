# Rollback & Recovery

What happens when a deploy or a database change goes wrong. See
[`docs/review/11-deployment.md`](review/11-deployment.md) §4 for the audit that produced this doc.

## Vercel (frontend) — safe, one-click

Vercel deployments are immutable and atomic. Roll back by promoting a previous deployment in the
Vercel dashboard (Deployments → select a prior one → "Promote to Production"). No data is at risk
— this only changes which built frontend bundle is served.

## Supabase schema changes (`apply_migration`) — forward-only, no automated rollback

Every DDL change goes through `apply_migration` (per `CLAUDE.md`'s workflow rules) and lands as a
new migration. **There is no down-migration convention or tooling in this project** — undoing a
bad migration means hand-writing and applying a reverse migration, not running a known-good
rollback script.

**Convention going forward:** any migration that `alter`s or `drop`s an existing column/table
(as opposed to a purely additive change — new table, new nullable column) must include the
reverse `alter` as a SQL comment at the top of the same migration file, e.g.:

```sql
-- Rollback: alter table profiles add column max_hr integer;
alter table profiles drop column max_hr;
```

This doesn't make the change automatically reversible, but it means a rollback under pressure is
"run the commented-out statement" instead of "reconstruct what the column looked like from git
history and hope." `CLAUDE.md`'s existing confirm-first rule (state what a destructive migration
will do and get explicit confirmation before running it) remains the primary defense — this is a
cheap addition on top of it, not a replacement for it.

`supabase-schema.sql` (kept in sync by hand on every schema change, per `CLAUDE.md`) plus git
history is the only record of "what the schema looked like at any point in time" — Supabase's own
migration history is thin (most of the schema predates migration tracking; see
`docs/review/11-deployment.md` §2) and can't be used to diff or replay to an earlier state.

## Data-level mistakes (`execute_sql` UPDATE/DELETE) — depends on PITR, status not yet confirmed

A bad `UPDATE`/`DELETE` run via `execute_sql` has no application-level undo. The only possible
recovery is Supabase's point-in-time recovery (PITR) or daily backups, and **whether either is
enabled on this project has not been confirmed** — it's a project/billing setting (Dashboard →
Settings → Database → Backups), not something queryable via SQL (the underlying
`wal_level`/`archive_mode` Postgres settings are on by default on Supabase-managed databases
regardless of whether the PITR product feature itself is purchased/enabled, so they don't prove
PITR is actually available for this project).

**Action item, not yet done:** confirm in the Supabase dashboard whether PITR or daily backups are
enabled for this project, and if so, the retention window. Until that's confirmed:

**Assume recovery from a destructive `execute_sql` is not possible.** The only real safeguard
today is prevention — `CLAUDE.md`'s rule that any `execute_sql` updating/deleting existing rows
must be confirmed before running. If backups turn out to be enabled, update this doc with the
actual retention window and the dashboard steps to restore from a backup; if they're not enabled,
the honest recovery plan for a destructive mistake is "there isn't one — restore from whatever the
user's own device/export state allows, and turn on backups going forward."
