/**
 * Service worker de jomperr.
 *
 * Las páginas van siempre primero a la red: el edge ya las cachea y así nunca
 * se sirve una portada vieja estando conectado. Solo sin conexión se recurre a
 * la copia local de lo que ya se leyó, o a la página de "sin conexión".
 *
 * Los ficheros de /_astro/ llevan un hash en el nombre y no cambian nunca, así
 * que se sirven de la caché sin preguntar.
 */
const VERSION = "v1";
const PAGINAS = `paginas-${VERSION}`;
const ESTATICOS = `estaticos-${VERSION}`;
const SIN_CONEXION = "/sin-conexion.html";
const MAX_PAGINAS = 40;

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(ESTATICOS)
      .then((cache) => cache.addAll([SIN_CONEXION, "/iconos/icono-192.png", "/favicon.svg"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((c) => c !== PAGINAS && c !== ESTATICOS).map((c) => caches.delete(c))),
      )
      .then(() => self.clients.claim()),
  );
});

async function recortar(nombre, maximo) {
  const cache = await caches.open(nombre);
  const claves = await cache.keys();
  for (let i = 0; i < claves.length - maximo; i++) await cache.delete(claves[i]);
}

self.addEventListener("fetch", (evento) => {
  const { request } = evento;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Anuncios, analítica y fotos de los medios no son cosa nuestra.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    evento.respondWith(
      fetch(request)
        .then((respuesta) => {
          if (respuesta.ok) {
            const copia = respuesta.clone();
            evento.waitUntil(
              caches
                .open(PAGINAS)
                .then((cache) => cache.put(request, copia))
                .then(() => recortar(PAGINAS, MAX_PAGINAS)),
            );
          }
          return respuesta;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match(SIN_CONEXION))),
    );
    return;
  }

  if (url.pathname.startsWith("/_astro/") || url.pathname.startsWith("/iconos/")) {
    evento.respondWith(
      caches.match(request).then(
        (guardada) =>
          guardada ||
          fetch(request).then((respuesta) => {
            if (respuesta.ok) {
              const copia = respuesta.clone();
              evento.waitUntil(caches.open(ESTATICOS).then((cache) => cache.put(request, copia)));
            }
            return respuesta;
          }),
      ),
    );
  }
});
