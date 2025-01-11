const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const NodeCache = require('node-cache');
const fetch = require('node-fetch');

// Cache ayarları
const cache = new NodeCache({ stdTTL: 3600 }); // 1 saat cache süresi

// OMDb API anahtarı
const OMDB_API_KEY = process.env.OMDB_API_KEY;

// Manifest tanımlaması
const manifest = {
    id: 'org.stremio.imdbenhanced',
    version: '1.0.0',
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
        const response = await fetch(`http://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`);
        const data = await response.json();
        
        if (data.Response === 'True') {
            cache.set(cacheKey, data);
            return data;
        }
        return null;
    } catch (error) {
        console.error(`Film metadatası alınırken hata: ${error.message}`);
        return null;
    }
}

// Katalog handler'ı
builder.defineCatalogHandler(async ({ type, id, extra }) => {
    console.log(`Katalog isteği alındı: type=${type}, id=${id}`);
    
    const skip = extra.skip || 0;
    const limit = 20;
    let searchType = type === 'series' ? 'series' : 'movie';
    
    try {
        let searchQuery = `type=${searchType}`;
        if (extra && extra.genre) {
            searchQuery += `&genre=${extra.genre}`;
        }

        // Popüler içerikleri almak için yıl bazlı arama
        const currentYear = new Date().getFullYear();
        searchQuery += `&y=${currentYear - (skip / limit)}`; // Her sayfada farklı bir yıl

        const response = await fetch(`http://www.omdbapi.com/?s=*&${searchQuery}&apikey=${OMDB_API_KEY}`);
        const data = await response.json();

        if (data.Response === 'True') {
            const metas = await Promise.all(
                data.Search.map(async (item) => {
                    const details = await fetchMovieMetadata(item.imdbID);
                    return {
                        id: item.imdbID,
                        type: type,
                        name: item.Title,
                        poster: item.Poster,
                        background: item.Poster,
                        releaseInfo: item.Year,
                        description: details?.Plot,
                        imdbRating: details?.imdbRating,
                        genres: details?.Genre?.split(', ') || [],
                        cast: details?.Actors?.split(', ') || [],
                        director: details?.Director || '',
                        runtime: details?.Runtime || '',
                        androidTvMetadata: {
                            genres: details?.Genre?.split(', ') || [],
                            director: details?.Director || '',
                            actors: details?.Actors?.split(', ') || [],
                            runtime: details?.Runtime || '',
                            androidTvInteractive: true
                        }
                    };
                })
            );
            return { metas };
        }
        return { metas: [] };
    } catch (error) {
        console.error(`Katalog alınırken hata: ${error.message}`);
        return { metas: [] };
    }
});

// Meta handler
builder.defineMetaHandler(async ({ type, id }) => {
    try {
        const details = await fetchMovieMetadata(id);
        if (!details) return { meta: null };

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
                runtime: details.Runtime || '',
                androidTvMetadata: {
                    genres: details.Genre?.split(', ') || [],
                    director: details.Director || '',
                    actors: details.Actors?.split(', ') || [],
                    runtime: details.Runtime || '',
                    androidTvInteractive: true
                }
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
