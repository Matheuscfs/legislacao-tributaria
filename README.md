# legislacao-tributaria

[![CI](https://github.com/Matheuscfs/legislacao-tributaria/actions/workflows/ci.yml/badge.svg)](https://github.com/Matheuscfs/legislacao-tributaria/actions/workflows/ci.yml)
[![Captura diária](https://github.com/Matheuscfs/legislacao-tributaria/actions/workflows/capturar.yml/badge.svg)](https://github.com/Matheuscfs/legislacao-tributaria/actions/workflows/capturar.yml)

Leis tributárias e tabelas de tributação de produtos, capturadas todo dia das fontes oficiais e versionadas no Git. O texto de cada lei fica num arquivo; quando o governo altera a lei, a captura seguinte vira um commit, e **o diff mostra exatamente o que mudou**, inciso por inciso. O mesmo vale para a NCM e para a classificação do IBS e da CBS da reforma tributária.

Tudo aqui é público: texto de lei não tem direito autoral no Brasil (Lei 9.610/98, art. 8º, IV), e as tabelas são publicadas pelo governo para quem emite nota fiscal. O que faltava era juntar num lugar só, num formato que dá para ler, comparar e usar em código.

## O que tem aqui

**Normas** (texto compilado, em [`normas/federal/`](normas/federal)):

| Norma | Artigos | O que é |
|---|---:|---|
| [EC 132/2023](normas/federal/ec-132-2023/texto.md) | 25 | A reforma tributária do consumo na Constituição |
| [CTN](normas/federal/lei-5172-1966/texto.md) (Lei 5.172/1966) | 229 | Código Tributário Nacional |
| [LC 123/2006](normas/federal/lc-123-2006/texto.md) | 158 | Simples Nacional |
| [LC 214/2025](normas/federal/lc-214-2025/texto.md) | 601 | IBS, CBS e Imposto Seletivo, com os anexos de redução |
| [LC 227/2026](normas/federal/lc-227-2026/texto.md) | 210 | Comitê Gestor do IBS, processo administrativo e distribuição do IBS |
| [Decreto 12.955/2026](normas/federal/decreto-12955-2026/texto.md) | 621 | Regulamento da CBS |
| [LC 116/2003](normas/federal/lc-116-2003/texto.md) | 13 | ISS: lista de serviços, local da incidência, alíquota mínima de 2% e retenção |
| [Lei 10.637/2002](normas/federal/lei-10637-2002/texto.md) | 76 | PIS/Pasep não cumulativo |
| [Lei 10.833/2003](normas/federal/lei-10833-2003/texto.md) | 140 | Cofins não cumulativa e retenção de PIS, Cofins e CSLL na fonte |
| [Lei 8.212/1991](normas/federal/lei-8212-1991/texto.md) | 118 | Custeio da Seguridade Social, inclusive a retenção de INSS (art. 31) |

**Tabelas de produto:**

| Arquivo | O que é | Fonte |
|---|---|---|
| [`tabelas/ncm/ncm.csv`](tabelas/ncm/ncm.csv) | NCM vigente: 15.157 códigos, com vigência e ato legal de cada um | Portal Único Siscomex |
| [`tabelas/tipi/tipi.csv`](tabelas/tipi/tipi.csv) | TIPI: alíquota de IPI por NCM e exceção (15.563 linhas) | Receita Federal |
| [`tabelas/cest/cest.csv`](tabelas/cest/cest.csv) | CEST: 1.054 códigos da substituição tributária do ICMS, com as NCM de cada um, e os [25 segmentos](tabelas/cest/segmentos.csv) | CONFAZ (Convênio ICMS 142/2018) |
| [`tabelas/ibs-cbs/cst.csv`](tabelas/ibs-cbs/cst.csv) | CST do IBS e da CBS | SVRS (Conformidade Fácil) |
| [`tabelas/ibs-cbs/classificacao-tributaria.csv`](tabelas/ibs-cbs/classificacao-tributaria.csv) | Os 173 códigos de classificação tributária (cClassTrib), com redução de IBS e CBS, documentos em que valem e o artigo da lei | SVRS (Conformidade Fácil) |
| [`tabelas/ibs-cbs/classificacao-por-ncm-nbs.csv`](tabelas/ibs-cbs/classificacao-por-ncm-nbs.csv) | Qual cClassTrib vale para cada NCM ou NBS (4.728 vínculos), com o item do anexo, condição e exceção | SVRS (Conformidade Fácil) |
| [`tabelas/ibs-cbs/classificacao-tributaria.json`](tabelas/ibs-cbs/classificacao-tributaria.json) | A tabela completa, com todos os campos do portal | SVRS (Conformidade Fácil) |

**NFS-e nacional** (Sistema Nacional NFS-e, [gov.br/nfse](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica)):

| Arquivo | O que é | Fonte |
|---|---|---|
| [`tabelas/nfse/lista-servico-nacional.csv`](tabelas/nfse/lista-servico-nacional.csv) | Os 338 códigos de tributação nacional (cTribNac, 6 dígitos: item, subitem e desdobro da lista da LC 116), com o item e a descrição do grupo | Anexo B |
| [`tabelas/nfse/nbs.csv`](tabelas/nfse/nbs.csv) | NBS 2.0: os 1.210 códigos da Nomenclatura Brasileira de Serviços | Anexo B |
| [`tabelas/nfse/correlacao-item-nbs.csv`](tabelas/nfse/correlacao-item-nbs.csv) | Item da LC 116 → NBS → indicador de operação (cIndOp) → cClassTrib do IBS/CBS, com as células mescladas da planilha desfeitas (1.419 linhas) | Anexo VIII |

Um escritório de contabilidade, por exemplo, emite com o código 171901; o Anexo VIII liga o item 17.19 à NBS 1.1302.21.00 e ao cClassTrib 200052, o das profissões intelectuais fiscalizadas por conselho — redução de 30% no IBS e na CBS, segundo a [`classificacao-tributaria.csv`](tabelas/ibs-cbs/classificacao-tributaria.csv):

```
lista-servico-nacional.csv   171901  17.19  "Contabilidade, inclusive serviços técnicos e auxiliares."
correlacao-item-nbs.csv      17.19   NBS 1.1302.21.00  cIndOp 100301  cClassTrib 200052
nbs.csv                      1.1302.21.00  "Serviços de contabilidade"
classificacao-tributaria.csv 200052  CST 200  redução IBS 30%  redução CBS 30%
```

O Anexo VIII é, nas palavras do próprio portal, "um trabalho inicial, ainda em desenvolvimento", sem regra de negócio baseada nele: serve para orientar a escolha, não para validar a nota. Não existe tabela oficial de CNAE para código de serviço — o CNAE é a atividade do CNPJ, e o código é o do serviço de cada nota.

**Novidades:** [`novidades/leis-complementares.csv`](novidades/leis-complementares.csv) lista todas as leis complementares federais, com a ementa e duas marcas: se a ementa é tributária e se a lei já está no catálogo.

Cada pasta tem um `metadados.json` com a fonte, os totais e a data da última captura que mudou alguma coisa.

## A parte útil: de produto a tributação

Com a reforma, quem emite nota precisa saber, para cada produto, se ele tem alíquota reduzida de IBS e CBS e qual código de classificação usar. A resposta oficial existe, mas fica espalhada entre o anexo da LC 214, a tabela da NF-e e a NCM. Aqui ela está em três arquivos que se ligam pelo código:

```
ncm.csv                         1006.30      "- Arroz semibranqueado ou branqueado…"
classificacao-por-ncm-nbs.csv   200003  NCM  10063021  "Arroz das subposições 1006.20 e 1006.30…"
classificacao-tributaria.csv    200003  CST 200  redução IBS 100%  redução CBS 100%  → LC 214, Anexo I
tipi.csv                        1006.30.21   "Polido ou brunido"  IPI: NT
```

Ou seja: arroz da NCM 1006.30.21 entra no cClassTrib 200003 (cesta básica), com redução de 100% de IBS e CBS pelo Anexo I da LC 214, e não é tributado pelo IPI. Para produto sujeito a substituição tributária do ICMS, o `cest.csv` dá o CEST a partir da mesma NCM.

## Como o texto da lei fica no arquivo

O Planalto publica o texto **compilado**: a redação antiga aparece riscada ao lado da nova, seguida de "(Redação dada pela Lei Complementar nº …)". Aqui o riscado vira `~~…~~` em vez de sumir, porque competência antiga se apura pelo texto da época:

```markdown
~~§ 1º Considera-se receita bruta, para fins do disposto no caput deste artigo, o produto da venda de bens e serviços (…)~~

~~II -~~ no caso da empresa de pequeno porte, aufira (…) receita bruta (…) igual ou inferior a R$ 3.600.000,00 (três milhões e seiscentos mil reais).

II - no caso de empresa de pequeno porte, aufira (…) receita bruta (…) igual ou inferior a R$ 4.800.000,00 (quatro milhões e oitocentos mil reais). (Redação dada pela Lei Complementar nº 155, de 2016) Produção de efeito
```

- O riscado é reproduzido como está no original. No exemplo acima, o Planalto riscou só o "II -" da redação antiga, e não o inciso inteiro; o arquivo não corrige isso, porque não é papel dele reinterpretar a fonte.
- Um parágrafo do original vira um parágrafo do arquivo. Assim o diff aponta o inciso que mudou, e não a página inteira.
- Livro, título, capítulo e seção viram cabeçalhos (`##` a `#####`), com o nome junto: `### CAPÍTULO IV — DOS TRIBUTOS E CONTRIBUIÇÕES`.
- Os links do Planalto saem, e o texto deles fica.
- Para ter só o texto vigente, basta ignorar o que está entre `~~`.

## Captura diária

O workflow [`capturar.yml`](.github/workflows/capturar.yml) roda todo dia às 6h (Brasília) e baixa tudo de novo. Quando uma fonte muda, ele faz um commit com o resumo na mensagem (`captura: LC 214/2025: +12 −3 parágrafos; NCM (Resolução Gecex nº …): 4 código novo(s)`); quando nada muda, não há commit. Para acompanhar mudanças, basta olhar o [histórico](https://github.com/Matheuscfs/legislacao-tributaria/commits/main) ou dar *watch* no repositório.

Nenhum arquivo de dado guarda a data da captura no corpo. Se guardasse, haveria um commit por dia sem a lei ter mudado.

### Leis novas

A mesma captura lê o [quadro de leis complementares](https://www.planalto.gov.br/ccivil_03/leis/lcp/quadro_lcp.htm) do Planalto. É por lei complementar que mudam o Simples Nacional, o CTN e a reforma do consumo: só entre agosto e outubro de 2026 saíram a LC 235, a LC 236 (altera o CTN), a LC 237 e a LC 238 (altera o limite do Simples). Quando aparece uma lei complementar nova com ementa tributária que ainda não está no catálogo, o workflow abre uma *issue* com a ementa e o link, e alguém decide se ela entra no `normas.json`.

A alteração de uma norma que já está no catálogo não precisa de aviso à parte: ela aparece no diff da captura seguinte, com a anotação "(Redação dada pela …)" do Planalto.

## Como usar

Os arquivos são texto puro e podem ser lidos direto do GitHub:

```bash
curl -sL https://raw.githubusercontent.com/Matheuscfs/legislacao-tributaria/main/tabelas/ibs-cbs/classificacao-por-ncm-nbs.csv
```

Ou clone e rode a captura você mesmo:

```bash
npm install
npm run capturar   # baixa tudo das fontes e grava só o que mudou
npm test           # 39 testes, sem acesso à internet
```

Requer Node 22 ou mais novo. Para acrescentar uma norma, inclua uma entrada em [`normas.json`](normas.json) com a URL do Planalto e capture só ela, sem baixar as tabelas de novo: `npm run capturar -- lc-116-2003`.

## Limitações

- **Não é fonte oficial.** É uma cópia fiel e datada das fontes oficiais; para efeito legal, vale o publicado no Diário Oficial da União.
- **Tabelas dentro do texto da lei.** No HTML do Planalto, as tabelas dos anexos (como as alíquotas do Simples) vêm com uma célula por parágrafo, e é assim que ficam no Markdown: legíveis e comparáveis, mas não em formato de tabela.
- **Descoberta só de leis complementares.** O Diário Oficial e o LexML respondem a acesso automatizado com bloqueio ou verificação anti-robô, e este repositório não tenta contornar isso. Leis ordinárias, decretos e instruções normativas novas ainda entram à mão, pelo `normas.json`.
- **Só normas do Planalto.** O conversor entende o HTML do Planalto. Resoluções do CGSN (no site de normas da Receita, que só funciona com JavaScript) e regulamentos estaduais como o RICMS/PR têm outro formato e ainda não entram.
- **CEST não atualiza sozinho.** O site do CONFAZ não aceita conexão dos servidores do GitHub Actions (tempo de conexão esgotado), embora responda normalmente de dentro do Brasil. A tabela do CEST é atualizada quando alguém roda `npm run capturar` a partir do Brasil; na captura diária, a falha aparece no resumo da execução e as outras fontes seguem normalmente.
- **Notas da TIPI e do CEST ficam de fora.** As notas de seção e de capítulo da TIPI e as notas de revogação do CEST ficam de fora; entram só as linhas de produto.

## Próximos passos

- Resoluções do CGSN e o RICMS/PR, com conversores próprios.
- NBS completa e as tabelas de alíquota do ICMS por estado.
- Consumo pelo [gestao-de-contabilidade](https://github.com/Matheuscfs/gestao-de-contabilidade): os artigos daqui viram a base do RAG que cita a lei ao sugerir uma classificação.

## In English

Brazilian tax laws (the Constitution's tax reform amendment, the National Tax Code, the Simples Nacional statute, the IBS/CBS laws and the CBS regulation) and product tax tables (NCM, IPI rates, ICMS tax-substitution codes and the IBS/CBS classification codes from the 2025 tax reform), captured daily from official government sources and versioned in Git. New tax-related complementary laws open an issue automatically. Each law is a Markdown file, one paragraph per legal provision, with superseded wording kept as strikethrough. When the government amends a law, the next capture becomes a commit and the diff shows exactly which provision changed. Product tables are deterministic CSVs that link an NCM code to its IBS/CBS classification and rate reduction.

## Licença

Código sob [MIT](LICENSE). Os textos legais e as tabelas são de domínio público e pertencem às fontes citadas.
