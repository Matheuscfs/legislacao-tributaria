/**
 * Resumo do que mudou, para a mensagem de commit.
 *
 * O diff do Git já mostra tudo; o resumo é o que cabe numa linha de log:
 * quantos parágrafos da lei mudaram, quantos códigos entraram ou saíram.
 */

/** Parágrafos que entraram e saíram, comparando o Markdown linha a linha. */
export function diferencaDeTexto(antes: string | null, depois: string) {
  const a = new Set((antes ?? "").split("\n").filter(Boolean));
  const d = new Set(depois.split("\n").filter(Boolean));
  return {
    entraram: [...d].filter((l) => !a.has(l)).length,
    sairam: [...a].filter((l) => !d.has(l)).length,
  };
}

/**
 * Linhas de CSV indexadas pelas primeiras colunas: o código, ou código +
 * NCM quando o mesmo código se repete (CEST, TIPI com exceção). As colunas
 * de chave nunca têm vírgula, então dividir a linha por vírgula basta.
 */
function porCodigo(texto: string | null, colunasDeChave: number): Map<string, string> {
  const linhas = (texto ?? "").split("\n").slice(1).filter(Boolean);
  return new Map(linhas.map((l) => [l.split(",").slice(0, colunasDeChave).join(","), l]));
}

export function diferencaDeTabela(antes: string | null, depois: string, colunasDeChave = 1) {
  const a = porCodigo(antes, colunasDeChave);
  const d = porCodigo(depois, colunasDeChave);
  let novos = 0;
  let alterados = 0;
  for (const [codigo, linha] of d) {
    if (!a.has(codigo)) novos++;
    else if (a.get(codigo) !== linha) alterados++;
  }
  const removidos = [...a.keys()].filter((c) => !d.has(c)).length;
  return { novos, alterados, removidos };
}

export function descrever(partes: { novos: number; alterados: number; removidos: number }, unidade: string): string {
  const itens = [
    partes.novos && `${partes.novos} ${unidade} novo(s)`,
    partes.alterados && `${partes.alterados} alterado(s)`,
    partes.removidos && `${partes.removidos} removido(s)`,
  ].filter(Boolean);
  return itens.length ? itens.join(", ") : "reordenação ou formato";
}
