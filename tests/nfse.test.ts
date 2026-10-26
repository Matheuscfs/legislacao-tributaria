import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { acharPlanilha, anexoBParaCsv, anexoViiiParaCsv } from "../src/nfse.ts";

async function bytesDe(planilha: ExcelJS.Workbook): Promise<Uint8Array> {
  return new Uint8Array(await planilha.xlsx.writeBuffer());
}

describe("acharPlanilha", () => {
  const html = `
    <a href="https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc">RTC</a>
    <a href="rtc/anexoviii-correlacaoitemnbsindopcclasstrib_ibscbs_v1-00-00.xlsx">v1.00</a>
    <a href="https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexo_viii-tabela-correlacao-v01-02-00-20261026.xlsx">v1.02</a>`;

  it("fica com a versão mais alta, em endereço absoluto", () => {
    expect(acharPlanilha(html, "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/", /anexo_?viii.*\.xlsx$/i)).toBe(
      "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexo_viii-tabela-correlacao-v01-02-00-20261026.xlsx"
    );
  });

  it("link relativo vira absoluto", () => {
    expect(acharPlanilha(html, "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/", /v1-00-00\.xlsx$/)).toBe(
      "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexoviii-correlacaoitemnbsindopcclasstrib_ibscbs_v1-00-00.xlsx"
    );
  });

  it("página sem a planilha falha alto", () => {
    expect(() => acharPlanilha("<p>nada</p>", "https://www.gov.br/", /anexo_b/i)).toThrow(/a página mudou/);
  });
});

describe("anexoBParaCsv", async () => {
  const planilha = new ExcelJS.Workbook();
  const lista = planilha.addWorksheet("LISTA.SERV.NAC.");
  lista.addRow(["CÓDIGO DE TRIBUTAÇÃO NACIONAL", "ITEM", "SUBITEM", "DESDOBRO NACIONAL", "DESCRIÇÃO"]);
  lista.addRow([null, "1", "0", "0", "Serviços de Informática e congêneres."]);
  lista.addRow([null, "1", "3", "0", "Processamento, armazenamento ou hospedagem de dados."]);
  // O Excel guarda o código como número: 10301, sem o zero da frente.
  lista.addRow([10301, "1", "3", "1", "Processamento de dados."]);
  lista.addRow([10302, "1", "3", "2", "Armazenamento ou hospedagem de dados."]);
  lista.addRow([null, "17", "0", "0", "Serviços de apoio técnico, administrativo, jurídico, contábil, comercial e congêneres."]);
  lista.addRow([171901, "17", "19", "1", "Contabilidade, inclusive serviços técnicos e auxiliares."]);
  const nbs = planilha.addWorksheet("LISTA.NBS_v2.0");
  nbs.addRow(["CÓDIGO NBS", "DESCRIÇÃO"]);
  nbs.addRow(["1.1502.10.00", "Serviços de projeto, desenvolvimento e instalação de aplicativos"]);
  const t = await anexoBParaCsv(await bytesDe(planilha));

  it("um código de 6 dígitos por desdobro, com o item da LC 116 e a descrição do item", () => {
    expect(t.listaServico.split("\n").slice(1, 4)).toEqual([
      "010301,01.03,Processamento de dados.,Serviços de Informática e congêneres.",
      "010302,01.03,Armazenamento ou hospedagem de dados.,Serviços de Informática e congêneres.",
      '171901,17.19,"Contabilidade, inclusive serviços técnicos e auxiliares.","Serviços de apoio técnico, administrativo, jurídico, contábil, comercial e congêneres."',
    ]);
    expect(t.totais).toEqual({ codigosDeTributacao: 3, itensLc116: 2, nbs: 1 });
  });

  it("guarda a NBS sem o cabeçalho", () => {
    expect(t.nbs).toBe("nbs,descricao\n1.1502.10.00,\"Serviços de projeto, desenvolvimento e instalação de aplicativos\"\n");
  });
});

describe("anexoViiiParaCsv", async () => {
  const planilha = new ExcelJS.Workbook();
  const aba = planilha.addWorksheet("tabela geral");
  aba.addRow(["Item LC 116", "Descrição Item", "NBS", "DESCRIÇÃO NBS", "COD_ATIV_SN", "DESCRIÇÃO ATIV_SN", "INDOP", "Local incidência IBS", "cClassTrib", "nome cClassTrib"]);
  aba.addRow(["01.01", "Análise", "1.1502.10.00", "", "9", "", "100301", "", "000001", ""]);
  aba.addRow([null, null, "1.1502.90.00", "", null, null, null, null, null, null]);
  aba.addRow([null, null, null, null, null, null, null, null, "200043", ""]);
  aba.addRow(["01.02", "Programação", "1.1502.10.00", "", "9", "", "100301", "", "000001", ""]);
  // O item, a atividade e o indicador valem para o bloco do item; o
  // cClassTrib 000001 vale para as duas NBS; a última NBS se estende à
  // linha do cClassTrib extra.
  aba.mergeCells("A2:A4");
  aba.mergeCells("E2:E4");
  aba.mergeCells("G2:G4");
  aba.mergeCells("I2:I3");
  aba.mergeCells("C3:C4");
  const t = await anexoViiiParaCsv(await bytesDe(planilha));

  it("desfaz as mesclas: cada linha da planilha vira uma linha completa", () => {
    expect(t.csv.split("\n").slice(0, 5)).toEqual([
      "item_lc116,nbs,cod_ativ_sn,indop,cclasstrib",
      "01.01,1.1502.10.00,9,100301,000001",
      "01.01,1.1502.90.00,9,100301,000001",
      "01.01,1.1502.90.00,9,100301,200043",
      "01.02,1.1502.10.00,9,100301,000001",
    ]);
    expect(t.totais).toEqual({ linhas: 4, itensLc116: 2 });
  });

  it("coluna que sumiu falha alto", async () => {
    const outra = new ExcelJS.Workbook();
    outra.addWorksheet("tabela geral").addRow(["Item LC 116", "NBS"]);
    await expect(anexoViiiParaCsv(await bytesDe(outra))).rejects.toThrow(/sem as colunas/);
  });
});
