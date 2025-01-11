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
    types: ['movie'],
    catalogs: [
        {
            type: 'movie',
            id: 'top',
            name: 'IMDb Top Movies',
            extra: [
                {
                    name: 'genre',
                    isRequired: false,
                    options: ['Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'Film-Noir', 'History', 'Horror', 'Music', 'Musical', 'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western']
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
    if (type === 'movie') {
        try {
            let searchQuery = '';
            if (extra && extra.genre) {
                searchQuery = `&genre=${extra.genre}`;
            }

            const response = await fetch(`http://www.omdbapi.com/?s=movie&type=movie${searchQuery}&apikey=${OMDB_API_KEY}`);
            const data = await response.json();

            if (data.Response === 'True') {
                const metas = await Promise.all(
                    data.Search.map(async (movie) => {
                        const details = await fetchMovieMetadata(movie.imdbID);
                        return {
                            id: movie.imdbID,
                            type: 'movie',
                            name: movie.Title,
                            poster: movie.Poster,
                            background: movie.Poster,
                            releaseInfo: movie.Year,
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
    }
    return { metas: [] };
});

// Meta handler'ı
builder.defineMetaHandler(async ({ type, id }) => {
    if (type === 'movie') {
        try {
            const movieData = await fetchMovieMetadata(id);
            if (!movieData) return null;

            return {
                meta: {
                    id: movieData.imdbID,
                    type: 'movie',
                    name: movieData.Title,
                    poster: movieData.Poster,
                    background: movieData.Poster,
                    description: movieData.Plot,
                    releaseInfo: movieData.Year,
                    imdbRating: movieData.imdbRating,
                    director: movieData.Director,
                    cast: movieData.Actors.split(', '),
                    genre: movieData.Genre.split(', '),
                    runtime: movieData.Runtime,
                    androidTvMetadata: {
                        genres: movieData.Genre.split(', '),
                        director: movieData.Director,
                        actors: movieData.Actors.split(', '),
                        runtime: movieData.Runtime,
                        androidTvInteractive: true,
                        links: [
                            {
                                name: `${movieData.Director} Filmleri`,
                                url: `stremio://search?q=${encodeURIComponent(movieData.Director)}`
                            },
                            ...movieData.Actors.split(', ').map(actor => ({
                                name: `${actor} Filmleri`,
                                url: `stremio://search?q=${encodeURIComponent(actor)}`
                            })),
                            ...movieData.Genre.split(', ').map(genre => ({
                                name: `${genre} Filmleri`,
                                url: `stremio://search?q=${encodeURIComponent(genre)}`
                            }))
                        ]
                    }
                }
            };
        } catch (error) {
            console.error(`Meta verisi alınırken hata: ${error.message}`);
            return null;
        }
    }
    return null;
});

// Stream handler'ı
builder.defineStreamHandler(async ({ type, id }) => {
    return { streams: [] };
});

// Sunucuyu başlat
const port = process.env.PORT || 7001;
serveHTTP(builder.getInterface(), { port });

console.log(`Eklenti şu adreste çalışıyor: http://127.0.0.1:${port}`);
