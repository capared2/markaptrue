# markaptrue — sitio del archivo de noticias de Marca

Frontend que presenta el archivo de noticias de [marca.com](https://www.marca.com/)
recogido por el scraper que vive en
[**capared2/markap**](https://github.com/capared2/markap).

Hecho con **Astro 7 + TypeScript + Tailwind 4**, renderizado en el servidor
sobre **Cloudflare Workers**.

## Cómo obtiene los datos

Este repositorio **no guarda ninguna noticia**: las lee del repositorio del
scraper por HTTP, en tiempo de ejecución.

```
capared2/markap  ──── data/*.json ────►  raw.githubusercontent.com
   (scraper)                                       │
                                                   ▼
                                          este sitio (Cloudflare)
                                                   │
                                                   ▼
                                          caché en el edge
```

Esto tiene dos consecuencias útiles: el sitio no necesita reconstruirse cuando
entran noticias nuevas (aparecen solas), y las dos piezas evolucionan por
separado.

GitHub sirve esos JSON con `max-age=300` y el scraper publica cada dos horas,
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

No hace falta ningún secreto ni ninguna conexión con el repositorio del
scraper: el dataset se lee de una URL pública. El namespace KV que usa Astro
para las sesiones se aprovisiona solo en el primer despliegue.

También se puede desplegar a mano:

```bash
npm run build
npx wrangler deploy
```

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

Los contenidos mostrados proceden de marca.com, propiedad de Unidad Editorial.
Este sitio no está afiliado a Marca ni a Unidad Editorial y se publica con
fines de consulta e investigación personal; los derechos de cada noticia
pertenecen a su editor.
