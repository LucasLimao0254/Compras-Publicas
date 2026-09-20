# Tarefa: reconciliar o código com o MODELO.md

Leia `MODELO.md` na raiz antes de começar. Ele é a fonte única de verdade do domínio e
prevalece sobre qualquer briefing antigo, sobre os comentários do próprio código e sobre as
seções do `CLAUDE.md` que conflitarem com ele.

O código já está bastante adiantado e em boa parte **conforme**: a cascata existe em
`api/src/saldo-ceiling/saldo-ceiling.service.ts` com transação e lock explícitos,
`contratos` já tem as duas FKs de origem mutuamente exclusivas (`ataOrgaoId` /
`homologacaoFornecedorId`), `atas.homologacaoFornecedorId` tem UNIQUE, e `ataItens` /
`itensContrato` já rastreiam `homologacaoItemId`. Nada disso deve ser refeito.

Cinco decisões tomadas em 17/09/2026 (tabela na seção 11 do `MODELO.md`) contradizem partes
do que está construído. Esta tarefa é a reconciliação — **não é feature nova**, com exceção
do item 6.

Ordem sugerida: 1 primeiro (é o que protege todo o resto), depois 2–5, e 6 por último.

---

## 1. Testes dos invariantes — fazer antes de mexer no resto

Hoje o projeto tem **zero testes**. Com uma cascata de três níveis e um serviço de teto com
lock, isso é o maior risco do projeto, e é o que fez as regras se perderem entre uma rodada
e outra.

Monte o harness de teste no `api/` (Jest, que já vem com o scaffold do Nest) e escreva os
**dez invariantes da seção 2 do `MODELO.md`** como testes de integração contra o Postgres
embarcado (`node scripts/devdb.js start`). Escreva-os **antes** das mudanças 2–5: os que
testam comportamento que ainda não existe devem falhar agora e passar ao fim da tarefa.

Para cada invariante, no mínimo um teste do caminho feliz e um da violação. Os que mais
importam, por serem os que o código hoje não garante:

- **Invariante 5** — tentar criar ordem a partir de ata deve ser rejeitado, sempre.
- **Invariante 6** — aditivo com qualquer dos três saldos diferente de zero deve ser
  rejeitado; com os três zerados, aceito, e a quantidade entra fora do teto da homologação.
- **Invariante 8** — contrato com `ataOrgaoId` ou `homologacaoFornecedorId` preenchido não
  aceita `formaControleSaldo = 'APENAS_VALOR_TOTAL'`.
- **Invariante 3** — nenhuma operação além de aditivo aumenta `homologacaoItens.quantidade`.
- **Invariante 1** — não existe coluna `saldo` em lugar nenhum; conferir por leitura do
  schema, não por convenção.

## 2. Remover ordem direto da ata

Decisão: **a ordem nasce exclusivamente de contrato.** O toggle do produto de referência não
é replicado.

Remover, de ponta a ponta:

- `ordens.ataOrgaoId` e `itensOrdem.ataItemId` no schema.
- `configuracoesCompras.permitirOrdemDiretoAta`, o campo no DTO
  (`api/src/configuracoes/dto/configuracoes.dto.ts`) e o tratamento em
  `configuracoes.service.ts`.
- A checagem em `api/src/ordens/ordens.service.ts:183` (`if (usaAta && !config.permitirOrdemDiretoAta)`)
  e todo o ramo `usaAta` que ela protege — `contratoId` passa a ser obrigatório.
- O que existir no frontend que ofereça "Criar ordem" a partir da ata
  (`web/src/pages/AtaDetalhe.tsx`) e o controle correspondente em `ConfiguracoesCompras.tsx`.

Cuidado ao mexer no `saldo-ceiling.service.ts`: o comentário do
`homologacaoItemSaldoDisponivel` explica que a reserva inteira da ata é descontada do teto
raiz. Essa lógica continua correta e não muda — o que sai é só o consumo direto por ordem.

## 3. Renovação de ata vira prorrogação de prazo

Decisão: **renovar uma ata é estender a vigência da própria ata**, mantendo o teto e o saldo
restante. Não cria ata nova, não copia itens, não gera ciclo.

- Remover `atas.ataOrigemId` do schema e a autorreferência.
- Substituir `POST /atas/:id/renovar` (`atas.controller.ts:104`) e `AtasService.renovar()`
  (`atas.service.ts:502`) por uma operação de prorrogação que altera apenas
  `vigenciaFinal` — validando que a nova data é posterior à atual — e registra o evento.
- Remover do frontend o que existir de "Ciclos Anteriores" ou navegação entre ciclos.

O `ataRemanejamentos` é log imutável e não tem relação com isso; não mexer.

## 4. Bloquear o modo de saldo global quando há origem

Decisão: **contrato derivado de homologação ou de ata controla saldo por item.**

`formaControleSaldoEnum` tem `NORMAL`, `APENAS_VALOR_TOTAL` e `QTD_VALOR_VARIAVEL`, mas os
dois modos alternativos não estão implementados em lugar nenhum — não há uma linha que os
trate. Então aqui não é implementar: é **impedir**.

Validar na criação e na edição de contrato que `formaControleSaldo = 'APENAS_VALOR_TOTAL'`
só é aceito quando `ataOrgaoId` e `homologacaoFornecedorId` são ambos nulos. Rejeitar com
mensagem explícita ("Contratos derivados de homologação controlam saldo por item"), e ocultar
a opção no formulário do frontend nesse caso — não mostrar desabilitada.

## 5. Status REQUISICAO — confirmar antes de mexer

`statusOrdemEnum` tem `REQUISICAO`, mas pelo comentário e pelo uso em `ordens.service.ts` ele
é um **rascunho** que não valida nem decrementa saldo — não é o documento "requisição" do
produto de referência, que é o que a decisão 4 do `MODELO.md` eliminou.

**Não remova nada aqui.** O rascunho é útil e a decisão não era sobre ele. O que fazer é só
desfazer a ambiguidade de nome: renomear o valor do enum para `RASCUNHO` e ajustar os usos,
para que ninguém leia isso como o documento que não existe. Se o rename custar migração de
dados relevante, deixe como está e apenas documente no `MODELO.md`.

## 6. Minutas em Configurações — única feature nova

Hoje não existe geração de documento. As ocorrências de "minuta" no código são todas a
`situacaoContratoEnum = 'MINUTA'` (contrato em rascunho), que é outra coisa. A seção do
`CLAUDE.md` que afirma que "document/minuta generation ... are implemented" está incorreta e
deve ser corrigida.

Implementar conforme a seção 8 do `MODELO.md`:

- Tabela de modelos de minuta por tenant: tipo (`ARP`, `CONTRATO`, `ADITIVO`,
  `APOSTILAMENTO`), arquivo `.docx` armazenado, nome original, quem enviou, quando.
  Reaproveitar o padrão de upload já usado em `licitacoes-homologacao` (arquivo com nome
  gerado por `randomUUID()`, diretório configurável e gitignored, nome original só em coluna
  para exibição).
- Substituição por **marcadores de texto** no corpo do `.docx` (`{{numero_contrato}}`,
  `{{fornecedor_razao_social}}`, etc.). Defina a lista de marcadores por tipo e exponha-a
  num endpoint, porque a tela de upload precisa mostrá-la.
- Upload restrito ao Administrador do tenant.
- **Sem modelo cadastrado para um tipo, o documento daquele tipo não é gerado** — endpoint
  rejeita e o botão no frontend fica desabilitado com a razão dita na tela. Não há fallback
  nem modelo de sistema.
- Indicador de prontidão na tela de Configurações ("4 de 4 modelos carregados").

---

## Ao terminar

Atualize o `CLAUDE.md`: corrija a afirmação sobre geração de minuta, remova as menções a
ordem direto da ata e a renovação de ata como ciclo, e acrescente um ponteiro para o
`MODELO.md` logo no topo, dizendo que ele é a fonte de verdade do domínio.

Não altere o `MODELO.md` por conta própria. Se algo nele estiver errado ou impossível,
pare e relate — ele muda por decisão, não por implementação.
