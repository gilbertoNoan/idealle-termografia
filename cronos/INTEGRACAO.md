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

## 3. Cadastro único de clientes

Os clientes ficam em `empresas` do Cronos. Ao abrir, cada sistema lê essa coleção inteira e:
- cadastra aqui os clientes do Cronos que faltam (anotando o código `CLI-0001`);
- cria em `empresas` os clientes que só existem no sistema, com `origem: '<Nome do sistema>'` e sem código (o Cronos mostra o aviso "Gerar códigos");
- completa os campos vazios dos dois lados (CNPJ, endereço, cidade, UF, CEP, telefone, e-mail, contato), sem sobrescrever nada preenchido.

O cliente é o mesmo quando tem o mesmo CNPJ ou o mesmo nome, ignorando acento, pontuação e Ltda/ME/EPP/S.A. Os clientes de exemplo que vêm com cada sistema não vão para o Cronos. A Termografia já usa a própria coleção `empresas`. A Calculadora NR-13 não tem cadastro de clientes: ela só sugere os nomes do Cronos no campo Cliente.

## Situação

| Sistema | Integrado |
| --- | --- |
| Termografia | Sim: abre na OS, grava `resultados.Termografia` (laudos por nível) e conclui a OS |
| Relatório NR-13 | Sim: lê OS e cliente pela API do Firestore, cria empresa/OS locais (`cronosOsId`), grava `resultados["Relatório NR-13"]` (laudos, pareceres, TAGs) e conclui a OS quando ela é concluída lá |
| PMTA Calc, Calculadora NR-13, Gerador de Certificados | Sim: abrem o novo cálculo/avaliação/certificado com cliente e OS; acham a OS do Cronos pelo código (ID-0042/2026, consulta `codigo ==`) e gravam `resultados[<sistema>]` quando os laudos mudam |
