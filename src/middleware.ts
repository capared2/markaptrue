import { defineMiddleware } from "astro:middleware";
import { VERSION_CACHE, cacheDelEdge, contextoDe } from "./lib/cache";

/**
 * Cache de la pagina entera en el edge.
 *
 * Un Worker se ejecuta en **todas** las peticiones: Cloudflare no cachea por
 * su cuenta lo que devuelve. Sin esto, cada visita de un rastreador a una
 * noticia que ya habia pedido mil veces volvia a descargar y parsear el
 * archivo de su categoria, y a renderizar el mismo HTML.
 *
 * Guardando la respuesta en `caches.default`, una peticion repetida no lee el
 * dataset, no renderiza y no gasta practicamente CPU: se devuelve el HTML tal
 * cual salio la primera vez. Es la diferencia entre rozar el limite de 10 ms y
 * quedarse en decimas de milisegundo.
 */

/**
 * Parametros de consulta que de verdad cambian la pagina.
 *
 * Es una lista blanca a proposito. Los rastreadores y las redes sociales
 * añaden `fbclid`, `utm_*` y demas: con una lista negra, cualquier parametro
 * inventado generaria una entrada nueva y la cache no acertaria nunca.
 */
const PARAMETROS_UTILES = ["p"];

/** Rutas que no conviene cachear por URL. */
function cacheable(url: URL): boolean {
  // La busqueda admite infinitas consultas distintas: llenaria la cache de
  // entradas de un solo uso. Sale barata igualmente porque solo lee la
  // portada, que ya esta memorizada.
  if (url.pathname.startsWith("/buscar")) return false;

  // Los ficheros estaticos los sirve Cloudflare antes de llegar aqui; los
  // dinamicos que parecen fichero (sitemaps, robots.txt, rss) si pasan.
  return true;
}

/** URL normalizada que sirve de clave: misma pagina, misma entrada. */
function claveDeCache(url: URL): string {
  const limpia = new URL(url.origin + url.pathname);
  for (const parametro of PARAMETROS_UTILES) {
    const valor = url.searchParams.get(parametro);
    if (valor) limpia.searchParams.set(parametro, valor);
  }
  // Cada despliegue estrena claves: el HTML de la version anterior deja de
  // servirse solo, sin purgar nada a mano.
  limpia.searchParams.set("v", VERSION_CACHE);
  return limpia.toString();
}

/** Segundos que el edge puede guardar una respuesta sin cabecera propia. */
const TTL_ERROR = 600;

export const onRequest = defineMiddleware(async (contexto, next) => {
  const { request } = contexto;

  // HEAD tambien se responde desde la cache -- algunos rastreadores lo usan
  // para comprobar si una noticia sigue viva --, pero no la llena: su cuerpo
  // va vacio y guardarlo dejaria la entrada inservible para los GET.
  const esHead = request.method === "HEAD";
  if (request.method !== "GET" && !esHead) return next();

  const cache = cacheDelEdge();
  const url = new URL(request.url);
  if (!cache || !cacheable(url)) return next();

  const clave = claveDeCache(url);

  try {
    const guardada = await cache.match(clave);
    if (guardada) {
      const respuesta = new Response(esHead ? null : guardada.body, guardada);
      respuesta.headers.set("X-Cache-Jomperr", "HIT");
      return respuesta;
    }
  } catch {
    // Si la cache falla se sirve la pagina como siempre.
  }

  const original = await next();
  if (esHead) return original;

  // Se reconstruye para poder tocar las cabeceras: las de la respuesta que
  // devuelve Astro pueden venir congeladas. Pasar el cuerpo tal cual mantiene
  // el streaming del HTML.
  const respuesta = new Response(original.body, original);

  // 404 no trae cabecera de cache propia, y sin ella la Cache API no guardaria
  // nada. Merece guardarse un rato: los rastreadores insisten mucho en URLs
  // muertas. Los 5xx no se guardan nunca.
  if (respuesta.status === 404 && !respuesta.headers.has("Cache-Control")) {
    respuesta.headers.set("Cache-Control", `public, max-age=60, s-maxage=${TTL_ERROR}`);
  }

  const guardable =
    (respuesta.status === 200 || respuesta.status === 404) &&
    respuesta.headers.has("Cache-Control") &&
    !respuesta.headers.has("Set-Cookie");

  if (!guardable) return respuesta;

  respuesta.headers.set("X-Cache-Jomperr", "MISS");

  // `clone()` antes de devolverla: un cuerpo solo se puede leer una vez.
  const copia = respuesta.clone();
  const ctx = contextoDe(contexto.locals);
  const escritura = cache.put(clave, copia).catch(() => {});
  // Sin `waitUntil` el runtime puede cancelar la escritura al devolver la
  // respuesta, y la cache no se llenaria nunca.
  if (ctx) ctx.waitUntil(escritura);

  return respuesta;
});
