/*
 * SPDA (NBR 5419) — Etapa 1: modelo de dados e regras de negócio do módulo SPDA.
 * Sem tela: só constantes e funções puras, usadas pelas telas (etapas 2 a 5) e testáveis no Node.
 * Banco: Firestore do projeto idealle-termografia (o mesmo da Termografia, CRONOS, Finanças e Portal).
 * Modelo completo em spda/MODELO-DE-DADOS.md.
 */
(function (raiz) {
  'use strict';

  // Coleções do Firestore usadas pelo módulo
  var COLECOES = {
    empresas: 'empresas',            // clientes (cadastro único no Finanças, pelo CNPJ) — só leitura aqui
    ordens: 'ordens',                // OS do Finanças (serviço "spda") — o laudo nasce de uma OS
    edificacoes: 'spda_edificacoes', // prédios/estruturas de cada cliente
    laudos: 'spda_laudos',           // laudo da inspeção: checklist, medições, conclusão, ART
    fotos: 'spda_fotos',             // fotos (base64 reduzido) ligadas ao laudo e ao item do checklist
    portal: 'portal_laudos'          // PDF publicado para o cliente (mesmo esquema dos outros laudos)
  };

  // Níveis de proteção (NBR 5419-1 e 5419-3). Conferir sempre com a edição vigente da norma.
  var NIVEIS = {
    I:   { classe: 'I',   correntePicoKA: 200, raioEsferaM: 20, malhaM: [5, 5],   distDescidasM: 10 },
    II:  { classe: 'II',  correntePicoKA: 150, raioEsferaM: 30, malhaM: [10, 10], distDescidasM: 10 },
    III: { classe: 'III', correntePicoKA: 100, raioEsferaM: 45, malhaM: [15, 15], distDescidasM: 15 },
    IV:  { classe: 'IV',  correntePicoKA: 100, raioEsferaM: 60, malhaM: [20, 20], distDescidasM: 20 }
  };

  var METODOS_CAPTACAO = { franklin: 'Ângulo de proteção (Franklin)', malha: 'Malha (gaiola de Faraday)', esfera: 'Esfera rolante', misto: 'Misto' };
  var TIPOS_INSPECAO = { inicial: 'Inicial (após instalação)', periodica: 'Periódica', descarga: 'Após descarga atmosférica', modificacao: 'Após reforma / modificação' };
  var STATUS_LAUDO = { rascunho: 'Rascunho', revisao: 'Em revisão', concluido: 'Concluído' };
  var RESPOSTAS = { C: 'Conforme', NC: 'Não conforme', NA: 'Não se aplica' };

  // Referências usadas nas medições (ajustáveis por laudo em medicoes.limites)
  var LIMITES_PADRAO = {
    continuidadeOhm: 0.2,  // continuidade elétrica dos componentes (armaduras, condutores)
    aterramentoOhm: 10     // referência usual para a resistência de aterramento; a norma não fixa valor obrigatório
  };
  var PERIODICIDADE_PADRAO_MESES = 12; // próxima inspeção; ajustável no laudo conforme norma/contrato/NP

  // Checklist normativo (inspeção de SPDA existente). Cada item tem código fixo: as fotos e as respostas
  // apontam para o código, então não renumerar — para mudar, criar código novo e marcar o antigo como inativo.
  var CHECKLIST = [
    { bloco: 'captacao', nome: 'Subsistema de captação', itens: [
      ['CAP-01', 'Subsistema de captação existente e compatível com o projeto e o nível de proteção'],
      ['CAP-02', 'Captores (hastes / mastros) íntegros, firmes e na posição correta'],
      ['CAP-03', 'Condutores de captação contínuos, bem fixados e sem danos'],
      ['CAP-04', 'Dimensão da malha / raio da esfera / ângulo de proteção atendem ao nível de proteção'],
      ['CAP-05', 'Elementos naturais (telhas metálicas, platibandas, rufos) com espessura e continuidade adequadas'],
      ['CAP-06', 'Equipamentos no topo (antenas, condensadoras, caixas d\'água) protegidos ou interligados'],
      ['CAP-07', 'Sem corrosão, emendas soltas ou peças faltando']
    ]},
    { bloco: 'descidas', nome: 'Subsistema de descidas', itens: [
      ['DES-01', 'Quantidade e espaçamento das descidas compatíveis com o nível de proteção'],
      ['DES-02', 'Condutores de descida íntegros, contínuos e sem emendas indevidas'],
      ['DES-03', 'Fixação adequada e afastamento de materiais combustíveis'],
      ['DES-04', 'Proteção mecânica até 2,5 m do piso contra danos e tensão de toque'],
      ['DES-05', 'Conexões / caixas de medição acessíveis e identificadas'],
      ['DES-06', 'Descidas naturais (armaduras, pilares metálicos) com continuidade comprovada'],
      ['DES-07', 'Sem curvas acentuadas ou laços nos condutores']
    ]},
    { bloco: 'aterramento', nome: 'Subsistema de aterramento', itens: [
      ['ATE-01', 'Aterramento existente (anel, fundação ou hastes) conforme o projeto'],
      ['ATE-02', 'Eletrodos e conexões íntegros e sem corrosão'],
      ['ATE-03', 'Caixas de inspeção do aterramento em bom estado e acessíveis'],
      ['ATE-04', 'Aterramento do SPDA interligado aos demais aterramentos da edificação'],
      ['ATE-05', 'Sem obras ou escavações que comprometam o aterramento']
    ]},
    { bloco: 'equipotencializacao', nome: 'Equipotencialização', itens: [
      ['EQP-01', 'Barramento de equipotencialização principal (BEP) existente e identificado'],
      ['EQP-02', 'Massas metálicas, tubulações e estruturas ligadas ao BEP'],
      ['EQP-03', 'Ligações equipotenciais locais (BEL) onde necessário'],
      ['EQP-04', 'Distância de segurança respeitada onde não há ligação equipotencial']
    ]},
    { bloco: 'dps', nome: 'Proteção contra surtos (DPS)', itens: [
      ['DPS-01', 'DPS instalados no quadro de entrada, com classe adequada'],
      ['DPS-02', 'DPS nos quadros de distribuição / equipamentos sensíveis'],
      ['DPS-03', 'Indicadores de estado dos DPS sem falha'],
      ['DPS-04', 'Condutores de ligação dos DPS curtos e com seção adequada'],
      ['DPS-05', 'Características do DPS (Uc, Up, In/Iimp) compatíveis com a instalação']
    ]},
    { bloco: 'documentacao', nome: 'Documentação', itens: [
      ['DOC-01', 'Projeto / as built do SPDA disponível'],
      ['DOC-02', 'Análise (gerenciamento) de risco disponível'],
      ['DOC-03', 'Relatórios de inspeções anteriores disponíveis'],
      ['DOC-04', 'ART do projeto ou da instalação disponível']
    ]}
  ];
  // bloco de medições fica separado (laudo.medicoes)

  function hojeISO() { return new Date().toISOString().slice(0, 10); }
  function somarMeses(iso, meses) { var d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + meses); return d.toISOString().slice(0, 10); }
  function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }
  function num(v) { if (v == null || v === '') return NaN; return Number(String(v).replace(/\./g, '').replace(',', '.')); }

  // ---------- Fábricas (formato dos documentos) ----------
  function novaEdificacao(empresa, dados) {
    dados = dados || {};
    return {
      empresaId: empresa.id, empresaNome: empresa.nome || '', cnpj: soDigitos(empresa.cnpj),
      nome: dados.nome || '', // ex.: "Galpão 2", "Bloco administrativo"
      endereco: dados.endereco || { logradouro: '', numero: '', bairro: '', cidade: '', uf: '', cep: '' },
      atividade: dados.atividade || '', // uso / ocupação
      dimensoes: dados.dimensoes || { comprimentoM: '', larguraM: '', alturaM: '' },
      tipoEstrutura: dados.tipoEstrutura || '', // concreto armado, metálica, alvenaria...
      coberturaTipo: dados.coberturaTipo || '',
      nivelProtecao: dados.nivelProtecao || { np: '', origem: 'informado', analiseRisco: '' }, // origem: informado | calculado
      metodoCaptacao: dados.metodoCaptacao || '',
      qtdDescidas: dados.qtdDescidas || '',
      ativo: true, criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString()
    };
  }

  function checklistEmBranco() {
    var l = [];
    CHECKLIST.forEach(function (b) { b.itens.forEach(function (it) { l.push({ codigo: it[0], bloco: b.bloco, texto: it[1], r: '', obs: '', fotos: [] }); }); });
    return l;
  }

  function novoLaudo(os, edificacao, usuario) {
    return {
      osId: os.id, osCodigo: os.codigo || '', empresaId: edificacao.empresaId, empresaNome: edificacao.empresaNome, cnpj: edificacao.cnpj,
      edificacaoId: edificacao.id, edificacaoNome: edificacao.nome,
      numero: '', // ex.: SPDA-0001/2026, dado ao concluir (proximoNumero)
      tipoInspecao: 'periodica', dataInspecao: hojeISO(), status: 'rascunho',
      nivelProtecao: (edificacao.nivelProtecao && edificacao.nivelProtecao.np) || '',
      metodoCaptacao: edificacao.metodoCaptacao || '',
      checklist: checklistEmBranco(),
      medicoes: {
        equipamento: { tipo: 'Terrômetro', marca: '', modelo: '', serie: '', certificado: '', validade: '' },
        metodo: 'Queda de potencial',
        aterramento: [],   // { ponto, local, valorOhm, obs }
        continuidade: [],  // { trecho, valorOhm, obs }
        limites: { continuidadeOhm: LIMITES_PADRAO.continuidadeOhm, aterramentoOhm: LIMITES_PADRAO.aterramentoOhm },
        clima: '', soloUmido: null
      },
      conclusao: { parecer: '', texto: '', recomendacoes: '' }, // parecer: conforme | conforme_ressalvas | nao_conforme
      periodicidadeMeses: PERIODICIDADE_PADRAO_MESES, proximaInspecao: '',
      inspetor: usuario || '', responsavel: { nome: '', crea: '', art: { numero: '', data: '' } },
      historico: [{ quando: new Date().toISOString(), quem: usuario || '', o: 'criado' }],
      criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString()
    };
  }

  function novaFoto(laudoId, codigoItem, dataUrl, legenda) {
    return { laudoId: laudoId, item: codigoItem || '', dataUrl: dataUrl, legenda: legenda || '', criadoEm: new Date().toISOString() };
  }

  // ---------- Regras ----------
  // Medição fora do limite vira não conformidade automática
  function avaliarMedicoes(m) {
    var lim = (m && m.limites) || LIMITES_PADRAO, fora = [];
    ((m && m.aterramento) || []).forEach(function (x) { var v = num(x.valorOhm); if (!isNaN(v) && v > lim.aterramentoOhm) fora.push({ tipo: 'aterramento', ref: x.ponto, valor: v, limite: lim.aterramentoOhm }); });
    ((m && m.continuidade) || []).forEach(function (x) { var v = num(x.valorOhm); if (!isNaN(v) && v > lim.continuidadeOhm) fora.push({ tipo: 'continuidade', ref: x.trecho, valor: v, limite: lim.continuidadeOhm }); });
    return fora;
  }

  function naoConformidades(laudo) {
    var nc = (laudo.checklist || []).filter(function (i) { return i.r === 'NC'; }).map(function (i) { return { codigo: i.codigo, texto: i.texto, obs: i.obs, fotos: i.fotos }; });
    avaliarMedicoes(laudo.medicoes).forEach(function (f) {
      nc.push({ codigo: 'MED-' + (f.tipo === 'aterramento' ? 'ATE' : 'CON'), texto: (f.tipo === 'aterramento' ? 'Resistência de aterramento' : 'Continuidade') + ' acima da referência em ' + (f.ref || '—') + ': ' + f.valor + ' Ω (ref. ' + f.limite + ' Ω)', obs: '', fotos: [] });
    });
    return nc;
  }

  function parecerSugerido(laudo) {
    var nc = naoConformidades(laudo).length, vazios = (laudo.checklist || []).filter(function (i) { return !i.r; }).length;
    if (vazios) return '';
    return nc ? 'nao_conforme' : 'conforme';
  }

  // O que falta para o laudo poder sair do rascunho (revisão) e para ser concluído
  function pendencias(laudo, paraConcluir) {
    var p = [];
    if (!laudo.edificacaoId) p.push('Escolher a edificação');
    if (!laudo.nivelProtecao) p.push('Informar o nível de proteção');
    var vazios = (laudo.checklist || []).filter(function (i) { return !i.r; }).length;
    if (vazios) p.push(vazios + ' item(ns) do checklist sem resposta');
    (laudo.checklist || []).forEach(function (i) { if (i.r === 'NC' && !String(i.obs || '').trim()) p.push(i.codigo + ': descrever a não conformidade'); });
    if (!(laudo.medicoes && laudo.medicoes.aterramento && laudo.medicoes.aterramento.length)) p.push('Lançar as medições de aterramento');
    if (paraConcluir) {
      if (!laudo.conclusao || !laudo.conclusao.parecer) p.push('Escolher o parecer final');
      var r = laudo.responsavel || {};
      if (!r.nome || !r.crea) p.push('Responsável técnico e CREA');
      if (!r.art || !r.art.numero) p.push('Número da ART');
    }
    return p;
  }

  // Fluxo: rascunho -> revisao -> concluido (sócio/PH conclui; concluído pode voltar para revisão)
  var TRANSICOES = { rascunho: ['revisao'], revisao: ['rascunho', 'concluido'], concluido: ['revisao'] };
  function podeMudarStatus(laudo, para) {
    if ((TRANSICOES[laudo.status] || []).indexOf(para) < 0) return 'Mudança de status não permitida.';
    var p = pendencias(laudo, para === 'concluido');
    if (para !== 'rascunho' && p.length) return 'Falta: ' + p.join('; ');
    return '';
  }
  function aoConcluir(laudo) {
    var base = laudo.dataInspecao || hojeISO();
    return { proximaInspecao: somarMeses(base, Number(laudo.periodicidadeMeses) || PERIODICIDADE_PADRAO_MESES), concluidoEm: new Date().toISOString() };
  }
  function proximoNumero(numerosDoAno, ano) {
    var max = 0;
    (numerosDoAno || []).forEach(function (n) { var m = /SPDA-(\d+)\/(\d{4})/.exec(n || ''); if (m && Number(m[2]) === ano) max = Math.max(max, Number(m[1])); });
    return 'SPDA-' + String(max + 1).padStart(4, '0') + '/' + ano;
  }

  var SPDA = {
    COLECOES: COLECOES, NIVEIS: NIVEIS, METODOS_CAPTACAO: METODOS_CAPTACAO, TIPOS_INSPECAO: TIPOS_INSPECAO, STATUS_LAUDO: STATUS_LAUDO,
    RESPOSTAS: RESPOSTAS, LIMITES_PADRAO: LIMITES_PADRAO, PERIODICIDADE_PADRAO_MESES: PERIODICIDADE_PADRAO_MESES, CHECKLIST: CHECKLIST,
    novaEdificacao: novaEdificacao, novoLaudo: novoLaudo, novaFoto: novaFoto, checklistEmBranco: checklistEmBranco,
    avaliarMedicoes: avaliarMedicoes, naoConformidades: naoConformidades, parecerSugerido: parecerSugerido,
    pendencias: pendencias, podeMudarStatus: podeMudarStatus, aoConcluir: aoConcluir, proximoNumero: proximoNumero, num: num
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SPDA; else raiz.SPDA = SPDA;
})(typeof window !== 'undefined' ? window : this);
