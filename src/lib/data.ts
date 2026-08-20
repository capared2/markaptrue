import type { ArchivoParte, EntradaCategoria, Indice, Lookup, Noticia, Portada, Tarjeta } from "./types";

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

async function leerJson<T>(ruta: string): Promise<T | null> {
  try {
    const respuesta = await fetch(`${BASE}${ruta}`);
    if (!respuesta.ok) return null;
    return (await respuesta.json()) as T;
  } catch {
    return null;
  }
}

export const obtenerIndice = () => leerJson<Indice>("/index.json");
export const obtenerPortada = () => leerJson<Portada>("/latest.json");

const obtenerParte = (categoria: string, parte: number) =>
  leerJson<ArchivoParte>(`/${categoria}/part-${String(parte).padStart(4, "0")}.json`);

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
 * Se limita el número de ficheros que se descargan: estas secciones son
 * pequeñas, pero el tope evita que una que crezca dispare el coste.
 */
const MAX_FICHEROS_AGREGADOS = 12;

export async function obtenerPaginaAgregada(
  hijas: EntradaCategoria[],
  pagina: number,
  porPagina: number,
): Promise<PaginaCategoria> {
  const total = hijas.reduce((suma, c) => suma + c.articles, 0);
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const actual = Math.min(Math.max(1, pagina), paginas);

  // Los ficheros más recientes de cada hija primero: son los que traen las
  // noticias que encabezan la página.
  const ficheros = hijas
    .flatMap((c) => c.files.map((f, indice) => ({ categoria: c.category, archivo: f.file, indice })))
    .sort((a, b) => b.indice - a.indice)
    .slice(0, MAX_FICHEROS_AGREGADOS);

  const lotes = await Promise.all(
    ficheros.map(({ categoria, archivo }) =>
      obtenerParte(categoria, Number(archivo.match(/part-(\d+)\.json$/)?.[1] ?? 1)),
    ),
  );

  const articulos = porFecha(lotes.flatMap((parte) => parte?.articles ?? []));
  const desde = (actual - 1) * porPagina;

  return {
    articulos: articulos.slice(desde, desde + porPagina),
    total,
    pagina: actual,
    paginas: Math.max(1, Math.ceil(articulos.length / porPagina)),
  };
}

/** Busca una noticia concreta resolviendo antes en que archivo vive. */
export async function obtenerNoticia(categoria: string, id: string): Promise<Noticia | null> {
  const lookup = await leerJson<Lookup>(`/${categoria}/lookup.json`);
  const numero = lookup?.parts?.[id];
  if (!numero) return null;

  const parte = await obtenerParte(categoria, numero);
  return parte?.articles.find((articulo) => articulo.id === id) ?? null;
}

/** Noticias relacionadas: misma categoria, excluyendo la actual. */
export async function obtenerRelacionadas(actual: Noticia, limite = 4): Promise<Tarjeta[]> {
  const portada = await obtenerPortada();
  if (!portada) return [];
  return portada.articles
    .filter((a) => a.category === actual.category && a.id !== actual.id)
    .slice(0, limite);
}
