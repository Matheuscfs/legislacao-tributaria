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

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cestParaCsv } from "../src/cest.ts";
import { lerQuadroLcp, quadroParaCsv, type LeiComplementar } from "../src/descoberta.ts";
import { descrever, diferencaDeTabela, diferencaDeTexto } from "../src/diferenca.ts";
import { baixar, sha256 } from "../src/fonte.ts";
import { gravarSeMudou, json, lerSeExiste } from "../src/gravar.ts";
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
  // Com ids na linha de comando, só essas normas: é como uma norma nova entra
  // no catálogo sem baixar as tabelas e as outras normas de novo.
  const pedidas = process.argv.slice(2);
  const desconhecidas = pedidas.filter((id) => !normas.some((n) => n.id === id));
  if (desconhecidas.length) throw new Error(`Norma fora do normas.json: ${desconhecidas.join(", ")}`);
  const passos: [string, () => Promise<void>][] = pedidas.length
    ? normas.filter((n) => pedidas.includes(n.id)).map((n) => [n.id, () => capturarNorma(n)])
    : [
        ...normas.map((n): [string, () => Promise<void>] => [n.id, () => capturarNorma(n)]),
        ["ncm", capturarNcm],
        ["ibs-cbs", capturarIbsCbs],
        ["tipi", capturarTipi],
        ["cest", capturarCest],
        ["quadro-lcp", descobrirLeisComplementares],
      ];
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
