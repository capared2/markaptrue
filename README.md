# jomperr — agregador de noticias deportivas

Frontend de **jomperr.com**: reúne noticias de la prensa deportiva, las ordena por
categoría y enlaza cada una a su publicación original.

Hecho con **Astro 7 + TypeScript + Tailwind 4**, renderizado en el servidor
sobre **Cloudflare Workers**.

El sitio es **agnóstico de la fuente**: cada noticia declara de dónde viene y
el medio se deduce de su propia URL, así que sumar fuentes nuevas no obliga a
tocar el frontend.

## Cómo obtiene los datos

Este repositorio **no guarda ninguna noticia**: las lee por HTTP, en tiempo de
ejecución, del repositorio que se encarga de recogerlas
([capared2/markap](https://github.com/capared2/markap)).

```
capared2/markap  ──── data/*.json ────►  raw.githubusercontent.com
  (recolección)                                    │
                                                   ▼
                                          este sitio (Cloudflare)
                                                   │
                                                   ▼
                                          caché en el edge
```

Esto tiene dos consecuencias útiles: el sitio no necesita reconstruirse cuando
entran noticias nuevas (aparecen solas), y las dos piezas evolucionan por
separado.

GitHub sirve esos JSON con `max-age=300` y la recolección publica cada dos horas,
así que el archivo llega fresco. Encima, cada página se cachea en el edge de
Cloudflare (`s-maxage` + `stale-while-revalidate`), de modo que la mayoría de
las visitas ni siquiera llegan a pedir nada a GitHub.

Para apuntar a otro origen —otra rama, un fork, un bucket propio— basta con
definir la variable de entorno `DATASET_BASE_URL`. Por defecto:
`https://raw.githubusercontent.com/capared2/markap/main/data`.

## Por qué SSR y no páginas estáticas

El archivo crece sin límite. Prerenderizar una página por noticia chocaría con
los límites de ficheros por despliegue, así que las páginas se generan en el
edge y se cachean allí. El número de ficheros desplegados no depende del
tamaño del archivo.

Cada página descarga solo lo que necesita:

| Página | Lee |
| --- | --- |
| Portada | `latest.json` (200 noticias, sin cuerpo) |
| Categoría | `index.json` + los `part-NNNN.json` que cubren esa página |
| Noticia | `<categoria>/lookup.json` + el único `part` que la contiene |

## Desarrollo

```bash
npm install
npm run dev      # localhost:4321, leyendo el dataset publicado
npm run build
npm run check    # comprobación de tipos
npm run build
npm run preview  # sirve el build en el runtime real de Workers
```

## Despliegue en Cloudflare Workers

**Va en Workers, no en Pages.** `@astrojs/cloudflare` construye para Workers:
genera `dist/server/` (el worker) y `dist/client/` (los assets estáticos), no
el `_worker.js` con `_routes.json` que espera Pages. Subir este `dist` a un
proyecto de Pages publica solo los ficheros estáticos, sin ejecutar nada, y
todas las rutas responden **404**.

Desde el panel de Cloudflare: **Workers & Pages → Create → Workers → Import a
repository**, y se conecta este repositorio con:

| Ajuste | Valor |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| `NODE_VERSION` | `22` |

No hace falta ningún secreto ni ninguna conexión con el repositorio de
recolección: el dataset se lee de una URL pública. El namespace KV que usa
Astro para las sesiones se aprovisiona solo en el primer despliegue.

También se puede desplegar a mano:

```bash
npm run build
npx wrangler deploy
```

## Norma para los enlaces salientes

Todo enlace que apunte fuera del sitio lleva `rel="nofollow noopener noreferrer"`:
ninguno transmite autoridad. Si añades enlaces externos nuevos, mantén ese
`rel`.

## SEO, AEO y GEO

Todo se genera solo a partir del dataset; no hay nada que mantener a mano.

**Metadatos** — `src/components/Seo.astro` pone en cada página título y
descripción propios, canónica absoluta, Open Graph, Twitter Card y directivas
`max-snippet:-1` / `max-image-preview:large`, que son las que hacen que el
resultado ocupe más espacio en la página de búsqueda. Las listadas paginadas
declaran `rel="prev"` y `rel="next"`; el buscador interno va `noindex` para no
generar URLs infinitas sin valor.

**Datos estructurados** — un solo `@graph` de schema.org por página:

| Página | Bloques |
| --- | --- |
| Portada | `Organization`, `WebSite` (con `SearchAction`), `CollectionPage` + `ItemList` |
| Categoría | los anteriores, más `BreadcrumbList` y su `ItemList` |
| Noticia | `NewsArticle` completo (autores, fechas, sección, `wordCount`, imágenes) + `BreadcrumbList` |

**AEO** — el `NewsArticle` incluye `speakable`, que le dice a los asistentes de
voz qué leer en alto; el `SearchAction` habilita la caja de búsqueda en Google;
las migas dan a los buscadores la jerarquía exacta de cada noticia.

**GEO** — `robots.txt` deja pasar explícitamente a los rastreadores de los
asistentes (GPTBot, ClaudeBot, PerplexityBot, Google-Extended y compañía), y
`/llms.txt` resume en texto plano qué es el sitio, cómo está organizado y cómo
citarlo, para que un modelo lo entienda sin rastrearlo entero.

**Rutas generadas**

| Ruta | Qué es |
| --- | --- |
| `/robots.txt` | Permisos y enlaces a los sitemaps |
| `/sitemap.xml` | Índice de sitemaps |
| `/sitemap-secciones.xml` | Portada, directorio y categorías |
| `/sitemap-noticias-NNNN.xml` | Todas las noticias |
| `/sitemap-news.xml` | Google News: últimas 48 h |
| `/rss.xml` | Los 50 titulares más recientes |
| `/llms.txt` | Resumen del sitio para modelos de lenguaje |

Los sitemaps los produce el proceso de recolección y aquí solo se sirven, sin
parsearlos: construirlos en cada petición no cabría en los 10 ms de CPU del
plan gratuito de Workers.

## Publicidad

Las etiquetas de la red viven en `src/components/Anuncios.astro`, con **límite
de frecuencia: cada visitante las ve una vez y no vuelve a verlas hasta pasadas
12 horas**.

La cuenta se lleva en el navegador (`localStorage`) y no en el servidor a
propósito: las páginas se cachean en el edge de Cloudflare, así que la misma
respuesta HTML se sirve a todo el mundo y no puede saber quién ya las vio.

Se inyectan cuando el navegador está desocupado (`requestIdleCallback`), ya
pintada la página, para que no compitan con el contenido.

Se apagan con la variable de entorno `ANUNCIOS=0`, útil en desarrollo y para
medir el rendimiento del sitio sin ellas.

## Estructura

```
src/
├── layouts/Base.astro          cabecera, pie, tema claro/oscuro, caché
├── components/                 tarjetas, rejilla, bandas de sección, última hora
├── lib/data.ts                 lectura del dataset (paginación e id → fichero)
├── lib/format.ts               fechas en español, nombres y colores de sección
└── pages/
    ├── index.astro             portada: apertura + última hora + bandas
    ├── categoria/[...clave]    listado paginado por categoría
    ├── noticia/[...ruta]       noticia completa y relacionadas
    ├── categorias.astro        directorio del archivo
    └── buscar.astro            búsqueda sobre las noticias recientes
```

## Aviso

jomperr es un agregador: reúne y ordena noticias publicadas por medios
deportivos, y cada una enlaza a su publicación original. Los derechos de cada
noticia pertenecen al medio que la publicó; jomperr no está afiliado a ninguno
de ellos.
