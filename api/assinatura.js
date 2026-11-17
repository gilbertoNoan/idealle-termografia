// Assina digitalmente (certificado A1 ICP-Brasil) os PDFs liberados no Portal do Cliente.
// O navegador prepara o PDF com /assinatura/assinar-pdf.js e manda só o resumo SHA-256; aqui sai a assinatura CMS.
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables). O certificado e a senha NUNCA vão no código.
//   ASSINATURA_PFX          conteúdo do arquivo .pfx em base64 (uma linha só)
//   ASSINATURA_SENHA        senha do certificado
//   ASSINATURA_PERMITIDOS   logins do sistema que podem assinar, separados por vírgula
//                           (se ficar vazia, vale a lista EMAIL_PERMITIDOS, dos sócios, já usada no e-mail de follow up)
//   ASSINATURA_ORIGENS      opcional: outros sites que podem chamar (ex.: https://app-nr13.vercel.app), separados por vírgula
//
// GET  → { ativo, titular, validoAte, emissor }   (confere a configuração sem assinar nada)
// POST { resumo: base64 do SHA-256, documento?: texto para o registro } → { cms: base64 }
'use strict';

const { conferirToken } = require('./enviar-email.js')._teste;
const { lerCertificado, montarCms } = require('./_assinatura/assinador.js');

const ORIGENS_PADRAO = [
  'https://idealle-termografia.vercel.app',
  'https://app-nr13.vercel.app',
  'https://meu-app-nr13.vercel.app',
  'https://app-certificados-de-calibra-o.vercel.app',
  'https://pmta-eta.vercel.app',
  'https://calculadora-iota-swart.vercel.app',
  'https://painel-central-rosy.vercel.app'
];

let cacheCert = { chave: '', cert: null };
function certificado(e) {
  const chave = e.ASSINATURA_PFX.length + ':' + e.ASSINATURA_PFX.slice(-24) + ':' + e.ASSINATURA_SENHA.length;
  if (cacheCert.chave !== chave) cacheCert = { chave: chave, cert: lerCertificado(e.ASSINATURA_PFX, e.ASSINATURA_SENHA) };
  return cacheCert.cert;
}

function origemPermitida(origem, e) {
  if (!origem) return false;
  const extras = String(e.ASSINATURA_ORIGENS || '').split(',').map(function (s) { return s.trim().replace(/\/$/, ''); }).filter(Boolean);
  if (ORIGENS_PADRAO.concat(extras).indexOf(origem) >= 0) return true;
  // prévias de branch e localhost (testes)
  return /^https:\/\/idealle-termografia(-[a-z0-9-]+)?\.vercel\.app$/.test(origem) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem);
}

async function handler(req, res, opcoes) {
  opcoes = opcoes || {};
  const e = opcoes.env || process.env;
  const origem = String(req.headers.origin || '');
  if (origemPermitida(origem, e)) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  function responder(status, corpo) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(corpo)); }
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'GET' && req.method !== 'POST') return responder(405, { erro: 'Use GET ou POST.' });

  const listaPermitidos = String(e.ASSINATURA_PERMITIDOS || '').trim() || String(e.EMAIL_PERMITIDOS || '').trim();
  const faltando = ['ASSINATURA_PFX', 'ASSINATURA_SENHA'].filter(function (n) { return !String(e[n] || '').trim(); });
  if (!listaPermitidos) faltando.push('ASSINATURA_PERMITIDOS');
  if (faltando.length) return responder(503, { erro: 'Assinatura digital ainda não configurada na Vercel. Falta: ' + faltando.join(', ') + '. Depois de salvar, faça o Redeploy.' });

  let quem;
  try {
    quem = await conferirToken(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), opcoes.buscarCerts);
  } catch (err) { return responder(401, { erro: err.message }); }
  const permitidos = listaPermitidos.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  if (permitidos.indexOf(quem) < 0) return responder(403, { erro: 'O login ' + quem + ' não está autorizado a assinar documentos.' });

  let cert;
  try { cert = certificado({ ASSINATURA_PFX: String(e.ASSINATURA_PFX).trim(), ASSINATURA_SENHA: String(e.ASSINATURA_SENHA) }); }
  catch (err) { return responder(500, { erro: err.message }); }
  const agora = opcoes.agora || new Date();
  if (agora < cert.validoDe || agora > cert.validoAte) return responder(409, { erro: 'O certificado digital venceu em ' + cert.validoAte.toISOString().slice(0, 10) + '. Cadastre o novo na Vercel.' });
  const info = { ativo: true, titular: cert.nome, validoAte: cert.validoAte.toISOString(), emissor: cert.emissor };
  if (req.method === 'GET') return responder(200, info);

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (err) { b = null; } }
  b = b || {};
  const resumo = Buffer.from(String(b.resumo || ''), 'base64');
  if (resumo.length !== 32) return responder(400, { erro: 'Resumo SHA-256 inválido.' });
  let cms;
  try { cms = montarCms(resumo, cert); } catch (err) { return responder(500, { erro: 'Não foi possível assinar: ' + err.message }); }
  console.log('assinatura', JSON.stringify({ por: quem, documento: String(b.documento || '').slice(0, 200), resumo: resumo.toString('hex'), em: agora.toISOString() }));
  return responder(200, Object.assign(info, { cms: cms.toString('base64'), assinadoPor: quem }));
}

module.exports = function (req, res) { return handler(req, res); };
module.exports._teste = { handler: handler, origemPermitida: origemPermitida };
