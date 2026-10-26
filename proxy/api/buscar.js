/**
 * Proxy em São Paulo para fontes que só aceitam conexão do Brasil.
 *
 * O site do CONFAZ descarta conexões vindas de fora do país, e os
 * servidores do GitHub Actions ficam nos EUA. Esta função roda na região
 * gru1 da Vercel e repassa o pedido. Só busca nos hosts da lista, e só para
 * quem manda a chave: sem isso, seria um proxy aberto.
 *
 *   GET /api/buscar?url=https://www.confaz.fazenda.gov.br/...
 *   x-chave: <PROXY_CHAVE>
 */

const HOSTS = new Set(["www.confaz.fazenda.gov.br"]);

const AGENTE =
  "Mozilla/5.0 (compatible; legislacao-tributaria/0.1; +https://github.com/Matheuscfs/legislacao-tributaria)";

export async function GET(request) {
  const chave = process.env.PROXY_CHAVE;
  if (!chave || request.headers.get("x-chave") !== chave) return new Response("chave inválida\n", { status: 401 });

  let alvo;
  try {
    alvo = new URL(new URL(request.url).searchParams.get("url") ?? "");
  } catch {
    return new Response("url inválida\n", { status: 400 });
  }
  if (alvo.protocol !== "https:" || !HOSTS.has(alvo.hostname)) return new Response("host não permitido\n", { status: 403 });

  try {
    const resp = await fetch(alvo, {
      headers: { "user-agent": AGENTE, accept: "*/*" },
      signal: AbortSignal.timeout(50_000),
    });
    return new Response(resp.body, {
      status: resp.status,
      headers: { "content-type": resp.headers.get("content-type") ?? "application/octet-stream" },
    });
  } catch (e) {
    const causa = e?.cause?.code ?? e?.cause?.message ?? "";
    return new Response(`falha ao buscar ${alvo}: ${e?.message ?? e} ${causa}\n`, { status: 502 });
  }
}
