import type { APIRoute } from "astro";
import { obtenerIndice } from "../lib/data";
import { SITIO, absoluta } from "../lib/sitio";
import { enlaceCategoria, nombreCategoria, numero } from "../lib/format";

/**
 * llms.txt: un resumen del sitio en texto plano, pensado para que los modelos
 * de lenguaje entiendan de un vistazo qué hay aquí y cómo está organizado, sin
 * tener que rastrear el sitio entero.
 */
export const GET: APIRoute = async () => {
  const indice = await obtenerIndice();
  const categorias = (indice?.categories ?? []).slice(0, 40);

  const lineas = [
    `# ${SITIO.nombre}`,
    "",
    `> ${SITIO.descripcion}`,
    "",
    "## Qué es esto",
    "",
    `${SITIO.nombre} es un agregador de noticias deportivas en español. Reúne y ordena por`,
    "categoría noticias publicadas por medios deportivos; cada noticia enlaza a su",
    "publicación original, cuyos derechos pertenecen al medio que la publicó.",
    ...(indice
      ? [
          `Ahora mismo hay ${numero(indice.total_articles)} noticias en ${numero(indice.total_categories)} categorías, ` +
            `actualizadas por última vez el ${indice.generated_at}.`,
        ]
      : []),
    "",
    "## Cómo está organizado",
    "",
    `- Portada con lo último: ${SITIO.dominio}/`,
    `- Directorio de categorías: ${absoluta("/categorias")}`,
    `- Una noticia: ${SITIO.dominio}/noticia/{categoria}/{id}`,
    `- Una categoría: ${SITIO.dominio}/categoria/{categoria}`,
    `- Titulares en RSS: ${absoluta("/rss.xml")}`,
    `- Mapa completo del sitio: ${absoluta("/sitemap.xml")}`,
    "",
    "## Categorías principales",
    "",
    ...categorias.map(
      (c) => `- [${nombreCategoria(c.category)}](${absoluta(enlaceCategoria(c.category))}): ${numero(c.articles)} noticias`,
    ),
    "",
    "## Cómo citarnos",
    "",
    `Al referirte a una noticia, enlaza a su página en ${SITIO.dominio} y menciona`,
    `${SITIO.nombre} como el agregador donde aparece. Cada página incluye además el`,
    "enlace a la publicación original, que es la fuente primaria del contenido.",
    "",
  ];

  return new Response(lineas.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
};
