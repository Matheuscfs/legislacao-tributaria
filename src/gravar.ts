/**
 * Gravação que só acontece quando o conteúdo muda.
 *
 * O repositório inteiro depende disto: a captura roda todo dia, e um commit
 * só deve existir quando a lei ou a tabela mudou de fato. Por isso nenhum
 * arquivo de dado carrega a data da captura no corpo — ela fica nos
 * metadados, que só são regravados junto com uma mudança real.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function lerSeExiste(caminho: string): string | null {
  try {
    return readFileSync(caminho, "utf8");
  } catch {
    return null;
  }
}

/** Grava e devolve true se o conteúdo mudou; não toca no arquivo se for igual. */
export function gravarSeMudou(caminho: string, conteudo: string): boolean {
  if (lerSeExiste(caminho) === conteudo) return false;
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
  return true;
}

export function json(valor: unknown): string {
  return JSON.stringify(valor, null, 2) + "\n";
}

/**
 * CSV no padrão RFC 4180: aspas só quando precisa, aspas internas dobradas.
 *
 * Quebra de linha dentro de um campo vira espaço. Há nomes na tabela do
 * IBS/CBS com `\r\n` no meio; o Git normaliza para LF no commit, e o arquivo
 * gerado na captura seguinte pareceria sempre diferente do versionado — um
 * commit por dia sem a tabela ter mudado.
 */
export function csv(cabecalho: string[], linhas: (string | number | boolean | null)[][]): string {
  const campo = (v: string | number | boolean | null) => {
    const s = v === null ? "" : String(v).replace(/\s*[\r\n]+\s*/g, " ");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cabecalho, ...linhas].map((l) => l.map(campo).join(",")).join("\n") + "\n";
}

/** Lê de volta um CSV gerado por `csv()`: uma linha por registro, aspas dobradas. */
export function lerCsv(texto: string | null): Record<string, string>[] {
  const campos = (l: string) => {
    const saida: string[] = [];
    let i = 0;
    while (i <= l.length) {
      if (l[i] === '"') {
        let valor = "";
        for (i++; i < l.length; i++) {
          if (l[i] === '"' && l[i + 1] === '"') valor += l[i++];
          else if (l[i] === '"') break;
          else valor += l[i];
        }
        saida.push(valor);
        i += 2; // aspas de fechamento e vírgula
      } else {
        const fim = l.indexOf(",", i);
        saida.push(l.slice(i, fim < 0 ? l.length : fim));
        i = fim < 0 ? l.length + 1 : fim + 1;
      }
    }
    return saida;
  };
  const [cabecalho, ...resto] = (texto ?? "").split("\n").filter(Boolean).map(campos);
  return resto.map((l) => Object.fromEntries((cabecalho ?? []).map((c, i) => [c, l[i] ?? ""])));
}
