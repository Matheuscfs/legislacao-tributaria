/**
 * Convênios, protocolos e ajustes SINIEF do site do CONFAZ → Markdown.
 *
 * O CONFAZ publica cada ato numa página própria, já com as alterações, e
 * mantém a redação antiga logo abaixo da nova, precedida de uma remissão
 * ("Redação anterior dada pelo Conv. ICMS …, efeitos de … a …"). Como no
 * Planalto, a redação antiga vira `~~…~~` e a remissão fica como texto: quem
 * quiser só o vigente ignora o que está entre `~~`.
 *
 * A marcação da redação antiga mudou com o tempo. As páginas de 2010 em
 * diante usam classes (`A8-3RedacaoAnt`, `RedaoAnt`, e `…verde` nas linhas de
 * tabela); as anteriores pintam o trecho de verde com `<font color>`. Nas
 * antigas a remissão fica dentro do mesmo bloco verde, e é pelo texto que ela
 * se separa da redação riscada.
 *
 * O site é um Plone, e o sitemap dele lista cada página com a data da última
 * alteração. É por ela que a captura diária sabe o que baixar de novo.
 */

import { load, type CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";

export const SECOES = {
  convenios: "Convênios",
  protocolos: "Protocolos",
  ajustes: "Ajustes SINIEF",
} as const;

export type Secao = keyof typeof SECOES;

export type PaginaConfaz = { url: string; secao: Secao; ano: string; arquivo: string; alteradoEm: string };

export type AtoConvertido = { titulo: string; ementa: string; markdown: string; paragrafos: number; clausulas: number };

const BASE = "https://www.confaz.fazenda.gov.br/legislacao/";

/**
 * Páginas de ato no sitemap: `/legislacao/<seção>/<ano>/<página>`. Ficam de
 * fora os índices de cada ano (`conveniosicms_2018`, `2022/2022`), os PDF e
 * os modelos de formulário do SINIEF, que não são texto de ato.
 */
export function paginasDoSitemap(xml: string): PaginaConfaz[] {
  const paginas: PaginaConfaz[] = [];
  for (const m of xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]+)<\/lastmod>)?/g)) {
    const url = m[1].trim();
    if (!url.startsWith(BASE)) continue;
    const partes = url.slice(BASE.length).split("/");
    if (partes.length !== 3) continue;
    const [secao, ano, pagina] = partes;
    if (!(secao in SECOES) || !/^\d{4}(-\d{4})?$/.test(ano)) continue;
    if (/\.(pdf|docx?|xlsx?|zip)$/i.test(pagina) || /^(\d{4}|(convenios?|protocolos?|ajustes?)[-_]?(icms|sinief)?[-_]?\d{4})$/i.test(pagina)) continue;
    paginas.push({
      url,
      secao: secao as Secao,
      ano,
      // Minúsculo: no Windows e no macOS "CV001_18" e "cv001_18" seriam o mesmo arquivo.
      arquivo: `normas/confaz/${secao}/${ano}/${decodeURIComponent(pagina).toLowerCase().replace(/[^a-z0-9._-]+/g, "-")}.md`,
      alteradoEm: (m[2] ?? "").trim(),
    });
  }
  return paginas.sort((a, b) => a.url.localeCompare(b.url));
}

type Pedaco = { texto: string; riscado: boolean };

const BLOCO = new Set(["p", "div", "li", "ul", "ol", "dir", "menu", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "center", "dl", "dt", "dd", "pre", "section", "article", "tr", "hr"]);
const IGNORADO = new Set(["script", "style", "head", "img", "iframe", "noscript"]);
const VERDES = /^(#?00(80|a0|b0|66)\d{2}|green|#?339966|#?00ff00)$/i;

/** Remissão é a nota de alteração: fica legível mesmo dentro do bloco verde. */
const REMISSAO = /^(Reda[çc][ãa]o (anterior|original)|Nova reda[çc][ãa]o|Acrescid|Revogad|Renumerad|Inclu[íi]d|Alterad|Prorrogad)/i;

function marcaRedacaoAntiga(el: Element): boolean {
  const nome = el.name.toLowerCase();
  if (nome === "strike" || nome === "s" || nome === "del") return true;
  const classe = el.attribs.class ?? "";
  if (/Reda(cao|o)Ant|verde/i.test(classe)) return true;
  const cor = el.attribs.color ?? el.attribs.style?.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1] ?? "";
  return VERDES.test(cor.trim());
}

function montar(lista: Pedaco[]): string {
  const juntos: Pedaco[] = [];
  for (const p of lista) {
    const ultimo = juntos.at(-1);
    if (ultimo && ultimo.riscado === p.riscado) ultimo.texto += p.texto;
    else juntos.push({ ...p });
  }
  const sem = juntos.map((p) => p.texto).join("").replace(/[\s ]+/g, " ").trim();
  // A remissão antiga vem pintada de verde junto com a redação que ela descreve.
  if (REMISSAO.test(sem)) return sem;
  return juntos
    .map((p) => {
      const t = p.texto.replace(/[\s ]+/g, " ");
      if (!p.riscado || !t.trim()) return t;
      return `${t.match(/^ */)![0]}~~${t.trim()}~~${t.match(/ *$/)![0]}`;
    })
    .join("")
    .replace(/ {2,}/g, " ")
    .replace(/~~ ?~~/g, " ")
    .trim();
}

/** Texto de um nó como uma linha só, com o riscado marcado. */
function linha(no: AnyNode, riscado: boolean): string {
  const lista: Pedaco[] = [];
  const visitar = (n: AnyNode, r: boolean) => {
    if (n.type === "text") lista.push({ texto: (n as { data: string }).data, riscado: r });
    else if (n.type === "tag") {
      const el = n as Element;
      if (IGNORADO.has(el.name.toLowerCase())) return;
      if (el.name.toLowerCase() === "br" || BLOCO.has(el.name.toLowerCase())) lista.push({ texto: " ", riscado: r });
      for (const filho of el.children) visitar(filho, r || marcaRedacaoAntiga(el));
    }
  };
  visitar(no, riscado);
  return montar(lista);
}

const celula = (s: string) => s.replace(/\|/g, "\\|");

/**
 * Uma tabela vira tabela do Markdown: uma linha do HTML, uma linha do
 * arquivo, e o diff aponta o item que mudou. A primeira linha faz de
 * cabeçalho, porque o GitHub só desenha a tabela se houver um.
 */
function tabela($: CheerioAPI, el: Element, riscado: boolean): string[] {
  const linhas = $(el)
    .find("tr")
    .toArray()
    .filter((tr) => $(tr).closest("table")[0] === el)
    .map((tr) =>
      $(tr)
        .children("td, th")
        .toArray()
        .map((td) => celula(linha(td, riscado || marcaRedacaoAntiga(tr as Element))))
    )
    .filter((l) => l.some((c) => c));
  if (linhas.length === 0) return [];
  const colunas = Math.max(...linhas.map((l) => l.length));
  const fmt = (l: string[]) => `| ${[...l, ...Array(colunas - l.length).fill("")].join(" | ")} |`;
  return [fmt(linhas[0]), `|${" --- |".repeat(colunas)}`, ...linhas.slice(1).map(fmt)];
}

export function confazParaMarkdown(html: string, url: string): AtoConvertido | null {
  const $ = load(html);
  const corpo = $("#parent-fieldname-text").first();
  // Sem o campo de texto, a página é um índice ou um aviso de "página não existe".
  if (corpo.length === 0) return null;
  const titulo = $("h1.documentFirstHeading").first().text().replace(/\s+/g, " ").trim();
  const ementa = $(".documentDescription").first().text().replace(/\s+/g, " ").trim();

  const blocos: string[] = [];
  let atual: Pedaco[] = [];
  const fechar = () => {
    const t = montar(atual);
    atual = [];
    if (t && t.replace(/~~/g, "").trim()) blocos.push(t);
  };
  const visitar = (n: AnyNode, riscado: boolean) => {
    if (n.type === "text") {
      atual.push({ texto: (n as { data: string }).data, riscado });
      return;
    }
    if (n.type !== "tag") return;
    const el = n as Element;
    const nome = el.name.toLowerCase();
    if (IGNORADO.has(nome)) return;
    const r = riscado || marcaRedacaoAntiga(el);
    if (nome === "br") {
      atual.push({ texto: " ", riscado: r });
      return;
    }
    if (nome === "table") {
      fechar();
      const t = tabela($, el, r);
      if (t.length) blocos.push(t.join("\n"));
      return;
    }
    const bloco = BLOCO.has(nome);
    if (bloco) fechar();
    for (const filho of el.children) visitar(filho, r);
    if (bloco) fechar();
  };
  for (const filho of corpo[0].children) visitar(filho, false);
  fechar();
  if (blocos.length === 0) return null;

  const saida = [`# ${titulo || blocos[0].replace(/~~/g, "")}`];
  if (ementa) saida.push(`> ${ementa}`);
  saida.push(`Fonte: <${url}>`);
  let clausulas = 0;
  for (const b of blocos) {
    if (/^(~~)?Cl[áa]usula \S+/i.test(b)) clausulas++;
    saida.push(b.startsWith("|") ? b : b.replace(/^(#|>|[-+*] |\d+\.)/, "\\$1"));
  }
  return { titulo, ementa, markdown: saida.join("\n\n") + "\n", paragrafos: blocos.length, clausulas };
}
