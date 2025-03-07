#!/bin/bash

# This script helps you start the torrentio-scraper with Prowlarr integration

echo "Starting Torrentio-Scraper with Prowlarr integration..."
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "Error: Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Stop any existing containers
echo "Stopping any existing containers..."
docker-compose down

# Start the services
echo "Starting services with Docker Compose..."
docker-compose up -d

# Wait for services to start
echo "Waiting for services to start..."
sleep 10

# Check if services are running
if ! docker ps | grep -q torrentio-postgres; then
    echo "Error: PostgreSQL container failed to start."
    echo "Check the logs with: docker-compose logs postgres"
    exit 1
fi

if ! docker ps | grep -q torrentio-redis; then
    echo "Error: Redis container failed to start."
    echo "Check the logs with: docker-compose logs redis"
    exit 1
fi

if ! docker ps | grep -q torrentio-prowlarr; then
    echo "Error: Prowlarr container failed to start."
    echo "Check the logs with: docker-compose logs prowlarr"
    exit 1
fi

if ! docker ps | grep -q torrentio-catalogs; then
    echo "Error: Torrentio Catalogs container failed to start."
    echo "Check the logs with: docker-compose logs torrentio-catalogs"
    exit 1
fi

# Check if addon container is running or try to start it
if ! docker ps | grep -q torrentio-addon; then
    echo "Torrentio Addon container not running. Trying to start it..."
    docker-compose up -d torrentio-addon
    sleep 5
    
    if ! docker ps | grep -q torrentio-addon; then
        echo "Error: Torrentio Addon container failed to start."
        echo "Check the logs with: docker-compose logs torrentio-addon"
        exit 1
    fi
fi

echo ""
echo "All services started successfully!"
echo ""
echo "Note: Prowlarr may take a minute or two to fully initialize."
echo ""

# Ask if user wants to configure Prowlarr now
read -p "Do you want to configure Prowlarr now? (y/n): " configure_prowlarr

if [[ $configure_prowlarr == "y" || $configure_prowlarr == "Y" ]]; then
    echo ""
    echo "Please follow these steps to configure Prowlarr:"
    echo "1. Open Prowlarr in your browser: http://localhost:9696"
    echo "2. Complete the initial setup"
    echo "3. Add your preferred indexers (torrent sites)"
    echo "4. Once you've completed the setup, run: ./get-prowlarr-api-key.sh"
    echo ""
    
    # Open Prowlarr in the default browser if possible
    if command -v xdg-open &> /dev/null; then
        xdg-open http://localhost:9696
    elif command -v open &> /dev/null; then
        open http://localhost:9696
    else
        echo "Please open http://localhost:9696 in your browser."
    fi
else
    echo ""
    echo "You can configure Prowlarr later by opening http://localhost:9696 in your browser."
    echo "After configuring Prowlarr, run: ./get-prowlarr-api-key.sh"
fi

echo ""
echo "To add the addon to Stremio:"
echo "1. Open Stremio"
echo "2. Go to the Addons section"
echo "3. Click 'Add Addon'"
echo "4. Enter the addon URL: http://localhost:7000/manifest.json"
echo "5. Click 'Install'"
echo ""
echo "Enjoy your Torrentio-Scraper with Prowlarr integration!" 