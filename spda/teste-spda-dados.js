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
console.log('SPDA modelo: todos os testes passaram');
