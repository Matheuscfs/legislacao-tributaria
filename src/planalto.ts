/**
 * Texto compilado do Planalto → Markdown estável.
 *
 * O Planalto publica a lei já com as alterações: a redação antiga fica
 * riscada (`<strike>` ou `<s>`) ao lado da nova, seguida da anotação
 * "(Redação dada pela Lei Complementar nº …)". O riscado vira `~~…~~` em vez
 * de sumir, porque competência antiga se apura pelo texto da época — e quem
 * quiser só o texto vigente filtra o que está entre `~~`.
 *
 * Um parágrafo do HTML vira um parágrafo do Markdown, sem quebra no meio:
 * assim o diff do Git aponta o inciso que mudou, e não a página inteira
 * porque uma linha ficou mais comprida.
 */

import { load, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";

export type NormaConvertida = {
  titulo: string;
  markdown: string;
  paragrafos: number;
  artigos: number;
};

type Pedaco = { texto: string; riscado: boolean };

const RISCADO = new Set(["strike", "s", "del"]);
const IGNORADO = new Set(["script", "style", "head"]);

function pedacos($: CheerioAPI, no: AnyNode, riscado: boolean, saida: Pedaco[]) {
  if (no.type === "text") {
    saida.push({ texto: (no as { data: string }).data, riscado });
    return;
  }
  if (no.type !== "tag") return;
  const nome = (no as { name: string }).name.toLowerCase();
  if (IGNORADO.has(nome)) return;
  if (nome === "br") {
    saida.push({ texto: " ", riscado });
    return;
  }
  const dentro = riscado || RISCADO.has(nome);
  for (const filho of $(no).contents().toArray()) pedacos($, filho, dentro, saida);
}

/** Junta os pedaços, marcando o riscado sem deixar espaço dentro do `~~`. */
function montar(lista: Pedaco[]): string {
  const juntos: Pedaco[] = [];
  for (const p of lista) {
    const ultimo = juntos.at(-1);
    if (ultimo && ultimo.riscado === p.riscado) ultimo.texto += p.texto;
    else juntos.push({ ...p });
  }
  return juntos
    .map((p) => {
      const t = p.texto.replace(/[\s ]+/g, " ");
      if (!p.riscado || !t.trim()) return t;
      const antes = t.match(/^ */)![0];
      const depois = t.match(/ *$/)![0];
      return `${antes}~~${t.trim()}~~${depois}`;
    })
    .join("")
    .replace(/ {2,}/g, " ")
    .trim();
}

const semRisco = (s: string) => s.replace(/~~/g, "");

const TITULO = /^(LEI COMPLEMENTAR|LEI|DECRETO-LEI|DECRETO|EMENDA CONSTITUCIONAL|MEDIDA PROVISÓRIA|RESOLUÇÃO)\b.*\bN[º°o.]/i;

/** Nível de cabeçalho de uma divisão da lei, ou null se o parágrafo não for uma. */
// O número pode vir colado ("SeçãoI"): no HTML o numeral fica em outra tag.
const NUMERAL = String.raw`\s*(?:[IVXLCDM]+(?:-[A-Z])?|única)\b`;
const DIVISOES: [RegExp, number][] = [
  [new RegExp(`^(LIVRO|TÍTULO|ANEXO)${NUMERAL}`, "i"), 2],
  [new RegExp(`^CAPÍTULO${NUMERAL}`, "i"), 3],
  [new RegExp(`^SEÇÃO${NUMERAL}`, "i"), 4],
  [new RegExp(`^SUBSEÇÃO${NUMERAL}`, "i"), 5],
];

function nivelDeDivisao(texto: string): number | null {
  const t = semRisco(texto);
  if (t.length > 200) return null;
  return DIVISOES.find(([padrao]) => padrao.test(t))?.[1] ?? null;
}

/**
 * Nome de divisão: a linha curta logo abaixo de "CAPÍTULO I" ou "Seção II".
 * Capítulo vem em caixa-alta, seção em caixa mista; o que os distingue de um
 * dispositivo é não começar como dispositivo e não terminar em pontuação.
 */
function ehNomeDeDivisao(texto: string): boolean {
  const t = semRisco(texto).trim();
  return (
    t.length < 150 &&
    nivelDeDivisao(t) === null &&
    !/^(Art\.|§|Parágrafo|[IVXLCDM]+ ?[-–]|[a-z]\)|\(|\d)/.test(t) &&
    !/[.;:,]$/.test(t) &&
    /^[A-ZÀ-Ú]/.test(t)
  );
}

export function planaltoParaMarkdown(html: string): NormaConvertida {
  const $ = load(html);
  const blocos = $("body")
    .find("p, h1, h2, h3, h4, h5, h6")
    .toArray()
    // Parágrafo dentro de parágrafo existe nesse HTML; o de fora já leva o texto do de dentro.
    .filter((el) => $(el).parents("p").length === 0)
    .map((el) => {
      const lista: Pedaco[] = [];
      pedacos($, el, false, lista);
      return montar(lista);
    })
    .filter((t) => t && semRisco(t).trim() !== "*");

  const inicio = blocos.findIndex((t) => TITULO.test(semRisco(t)));
  if (inicio < 0) throw new Error("Não achei o título da norma no HTML do Planalto.");
  const titulo = semRisco(blocos[inicio]);

  const saida: string[] = [`# ${titulo}`];
  let artigos = 0;
  for (let i = inicio + 1; i < blocos.length; i++) {
    const t = blocos[i];
    const nivel = nivelDeDivisao(t);
    if (nivel !== null) {
      const proximo = blocos[i + 1];
      const nome = proximo && ehNomeDeDivisao(proximo) ? ` — ${proximo}` : "";
      if (nome) i++;
      saida.push(`${"#".repeat(nivel)} ${t}${nome}`);
      continue;
    }
    if (/^(~~)?Art\. ?\d/.test(t)) artigos++;
    // "#" ou "1." no começo virariam cabeçalho ou lista no Markdown.
    saida.push(t.replace(/^(#|\d+\.)/, "\\$1"));
  }

  return {
    titulo,
    markdown: saida.join("\n\n") + "\n",
    paragrafos: saida.length - 1,
    artigos,
  };
}
