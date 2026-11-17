// Teste de ponta a ponta da assinatura: node api/_assinatura/teste.js <certificado.pfx> <senha> [pdf...]
// Usa um login do Firebase de mentira (chave gerada aqui) e o mesmo código que o navegador usa.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const [pfx, senha, ...pdfs] = process.argv.slice(2);
if (!pfx) { console.log('uso: node api/_assinatura/teste.js <certificado.pfx> <senha> [pdf...]'); process.exit(1); }

const { handler } = require('../assinatura.js')._teste;
const { conferirAssinatura } = require('./assinador.js');

// login de mentira: chave RSA própria e "certificados do Google" trocados no teste
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function token(email) {
  const agora = Math.floor(Date.now() / 1000);
  const cab = b64u({ alg: 'RS256', kid: 'k1' }), dados = b64u({ aud: 'idealle-termografia', iss: 'https://securetoken.google.com/idealle-termografia', email, iat: agora, exp: agora + 600 });
  return cab + '.' + dados + '.' + crypto.createSign('RSA-SHA256').update(cab + '.' + dados).sign(privateKey).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
const env = { ASSINATURA_PFX: fs.readFileSync(pfx).toString('base64'), ASSINATURA_SENHA: senha, ASSINATURA_PERMITIDOS: 'socio@idealle.com.br' };
const buscarCerts = async () => ({ k1: publicKey.export({ type: 'spki', format: 'pem' }) });

async function chamar(metodo, auth, corpo, envUsado) {
  const res = { cab: {}, setHeader(k, v) { this.cab[k] = v; }, end(t) { this.corpo = t; } };
  await handler({ method: metodo, headers: { authorization: 'Bearer ' + auth, origin: 'https://app-nr13.vercel.app' }, body: corpo }, res, { env: envUsado || env, buscarCerts });
  return { status: res.statusCode, json: res.corpo ? JSON.parse(res.corpo) : null, cab: res.cab };
}

(async () => {
  // configuração faltando
  let r = await chamar('GET', token('socio@idealle.com.br'), null, {});
  assert.strictEqual(r.status, 503); console.log('ok  sem configuração → 503:', r.json.erro);
  // login não autorizado
  r = await chamar('GET', token('cliente@empresa.com'));
  assert.strictEqual(r.status, 403); console.log('ok  login fora da lista → 403');
  r = await chamar('GET', 'lixo');
  assert.strictEqual(r.status, 401); console.log('ok  sem login → 401');
  // senha errada
  r = await chamar('GET', token('socio@idealle.com.br'), null, Object.assign({}, env, { ASSINATURA_SENHA: 'errada' }));
  assert.strictEqual(r.status, 500); console.log('ok  senha errada →', r.json.erro);
  r = await chamar('GET', token('socio@idealle.com.br'));
  assert.strictEqual(r.status, 200); assert.ok(r.json.ativo);
  assert.strictEqual(r.cab['Access-Control-Allow-Origin'], 'https://app-nr13.vercel.app');
  console.log('ok  status:', r.json.titular, 'válido até', r.json.validoAte);

  // o código do navegador, com fetch trocado pelo handler
  global.window = global;
  global.fetch = async (url, o) => {
    const x = await chamar(o.method, o.headers.Authorization.replace('Bearer ', ''), o.body ? JSON.parse(o.body) : null);
    return { ok: x.status < 300, status: x.status, json: async () => x.json };
  };
  global.PDFLib = require('pdf-lib');
  const IA = require('../../assinatura/assinar-pdf.js');
  if (!pdfs.length) {
    const d = await PDFLib.PDFDocument.create(); d.addPage().drawText('Laudo de teste'); d.addPage();
    fs.writeFileSync('/tmp/teste-assinatura-origem.pdf', await d.save()); pdfs.push('/tmp/teste-assinatura-origem.pdf');
  }
  for (const f of pdfs) {
    const assinado = await IA.assinar(new Uint8Array(fs.readFileSync(f)), token('socio@idealle.com.br'), { documento: path.basename(f) });
    const v = conferirAssinatura(Buffer.from(assinado));
    const saida = f.replace(/\.pdf$/i, '') + '.assinado.pdf';
    fs.writeFileSync(saida, assinado);
    console.log('ok  assinado e conferido:', saida, '(' + assinado.length + ' bytes, titular ' + v.titular + ')');
  }
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
