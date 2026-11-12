# Gestão de Obra · Idealle

Página única (`obras/index.html`, sem build), publicada junto com a Termografia em `/obras/`.
Abre com o login do CRONOS (trava `gestao-obras`); quem não tem o sistema liberado no painel não entra.

## De onde vem a obra
Toda OS de engenharia civil do Finanças (`ordens` com `servicos.civil == true`) aparece em **Aguardando início**.
A proposta civil guarda `obra` (área, equipe, etapas com atividade e dias), que vai para a OS na aprovação.
**Iniciar gestão da obra** cria `obras/<id da OS>` com as etapas encadeadas a partir da data de início.
No Finanças, o botão **Gestão de Obra** da OS abre direto nela (`/obras/?cronos_os=<id>`).

## Abas
- **Resumo**: avanço físico (média das etapas, peso = dias ou peso informado), previsto para hoje, prazo,
  curva de avanço previsto × realizado, etapas em andamento, último RDO, situação da obra e portal do cliente.
  Ao marcar **Concluída**, pergunta se conclui também a OS no Finanças.
- **Cronograma**: Gantt previsto × realizado, editar etapa (datas, dias, peso, avanço, datas reais), encadear datas, imprimir.
- **Diário de obra (RDO)**: data, horário, clima, condição, equipe por função, atividades, avanço das etapas
  (atualiza o cronograma), equipamentos, ocorrências e fotos (reduzidas no celular antes de enviar). PDF do RDO.
- **Materiais**: pedidos de material (quantidade, etapa, data em que precisa chegar, fornecedor) com situação
  Solicitado → Comprado → Entregue; atrasado em vermelho. Fica em `obras/<id>.materiais` (sem valores).
- **Segurança & Qualidade**: checklists de segurança (NR-18/NR-35) e de qualidade com C/NC/NA; cada NC tem
  o problema, quem resolve e o prazo, e fica em "Não conformidades a resolver" até alguém clicar em Resolver
  (pede o que foi feito). PDF do checklist com campos de assinatura. Fica em `obras/<id>.inspecoes`.
- O **Resumo** avisa no topo quando há material atrasado ou não conformidade em aberto.
- **Medições** (só sócios): boletins pelo avanço acumulado × valor do contrato, PDF do boletim. Medição
  aprovada aparece no Finanças em **Faturar parte** da OS; ao faturar, fica *Faturada* com o nº da nota.
  **Aditivos de contrato** (valor e prazo extra) ficam em `obras_financeiro/<id>.aditivos` e somam no valor do contrato.
- **Custos** (só sócios): orçado (da memória de cálculo da proposta, sem BDI/impostos) × realizado.
  **Lançar custo** cria a despesa no Finanças (`lancamentos` com `osId`, `obraCategoria`, `origem: 'Gestão de Obra'`);
  despesas ligadas à OS lançadas no Finanças também entram na conta.

## Banco (projeto idealle-termografia)
| Coleção | O que guarda | Quem |
| --- | --- | --- |
| `obras/<osId>` | etapas, histórico do avanço, situação, `portal` | equipe |
| `obras_rdo` | diários (`obraId`, `numero`, miniaturas das fotos) | equipe |
| `obras_fotos` | foto inteira de cada RDO (`dataUrl`) | equipe |
| `obras_financeiro/<osId>` | `valorContrato`, `orcado`, `medicoes` | sócios |
| `portal_obras/<empresaId>` | `obras.<osId>`: avanço, cronograma e RDOs liberados ao cliente | cliente lê |
| `portal_obras_fotos/<fotoId>` | fotos desses RDOs (com `empresaId`) | cliente lê |

Na OS: `resultados['Gestão de Obra']` (avanço, situação, nº de RDOs, link) e `status: execucao/concluida`.
Regras em `painel-central/firestore.rules` (publicar no Firebase Console › Firestore › Regras).

## Portal do Cliente
Com **Cliente acompanha pelo Portal** ligado, a obra é publicada sozinha a cada RDO e mudança no cronograma
(só os RDOs marcados "Mostrar ao cliente"; sem valores nem custos). No portal, o cartão **Obra** fica contratado
e abre o acompanhamento: avanço, cronograma e diários com fotos.

## Testar sem banco
`/obras/?demo=1` (ou o botão na tela de entrada): dados de exemplo só no navegador.
