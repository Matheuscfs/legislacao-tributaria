/**
 * CEST — Código Especificador da Substituição Tributária, do Convênio ICMS
 * 142/2018 no site do CONFAZ.
 *
 * O convênio traz um quadro de segmentos e uma tabela por anexo (item, CEST,
 * NCM, descrição). O mesmo CEST aparece em várias linhas quando vale para
 * mais de uma NCM, então a chave de cada linha é CEST + NCM. Item revogado
 * fica na tabela com a marca, porque a revogação também é informação.
 */

import { load } from "cheerio";

import { csv } from "./gravar.ts";

const CODIGO_CEST = /^\d{2}\.\d{3}\.\d{2}$/;

export type TabelaCest = {
  segmentos: string;
  cest: string;
  totais: { segmentos: number; linhas: number; codigos: number };
};

const limpo = (s: string) => s.replace(/[\s ]+/g, " ").trim();

export function cestParaCsv(html: string): TabelaCest {
  const $ = load(html);
  const segmentos = new Map<string, string>();
  const linhas: string[][] = [];

  for (const tabela of $("table").toArray()) {
    for (const tr of $(tabela).find("tr").toArray()) {
      const celulas = $(tr).find("td").toArray().map((td) => limpo($(td).text()));
      const i = celulas.findIndex((c) => CODIGO_CEST.test(c));
      if (i >= 0) {
        const [cest, ncm = "", descricao = ""] = celulas.slice(i);
        linhas.push([cest, ncm, celulas[i - 1] ?? "", descricao, String(/^REVOGAD/i.test(descricao))]);
      } else if (celulas.length === 3 && /^\d{2}$/.test(celulas[2]) && /^\d{2}$/.test(celulas[0])) {
        // Quadro do Anexo I: item | nome do segmento | código do segmento.
        segmentos.set(celulas[2], celulas[1]);
      }
    }
  }
  if (linhas.length === 0) throw new Error("Nenhum CEST no HTML do CONFAZ: o formato mudou.");

  linhas.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return {
    segmentos: csv(
      ["segmento", "nome"],
      [...segmentos].sort(([a], [b]) => a.localeCompare(b)).map(([codigo, nome]) => [codigo, nome])
    ),
    cest: csv(["cest", "ncm", "item", "descricao", "revogado"], linhas),
    totais: { segmentos: segmentos.size, linhas: linhas.length, codigos: new Set(linhas.map((l) => l[0])).size },
  };
}
