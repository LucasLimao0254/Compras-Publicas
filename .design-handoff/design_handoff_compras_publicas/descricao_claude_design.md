# Descrição para recriar no Claude Design

Cole este texto inteiro como pedido ao criar o artifact tipo Design. Ele descreve a
identidade visual e as 9 telas já validadas no protótipo (link publicado na conversa),
para que o resultado seja fiel em vez de genérico.

## Produto

"Compras Públicas" — sistema de gestão de licitações, contratos, atas de registro de
preços e ordens de compra para prefeituras. Público: servidores municipais de compras/
administração, não desenvolvedores. Tom: utilitário, confiável, sóbrio — é uma ferramenta
de trabalho do dia a dia com dinheiro público, não um produto de consumo.

## Tokens de design

**Cor** (paleta clara; a escura é análoga, invertendo os papéis de fundo/texto):

| Papel | Hex | Uso |
|---|---|---|
| Fundo da página | `#eef2f0` | superfície de base, verde-acinzentado bem claro |
| Superfície (cards) | `#ffffff` | cards, inputs, tabelas |
| Superfície rebaixada | `#e4e9e6` | hover de linha, fundo de barra de progresso |
| Texto principal | `#12211d` | quase preto com leve viés verde |
| Texto secundário | `#4c5d58` | labels, legendas |
| Texto terciário | `#7c8b86` | placeholders, metadados |
| Linha/borda | `#d3dcd8` | bordas de card, divisórias |
| Acento (teal) | `#0f6e63` | botões primários, links, nav ativo |
| Acento forte | `#0a4c44` | sidebar, cabeçalhos de destaque |
| Acento — tinta | `#dcede9` | fundo de badge/pill neutro do acento, chip ativo |
| Sucesso | `#3f7d4e` (fundo tinta `#e2eee3`) | saldo saudável |
| Alerta | `#a8681f` (fundo tinta `#f4e7d4`) | saldo baixo |
| Crítico | `#a13f35` (fundo tinta `#f4e0dd`) | saldo esgotado/vencido |

Cor semântica (sucesso/alerta/crítico) é sempre separada do acento teal — nunca reusar o
teal para dizer "ok".

**Tipografia**: três papéis, todos via Google Fonts.
- **Fraunces** (serifada, pesos 400/500/600) — títulos de página, números grandes de KPI,
  citação da tela de login. Dá peso institucional sem ser fria.
- **IBM Plex Sans** (400/500/600) — todo o resto: corpo, labels, botões, navegação.
- **IBM Plex Mono** (400/500) — qualquer dado tabular/identificador: valores em R$,
  quantidades, números de contrato/ARP, CNPJ, datas em tabela. `font-variant-numeric:
  tabular-nums` para colunas de números alinharem.

**Layout**: shell fixo em toda tela autenticada — sidebar esquerda de 216px (fundo
`--accent-strong`, texto claro, grupos "Compras" e "Administrativo" com item ativo
destacado por fundo translúcido branco), topbar com breadcrumb/contexto do órgão à
esquerda e avatar à direita, conteúdo com padding 26px. Cards com `border-radius: 12px`,
borda de 1px e sombra suave em duas camadas. Tabelas com cabeçalho uppercase pequeno,
linhas com hover sutil, sem zebra. Barra de saldo: trilho cinza de 6px, preenchimento
colorido por semântica (verde/âmbar/vermelho conforme % disponível).

## As 9 telas

1. **Login** — tela dividida: metade esquerda em teal escuro com o logotipo, uma citação
   institucional e a base legal (Lei 14.133/2021); metade direita com formulário simples
   (código do órgão pré-preenchido, e-mail, senha).

2. **Dashboard** — 4 cards de KPI no topo (contratos ativos, saldo total disponível,
   ordens emitidas no mês, contratos vencendo em 30 dias) com número grande em Fraunces;
   abaixo, grid 2 colunas com um gráfico de barras SVG "saldo por secretaria" e uma linha
   do tempo de "contratos por vencer" (pontos coloridos por urgência); por fim, uma
   tabela de ordens recentes com pills de status.

3. **Contratos (lista)** — tabela com número do contrato + objeto (duas linhas por
   célula), fornecedor, secretaria, vigência, e uma coluna de saldo combinando valor em
   R$ + barra de progresso colorida.

4. **Detalhe do contrato** — grid 2 colunas: à esquerda, tabela de itens com saldo por
   item (mesma barra de progresso) e uma linha do tempo de histórico (assinatura,
   aditivos, ordens emitidas); à direita, card de resumo (fornecedor, CNPJ, valor,
   dotação) e um card de alerta quando itens estão com saldo baixo.

5. **Painel de ordens (lista)** — abas com contador (Buscar / Requisições / Emitido /
   Cancelado) usando um sublinhado colorido no item ativo, não pills; painel de filtros
   recolhível com 5 campos; tabela com badge de status de assinaturas (neutro/âmbar/
   verde conforme o progresso), coluna "Contrato/ARP" que pode mostrar tanto um contrato
   quanto uma ata (mesma origem de dado, dois formatos de identificador); botão
   "Imprimir" só na linha de ordem emitida; menu de ações (⋮) por linha. Um botão desse
   menu abre um modal de histórico com linha do tempo de eventos (cadastrou, emitiu,
   assinatura concluída), cada um com autor, timestamp e um link "Mostrar dados".

6. **Nova ordem de compra (wizard)** — indicador de passos no topo (1 Contrato → 2 Itens
   e quantidades → 3 Confirmação); lista de itens selecionáveis com checkbox, saldo
   disponível e input de quantidade; um item com quantidade acima do saldo mostra o
   input e um pill em vermelho explicando o excesso; item esgotado aparece desabilitado.

7. **Atas & Credenciamentos (lista)** — mesmo padrão da lista de Contratos, mas com um
   filtro extra de "Tipo de ata" (Atas / Credenciamento) e uma linha sem controle de
   saldo para representar um credenciamento (múltiplos detentores, sem valor único).

8. **Detalhe da ata** — cabeçalho com anel de progresso (donut SVG) mostrando % de saldo
   disponível, valor global e saldo em destaque, badges de configuração (modo de saldo,
   casas decimais), e dois botões de ação: "Ver contratos" e "⇄ Remanejar saldo". Abaixo,
   uma lista em acordeão de órgãos participantes (cada card mostra nome, contagem de
   itens, valor, e um pill "Gerenciador" ou "Participante") — clicar em um órgão expande
   sua própria grade de itens com saldo. O botão "Remanejar saldo" abre um modal com
   select de órgão de origem/destino, uma caixa de aviso explicando a regra ("só remaneja
   itens com mesmo número, preço e unidade no destino, dentro do saldo disponível"), e o
   item elegível com campo de quantidade a transferir.

9. **Configurações** — a tela mais densa, organizada em cartões empilhados por assunto,
   não em abas: sequencial da próxima ordem (número grande em mono + botão "Alterar");
   uma grade 2 colunas de seletores de modelo, cada um mostrando o modelo ativo dentro de
   um "chip" com borda e fundo na cor do acento, e um botão "Trocar" — ou um botão
   tracejado "Selecionar modelo" quando vazio; um builder de colunas de dotação
   orçamentária com alça de arrastar, campo de rótulo editável e dois mini-toggles
   (Múltiplos / Obrigatório) por linha, mais lixeira para remover; e dois cartões de
   regra de negócio no formato "toggle + frase explicando o que desligado/ligado
   significa" — um deles, "Ordens da ata", ganha uma borda na cor do acento por ser a
   configuração que liga os módulos de Ordens e Atas. Um botão verde "Salvar
   Configurações" fixo no fim da página grava tudo de uma vez.

## O que faz este produto diferente de um CRUD genérico

O elemento central de toda a interface é **saldo** — nunca um valor gravado, sempre
calculado e mostrado como barra de progresso com semântica de cor. A tela de Atas é a
mais sofisticada: um único registro de preços compartilhado por vários órgãos, cada um
com seu próprio saldo, com uma função explícita de transferir saldo entre eles. Isso deve
aparecer visualmente através do acordeão de órgãos + badges Gerenciador/Participante, não
apenas em texto.
