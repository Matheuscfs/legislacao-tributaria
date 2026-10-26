import { afterEach, describe, expect, it } from "vitest";

import { cestParaCsv } from "../src/cest.ts";
import { confazParaMarkdown, paginasDoSitemap } from "../src/confaz.ts";
import { pedido } from "../src/fonte.ts";
import { csv, lerCsv } from "../src/gravar.ts";

const pagina = (corpo: string, titulo = "CONVÊNIO ICMS 1/23", ementa = "") => `
  <html><body>
    <h1 class="documentFirstHeading">${titulo}</h1>
    ${ementa ? `<div class="documentDescription">${ementa}</div>` : ""}
    <div id="parent-fieldname-text">${corpo}</div>
  </body></html>`;

describe("paginasDoSitemap", () => {
  const xml = `<urlset>
    <url><loc>https://www.confaz.fazenda.gov.br/legislacao/convenios/2018/CV142_18</loc><lastmod>2026-09-30T16:42:25-03:00</lastmod></url>
    <url><loc>https://www.confaz.fazenda.gov.br/legislacao/convenios/2018/conveniosicms_2018</loc><lastmod>2020-01-01T00:00:00-03:00</lastmod></url>
    <url><loc>https://www.confaz.fazenda.gov.br/legislacao/convenios/2022/2022</loc></url>
    <url><loc>https://www.confaz.fazenda.gov.br/legislacao/protocolos/2023/pt001_23</loc><lastmod>2023-02-27T10:00:00-03:00</lastmod></url>
    <url><loc>https://www.confaz.fazenda.gov.br/legislacao/ajustes/2024/nota-tecnica.pdf</loc></url>
    <url><loc>https://www.confaz.fazenda.gov.br/legislacao/ajustes/sinief/modelos/gnre_aj01</loc></url>
    <url><loc>https://www.confaz.fazenda.gov.br/legislacao/despacho/2024/dp001_24</loc></url>
  </urlset>`;

  it("fica só com as páginas de ato, com a data da última alteração", () => {
    expect(paginasDoSitemap(xml)).toEqual([
      {
        url: "https://www.confaz.fazenda.gov.br/legislacao/convenios/2018/CV142_18",
        secao: "convenios",
        ano: "2018",
        arquivo: "normas/confaz/convenios/2018/cv142_18.md",
        alteradoEm: "2026-09-30T16:42:25-03:00",
      },
      {
        url: "https://www.confaz.fazenda.gov.br/legislacao/protocolos/2023/pt001_23",
        secao: "protocolos",
        ano: "2023",
        arquivo: "normas/confaz/protocolos/2023/pt001_23.md",
        alteradoEm: "2023-02-27T10:00:00-03:00",
      },
    ]);
  });
});

describe("confazParaMarkdown", () => {
  it("risca a redação anterior marcada por classe e mantém a remissão legível", () => {
    const r = confazParaMarkdown(
      pagina(
        `<p class="A5-1TextoAcordo"><b>Cláusula primeira</b> Fica autorizado o Estado.</p>
         <p class="A8-1Remissao">Nova redação dada ao § 2º pelo Conv. ICMS 123/24, efeitos a partir de 01.11.24.</p>
         <p class="A5-1TextoAcordo">§ 2º Deverá ser deduzido o ICMS destacado.</p>
         <p class="A8-2RemissaoAnt">Redação anterior acrescida pelo Conv. ICMS 225/23, efeitos de 01.01.24 a 31.10.24</p>
         <p class="A8-3RedacaoAnt">§ 2º Deverá ser deduzido o ICMS da operação.</p>`,
        "CONVÊNIO ICMS 1/23",
        "Autoriza o Estado a conceder benefício."
      ),
      "https://www.confaz.fazenda.gov.br/legislacao/convenios/2023/CV001_23"
    )!;
    expect(r.markdown).toBe(
      [
        "# CONVÊNIO ICMS 1/23",
        "> Autoriza o Estado a conceder benefício.",
        "Fonte: <https://www.confaz.fazenda.gov.br/legislacao/convenios/2023/CV001_23>",
        "Cláusula primeira Fica autorizado o Estado.",
        "Nova redação dada ao § 2º pelo Conv. ICMS 123/24, efeitos a partir de 01.11.24.",
        "§ 2º Deverá ser deduzido o ICMS destacado.",
        "Redação anterior acrescida pelo Conv. ICMS 225/23, efeitos de 01.01.24 a 31.10.24",
        "~~§ 2º Deverá ser deduzido o ICMS da operação.~~",
      ].join("\n\n") + "\n"
    );
    expect(r.clausulas).toBe(1);
  });

  it("nas páginas antigas, risca o verde mas não a remissão que vem dentro dele", () => {
    const r = confazParaMarkdown(
      pagina(
        `<font face="Arial" size="2" color="#ff0000"><p>Nova redação dada a cláusula quarta pelo Conv. ICMS 99/06.</p></font>
         <b><font face="Arial"><p>Cláusula quarta</p></font></b> Este convênio entra em vigor em 2007.
         <dir><font face="Arial" size="2" color="#008000">
           <p>Redação anterior dada à cláusula quarta pelo Conv. ICMS 10/06.</p>
           <p>Cláusula quarta Este convênio entra em vigor em 2006.</p>
         </font></dir>`
      ),
      "x"
    )!;
    expect(r.markdown.split("\n\n").slice(2)).toEqual([
      "Nova redação dada a cláusula quarta pelo Conv. ICMS 99/06.",
      "Cláusula quarta",
      "Este convênio entra em vigor em 2007.",
      "Redação anterior dada à cláusula quarta pelo Conv. ICMS 10/06.",
      "~~Cláusula quarta Este convênio entra em vigor em 2006.~~\n",
    ]);
  });

  it("transforma tabela em tabela do Markdown, uma linha por item", () => {
    const r = confazParaMarkdown(
      pagina(
        `<table>
           <tr><td><p>ITEM</p></td><td><p>CEST</p></td><td><p>NCM/SH</p></td><td><p>DESCRIÇÃO</p></td></tr>
           <tr><td><p class="A7-2Tabelajustificado">42.0</p></td><td><p class="A7-2Tabelajustificado">01.042.00</p></td><td><p class="A7-2Tabelajustificado">8421.32.00</p></td><td><p class="A7-2Tabelajustificado">Depuradores | catalíticos</p></td></tr>
           <tr><td colspan="4"><p class="A8-2RemissaoAnt">Redação original, efeitos até 01.05.22.</p></td></tr>
           <tr><td><p class="A9-2Tabelajustificadoverde">42.0</p></td><td><p class="A9-2Tabelajustificadoverde">01.042.00</p></td><td><p class="A9-2Tabelajustificadoverde">8421.39.20</p></td><td><p class="A9-2Tabelajustificadoverde">Depuradores</p></td></tr>
         </table>`
      ),
      "x"
    )!;
    expect(r.markdown.trimEnd().split("\n\n")[2].split("\n")).toEqual([
      "| ITEM | CEST | NCM/SH | DESCRIÇÃO |",
      "| --- | --- | --- | --- |",
      "| 42.0 | 01.042.00 | 8421.32.00 | Depuradores \\| catalíticos |",
      "| Redação original, efeitos até 01.05.22. |  |  |  |",
      "| ~~42.0~~ | ~~01.042.00~~ | ~~8421.39.20~~ | ~~Depuradores~~ |",
    ]);
  });

  it("devolve null para índice ou página inexistente", () => {
    expect(confazParaMarkdown("<html><body><h1>Desculpe, mas esta página não existe…</h1></body></html>", "x")).toBeNull();
  });
});

describe("cestParaCsv e a redação anterior", () => {
  it("ignora a linha verde, que é a redação antiga do item", () => {
    const t = cestParaCsv(`<table>
      <tr><td><p class="A7-2Tabelajustificado">42.0</p></td><td><p class="A7-2Tabelajustificado">01.042.00</p></td><td><p class="A7-2Tabelajustificado">8421.32.00</p></td><td><p class="A7-2Tabelajustificado">Depuradores</p></td></tr>
      <tr><td><p class="A9-2Tabelajustificadoverde">42.0</p></td><td><p class="A9-2Tabelajustificadoverde">01.042.00</p></td><td><p class="A9-2Tabelajustificadoverde">8421.39.20</p></td><td><p class="A9-2Tabelajustificadoverde">Depuradores</p></td></tr>
    </table>`);
    expect(t.cest).toBe("cest,ncm,item,descricao,revogado\n01.042.00,8421.32.00,42.0,Depuradores,false\n");
  });
});

describe("lerCsv", () => {
  it("lê de volta o que csv() gravou", () => {
    const texto = csv(["a", "b"], [["1", 'x, "y"'], ["", "z"]]);
    expect(lerCsv(texto)).toEqual([
      { a: "1", b: 'x, "y"' },
      { a: "", b: "z" },
    ]);
  });
});

describe("pedido", () => {
  afterEach(() => {
    delete process.env.PROXY_BRASIL_URL;
    delete process.env.PROXY_BRASIL_CHAVE;
  });

  it("vai direto sem proxy configurado", () => {
    expect(pedido("https://www.confaz.fazenda.gov.br/x")[0]).toBe("https://www.confaz.fazenda.gov.br/x");
  });

  it("passa pelo proxy só para os hosts que exigem conexão do Brasil", () => {
    process.env.PROXY_BRASIL_URL = "https://proxy.exemplo/api/buscar";
    process.env.PROXY_BRASIL_CHAVE = "segredo";
    const [url, cabecalhos] = pedido("https://www.confaz.fazenda.gov.br/legislacao/convenios/2018/CV142_18");
    expect(url).toBe("https://proxy.exemplo/api/buscar?url=https%3A%2F%2Fwww.confaz.fazenda.gov.br%2Flegislacao%2Fconvenios%2F2018%2FCV142_18");
    expect(cabecalhos["x-chave"]).toBe("segredo");
    expect(pedido("https://www.planalto.gov.br/x")[0]).toBe("https://www.planalto.gov.br/x");
  });
});
