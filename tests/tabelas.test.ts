import { describe, expect, it } from "vitest";

import { descrever, diferencaDeTabela, diferencaDeTexto } from "../src/diferenca.ts";
import { decodificar } from "../src/fonte.ts";
import { csv } from "../src/gravar.ts";
import { extrairDadosOriginais, ibsCbsParaArquivos } from "../src/ibs-cbs.ts";
import { dataIso, ncmParaCsv } from "../src/ncm.ts";

describe("ncmParaCsv", () => {
  const json = JSON.stringify({
    Data_Ultima_Atualizacao_NCM: "Vigente em 26/10/2026",
    Ato: "Resolução Gecex nº 926/2026",
    Nomenclaturas: [
      { Codigo: "0101.21.00", Descricao: "-- Reprodutores de raça pura", Data_Inicio: "01/04/2022", Data_Fim: "31/12/9999", Tipo_Ato_Ini: "Res Gecex", Numero_Ato_Ini: "272", Ano_Ato_Ini: "2021" },
      { Codigo: "01", Descricao: "Animais vivos.", Data_Inicio: "01/04/2022", Data_Fim: "31/12/9999", Tipo_Ato_Ini: "Res Gecex", Numero_Ato_Ini: "272", Ano_Ato_Ini: "2021" },
      { Codigo: "0101.2", Descricao: "- Cavalos:", Data_Inicio: "01/04/2022", Data_Fim: "30/06/2026", Tipo_Ato_Ini: "Res Gecex", Numero_Ato_Ini: "272", Ano_Ato_Ini: "2021" },
    ],
  });
  const t = ncmParaCsv(json);

  it("ordena pela hierarquia do código, não pela ordem do JSON", () => {
    expect(t.csv.split("\n").slice(1, 4).map((l) => l.split(",")[0])).toEqual(["01", "0101.2", "0101.21.00"]);
  });

  it("converte datas e trata o 31/12/9999 como sem fim", () => {
    expect(t.csv).toContain("0101.2,- Cavalos:,2022-04-01,2026-06-30,Res Gecex 272/2021");
    expect(dataIso("31/12/9999")).toBe("");
  });

  it("não grava a data de hoje que o Siscomex põe no JSON", () => {
    expect(t.csv).not.toContain("26/10/2026");
    expect(t.ato).toBe("Resolução Gecex nº 926/2026");
    expect(t.folhas).toBe(1);
  });
});

describe("ibsCbsParaArquivos", () => {
  const dados = [
    {
      Cst: "200", NomeCst: "Alíquota reduzida", IndExigeTrib: true, IndReducaoAliq: true,
      DthIniVig: "2025-05-01T00:00:00", DthFimVig: null, CtrDthInc: "2025-05-01T09:00:00",
      ClassificacoesTributarias: [
        {
          CodClassTrib: "200003", NomeClassTrib: "Vendas de produtos da cesta básica", Cst: "200",
          PercRedIbs: 100, PercRedCbs: 100, TipoAliq: "Padrão", IndNfe: true, IndNfce: true, IndCte: false,
          TexUrlLegislacao: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#anexoi",
          DthIniVig: "2026-01-01T00:00:00", DthFimVig: null, CtrDthInc: "2026-02-19T11:05:46",
          Anexos: JSON.stringify([
            { NroAnexo: 1, CodNcmNbs: "10063021", TipoCodigo: "NCM", DescItemAnexo: "Arroz", DescAnexo: "Anexo I", NroItemAnexoLei: 1, DescCondicao: null, DescExcecao: null, Observacao: null, DthIniVig: "2026-01-01T00:00:00", DthFimVig: null, CtrDthInc: "2026-02-19T11:05:46" },
          ]),
        },
      ],
    },
  ];
  // A página real tem um `]` dentro de texto: o recorte não pode parar nele.
  const html = `<script>var x = 1; var dadosOriginais = ${JSON.stringify(dados).replace("cesta básica", "cesta básica [LC 214]")}; var y = [];</script>`;
  const t = ibsCbsParaArquivos(html);

  it("recorta o array certo mesmo com colchete dentro de texto", () => {
    expect(extrairDadosOriginais(html)).toHaveLength(1);
  });

  it("lista a classificação com redução e os documentos em que vale", () => {
    expect(t.classificacoes).toContain("200003,200,Vendas de produtos da cesta básica [LC 214],100,100,Padrão,NF-e NFC-e,");
  });

  it("liga a classificação ao NCM do anexo da lei", () => {
    expect(t.porNcmNbs).toContain("200003,NCM,10063021,Arroz,Anexo I,1,,,,2026-01-01,");
  });

  it("tira o carimbo interno do portal, que mudaria sem a regra mudar", () => {
    expect(t.json).not.toContain("CtrDthInc");
    expect(t.totais).toEqual({ csts: 1, classificacoes: 1, codigosNcmNbs: 1 });
  });

  it("avisa quando a página muda de formato", () => {
    expect(() => extrairDadosOriginais("<html>outra coisa</html>")).toThrow(/formato mudou/);
  });
});

describe("decodificar", () => {
  const cp1252 = Uint8Array.from([0x4e, 0xba, 0x20, 0x31, 0x32, 0x33, 0x20, 0x96, 0x20, 0x41, 0xe7, 0xe3, 0x6f]); // "Nº 123 – Ação"

  it("sem charset declarado e sem UTF-8 válido, lê como Windows-1252", () => {
    expect(decodificar("text/html", cp1252)).toBe("Nº 123 – Ação");
  });

  it("ISO-8859-1 declarado vira Windows-1252, que é o que o servidor manda de fato", () => {
    expect(decodificar("text/html; charset=ISO-8859-1", cp1252)).toBe("Nº 123 – Ação");
  });

  it("UTF-8 com BOM perde o BOM", () => {
    const bytes = new TextEncoder().encode("﻿{\"a\":1}");
    expect(decodificar("application/json", bytes)).toBe('{"a":1}');
  });
});

describe("resumo das mudanças", () => {
  it("conta parágrafos que entraram e saíram", () => {
    expect(diferencaDeTexto("a\n\nb\n", "a\n\nc\n\nd\n")).toEqual({ entraram: 2, sairam: 1 });
  });

  it("conta códigos novos, alterados e removidos", () => {
    const antes = "codigo,descricao\n01,Animais\n02,Carnes\n";
    const depois = "codigo,descricao\n01,Animais vivos\n03,Peixes\n";
    const d = diferencaDeTabela(antes, depois);
    expect(d).toEqual({ novos: 1, alterados: 1, removidos: 1 });
    expect(descrever(d, "código")).toBe("1 código novo(s), 1 alterado(s), 1 removido(s)");
  });
});

describe("csv", () => {
  it("põe aspas só quando precisa e dobra as internas", () => {
    expect(csv(["a", "b"], [["1, 2", 'diz "oi"'], ["x", null]])).toBe('a,b\n"1, 2","diz ""oi"""\nx,\n');
  });

  it("não deixa quebra de linha dentro do campo, que o Git normalizaria", () => {
    expect(csv(["nome"], [["Bens \r\n de capital"]])).toBe("nome\nBens de capital\n");
  });
});
