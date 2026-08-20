import type { Noticia, Tarjeta } from "./types";
import { SITIO, absoluta } from "./sitio";
import { enlaceCategoria, enlaceNoticia, nombreCategoria } from "./format";

/** El sitio como entidad: lo consultan tanto buscadores como modelos de lenguaje. */
export function organizacion() {
  return {
    "@type": "Organization",
    "@id": absoluta("/#organizacion"),
    name: SITIO.nombre,
    url: SITIO.dominio,
    description: SITIO.descripcion,
    logo: {
      "@type": "ImageObject",
      url: absoluta("/logo.svg"),
      width: 512,
      height: 512,
    },
  };
}

export function sitioWeb() {
  return {
    "@type": "WebSite",
    "@id": absoluta("/#sitio"),
    url: SITIO.dominio,
    name: SITIO.nombre,
    description: SITIO.descripcion,
    inLanguage: SITIO.idioma,
    publisher: { "@id": absoluta("/#organizacion") },
    // Habilita la caja de búsqueda en los resultados de Google.
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: absoluta("/buscar?q={search_term_string}"),
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function migas(pasos: { nombre: string; ruta: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: pasos.map((paso, indice) => ({
      "@type": "ListItem",
      position: indice + 1,
      name: paso.nombre,
      item: absoluta(paso.ruta),
    })),
  };
}

/** Migas derivadas de la categoría: "Inicio › Fútbol › Real Madrid". */
export function migasDeCategoria(clave: string) {
  const pasos = [{ nombre: "Inicio", ruta: "/" }];
  const partes = clave.split("/");
  for (let i = 0; i < partes.length; i++) {
    const trozo = partes.slice(0, i + 1).join("/");
    pasos.push({ nombre: nombreCategoria(partes[i]!), ruta: enlaceCategoria(trozo) });
  }
  return migas(pasos);
}

export function noticiaJsonLd(noticia: Noticia) {
  const url = absoluta(enlaceNoticia(noticia.category, noticia.id));
  return {
    "@type": "NewsArticle",
    "@id": `${url}#noticia`,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    headline: noticia.title.slice(0, 110), // Google descarta titulares más largos
    description: noticia.summary || noticia.standfirst || undefined,
    articleSection: nombreCategoria(noticia.category),
    inLanguage: noticia.language || SITIO.idioma,
    datePublished: noticia.published_at || undefined,
    dateModified: noticia.modified_at || noticia.published_at || undefined,
    wordCount: noticia.word_count || undefined,
    keywords: noticia.tags?.length ? noticia.tags.join(", ") : undefined,
    image: noticia.images?.slice(0, 3).map((i) => i.url),
    author: noticia.authors?.length
      ? noticia.authors.map((nombre) => ({ "@type": "Person", name: nombre }))
      : [{ "@type": "Organization", name: SITIO.nombre }],
    publisher: { "@id": absoluta("/#organizacion") },
    isAccessibleForFree: !noticia.is_premium,
    // Para asistentes de voz: qué leer en alto si alguien pregunta por esto.
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["h1", ".entradilla"],
    },
  };
}

/** Una lista ordenada de noticias: así los buscadores entienden portadas y secciones. */
export function listado(articulos: (Tarjeta | Noticia)[], nombre: string) {
  const listados = articulos.slice(0, 30);
  return {
    "@type": "ItemList",
    name: nombre,
    numberOfItems: listados.length,
    itemListElement: listados.map((a, indice) => ({
      "@type": "ListItem",
      position: indice + 1,
      url: absoluta(enlaceNoticia(a.category, a.id)),
      name: a.title,
    })),
  };
}

/** Envuelve los bloques en un solo @graph, que es como conviene servirlos. */
export function grafo(bloques: object[]) {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": bloques });
}

// --- Grafos listos para cada tipo de página ---

export function grafoPortada(articulos: Tarjeta[]) {
  return [
    organizacion(),
    sitioWeb(),
    {
      "@type": "CollectionPage",
      "@id": absoluta("/#portada"),
      url: SITIO.dominio,
      name: SITIO.titulo,
      description: SITIO.descripcion,
      inLanguage: SITIO.idioma,
      isPartOf: { "@id": absoluta("/#sitio") },
      about: { "@type": "Thing", name: "Deportes" },
      mainEntity: listado(articulos, "Últimas noticias deportivas"),
    },
  ];
}

export function grafoCategoria(
  clave: string,
  nombre: string,
  articulos: Noticia[],
  pagina: number,
) {
  const url = absoluta(enlaceCategoria(clave, pagina));
  return [
    organizacion(),
    sitioWeb(),
    migasDeCategoria(clave),
    {
      "@type": "CollectionPage",
      "@id": `${url}#coleccion`,
      url,
      name: `${nombre}: últimas noticias`,
      description: `Noticias de ${nombre} reunidas de la prensa deportiva.`,
      inLanguage: SITIO.idioma,
      isPartOf: { "@id": absoluta("/#sitio") },
      about: { "@type": "Thing", name: nombre },
      mainEntity: listado(articulos, `Noticias de ${nombre}`),
    },
  ];
}

export function grafoCategorias(indice: { categories: { category: string }[] } | null) {
  return [
    organizacion(),
    sitioWeb(),
    migas([
      { nombre: "Inicio", ruta: "/" },
      { nombre: "Categorías", ruta: "/categorias" },
    ]),
    {
      "@type": "CollectionPage",
      "@id": absoluta("/categorias#coleccion"),
      url: absoluta("/categorias"),
      name: "Todas las categorías",
      inLanguage: SITIO.idioma,
      isPartOf: { "@id": absoluta("/#sitio") },
      hasPart: (indice?.categories ?? []).slice(0, 60).map((c) => ({
        "@type": "CollectionPage",
        url: absoluta(enlaceCategoria(c.category)),
        name: nombreCategoria(c.category),
      })),
    },
  ];
}

export function grafoNoticia(noticia: Noticia) {
  const pasos = [{ nombre: "Inicio", ruta: "/" }];
  const partes = noticia.category.split("/");
  for (let i = 0; i < partes.length; i++) {
    pasos.push({
      nombre: nombreCategoria(partes[i]!),
      ruta: enlaceCategoria(partes.slice(0, i + 1).join("/")),
    });
  }
  pasos.push({
    nombre: noticia.title,
    ruta: enlaceNoticia(noticia.category, noticia.id),
  });

  return [organizacion(), sitioWeb(), migas(pasos), noticiaJsonLd(noticia)];
}
