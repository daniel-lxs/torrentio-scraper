# Torrentio-Scraper with Prowlarr Integration

This is a modified version of the Torrentio-Scraper project that uses Prowlarr for real-time torrent searching and Redis for caching.

## Features

- **Real-time torrent searching** using Prowlarr
- **Redis caching** for improved performance
- **PostgreSQL database** for storing torrent information
- **Docker Compose** setup for easy deployment
- **Real Debrid integration** for streaming

## Prerequisites

- Docker and Docker Compose
- A Real Debrid account (or other supported debrid service)

## Quick Start

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/torrentio-scraper.git
   cd torrentio-scraper
   ```

2. Start the services:
   ```bash
   docker-compose up -d
   ```

3. Configure Prowlarr:
   - Access Prowlarr at http://localhost:9696
   - Complete the initial setup
   - Add your preferred indexers (torrent sites)
   - Go to Settings > General and copy your API key

4. Update the `.env` file with your Prowlarr API key:
   ```bash
   # Edit the .env file
   nano .env
   
   # Replace 'your_prowlarr_api_key' with the actual API key
   ```

5. Restart the torrentio-addon service to apply the API key:
   ```bash
   docker-compose restart torrentio-addon
   ```

6. Add the addon to Stremio:
   - Open Stremio
   - Go to the Addons section
   - Click "Add Addon"
   - Enter the addon URL: `http://localhost:7000/manifest.json` (or your server's IP/domain)
   - Click "Install"

## Configuration

### Environment Variables

You can configure the services by editing the `.env` file:

- `PROWLARR_API_KEY`: Your Prowlarr API key
- `OMDB_API_KEY`: Your OMDB API key (optional, used as a fallback for title retrieval)
- `POSTGRES_USER`: PostgreSQL username
- `POSTGRES_PASSWORD`: PostgreSQL password
- `POSTGRES_DB`: PostgreSQL database name
- `TZ`: Time zone

### Setting up OMDB API Key (Optional)

The addon now supports using OMDB API as a fallback for retrieving titles when the primary method fails. This helps improve search results with Prowlarr.

1. Get a free API key from [OMDB API](http://www.omdbapi.com/apikey.aspx)
2. Set the API key using the provided script:
   ```bash
   ./set-omdb-api-key.sh your_omdb_api_key
   ```
3. Restart the addon:
   ```bash
   docker-compose restart torrentio-addon
   ```

### Ports

- Torrentio Addon: 7000
- Torrentio Catalogs: 7001
- Prowlarr: 9696
- PostgreSQL: 5432
- Redis: 6379

## Usage

1. Open Stremio and search for a movie or TV show
2. Select the content and check the available streams
3. The addon will first check its database for cached torrents
4. If not enough results are found, it will search Prowlarr in real-time
5. Results will be cached in the database for future requests

## Maintenance

### Updating

To update the services:

```bash
# Pull the latest changes
git pull

# Rebuild and restart the services
docker-compose up -d --build
```

### Logs

To view logs:

```bash
# All services
docker-compose logs

# Specific service
docker-compose logs torrentio-addon
```

### Backup

To backup your data:

```bash
# PostgreSQL
docker exec torrentio-postgres pg_dump -U torrentio_user torrentio > backup.sql

# Redis
# Redis data is stored in the redis_data volume

# Prowlarr
# Prowlarr configuration is stored in the prowlarr_config volume
```

## Troubleshooting

### No Streams in Stremio

1. Check if the addon is running:
   ```bash
   docker-compose ps
   ```

2. Check the addon logs:
   ```bash
   docker-compose logs torrentio-addon
   ```

3. Verify Prowlarr is configured correctly:
   - Check if indexers are added and working
   - Test a manual search in Prowlarr

### Database Connection Issues

Check the PostgreSQL logs:
```bash
docker-compose logs postgres
```

### Redis Connection Issues

Check the Redis logs:
```bash
docker-compose logs redis
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Original Torrentio-Scraper project
- Prowlarr for torrent indexing
- Stremio for the streaming platform
