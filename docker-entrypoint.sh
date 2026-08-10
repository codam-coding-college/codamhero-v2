#!/bin/sh
set -e

# NO_INTRA_SYNC can be set either as an environment variable or in the .env file that the
# application itself reads through dotenv, so check both. The environment variable wins,
# just like it does in dotenv.
if [ -z "$NO_INTRA_SYNC" ] && [ -f .env ]; then
	NO_INTRA_SYNC="$(grep -m1 '^NO_INTRA_SYNC=' .env | cut -d= -f2- | tr -d '\r"'"'" )"
fi

# Instances that do not synchronize with Intra never write to the database, so they leave
# the schema alone too: the migrations are owned by whichever instance does sync.
if [ "$NO_INTRA_SYNC" = "true" ]; then
	echo "NO_INTRA_SYNC is true, skipping database migrations."
else
	npx prisma migrate deploy
fi

exec node build/main.js "$@"
