#!/bin/bash
# Creates one isolated database and owner role per microservice (database-per-service).
# Reads a comma-separated list from POSTGRES_MULTIPLE_DATABASES; each role is named "<db>_user".
set -euo pipefail

readonly SERVICE_PASSWORD="${SERVICE_DB_PASSWORD:-service_password}"

create_user_and_database() {
  local database_name="$1"
  local user_name="${database_name}_user"
  echo "Creating user '${user_name}' and database '${database_name}'"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${user_name}') THEN
        CREATE ROLE ${user_name} WITH LOGIN PASSWORD '${SERVICE_PASSWORD}' CREATEDB;
      END IF;
    END
    \$\$;
    SELECT 'CREATE DATABASE ${database_name} OWNER ${user_name}'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${database_name}')\gexec
    GRANT ALL PRIVILEGES ON DATABASE ${database_name} TO ${user_name};
EOSQL
}

if [ -z "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
  echo "POSTGRES_MULTIPLE_DATABASES is empty; skipping."
  exit 0
fi

IFS=',' read -ra DATABASES <<< "$POSTGRES_MULTIPLE_DATABASES"
for database_name in "${DATABASES[@]}"; do
  create_user_and_database "$(echo "$database_name" | xargs)"
done
echo "All service databases created."
