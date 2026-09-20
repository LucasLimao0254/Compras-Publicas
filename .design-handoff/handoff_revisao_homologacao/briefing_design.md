# Briefing: tela de revisão dos itens da homologação

Cole este texto inteiro como pedido ao criar o artifact tipo Design. Ele descreve uma
única tela (um modal), já funcional no produto, que nunca recebeu um passe de design de
verdade — ao contrário do resto do app, que já segue o sistema Nocturne (ver
`.design-handoff/design_handoff_compras_publicas/`). Não é uma tela nova: é redesenhar o
comportamento abaixo dentro da identidade visual já adotada.

## Produto e contexto

"Compras Públicas" — sistema de gestão de licitações, contratos, atas de registro de
preços e ordens de compra para prefeituras. Esta tela específica é o **checkpoint humano**
entre a extração automática de uma planilha de homologação (upload → parser determinístico
no backend, sem IA) e o momento em que aquela informação vira **teto fixo, permanente**
para o abatimento em cascata (Homologação → Ata → Contrato → Ordem). Uma vez que o usuário
clica "Concluir revisão", os valores não podem mais ser editados — é a única tela do
sistema em que um erro de digitação vira uma restrição de negócio que não se desfaz.

Público: servidor municipal de compras, não desenvolvedor. Tarefa: conferir célula a
célula o que uma planilha do sistema de pregão gerou automaticamente, corrigir o que
faltou, vincular cada fornecedor extraído a um fornecedor já cadastrado (ou cadastrar um
novo sem sair da tela) e só então liberar para uso.

## Identidade visual — usar a já existente (Nocturne, escura)

Este produto **já tem** um sistema de design implementado (`web/src/index.css`) — não é
para propor um novo. Tokens principais:
- Fundo `#161826`, superfície de card/modal `#232532`, texto `#e9e9ed`
- Acento único, um roxo-azulado `#9184d9` (rampa `--color-accent-100…900`)
- Semânticas separadas do acento: sucesso `#5fae7a`, alerta `#d1a355`, crítico `#d17d72`
  (cada uma com uma cor "tint" mais escura para fundo de badge)
- Tipografia: Inter, títulos nunca passam de peso 500
- Botões **contornados**, nunca preenchidos (`.btn-primary` = borda na cor do acento)
- Raio de borda base 8px, cards maiores em 14px
- `.dialog` já existe como padrão de modal (fundo `--color-surface`, sombra em camadas)

Reaproveite os componentes já descritos no handoff Nocturne original
(`.design-handoff/design_handoff_compras_publicas/_ds_nocturne/`) sempre que a tela
precisar de algo que já existe ali (tabelas, tags, campos de formulário) — o objetivo é
esta tela parecer que sempre fez parte do mesmo produto, não um anexo.

## O que a tela precisa fazer (comportamento, não é opcional)

A tela é um modal aberto a partir da lista de Licitações, ao clicar num documento de
homologação com status "Pronto para revisão" ou "Revisado". Ela mostra, para um único
documento de homologação:

- Um ou mais **fornecedores extraídos** da planilha, cada um precisando de:
  - Nome e CNPJ como vieram da extração (editáveis — a extração pode ter erros de OCR/
    parsing da planilha original)
  - Um vínculo obrigatório a um fornecedor **já cadastrado** no sistema, OU a opção de
    cadastrar um fornecedor novo sem sair da tela (CNPJ + razão social)
- Para cada fornecedor, a **lista de itens** que a planilha atribuiu a ele: número do
  item, descrição, unidade, quantidade, valor unitário — todos editáveis célula a célula,
  todos podendo ter chegado vazios da extração
- Um indicador, por item, de **quão confiável a extração automática considera aquele
  item** (alta/média/baixa confiança — hoje esse dado existe no backend mas não é
  mostrado) — a ideia é que o olho do revisor vá primeiro para o que a extração não tinha
  certeza, não que ele precise reconferir tudo com o mesmo peso
- Um botão final "Concluir revisão", que só fica disponível quando **todo** fornecedor
  está vinculado e **todo** item está completo — e que precisa comunicar visualmente que
  é uma ação **sem volta** (teto fixado a partir daqui), diferente de qualquer outro botão
  "salvar" do resto do sistema

## Problemas específicos da versão atual a resolver no design

A versão implementada hoje é puramente funcional (inputs de HTML puro, sem hierarquia
visual real) — o design deve resolver, especificamente:

1. **Não dá pra saber o que falta de relance.** Hoje só existe uma borda âmbar em cada
   campo vazio, sem contagem, sem lista do que falta. O design deve dar ao revisor um
   resumo de progresso claro (quantos fornecedores faltam vincular, quantos itens faltam
   completar) — não apenas manchas de cor espalhadas pela grade.
2. **Ação principal não é fixa.** Em homologações com muitos itens, o botão "Concluir
   revisão" some ao rolar a tela. Ele precisa ficar sempre acessível.
3. **Confiança da extração é invisível.** O dado de confiança por item (alta/média/baixa)
   já existe e não aparece — o design deve dar destaque visual aos itens de confiança
   baixa.
4. **Feedback de salvamento é genérico.** Hoje um erro de salvar qualquer campo aparece
   como uma linha de texto solta no rodapé do modal, sem dizer qual campo falhou. O
   feedback (salvando / salvo / erro) deveria estar junto do campo específico.
5. **A irreversibilidade da ação final não é comunicada.** "Concluir revisão" hoje é um
   botão igual a qualquer outro botão de salvar do sistema, mas o efeito é permanente
   (vira teto fixo de saldo). Vale considerar uma etapa de confirmação/resumo antes de
   confirmar, algo que hoje não existe.

## Fora do escopo deste briefing

- A tela que **consome** esses dados depois (importar itens revisados para uma Ata ou
  Contrato) é outro componente, mais simples (lista com checkbox, somente leitura), e já
  está adequada — não faz parte deste pedido.
- Não é para desenhar a tela de upload/lista de licitações em volta deste modal — só o
  modal de revisão em si.
