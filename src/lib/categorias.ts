import type { Indice } from "./types";

export interface Seccion {
  raiz: string;
  total: number;
  hijos: { clave: string; total: number }[];
}

/** Agrupa "futbol/real-madrid" bajo su sección raíz "futbol", de más a menos noticias. */
export function agruparSecciones(indice: Indice | null): Seccion[] {
  const grupos = new Map<string, { clave: string; total: number }[]>();
  for (const entrada of indice?.categories ?? []) {
    const raiz = entrada.category.split("/")[0]!;
    const lista = grupos.get(raiz) ?? [];
    lista.push({ clave: entrada.category, total: entrada.articles });
    grupos.set(raiz, lista);
  }
  return [...grupos.entries()]
    .map(([raiz, hijos]) => ({
      raiz,
      total: hijos.reduce((suma, h) => suma + h.total, 0),
      hijos: hijos.sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
}
