/* global $, document, window, navigator, fetch */
// Initialize the page when the document is ready
$(document).ready(async function() {
    try {
        // Fetch manifest data
        const [manifestResponse, optionsResponse] = await Promise.all([
            fetch('/manifest.json'),
            fetch('/options')
        ]);
        
        const [manifest, options] = await Promise.all([
            manifestResponse.json(),
            optionsResponse.json()
        ]);
        
        // Update page with manifest data
        document.title = `${manifest.name} - Stremio Addon`;
        document.getElementById('addon-name').textContent = manifest.name;
        document.getElementById('addon-version').textContent = manifest.version || '0.0.0';
        document.getElementById('addon-description').textContent = manifest.description || '';
        document.getElementById('addon-logo').src = manifest.logo || 'https://dl.strem.io/addon-logo.png';
        document.getElementById('favicon').href = manifest.logo || 'https://dl.strem.io/addon-logo.png';
        document.body.style.backgroundImage = `url(${manifest.background || 'https://dl.strem.io/addon-background.jpg'})`;
        
        // Update addon types
        const stylizedTypes = manifest.types.map(t => t[0].toUpperCase() + t.slice(1) + (t !== 'series' ? 's' : ''));
        document.getElementById('addon-types').innerHTML = stylizedTypes.map(t => `<li>${t}</li>`).join('');
        
        // Populate providers dropdown
        const providersHtml = options.providers.map(provider => {
            if (provider.prowlarrId) {
                return `<option value="${provider.key}">🔍 ${provider.label}</option>`;
            }
            return `<option value="${provider.key}">${provider.foreign ? provider.foreign + ' ' : ''}${provider.label}</option>`;
        }).join('\n');
        $('#iProviders').html(providersHtml);
        
        // Populate sort options
        const sortOptionsHtml = options.sortOptions.map((option, i) => 
            `<option value="${option.key}" ${i === 0 ? 'selected' : ''}>${option.description}</option>`
        ).join('\n');
        $('#iSort').html(sortOptionsHtml);
        
        // Populate language options
        const languagesHtml = options.languageOptions.map(option => 
            `<option value="${option.key}">${option.label}</option>`
        ).join('\n');
        $('#iLanguages').html(languagesHtml);
        
        // Populate quality filters
        const qualityFiltersHtml = options.qualityFilters.map(option => 
            `<option value="${option.key}">${option.label}</option>`
        ).join('\n');
        $('#iQualityFilter').html(qualityFiltersHtml);
        
        // Populate debrid providers
        const debridProvidersHtml = options.debridProviders.map(moch => 
            `<option value="${moch.key}">${moch.name}</option>`
        ).join('\n');
        $('#iDebridProviders').append(debridProvidersHtml);
        
        // Populate debrid options
        const debridOptionsHtml = options.debridOptions.map(option => 
            `<option value="${option.key}">${option.description}</option>`
        ).join('\n');
        $('#iDebridOptions').html(debridOptionsHtml);
        
        // Initialize multiselect components
        initializeMultiselect();
        
        // Parse configuration from URL if any
        const config = parseConfigFromUrl();
        populateFormWithConfig(config);
        
        // Generate initial install link
        generateInstallLink();
        debridProvidersChange();
    } catch (error) {
        console.error('Failed to initialize landing page:', error);
        document.body.innerHTML = '<div style="color: white; text-align: center; margin: 20px;">Failed to load addon configuration. Please try refreshing the page.</div>';
    }
});

function initializeMultiselect() {
    const isTvMedia = window.matchMedia("tv").matches;
    const isTvAgent = /\b(?:tv|wv)\b/i.test(navigator.userAgent);
    const isDesktopMedia = window.matchMedia("(pointer:fine)").matches;
    
    if (isDesktopMedia && !isTvMedia && !isTvAgent) {
        $('#iProviders').multiselect({
            nonSelectedText: 'All providers',
            buttonTextAlignment: 'left',
            onChange: () => generateInstallLink()
        });
        
        $('#iLanguages').multiselect({
            nonSelectedText: 'None',
            buttonTextAlignment: 'left',
            onChange: () => generateInstallLink()
        });
        
        $('#iQualityFilter').multiselect({
            nonSelectedText: 'None',
            buttonTextAlignment: 'left',
            onChange: () => generateInstallLink()
        });
        
        $('#iDebridOptions').multiselect({
            nonSelectedText: 'None',
            buttonTextAlignment: 'left',
            onChange: () => generateInstallLink()
        });
    }
}

function parseConfigFromUrl() {
    const path = window.location.pathname;
    const configPart = path.split('/')[1];
    if (!configPart) return {};
    
    const config = {};
    const parts = configPart.split('|');
    parts.forEach(part => {
        const [key, value] = part.split('=');
        if (value) {
            config[key] = value.split(',');
        }
    });
    return config;
}

function populateFormWithConfig(config) {
    // Populate providers
    if (config.providers) {
        $('#iProviders').val(config.providers);
        $('#iProviders').multiselect('refresh');
    }
    
    // Populate sort
    if (config.sort) {
        $('#iSort').val(config.sort);
    }
    
    // Populate languages
    if (config.languages) {
        $('#iLanguages').val(config.languages);
        $('#iLanguages').multiselect('refresh');
    }
    
    // Populate quality filters
    if (config.qualityFilter) {
        $('#iQualityFilter').val(config.qualityFilter);
        $('#iQualityFilter').multiselect('refresh');
    }
    
    // Populate other fields
    if (config.limit) $('#iLimit').val(config.limit);
    if (config.sizeFilter) $('#iSizeFilter').val(config.sizeFilter.join(','));
    if (config.apiKey) $('#iApiKey').val(config.apiKey);
    
    // Populate debrid options
    if (config.debridOptions) {
        $('#iDebridOptions').val(config.debridOptions);
        $('#iDebridOptions').multiselect('refresh');
    }
    
    // Populate debrid provider and keys
    const debridProviders = {
        realdebrid: '#iRealDebrid',
        premiumize: '#iPremiumize',
        alldebrid: '#iAllDebrid',
        debridlink: '#iDebridLink',
        offcloud: '#iOffcloud',
        torbox: '#iTorbox'
    };
    
    Object.entries(debridProviders).forEach(([provider, selector]) => {
        if (config[provider]) {
            $('#iDebridProviders').val(provider);
            $(selector).val(config[provider]);
        }
    });
    
    // Handle Put.io special case
    if (config.putio) {
        const [clientId, token] = config.putio[0].split('@');
        $('#iPutioClientId').val(clientId);
        $('#iPutioToken').val(token);
    }
}

function sortModeChange() {
    if (['seeders', 'size'].includes($('#iSort').val())) {
        $("#iLimitLabel").text("Max results:");
    } else {
        $("#iLimitLabel").text("Max results per quality:");
    }
    generateInstallLink();
}

function debridProvidersChange() {
    const provider = $('#iDebridProviders').val();
    $('#dDebridOptions').toggle(provider !== 'none');
    $('#dRealDebrid').toggle(provider === 'realdebrid');
    $('#dPremiumize').toggle(provider === 'premiumize');
    $('#dAllDebrid').toggle(provider === 'alldebrid');
    $('#dDebridLink').toggle(provider === 'debridlink');
    $('#dOffcloud').toggle(provider === 'offcloud');
    $('#dTorbox').toggle(provider === 'torbox');
    $('#dPutio').toggle(provider === 'putio');
}

function generateInstallLink() {
    const providersList = $('#iProviders').val() || [];
    const providersValue = providersList.join(',');
    const qualityFilterValue = $('#iQualityFilter').val().join(',') || '';
    const sortValue = $('#iSort').val() || '';
    const languagesValue = $('#iLanguages').val().join(',') || [];
    const limitValue = $('#iLimit').val() || '';
    const sizeFilterValue = $('#iSizeFilter').val() || '';
    
    const debridOptionsValue = $('#iDebridOptions').val().join(',') || '';
    const realDebridValue = $('#iRealDebrid').val() || '';
    const allDebridValue = $('#iAllDebrid').val() || '';
    const debridLinkValue = $('#iDebridLink').val() || '';
    const premiumizeValue = $('#iPremiumize').val() || '';
    const offcloudValue = $('#iOffcloud').val() || '';
    const torboxValue = $('#iTorbox').val() || '';
    const putioClientIdValue = $('#iPutioClientId').val() || '';
    const putioTokenValue = $('#iPutioToken').val() || '';
    const apiKeyValue = $('#iApiKey').val() || '';
    
    const providers = providersList.length && providersValue;
    const qualityFilters = qualityFilterValue.length && qualityFilterValue;
    const sort = sortValue !== 'qualitySeeders' && sortValue;
    const languages = languagesValue.length && languagesValue;
    const limit = /^[1-9][0-9]{0,2}$/.test(limitValue) && limitValue;
    const sizeFilter = sizeFilterValue.length && sizeFilterValue;
    
    const debridOptions = debridOptionsValue.length && debridOptionsValue.trim();
    const realDebrid = realDebridValue.length && realDebridValue.trim();
    const premiumize = premiumizeValue.length && premiumizeValue.trim();
    const allDebrid = allDebridValue.length && allDebridValue.trim();
    const debridLink = debridLinkValue.length && debridLinkValue.trim();
    const offcloud = offcloudValue.length && offcloudValue.trim();
    const torbox = torboxValue.length && torboxValue.trim();
    const putio = putioClientIdValue.length && putioTokenValue.length && putioClientIdValue.trim() + '@' + putioTokenValue.trim();
    const apiKey = apiKeyValue.length && apiKeyValue.trim();
    
    const configParts = [
        ['providers', providers],
        ['sort', sort],
        ['languages', languages],
        ['qualityFilter', qualityFilters],
        ['limit', limit],
        ['sizeFilter', sizeFilter],
        ['debridOptions', debridOptions],
        ['realdebrid', realDebrid],
        ['premiumize', premiumize],
        ['alldebrid', allDebrid],
        ['debridlink', debridLink],
        ['offcloud', offcloud],
        ['torbox', torbox],
        ['putio', putio],
        ['apiKey', apiKey]
    ].filter(([_, value]) => value).map(([key, value]) => key + '=' + value);
    
    const configuration = configParts.length ? '/' + configParts.join('|') : '';
    const installUrl = 'stremio://' + window.location.host + configuration + '/manifest.json';
    
    const installLink = document.getElementById('installLink');
    installLink.href = installUrl;
}

// Add click handler to copy URL to clipboard
document.getElementById('installLink').addEventListener('click', function() {
    navigator.clipboard.writeText(this.href.replace('stremio://', 'https://'));
}); 