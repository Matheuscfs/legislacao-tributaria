/**
 * Classificação tributária do IBS e da CBS (cClassTrib), do portal
 * Conformidade Fácil da SVRS — quem mantém as tabelas da NF-e.
 *
 * A API do portal recusa acesso direto, mas a página pública carrega a tabela
 * inteira num `var dadosOriginais = [...]`. É dali que ela sai, em três
 * vistas: os CSTs, as classificações (com percentuais de redução e em que
 * documento cada uma vale) e a lista de NCM/NBS a que cada classificação se
 * aplica — a resposta oficial para "este produto tem redução, e com que código?".
 */

import { csv, json } from "./gravar.ts";

type Anexo = {
  NroAnexo: number | null;
  CodNcmNbs: string;
  TipoCodigo: string;
  DescCondicao: string | null;
  DescExcecao: string | null;
  Observacao: string | null;
  NroItemAnexoLei: string | number | null;
  DescItemAnexo: string | null;
  DescAnexo: string | null;
  DthIniVig: string | null;
  DthFimVig: string | null;
};

type Classificacao = Record<string, unknown> & {
  CodClassTrib: string;
  NomeClassTrib: string;
  NomeReduzido: string | null;
  Cst: string;
  PercRedIbs: number;
  PercRedCbs: number;
  TipoAliq: string | null;
  NroAnexo: number | null;
  TexUrlLegislacao: string | null;
  DthPublicacao: string | null;
  DthIniVig: string | null;
  DthFimVig: string | null;
  Anexos: string | Anexo[] | null;
};

type Cst = Record<string, unknown> & {
  Cst: string;
  NomeCst: string;
  DthIniVig: string | null;
  DthFimVig: string | null;
  ClassificacoesTributarias: Classificacao[];
};

/** Documentos fiscais em que a classificação pode ser usada, pelos `Ind*` do portal. */
const DOCUMENTOS: [string, string][] = [
  ["IndNfe", "NF-e"],
  ["IndNfce", "NFC-e"],
  ["IndCte", "CT-e"],
  ["IndCteos", "CT-e OS"],
  ["IndBpe", "BP-e"],
  ["IndBpetm", "BP-e TM"],
  ["IndBpeta", "BP-e TA"],
  ["IndNf3e", "NF3e"],
  ["IndNfcom", "NFCom"],
  ["IndNfse", "NFS-e"],
  ["IndNfag", "NFAg"],
  ["IndNfgas", "NFGas"],
  ["IndNfsvia", "NFS-e Via"],
  ["IndNfabi", "NFABI"],
  ["IndDere", "DERE"],
  ["IndDuimp", "DUIMP"],
];

/**
 * Campos que o portal muda sem que a tabela mude: carimbo de inclusão no
 * banco dele e objetos de navegação. Deixá-los no arquivo geraria commit
 * sem mudança de regra.
 */
const RUIDO = new Set(["CtrDthInc", "CstNavigation", "AnexoNew", "PossuiIndDfe"]);

const dia = (d: string | null) => (d ? d.slice(0, 10) : "");

/** Recorta o array `dadosOriginais` da página, contando colchetes até fechar. */
export function extrairDadosOriginais(html: string): Cst[] {
  const marca = "var dadosOriginais = ";
  const inicio = html.indexOf(marca);
  if (inicio < 0) throw new Error("A página da SVRS não tem mais `dadosOriginais`: o formato mudou.");
  let i = inicio + marca.length;
  let profundidade = 0;
  let dentroDeTexto = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (dentroDeTexto) {
      if (c === "\\") j++;
      else if (c === '"') dentroDeTexto = false;
    } else if (c === '"') dentroDeTexto = true;
    else if (c === "[") profundidade++;
    else if (c === "]" && --profundidade === 0) return JSON.parse(html.slice(i, j + 1)) as Cst[];
  }
  throw new Error("`dadosOriginais` não fecha: página truncada?");
}

function anexosDe(c: Classificacao): Anexo[] {
  if (!c.Anexos) return [];
  return typeof c.Anexos === "string" ? (JSON.parse(c.Anexos) as Anexo[]) : c.Anexos;
}

function semRuido<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !RUIDO.has(k)));
}

export type TabelasIbsCbs = {
  cst: string;
  classificacoes: string;
  porNcmNbs: string;
  json: string;
  totais: { csts: number; classificacoes: number; codigosNcmNbs: number };
};

export function ibsCbsParaArquivos(html: string): TabelasIbsCbs {
  const csts = extrairDadosOriginais(html).sort((a, b) => a.Cst.localeCompare(b.Cst));
  const classes = csts
    .flatMap((c) => c.ClassificacoesTributarias ?? [])
    .sort((a, b) => a.CodClassTrib.localeCompare(b.CodClassTrib));

  const cst = csv(
    ["cst", "nome", "exige_tributo", "monofasica", "reducao_aliquota", "reducao_base", "diferimento", "inicio_vigencia", "fim_vigencia"],
    csts.map((c) => [
      c.Cst,
      c.NomeCst,
      Boolean(c.IndExigeTrib),
      Boolean(c.IndMonofasica),
      Boolean(c.IndReducaoAliq),
      Boolean(c.IndReducaoBc),
      Boolean(c.IndDiferimento),
      dia(c.DthIniVig),
      dia(c.DthFimVig),
    ])
  );

  const classificacoes = csv(
    ["cclasstrib", "cst", "nome", "reducao_ibs_pct", "reducao_cbs_pct", "tipo_aliquota", "documentos", "legislacao", "inicio_vigencia", "fim_vigencia"],
    classes.map((c) => [
      c.CodClassTrib,
      c.Cst,
      c.NomeClassTrib.trim(),
      c.PercRedIbs,
      c.PercRedCbs,
      c.TipoAliq ?? "",
      DOCUMENTOS.filter(([campo]) => c[campo] === true).map(([, nome]) => nome).join(" "),
      c.TexUrlLegislacao ?? "",
      dia(c.DthIniVig),
      dia(c.DthFimVig),
    ])
  );

  const vinculos = classes
    .flatMap((c) =>
      anexosDe(c).map((a) => [
        c.CodClassTrib,
        a.TipoCodigo,
        a.CodNcmNbs,
        (a.DescItemAnexo ?? "").trim(),
        (a.DescAnexo ?? "").trim(),
        a.NroItemAnexoLei ?? "",
        (a.DescCondicao ?? "").trim(),
        (a.DescExcecao ?? "").trim(),
        (a.Observacao ?? "").trim(),
        dia(a.DthIniVig),
        dia(a.DthFimVig),
      ])
    )
    .sort((a, b) => `${a[0]}|${a[2]}|${a[9]}`.localeCompare(`${b[0]}|${b[2]}|${b[9]}`));

  const porNcmNbs = csv(
    ["cclasstrib", "tipo", "codigo", "item", "anexo", "item_anexo_lei", "condicao", "excecao", "observacao", "inicio_vigencia", "fim_vigencia"],
    vinculos
  );

  const completo = csts.map((c) => ({
    ...semRuido(c),
    ClassificacoesTributarias: (c.ClassificacoesTributarias ?? [])
      .slice()
      .sort((a, b) => a.CodClassTrib.localeCompare(b.CodClassTrib))
      .map((cl) => ({ ...semRuido(cl), Anexos: anexosDe(cl).map((a) => semRuido(a)) })),
  }));

  return {
    cst,
    classificacoes,
    porNcmNbs,
    json: json(completo),
    totais: { csts: csts.length, classificacoes: classes.length, codigosNcmNbs: vinculos.length },
  };
}
