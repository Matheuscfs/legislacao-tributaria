/**
 * Descoberta de leis complementares novas, pelo quadro do Planalto.
 *
 * O LexML e o Diário Oficial bloqueiam acesso automatizado, mas o Planalto
 * mantém um quadro com todas as leis complementares, cada uma com data,
 * publicação e ementa. É por lei complementar que mudam o Simples e a
 * reforma do consumo, então vigiar esse quadro pega o que mais importa.
 *
 * A ementa decide se a lei é tributária. Errar para mais custa um aviso a
 * mais; errar para menos esconde uma lei, então o filtro é largo.
 */

import { load } from "cheerio";

import { csv } from "./gravar.ts";

export type LeiComplementar = {
  numero: number;
  data: string;
  url: string;
  ementa: string;
  tributaria: boolean;
};

const TRIBUTARIO =
  /tribut|impost|contribui[cç]|\bIBS\b|\bCBS\b|\bICMS\b|\bISS\b|\bIPI\b|\bPIS\b|cofins|simples nacional|fiscal|receita federal|aduan|al[ií]quota|seletivo|arrecada/i;

const BASE = "https://www.planalto.gov.br/ccivil_03/leis/lcp/";

const limpo = (s: string) => s.replace(/[\s ]+/g, " ").trim();

/** "21.10.2026" → "2026-10-21". */
function dataDoQuadro(texto: string): string {
  const m = texto.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}

export function lerQuadroLcp(html: string): LeiComplementar[] {
  const $ = load(html);
  const leis: LeiComplementar[] = [];
  for (const tr of $("tr").toArray()) {
    const link = $(tr).find("a").filter((_, a) => /lcp\d+\.htm/i.test($(a).attr("href") ?? "")).first();
    const titulo = limpo(link.text());
    const numero = Number(titulo.match(/Complementar n[º°o]\s*([\d.]+)/i)?.[1]?.replace(/\./g, ""));
    if (!numero) continue;
    const celulas = $(tr).find("td").toArray().map((td) => limpo($(td).text()));
    // A ementa é a célula mais longa que não é a do título.
    const ementa = celulas.filter((c) => !c.startsWith(titulo)).sort((a, b) => b.length - a.length)[0] ?? "";
    leis.push({
      numero,
      data: dataDoQuadro(titulo),
      url: new URL(link.attr("href")!, BASE).href,
      ementa,
      tributaria: TRIBUTARIO.test(ementa),
    });
  }
  if (leis.length === 0) throw new Error("Nenhuma lei complementar no quadro do Planalto: o formato mudou.");
  return leis.sort((a, b) => b.numero - a.numero);
}

export function quadroParaCsv(leis: LeiComplementar[], noCatalogo: Set<string>): string {
  return csv(
    ["numero", "data", "tributaria", "no_catalogo", "url", "ementa"],
    leis.map((l) => [l.numero, l.data, l.tributaria, noCatalogo.has(l.url.toLowerCase()), l.url, l.ementa])
  );
}
