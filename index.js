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
    version: '1.1.3',
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

// Catalog handler
builder.defineCatalogHandler(async ({ type, id, extra }) => {
    console.log('Catalog handler called with:', { type, id, extra });
    
    try {
        if (!OMDB_API_KEY) {
            throw new Error('API key bulunamadı!');
        }

        // İlk sayfa için varsayılan değerler
        const page = extra.skip ? Math.floor(extra.skip / 10) + 1 : 1;
        const searchQuery = extra.search || 'Batman'; // Varsayılan olarak Batman

        // OMDb API'ye istek at
        const url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&s=${encodeURIComponent(searchQuery)}&type=${type === 'series' ? 'series' : 'movie'}&page=${page}`;
        console.log('Calling OMDb API:', url.replace(OMDB_API_KEY, 'HIDDEN_KEY'));

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('OMDb API Response:', JSON.stringify(data, null, 2));

        if (data.Response === 'False') {
            console.error('OMDb API Error:', data.Error);
            return { metas: [] };
        }

        if (!Array.isArray(data.Search)) {
            console.error('Unexpected API response format:', data);
            return { metas: [] };
        }

        // Sonuçları Stremio formatına dönüştür
        const metas = data.Search.map(item => ({
            id: item.imdbID,
            type: type,
            name: item.Title,
            poster: item.Poster,
            year: parseInt(item.Year)
        }));

        return { metas };
    } catch (error) {
        console.error('Catalog handler error:', error);
        throw error;
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
