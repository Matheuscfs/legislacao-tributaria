/**
 * TIPI — alíquota de IPI por NCM, da planilha que a Receita Federal publica.
 *
 * A planilha tem cabeçalho de capa, notas de seção e de capítulo no meio das
 * linhas e a lista de atos que a atualizaram. Fica só o que é linha de
 * produto (NCM, exceção, descrição, alíquota) e, nos metadados, o último ato
 * da lista — é ele que diz de quando é a versão.
 */

import ExcelJS from "exceljs";

import { csv } from "./gravar.ts";

const NCM = /^\d{2}(\.\d{2})?$|^\d{4}(\.\d{1,2}(\.\d{1,2})?)?$/;

export type TabelaTipi = {
  csv: string;
  linhas: number;
  /** Último ato da lista de "Atualizações" da capa, ex.: "Decreto nº 12.xxx, de …". */
  ultimaAtualizacao: string | null;
};

function texto(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") {
    if ("richText" in valor) return valor.richText.map((t) => t.text).join("");
    if ("result" in valor) return String(valor.result ?? "");
    if ("text" in valor) return String(valor.text);
  }
  return String(valor);
}

const limpo = (s: string) => s.replace(/[\s ]+/g, " ").trim();

export async function tipiParaCsv(bytes: Uint8Array): Promise<TabelaTipi> {
  const planilha = new ExcelJS.Workbook();
  await planilha.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const aba = planilha.worksheets[0];

  const linhas: string[][] = [];
  let atualizacoes: string[] = [];
  aba.eachRow((row) => {
    const [ncm, ex, descricao, aliquota] = [1, 2, 3, 4].map((c) => limpo(texto(row.getCell(c).value)));
    if (/^Atualizações:/i.test(ncm)) {
      atualizacoes = texto(row.getCell(1).value).split("\n").map(limpo).filter((l) => l && !/^Atualizações/i.test(l));
      return;
    }
    if (!NCM.test(ncm)) return;
    // O Excel guarda alíquota como número: 6.5 vira "6.5", que é como fica no CSV.
    linhas.push([ncm, ex, descricao, aliquota]);
  });
  if (linhas.length === 0) throw new Error("Nenhuma linha de NCM na planilha da TIPI: o formato mudou.");

  return {
    csv: csv(["ncm", "ex", "descricao", "aliquota_ipi"], linhas),
    linhas: linhas.length,
    ultimaAtualizacao: atualizacoes.at(-1) ?? null,
  };
}
