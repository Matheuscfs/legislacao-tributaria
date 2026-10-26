/**
 * Captura tudo das fontes oficiais e grava só o que mudou.
 *
 *   npm run capturar
 *   npm run capturar -- lc-116-2003 lei-8212-1991   só estas normas, sem tabelas
 *
 * Roda todo dia no GitHub Actions. Quando algo muda, o workflow faz o
 * commit com o resumo que este script escreve em `.cache/resumo.txt`; quando
 * nada muda, nenhum arquivo é tocado e não há commit. Lei complementar
 * tributária nova, que ainda não está no catálogo, vai para
 * `.cache/novas-normas.json`, e o workflow abre uma issue para cada uma.
 *
 * Uma fonte fora do ar não derruba as outras: o erro é registrado e a
 * captura segue. O processo termina com erro só se todas falharem.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { cestParaCsv } from "../src/cest.ts";
import { confazParaMarkdown, paginasDoSitemap, SECOES, type PaginaConfaz, type Secao } from "../src/confaz.ts";
import { lerQuadroLcp, quadroParaCsv, type LeiComplementar } from "../src/descoberta.ts";
import { descrever, diferencaDeTabela, diferencaDeTexto } from "../src/diferenca.ts";
import { baixar, sha256 } from "../src/fonte.ts";
import { csv, gravarSeMudou, json, lerCsv, lerSeExiste } from "../src/gravar.ts";
import { ibsCbsParaArquivos } from "../src/ibs-cbs.ts";
import { ncmParaCsv } from "../src/ncm.ts";
import { planaltoParaMarkdown } from "../src/planalto.ts";
import { tipiParaCsv } from "../src/tipi.ts";

type Norma = {
  id: string;
  nome: string;
  esfera: string;
  tipo: string;
  numero: string;
  data: string;
  assunto: string;
  url: string;
  urn: string;
};

const FONTES = {
  ncm: "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO",
  ibsCbs: "https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributaria",
  tipi: "https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/documentos-e-arquivos/tipi.xlsx",
  cest: "https://www.confaz.fazenda.gov.br/legislacao/convenios/2018/CV142_18",
  sitemapConfaz: "https://www.confaz.fazenda.gov.br/sitemap.xml.gz",
  quadroLcp: "https://www.planalto.gov.br/ccivil_03/leis/lcp/quadro_lcp.htm",
};

const agora = () => new Date().toISOString().slice(0, 19) + "Z";
const resumo: string[] = [];
const falhas: string[] = [];
const novasNormas: LeiComplementar[] = [];
const normas = JSON.parse(readFileSync("normas.json", "utf8")) as Norma[];

async function capturarNorma(n: Norma) {
  const fonte = await baixar(n.url);
  const r = planaltoParaMarkdown(fonte.texto);
  const pasta = join("normas", n.esfera, n.id);
  const caminho = join(pasta, "texto.md");
  const antes = lerSeExiste(caminho);
  if (!gravarSeMudou(caminho, r.markdown)) return;

  gravarSeMudou(
    join(pasta, "metadados.json"),
    json({
      ...n,
      titulo: r.titulo,
      paragrafos: r.paragrafos,
      artigos: r.artigos,
      sha256Texto: sha256(r.markdown),
      capturadoEm: agora(),
    })
  );
  const d = diferencaDeTexto(antes, r.markdown);
  resumo.push(antes ? `${n.nome}: +${d.entraram} −${d.sairam} parágrafos` : `${n.nome}: primeira captura (${r.artigos} artigos)`);
}

async function capturarNcm() {
  const fonte = await baixar(FONTES.ncm);
  const t = ncmParaCsv(fonte.texto);
  const caminho = join("tabelas", "ncm", "ncm.csv");
  const antes = lerSeExiste(caminho);
  if (!gravarSeMudou(caminho, t.csv)) return;
  gravarSeMudou(
    join("tabelas", "ncm", "metadados.json"),
    json({ fonte: FONTES.ncm, ato: t.ato, itens: t.itens, codigosDe8Digitos: t.folhas, capturadoEm: agora() })
  );
  resumo.push(antes ? `NCM (${t.ato}): ${descrever(diferencaDeTabela(antes, t.csv), "código")}` : `NCM: primeira captura (${t.itens} códigos, ${t.ato})`);
}

async function capturarIbsCbs() {
  const fonte = await baixar(FONTES.ibsCbs);
  const t = ibsCbsParaArquivos(fonte.texto);
  const pasta = join("tabelas", "ibs-cbs");
  const antesClasses = lerSeExiste(join(pasta, "classificacao-tributaria.csv"));
  const mudou = [
    gravarSeMudou(join(pasta, "cst.csv"), t.cst),
    gravarSeMudou(join(pasta, "classificacao-tributaria.csv"), t.classificacoes),
    gravarSeMudou(join(pasta, "classificacao-por-ncm-nbs.csv"), t.porNcmNbs),
    gravarSeMudou(join(pasta, "classificacao-tributaria.json"), t.json),
  ].some(Boolean);
  if (!mudou) return;
  gravarSeMudou(join(pasta, "metadados.json"), json({ fonte: FONTES.ibsCbs, ...t.totais, capturadoEm: agora() }));
  resumo.push(
    antesClasses
      ? `IBS/CBS: ${descrever(diferencaDeTabela(antesClasses, t.classificacoes), "cClassTrib")}`
      : `IBS/CBS: primeira captura (${t.totais.classificacoes} cClassTrib, ${t.totais.codigosNcmNbs} vínculos NCM/NBS)`
  );
}

async function capturarTipi() {
  const fonte = await baixar(FONTES.tipi);
  const t = await tipiParaCsv(fonte.bytes);
  const caminho = join("tabelas", "tipi", "tipi.csv");
  const antes = lerSeExiste(caminho);
  if (!gravarSeMudou(caminho, t.csv)) return;
  gravarSeMudou(
    join("tabelas", "tipi", "metadados.json"),
    json({ fonte: FONTES.tipi, ultimaAtualizacao: t.ultimaAtualizacao, linhas: t.linhas, capturadoEm: agora() })
  );
  // NCM + exceção identificam a linha: a mesma NCM pode ter "Ex 01" com outra alíquota.
  resumo.push(antes ? `TIPI: ${descrever(diferencaDeTabela(antes, t.csv, 2), "linha")}` : `TIPI: primeira captura (${t.linhas} linhas)`);
}

async function capturarCest() {
  const fonte = await baixar(FONTES.cest);
  const t = cestParaCsv(fonte.texto);
  const pasta = join("tabelas", "cest");
  const antes = lerSeExiste(join(pasta, "cest.csv"));
  const mudou = [gravarSeMudou(join(pasta, "cest.csv"), t.cest), gravarSeMudou(join(pasta, "segmentos.csv"), t.segmentos)].some(Boolean);
  if (!mudou) return;
  gravarSeMudou(join(pasta, "metadados.json"), json({ fonte: FONTES.cest, ...t.totais, capturadoEm: agora() }));
  resumo.push(antes ? `CEST: ${descrever(diferencaDeTabela(antes, t.cest, 2), "linha")}` : `CEST: primeira captura (${t.totais.codigos} códigos)`);
}

/**
 * Convênios, protocolos e ajustes SINIEF: um arquivo por ato, mais um índice.
 *
 * São mais de 11 mil páginas, e baixar todas todo dia seria abuso com o site.
 * O sitemap traz a data da última alteração de cada página; o índice guarda a
 * data da versão capturada, e só é baixado de novo o que mudou desde então.
 * As páginas do sitemap que não são ato (índices, avisos) ficam em
 * `fora.csv`, para não serem baixadas de novo a cada dia.
 */
async function capturarConfaz() {
  const fonte = await baixar(FONTES.sitemapConfaz);
  const xml = (fonte.bytes[0] === 0x1f && fonte.bytes[1] === 0x8b ? gunzipSync(fonte.bytes) : Buffer.from(fonte.bytes)).toString("utf8");
  const paginas = paginasDoSitemap(xml);

  const pasta = join("normas", "confaz");
  type Registro = PaginaConfaz & { titulo: string; ementa: string };
  const indice = new Map<string, Registro>(
    lerCsv(lerSeExiste(join(pasta, "indice.csv"))).map((r) => [
      r.url,
      { url: r.url, secao: r.secao as Secao, ano: r.ano, arquivo: r.arquivo, alteradoEm: r.alterado_em, titulo: r.titulo, ementa: r.ementa },
    ])
  );
  const fora = new Map(lerCsv(lerSeExiste(join(pasta, "fora.csv"))).map((r) => [r.url, r.alterado_em]));

  // Um sitemap pela metade apagaria metade do acervo na comparação abaixo.
  if (paginas.length < 0.9 * (indice.size + fora.size)) {
    throw new Error(`sitemap do CONFAZ com ${paginas.length} páginas, contra ${indice.size + fora.size} conhecidas: incompleto?`);
  }

  const pendentes = paginas.filter((p) => (indice.get(p.url)?.alteradoEm ?? fora.get(p.url)) !== p.alteradoEm);
  const limite = Number(process.env.CONFAZ_LIMITE ?? Infinity);
  const fila = pendentes.slice(0, limite);
  const novos: string[] = [];
  const alterados: string[] = [];
  const erros: string[] = [];
  let feitos = 0;

  // Quatro por vez: a carga inicial leva minutos em vez de horas, e o site aguenta.
  const trabalhar = async () => {
    for (let p = fila.shift(); p; p = fila.shift()) {
      try {
        // Página que não vem em 30 s está presa; fica para a próxima captura.
        const pagina = await baixar(p.url, 2, 30_000);
        const ato = confazParaMarkdown(pagina.texto, p.url);
        if (!ato) {
          fora.set(p.url, p.alteradoEm);
          indice.delete(p.url);
        } else {
          const antes = lerSeExiste(p.arquivo);
          if (gravarSeMudou(p.arquivo, ato.markdown)) (antes ? alterados : novos).push(ato.titulo);
          indice.set(p.url, { ...p, titulo: ato.titulo, ementa: ato.ementa });
          fora.delete(p.url);
        }
      } catch (e) {
        // Fica com a data antiga no índice, e a próxima captura tenta de novo.
        erros.push(`${p.url}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (++feitos % 250 === 0) {
        // A carga inicial leva quase uma hora; se cair no meio, o que já veio fica.
        gravarIndices();
        console.log(`       confaz: ${feitos}/${Math.min(pendentes.length, limite)}`);
      }
    }
  };
  const gravarIndices = () => {
    const registros = [...indice.values()].sort((a, b) => a.arquivo.localeCompare(b.arquivo));
    const mudouIndice = gravarSeMudou(
      join(pasta, "indice.csv"),
      csv(
        ["secao", "ano", "titulo", "ementa", "arquivo", "url", "alterado_em"],
        registros.map((r) => [r.secao, r.ano, r.titulo, r.ementa, r.arquivo, r.url, r.alteradoEm])
      )
    );
    const mudouFora = gravarSeMudou(
      join(pasta, "fora.csv"),
      csv(["url", "alterado_em"], [...fora].sort(([a], [b]) => a.localeCompare(b)))
    );
    return { registros, mudou: mudouIndice || mudouFora };
  };
  await Promise.all(Array.from({ length: 4 }, trabalhar));

  const noSitemap = new Set(paginas.map((p) => p.url));
  const removidos: string[] = [];
  for (const [url, r] of indice) {
    if (noSitemap.has(url)) continue;
    rmSync(r.arquivo, { force: true });
    indice.delete(url);
    removidos.push(r.titulo);
  }
  for (const url of fora.keys()) if (!noSitemap.has(url)) fora.delete(url);

  const { registros, mudou } = gravarIndices();
  if (mudou || removidos.length || novos.length || alterados.length) {
    const porSecao = Object.fromEntries(Object.keys(SECOES).map((s) => [s, registros.filter((r) => r.secao === s).length]));
    gravarSeMudou(join(pasta, "metadados.json"), json({ fonte: FONTES.sitemapConfaz, atos: registros.length, ...porSecao, capturadoEm: agora() }));
  }

  const nomes = (lista: string[]) => (lista.length <= 3 ? `: ${lista.join(", ")}` : "");
  const partes = [
    novos.length && `${novos.length} ato(s) novo(s)${nomes(novos)}`,
    alterados.length && `${alterados.length} alterado(s)${nomes(alterados)}`,
    removidos.length && `${removidos.length} removido(s)`,
  ].filter(Boolean);
  if (partes.length) resumo.push(`CONFAZ: ${partes.join(", ")}`);
  if (pendentes.length > feitos) console.log(`       confaz: ${pendentes.length - feitos} página(s) ficaram para a próxima captura`);
  if (erros.length) {
    falhas.push(`confaz: ${erros.length} página(s) não baixaram (a primeira: ${erros[0]})`);
    console.error(`       confaz: ${erros.length} página(s) não baixaram`);
  }
}

async function descobrirLeisComplementares() {
  const fonte = await baixar(FONTES.quadroLcp);
  const leis = lerQuadroLcp(fonte.texto);
  const caminho = join("novidades", "leis-complementares.csv");
  const antes = lerSeExiste(caminho);
  const noCatalogo = new Set(normas.map((n) => n.url.toLowerCase()));
  if (!gravarSeMudou(caminho, quadroParaCsv(leis, noCatalogo))) return;
  if (!antes) {
    resumo.push(`Leis complementares: primeira leitura do quadro (${leis.length} leis)`);
    return;
  }
  // Novidade é número que não estava no quadro da captura anterior.
  const conhecidas = new Set(antes.split("\n").slice(1).map((l) => l.split(",")[0]));
  const novas = leis.filter((l) => !conhecidas.has(String(l.numero)));
  for (const l of novas) {
    resumo.push(`nova LC ${l.numero}/${l.data.slice(0, 4)}${l.tributaria ? " (tributária)" : ""}`);
    if (l.tributaria && !noCatalogo.has(l.url.toLowerCase())) novasNormas.push(l);
  }
  if (novas.length === 0) resumo.push("Quadro de leis complementares atualizado");
}

async function tentar(nome: string, passo: () => Promise<void>) {
  try {
    await passo();
    console.log(`ok     ${nome}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    falhas.push(`${nome}: ${msg}`);
    console.error(`FALHOU ${nome}: ${msg}`);
  }
}

async function main() {
  const todos: [string, () => Promise<void>][] = [
    ...normas.map((n): [string, () => Promise<void>] => [n.id, () => capturarNorma(n)]),
    ["ncm", capturarNcm],
    ["ibs-cbs", capturarIbsCbs],
    ["tipi", capturarTipi],
    ["cest", capturarCest],
    ["confaz", capturarConfaz],
    ["quadro-lcp", descobrirLeisComplementares],
  ];
  // Com nomes na linha de comando (`npm run capturar -- lc-116-2003 confaz`),
  // só esses passos: é como uma norma nova entra no catálogo, ou uma fonte é
  // recapturada, sem baixar todo o resto de novo.
  const pedidas = process.argv.slice(2);
  const desconhecidas = pedidas.filter((nome) => !todos.some(([n]) => n === nome));
  if (desconhecidas.length) throw new Error(`Passo desconhecido (nem norma do normas.json, nem fonte): ${desconhecidas.join(", ")}`);
  const passos = pedidas.length ? todos.filter(([nome]) => pedidas.includes(nome)) : todos;
  // Uma fonte por vez: são sites públicos, e ninguém precisa da captura em segundos.
  for (const [nome, passo] of passos) await tentar(nome, passo);

  mkdirSync(".cache", { recursive: true });
  const titulo = resumo.length ? `captura: ${resumo.join("; ")}` : "";
  writeFileSync(join(".cache", "resumo.txt"), titulo + (falhas.length ? `\n\nFalhas:\n${falhas.join("\n")}` : ""));
  writeFileSync(join(".cache", "novas-normas.json"), json(novasNormas));
  console.log(titulo || "Nada mudou.");

  if (falhas.length === passos.length) process.exit(1);
}

await main();
