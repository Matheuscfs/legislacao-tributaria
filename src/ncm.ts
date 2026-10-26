/**
 * Tabela NCM vigente, do JSON público do Portal Único Siscomex.
 *
 * O JSON traz a nomenclatura inteira (capítulo, posição, subposição e item)
 * com a vigência e o ato legal de cada código. Vira CSV ordenado por código:
 * um código por linha, para o diff mostrar exatamente o que entrou, saiu ou
 * mudou de descrição quando a Gecex publica uma resolução.
 */

import { csv } from "./gravar.ts";

type ItemNcm = {
  Codigo: string;
  Descricao: string;
  Data_Inicio: string;
  Data_Fim: string;
  Tipo_Ato_Ini: string;
  Numero_Ato_Ini: string;
  Ano_Ato_Ini: string;
};

export type TabelaNcm = {
  /** Ato que fixou a versão vigente, ex.: "Resolução Gecex nº 926/2026". */
  ato: string;
  csv: string;
  itens: number;
  /** Só os códigos de 8 dígitos, os que vão na nota fiscal. */
  folhas: number;
};

/** "01/04/2022" → "2022-04-01"; o 31/12/9999 que o Siscomex usa para "sem fim" vira vazio. */
export function dataIso(ddmmaaaa: string): string {
  const m = ddmmaaaa.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m || m[3] === "9999") return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function ncmParaCsv(json: string): TabelaNcm {
  const dados = JSON.parse(json) as { Ato: string; Nomenclaturas: ItemNcm[] };
  const linhas = dados.Nomenclaturas.map((n) => [
    n.Codigo,
    n.Descricao.trim(),
    dataIso(n.Data_Inicio),
    dataIso(n.Data_Fim),
    `${n.Tipo_Ato_Ini} ${n.Numero_Ato_Ini}/${n.Ano_Ato_Ini}`.trim(),
  ]);
  // Ordem pelo código sem pontos: "0101.2" fica entre "01.01" e "0101.21.00".
  const chave = (codigo: string) => codigo.replace(/\D/g, "");
  linhas.sort((a, b) => chave(a[0]).localeCompare(chave(b[0])) || a[0].localeCompare(b[0]));
  return {
    ato: dados.Ato,
    csv: csv(["codigo", "descricao", "inicio_vigencia", "fim_vigencia", "ato_inicial"], linhas),
    itens: linhas.length,
    folhas: linhas.filter((l) => chave(l[0]).length === 8).length,
  };
}
