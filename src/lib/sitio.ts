/** Identidad del sitio, en un solo lugar. */
export const SITIO = {
  nombre: "jomperr",
  dominio: "https://jomperr.com",
  titulo: "jomperr · Noticias deportivas de última hora",
  // Corto a propósito: entero no cabe en la cabecera de un móvil sin recortarse.
  lema: "Agregador de noticias",
  descripcion:
    "Toda la actualidad deportiva reunida en un solo sitio: fútbol, baloncesto, motor, tenis y más, " +
    "ordenada por categoría y actualizada cada pocas horas.",
  idioma: "es",
  locale: "es_ES",
  pais: "ES",
} as const;

/** Convierte una ruta del sitio en URL absoluta, que es lo que piden los buscadores. */
export function absoluta(ruta: string): string {
  return new URL(ruta, SITIO.dominio).href;
}
