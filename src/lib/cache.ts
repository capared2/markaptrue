/**
 * Capas de cache que evitan repetir trabajo entre peticiones.
 *
 * El dataset vive en otro repositorio y se lee por HTTP, asi que sin cache
 * cada visita pagaba una descarga y un `JSON.parse` de los mismos ficheros.
 * Los archivos de una categoria llegan a 1,3 MB: parsearlos ronda los 4 ms de
 * CPU, y Cloudflare Workers corta la invocacion a los 10 ms. De ahi los
 * errores 1102 (`exceededCpu`) bajo trafico de rastreadores, que piden las
 * mismas URLs una y otra vez.
 *
 * Se apilan tres capas, de la mas barata a la mas cara:
 *
 *  1. Memoria del isolate: guarda el objeto **ya parseado**. Es la unica capa
 *     que ahorra CPU de parseo, y es la que mas rinde con rastreadores, que
 *     recorren muchas noticias de la misma seccion seguidas.
 *  2. Cache API del edge (`caches.default`): sobrevive al isolate y evita la
 *     subpeticion a GitHub, aunque haya que volver a parsear.
 *  3. Cache de subpeticiones de Cloudflare (`cf.cacheTtl`): si aun asi hay que
 *     salir a la red, la respuesta de GitHub se sirve desde el edge.
 */

declare const __VERSION_CACHE__: string;

/**
 * Sello de la compilacion, inyectado por Vite (ver astro.config.mjs).
 *
 * En `astro dev` no esta definido, de ahi el respaldo.
 */
export const VERSION_CACHE =
  typeof __VERSION_CACHE__ === "string" ? __VERSION_CACHE__ : "dev";

/** Segundos que vive cada cosa. El scraper publica cada dos horas. */
export const TTL = {
  /** Indice y portada cambian en cada publicacion del scraper. */
  indice: 300,
  /** El mapa id -> parte solo crece: puede envejecer mas. */
  lookup: 900,
  /** Los archivos historicos casi nunca cambian una vez cerrados. */
  parte: 900,
  /** Una noticia publicada ya no cambia. */
  articulo: 21600,
  /** Pagina HTML completa de una noticia. */
  paginaNoticia: 86400,
  /** Listados: entran noticias nuevas, conviene refrescar antes. */
  paginaListado: 900,
} as const;

// ---------------------------------------------------------------------------
// 1. Memoria del isolate
// ---------------------------------------------------------------------------

interface Guardado<T> {
  valor: T;
  expira: number;
}

/**
 * Cache LRU con caducidad, viva mientras dure el isolate.
 *
 * `Map` conserva el orden de insercion, asi que reinsertar al leer basta para
 * que el elemento desalojado sea siempre el menos usado.
 */
export class Memoria<T> {
  private readonly entradas = new Map<string, Guardado<T>>();

  constructor(private readonly limite: number) {}

  leer(clave: string): T | undefined {
    const guardado = this.entradas.get(clave);
    if (!guardado) return undefined;

    if (guardado.expira <= Date.now()) {
      this.entradas.delete(clave);
      return undefined;
    }

    this.entradas.delete(clave);
    this.entradas.set(clave, guardado);
    return guardado.valor;
  }

  guardar(clave: string, valor: T, ttl: number): void {
    if (this.entradas.size >= this.limite) {
      const masAntigua = this.entradas.keys().next().value;
      if (masAntigua !== undefined) this.entradas.delete(masAntigua);
    }
    this.entradas.set(clave, { valor, expira: Date.now() + ttl * 1000 });
  }
}

// ---------------------------------------------------------------------------
// 2. Cache API del edge
// ---------------------------------------------------------------------------

/**
 * `caches.default` solo existe en el runtime de Workers.
 *
 * En `astro dev` (Node) no esta, y en algunas versiones de Node hay un
 * `caches` global sin `default`: por eso se comprueba la propiedad y no solo
 * el objeto. Cuando no hay cache el sitio sigue funcionando, mas lento.
 */
export function cacheDelEdge(): Cache | undefined {
  const global = globalThis as { caches?: { default?: Cache } };
  return global.caches?.default;
}

/**
 * Prefijo de las claves derivadas.
 *
 * La Cache API exige una URL https. Este host no se resuelve nunca: solo da
 * un espacio de nombres propio, separado del de las paginas del sitio.
 */
export const CLAVE_DATOS = "https://datos-internos.jomperr.com";

/** Lo que hace falta de `ExecutionContext` para escribir en cache sin bloquear. */
export interface Contexto {
  waitUntil(promesa: Promise<unknown>): void;
}

/**
 * Saca el `ExecutionContext` de Cloudflare de `Astro.locals`.
 *
 * En Astro 6 el adaptador lo expone como `locals.cfContext`; `locals.runtime`
 * sigue existiendo, pero sus propiedades lanzan un error al leerlas para
 * avisar del cambio. De ahi el try/catch: tocar la ruta antigua rompia la
 * pagina entera. Sin runtime de Cloudflare (`astro dev`) devuelve undefined y
 * las escrituras en cache simplemente se hacen sin `waitUntil`.
 */
export function contextoDe(locals: unknown): Contexto | undefined {
  try {
    const posible = (locals as { cfContext?: unknown }).cfContext;
    return typeof (posible as Contexto | undefined)?.waitUntil === "function"
      ? (posible as Contexto)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Escribe en la Cache API sin retrasar la respuesta.
 *
 * Un fallo aqui es irrelevante -- se recalculara en la siguiente peticion --,
 * asi que nunca debe tumbar la pagina.
 */
export function guardarEnCache(
  cache: Cache,
  clave: string,
  respuesta: Response,
  ctx?: Contexto,
): void {
  const escritura = cache.put(clave, respuesta).catch(() => {});
  // Sin `waitUntil`, el runtime puede cancelar la escritura al devolver la
  // respuesta y la cache no se llenaria nunca.
  if (ctx) ctx.waitUntil(escritura);
}

/** Respuesta lista para guardar un objeto derivado en la Cache API. */
export function respuestaDeDatos(valor: unknown, ttl: number): Response {
  return new Response(JSON.stringify(valor), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${ttl}, s-maxage=${ttl}`,
    },
  });
}
