// Teste do modelo SPDA: node spda/teste-spda-dados.js
var S = require('./spda-dados.js'), assert = require('assert');
var emp = { id: 'e1', nome: 'Cliente Teste', cnpj: '12.345.678/0001-90' };
var ed = S.novaEdificacao(emp, { nome: 'Galpão 1', nivelProtecao: { np: 'III', origem: 'informado' } }); ed.id = 'ed1';
var l = S.novoLaudo({ id: 'os1', codigo: 'IDE-0001/2026' }, ed, 'gilberto');
assert.strictEqual(ed.cnpj, '12345678000190');
assert.strictEqual(l.checklist.length, S.CHECKLIST.reduce(function (s, b) { return s + b.itens.length; }, 0));
assert.ok(S.podeMudarStatus(l, 'revisao').indexOf('sem resposta') > 0);
l.checklist.forEach(function (i) { i.r = 'C'; });
l.medicoes.aterramento.push({ ponto: 'CX-01', valorOhm: '8,4' });
assert.strictEqual(S.podeMudarStatus(l, 'revisao'), '');
assert.strictEqual(S.parecerSugerido(l), 'conforme');
l.medicoes.aterramento.push({ ponto: 'CX-02', valorOhm: '23' });
l.medicoes.continuidade.push({ trecho: 'Descida 1', valorOhm: '0,15' });
assert.strictEqual(S.naoConformidades(l).length, 1);
assert.strictEqual(S.parecerSugerido(l), 'nao_conforme');
l.checklist[0].r = 'NC';
assert.ok(S.pendencias(l).some(function (p) { return /CAP-01/.test(p); }));
l.checklist[0].obs = 'Haste do captor solta';
l.status = 'revisao';
assert.ok(/ART/.test(S.podeMudarStatus(l, 'concluido')));
l.conclusao.parecer = 'nao_conforme'; l.responsavel = { nome: 'Gilberto', crea: '123', art: { numero: 'SP123', data: '2026-11-13' } };
assert.strictEqual(S.podeMudarStatus(l, 'concluido'), '');
l.dataInspecao = '2026-11-13'; assert.strictEqual(S.aoConcluir(l).proximaInspecao, '2027-11-13');
assert.strictEqual(S.proximoNumero(['SPDA-0007/2026', 'SPDA-0002/2025'], 2026), 'SPDA-0008/2026');
assert.strictEqual(S.podeMudarStatus({ status: 'rascunho' }, 'concluido'), 'Mudança de status não permitida.');
assert.strictEqual(S.num(6.2), 6.2); assert.strictEqual(S.num('6,2'), 6.2); assert.strictEqual(S.num('6.2'), 6.2); assert.strictEqual(S.num('1.234,5'), 1234.5);
assert.strictEqual(S.avaliarMedicoes({ aterramento: [{ ponto: 'X', valorOhm: 6.2 }] }).length, 0);
// Gerenciamento de risco (NBR 5419-2): galpão 100 x 40 x 10 m, NG 10, cercado por objetos da mesma altura
var near = function (a, b, tol) { assert.ok(Math.abs(a - b) <= (tol || 1e-9) * Math.max(1, Math.abs(b)), a + ' != ' + b); };
near(S.areaColeta(100, 40, 10), 4000 + 2 * 30 * 140 + Math.PI * 900, 1e-12);
var g = S.novaEdificacao(emp, { nome: 'Galpão', dimensoes: { comprimentoM: '100', larguraM: '40', alturaM: '10' } });
g.risco = { ng: '10', localizacao: 'cercada_iguais', zonas: [S.novaZona({ nome: 'Produção', pessoas: 50, horasAno: 2920, piso: 'concreto', incendio: 'normal', providencias: 'manuais', ocupacao: 'industrial' })] };
var c1 = S.calcularRisco(g);
near(c1.ND, 10 * S.areaColeta(100, 40, 10) * 0.5 * 1e-6, 1e-12);
// f = 50/50 * 2920/8760 = 1/3; LB = 0,5 * 1e-2 * 1 * 2e-2 * 1/3; RB(sem SPDA) = ND * LB
near(c1.zonas[0].porNp.nenhum.RB, c1.ND * 0.5 * 1e-2 * 2e-2 / 3, 1e-9);
near(c1.zonas[0].porNp.nenhum.RA, c1.ND * 1e-2 * 1e-2 / 3, 1e-9);
assert.strictEqual(c1.npMinimo, 'nenhum'); // ~5e-6 < 1e-5: risco tolerável sem SPDA para S1
// Zona com atmosfera explosiva (zona 1/21): exige NP mais rigoroso
g.risco.zonas.push(S.novaZona({ nome: 'Tancagem', pessoas: 5, horasAno: 2920, incendio: 'explosao_1_21', ocupacao: 'explosao', providencias: 'manuais', materiaisPerigosos: true }));
var c2 = S.calcularRisco(g);
assert.ok(c2.total.nenhum > 1e-5);
assert.ok(c2.total[c2.npMinimo] <= 1e-5 && c2.total[S.RISCO.ORDEM_NP[S.RISCO.ORDEM_NP.indexOf(c2.npMinimo) - 1]] > 1e-5);
g.risco.zonas[0].npAdotado = 'I'; assert.strictEqual(S.calcularRisco(g).npAdotado, 'I'); // zona com NP mais rigoroso prevalece
assert.ok(S.calcularRisco({ dimensoes: {}, risco: {} }).faltam.length === 3);
assert.strictEqual(c1.spdaObrigatorio, false); assert.strictEqual(c1.nivelSugerido, 'Não requerido');
assert.strictEqual(c2.spdaObrigatorio, true); assert.strictEqual(c2.nivelSugerido, c2.npMinimo); assert.ok(c2.riscoCalculado <= 1e-5);
var g3 = JSON.parse(JSON.stringify(g)); g3.risco.ng = '100000'; var c3 = S.calcularRisco(g3);
assert.strictEqual(c3.npMinimo, 'insuficiente'); assert.ok(/Especial/.test(c3.nivelSugerido)); assert.strictEqual(c3.riscoCalculado, c3.total.I);
assert.ok(c3.alerta.length > 0 && c3.tentativas.length === 5 && c3.tentativas.every(function (x) { return !x.atende; }));
var sg = S.sugerirNivelProtecao(function (np) { return { nenhum: 5e-5, IV: 1.2e-5, III: 6e-6, II: 3e-6, I: 1e-6 }[np]; });
assert.strictEqual(sg.nivelSugerido, 'III'); assert.strictEqual(sg.tentativas.length, 3); assert.strictEqual(sg.riscoSemProtecao, 5e-5);
assert.strictEqual(S.sugerirNivelProtecao(function () { return 1e-6; }).nivelSugerido, 'Não requerido');
// Respostas prontas e textos automáticos
var l2 = S.novoLaudo({ id: 'os2', codigo: 'IDE-0002/2026' }, ed, 'g'); l2.dataInspecao = '2026-11-15'; l2.nivelProtecao = 'III'; l2.edificacaoNome = 'Galpão 1';
l2.checklist.forEach(function (i) { i.r = 'C'; });
var t0 = S.textosAutomaticos(l2); assert.strictEqual(t0.parecer, 'conforme'); assert.ok(/em conformidade/.test(t0.texto)); assert.ok(/nova inspeção em 12 meses/.test(t0.recomendacoes));
var doc = l2.checklist.filter(function (i) { return i.codigo === 'DOC-01'; })[0]; doc.r = 'NC'; doc.problemas = S.problemasDe('DOC-01');
assert.ok(!S.pendencias(l2).some(function (p) { return /DOC-01/.test(p); })); // problema escolhido dispensa texto
assert.strictEqual(S.parecerSugerido(l2), 'conforme_ressalvas');
var cap = l2.checklist.filter(function (i) { return i.codigo === 'CAP-02'; })[0]; cap.r = 'NC'; cap.problemas = [S.problemasDe('CAP-02')[2]];
var t1 = S.textosAutomaticos(l2); assert.strictEqual(t1.parecer, 'nao_conforme');
assert.ok(/^1\. \[CAP-02\] Reinstalar/.test(t1.recomendacoes)); assert.ok(/imediata/.test(t1.recomendacoes)); assert.ok(/2\. \[DOC-01\]/.test(t1.recomendacoes));
assert.ok(/1 de correção imediata/.test(t1.texto));
// Documentação técnica -> checklist DOC
var l4 = S.novoLaudo({ id: 'o4', codigo: 'X' }, ed, 'g'); l4.documentacao = S.documentacaoVazia();
l4.documentacao.itens.projeto.status = 'apresentado'; l4.documentacao.itens.art_projeto.status = 'nao_apresentado'; l4.documentacao.itens.art_execucao.status = 'na';
l4.documentacao.itens.laudo_anterior.status = 'desatualizado'; l4.documentacao.gr.possui = 'nao';
assert.ok(S.aplicarDocNoChecklist(l4));
var rr = {}; l4.checklist.forEach(function (i) { rr[i.codigo] = i.r; });
assert.strictEqual(rr['DOC-01'], 'C'); assert.strictEqual(rr['DOC-02'], 'NC'); assert.strictEqual(rr['DOC-03'], 'NC'); assert.strictEqual(rr['DOC-04'], 'NC');
assert.ok(l4.checklist.filter(function (i) { return i.codigo === 'DOC-02'; })[0].problemas.length === 1);
l4.documentacao.itens.art_projeto.status = 'apresentado'; S.aplicarDocNoChecklist(l4);
assert.strictEqual(l4.checklist.filter(function (i) { return i.codigo === 'DOC-04'; })[0].r, 'C');
console.log('SPDA modelo: todos os testes passaram');
