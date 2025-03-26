import Router from 'router';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import requestIp from 'request-ip';
import userAgentParser from 'ua-parser-js';
import addonInterface from './addon.js';
import qs from 'querystring';
import { manifest } from './lib/manifest.js';
import { parseConfiguration } from './lib/configuration.js';
import { Providers, QualityFilter, refreshProviders } from './lib/filter.js';
import { SortOptions } from './lib/sort.js';
import { LanguageOptions } from './lib/languages.js';
import { DebridOptions } from './moch/options.js';
import { MochOptions } from './moch/moch.js';
import * as moch from './moch/moch.js';
import * as repository from './lib/repository.js';
import bodyParser from 'body-parser';
import { Buffer } from 'buffer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = new Router();
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 300, // limit each IP to 300 requests per windowMs
  headers: false,
  keyGenerator: (req) => requestIp.getClientIp(req)
});

router.use(cors());

// API key validation middleware
const validateApiKey = async (req, res, next) => {
  // Skip validation for specific routes
  const skipPaths = [
    /^\/configure$/,
    /^\/[^/]+\/configure$/,
    /^\/admin$/,
    /^\/admin\.html$/,
    /^\/admin\/.*/,
    /^\/manifest.json$/,
    /^\/[^/]+\/manifest.json$/,
    /^\/static\/.*/,
    /^\/options$/  // Also skip validation for options endpoint
  ];
  
  if (skipPaths.some(pattern => pattern.test(req.url))) {
    return next();
  }
  
  // Extract API key from configuration in URL
  const urlParts = req.url.split('/');
  const configuration = urlParts[1] || '';
  
  // Parse configuration to get API key from URL
  const configValues = parseConfiguration(configuration);
  
  // Get API key from Stremio's config object (if available)
  // For streaming handlers, the config is passed in args
  let apiKey = null;
  
  // Check if we have a configuration from Stremio
  if (req.args && req.args.config && req.args.config.apiKey) {
    apiKey = req.args.config.apiKey;
  } else {
    // Fall back to URL configuration for backward compatibility
    apiKey = configValues.apiKey;
  }
  
  // Validate the API key
  const isValid = await repository.validateApiKey(apiKey);
  
  if (isValid) {
    // Store the validated key in req for use in handlers
    req.validatedApiKey = apiKey;
    next();
  } else {
    res.writeHead(401);
    res.end(JSON.stringify({ error: 'Invalid or missing API key' }));
  }
};

// Apply API key validation middleware to all routes
router.use(validateApiKey);

// Serve static files
router.get('/static/*', (req, res) => {
  const filePath = join(__dirname, 'static', req.url.replace('/static/', ''));
  if (fs.existsSync(filePath)) {
    const ext = req.url.split('.').pop().toLowerCase();
    const contentTypes = {
      'js': 'application/javascript',
      'css': 'text/css',
      'html': 'text/html',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'ogg': 'video/ogg'
    };
    res.setHeader('Content-Type', contentTypes[ext] || 'text/plain');
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end();
  }
});

// Serve configuration options
router.get('/options', async (_, res) => {
  try {
    // Refresh providers using debounce logic
    await refreshProviders();
    
    const options = {
      providers: Providers.options,
      sortOptions: Object.values(SortOptions.options),
      languageOptions: LanguageOptions.options,
      qualityFilters: Object.values(QualityFilter.options),
      debridOptions: Object.values(DebridOptions.options),
      debridProviders: Object.values(MochOptions)
    };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(options));
  } catch (error) {
    console.error('Error refreshing providers:', error);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Failed to refresh providers' }));
  }
});

router.get('/', (_, res) => {
  res.redirect('/configure');
  res.end();
});

router.get('/:configuration?/configure', (_, res) => {
  const filePath = join(__dirname, 'static', 'landing.html');
  res.setHeader('content-type', 'text/html');
  res.end(fs.readFileSync(filePath));
});

router.get('/:configuration?/manifest.json', (req, res) => {
  const configValues = parseConfiguration(req.params.configuration || '');
  const manifestBuf = JSON.stringify(manifest(configValues));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(manifestBuf);
});

router.get('/:configuration?/:resource/:type/:id/:extra?.json', limiter, (req, res, next) => {
  const { configuration, resource, type, id } = req.params;
  const extra = req.params.extra ? qs.parse(req.url.split('/').pop().slice(0, -5)) : {};
  const ip = requestIp.getClientIp(req);
  const host = `${req.protocol}://${req.headers.host}`;
  
  // Parse configuration from URL for backward compatibility
  const configFromUrl = parseConfiguration(configuration);
  
  // Create a new config object that merges URL config with any validated API key
  const config = { 
    ...extra, 
    ...configFromUrl, 
    id, 
    type, 
    ip, 
    host 
  };
  
  // Add the validated API key if available (from middleware)
  if (req.validatedApiKey) {
    config.apiKey = req.validatedApiKey;
  }
  
  // Save the request args for the middleware to use
  req.args = {
    config: {
      apiKey: config.apiKey
    },
    extra: extra
  };
  
  addonInterface.get(resource, type, id, config)
    .then(resp => {
      const cacheHeaders = {
        cacheMaxAge: 'max-age',
        staleRevalidate: 'stale-while-revalidate',
        staleError: 'stale-if-error'
      };
      const cacheControl = Object.keys(cacheHeaders)
        .map(prop => Number.isInteger(resp[prop]) && cacheHeaders[prop] + '=' + resp[prop])
        .filter(val => !!val).join(', ');

      res.setHeader('Cache-Control', `${cacheControl}, public`);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(resp));
    })
    .catch(err => {
      if (err.noHandler) {
        if (next) {
          next();
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ err: 'not found' }));
        }
      } else {
        console.error(err);
        res.writeHead(500);
        res.end(JSON.stringify({ err: 'handler error' }));
      }
    });
});

router.get('/:moch/:apiKey/:infoHash/:cachedEntryInfo/:fileIndex/:filename?', (req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  const parameters = {
    mochKey: req.params.moch,
    apiKey: req.params.apiKey,
    infoHash: req.params.infoHash.toLowerCase(),
    fileIndex: isNaN(req.params.fileIndex) ? undefined : parseInt(req.params.fileIndex),
    cachedEntryInfo: req.params.cachedEntryInfo,
    ip: requestIp.getClientIp(req),
    host: `${req.protocol}://${req.headers.host}`,
    isBrowser: !userAgent.includes('Stremio') && !!userAgentParser(userAgent).browser.name
  };
  moch.resolve(parameters)
    .then(url => {
      res.writeHead(302, { Location: url });
      res.end();
    })
    .catch(error => {
      console.log(error);
      res.statusCode = 404;
      res.end();
    });
});

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  if (!adminUsername || !adminPassword) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: 'Admin credentials not configured' }));
    return;
  }
  
  // For API endpoints, use the Authorization header
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Basic\s+(.*)$/);
  
  if (match) {
    const credentials = Buffer.from(match[1], 'base64').toString().split(':');
    const username = credentials[0];
    const password = credentials[1];
    
    if (username === adminUsername && password === adminPassword) {
      return next();
    }
  }
  
  res.writeHead(401);
  res.end(JSON.stringify({ error: 'Invalid credentials' }));
};

// Admin page route - must be before API routes
router.get(['/admin', '/admin.html'], (req, res) => {
  const filePath = join(__dirname, 'static', 'admin.html');
  res.setHeader('content-type', 'text/html');
  res.end(fs.readFileSync(filePath));
});

// Admin API key management routes - after admin page route
router.use('/admin/apikeys', bodyParser.json());

// List all API keys
router.get('/admin/apikeys', authenticateAdmin, async (req, res) => {
  try {
    const apiKeys = await repository.listApiKeys();
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(apiKeys));
  } catch (error) {
    console.error('Error listing API keys:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Failed to list API keys' }));
  }
});

// Create a new API key
router.post('/admin/apikeys', authenticateAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Name is required' }));
      return;
    }
    
    const key = await repository.createApiKey(name);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ key, name }));
  } catch (error) {
    console.error('Error creating API key:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Failed to create API key' }));
  }
});

// Deactivate an API key
router.delete('/admin/apikeys/:key', authenticateAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const success = await repository.deactivateApiKey(key);
    
    if (success) {
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'API key not found' }));
    }
  } catch (error) {
    console.error('Error deactivating API key:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Failed to deactivate API key' }));
  }
});

export default function (req, res) {
  router(req, res, function () {
    res.statusCode = 404;
    res.end();
  });
};
