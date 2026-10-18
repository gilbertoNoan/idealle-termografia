# Como um sistema técnico se liga ao Cronos

O Cronos é o cadastro único (clientes, propostas, OS, faturamento). Cada sistema técnico é aberto a partir de uma OS e devolve o resultado para ela, no mesmo Firebase (projeto `idealle-termografia`).

## 1. Abrir a partir da OS

O Cronos abre o sistema com `?os=<id do documento em ordens>`. O sistema lê `ordens/<id>` e, dela, o cliente em `empresas/<empresaId>` (código `CLI-0001`, nome, CNPJ, contato). Nada de digitar o cliente de novo.

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

## Situação

| Sistema | Integrado |
| --- | --- |
| Termografia | Sim: abre na OS, grava `resultados.Termografia` (laudos por nível) e conclui a OS |
| Relatório NR-13, PMTA Calc, Calculadora NR-13, Gerador de Certificados | Ainda não: o Cronos só abre o site. Falta acesso aos repositórios |
