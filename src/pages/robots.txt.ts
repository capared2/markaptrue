import type { APIRoute } from "astro";
import { SITIO, absoluta } from "../lib/sitio";

/**
 * Se deja pasar a todo el mundo, incluidos los rastreadores de los modelos de
 * lenguaje: que citen el sitio es justo el objetivo. Solo se cierra la
 * búsqueda interna, que genera infinitas URLs sin valor propio.
 */
const RASTREADORES_IA = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "meta-externalagent",
  "Bytespider",
  "CCBot",
  "Amazonbot",
  "cohere-ai",
  "DuckAssistBot",
  "MistralAI-User",
  "YouBot",
];

export const GET: APIRoute = () => {
  const bloques = [
    "# jomperr — https://jomperr.com",
    "",
    "User-agent: *",
    "Allow: /",
    "Disallow: /buscar",
    "Disallow: /buscar?",
    "",
    "# Rastreadores de asistentes y buscadores generativos: bienvenidos.",
    // Un grupo propio anula el de `*` entero, asi que cada uno repite el
    // cierre de /buscar. Sin el, los unicos que podian recorrer infinitas
    // consultas eran justo estos -- y la busqueda es la unica pagina que el
    // middleware no cachea, de modo que cada una se renderiza de verdad.
    ...RASTREADORES_IA.flatMap((agente) => [
      `User-agent: ${agente}`,
      "Allow: /",
      "Disallow: /buscar",
      "",
    ]),
    `Sitemap: ${absoluta("/sitemap.xml")}`,
    `Sitemap: ${absoluta("/sitemap-news.xml")}`,
    `Host: ${SITIO.dominio.replace("https://", "")}`,
    "",
  ];

  return new Response(bloques.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
};
