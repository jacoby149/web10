#!/bin/bash

# get the db env variables.
if [ ! -f ./.env ]; then
    echo ".env is not available. make a .env file from the .env_example, and add DB connections."
    exit 1
fi

# source the db connections
source '.env'

# checking for the existence of the connections.
if [ -z "${sourceConnection}" ]; then
    echo ".env is available, but sourceConnection is unset or set to the empty string."
    exit 1
fi
if [ -z "${destConnection}" ]; then
    echo ".env is available, but destConnection is unset or set to the empty string."
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "jq is not installed. Please install jq before running this script."
    exit 1
fi

# Iterate through databases
for database in $(mongosh $sourceConnection --quiet --eval "db.adminCommand('listDatabases').databases" | jq -r '.[].name'); do
    # Iterate through collections in the current database
    for collection in $(mongosh $sourceConnection/$database --quiet --eval "db.getCollectionNames()" | tr -d '[],'); do
        # Export collection from sourceConnection
        mongoexport --uri $sourceConnection/$database --collection $collection --out $collection.json

        # Import collection to destConnection
        mongoimport --uri $destConnection/$database --collection $collection --file $collection.json
    done
done

