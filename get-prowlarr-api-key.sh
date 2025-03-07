#!/bin/bash

# This script helps you get the Prowlarr API key and update the .env file

# Check if Prowlarr is running
if ! docker ps | grep -q torrentio-prowlarr; then
  echo "Error: Prowlarr container is not running."
  echo "Please start the services with 'docker-compose up -d' first."
  exit 1
fi

echo "Waiting for Prowlarr to be fully initialized..."
sleep 5

# Try to get the API key from Prowlarr
echo "Attempting to get the API key from Prowlarr..."
echo "Note: This will only work after you've completed the initial Prowlarr setup."

API_KEY=$(docker exec torrentio-prowlarr grep -oP 'ApiKey>\K[^<]+' /config/config.xml 2>/dev/null)

if [ -z "$API_KEY" ]; then
  echo "Could not automatically retrieve the API key."
  echo ""
  echo "Please follow these steps to get your API key manually:"
  echo "1. Open Prowlarr in your browser: http://localhost:9696"
  echo "2. Complete the initial setup if you haven't already"
  echo "3. Go to Settings > General"
  echo "4. Copy the API Key"
  echo ""
  read -p "Enter your Prowlarr API key: " API_KEY
else
  echo "Successfully retrieved API key: $API_KEY"
fi

# Update the .env file
if [ -f .env ]; then
  sed -i "s/PROWLARR_API_KEY=.*/PROWLARR_API_KEY=$API_KEY/" .env
  echo "Updated .env file with the API key."
else
  echo "PROWLARR_API_KEY=$API_KEY" > .env
  echo "Created .env file with the API key."
fi

echo ""
echo "Restarting torrentio-addon to apply the new API key..."
docker-compose restart torrentio-addon

echo ""
echo "Setup complete! You can now use the addon in Stremio."
echo "Add it using this URL: http://localhost:7000/manifest.json" 