// Envia o e-mail de follow up de uma proposta pelo SMTP da Locaweb (e-mail do domínio).
// Sem dependências: SMTP com o módulo tls/net do Node e conferência do login Firebase com crypto.
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables). A senha NUNCA vai no código.
//   SMTP_USUARIO        e-mail completo da caixa que envia (ex.: rodrigo@ideallesp.com.br)
//   SMTP_SENHA          senha dessa caixa
//   EMAIL_PERMITIDOS    logins do sistema que podem enviar, separados por vírgula
//   SMTP_HOST           opcional, padrão email-ssl.com.br (Locaweb)
//   SMTP_PORTA          opcional, padrão 465 (SSL). 587 usa STARTTLS.
//   EMAIL_NOME          opcional, nome que aparece no remetente (padrão "Idealle")
//   EMAIL_COPIA         opcional, cópia oculta de cada envio (padrão: o próprio remetente)
'use strict';

const tls = require('tls');
const net = require('net');
const crypto = require('crypto');
const os = require('os');

const PROJETO_FIREBASE = 'idealle-termografia';
const URL_CERTS = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

// ---------- Login: confere o token do Firebase enviado pelo Cronos ----------
let cacheCerts = { ate: 0, certs: null };
async function certsGoogle() {
  if (cacheCerts.certs && Date.now() < cacheCerts.ate) return cacheCerts.certs;
  const r = await fetch(URL_CERTS);
  if (!r.ok) throw new Error('Não foi possível validar o login (certificados do Google).');
  const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  cacheCerts = { certs: await r.json(), ate: Date.now() + (m ? Number(m[1]) : 3600) * 1000 };
  return cacheCerts.certs;
}

function b64url(s) { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }

async function conferirToken(token, buscarCerts) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) throw new Error('Login inválido.');
  const cab = JSON.parse(b64url(partes[0]).toString('utf8'));
  const dados = JSON.parse(b64url(partes[1]).toString('utf8'));
  if (cab.alg !== 'RS256') throw new Error('Login inválido.');
  const cert = (await (buscarCerts || certsGoogle)())[cab.kid];
  if (!cert) throw new Error('Login inválido.');
  const ok = crypto.createVerify('RSA-SHA256').update(partes[0] + '.' + partes[1]).verify(cert, b64url(partes[2]));
  if (!ok) throw new Error('Login inválido.');
  const agora = Math.floor(Date.now() / 1000);
  if (dados.aud !== PROJETO_FIREBASE || dados.iss !== 'https://securetoken.google.com/' + PROJETO_FIREBASE) throw new Error('Login inválido.');
  if (!dados.exp || dados.exp < agora || (dados.iat || 0) > agora + 300) throw new Error('Login expirado: saia e entre de novo no sistema.');
  return String(dados.email || '').toLowerCase();
}

// ---------- Mensagem ----------
function cabecalhoUtf8(s) { return '=?UTF-8?B?' + Buffer.from(String(s), 'utf8').toString('base64') + '?='; }
function base64Linhas(s) { return Buffer.from(String(s), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n'); }

function montarMensagem(o) {
  const dominio = o.de.split('@')[1] || 'localhost';
  return [
    'From: ' + cabecalhoUtf8(o.nome) + ' <' + o.de + '>',
    'To: <' + o.para + '>',
    'Reply-To: <' + o.de + '>',
    'Subject: ' + cabecalhoUtf8(o.assunto),
    'Date: ' + new Date().toUTCString().replace('GMT', '+0000'),
    'Message-ID: <' + crypto.randomUUID() + '@' + dominio + '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Linhas(o.texto)
  ].join('\r\n');
}

// ---------- SMTP ----------
function conversa(socketInicial) {
  let socket = socketInicial, buffer = '', espera = null;
  function ouvir(s) {
    s.setEncoding('utf8');
    s.on('data', function (d) {
      buffer += d;
      // resposta completa: última linha no formato "250 texto" (sem hífen)
      const linhas = buffer.split('\r\n');
      for (let i = 0; i < linhas.length - 1; i++) {
        if (/^\d{3} /.test(linhas[i]) || /^\d{3}$/.test(linhas[i])) {
          const resp = linhas.slice(0, i + 1).join('\n');
          buffer = linhas.slice(i + 1).join('\r\n');
          if (espera) { const e = espera; espera = null; e.ok(resp); }
          return;
        }
      }
    });
    s.on('error', function (e) { if (espera) { const x = espera; espera = null; x.erro(e); } });
  }
  ouvir(socket);
  return {
    ler: function () { return new Promise(function (ok, erro) { espera = { ok: ok, erro: erro }; }); },
    async cmd(linha, codigo) {
      const p = this.ler();
      if (linha != null) socket.write(linha + '\r\n');
      const r = await p;
      if (!String(r).startsWith(String(codigo))) throw new Error('SMTP recusou (' + (linha || 'conexão').split(' ')[0] + '): ' + r);
      return r;
    },
    trocar: function (novo) { socket.removeAllListeners('data'); socket = novo; buffer = ''; ouvir(novo); },
    socket: function () { return socket; }
  };
}

async function enviarSmtp(cfg, env) {
  const porta = Number(cfg.porta);
  const implicito = porta !== 587 && porta !== 25; // 465 = SSL direto
  const conectar = implicito
    ? function () { return tls.connect({ host: cfg.host, port: porta, servername: cfg.host }); }
    : function () { return net.connect({ host: cfg.host, port: porta }); };
  const sock = conectar();
  sock.setTimeout(20000, function () { sock.destroy(new Error('Tempo esgotado falando com o servidor de e-mail.')); });
  const c = conversa(sock);
  const nomeHost = os.hostname() || 'cronos';
  try {
    await c.cmd(null, 220);
    let ehlo = await c.cmd('EHLO ' + nomeHost, 250);
    if (!implicito) {
      if (!/STARTTLS/i.test(ehlo)) throw new Error('O servidor não oferece STARTTLS na porta ' + porta + '.');
      await c.cmd('STARTTLS', 220);
      const seguro = tls.connect({ socket: c.socket(), servername: cfg.host });
      await new Promise(function (ok, erro) { seguro.once('secureConnect', ok); seguro.once('error', erro); });
      c.trocar(seguro);
      ehlo = await c.cmd('EHLO ' + nomeHost, 250);
    }
    if (/AUTH[ =][^\n]*PLAIN/i.test(ehlo)) {
      await c.cmd('AUTH PLAIN ' + Buffer.from('\0' + cfg.usuario + '\0' + cfg.senha, 'utf8').toString('base64'), 235);
    } else {
      await c.cmd('AUTH LOGIN', 334);
      await c.cmd(Buffer.from(cfg.usuario, 'utf8').toString('base64'), 334);
      await c.cmd(Buffer.from(cfg.senha, 'utf8').toString('base64'), 235);
    }
    await c.cmd('MAIL FROM:<' + env.de + '>', 250);
    for (const r of env.destinos) await c.cmd('RCPT TO:<' + r + '>', 250);
    await c.cmd('DATA', 354);
    await c.cmd(env.mensagem.replace(/\r\n$/, '') + '\r\n.', 250);
    c.socket().write('QUIT\r\n');
  } finally {
    setTimeout(function () { try { c.socket().destroy(); } catch (e) {} }, 200);
  }
}

// ---------- Handler da Vercel ----------
async function handler(req, res, opcoes) {
  opcoes = opcoes || {};
  function responder(status, corpo) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(corpo)); }
  if (req.method !== 'POST') return responder(405, { erro: 'Use POST.' });
  const e = process.env;
  const CONHECIDAS = ['SMTP_USUARIO', 'SMTP_SENHA', 'EMAIL_PERMITIDOS', 'SMTP_HOST', 'SMTP_PORTA', 'EMAIL_NOME', 'EMAIL_COPIA'];
  const faltando = ['SMTP_USUARIO', 'SMTP_SENHA', 'EMAIL_PERMITIDOS'].filter(function (n) { return !String(e[n] || '').trim(); });
  if (faltando.length) {
    // Só os NOMES das variáveis (nunca valores), para achar erro de digitação ou ambiente errado.
    const parecidas = Object.keys(e).filter(function (n) { return /SMTP|EMAIL/i.test(n) && CONHECIDAS.indexOf(n) < 0; });
    return responder(500, { erro: 'Envio de e-mail ainda não configurado na Vercel. Falta: ' + faltando.join(', ') + '.' +
      (parecidas.length ? ' Variáveis parecidas encontradas: ' + parecidas.join(', ') + ' (confira o nome exato).' : ' Nenhuma variável SMTP/EMAIL chegou: confira se marcou o ambiente Production e fez o Redeploy.') });
  }
  let quem;
  try {
    quem = await conferirToken(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), opcoes.buscarCerts);
  } catch (err) { return responder(401, { erro: err.message }); }
  const permitidos = e.EMAIL_PERMITIDOS.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  if (permitidos.indexOf(quem) < 0) return responder(403, { erro: 'O login ' + quem + ' não está autorizado a enviar e-mails.' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (err) { b = null; } }
  b = b || {};
  const para = String(b.para || '').trim();
  const assunto = String(b.assunto || '').replace(/[\r\n]+/g, ' ').trim();
  const texto = String(b.texto || '').replace(/\r?\n/g, '\r\n');
  if (!EMAIL_RE.test(para)) return responder(400, { erro: 'E-mail do destinatário inválido.' });
  if (!assunto || assunto.length > 200) return responder(400, { erro: 'Informe o assunto (até 200 caracteres).' });
  if (!texto.trim() || texto.length > 20000) return responder(400, { erro: 'Informe o texto do e-mail.' });

  const de = e.SMTP_USUARIO.trim();
  const copia = (e.EMAIL_COPIA || de).trim();
  const destinos = [para];
  if (copia && EMAIL_RE.test(copia) && copia.toLowerCase() !== para.toLowerCase()) destinos.push(copia);
  try {
    await (opcoes.enviar || enviarSmtp)(
      { host: e.SMTP_HOST || 'email-ssl.com.br', porta: e.SMTP_PORTA || 465, usuario: de, senha: e.SMTP_SENHA },
      { de: de, destinos: destinos, mensagem: montarMensagem({ de: de, nome: e.EMAIL_NOME || 'Idealle', para: para, assunto: assunto, texto: texto }) }
    );
  } catch (err) {
    return responder(502, { erro: 'O servidor de e-mail recusou o envio: ' + err.message });
  }
  return responder(200, { ok: true, de: de, para: para, enviadoPor: quem, em: new Date().toISOString() });
}

module.exports = function (req, res) { return handler(req, res); };
module.exports._teste = { handler: handler, conferirToken: conferirToken, enviarSmtp: enviarSmtp, montarMensagem: montarMensagem };
