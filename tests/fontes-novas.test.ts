import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { cestParaCsv } from "../src/cest.ts";
import { lerQuadroLcp, quadroParaCsv } from "../src/descoberta.ts";
import { diferencaDeTabela } from "../src/diferenca.ts";
import { tipiParaCsv } from "../src/tipi.ts";

describe("cestParaCsv", () => {
  // Recorte do formato do CONFAZ: quadro de segmentos e uma tabela por anexo.
  const html = `
    <table>
      <tr><td>ITEM</td><td>NOME DO SEGMENTO</td><td>CÓDIGO DO SEGMENTO</td></tr>
      <tr><td>01</td><td>Autopeças</td><td>01</td></tr>
      <tr><td>03</td><td>Cervejas, chopes, refrigerantes</td><td>03</td></tr>
    </table>
    <p>AUTOPEÇAS</p>
    <table>
      <tr><td>ITEM</td><td>CEST</td><td>NCM/SH</td><td>DESCRIÇÃO</td></tr>
      <tr><td>56.0</td><td>01.056.00</td><td>8517.14.10</td><td>Telefones móveis do tipo dos utilizados em veículos</td></tr>
      <tr><td>56.0</td><td>01.056.00</td><td>8517.12.13</td><td>Telefones móveis do tipo dos utilizados em veículos.</td></tr>
    </table>
    <table>
      <tr><td colspan="4">Revogados os itens 1.0 e 2.0 do Anexo IV pelo Conv. ICMS 150/20.</td></tr>
      <tr><td>1.0</td><td>03.001.00</td><td>2201.10.00</td><td>REVOGADO</td></tr>
    </table>`;
  const t = cestParaCsv(html);

  it("guarda os segmentos do Anexo I", () => {
    expect(t.segmentos).toBe("segmento,nome\n01,Autopeças\n03,\"Cervejas, chopes, refrigerantes\"\n");
  });

  it("mantém uma linha por CEST e NCM, ordenada", () => {
    expect(t.cest.split("\n").slice(1, 3)).toEqual([
      "01.056.00,8517.12.13,56.0,Telefones móveis do tipo dos utilizados em veículos.,false",
      "01.056.00,8517.14.10,56.0,Telefones móveis do tipo dos utilizados em veículos,false",
    ]);
    expect(t.totais).toEqual({ segmentos: 2, linhas: 3, codigos: 2 });
  });

  it("marca o item revogado e ignora a nota de revogação", () => {
    expect(t.cest).toContain("03.001.00,2201.10.00,1.0,REVOGADO,true");
    expect(t.cest).not.toContain("Conv. ICMS 150/20");
  });

  it("avisa quando a página não tem mais CEST", () => {
    expect(() => cestParaCsv("<table><tr><td>nada</td></tr></table>")).toThrow(/formato mudou/);
  });
});

describe("tipiParaCsv", () => {
  async function planilha(linhas: (string | number | null)[][]): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Tabela Completa");
    for (const l of linhas) ws.addRow(l);
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }

  it("fica só com as linhas de produto e o último ato da capa", async () => {
    const bytes = await planilha([
      ["TABELA DE INCIDÊNCIA DO IMPOSTO SOBRE PRODUTOS INDUSTRIALIZADOS (TIPI)"],
      ["Atualizações:\nDecreto nº 11.182, de 24 de agosto de 2022\nAto Declaratório Executivo RFB nº 1, de 30 de janeiro de 2026"],
      ["NCM ", "EX", "DESCRIÇÃO ", "ALÍQUOTA (%)"],
      ["Notas. 1.- Este Capítulo compreende…"],
      ["01.01", null, "Cavalos, asininos e muares, vivos.", ""],
      ["0101.21.00", null, "-- Reprodutores de raça pura ", "NT"],
      ["2203.00.00", null, "Cervejas de malte.", 3.9],
      ["2203.00.00", "01", "Em garrafas de vidro retornáveis", 3.25],
    ]);
    const t = await tipiParaCsv(bytes);
    expect(t.csv).toBe(
      [
        "ncm,ex,descricao,aliquota_ipi",
        "01.01,,\"Cavalos, asininos e muares, vivos.\",",
        "0101.21.00,,-- Reprodutores de raça pura,NT",
        "2203.00.00,,Cervejas de malte.,3.9",
        "2203.00.00,01,Em garrafas de vidro retornáveis,3.25",
        "",
      ].join("\n")
    );
    expect(t.ultimaAtualizacao).toBe("Ato Declaratório Executivo RFB nº 1, de 30 de janeiro de 2026");
  });

  it("NCM e exceção juntas identificam a linha na comparação", () => {
    const antes = "ncm,ex,descricao,aliquota_ipi\n2203.00.00,,Cervejas,3.9\n2203.00.00,01,Retornáveis,3.25\n";
    const depois = "ncm,ex,descricao,aliquota_ipi\n2203.00.00,,Cervejas,3.9\n2203.00.00,01,Retornáveis,2.6\n";
    expect(diferencaDeTabela(antes, depois, 2)).toEqual({ novos: 0, alterados: 1, removidos: 0 });
  });
});

describe("quadro de leis complementares", () => {
  const html = `<table>
    <tr><td><a href="lcp238.htm">Lei Complementar nº 238, de 21.10.2026</a> Publicada no DOU de 21.10.2026</td>
        <td>Altera a Lei Complementar nº 123, de 14 de dezembro de 2006 (Lei do Simples Nacional), para atualizar o limite de receita bruta.</td></tr>
    <tr><td><a href="lcp237.htm">Lei Complementar nº 237, de 15.9.2026</a></td>
        <td>Dispõe sobre a organização da Defensoria Pública.</td></tr>
    <tr><td><a href="../../principal_ano.htm">Voltar</a></td></tr>
  </table>`;
  const leis = lerQuadroLcp(html);

  it("lê número, data, endereço e ementa de cada lei", () => {
    expect(leis).toHaveLength(2);
    expect(leis[0]).toMatchObject({
      numero: 238,
      data: "2026-10-21",
      url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp238.htm",
      tributaria: true,
    });
    expect(leis[1]).toMatchObject({ numero: 237, data: "2026-09-15", tributaria: false });
  });

  it("marca o que já está no catálogo", () => {
    const csv = quadroParaCsv(leis, new Set(["https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp238.htm"]));
    expect(csv.split("\n")[1]).toMatch(/^238,2026-10-21,true,true,/);
    expect(csv.split("\n")[2]).toMatch(/^237,2026-09-15,false,false,/);
  });

  it("avisa quando o quadro muda de formato", () => {
    expect(() => lerQuadroLcp("<p>sem tabela</p>")).toThrow(/formato mudou/);
  });
});
