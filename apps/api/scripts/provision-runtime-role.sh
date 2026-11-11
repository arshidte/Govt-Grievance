#!/usr/bin/env bash
# ============================================================================
# Provision the least-privilege PostgreSQL runtime role (M4D, Part B).
#
# Connects with the MIGRATION/ADMIN identity and applies prisma/sql/runtime-role.sql
# (idempotent). Run AFTER `prisma migrate deploy` so the table-level grants cover
# every application table.
#
# Environment:
#   DIRECT_DATABASE_URL  admin/migration connection string (preferred).
#                        Falls back to DATABASE_URL if unset.
#   RUNTIME_DB_USER      runtime role name            (default: app_runtime)
#   RUNTIME_DB_PASSWORD  runtime role password        (REQUIRED — never commit)
#   RUNTIME_DB_NAME      application database name     (default: panchayat)
#   MIGRATION_DB_USER    schema owner / migration role (default: postgres)
#
# Example:
#   RUNTIME_DB_PASSWORD='choose-a-strong-pw' pnpm --filter @pg/api db:provision-runtime-role
# ============================================================================
set -euo pipefail

ADMIN_URL="${DIRECT_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "${ADMIN_URL}" ]]; then
  echo "error: set DIRECT_DATABASE_URL (admin/migration connection) or DATABASE_URL" >&2
  exit 1
fi

# Prisma connection strings may carry a `?schema=` query parameter, which
# psql/libpq rejects ("invalid URI query parameter"). Strip it — our DDL lives
# in `public`, already on the default search_path. Any other params are kept.
ADMIN_URL="$(printf '%s' "${ADMIN_URL}" \
  | sed -E 's/([?&])schema=[^&]*(&?)/\1/; s/\?&/?/; s/[?&]$//')"

RUNTIME_USER="${RUNTIME_DB_USER:-app_runtime}"
RUNTIME_PASSWORD="${RUNTIME_DB_PASSWORD:?set RUNTIME_DB_PASSWORD to the runtime role password}"
DB_NAME="${RUNTIME_DB_NAME:-panchayat}"
OWNER="${MIGRATION_DB_USER:-postgres}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="${SCRIPT_DIR}/../prisma/sql/runtime-role.sql"

if ! command -v psql >/dev/null 2>&1; then
  echo "error: psql (postgresql-client) is required but not installed" >&2
  exit 1
fi

psql "${ADMIN_URL}" \
  --set ON_ERROR_STOP=1 \
  --set runtime_user="${RUNTIME_USER}" \
  --set runtime_password="${RUNTIME_PASSWORD}" \
  --set db_name="${DB_NAME}" \
  --set owner="${OWNER}" \
  --file "${SQL_FILE}"

echo "✓ Runtime role '${RUNTIME_USER}' provisioned on database '${DB_NAME}' (least-privilege)."
