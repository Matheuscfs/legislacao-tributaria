/**
 * Captura tudo das fontes oficiais e grava só o que mudou.
 *
 *   npm run capturar
 *
 * Roda todo dia no GitHub Actions. Quando algo muda, o workflow faz o
 * commit com o resumo que este script escreve em `.cache/resumo.txt`; quando
 * nada muda, nenhum arquivo é tocado e não há commit.
 *
 * Uma fonte fora do ar não derruba as outras: o erro é registrado e a
 * captura segue. O processo termina com erro só se todas falharem.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { descrever, diferencaDeTabela, diferencaDeTexto } from "../src/diferenca.ts";
import { baixar, sha256 } from "../src/fonte.ts";
import { gravarSeMudou, json, lerSeExiste } from "../src/gravar.ts";
import { ibsCbsParaArquivos } from "../src/ibs-cbs.ts";
import { ncmParaCsv } from "../src/ncm.ts";
import { planaltoParaMarkdown } from "../src/planalto.ts";

type Norma = {
  id: string;
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
};

const agora = () => new Date().toISOString().slice(0, 19) + "Z";
const resumo: string[] = [];
const falhas: string[] = [];

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
  const nome = `${n.tipo === "Lei Complementar" ? "LC" : n.tipo} ${n.numero}/${n.data.slice(0, 4)}`;
  resumo.push(antes ? `${nome}: +${d.entraram} −${d.sairam} parágrafos` : `${nome}: primeira captura (${r.artigos} artigos)`);
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
  const normas = JSON.parse(readFileSync("normas.json", "utf8")) as Norma[];
  // Uma fonte por vez: são sites públicos, e ninguém precisa da captura em segundos.
  for (const n of normas) await tentar(n.id, () => capturarNorma(n));
  await tentar("ncm", capturarNcm);
  await tentar("ibs-cbs", capturarIbsCbs);

  mkdirSync(".cache", { recursive: true });
  const titulo = resumo.length ? `captura: ${resumo.join("; ")}` : "";
  writeFileSync(join(".cache", "resumo.txt"), titulo + (falhas.length ? `\n\nFalhas:\n${falhas.join("\n")}` : ""));
  console.log(titulo || "Nada mudou.");

  const total = normas.length + 2;
  if (falhas.length === total) process.exit(1);
}

await main();
