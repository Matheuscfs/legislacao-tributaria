/**
 * Download das fontes oficiais.
 *
 * Os sites do governo não são uniformes: o Planalto serve ISO-8859-1, o
 * Siscomex manda JSON com BOM, a SVRS responde 403 para quem chega sem
 * cabeçalho de navegador. Esta camada resolve isso uma vez, e o resto do
 * código só recebe texto já decodificado.
 */

import { createHash } from "node:crypto";

const AGENTE =
  "Mozilla/5.0 (compatible; legislacao-tributaria/0.1; +https://github.com/Matheuscfs/legislacao-tributaria)";

export type Baixado = { texto: string; bytes: Uint8Array; sha256: string };

export function sha256(conteudo: string | Uint8Array): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

/**
 * Decodifica pelo charset do `Content-Type` ou da meta tag. Sem nenhum dos
 * dois — a página da LC 214 não declara —, tenta UTF-8 estrito e, se não
 * for, cai para Windows-1252, que é o que os HTML antigos do governo usam.
 */
export function decodificar(contentType: string | null, bytes: Uint8Array): string {
  const declarado =
    contentType?.match(/charset=([\w-]+)/i)?.[1] ??
    new TextDecoder("latin1").decode(bytes.slice(0, 32_768)).match(/charset=["']?([\w-]+)/i)?.[1];
  let texto: string;
  if (declarado) {
    const nome = declarado.toLowerCase();
    // ISO-8859-1 declarado quase sempre é Windows-1252 na prática (aspas curvas, travessão).
    texto = new TextDecoder(nome === "iso-8859-1" ? "windows-1252" : nome).decode(bytes);
  } else {
    try {
      texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      texto = new TextDecoder("windows-1252").decode(bytes);
    }
  }
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

/**
 * Hosts que só aceitam conexão do Brasil. O CONFAZ descarta quem chega de
 * fora (tempo de conexão esgotado), e o GitHub Actions roda nos EUA. Com
 * `PROXY_BRASIL_URL` definido, o pedido passa pelo proxy em São Paulo
 * (`proxy/`); sem ele — rodando do Brasil —, vai direto.
 */
const SO_DO_BRASIL = new Set(["www.confaz.fazenda.gov.br"]);

export function pedido(url: string): [string, Record<string, string>] {
  const cabecalhos = { "user-agent": AGENTE, accept: "*/*" };
  const proxy = process.env.PROXY_BRASIL_URL;
  if (!proxy || !SO_DO_BRASIL.has(new URL(url).hostname)) return [url, cabecalhos];
  return [`${proxy}?url=${encodeURIComponent(url)}`, { ...cabecalhos, "x-chave": process.env.PROXY_BRASIL_CHAVE ?? "" }];
}

async function umaVez(endereco: string, headers: Record<string, string>, url: string, tempoLimite: number): Promise<Baixado> {
  const controle = new AbortController();
  let relogio: NodeJS.Timeout | undefined;
  // O abort sozinho não bastou: na carga do CONFAZ, conexões ficaram paradas
  // minutos depois do prazo. A corrida garante que a captura siga adiante.
  const prazo = new Promise<never>((_, rejeitar) => {
    relogio = setTimeout(() => {
      const erro = new Error(`tempo esgotado (${tempoLimite / 1000} s) em ${url}`);
      controle.abort(erro);
      rejeitar(erro);
    }, tempoLimite);
  });
  const busca = (async () => {
    const resp = await fetch(endereco, { headers, signal: controle.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} em ${url}`);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    return { texto: decodificar(resp.headers.get("content-type"), bytes), bytes, sha256: sha256(bytes) };
  })();
  try {
    return await Promise.race([busca, prazo]);
  } finally {
    clearTimeout(relogio);
    busca.catch(() => {});
  }
}

export async function baixar(url: string, tentativas = 3, tempoLimite = 90_000): Promise<Baixado> {
  const [endereco, headers] = pedido(url);
  for (let i = 1; ; i++) {
    try {
      return await umaVez(endereco, headers, url, tempoLimite);
    } catch (e) {
      if (i >= tentativas) {
        // "fetch failed" sozinho não diz nada; a causa (timeout, conexão
        // recusada, certificado) é o que separa site fora do ar de bloqueio.
        const causa = e instanceof Error && e.cause instanceof Error ? ` (${(e.cause as { code?: string }).code ?? ""} ${e.cause.message})` : "";
        throw new Error(`${e instanceof Error ? e.message : String(e)}${causa}`);
      }
      // Fonte pública fora do ar por alguns segundos é comum; insistir sem pausa não ajuda.
      await new Promise((r) => setTimeout(r, 5_000 * i));
    }
  }
}
