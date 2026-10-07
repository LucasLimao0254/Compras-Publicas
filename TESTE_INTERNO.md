# Ambiente de teste interno

Um comando sobe banco, API e frontend com dados de cenário prontos e deixa o sistema
parado na **tela de login**. O ambiente é separado do de desenvolvimento: outro banco,
outras portas. Dá para rodar os dois ao mesmo tempo.

## Ambiente hospedado (um link para os testadores)

O `render.yaml` na raiz publica o sistema no [Render](https://render.com) como **um serviço
só**: tela, API (em `/api`) e arquivos de exemplo (em `/arquivos-teste/`) no mesmo endereço,
mais um banco Postgres. Os testadores só precisam do link.

1. No Render: **New → Blueprint**, conecte o GitHub e escolha o repositório
   `LucasLimao0254/Compras-Publicas` e a branch `claude/gallant-edison-vgapep` (ou a principal,
   depois do merge). Clique em **Apply**. O build leva alguns minutos.
2. Quando o serviço `compras-teste` ficar no ar, copie o endereço dele
   (algo como `https://compras-teste.onrender.com`).
3. Na página do roteiro compartilhado, cole esse endereço no campo **Endereço do sistema** e
   salve. Todos passam a ver o botão **Abrir o sistema de teste** e os links dos arquivos.

Como o ambiente hospedado se comporta:

- Na primeira subida, o serviço cria o banco e aplica o mesmo cenário do ambiente local
  (`api/scripts/iniciar-demo.js`). Reinícios **mantêm** o que os testadores fizeram.
- Para recomeçar do zero, mude a variável `RESETAR_DADOS` do serviço para `true`, reinicie, e
  depois volte para `false`. Senão, cada reinício apaga tudo de novo.
- "Vence hoje" e "venceu ontem" (contratos 004 e 005) valem para o dia em que os dados foram
  criados. Para os casos E2, F1 e H1, recrie os dados no dia do teste.
- No plano gratuito, o serviço dorme depois de um tempo sem uso, e a primeira abertura leva cerca
  de um minuto. O banco gratuito do Render tem prazo de validade: confira no painel.
- As senhas de teste são públicas (`demo123`). Use só os dados fictícios do cenário, nunca
  dados reais.

## Subir na própria máquina

Na raiz do repositório, depois de `npm install`:

```bash
npm run teste:interno              # recria os dados do zero (use antes de cada rodada de testes)
npm run teste:interno -- --manter  # reabre com os dados da última execução
```

Quando aparecer **"Ambiente de teste interno no ar"**, abra **http://localhost:5174/login**.
`Ctrl+C` encerra tudo.

| O quê | Onde |
|---|---|
| Frontend | http://localhost:5174 |
| API | http://localhost:3101 |
| Postgres (embarcado) | 127.0.0.1:55433, banco `compras_teste_interno`, dados em `.pgdata-teste/` |
| Arquivos para upload | `.ambiente-teste/arquivos/` (gerados a cada subida) |
| Uploads feitos durante o teste | `.ambiente-teste/uploads/` |

As portas mudam com `AMBIENTE_TESTE_WEB_PORTA`, `AMBIENTE_TESTE_API_PORTA` e
`AMBIENTE_TESTE_PG_PORTA`. `AMBIENTE_TESTE_PGDATA` muda a pasta de dados do Postgres, o que é
útil quando o processo roda como root, porque o Postgres se recusa a criar a pasta dentro do
repositório; nesse caso use algo em `/tmp`.

## Usuários

Todos com senha **`demo123`**. Município (campo "código") **1**, exceto o último.

| E-mail | Perfil | O que deve ver no menu |
|---|---|---|
| `admin@demo.gov.br` | Administrador (e admin de plataforma) | tudo, inclusive Setores e módulos |
| `compras@demo.gov.br` | Comprador | Visão geral, Licitações, Fornecedores, Atas, Contratos, Painel de ordens |
| `rh@demo.gov.br` | Só gestão de usuários | Usuários (e cai direto nessa tela) |
| `consulta@demo.gov.br` | Só consulta | Visão geral |
| `inativo@demo.gov.br` | Desativado | não entra |
| `admin@camara-demo.gov.br` | Administrador do município **2** (Câmara) | tudo |

## Dados do cenário

- **Licitação 001/2026**: sem homologação. Use-a para testar o upload de planilha. Tem o
  contrato manual **001/2026** (R$ 5.000,00).
- **Licitação 002/2026**: homologação **revisada** com dois fornecedores.
  - *Limpa Tudo*: Detergente (1.000 FR a **R$ 2,3456**, preço com 4 casas de propósito) e
    Sabão (500 UN a R$ 8,90).
  - *Protege EPI*: Luva nitrílica (300 CX a R$ 12,50).
- **ARP 001/2026** (Limpa Tudo): distribui o teto entre Saúde (gerenciador: 600 detergentes
  e 300 sabões) e Educação (400 e 200).
- **Contrato 002/2026**: abate da ata (órgão Saúde), com 300 detergentes e 100 sabões.
  Valor **R$ 1.593,68**, saldo **R$ 1.296,05**. Tem 2 ordens emitidas e 1 rascunho.
- **Contrato 003/2026**: direto da homologação (Protege), com as 300 luvas **totalmente
  consumidas**. Os tetos estão zerados, pronto para aditivo.
- **Contrato 004/2026**: **vence hoje**.
- **Contrato 005/2026**: **venceu ontem**.
- **Licitação 003/2026**: homologação **aguardando revisão**. O fornecedor não está vinculado
  e o item "Feijão" está sem unidade.
- Dotações (Administração e Saúde), a unidade executora *Fundo Municipal de Saúde*, e o
  sequencial de ordens começando em 5.

"Vence hoje" e "venceu ontem" são calculados a partir da data em que o ambiente sobe.

## Roteiro

Cada caso diz o que fazer e o que deve acontecer. Entre colchetes, o grupo do
[PR #1](https://github.com/LucasLimao0254/Compras-Publicas/pull/1) que o caso valida.

### A. Login e perfis

| # | Passos | Resultado esperado |
|---|---|---|
| A1 | Entrar com `inativo@demo.gov.br` | Continua no login, com a mensagem **"Credenciais inválidas"** |
| A2 | Entrar com `admin@demo.gov.br` e uma senha errada | Continua no login com **"Credenciais inválidas"**, não "Sessão expirada" [3] |
| A3 | Entrar com `consulta@demo.gov.br` | Menu só com **Visão geral** |
| A4 | Entrar com `rh@demo.gov.br` | Vai direto para **Usuários**, sem tela de erro |
| A5 | Entrar com `compras@demo.gov.br` e abrir Contratos, Atas e Painel de ordens | As três telas carregam; em "Novo contrato" o seletor de órgão lista as 3 secretarias |
| A6 | Como admin, usar o seletor de município no topo do menu | Troca para a Câmara Municipal Modelo sem pedir senha |

### B. Usuários [1]

| # | Passos | Resultado esperado |
|---|---|---|
| B1 | Como `rh@`, criar um usuário do tipo **Administrador** | Recusado: *"Somente administradores do tenant podem criar um usuário administrador"* |
| B2 | Como `rh@`, editar o Administrador Demo (por exemplo, trocar a senha) | Recusado: *"…podem alterar um usuário administrador"* |
| B3 | Como `rh@`, criar um usuário **Padrão** | Criado normalmente |
| B4 | Como admin, excluir a **Carla Compradora** | Recusado: *"…tem registros no histórico… desative-o em vez disso"* [3] |

### C. Licitações e homologação [2D]

| # | Passos | Resultado esperado |
|---|---|---|
| C1 | Licitação **003/2026**: abrir a homologação e tentar concluir a revisão | Botão bloqueado, com a lista do que falta (fornecedor não vinculado, unidade do feijão) |
| C2 | Vincular o fornecedor (use "cadastrar novo"), preencher a unidade `KG` e concluir | Status **Revisado** |
| C3 | Licitação **001/2026**: enviar `homologacao_exemplo.xlsx` | Status *Pronto para revisão*; Papel A4 com **quantidade 1500** e **valor 21,90**, não 1,5. Caneta a 1,8765 |
| C4 | Revisar e concluir a do C3, depois enviar o mesmo arquivo de novo e concluir essa também | A primeira passa a **"Substituída por reenvio"**; só a última vale |

### D. Atas [2A]

| # | Passos | Resultado esperado |
|---|---|---|
| D1 | Abrir **ARP 001/2026** | Saúde com saldo **R$ 2.483,68 de R$ 4.077,36**; Educação com R$ 2.718,24 de R$ 2.718,24 |
| D2 | Abrir um órgão | Só aparece **"importar da homologação"**; não há "adicionar item" nem "Importar" planilha, porque a ata é vinculada à homologação |
| D3 | Editar um item | Descrição, unidade e valor ficam travados; só a quantidade muda |
| D4 | Remanejar 50 detergentes de Saúde para Educação | Saldos dos órgãos atualizados; o histórico do item mostra o remanejamento |
| D5 | **Nova ata**: antes e depois de escolher a licitação 002/2026, abrir o campo **Detentor principal** | Antes: desabilitado, *"Escolha a licitação primeiro"*. Depois: só **Limpa Tudo** (indisponível, *"já tem ata nesta licitação"*) e **Protege EPI** |
| D7 | **Nova ata**: olhar o campo **Número ARP** vazio; digitar `001/2026`; depois `099/2026`. Repetir em **Novo contrato** com `2/2026` | Vazio, mostra *"Último usado: ARP 001/2026"* (some ao digitar). `001/2026` é apontado como já usado (*"O número ARP 001/2026 já foi usado por outra ata"*) e **Salvar** fica bloqueado; `099/2026` libera. No contrato, `2/2026` é recusado como o **002/2026** |
| D6 | Na lista de atas, **editar** a ARP 001/2026 (ícone de lápis) e depois **excluir** (lixeira); repetir pela tela da ata (botões Editar/Excluir) | A edição salva. A exclusão é recusada: *"Esta ata tem contrato vinculado (002/2026)…"*. Valores unitários dos itens aparecem **sem "R$"** e as quantidades sem ".000" |

### E. Contratos e aditivos [2A, 2B, 3]

| # | Passos | Resultado esperado |
|---|---|---|
| E1 | Lista de contratos | 002/2026 com saldo R$ 1.296,05 de R$ 1.593,68; 003/2026 com R$ 0,00 de R$ 3.750,00 |
| E2 | Detalhe do **004/2026** | "até" com a **data de hoje** (não a de ontem) [3] |
| E3 | Novo contrato: escolher a licitação 002/2026, a **ARP 001/2026** e o órgão Saúde, e importar da homologação | Processo e objeto vêm preenchidos da licitação; o campo **ARP** só lista as ARPs da licitação (mais "Sem ARP — direto da homologação"); escolhida a ARP, o fornecedor é **só a Limpa Tudo**; "Sem ARP" lista só a Protege EPI; a importação pede o órgão antes e mostra o **disponível no órgão** (detergente 300, sabão 200); descrições longas aparecem resumidas, com "ver mais"; sem "adicionar item" nem linhas vazias |
| E4 | **003/2026**, aba Aditivos: aditivo de **Quantidade** +30 luvas | Aceito (R$ 375,00). No item da homologação, o saldo **não fica negativo** |
| E5 | **002/2026**: aditivo de Quantidade | Recusado: *"Ainda há saldo disponível neste contrato (R$ 1.296,05 — o item … tem 249 disponível)"* |
| E6 | **002/2026**: aditivo de **Supressão** | O formulário pede **itens e quantidades**, sem percentual. Suprimir 20 sabões dá −R$ 178,00 e o valor total cai para R$ 1.415,68 |
| E7 | **002/2026**: tentar suprimir mais sabão do que o disponível | Recusado: *"só é possível suprimir até …"* |
| E8 | **001/2026** (contrato manual, com saldo): aditivo de **Valor**. Depois, aditivo de **Prazo** no mesmo contrato | O de valor é recusado: *"Ainda há saldo disponível neste contrato…"*. O de prazo é aceito |
| E9 | Na lista de contratos: **editar** o 005/2026 (lápis) e trocar o objeto; **excluir** o 002/2026; depois excluir o 005/2026. Repetir Editar/Excluir na tela do contrato | Edição salva. 002/2026: recusado, *"Este contrato tem 3 ordens — não pode ser excluído…"*. 005/2026 (sem ordens) some da lista. Como `compras@`, a lixeira não aparece (só o admin exclui) |

### F. Ordens [2C, 3]

| # | Passos | Resultado esperado |
|---|---|---|
| F1 | Como `compras@`, emitir ordem contra o **004/2026** (vence hoje) | Emitida [3] |
| F2 | Como `compras@`, emitir ordem contra o **005/2026** (vencido) | Recusada: *"Contrato vencido…"* |
| F3 | Como `compras@`, abrir o menu de uma ordem **emitida** | Sem "Editar"/"Excluir"; só o admin tem essas opções [3] |
| F4 | Como `compras@`, emitir o **rascunho** do 002/2026 | Emitido com o próximo número da sequência |
| F5 | "Ver histórico" de uma ordem | Mostra pelo menos o cadastro e a emissão |
| F6 | Emitir em duas abas ao mesmo tempo | Números diferentes, sem erro [2C] |

### G. Configurações e minutas [2C, 3]

| # | Passos | Resultado esperado |
|---|---|---|
| G1 | Como admin, pôr o **sequencial da próxima ordem** abaixo do último emitido | Recusado: *"precisa ser maior que o último já emitido"* |
| G2 | Enviar os 4 `modelo_*.docx` de `.ambiente-teste/arquivos/` | Indicador **"4 de 4 tipos com modelo"** |
| G3 | No **004/2026**, aba Minutas, gerar o contrato | O .docx sai com todos os campos preenchidos, inclusive "CONTRATO Nº 004/2026". Esse marcador está quebrado em dois trechos no modelo, como o Word faz. Valor total R$ 450,00 |
| G4 | Em Configurações → Contrato, **Adicionar modelo** duas vezes com `modelo_CONTRATO.docx`: "Contrato — dispensa" marcando *Dispensa* e "Contrato — pregão" marcando *Pregão eletrônico*. Depois, no **002/2026** (pregão eletrônico), aba Minutas | Os dois modelos aparecem com suas modalidades. No contrato, o seletor vem com **"Contrato — pregão (sugerido)"** e a frase *"licitação por pregão eletrônico"*; trocar para o de dispensa e gerar baixa o .docx |

### H. Visão geral

| # | Passos | Resultado esperado |
|---|---|---|
| H1 | Como admin, abrir Visão geral | Cartões de situação: o 005/2026 aparece em **Vencidos** e o 004/2026 **não** |
| H2 | Clicar em cada número da Visão geral: **Vencendo em 30 dias**, **Vencidos**, **Contratos ativos**, **Ordens emitidas**, a legenda da pizza e um nome em **Top fornecedores** | Cada um abre a tela já filtrada: Contratos com o filtro de situação correspondente (a lista tem o mesmo número de linhas do cartão), Painel de ordens na aba Emitido, e a página do fornecedor |

## Arquivos de exemplo (`.ambiente-teste/arquivos/`)

| Arquivo | Para quê |
|---|---|
| `homologacao_exemplo.xlsx` | Upload de homologação (C3). Números com separador de milhar |
| `itens_ata_exemplo.xlsx` | Importar itens numa ata **sem** homologação |
| `demanda_exemplo.xlsx` | Planilha de demanda (Número do item + Quantidade) |
| `modelo_CONTRATO.docx`, `modelo_ARP.docx`, `modelo_ADITIVO.docx`, `modelo_APOSTILAMENTO.docx` | Modelos de minuta (G2) |

## Como os dados são montados

`api/scripts/ambiente-teste.js` recria o banco a partir do `schema.ts` e roda o seed base
(`api/src/db/seed.ts`) mais o cenário (`api/src/db/seed-teste.ts`). O cenário cria atas,
contratos, ordens e aditivos pelos **próprios services**, então os dados passam pelas mesmas
validações da interface. O `seed-teste.ts` se recusa a rodar num banco cujo nome não contenha
"teste", para não sujar o banco de desenvolvimento.
