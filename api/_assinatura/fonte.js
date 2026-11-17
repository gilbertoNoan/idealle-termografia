// Assinatura digital com certificado A1 (ICP-Brasil, arquivo .pfx/.p12): lê o certificado e monta a assinatura
// CAdES-BES (CMS destacado, SHA-256, signing-certificate-v2) usada no PDF como PAdES (SubFilter ETSI.CAdES.detached).
// O PDF não passa pelo servidor: o navegador prepara o arquivo (/assinatura/assinar-pdf.js), manda só o resumo SHA-256
// e recebe a assinatura pronta. Assim não há limite de tamanho de PDF e o certificado nunca sai da Vercel.
//
// Este é o código-fonte. A função da Vercel usa o arquivo empacotado assinador.js (gerado daqui, sem npm install):
//   npm i --no-save node-forge@1.3.1 esbuild@0.24.0
//   npx esbuild api/_assinatura/fonte.js --bundle --platform=node --target=node18 --minify --legal-comments=eof --outfile=api/_assinatura/assinador.js
'use strict';

const crypto = require('crypto');
const forge = require('node-forge');

const asn1 = forge.asn1;
const OID = {
  data: '1.2.840.113549.1.7.1',
  signedData: '1.2.840.113549.1.7.2',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  signingCertificateV2: '1.2.840.113549.1.9.16.2.47',
  sha256: '2.16.840.1.101.3.4.2.1',
  rsaEncryption: '1.2.840.113549.1.1.1',
  sha256WithRSA: '1.2.840.113549.1.1.11'
};

// ---------- Certificado A1 ----------
function lerCertificado(pfx, senha) {
  const der = Buffer.isBuffer(pfx) ? pfx : Buffer.from(String(pfx || '').replace(/\s+/g, ''), 'base64');
  if (!der.length) throw new Error('Certificado vazio.');
  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1.fromDer(forge.util.createBuffer(der.toString('binary'))), false, String(senha || ''));
  } catch (e) {
    throw new Error(/Invalid password|MAC/i.test(e.message || '') ? 'Senha do certificado incorreta.' : 'Não foi possível ler o certificado (.pfx): ' + (e.message || e));
  }
  const chaves = [].concat(
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [],
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []
  ).filter(function (b) { return b.key; });
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).filter(function (b) { return b.cert; }).map(function (b) { return b.cert; });
  if (!chaves.length) throw new Error('O certificado não tem a chave privada (exporte o .pfx com a chave).');
  const chave = chaves[0].key;
  if (!chave.n) throw new Error('Só certificados RSA são aceitos.');
  const titular = certs.filter(function (c) { return c.publicKey && c.publicKey.n && c.publicKey.n.equals(chave.n); })[0];
  if (!titular) throw new Error('O certificado do titular não está no arquivo .pfx.');
  // cadeia: titular primeiro, depois as ACs que estiverem no arquivo
  const cadeia = [titular].concat(certs.filter(function (c) { return c !== titular; }));
  const cn = (titular.subject.getField('CN') || {}).value || '';
  return {
    chavePem: forge.pki.privateKeyToPem(chave),
    cadeia: cadeia,
    titular: titular,
    nome: cn.split(':')[0].trim() || cn, // ICP-Brasil: "NOME:CPF" ou "EMPRESA:CNPJ"
    nomeCompleto: cn,
    validoDe: titular.validity.notBefore,
    validoAte: titular.validity.notAfter,
    emissor: (titular.issuer.getField('CN') || {}).value || ''
  };
}

// ---------- CMS / CAdES-BES ----------
function derBytes(no) { return Buffer.from(asn1.toDer(no).getBytes(), 'binary'); }
function certAsn1(c) { return forge.pki.certificateToAsn1(c); }
function seq(itens) { return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, itens); }
function setDe(itens) { return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, itens); }
function oid(o) { return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(o).getBytes()); }
function octetos(buf) { return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, Buffer.from(buf).toString('binary')); }
function inteiro(n) { return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(n).getBytes()); }
function nulo() { return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''); }
function algoritmo(o, comNull) { return seq(comNull ? [oid(o), nulo()] : [oid(o)]); }
function atributo(tipo, valor) { return seq([oid(tipo), setDe([valor])]); }
// emissor e número de série tirados do próprio certificado (sem reprocessar)
function emissorESerie(cert) {
  const tbs = certAsn1(cert).value[0].value;
  const temVersao = tbs[0].tagClass === asn1.Class.CONTEXT_SPECIFIC;
  return { serie: tbs[temVersao ? 1 : 0], emissor: tbs[temVersao ? 3 : 2] };
}
// SET OF em DER: elementos em ordem crescente dos bytes codificados
function setOrdenado(itens) {
  const cod = itens.map(function (i) { return { no: i, der: derBytes(i) }; }).sort(function (a, b) { return Buffer.compare(a.der, b.der); });
  return cod.map(function (c) { return c.no; });
}

function montarCms(resumo, cert) {
  const titular = cert.titular, derTitular = derBytes(certAsn1(titular)), es = emissorESerie(titular);
  const essCertIdV2 = seq([
    octetos(crypto.createHash('sha256').update(derTitular).digest()),
    seq([seq([asn1.create(asn1.Class.CONTEXT_SPECIFIC, 4, true, [es.emissor])]), es.serie])
  ]);
  const atributos = setOrdenado([
    atributo(OID.contentType, oid(OID.data)),
    atributo(OID.messageDigest, octetos(resumo)),
    atributo(OID.signingCertificateV2, seq([seq([essCertIdV2])]))
  ]);
  const assinatura = crypto.sign('sha256', derBytes(setDe(atributos)), cert.chavePem);
  const signerInfo = seq([
    inteiro(1),
    seq([es.emissor, es.serie]),
    algoritmo(OID.sha256, true),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, atributos),
    algoritmo(OID.rsaEncryption, true),
    octetos(assinatura)
  ]);
  const signedData = seq([
    inteiro(1),
    setDe([algoritmo(OID.sha256, true)]),
    seq([oid(OID.data)]),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, cert.cadeia.map(certAsn1)),
    setDe([signerInfo])
  ]);
  return derBytes(seq([oid(OID.signedData), asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData])]));
}

// ---------- Conferência (usada nos testes) ----------
function conferirAssinatura(pdf) {
  pdf = Buffer.from(pdf);
  const m = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(pdf.toString('latin1'));
  if (!m) throw new Error('PDF sem assinatura.');
  const r = m.slice(1).map(Number);
  if (r[0] !== 0 || r[2] + r[3] !== pdf.length) throw new Error('A assinatura não cobre o arquivo inteiro.');
  const hex = pdf.subarray(r[1] + 1, r[2] - 1).toString('latin1').replace(/(00)+$/, '');
  const p7 = asn1.fromDer(forge.util.createBuffer(Buffer.from(hex.length % 2 ? hex + '0' : hex, 'hex').toString('binary')));
  const sd = p7.value[1].value[0].value;
  const certs = sd[3].value.map(function (c) { return forge.pki.certificateFromAsn1(c); });
  const si = sd[4].value[0].value;
  const attrsNo = si[3];
  const resumo = crypto.createHash('sha256').update(pdf.subarray(0, r[1])).update(pdf.subarray(r[2])).digest();
  const md = attrsNo.value.filter(function (a) { return asn1.derToOid(a.value[0].value) === OID.messageDigest; })[0];
  if (!md || Buffer.from(md.value[1].value[0].value, 'binary').compare(resumo) !== 0) throw new Error('Resumo (hash) do PDF não confere.');
  const attrsDer = derBytes(setDe(attrsNo.value));
  const pem = forge.pki.publicKeyToPem(certs[0].publicKey);
  if (!crypto.verify('sha256', attrsDer, pem, Buffer.from(si[5].value, 'binary'))) throw new Error('Assinatura inválida.');
  return { ok: true, titular: (certs[0].subject.getField('CN') || {}).value, intervalos: r };
}

module.exports = { lerCertificado: lerCertificado, montarCms: montarCms, conferirAssinatura: conferirAssinatura };
