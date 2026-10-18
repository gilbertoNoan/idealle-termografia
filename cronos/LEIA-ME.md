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
