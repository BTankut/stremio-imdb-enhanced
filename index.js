const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const NodeCache = require('node-cache');
const fetch = require('node-fetch');

// Cache ayarları
const cache = new NodeCache({ stdTTL: 3600 }); // 1 saat cache süresi

// OMDb API anahtarı
const OMDB_API_KEY = process.env.OMDB_API_KEY;
console.log('All environment variables:', Object.keys(process.env));
console.log('API Key value:', OMDB_API_KEY);
console.log('API Key length:', OMDB_API_KEY ? OMDB_API_KEY.length : 0);

if (!OMDB_API_KEY) {
    console.error('HATA: OMDB_API_KEY environment variable bulunamadı!');
}

// Manifest tanımlaması
const manifest = {
    id: 'org.stremio.imdbenhanced',
    version: '1.1.2',
    name: 'IMDb Enhanced for Android TV',
    description: 'Android TV için geliştirilmiş IMDb kataloğu entegrasyonu',
    types: ['movie', 'series'],
    catalogs: [
        {
            type: 'movie',
            id: 'imdb-movies',
            name: 'IMDb Movies',
            extra: [
                {
                    name: 'genre',
                    isRequired: false,
                    options: ['Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'Film-Noir', 'History', 'Horror', 'Music', 'Musical', 'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western']
                },
                {
                    name: 'skip',
                    isRequired: false
                }
            ]
        },
        {
            type: 'series',
            id: 'imdb-series',
            name: 'IMDb TV Shows',
            extra: [
                {
                    name: 'genre',
                    isRequired: false,
                    options: ['Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western']
                },
                {
                    name: 'skip',
                    isRequired: false
                }
            ]
        }
    ],
    resources: ['catalog', 'meta', 'stream'],
    idPrefixes: ['tt'],
    behaviorHints: {
        adult: false,
        configurable: true,
        configurationRequired: false
    }
};

const builder = new addonBuilder(manifest);

// Film metadatası için yardımcı fonksiyon
async function fetchMovieMetadata(imdbId) {
    const cacheKey = `movie-${imdbId}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) return cachedData;

    try {
        const url = `https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`;
        console.log('Fetching metadata URL:', url);
        
        const response = await fetch(url);
        const data = await response.json();
        console.log('Metadata response:', data);
        
        if (data.Response === 'True') {
            cache.set(cacheKey, data);
            return data;
        }
        console.error('Metadata error:', data.Error);
        return null;
    } catch (error) {
        console.error(`Film metadatası alınırken hata: ${error.message}`);
        return null;
    }
}

// Katalog handler'ı
builder.defineCatalogHandler(async ({ type, id, extra }) => {
    console.log(`Katalog isteği alındı: type=${type}, id=${id}, extra=`, extra);
    
    try {
        let searchQuery = '';
        
        // API key kontrolü
        if (!OMDB_API_KEY) {
            throw new Error('API key bulunamadı!');
        }
        
        // Basit bir arama yapalım önce
        const url = `https://www.omdbapi.com/?s=Batman&type=${type}&apikey=${OMDB_API_KEY}`;
        console.log('Calling URL:', url.replace(OMDB_API_KEY, 'HIDDEN_KEY')); // API key'i gizle
        
        const response = await fetch(url);
        const data = await response.json();
        console.log('API Response Status:', response.status);
        console.log('API Response Headers:', Object.fromEntries(response.headers));
        console.log('API Response Body:', JSON.stringify(data, null, 2));

        if (data.Response === 'True' && Array.isArray(data.Search)) {
            const metas = await Promise.all(
                data.Search.map(async (item) => {
                    return {
                        id: item.imdbID,
                        type: type,
                        name: item.Title,
                        poster: item.Poster,
                        background: item.Poster,
                        releaseInfo: item.Year
                    };
                })
            );
            console.log('Returning metas:', metas);
            return { metas };
        }
        
        console.error('Catalog error:', data.Error);
        return { metas: [] };
    } catch (error) {
        console.error(`Katalog alınırken hata: ${error.message}`);
        return { metas: [] };
    }
});

// Meta handler
builder.defineMetaHandler(async ({ type, id }) => {
    console.log(`Meta isteği alındı: type=${type}, id=${id}`);
    
    try {
        const details = await fetchMovieMetadata(id);
        if (!details) {
            console.error('Meta details not found');
            return { meta: null };
        }

        return {
            meta: {
                id: id,
                type: type,
                name: details.Title,
                poster: details.Poster,
                background: details.Poster,
                releaseInfo: details.Year,
                description: details.Plot,
                imdbRating: details.imdbRating,
                genres: details.Genre?.split(', ') || [],
                cast: details.Actors?.split(', ') || [],
                director: details.Director || '',
                runtime: details.Runtime || ''
            }
        };
    } catch (error) {
        console.error(`Meta alınırken hata: ${error.message}`);
        return { meta: null };
    }
});

// Stream handler (gerekli ama kullanılmıyor)
builder.defineStreamHandler(() => ({ streams: [] }));

// Sunucuyu başlat
const port = process.env.PORT || 7001;
serveHTTP(builder.getInterface(), { port });

console.log(`Eklenti şu adreste çalışıyor: http://127.0.0.1:${port}`);
