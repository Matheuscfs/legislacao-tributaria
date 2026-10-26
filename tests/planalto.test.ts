import { describe, expect, it } from "vitest";

import { planaltoParaMarkdown } from "../src/planalto.ts";

// Recorte do formato real do Planalto: cabeçalho de navegação antes do
// título, numeral colado ("SeçãoI"), redação antiga riscada ao lado da nova.
const HTML = `<html><body>
<table><tr><td><p>Presidência da República Casa Civil</p></td></tr></table>
<p><a href="#">LEI COMPLEMENTAR Nº 999, DE 1º DE JANEIRO DE 2030</a></p>
<p>Institui um regime de teste.</p>
<p>CAPÍTULO I</p>
<p>DISPOSIÇÕES PRELIMINARES</p>
<p>Seção<span>I</span></p>
<p>Da Abrangência</p>
<p>Art. 1º Esta Lei vale para <a href="x.htm">microempresas</a>.</p>
<p>I - <strike>limite de R$ 3.600.000,00 </strike><a href="y.htm"><strike>(Redação dada pela Lei nº 1)</strike></a></p>
<p>I - limite de R$ 4.800.000,00 (Redação dada pela Lei nº 2)</p>
<p><s>Art. 2º Revogado inteiro.</s></p>
<p>1. Linha que viraria lista no Markdown.</p>
<p>*</p>
</body></html>`;

describe("planaltoParaMarkdown", () => {
  const r = planaltoParaMarkdown(HTML);
  const linhas = r.markdown.trim().split("\n\n");

  it("começa no título e descarta a navegação de cima", () => {
    expect(linhas[0]).toBe("# LEI COMPLEMENTAR Nº 999, DE 1º DE JANEIRO DE 2030");
    expect(r.markdown).not.toContain("Presidência");
  });

  it("junta a divisão ao nome que vem na linha de baixo", () => {
    expect(r.markdown).toContain("### CAPÍTULO I — DISPOSIÇÕES PRELIMINARES");
    expect(r.markdown).toContain("#### SeçãoI — Da Abrangência");
  });

  it("mantém a redação antiga riscada e a nova logo abaixo", () => {
    expect(r.markdown).toContain("I - ~~limite de R$ 3.600.000,00 (Redação dada pela Lei nº 1)~~");
    expect(r.markdown).toContain("I - limite de R$ 4.800.000,00 (Redação dada pela Lei nº 2)");
    expect(r.markdown).toContain("~~Art. 2º Revogado inteiro.~~");
  });

  it("tira os links e deixa o texto", () => {
    expect(r.markdown).toContain("Art. 1º Esta Lei vale para microempresas.");
    expect(r.markdown).not.toContain("href");
  });

  it("escapa o que o Markdown leria como lista e descarta o asterisco solto", () => {
    expect(r.markdown).toContain("\\1. Linha que viraria lista");
    expect(linhas).not.toContain("*");
  });

  it("conta artigos, inclusive o revogado", () => {
    expect(r.artigos).toBe(2);
  });

  it("é determinístico: a mesma página gera o mesmo texto", () => {
    expect(planaltoParaMarkdown(HTML).markdown).toBe(r.markdown);
  });

  it("recusa página sem título de norma, em vez de gravar lixo", () => {
    expect(() => planaltoParaMarkdown("<p>Página de erro</p>")).toThrow(/título/);
  });
});
