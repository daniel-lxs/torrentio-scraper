#!/bin/bash

# Check if an API key was provided
if [ -z "$1" ]; then
  echo "Usage: $0 <OMDB_API_KEY>"
  echo "You can get a free API key from http://www.omdbapi.com/apikey.aspx"
  exit 1
fi

# Get the API key from the command line argument
OMDB_API_KEY=$1

# Find the .env file
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  # If .env doesn't exist, check for .env.example
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "Created .env file from .env.example"
  else
    # Create a new .env file
    touch .env
    echo "Created new .env file"
  fi
fi

# Check if OMDB_API_KEY already exists in the .env file
if grep -q "^OMDB_API_KEY=" "$ENV_FILE"; then
  # Replace the existing OMDB_API_KEY line
  sed -i "s/^OMDB_API_KEY=.*/OMDB_API_KEY=$OMDB_API_KEY/" "$ENV_FILE"
  echo "Updated OMDB_API_KEY in $ENV_FILE"
else
  # Add the OMDB_API_KEY to the .env file
  echo "OMDB_API_KEY=$OMDB_API_KEY" >> "$ENV_FILE"
  echo "Added OMDB_API_KEY to $ENV_FILE"
fi

echo "OMDB API key has been set successfully!"
echo "You can now restart the application for the changes to take effect." 