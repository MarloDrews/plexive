#!/usr/bin/env bash
# tools/backup_supabase.sh
#
# Takes an off-platform copy of the Plexive database. Supabase's free tier
# performs NO automatic backups, so until that changes this script is the only
# thing standing between a mistake and starting the database again from nothing.
#
# A SCRIPT YOU RUN. There is no scheduling, no timer and no automation touching
# production. It is deliberately manual, and deliberately run from the LAPTOP
# rather than the Pi: the Pi is one device with one SD card at home and is
# already recorded in docs/SERVER.md as a single point of failure, so a dump
# stored on it moves the risk instead of removing it. Running it on the Pi and
# copying it off afterwards works, and is the version people stop doing after
# the third time.
#
# THE MANIFEST IS THE PART THAT PAYS FOR ITSELF. A dump is worth something only
# if somebody restores it. The manifest is worth something the moment it exists,
# because it is the first written record anyone has kept of what production
# actually contains -- row counts per table, row-level-security state, and the
# policy list. Keep the manifests even if you throw the dumps away. Filenames
# are timestamped and nothing here overwrites: a sequence of manifests is a
# schema and growth history that is otherwise not being kept at all.
#
# Usage:
#   bash tools/backup_supabase.sh
#   PLEXIVE_BACKUP_DIR=/d/plexive-backups bash tools/backup_supabase.sh
#   PLEXIVE_BACKUP_URL="postgresql://..." bash tools/backup_supabase.sh   # e.g. a throwaway DB
#
# Needs the PostgreSQL client tools (pg_dump, pg_restore, psql) on PATH. On
# Windows install them with:  winget install --id PostgreSQL.PostgreSQL.17 -e
# and match the major version to the SERVER, see the version check below.

set -uo pipefail

# The dump contains every user row, including email addresses and bcrypt
# password hashes. THIS REPOSITORY IS PUBLIC. The default output directory is
# therefore outside the working tree, and the script refuses to write inside it.
PLEXIVE_BACKUP_DIR="${PLEXIVE_BACKUP_DIR:-$HOME/plexive-backups}"

# Not named DATABASE_URL by default so that merely having backend/.env sourced
# is never enough to dump production by accident; DATABASE_URL is still accepted
# as the fallback because that is where the URL actually lives.
PLEXIVE_BACKUP_URL="${PLEXIVE_BACKUP_URL:-${DATABASE_URL:-}}"

# Floors. Every check here asserts on a COUNT rather than an exit code, because
# pg_dump exits 0 having written an empty file, psql exits 0 having selected
# nothing, and a backup script that succeeds silently is the failure shape this
# project keeps finding.
MIN_TOC_ENTRIES="${PLEXIVE_MIN_TOC_ENTRIES:-40}"   # pg_restore --list entries
MIN_TOTAL_ROWS="${PLEXIVE_MIN_TOTAL_ROWS:-1}"      # summed over public tables

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

fatal () { echo "FATAL: $*" >&2; exit 1; }

# --- preflight: the tools ---------------------------------------------------

for tool in pg_dump pg_restore psql; do
  command -v "$tool" >/dev/null 2>&1 || fatal "$tool is not on PATH.
       Install the PostgreSQL client tools and re-run:
         winget install --id PostgreSQL.PostgreSQL.17 -e
       Match the major version to the SERVER (see below): pg_dump REFUSES to run
       against a server newer than itself, and a dump taken with a NEWER major
       can fail to restore back into an older server."
done

[ -n "$PLEXIVE_BACKUP_URL" ] || fatal "no database URL.
       Set PLEXIVE_BACKUP_URL, or DATABASE_URL, to the connection string.
       There is deliberately no default: a backup script that guesses which
       database it is talking to is a restore that surprises somebody."

# --- preflight: where the files go ------------------------------------------

# Resolve BEFORE creating anything: a refusal that has already made a directory
# called "backups" inside a public repository is a confusing refusal.
OUT_ABS="$(realpath -m "$PLEXIVE_BACKUP_DIR" 2>/dev/null)"
[ -n "$OUT_ABS" ] || case "$PLEXIVE_BACKUP_DIR" in
  /*|[A-Za-z]:*) OUT_ABS="$PLEXIVE_BACKUP_DIR" ;;
  *) OUT_ABS="$PWD/$PLEXIVE_BACKUP_DIR" ;;
esac
case "$OUT_ABS/" in
  "$REPO_ROOT"/*) fatal "refusing to write into the repository ($OUT_ABS).
       This repository is PUBLIC and the dump contains every user's email
       address and bcrypt password hash. Point PLEXIVE_BACKUP_DIR somewhere
       outside $REPO_ROOT." ;;
esac

mkdir -p "$OUT_ABS" 2>/dev/null
[ -d "$OUT_ABS" ] || fatal "cannot create $OUT_ABS"

DUMP="$OUT_ABS/plexive-$TS.dump"
SCHEMA="$OUT_ABS/plexive-$TS-schema.sql"
MANIFEST="$OUT_ABS/plexive-$TS-manifest.txt"

# --- preflight: versions ----------------------------------------------------

CLIENT_V="$(pg_dump --version | sed -E 's/.* ([0-9]+).*/\1/')"

echo "Plexive database backup"
echo "-----------------------"
echo "target dir : $OUT_ABS"
# Host only. Never the whole URL: it carries the password.
echo "host       : $(echo "$PLEXIVE_BACKUP_URL" | sed -E 's#.*@([^/?]*).*#\1#')"
echo "pg_dump    : major $CLIENT_V"

case "$PLEXIVE_BACKUP_URL" in
  *:6543*) echo
           echo "WARNING: port 6543 is Supabase's transaction pooler (pgbouncer)."
           echo "         pg_dump needs a session, not a pooled transaction. Use the"
           echo "         direct connection on port 5432 if this run fails." ;;
esac

# psql.exe on Windows ends every row with CRLF, so a captured field arrives
# carrying a trailing \r. That is NOT cosmetic: $((TOTAL_ROWS + n)) on "41\r" is
# a bash arithmetic SYNTAX ERROR, which left the total at 0 and made this script
# FATAL at its own row floor on EVERY Windows run -- so the laptop, which this
# script names as its primary host, could not produce a dump at all. Measured
# 2026-08-28 with od -c. Every psql capture below therefore strips \r.
SERVER_VFULL="$(psql "$PLEXIVE_BACKUP_URL" -tAc 'show server_version' 2>/dev/null | tr -d '\r')"
if [ -z "$SERVER_VFULL" ]; then
  fatal "could not connect, or could not read server_version.
       Nothing was written. Check the URL, the network, and that the database
       accepts connections from this machine."
fi
SERVER_V="$(echo "$SERVER_VFULL" | sed -E 's/^([0-9]+).*/\1/')"
echo "server     : major $SERVER_V ($SERVER_VFULL)"

if [ "$CLIENT_V" -lt "$SERVER_V" ]; then
  fatal "pg_dump is major $CLIENT_V and the server is major $SERVER_V.
       pg_dump refuses to dump a server newer than itself, so this would fail
       part-way and leave a file that looks like a backup. Install the matching
       client: winget install --id PostgreSQL.PostgreSQL.$SERVER_V -e"
fi
if [ "$CLIENT_V" -gt "$SERVER_V" ]; then
  echo "note       : client is NEWER than the server. The dump will be taken"
  echo "             correctly, but restoring it back into a major-$SERVER_V"
  echo "             server can fail on syntax the older server does not know."
  echo "             Prefer a major-$SERVER_V client for a dump you intend to"
  echo "             restore into this same database."
fi
echo

# --- preflight: row-level security vs the DUMPING role ----------------------
# pg_dump runs every COPY with row_security = off. That does NOT dump a visible
# subset -- PostgreSQL ERRORS. So a role that is neither superuser, nor BYPASSRLS,
# nor the table's owner cannot back up an RLS-enabled table AT ALL, and pg_dump
# aborts part-way leaving a truncated file that looks like a backup.
#
# Measured 2026-08-28 on a local PostgreSQL 17.11 against exactly that shape:
#   pg_dump: error: query failed: ERROR: row-level security policy for table
#            "t_alien" would affect the query
#   pg_dump: detail: Query was: COPY public.t_alien (id, owner, payload) TO stdout;
#
# This guard exists so that arrives as a sentence naming the tables and the
# reason, rather than as pg_dump's error after a partial write. It asserts on a
# COUNT of blocking tables, like every other check here.
ROLE_EXEMPT="$(psql "$PLEXIVE_BACKUP_URL" -tAc   "select (rolsuper or rolbypassrls) from pg_roles where rolname = current_user;"   2>/dev/null | tr -d '\r')"

# A table blocks when RLS is on and the role is not exempt for it. Ownership
# normally exempts the owner -- unless FORCE ROW LEVEL SECURITY is set, which
# subjects the owner too, so that case is included rather than assumed away.
RLS_BLOCKERS="$(psql "$PLEXIVE_BACKUP_URL" -tAc "
  select n.nspname || '.' || c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relrowsecurity
    and c.relkind in ('r','p')
    and n.nspname not in ('pg_catalog','information_schema')
    and n.nspname !~ '^pg_toast'
    and (pg_get_userbyid(c.relowner) <> current_user or c.relforcerowsecurity)
  order by 1;" 2>/dev/null | tr -d '\r')"

BLOCK_COUNT="$(echo "$RLS_BLOCKERS" | grep -c '[^[:space:]]')"
echo "rls        : role exempt (superuser or BYPASSRLS) = ${ROLE_EXEMPT:-unknown}, ${BLOCK_COUNT} RLS table(s) not readable by ownership"

if [ "$ROLE_EXEMPT" != "t" ] && [ "$BLOCK_COUNT" -gt 0 ]; then
  fatal "row-level security blocks this backup, and nothing was written.

       This role is neither superuser nor BYPASSRLS, and these $BLOCK_COUNT table(s)
       have row-level security enabled but are not owned by it:

$(echo "$RLS_BLOCKERS" | sed 's/^/         /')

       pg_dump issues every COPY with row_security = off, and PostgreSQL then
       ERRORS instead of dumping the rows this role happens to see. The dump
       would abort part-way and leave a truncated file that looks like a backup.

       Connect as a role that owns those tables, or as one with BYPASSRLS:
         ALTER ROLE <role> BYPASSRLS;      -- needs superuser
       On Supabase the postgres role has BYPASSRLS (rolsuper false). Check with:
         select rolsuper, rolbypassrls from pg_roles where rolname = current_user;"
fi

# --- the measurements, taken BEFORE the dump --------------------------------
# These are what make the manifest worth more than the dump.

echo "Reading what is actually there..."
# row_security=off is what pg_dump uses. Without it this query silently returns
# FEWER rows for an RLS table this role does not own -- measured 2026-08-28 as
# 0 for a table holding 6 -- and the manifest, whose entire purpose is to be
# compared against after a restore, records a plausible WRONG number.
# It goes in PGOPTIONS rather than as a "set" inside -c: psql echoes the SET
# command tag as a row, and that line appeared in the manifest table listing.
ROWCOUNTS="$(PGOPTIONS='-c row_security=off' psql "$PLEXIVE_BACKUP_URL" -tAF'|' -c "
  select table_schema || '.' || table_name,
         (xpath('/row/c/text()',
                query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
                             false, true, '')))[1]::text::bigint
  from information_schema.tables
  where table_type = 'BASE TABLE'
    and table_schema in ('public','auth','storage')
  order by 1;" 2>/dev/null | tr -d '\r')"

RLS="$(psql "$PLEXIVE_BACKUP_URL" -tAF'|' -c "
  select schemaname || '.' || tablename, rowsecurity
  from pg_tables where schemaname in ('public','auth','storage') order by 1;" 2>/dev/null | tr -d '\r')"

POLICIES="$(psql "$PLEXIVE_BACKUP_URL" -tAF'|' -c "
  select schemaname || '.' || tablename, policyname, cmd
  from pg_policies order by 1,2;" 2>/dev/null | tr -d '\r')"

TOTAL_ROWS=0
PUBLIC_TABLES=0
while IFS='|' read -r name n; do
  [ -n "$name" ] || continue
  case "$name" in public.*) PUBLIC_TABLES=$((PUBLIC_TABLES + 1)); TOTAL_ROWS=$((TOTAL_ROWS + n)) ;; esac
done <<< "$ROWCOUNTS"

STORAGE_OBJECTS="$(echo "$ROWCOUNTS" | awk -F'|' '$1=="storage.objects"{print $2}')"
AUTH_USERS="$(echo "$ROWCOUNTS" | awk -F'|' '$1=="auth.users"{print $2}')"
[ -n "$STORAGE_OBJECTS" ] || STORAGE_OBJECTS="n/a (schema not readable)"
[ -n "$AUTH_USERS" ] || AUTH_USERS="n/a (schema not readable)"

printf '%-42s %10s\n' "TABLE" "ROWS"
while IFS='|' read -r name n; do
  [ -n "$name" ] || continue
  printf '%-42s %10s\n' "$name" "$n"
done <<< "$ROWCOUNTS"
echo
echo "public tables: $PUBLIC_TABLES, rows in public: $TOTAL_ROWS"

if [ "$TOTAL_ROWS" -lt "$MIN_TOTAL_ROWS" ]; then
  fatal "public schema holds $TOTAL_ROWS rows, floor is $MIN_TOTAL_ROWS.
       Either this is the wrong database, or the counting query returned
       nothing. Refusing to write a dump that would look like a backup of a
       database that is not this one."
fi
echo

# --- the dumps --------------------------------------------------------------
# No --schema filter. Everything the role can read is dumped, so the question
# "which schema holds the accounts" is answered by the row counts above rather
# than assumed. --no-owner/--no-privileges are deliberately NOT used: they would
# strip ownership and grants, and ownership is exactly what row-level security
# depends on when it is restored.

echo "Dumping (custom format, restorable)..."
pg_dump --format=custom --file="$DUMP" "$PLEXIVE_BACKUP_URL"
DUMP_RC=$?
[ $DUMP_RC -eq 0 ] || fatal "pg_dump exited $DUMP_RC. The file at $DUMP is not a backup; delete it."

echo "Dumping (plain schema, for reading and diffing)..."
pg_dump --schema-only --file="$SCHEMA" "$PLEXIVE_BACKUP_URL"
SCHEMA_RC=$?
[ $SCHEMA_RC -eq 0 ] || fatal "pg_dump --schema-only exited $SCHEMA_RC."

# --- assert the dump is a dump ----------------------------------------------
# Not the file size: a truncated file has a plausible size. pg_restore --list
# parses the archive's table of contents, so a non-zero count proves the archive
# is readable AND says how much is in it.

TOC="$(pg_restore --list "$DUMP" 2>/dev/null | grep -cv '^;')"
echo
echo "archive check: $TOC restorable entries (floor $MIN_TOC_ENTRIES)"
if [ "$TOC" -lt "$MIN_TOC_ENTRIES" ]; then
  fatal "the archive lists $TOC entries, below the floor of $MIN_TOC_ENTRIES.
       pg_dump exited 0, so this would have passed unnoticed. Treat $DUMP as
       unusable."
fi

DUMP_SIZE="$(wc -c < "$DUMP" | tr -d ' ')"
SCHEMA_SIZE="$(wc -c < "$SCHEMA" | tr -d ' ')"

# --- the manifest -----------------------------------------------------------

{
  echo "Plexive backup manifest"
  echo "======================="
  echo "taken            : $TS (UTC)"
  echo "by               : tools/backup_supabase.sh"
  echo "repo commit      : $(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo 'unknown')"
  echo "repo clean       : $([ -z "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)" ] && echo yes || echo 'NO -- working tree had uncommitted changes')"
  echo "server version   : $SERVER_VFULL"
  echo "pg_dump major    : $CLIENT_V"
  echo "dump file        : $(basename "$DUMP") ($DUMP_SIZE bytes, $TOC entries)"
  echo "schema file      : $(basename "$SCHEMA") ($SCHEMA_SIZE bytes)"
  echo
  echo "ROW COUNTS"
  echo "----------"
  printf '%-42s %10s\n' "TABLE" "ROWS"
  while IFS='|' read -r name n; do
    [ -n "$name" ] || continue
    printf '%-42s %10s\n' "$name" "$n"
  done <<< "$ROWCOUNTS"
  echo
  echo "public tables: $PUBLIC_TABLES, rows in public: $TOTAL_ROWS"
  echo
  echo "ROW LEVEL SECURITY (the baseline to compare against AFTER any restore)"
  echo "---------------------------------------------------------------------"
  printf '%-42s %10s\n' "TABLE" "RLS"
  while IFS='|' read -r name on; do
    [ -n "$name" ] || continue
    printf '%-42s %10s\n' "$name" "$on"
  done <<< "$RLS"
  echo
  echo "POLICIES"
  echo "--------"
  if [ -z "$POLICIES" ]; then
    echo "(none)"
  else
    while IFS='|' read -r tbl pol cmd; do
      [ -n "$tbl" ] || continue
      printf '%-42s %-30s %s\n' "$tbl" "$pol" "$cmd"
    done <<< "$POLICIES"
  fi
  echo
  echo "NOT COVERED BY THIS BACKUP"
  echo "--------------------------"
  echo "  - Supabase Storage OBJECTS. The files themselves are not in any"
  echo "    PostgreSQL dump and are not backed up by any Supabase tier. Only the"
  echo "    storage.objects metadata rows are here: $STORAGE_OBJECTS of them. A"
  echo "    restore brings those rows back pointing at images that are gone."
  echo "  - Database ROLES and their passwords (pg_dumpall --roles-only is a"
  echo "    separate command needing a separate privilege)."
  echo "  - Anything outside the database: the Vercel project, the Cloudflare"
  echo "    tunnel credentials, and /etc/deepscroll/backend.env on the Pi."
  echo "    See the 'Secrets vom Pi herunterholen' section of docs/SERVER.md."
} > "$MANIFEST"

# --- what the operator sees, in the order that matters ----------------------

echo
echo "Wrote:"
printf '  %-14s %s (%s bytes)\n' "dump"     "$DUMP"   "$DUMP_SIZE"
printf '  %-14s %s (%s bytes)\n' "schema"   "$SCHEMA" "$SCHEMA_SIZE"
echo
echo "NOT COVERED, and this is not a footnote:"
echo "  - Supabase Storage OBJECTS are NOT in this dump. Only their metadata"
echo "    rows are ($STORAGE_OBJECTS in storage.objects). Restoring this gives you"
echo "    rows pointing at images that no longer exist. The bucket has to be"
echo "    copied separately, by hand, and no Supabase tier backs it up."
echo "  - ROW LEVEL SECURITY is captured in the dump, but enabling it on restore"
echo "    requires table ownership. A restore under a non-owner role can come"
echo "    back with RLS OFF and still report success. That is a security"
echo "    incident wearing the costume of a clean restore, so after ANY restore"
echo "    compare against the RLS table in the manifest -- do not assume."
echo "  - Database roles and their passwords."
echo "  - Everything outside the database (Vercel, Cloudflare, the Pi's env file)."
echo
echo "accounts note: rows in auth.users = $AUTH_USERS. Plexive does not use"
echo "  Supabase Auth -- accounts live in public.users with a bcrypt hash and a"
echo "  self-issued JWT -- so a low or zero number here is expected, not a"
echo "  missing backup. public.users is the row count that matters."
echo
echo "KEEP THE MANIFEST. The dump is only worth something if somebody restores"
echo "it; the manifest is worth something now, because it is the only written"
echo "record of what production contained on this date. Nothing here overwrites"
echo "and every filename is timestamped, so do not prune them: the sequence is a"
echo "schema and growth history nobody is otherwise keeping."
echo
echo "  manifest: $MANIFEST"
