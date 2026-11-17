/* Assinatura digital dos PDFs liberados no Portal do Cliente (PAdES com o certificado A1 da IDEALLE).
 *
 * Uso em qualquer sistema (NR-13, Certificados, PMTA, SPDA, CRONOS...):
 *   <script src="https://idealle-termografia.vercel.app/assinatura/assinar-pdf.js"></script>
 *   var st = await IdealleAssinatura.status(token);           // { ativo, titular, validoAte } ou { ativo:false, motivo }
 *   var pdfAssinado = await IdealleAssinatura.assinar(bytes, token);   // Uint8Array
 * token = o login do Firebase (idealle-termografia): await firebase.auth().currentUser.getIdToken()
 *
 * O PDF n\u00e3o sai do navegador: aqui ele ganha o selo de rodap\u00e9 e o espa\u00e7o da assinatura; s\u00f3 o resumo SHA-256 vai
 * para /api/assinatura, que devolve a assinatura (CMS) feita com o certificado guardado na Vercel.
 */
(function (raiz) {
  'use strict';
  var BASE = 'https://idealle-termografia.vercel.app';
  try { if (raiz.location && /idealle-termografia(-[a-z0-9-]+)?\.vercel\.app$|^localhost$|^127\./.test(raiz.location.hostname)) BASE = raiz.location.origin; } catch (e) {}
  var TAM = 16384, MARCA = '**********';
  var URL_PDFLIB = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';

  function pdfLib() {
    if (raiz.PDFLib) return Promise.resolve(raiz.PDFLib);
    return new Promise(function (ok, erro) {
      var sc = document.createElement('script'); sc.src = URL_PDFLIB;
      sc.onload = function () { ok(raiz.PDFLib); }; sc.onerror = function () { erro(new Error('n\u00e3o foi poss\u00edvel carregar o leitor de PDF')); };
      document.head.appendChild(sc);
    });
  }
  async function chamar(metodo, token, corpo) {
    var r = await fetch(BASE + '/api/assinatura', {
      method: metodo, headers: Object.assign({ 'Authorization': 'Bearer ' + token }, corpo ? { 'Content-Type': 'application/json' } : {}),
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    var j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) { var err = new Error(j.erro || ('Falha na assinatura (' + r.status + ')')); err.status = r.status; throw err; }
    return j;
  }
  // { ativo: true, titular, validoAte } quando a assinatura est\u00e1 configurada e o login pode assinar
  async function status(token) {
    try { return await chamar('GET', token); } catch (e) { return { ativo: false, motivo: e.message }; }
  }

  function dataPdf(d) {
    var p = function (n) { return String(n).padStart(2, '0'); };
    return 'D:' + d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
  }
  function dataBr(d) {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d).replace(',', '');
  }
  function ascii(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?'); }
  function seguro(fonte, s) { return Array.from(String(s)).map(function (c) { try { fonte.encodeText(c); return c; } catch (e) { return ascii(c); } }).join(''); }
  function achar(bytes, texto, desde) {
    var alvo = Array.from(texto).map(function (c) { return c.charCodeAt(0); });
    outer: for (var i = desde || 0; i <= bytes.length - alvo.length; i++) { for (var j = 0; j < alvo.length; j++) if (bytes[i + j] !== alvo[j]) continue outer; return i; }
    return -1;
  }
  function acharUltimo(bytes, texto) {
    var alvo = Array.from(texto).map(function (c) { return c.charCodeAt(0); });
    outer: for (var i = bytes.length - alvo.length; i >= 0; i--) { for (var j = 0; j < alvo.length; j++) if (bytes[i + j] !== alvo[j]) continue outer; return i; }
    return -1;
  }
  function escrever(bytes, texto, pos) { for (var i = 0; i < texto.length; i++) bytes[pos + i] = texto.charCodeAt(i); }
  function b64(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000))); return btoa(s); }
  function deB64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

  // Prepara o PDF (selo + campo de assinatura com espa\u00e7o reservado) e devolve os bytes
  async function preparar(bytes, titular, agora, opcoes) {
    var L = opcoes.PDFLib || await pdfLib();
    var doc = await L.PDFDocument.load(bytes, { updateMetadata: false });
    var paginas = doc.getPages();
    if (!paginas.length) throw new Error('PDF sem p\u00e1ginas.');
    if (opcoes.selo !== false) {
      var fonte = await doc.embedFont(L.StandardFonts.Helvetica);
      var texto = seguro(fonte, 'Documento assinado digitalmente por ' + titular + ' (certificado ICP-Brasil) em ' + dataBr(agora) + '. Confira em validar.iti.gov.br');
      paginas.forEach(function (pg) {
        var w = pg.getSize().width, tam = 6.5, larg = fonte.widthOfTextAtSize(texto, tam);
        if (larg > w - 8) { tam = tam * (w - 8) / larg; larg = w - 8; }
        pg.drawText(texto, { x: (w - larg) / 2, y: 3, size: tam, font: fonte, color: L.rgb(0.05, 0.35, 0.2) });
      });
    }
    var ctx = doc.context, pagina = paginas[paginas.length - 1];
    var br = L.PDFArray.withContext(ctx);
    br.push(L.PDFNumber.of(0)); br.push(L.PDFName.of(MARCA)); br.push(L.PDFName.of(MARCA)); br.push(L.PDFName.of(MARCA));
    var sigRef = ctx.register(ctx.obj({
      Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: 'ETSI.CAdES.detached', ByteRange: br,
      Contents: L.PDFHexString.of('0'.repeat(TAM * 2)), M: L.PDFString.of(dataPdf(agora)), Name: L.PDFString.of(ascii(titular)),
      Reason: L.PDFString.of(ascii(opcoes.motivo || 'Documento emitido e assinado pela IDEALLE')), Location: L.PDFString.of(ascii(opcoes.local || 'Brasil'))
    }));
    var wRef = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', Rect: [0, 0, 0, 0], F: 132, T: L.PDFString.of('Assinatura IDEALLE ' + agora.getTime().toString(36)), V: sigRef, P: pagina.ref }));
    var annots = pagina.node.lookup(L.PDFName.of('Annots'));
    if (annots instanceof L.PDFArray) annots.push(wRef); else pagina.node.set(L.PDFName.of('Annots'), ctx.obj([wRef]));
    var form = doc.catalog.lookup(L.PDFName.of('AcroForm'));
    if (!form) { form = ctx.obj({ Fields: [] }); doc.catalog.set(L.PDFName.of('AcroForm'), ctx.register(form)); }
    var campos = form.lookup(L.PDFName.of('Fields'));
    if (!(campos instanceof L.PDFArray)) { campos = ctx.obj([]); form.set(L.PDFName.of('Fields'), campos); }
    campos.push(wRef);
    form.set(L.PDFName.of('SigFlags'), L.PDFNumber.of(3));
    // sem object streams: o dicion\u00e1rio da assinatura fica em texto puro para preencher o ByteRange
    return await doc.save({ useObjectStreams: false });
  }

  // Assina o PDF (Uint8Array/ArrayBuffer) e devolve o PDF assinado (Uint8Array)
  async function assinar(bytes, token, opcoes) {
    opcoes = opcoes || {};
    var st = opcoes.status || await chamar('GET', token);
    var agora = new Date();
    var pdf = await preparar(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), st.titular, agora, opcoes);
    var marcaBr = '[ 0 /' + MARCA + ' /' + MARCA + ' /' + MARCA + ' ]';
    var posBr = acharUltimo(pdf, marcaBr);
    var posCont = acharUltimo(pdf, '/Contents <' + '0'.repeat(64));
    if (posBr < 0 || posCont < 0) throw new Error('N\u00e3o foi poss\u00edvel preparar o espa\u00e7o da assinatura no PDF.');
    var ini = posCont + '/Contents '.length, fim = ini + TAM * 2 + 2;
    if (pdf[fim - 1] !== 0x3e) throw new Error('Espa\u00e7o da assinatura com tamanho inesperado.');
    var faixa = '[' + [0, ini, fim, pdf.length - fim].join(' ') + ']';
    if (faixa.length > marcaBr.length) throw new Error('PDF grande demais para assinar.');
    escrever(pdf, faixa + ' '.repeat(marcaBr.length - faixa.length), posBr);
    var junto = new Uint8Array(ini + pdf.length - fim);
    junto.set(pdf.subarray(0, ini), 0); junto.set(pdf.subarray(fim), ini);
    var resumo = new Uint8Array(await (opcoes.subtle || raiz.crypto.subtle).digest('SHA-256', junto));
    var r = await chamar('POST', token, { resumo: b64(resumo), documento: String(opcoes.documento || '').slice(0, 200) });
    var cms = deB64(r.cms);
    if (cms.length > TAM) throw new Error('Assinatura maior que o espa\u00e7o reservado.');
    var hex = ''; for (var i = 0; i < cms.length; i++) hex += (cms[i] < 16 ? '0' : '') + cms[i].toString(16);
    escrever(pdf, hex, ini + 1);
    return pdf;
  }

  raiz.IdealleAssinatura = { status: status, assinar: assinar, _preparar: preparar };
  if (typeof module !== 'undefined' && module.exports) module.exports = raiz.IdealleAssinatura;
})(typeof window !== 'undefined' ? window : globalThis);
