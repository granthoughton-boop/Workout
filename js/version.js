// Stamped at build time by tools/build_site.mjs (and tools/build_singlefile.mjs)
// with the same hash the service worker uses for its cache name. That is the
// point: the build shown in Settings is by construction the build that is
// running, so "did my update land?" is answerable by looking, not guessing.
//
// Served straight from the repo the placeholder survives, which reads as "dev".
export const BUILD = '__BUILD__';

export const IS_STAMPED = !BUILD.startsWith('_' + '_');

export const VERSION_LABEL = IS_STAMPED ? BUILD : 'dev';
