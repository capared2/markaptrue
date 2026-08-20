import type { APIRoute } from "astro";
import { obtenerPortada } from "../lib/data";
import { SITIO, absoluta } from "../lib/sitio";
import { enlaceNoticia, nombreCategoria } from "../lib/format";

const escapar = (texto: string) =>
  texto.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export const GET: APIRoute = async () => {
  const portada = await obtenerPortada();
  const articulos = portada?.articles ?? [];

  const items = articulos.slice(0, 50).map((a) => {
    const url = absoluta(enlaceNoticia(a.category, a.id));
    return [
      "    <item>",
      `      <title>${escapar(a.title)}</title>`,
      `      <link>${url}</link>`,
      `      <guid isPermaLink="true">${url}</guid>`,
      `      <category>${escapar(nombreCategoria(a.category))}</category>`,
      a.published_at ? `      <pubDate>${new Date(a.published_at).toUTCString()}</pubDate>` : "",
      a.summary || a.standfirst
        ? `      <description>${escapar(a.summary || a.standfirst)}</description>`
        : "",
      "    </item>",
    ].filter(Boolean).join("\n");
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapar(SITIO.titulo)}</title>`,
    `    <link>${SITIO.dominio}</link>`,
    `    <description>${escapar(SITIO.descripcion)}</description>`,
    `    <language>${SITIO.idioma}</language>`,
    `    <lastBuildDate>${new Date(portada?.generated_at ?? Date.now()).toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${absoluta("/rss.xml")}" rel="self" type="application/rss+xml"/>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=86400",
    },
  });
};
