#!/bin/bash

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "jq is not installed. Please install jq before running this script."
    exit 1
fi

# Define source and destination connection details
sourceConnection="mongodb://username:password@sourceHost:sourcePort"
destConnection="mongodb://username:password@destHost:destPort"

# Iterate through databases
for database in $(mongo $sourceConnection --quiet --eval "db.adminCommand('listDatabases').databases" | jq -r '.[].name'); do
    # Iterate through collections in the current database
    for collection in $(mongo $sourceConnection/$database --quiet --eval "db.getCollectionNames()" | tr -d '[],'); do
        # Export collection from sourceConnection
        mongoexport --uri $sourceConnection/$database --collection $collection --out $collection.json

        # Import collection to destConnection
        mongoimport --uri $destConnection/$database --collection $collection --file $collection.json
    done
done

