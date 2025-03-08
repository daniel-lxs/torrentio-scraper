import axios from 'axios';

/**
 * Fetches metadata for an IMDB ID using the IMDB suggests API
 * @param {string} imdbId - The IMDB ID to fetch data for (e.g., tt0111161)
 * @returns {Promise<Object>} - A promise that resolves to the metadata object
 */
export async function fetchImdbSuggests(imdbId) {
  try {
    // The IMDB suggests API returns JSONP, so we need to parse it
    const response = await axios.get(`https://sg.media-imdb.com/suggests/a/${imdbId}.json`);
    const jsonpData = response.data;
    
    // Extract the JSON from the JSONP response (format: imdb$ID(JSON_DATA);)
    const jsonStart = jsonpData.indexOf('(') + 1;
    const jsonEnd = jsonpData.lastIndexOf(')');
    
    if (jsonStart > 0 && jsonEnd > jsonStart) {
      const jsonStr = jsonpData.substring(jsonStart, jsonEnd);
      const data = JSON.parse(jsonStr);
      
      if (data && data.d && data.d.length > 0) {
        // Find the exact match for the IMDB ID
        const exactMatch = data.d.find(item => item.id === imdbId);
        
        if (exactMatch) {
          // Format the response to match what the original library would return
          return {
            meta: {
              name: exactMatch.l,
              year: exactMatch.y,
              type: exactMatch.qid === 'movie' ? 'movie' : 
                    exactMatch.qid === 'tvSeries' ? 'series' : 
                    exactMatch.qid === 'tvEpisode' ? 'episode' : 'unknown'
            }
          };
        }
      }
    }
    
    throw new Error(`No data found for IMDB ID: ${imdbId}`);
  } catch (error) {
    throw new Error(`Failed to fetch IMDB data: ${error.message}`);
  }
}

/**
 * Promise-based wrapper for fetchImdbSuggests
 * @param {string} imdbId - The IMDB ID to fetch data for
 * @returns {Promise<Object>} - A promise that resolves to the metadata
 */
export function getImdbMetadata(imdbId) {
  return new Promise((resolve, reject) => {
    fetchImdbSuggests(imdbId)
      .then(info => {
        if (!info || !info.meta) {
          return reject(new Error(`No metadata found for ${imdbId}`));
        }
        resolve(info.meta);
      })
      .catch(err => reject(err));
  });
} 