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
