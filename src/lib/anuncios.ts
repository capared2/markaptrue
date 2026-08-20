/**
 * Catálogo de unidades publicitarias.
 *
 * Cada unidad se pide con la global `atOptions`, que todos los `invoke.js`
 * leen al ejecutarse. Por eso cada banner se pinta dentro de su propio iframe:
 * si compartieran página se pisarían la variable y acabarían mostrando todos
 * la misma unidad, o ninguna.
 */
export interface Unidad {
  key: string;
  ancho: number;
  alto: number;
  /** Anchura mínima de pantalla para usar esta unidad. */
  desde: number;
}

/**
 * Cada hueco declara sus variantes de mayor a menor. En el navegador se elige
 * una sola según la pantalla: cargar varias y esconder las que sobran contaría
 * impresiones que nadie ve, y eso es tráfico inválido.
 */
export const HUECOS: Record<string, Unidad[]> = {
  // Franja ancha: cabecera de sección, separadores entre bloques.
  horizontal: [
    { key: "abc687b80ad84ad91720ea5f9640e868", ancho: 728, alto: 90, desde: 768 },
    { key: "6e0bb5d976c8b1815d0a7f35f9b70842", ancho: 320, alto: 50, desde: 0 },
  ],
  // Franja estrecha, para huecos con menos aire.
  franja: [
    { key: "f47dbc06d83a5cf5ceab305d755aaaaf", ancho: 468, alto: 60, desde: 520 },
    { key: "6e0bb5d976c8b1815d0a7f35f9b70842", ancho: 320, alto: 50, desde: 0 },
  ],
  // Rectángulo: encaja tanto en la rejilla de tarjetas como dentro del texto.
  rectangulo: [{ key: "39cfc41181e0b5422181fa84e1d608bc", ancho: 300, alto: 250, desde: 0 }],
  // Vertical: solo en la barra lateral, donde hay altura de sobra.
  vertical: [
    { key: "b2d3af2a44f75d506f4e587df32439cb", ancho: 160, alto: 600, desde: 1024 },
    { key: "79584de4740ee22349a56502be8745cf", ancho: 160, alto: 300, desde: 1024 },
  ],
};

/** Unidad nativa: se integra con el contenido y solo admite una por página. */
export const NATIVO = {
  id: "container-a64c7e57da5513c2f5669e608ac7157c",
  script: "https://pl30939588.effectivecpmnetwork.com/a64c7e57da5513c2f5669e608ac7157c/invoke.js",
};

export const BASE_INVOKE = "https://www.highperformanceformat.com";

/** Altura que se reserva antes de cargar, para que nada salte al aparecer. */
export function altoReservado(hueco: string): number {
  const variantes = HUECOS[hueco] ?? [];
  return Math.max(...variantes.map((v) => v.alto), 0);
}
