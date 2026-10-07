# MODELO — Compras Públicas

**Fonte única de verdade do domínio.** Este arquivo não é superado por nenhum outro; ele é
editado. Onde qualquer briefing anterior conflitar com o que está aqui, este prevalece.

Todo agente que for trabalhar no sistema — Claude Code, Claude Design, ou este chat numa
sessão futura — lê este arquivo **antes** de qualquer outro. Dentro do repositório do MVP,
este é o conteúdo do `CLAUDE.md`.

Última atualização: 17/09/2026.

---

## 1. A cascata de abatimento

```
Homologação (planilha Excel; teto FIXO por fornecedor+item; item cadastrado UMA vez)
   └─ Ata  (opcional; EXATAMENTE 1 por fornecedor; distribui o teto entre órgãos)
        └─ Contrato (abate do saldo do órgão na ata — ou direto do teto da homologação,
                     quando não há ata; vários por fornecedor enquanto houver saldo)
             └─ Ordem de fornecimento (abate SÓ do saldo do contrato)
```

Cada nível abate exclusivamente do nível imediatamente acima. Uma ordem nunca toca ata nem
homologação; um contrato nunca toca a homologação quando existe ata no meio.

## 2. Invariantes

Estas são as regras que não podem ser violadas em nenhuma tela, endpoint ou migração. Cada
uma deve virar teste.

1. **Saldo é sempre derivado, nunca armazenado.** Saldo de qualquer nível = quantidade do
   nível menos a soma do que os filhos consumiram. Não existe coluna `saldo` gravada.
2. **Item é cadastrado uma única vez**, na importação da homologação. Ata, contrato e ordem
   referenciam o item; nunca redigitam descrição, unidade, marca ou valor unitário.
3. **O teto da homologação é fixo.** Nenhuma operação aumenta a quantidade homologada de um
   par fornecedor+item — exceto aditivo (regra 6).
4. **Uma ata por fornecedor por licitação.** A soma das quantidades distribuídas entre os
   órgãos de uma ata nunca excede o teto homologado daquele fornecedor para aquele item.
   Quantidade zero para um órgão é válida, não é erro.
5. **Ordem só nasce de contrato.** Não existe ordem derivada diretamente de ata ou de
   homologação. Não é possível emitir ordem de item não contratado ou sem saldo no contrato.
6. **Aditivo só com os três saldos zerados.** Contrato, ata (quando houver) e homologação
   precisam estar simultaneamente em saldo zero — sem tolerância percentual. A quantidade do
   aditivo é acrescida **fora** do teto da homologação. Vale para os aditivos que acrescentam
   valor ou quantidade, em todo contrato (com origem ou manual — no manual, só o saldo do
   próprio contrato). **Prorrogação de prazo e supressão não têm essa trava**: prorrogar serve
   justamente para consumir o saldo restante, e suprimir só se aplica a saldo não consumido.
7. **Apostilamento não tem trava de saldo** e nunca altera quantidade.
8. **Contrato derivado de homologação ou ata controla saldo por item.** O modo "Valor global"
   fica indisponível nesses casos.
9. **Toda ordem tem histórico**, presente mesmo quando nunca foi alterada (mostrando ao menos
   a emissão).
10. **Documento sem modelo cadastrado não é gerado.** Não há fallback nem modelo de sistema.

## 3. Homologação

Importada em **planilha Excel** (.xlsx/.xls/.csv), na tela de Licitações. Colunas, nesta ordem:

`Item | Descrição | Unidade | Marca | Quantidade | Valor Unitário | CNPJ Fornecedor | Razão Social Fornecedor`

É o único momento em que item é cadastrado no sistema, e é a origem do teto de cada par
fornecedor+item.

**Revisão obrigatória antes de valer.** A importação passa por uma tela de revisão onde cada
fornecedor extraído é vinculado a um fornecedor cadastrado (ou cadastrado na hora), e cada
linha com problema é apontada individualmente — validação por linha, com a linha do arquivo
original citada ("linha 14: quantidade negativa"). Não existe "confiança de extração": a
origem é planilha, a célula é válida ou não é. A homologação só fica disponível para uso a
jusante depois de concluída a revisão.

Uma licitação pode ter mais de uma homologação ao longo do tempo (reenvio corrigido).

## 4. Ata de Registro de Preços

Opcional. Quando existe, é **uma por fornecedor**, e seu papel é distribuir entre os órgãos o
teto que aquele fornecedor recebeu na homologação.

A ata tem fornecedor próprio (razão social + CNPJ), visível no cabeçalho e na listagem. O
formulário de criação impede criar uma segunda ata para o mesmo fornecedor na mesma licitação.
Escolhida a licitação, o **detentor** só pode ser um dos fornecedores da homologação revisada
dela (quem já tem ata aparece indisponível); o backend recusa ata sem esse vínculo quando a
licitação tem homologação.

**Editar e excluir**: número, vigência inicial e situação são editáveis; licitação e detentor
não (os itens e o teto vêm deles), e a vigência final muda por prorrogação. Excluir é só do
Administrador e só de ata da qual nenhum contrato abate — com contrato, arquiva-se.

Saldo pode ser remanejado entre órgãos, desde que a soma continue respeitando o teto.

**Renovação de ata é prorrogação de prazo na própria ata** — mesma ata, mesmo teto, saldo
restante preservado. Não cria ata nova, não copia itens, não gera ciclo. Não existe
`ataOrigemId` nem aba de ciclos anteriores.

Lotes: a ata pode organizar itens em lotes (número + nome), gerenciados em modal próprio.

## 5. Contrato

Abate do **saldo do órgão na ata**, quando há ata; ou direto do **teto da homologação para
aquele fornecedor**, quando não há. O contrato registra explicitamente qual das duas origens
é a sua — nunca por coincidência de número de licitação.

Um fornecedor pode ter vários contratos da mesma origem, enquanto houver saldo.

No formulário de criação a escolha segue a cascata: **licitação → ARP** (só as ARPs dessa
licitação, ou "Sem ARP — direto da homologação") **→ fornecedor** (o da ARP escolhida; sem ARP,
os homologados que não têm ata) **→ órgão da ata**.

**Editar e excluir**: número, processo, objeto, faturamento, vigência e situação são editáveis;
licitação, fornecedor e origem não. Depois da primeira ordem ou do primeiro aditivo, a
vigência final só muda por aditivo de prazo. Excluir é só do Administrador e só de contrato
sem nenhuma ordem (nem cancelada) — com ordens, arquiva-se.

**Objeto**: texto próprio do contrato, que normalmente diverge do objeto da licitação e do da
ata mesmo quando os itens são os mesmos. No formulário de criação, o campo vem
**pré-preenchido com o texto do objeto da licitação**, editável — conveniência de digitação,
não herança.

**Modo de saldo**: por item (quantidade × valor) ou só quantidade. O modo "Valor global" só
existe para contrato sem origem em homologação ou ata.

### 5.1 Aditivos

Alteração contratual real (Lei 14.133/2021, art. 124): prorrogação, acréscimo ou supressão
quantitativa, reequilíbrio econômico-financeiro. Formalizado por termo aditivo.

Tipos: acréscimo até 25%, supressão até 25%, acréscimo até 50%, prorrogação de prazo,
reequilíbrio econômico-financeiro.

Regra própria deste projeto (não é da lei): a quantidade do aditivo entra **fora** do teto da
homologação, e o aditivo que acrescenta valor ou quantidade só pode ser criado quando os três
saldos — contrato, ata e homologação — estão zerados (prorrogação e supressão ficam de fora;
ver invariante 6).

### 5.2 Apostilamentos

Registro administrativo simplificado (art. 136), sem termo aditivo, para quatro eventos:
reajuste/repactuação já previsto, atualização ou compensação financeira de pagamento,
alteração de razão social da mesma pessoa jurídica, e empenho de dotação orçamentária.

Sem trava de saldo, sempre disponível.

Aditivos e apostilamentos compartilham uma linha do tempo única no contrato, com ícones
distintos, autor e data.

## 6. Ordem de fornecimento

Abate exclusivamente do saldo do contrato. Não existe requisição como documento ou entidade
separada — a ordem de fornecimento é o único documento desse nível.

Numeração em sequência fixa por tenant, a partir de um contador explícito e editável em
Configurações (não `MAX+1`).

**Edição e exclusão depois de emitida são exclusivas do Administrador do tenant.** Para os
demais usuários essas ações não aparecem na interface. Toda alteração pós-emissão entra no
histórico da ordem, com autor, data e o que mudou.

A tela de emissão tem um painel de assistente (ícone sparkle) previsto para receber comandos
em linguagem natural e compor a ordem. **Não é funcional nesta fase** — é stub de interface, e
deve estar comentado no código como intencional.

## 7. Seleção de itens

Nas três etapas a jusante da homologação — ata, contrato e ordem — o usuário seleciona itens
de duas formas, que **coexistem**; nenhuma substitui a outra:

- **Seleção manual na tela**: seletor listando os itens disponíveis na origem, com o saldo de
  cada um visível. O item selecionado vira linha somente-leitura com um único campo editável:
  quantidade.
- **Upload de planilha de demanda**: arquivo leve, apenas `Item | Quantidade`. É diferente da
  planilha de homologação, que é a única que cadastra item.

Acima da grade, em todas as três, uma faixa dizendo de onde os itens vieram e qual o saldo
remanescente da origem.

## 8. Configurações do módulo

Duas entradas no submenu: **Unidades executoras** e **Configurações**.

**Unidades executoras** — CNPJs para emissão de nota fiscal (prefeitura, fundos). Campos: CNPJ
e Razão social obrigatórios; Endereço completo, CEP, Email; e grupo Ordenador de Despesa com
Nome, Cargo e Portaria.

**Configurações** — página única, salva por inteiro num botão de rodapé:

- **Sequencial da próxima ordem**, editável.
- **Minutas** — upload dos modelos de documento pelo Administrador do tenant, na implantação,
  antes de qualquer operação. Quatro tipos obrigatórios: **ARP, Contrato, Aditivo e
  Apostilamento**. Arquivo .docx com **marcadores de texto** no corpo (`{{numero_contrato}}`,
  `{{fornecedor_razao_social}}`, etc.); a tela de upload lista os marcadores disponíveis para
  cada tipo. **Cada tipo aceita vários modelos** (ex.: um contrato para pregão, outro para
  dispensa), cada um com nome e, opcionalmente, as **modalidades de licitação** a que se aplica.
  Ao gerar, o sistema **sugere** o modelo da modalidade da licitação de origem (sem modelo
  daquela modalidade, um sem modalidade marcada; sem esse, o mais antigo), mostra qual será
  usado e deixa escolher outro. Faltando qualquer modelo de um tipo, o botão de gerar documento
  daquele tipo fica desabilitado, com a razão dita na tela. Indicador de prontidão no topo
  ("4 de 4 tipos com modelo" — basta um por tipo).
- **Modelo de dotação orçamentária** — colunas configuráveis por tenant: rótulo editável,
  ordem por arraste, e por coluna os toggles *Múltiplos* e *Obrigatório*. Padrão:
  Gestão/Unidade, Fonte de Recursos, Programa de Trabalho, Elemento de despesa. Mais um toggle
  geral de obrigatoriedade de dotação no cadastro de contratos e ordens, e um seletor de
  formato do importador de dotação.
- **Regra de ordem**: permitir ou não criar e emitir ordens com contrato vencido (desligado
  por padrão).

Todo toggle leva abaixo uma frase explicando o que acontece desligado e o que acontece ligado,
citando a consequência concreta na tela.

## 9. Multi-tenant e administração

O cliente é um **órgão público** — prefeitura ou câmara. Um usuário pode pertencer a vários
tenants; um tenant tem vários usuários.

Três níveis, nesta ordem:

1. **Plataforma** — decide quais **Setores** cada tenant tem licenciado. Todos os módulos de
   Compras (Dashboard, Licitações, Fornecedores, Atas & Credenciamentos, Contratos, Painel de
   Ordens, Configurações) formam um único setor licenciável: o **Setor de Compras**. Outros
   setores virão como blocos irmãos de outros domínios — Licitações não é um deles, por estar
   dentro de Compras.
2. **Administrador do tenant** — concede acesso a módulos para os usuários do próprio tenant,
   limitado ao que a plataforma habilitou.
3. **Usuário final** — usa o que lhe foi concedido.

**Requisito de segurança, em vigor permanente:** esta hierarquia não pode ser alterada pelo
tenant nem por nenhum usuário dele, incluindo o Administrador do tenant. A habilitação de
setores por tenant é aplicada por guarda de backend estruturalmente separada do sistema de
permissões do tenant, e não é alcançável por nenhum endpoint de sessão de tenant. Na
interface, o controle de habilitação **não existe** na navegação do tenant — vive em área de
plataforma separada, não como item de menu que o tenant enxerga desabilitado.

A lista de módulos oferecida ao Administrador é derivada do que aquele tenant tem habilitado:
módulo não habilitado não aparece, não aparece desabilitado.

## 10. Navegação

Menu lateral, grupo Compras, nesta ordem: Dashboard → Licitações → Fornecedores →
Atas & Credenciamentos → Contratos → Painel de Ordens → Configurações. A ordem segue o fluxo
do processo.

**Visão geral** — os KPIs Contratos vigentes, Ordens emitidas e Vencendo em 30 dias são
clicáveis e levam à área correspondente já filtrada, com chip de filtro removível. O KPI
**Aditivos no exercício não é clicável** e não deve ter afordância de clique. As linhas de
"Situação dos contratos" e as do ranking de fornecedores também navegam.

**Licitação** tem página de detalhe — resumo da homologação (fornecedores homologados como
chips) e a relação de atas e contratos derivados, cada um clicável para o registro.

**Fornecedor** tem aba de Processos, agrupada por processo licitatório. Abrir um processo que
tem ata leva à ata, e é dentro dela que aparecem os contratos; processo sem ata abre direto a
lista de contratos. Breadcrumb refletindo o nível.

**Contrato** — o indicador de ordens emitidas é clicável e leva ao Painel de Ordens filtrado
por aquele contrato.

## 11. Decisões registradas

| Data | Questão | Decisão |
|---|---|---|
| 17/09/2026 | Modo de saldo "Valor global" vs. teto por item | Indisponível para contrato com origem em homologação ou ata |
| 17/09/2026 | Ordem direto da ata (toggle do produto de referência) | Não replicado — ordem sempre nasce de contrato |
| 17/09/2026 | Renovação de ata vs. teto fixo | Renovação é prorrogação de prazo na mesma ata, saldo restante preservado |
| 17/09/2026 | Requisição como documento distinto | Não existe — só ordem de fornecimento |
| 17/09/2026 | Marcação de campos na minuta | Marcadores de texto `{{campo}}` em .docx |

## 12. Em aberto

- Lista definitiva de marcadores disponíveis por tipo de minuta.
- Formato do importador de dotação: quais opções de colagem existem além de tabela do Word e
  texto em linhas.
- Se o painel de assistente da ordem terá escopo funcional em alguma fase, e qual.
