# Assinatura digital dos documentos do Portal do Cliente

Relatórios NR-13, certificados de calibração, laudos de SPDA e PDFs antigos enviados ao Portal do Cliente saem
**assinados digitalmente** (PAdES, `ETSI.CAdES.detached`, SHA-256) com o certificado A1 (ICP-Brasil) da IDEALLE,
na hora em que são liberados. Não há passo manual.

## Como funciona

1. O sistema gera o PDF como sempre.
2. No navegador, `assinatura/assinar-pdf.js` (ou `assinaturaDigital.ts` no NR-13 e no Gerador de Certificados)
   põe o selo verde no rodapé ("Documento assinado digitalmente por ... Confira em validar.iti.gov.br") e reserva
   o espaço da assinatura.
3. Só o resumo SHA-256 do PDF vai para `/api/assinatura` (Vercel deste repositório). Lá o certificado monta a
   assinatura (CMS/CAdES-BES com signing-certificate-v2) e devolve. O PDF não passa pelo servidor (sem limite de tamanho)
   e o certificado nunca sai da Vercel.
4. O PDF assinado vai para `portal_laudos_partes`, e o item em `portal_laudos` ganha `assinado: { titular, em }`;
   o portal mostra o selo "Assinado".

Se a assinatura não estiver configurada (ou o login não tiver permissão), tudo funciona como antes: o PDF vai
como "cópia para consulta" e o aviso final diz o motivo.

## Configurar (uma vez, e de novo quando o certificado for renovado)

Vercel → projeto **idealle-termografia** → Settings → Environment Variables (ambiente Production):

| Variável | Valor |
|---|---|
| `ASSINATURA_PFX` | o arquivo `.pfx` em base64 (uma linha) |
| `ASSINATURA_SENHA` | a senha do certificado |
| `ASSINATURA_PERMITIDOS` | opcional: logins que podem assinar, separados por vírgula. Vazia = usa `EMAIL_PERMITIDOS` |
| `ASSINATURA_ORIGENS` | opcional: outro endereço de sistema que precise assinar (os do NR-13, Certificados, PMTA e Calculadora já estão liberados) |

Para gerar o base64 no Windows (PowerShell), já copiando para a área de transferência:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\certificado.pfx")) | Set-Clipboard
```

Depois de salvar as variáveis: Deployments → último deploy → Redeploy.

Conferir: com o login do sistema, abrir `https://idealle-termografia.vercel.app/api/assinatura` não funciona direto
(precisa do token); o jeito simples é enviar um documento ao portal e ver o aviso "Assinados digitalmente por ...".
Para conferir a assinatura: baixar o PDF no portal e abrir em https://validar.iti.gov.br ou no Adobe Reader.

## Código

- `api/assinatura.js`: função da Vercel (GET = situação do certificado; POST `{ resumo }` = assinatura).
- `api/_assinatura/fonte.js`: leitura do .pfx e montagem da assinatura (node-forge). A Vercel usa o arquivo
  empacotado `api/_assinatura/assinador.js` (o projeto não roda `npm install`). Para gerar de novo:
  `npm i --no-save node-forge@1.3.1 esbuild@0.24.0 && npx esbuild api/_assinatura/fonte.js --bundle --platform=node --target=node18 --minify --legal-comments=eof --outfile=api/_assinatura/assinador.js`
- `api/_assinatura/teste.js`: teste de ponta a ponta com um certificado de teste
  (`node api/_assinatura/teste.js teste.pfx senha [pdf...]`, precisa de `pdf-lib` instalado).
- `assinatura/assinar-pdf.js`: parte do navegador (SPDA e Gestão financeira; os outros sistemas têm a cópia em TypeScript).
