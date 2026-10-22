# Cronos · Ideal LESP

Sistema de gestão em ciclo fechado: **Cliente → Proposta → OS → Execução → Faturamento → Recebimento**.

Um único arquivo (`index.html`), sem build. Publica na Vercel igual à Termografia.

## Integração com a Termografia
O Cronos usa **o mesmo banco Firebase** da Termografia:
- Clientes ficam na coleção `empresas` (a mesma da Termografia). Cadastrou no Cronos, aparece lá.
- OS ficam na coleção `ordens` (a mesma). Aprovou uma proposta no Cronos, a OS já aparece na Termografia para lançar os laudos.
- Coleções novas, só do Cronos: `propostas` e `faturas`.

## Ativar o login (uma vez, ~2 minutos)
1. console.firebase.google.com → projeto **idealle-termografia**
2. Menu **Authentication** → **Vamos começar** → aba **Método de login** → **E-mail/senha** → Ativar → Salvar
3. Aba **Usuários** → **Adicionar usuário** → seu e-mail e uma senha (repita para cada pessoa da equipe)

### Entrar com conta Google
1. Mesma aba **Método de login** → **Adicionar novo provedor** → **Google** → Ativar → escolha o e-mail de suporte → Salvar.
2. Aba **Settings** → **Domínios autorizados**: confira se o endereço do site está na lista (o domínio do Vercel e, se usar, o seu próprio domínio). Sem isso aparece "endereço não autorizado".
3. Por padrão qualquer conta Google entra. Para limitar, preencha `ACESSO_GOOGLE` no início do script do `cronos/index.html`, por exemplo `['@ideallesp.com.br', 'seuemail@gmail.com']`.

Antes disso, use o botão **Testar sem banco** na tela de entrada: os dados ficam só no navegador.

## Fluxo
1. **Clientes**: cadastro único com código (CLI-0001…). Clientes antigos da Termografia ganham código pelo botão "Gerar códigos".
2. **Propostas**: itens e valores, imprimir/PDF, marcar enviada, aprovada ou recusada.
3. **Aprovada → gera a OS** automaticamente.
4. **OS**: iniciar execução, concluir, faturar.
5. **Faturamento**: vencimento, NF, marcar recebido.
6. **Painel**: funil inteiro e o que precisa de atenção (vencidos, atrasos, a faturar).

## Importar as planilhas antigas
No Painel, botão **Importar planilhas antigas** → escolha o arquivo `importacao-idealle.json`
(gerado a partir de `Corporativo Idealle 1/Operacional/Planilha de controle de OS Emitidas.xls`,
`Finanças/Notas Fiscais Emitidas/Planilha de Notas Fiscais Emitidas.xls` e `Contatos/Lista de Contatos  Clientes.ods`).
O Cronos mostra um resumo para conferir antes de gravar. Rodar de novo não duplica nada.
O arquivo tem dados de clientes: não coloque no GitHub.

## Modelos de proposta
Menu **Modelos**: textos e itens com preço prontos por tipo de serviço (NR-13 periódica, reconstituição
de prontuário, calibração, tubulação de gás, tanque de combustível, termografia). Os modelos da Idealle
entram pela mesma importação (`importacao-idealle.json` ou só `modelos-idealle.json`) e ficam na coleção
`modelos` do Firestore; os preços não ficam no GitHub. Cada modelo mostra a faixa de valores que a Idealle
já cobrou naquele tipo de serviço.

- **Nova proposta → Começar de um modelo** preenche título, itens, objetivo, escopo, fornecimentos, prazo
  e condições; tudo pode ser ajustado antes de salvar.
- **Imprimir / PDF** gera a proposta no padrão Idealle (seções 1 a 10, valor por extenso, dados de
  faturamento e assinaturas).
- **Salvar como modelo** numa proposta transforma ela em modelo novo.
- Reimportar não sobrescreve modelos já importados (para não desfazer ajustes feitos no Cronos).

## Financeiro
Menu **Financeiro**: a saúde da empresa no estilo da planilha de controle financeiro, ligada ao resto do Cronos.

- **Ligado ao faturamento**: toda fatura gerada a partir de uma OS já aparece em *Contas a receber*. Ao clicar
  em *Recebido* (no Faturamento ou no Financeiro) escolhe-se a data e o banco onde o dinheiro entrou.
- **Contas a pagar**: despesas com categoria, fornecedor, vencimento e banco. Pode ser parcelada (divide o valor)
  ou repetir todo mês. Uma despesa pode ser ligada a uma OS, para ver quanto sobrou em cada serviço.
- **Extrato**: entradas e saídas por banco e o saldo dia a dia, para conferir com o extrato do banco.
  Transferências entre bancos não contam como receita nem gasto.
- **Fluxo de caixa** (mês a mês, com o previsto), **DRE** (receita, deduções, custos, margem de contribuição,
  despesas fixas, lucro), **Metas** (previsto x realizado por categoria) e **Relatórios** (por cliente,
  fornecedor, categoria e resultado por OS).
- **Faturamento**: mensal, trimestral, semestral ou anual, comparando até 10 anos, por data da nota ou do
  recebimento, de todos os clientes ou de um só. O botão *Imprimir / PDF* gera o relatório.
- **Impostos**: estimativa do DAS do Simples Nacional de cada mês (receita dos últimos 12 meses, Fator R,
  Anexo III ou V, alíquota efetiva) e botão para lançar o DAS em Contas a pagar. Cada nota entra no anexo do seu
  código de serviço: 14.xx (calibração, manutenção) e 08.xx (treinamento) sempre no Anexo III; 17.08, 07.01 e
  notas sem código pelo Fator R (sem código, o Cronos deduz pela descrição). Em *Configurar regime* dá para
  fixar o anexo ou usar um percentual fixo. É estimativa para planejar; a guia oficial vem do PGDAS.
- **Bancos nos recebimentos**: ao receber, o Cronos sugere o banco que aquele cliente usou da última vez.
  Em Relatórios aparece quanto entrou e saiu por banco.
- **Bancos e categorias**: bancos com o saldo de partida e o plano de contas (o mesmo da planilha). O saldo de cada
  banco é o saldo informado no início de um dia mais tudo o que entrou e saiu dali em diante. Para acertar com o
  banco, clique em *Atualizar saldo* e digite o saldo do extrato.

Coleções novas no Firestore: `contas` (bancos), `lancamentos` (despesas, outras receitas e transferências) e
`config/financas` (plano de contas e metas). As faturas ganham `contaId`, `grupo` e `categoria`.

### Trazer a planilha financeira
`importacao/financas.py <planilha.xlsm>` lê a *Planilha de Controle Financeiro Empresarial* e acrescenta o bloco
`financas` ao `importacao-idealle.json` (rode depois do `build.py`). Na importação: bancos e saldo inicial, contas
a pagar (pagas e em aberto) e, das contas a receber, o que bate com uma nota fiscal marca a nota como recebida
com a data e o banco reais. O arquivo tem valores da empresa: não coloque no GitHub.

## Memória de cálculo da proposta
Na proposta, a seção **Memória de cálculo** faz a mesma conta da planilha de cálculo de orçamentos da Idealle
(abas Inicial e Planilha): tipo de serviço (preenche lucro, administração, ferramental e encargos), impostos,
mão de obra R/D, materiais, apoio (ART), deslocamento e diárias, coordenação, BDI e preço final calculado e definitivo.

- Fica gravada na proposta (campo `calculo`) e é só interna: o PDF do cliente não mostra.
- **Usar este preço nos itens** reparte o preço final entre os itens, na proporção que eles já têm.
- **Imprimir / PDF** sai só com o valor global; **PDF com valor por item** é para quando o cliente pede.
- **Memória de cálculo** (na proposta salva) imprime a planilha da proposta para arquivo interno.
- Duplicar e Salvar como modelo levam o cálculo junto.


## Nota fiscal (GissOnline / Emissor Nacional)
Botão **Emitir nota fiscal** no topo do Faturamento e das OS (escolhe a OS), ou **Preparar nota fiscal** dentro da OS (aberta, em execução, concluída ou faturada sem número de nota). No Faturamento, **Preparar NF** nas faturas ainda sem número.
A tela monta tudo o que se digita no GissOnline, com um botão **Copiar** em cada campo:

- **Tomador**: CNPJ (copia só os números), razão social e e-mail, da última nota do cliente ou do cadastro.
- **Serviço**: código de tributação nacional, código municipal e NBS, escolhidos pela nota anterior do mesmo cliente
  com o mesmo tipo de serviço (calibração 14.01, inspeção/laudo 17.08, engenharia 07.01, treinamento 08.02).
  Dá para trocar na lista. Local da prestação vem da última nota do cliente.
- **Descrição**: o texto que o cliente já recebeu na nota anterior, o nº do pedido e os dados de pagamento com o
  prazo da proposta (15/30/60/90 dias). O texto de pagamento fica em `config/nota` e pode ser editado na própria tela.
- **Depois de emitir**: digite o número da nota e o código de verificação. O Cronos cria a fatura com os dados da nota
  (e a OS fica faturada); a próxima nota daquele cliente já sai com esses códigos.

A partir de 1º/11/2026 as empresas do Simples Nacional de Guarulhos emitem no Emissor Nacional (nfse.gov.br). Os campos
são os mesmos; a tela tem os dois links. Os códigos das notas antigas entram pelo arquivo de complemento
(`complemento-idealle.json`, Painel › Importar planilhas antigas), que só preenche campos vazios.
