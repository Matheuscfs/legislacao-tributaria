/**
 * NFS-e nacional — as tabelas de domínio do Sistema Nacional NFS-e (gov.br/nfse).
 *
 * Três planilhas, das páginas de documentação técnica:
 *
 *   Anexo B     a lista de serviço nacional (o "código de tributação
 *               nacional", cTribNac, de 6 dígitos: item, subitem e desdobro
 *               da lista da LC 116) e a NBS 2.0
 *   Anexo VIII  a correlação entre item da LC 116, NBS, indicador de
 *               operação (cIndOp) e cClassTrib do IBS/CBS. O próprio portal
 *               avisa que é "trabalho inicial, ainda em desenvolvimento", sem
 *               regra de negócio baseada nele — vai como está, com o aviso.
 *
 * O nome do arquivo muda a cada versão ("…-v01-02-00-20261026.xlsx"), então
 * o endereço sai da página, e não de uma constante.
 *
 * Não há tabela oficial de CNAE para código de serviço: o CNAE é a atividade
 * do CNPJ, e o código é do serviço de cada nota.
 */

import * as cheerio from "cheerio";
import ExcelJS from "exceljs";

import { csv } from "./gravar.ts";

/** "…-v01-02-00-20261026.xlsx" → [1, 2, 0, 20261026]; sem versão no nome, vazio. */
function versao(href: string): number[] {
  const m = href.match(/v(\d+)-(\d+)-(\d+)(?:-(\d{8}))?/i);
  return m ? m.slice(1).map((x) => Number(x ?? 0)) : [];
}

function maisNova(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * O link da planilha na página, em endereço absoluto. A página RTC mantém as
 * versões antigas do mesmo anexo na lista; fica a de versão mais alta no
 * nome do arquivo (e, empatando, a primeira da página).
 */
export function acharPlanilha(html: string, base: string, padrao: RegExp): string {
  const $ = cheerio.load(html);
  const hrefs = $("a[href]")
    .map((_, a) => $(a).attr("href")!)
    .get()
    .filter((h) => padrao.test(h));
  if (hrefs.length === 0) throw new Error(`Nenhuma planilha casa com ${padrao} em ${base}: a página mudou.`);
  const escolhido = hrefs.reduce((melhor, h) => (maisNova(versao(h), versao(melhor)) > 0 ? h : melhor));
  return new URL(escolhido, base).href;
}

function texto(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") {
    if ("richText" in valor) return valor.richText.map((t) => t.text).join("");
    if ("result" in valor) return String(valor.result ?? "");
    if ("text" in valor) return String(valor.text);
  }
  return String(valor);
}

const limpo = (s: string) => s.replace(/[\s ]+/g, " ").trim();

async function abrir(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const planilha = new ExcelJS.Workbook();
  await planilha.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return planilha;
}

function aba(planilha: ExcelJS.Workbook, padrao: RegExp): ExcelJS.Worksheet {
  const achada = planilha.worksheets.find((w) => padrao.test(w.name));
  if (!achada) throw new Error(`Aba ${padrao} não encontrada (abas: ${planilha.worksheets.map((w) => w.name).join(", ")}).`);
  return achada;
}

/** "1" → "01": item e subitem da LC 116 têm dois dígitos. */
const dois = (s: string) => s.padStart(2, "0");

export type TabelasNfse = {
  listaServico: string;
  nbs: string;
  totais: { codigosDeTributacao: number; itensLc116: number; nbs: number };
};

/**
 * Anexo B. A lista vem em três níveis: o item ("1", "0", "0": Serviços de
 * Informática), o subitem ("1", "1", "0") e o desdobro nacional ("1", "1",
 * "1"), que é o código usado na nota. O CSV tem uma linha por código, com o
 * item da LC 116 no formato "01.01" e a descrição do item ao lado — é o que
 * dá contexto a "Programação." quando se procura pelo texto.
 */
export async function anexoBParaCsv(bytes: Uint8Array): Promise<TabelasNfse> {
  const planilha = await abrir(bytes);

  const lista = aba(planilha, /LISTA\.SERV/i);
  const grupos = new Map<string, string>();
  const subitens = new Set<string>();
  const linhas: string[][] = [];
  lista.eachRow((row) => {
    const [item, subitem, desdobro, descricao] = [2, 3, 4, 5].map((c) => limpo(texto(row.getCell(c).value)));
    if (!/^\d+$/.test(item) || !/^\d+$/.test(subitem) || !/^\d+$/.test(desdobro)) return;
    if (subitem === "0") {
      grupos.set(item, descricao);
      return;
    }
    if (desdobro === "0") return;
    const codigo = `${dois(item)}${dois(subitem)}${dois(desdobro)}`;
    subitens.add(`${dois(item)}.${dois(subitem)}`);
    linhas.push([codigo, `${dois(item)}.${dois(subitem)}`, descricao, grupos.get(item) ?? ""]);
  });
  if (linhas.length === 0) throw new Error("Nenhum código de tributação nacional no Anexo B: o formato mudou.");

  const abaNbs = aba(planilha, /NBS/i);
  const nbs: string[][] = [];
  abaNbs.eachRow((row) => {
    const [codigo, descricao] = [1, 2].map((c) => limpo(texto(row.getCell(c).value)));
    if (!/^\d/.test(codigo)) return;
    nbs.push([codigo, descricao]);
  });
  if (nbs.length === 0) throw new Error("Nenhum código NBS no Anexo B: o formato mudou.");

  return {
    listaServico: csv(["codigo_tributacao_nacional", "item_lc116", "descricao", "descricao_do_item"], linhas),
    nbs: csv(["nbs", "descricao"], nbs),
    totais: { codigosDeTributacao: linhas.length, itensLc116: subitens.size, nbs: nbs.length },
  };
}

export type CorrelacaoNfse = {
  csv: string;
  totais: { linhas: number; itensLc116: number };
};

/**
 * Anexo VIII. A planilha usa células mescladas: o item vale para as linhas
 * de baixo, e um cClassTrib vale para um bloco de NBS. Aqui cada linha da
 * planilha vira uma linha do CSV com as mesclas desfeitas — o valor da
 * célula mestra repetido em cada linha que ela cobre. Linha sem NBS é um
 * cClassTrib a mais do mesmo item, e fica assim, com a NBS vazia.
 */
export async function anexoViiiParaCsv(bytes: Uint8Array): Promise<CorrelacaoNfse> {
  const planilha = await abrir(bytes);
  const tabela = planilha.worksheets[0];

  // Coluna de cada campo pelo cabeçalho, não pela posição: a versão muda.
  const colunas: Record<string, number> = {};
  tabela.getRow(1).eachCell((cell, c) => {
    const nome = limpo(texto(cell.value)).toUpperCase();
    if (/^ITEM LC/.test(nome)) colunas.item = c;
    else if (nome === "NBS") colunas.nbs = c;
    else if (nome === "COD_ATIV_SN") colunas.ativSn = c;
    else if (nome === "INDOP") colunas.indop = c;
    else if (nome === "CCLASSTRIB") colunas.cclasstrib = c;
  });
  const faltando = ["item", "nbs", "ativSn", "indop", "cclasstrib"].filter((k) => !colunas[k]);
  if (faltando.length) throw new Error(`Anexo VIII sem as colunas ${faltando.join(", ")}: o formato mudou.`);

  // Mestra de cada célula mesclada; o ExcelJS dá o endereço da mestra.
  const valor = (row: ExcelJS.Row, c: number) => {
    const cell = row.getCell(c);
    return limpo(texto(cell.isMerged ? cell.master.value : cell.value));
  };

  const linhas: string[][] = [];
  const itens = new Set<string>();
  tabela.eachRow((row, n) => {
    if (n === 1) return;
    const item = valor(row, colunas.item);
    const nbs = valor(row, colunas.nbs);
    const cclasstrib = valor(row, colunas.cclasstrib);
    if (!/^\d{2}\.\d{2}$/.test(item) || (!nbs && !cclasstrib)) return;
    itens.add(item);
    linhas.push([item, nbs, valor(row, colunas.ativSn), valor(row, colunas.indop), cclasstrib]);
  });
  if (linhas.length === 0) throw new Error("Nenhuma linha de correlação no Anexo VIII: o formato mudou.");

  return {
    csv: csv(["item_lc116", "nbs", "cod_ativ_sn", "indop", "cclasstrib"], linhas),
    totais: { linhas: linhas.length, itensLc116: itens.size },
  };
}
