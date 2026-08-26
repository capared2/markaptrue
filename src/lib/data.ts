import type { ArchivoParte, EntradaCategoria, Indice, Lookup, Noticia, Portada, Tarjeta } from "./types";
import {
  CLAVE_DATOS,
  Memoria,
  TTL,
  cacheDelEdge,
  guardarEnCache,
  respuestaDeDatos,
  type Contexto,
} from "./cache";

/**
 * De donde se lee el archivo de noticias.
 *
 * El dataset lo produce y versiona el repositorio del scraper
 * (capared2/markap); este sitio solo lo consume. GitHub lo sirve con
 * `max-age=300`, y el scraper publica cada dos horas, asi que las noticias
 * llegan frescas sin necesidad de reconstruir el sitio.
 *
 * Se puede apuntar a otro sitio con la variable de entorno
 * DATASET_BASE_URL (por ejemplo a otra rama, a un fork o a un bucket propio).
 */
const BASE = (
  import.meta.env.DATASET_BASE_URL ||
  "https://raw.githubusercontent.com/capared2/markap/main/data"
).replace(/\/+$/, "");

/**
 * Ficheros pequeños y muy compartidos: index.json, latest.json y los
 * lookup.json de cada categoria. Los piden practicamente todas las paginas,
 * asi que conviene tener muchos a mano.
 */
const ligeros = new Memoria<unknown>(32);

/**
 * Archivos de noticias. Pesan hasta 1,3 MB ya parseados, asi que el limite es
 * bajo a proposito: un isolate tiene 128 MB y no merece la pena arriesgarlos
 * por un historico que casi nadie visita. Aun asi cubre el caso que importa,
 * el rastreador que recorre seguidas las noticias de una misma seccion.
 */
const archivos = new Memoria<unknown>(4);

/**
 * Descarga un JSON del dataset, reutilizando lo que ya se haya leido.
 *
 * `cf.cacheTtl` hace que la respuesta de GitHub la sirva el edge de
 * Cloudflare: cuando la memoria del isolate falla, la subpeticion casi nunca
 * llega a salir a Internet.
 */
async function leerJson<T>(ruta: string, ttl: number, memoria: Memoria<unknown>): Promise<T | null> {
  const memorizado = memoria.leer(ruta);
  if (memorizado !== undefined) return memorizado as T;

  try {
    const respuesta = await fetch(`${BASE}${ruta}`, {
      cf: { cacheTtl: ttl, cacheEverything: true },
    } as RequestInit);
    if (!respuesta.ok) return null;

    const valor = (await respuesta.json()) as T;
    memoria.guardar(ruta, valor, ttl);
    return valor;
  } catch {
    return null;
  }
}

export const obtenerIndice = () => leerJson<Indice>("/index.json", TTL.indice, ligeros);
export const obtenerPortada = () => leerJson<Portada>("/latest.json", TTL.indice, ligeros);

const obtenerParte = (categoria: string, parte: number) =>
  leerJson<ArchivoParte>(
    `/${categoria}/part-${String(parte).padStart(4, "0")}.json`,
    TTL.parte,
    archivos,
  );

/** Ordena de mas reciente a mas antigua. */
function porFecha<T extends { published_at: string | null }>(articulos: T[]): T[] {
  return [...articulos].sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
}

export interface PaginaCategoria {
  articulos: Noticia[];
  total: number;
  pagina: number;
  paginas: number;
}

/**
 * Devuelve una pagina de noticias de una categoria.
 *
 * Los archivos se recorren del mas reciente al mas antiguo y solo se descargan
 * los que cubren la pagina pedida, de modo que el coste no depende del tamaño
 * total del archivo historico.
 */
export async function obtenerPaginaCategoria(
  categoria: EntradaCategoria,
  pagina: number,
  porPagina: number,
): Promise<PaginaCategoria> {
  const archivos = [...categoria.files].reverse();
  const paginas = Math.max(1, Math.ceil(categoria.articles / porPagina));
  const actual = Math.min(Math.max(1, pagina), paginas);

  const desde = (actual - 1) * porPagina;
  const hasta = desde + porPagina;

  const articulos: Noticia[] = [];
  let recorridos = 0;
  let inicioDelPrimero: number | null = null;

  for (const archivo of archivos) {
    const fin = recorridos + archivo.count;
    const intersecta = fin > desde && recorridos < hasta;

    if (intersecta) {
      if (inicioDelPrimero === null) inicioDelPrimero = recorridos;
      const numero = Number(archivo.file.match(/part-(\d+)\.json$/)?.[1] ?? 1);
      const parte = await obtenerParte(categoria.category, numero);
      if (parte) articulos.push(...porFecha(parte.articles));
    }

    recorridos = fin;
    if (recorridos >= hasta) break;
  }

  const corte = desde - (inicioDelPrimero ?? 0);
  return {
    articulos: articulos.slice(corte, corte + porPagina),
    total: categoria.articles,
    pagina: actual,
    paginas,
  };
}

/**
 * Página de una sección que no tiene noticias propias, solo subsecciones.
 *
 * Marca cuelga secciones como «hockey» únicamente de sus hijas
 * (hockey-hielo, hockey-patines). Sin esto, el enlace de la sección prometía
 * noticias y llevaba a una página inexistente.
 *
 * El tope de doce ficheros que había aquí era un 1102 esperando: en «mx», con
 * dieciocho hijas, esos doce archivos suman 8,5 MB de JSON y unos 25 ms solo
 * de parseo, con un presupuesto de 10 ms de CPU por invocación. Ahora se
 * descarga el archivo más reciente de cada hija -- que es donde están sus
 * noticias nuevas, lo único que puede entrar en la primera página -- empezando
 * por las hijas con más fondo, y como mucho MAX_FICHEROS_AGREGADOS, que en el
 * peor caso del dataset («mx», con dieciocho hijas) son 1,7 MB y unos 5 ms de
 * parseo.
 *
 * Ese tope se aplica igual en todas las páginas, y no según la que se pida:
 * cargar más archivos cuanto más hondo se navegaba hacía que el número de
 * páginas cambiara solo al pasar de una a otra («página 1 de 8» y «página 5
 * de 11» en la misma sección), y dejaba que `?p=200` respondiera «página 83
 * de 11» con la lista vacía y esa misma canónica, indexable. Como el reparto
 * de archivos ya no depende de la página, el recuento sale estable y basta
 * con recortar la pedida a lo que de verdad hay.
 */
const MAX_FICHEROS_AGREGADOS = 4;

export async function obtenerPaginaAgregada(
  hijas: EntradaCategoria[],
  pagina: number,
  porPagina: number,
): Promise<PaginaCategoria> {
  const total = hijas.reduce((suma, c) => suma + c.articles, 0);

  // El archivo más reciente de cada hija, las de más fondo primero.
  const ficheros = [...hijas]
    .sort((a, b) => b.articles - a.articles)
    .map((c) => ({ categoria: c.category, archivo: c.files.at(-1) }))
    .filter((c): c is { categoria: string; archivo: { file: string; count: number } } =>
      c.archivo !== undefined,
    )
    .slice(0, MAX_FICHEROS_AGREGADOS);

  const lotes = await Promise.all(
    ficheros.map(({ categoria, archivo }) =>
      obtenerParte(categoria, Number(archivo.file.match(/part-(\d+)\.json$/)?.[1] ?? 1)),
    ),
  );

  const articulos = porFecha(lotes.flatMap((parte) => parte?.articles ?? []));

  // Las páginas las marca lo que se puede servir, no el fondo de la sección:
  // el resto está a un toque en las subsecciones.
  const paginas = Math.max(1, Math.ceil(articulos.length / porPagina));
  const actual = Math.min(Math.max(1, pagina), paginas);
  const desde = (actual - 1) * porPagina;

  return {
    articulos: articulos.slice(desde, desde + porPagina),
    total,
    pagina: actual,
    paginas,
  };
}

/**
 * Busca una noticia concreta resolviendo antes en que archivo vive.
 *
 * El archivo que la contiene puede pesar 1,3 MB y llevarse casi 4 ms de CPU en
 * parsearse, para quedarse con una sola noticia de las doscientas que trae.
 * Por eso, una vez encontrada, la noticia suelta se guarda aparte en la Cache
 * API: la siguiente visita lee unos pocos kilobytes en lugar del archivo
 * entero, aunque el isolate ya se haya reciclado.
 */
export async function obtenerNoticia(
  categoria: string,
  id: string,
  ctx?: Contexto,
): Promise<Noticia | null> {
  const cache = cacheDelEdge();
  const clave = `${CLAVE_DATOS}/articulo/${categoria}/${id}`;

  if (cache) {
    try {
      const guardada = await cache.match(clave);
      if (guardada) return (await guardada.json()) as Noticia;
    } catch {
      // Cache corrupta o ilegible: se resuelve por el camino largo.
    }
  }

  const lookup = await leerJson<Lookup>(`/${categoria}/lookup.json`, TTL.lookup, ligeros);
  const numero = lookup?.parts?.[id];
  if (!numero) return null;

  const parte = await obtenerParte(categoria, numero);
  const noticia = parte?.articles.find((articulo) => articulo.id === id) ?? null;

  if (noticia && cache) {
    guardarEnCache(cache, clave, respuestaDeDatos(noticia, TTL.articulo), ctx);
  }

  return noticia;
}

/** Noticias relacionadas: misma categoria, excluyendo la actual. */
export async function obtenerRelacionadas(actual: Noticia, limite = 4): Promise<Tarjeta[]> {
  const portada = await obtenerPortada();
  if (!portada) return [];
  return portada.articles
    .filter((a) => a.category === actual.category && a.id !== actual.id)
    .slice(0, limite);
}
