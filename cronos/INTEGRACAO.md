# Como um sistema técnico se liga ao Cronos

O Cronos é o cadastro único (clientes, propostas, OS, faturamento). Cada sistema técnico é aberto a partir de uma OS e devolve o resultado para ela, no mesmo Firebase (projeto `idealle-termografia`).

## 1. Abrir a partir da OS

O Cronos abre o sistema com o id do documento em `ordens` (`?os=<id>` na Termografia, `?cronos_os=<id>` nos demais). O sistema lê `ordens/<id>` e, dela, o cliente em `empresas/<empresaId>` (código `CLI-0001`, nome, CNPJ, contato). Nada de digitar o cliente de novo.

O endereço de cada sistema fica em `SISTEMAS` no `cronos/index.html`. Quem já está integrado entra em `INTEGRADOS`.

## 2. Devolver o resultado

O sistema grava, com `set(..., { merge: true })`, no próprio documento da OS:

```js
resultados: {
  '<Nome do sistema>': {
    qtdLaudos: 12,              // ou quantos documentos gerou
    resumo: 'texto curto',      // opcional: conclusão, PMTA calculada, nº do certificado...
    link: 'https://...',        // opcional: onde abrir o laudo
    atualizadoEm: '2026-10-18T20:00:00Z'
  }
}
```

E pode mudar `status`: `execucao` quando começa o trabalho e `concluida` (com `dataConclusao`) quando termina. A OS concluída aparece no Cronos pronta para faturar. Nunca grave sem `merge: true`, para não apagar os campos do Cronos.

## 2.1 Serviços da OS e pendências por TAG

Na OS se marcam os serviços contratados, em `servicos: { relatorio, prontuario, pmta, calibracao, desenquadramento, termografia }` (true/false). A proposta também tem essas caixas ("Marcar pelos itens da proposta" marca pelo texto dos itens; se nenhuma estiver marcada, isso é feito sozinho ao salvar e ao aprovar) e, quando aprovada, passa os serviços para a OS que cria.

Cada serviço tem o seu sistema, e a OS aberta ou em execução aparece lá na lista "A fazer" (consulta `servicos.<chave> == true` e `status in [aberta, execucao]`):

| Serviço | Chave | Sistema |
| --- | --- | --- |
| Relatório NR-13 | `relatorio` | Relatório NR-13 |
| Abertura de prontuário (com PMTA) | `prontuario` | Relatório NR-13 e PMTA Calc |
| Cálculo de PMTA | `pmta` | PMTA Calc |
| Certificado de calibração | `calibracao` | Gerador de Certificados |
| Desenquadramento | `desenquadramento` | Calculadora NR-13 |
| Termografia | `termografia` | Termografia |

Trabalho feito num sistema para uma OS que não tinha o serviço marcado também conta: ao gravar `resultados[<sistema>]`, o sistema marca o serviço dele na OS (`servicos.<chave> = true`, com updateMask só nesse campo). Assim dá para acrescentar serviço pela própria execução.

Com isso o Cronos e o Relatório NR-13 mostram o que falta em cada TAG, sem marcação à mão:

- O Relatório NR-13 manda em `resultados["Relatório NR-13"].vasos` um item por vaso: `tag`, `laudo` (etapa), `laudoPronto`, `prontuario` (`abertura`, `periodica` ou `nenhum`), `faltaProntuario` (campos vazios), `pmta` (`ok`, `pendente` ou `nao_exige`), `manometro` e `valvula` (`exige`, `tags`, `numeros`, e `quantidade` na válvula). TAGs e números vão em maiúsculas, só letras e números.
- O Gerador de Certificados manda em `resultados["Gerador de Certificados"].itens` um item por certificado: `tag`, `numero` e `tipo` (`manometer` ou `valve`).
- A Calculadora NR-13 manda em `resultados["Calculadora NR-13"].itens` um item por avaliação de desenquadramento (P·V): `tag`, `enquadrado` (true quando o vaso entra na NR-13), `pv` e `data`. O Cronos põe o desenquadramento na linha da TAG (ou numa linha própria, se o vaso não tem laudo NR-13) e, com o serviço marcado e nenhuma avaliação, mostra a pendência.
- Os laudos de desenquadramento entram no ZIP da OS do Relatório NR-13 ("Incluir desenquadramento" no Baixar OS): o NR-13 abre a calculadora com `?nr13_desenq=<código da OS>` e as janelas trocam os PDFs por postMessage (`idealle-desenq:pronto/pedido/pdfs`), sem passar pelo banco.
- O certificado é do manômetro (ou da válvula) do vaso quando a TAG dele é a do instrumento no laudo, quando o número é o que o laudo anotou, ou quando foi emitido com a TAG do próprio vaso e o tipo certo. A conta está em `pendenciasVaso` (aqui) e em `src/services/pendencias.ts` (Relatório NR-13).

## 3. Cadastro único de clientes

Os clientes ficam em `empresas` do Cronos. Ao abrir, cada sistema lê essa coleção inteira e:
- cadastra aqui os clientes do Cronos que faltam (anotando o código `CLI-0001`);
- cria em `empresas` os clientes que só existem no sistema, com `origem: '<Nome do sistema>'` e sem código (o Cronos mostra o aviso "Gerar códigos");
- completa os campos vazios dos dois lados (CNPJ, endereço, cidade, UF, CEP, telefone, e-mail, contato), sem sobrescrever nada preenchido.

O cliente é o mesmo quando tem o mesmo CNPJ ou o mesmo nome, ignorando acento, pontuação e Ltda/ME/EPP/S.A. Os clientes de exemplo que vêm com cada sistema não vão para o Cronos. A Termografia já usa a própria coleção `empresas`. A Calculadora NR-13 não tem cadastro de clientes: ela só sugere os nomes do Cronos no campo Cliente.

### 3.1 Clientes repetidos

Em Clientes, o Cronos avisa quando o mesmo cliente está cadastrado mais de uma vez (mesmo CNPJ, ou mesmo nome sem acento, pontuação e Ltda/S.A./ME; mesmo nome com CNPJs diferentes são unidades diferentes e não se juntam). Em "Revisar e unificar" escolhe-se qual cadastro fica: propostas, OS, faturas, lançamentos e os laudos da Termografia (`pontos.cliente`) passam para ele, os campos vazios são completados, os outros são apagados e os nomes/CNPJs antigos ficam em `empresas/<id>.unificados` (`[{ id, nome, cnpj, codigo, em }]`). Antes de gravar, o Cronos baixa uma cópia `.json` do que muda.

`sincronizarClientes` dos outros sistemas lê `unificados` (nome ou CNPJ antigo leva ao cliente que ficou, sem recriar o antigo no Cronos) e devolve `unificar: [{ fica, saem }]` com os clientes locais que são o mesmo. NR-13 (`juntarEmpresas`), PMTA Calc e Gerador de Certificados perguntam e juntam: o vínculo dos laudos/certificados passa para o que fica.

## Situação

| Sistema | Integrado |
| --- | --- |
| Termografia | Sim: abre na OS, grava `resultados.Termografia` (laudos por nível) e conclui a OS |
| Relatório NR-13 | Sim: lê OS e cliente pela API do Firestore, cria empresa/OS locais (`cronosOsId`), grava `resultados["Relatório NR-13"]` (laudos, pareceres, TAGs) e conclui a OS quando ela é concluída lá |
| PMTA Calc, Calculadora NR-13, Gerador de Certificados | Sim: abrem o novo cálculo/avaliação/certificado com cliente e OS; acham a OS do Cronos pelo código (ID-0042/2026, consulta `codigo ==`) e gravam `resultados[<sistema>]` quando os laudos mudam |
