import { MochOptions } from '../moch/moch.js';
import { Providers } from './filter.js';
import { showDebridCatalog } from '../moch/options.js';
import { Type } from './types.js';

const DefaultProviders = Providers.options.map(provider => provider.key);
const MochProviders = Object.values(MochOptions);

export function manifest(config = {}) {
  const baseManifest = {
    id: 'com.stremio.mirador.addon',
    version: '0.0.14',
    name: getName(config),
    description: getDescription(config),
    catalogs: getCatalogs(config),
    resources: getResources(config),
    types: [Type.MOVIE, Type.SERIES, Type.ANIME, Type.OTHER],
    logo: `/static/logo.jpeg`,
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    }
  };
  return baseManifest
}

export function dummyManifest() {
  const manifestDefault = manifest();
  manifestDefault.catalogs = [{ id: 'dummy', type: Type.OTHER }];
  manifestDefault.resources = ['stream', 'meta'];
  return manifestDefault;
}

function getName(config) {
  const rootName = 'Mirador';
  const mochSuffix = MochProviders
      .filter(moch => config[moch.key])
      .map(moch => moch.shortName)
      .join('/');
  return [rootName, mochSuffix].filter(v => v).join(' ');
}

function getDescription(config) {
  const providersList = config[Providers.key] || DefaultProviders;
  const enabledProvidersDesc = Providers.options
      .map(provider => `${provider.label}${providersList.includes(provider.key) ? '(+)' : '(-)'}`)
      .join(', ')
  const enabledMochs = MochProviders
      .filter(moch => config[moch.key])
      .map(moch => moch.name)
      .join(' & ');
  const possibleMochs = MochProviders.map(moch => moch.name).join('/')
  const mochsDesc = enabledMochs ? ` and ${enabledMochs} enabled` : '';
  return 'Provides torrent streams from your Prowlarr indexers.'
      + ` Currently supports ${enabledProvidersDesc}${mochsDesc}.`
      + ` To configure providers, ${possibleMochs} support and other settings visit https://torrentio.strem.fun` // TODO: change to whatever the landing page is
}

function getCatalogs(config) {
  return MochProviders
      .filter(moch => showDebridCatalog(config) && config[moch.key])
      .map(moch => moch.catalogs.map(catalogName => ({
        id: catalogName ? `torrentio-${moch.key}-${catalogName.toLowerCase()}` : `torrentio-${moch.key}`,
        name: catalogName ? `${moch.name} ${catalogName}` : `${moch.name}`,
        type: 'other',
        extra: [{ name: 'skip' }],
      })))
      .reduce((a, b) => a.concat(b), []);
}

function getResources(config) {
  const streamResource = {
    name: 'stream',
    types: [Type.MOVIE, Type.SERIES],
    idPrefixes: ['tt', 'kitsu']
  };
  const metaResource = {
    name: 'meta',
    types: [Type.OTHER],
    idPrefixes: MochProviders.filter(moch => config[moch.key]).map(moch => moch.key)
  };
  if (showDebridCatalog(config) && MochProviders.filter(moch => config[moch.key]).length) {
    return [streamResource, metaResource];
  }
  return [streamResource];
}
