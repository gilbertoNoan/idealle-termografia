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

  // Respostas prontas: problemas mais comuns de cada item, com a correção recomendada e a prioridade.
  // I = imediata (risco à vida ou SPDA sem função) · A = até 30 dias · B = até 90 dias
  var PRIORIDADES = { I: ['Imediata', 0], A: ['Até 30 dias', 30], B: ['Até 90 dias', 90] };
  var PROBLEMAS = {
    'CAP-01': [['Edificação sem subsistema de captação', 'Elaborar projeto e instalar o subsistema de captação conforme o nível de proteção definido no gerenciamento de risco (ABNT NBR 5419-3).', 'I'],
      ['Captação não cobre toda a cobertura (áreas desprotegidas)', 'Complementar a captação nas áreas desprotegidas, conforme projeto.', 'A'],
      ['Captação incompatível com o nível de proteção exigido', 'Readequar o subsistema de captação ao nível de proteção exigido.', 'A']],
    'CAP-02': [['Captor solto ou fora de prumo', 'Refixar e aprumar o captor, reapertando as conexões.', 'A'],
      ['Captor danificado ou corroído', 'Substituir o captor danificado.', 'A'],
      ['Captor ausente (retirado ou caído)', 'Reinstalar o captor na posição de projeto.', 'I']],
    'CAP-03': [['Condutor de captação rompido', 'Recompor a continuidade do condutor com conector adequado ou solda exotérmica.', 'I'],
      ['Condutor de captação solto (suportes faltando ou quebrados)', 'Refixar o condutor, repondo os suportes nos espaçamentos da ABNT NBR 5419-3.', 'A'],
      ['Condutor amassado ou com seção inferior à mínima', 'Substituir o trecho por condutor com a seção mínima da ABNT NBR 5419-3.', 'A']],
    'CAP-04': [['Malha de captação com vãos maiores que o permitido para o nível de proteção', 'Complementar a malha de captação para atender ao espaçamento do nível de proteção.', 'A'],
      ['Áreas fora do volume de proteção (esfera rolante / ângulo de proteção)', 'Instalar captores adicionais para cobrir as áreas desprotegidas.', 'A']],
    'CAP-05': [['Telha metálica com espessura insuficiente para captação natural', 'Instalar captação não natural sobre a cobertura ou comprovar a espessura conforme ABNT NBR 5419-3.', 'A'],
      ['Elementos naturais sem continuidade elétrica entre si', 'Interligar os elementos com conexões adequadas e medir a continuidade.', 'A']],
    'CAP-06': [['Equipamento na cobertura fora do volume de proteção', 'Instalar captor para proteger o equipamento ou interligá-lo ao SPDA, respeitando a distância de segurança.', 'A'],
      ['Equipamento metálico na cobertura não interligado ao SPDA', 'Interligar a carcaça metálica do equipamento ao subsistema de captação.', 'A'],
      ['Cabos de antena / sinal entrando na edificação sem proteção contra surtos', 'Instalar DPS na entrada dos cabos de antena e sinal.', 'B']],
    'CAP-07': [['Corrosão em conexões ou condutores', 'Limpar ou substituir as peças corroídas e aplicar proteção anticorrosiva.', 'B'],
      ['Emendas soltas ou conectores frouxos', 'Reapertar e substituir os conectores defeituosos.', 'A'],
      ['Peças faltando (suportes, conectores, terminais)', 'Repor as peças faltantes.', 'A']],
    'DES-01': [['Quantidade de descidas inferior à exigida para o nível de proteção', 'Instalar descidas adicionais para atender ao espaçamento do nível de proteção.', 'A'],
      ['Descidas mal distribuídas no perímetro', 'Redistribuir ou complementar as descidas ao longo do perímetro.', 'A']],
    'DES-02': [['Condutor de descida rompido', 'Recompor imediatamente a continuidade da descida.', 'I'],
      ['Descida com emendas indevidas (torção, amarração)', 'Substituir as emendas por conectores apropriados ou solda exotérmica.', 'A']],
    'DES-03': [['Descida solta (suportes faltando)', 'Refixar a descida e repor os suportes.', 'A'],
      ['Descida encostada em material combustível', 'Afastar a descida do material combustível ou protegê-la conforme ABNT NBR 5419-3.', 'A']],
    'DES-04': [['Descida sem proteção mecânica até 2,5 m do piso', 'Instalar proteção mecânica (eletroduto rígido) até 2,5 m do piso.', 'A'],
      ['Proteção mecânica danificada', 'Substituir a proteção mecânica danificada.', 'B'],
      ['Descida em área de circulação sem medida contra tensão de toque', 'Isolar a descida (ex.: 3 mm de polietileno reticulado) ou restringir o acesso com barreiras e avisos.', 'I']],
    'DES-05': [['Conector / caixa de medição ausente', 'Instalar conector de medição em cada descida.', 'B'],
      ['Caixa de medição sem identificação ou inacessível', 'Identificar e desobstruir as caixas de medição.', 'B']],
    'DES-06': [['Continuidade das armaduras / pilares não comprovada', 'Realizar o ensaio de continuidade das armaduras conforme ABNT NBR 5419-3 ou instalar descidas não naturais.', 'A']],
    'DES-07': [['Curvas acentuadas ou laços no condutor de descida', 'Refazer o trajeto do condutor eliminando laços e curvas fechadas.', 'B']],
    'ATE-01': [['Aterramento inexistente ou não localizado', 'Executar ou levantar o subsistema de aterramento conforme projeto (anel ou fundação).', 'I'],
      ['Aterramento diferente do projeto', 'Readequar o aterramento ao projeto ou atualizar o projeto (as built).', 'A']],
    'ATE-02': [['Conexões do aterramento corroídas', 'Refazer as conexões, preferencialmente com solda exotérmica.', 'A'],
      ['Haste ou cabo de aterramento rompido ou exposto', 'Recompor o eletrodo e a ligação ao condutor de descida.', 'A']],
    'ATE-03': [['Caixa de inspeção danificada, alagada ou soterrada', 'Recuperar a caixa de inspeção e manter o acesso livre.', 'B'],
      ['Caixa de inspeção sem tampa', 'Instalar tampa adequada na caixa de inspeção.', 'B']],
    'ATE-04': [['Aterramento do SPDA isolado dos demais aterramentos', 'Interligar os aterramentos (SPDA, elétrico e telecomunicações) ao BEP.', 'A']],
    'ATE-05': [['Obras ou escavações próximas ao aterramento', 'Verificar a integridade do aterramento após a obra e repetir as medições.', 'A']],
    'EQP-01': [['BEP inexistente', 'Instalar o barramento de equipotencialização principal (BEP) junto à entrada de energia.', 'A'],
      ['BEP sem identificação ou com conexões soltas', 'Identificar o BEP e reapertar as conexões.', 'B']],
    'EQP-02': [['Tubulações metálicas (água, gás, incêndio) não interligadas ao BEP', 'Interligar as tubulações metálicas ao BEP.', 'A'],
      ['Estruturas metálicas (escadas, guarda-corpos, trilhos) sem ligação equipotencial', 'Executar a ligação equipotencial das estruturas metálicas.', 'A']],
    'EQP-03': [['Ausência de BEL em pavimentos ou áreas técnicas', 'Instalar BEL nos locais necessários e interligá-los ao BEP.', 'B']],
    'EQP-04': [['Distância de segurança não respeitada (risco de centelhamento perigoso)', 'Aumentar o afastamento ou executar ligação equipotencial no ponto.', 'A']],
    'DPS-01': [['Ausência de DPS no quadro de entrada', 'Instalar DPS classe I (ou I+II) no quadro de entrada, coordenado com o SPDA.', 'A'],
      ['DPS do quadro de entrada com classe inadequada', 'Substituir por DPS com classe compatível com a instalação.', 'A']],
    'DPS-02': [['Ausência de DPS nos quadros de distribuição', 'Instalar DPS classe II nos quadros que alimentam equipamentos sensíveis.', 'B']],
    'DPS-03': [['DPS com indicação de falha ou danificado', 'Substituir o DPS danificado.', 'A']],
    'DPS-04': [['Condutores de ligação do DPS longos ou com laço', 'Encurtar os condutores de ligação do DPS (recomendado até 0,5 m no total).', 'B'],
      ['Seção do condutor de ligação do DPS inferior à mínima', 'Substituir pelo condutor com a seção mínima da ABNT NBR 5410.', 'B']],
    'DPS-05': [['Características do DPS não identificadas ou incompatíveis', 'Especificar DPS com Uc, Up e In/Iimp compatíveis com a instalação e substituir.', 'B']],
    'DOC-01': [['Projeto / as built do SPDA não disponível', 'Elaborar o projeto as built do SPDA.', 'B']],
    'DOC-02': [['Gerenciamento de risco não disponível', 'Elaborar o gerenciamento de risco conforme ABNT NBR 5419-2.', 'B']],
    'DOC-03': [['Relatórios de inspeções anteriores não disponíveis', 'Organizar e manter os registros das inspeções periódicas.', 'B']],
    'DOC-04': [['ART do projeto ou da instalação não disponível', 'Providenciar a ART do projeto ou da instalação junto ao CREA.', 'B']],
    'MED-ATE': [['Resistência de aterramento acima da referência', 'Melhorar o aterramento (hastes adicionais, anel ou tratamento do solo) e repetir a medição até atingir a referência.', 'A']],
    'MED-CON': [['Continuidade elétrica acima da referência', 'Localizar e corrigir o ponto de alta resistência (conexões e emendas) e repetir a medição de continuidade.', 'A']]
  };
  function problemasDe(codigo) { return (PROBLEMAS[codigo] || []).map(function (p) { return { t: p[0], rec: p[1], pr: p[2] }; }); }
  function maisUrgente(lista) { var o = ['I', 'A', 'B']; return (lista || []).map(function (p) { return p.pr; }).sort(function (a, b) { return o.indexOf(a) - o.indexOf(b); })[0] || ''; }

  function hojeISO() { return new Date().toISOString().slice(0, 10); }
  function somarMeses(iso, meses) { var d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + meses); return d.toISOString().slice(0, 10); }
  function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }
  // aceita número (6.2) ou texto brasileiro ("6,2", "1.234,5"); texto sem vírgula é lido como está ("6.2")
  function num(v) {
    if (typeof v === 'number') return v;
    if (v == null || String(v).trim() === '') return NaN;
    var t = String(v).trim();
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    return Number(t);
  }

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
    var nc = (laudo.checklist || []).filter(function (i) { return i.r === 'NC'; }).map(function (i) {
      var ps = i.problemas || [];
      return { codigo: i.codigo, texto: i.texto, obs: i.obs, fotos: i.fotos, problemas: ps,
        recomendacao: i.recomendacao || ps.map(function (p) { return p.rec; }).filter(function (x, k, a) { return x && a.indexOf(x) === k; }).join(' '),
        prioridade: i.prioridade || maisUrgente(ps) || 'A' };
    });
    avaliarMedicoes(laudo.medicoes).forEach(function (f) {
      var cod = 'MED-' + (f.tipo === 'aterramento' ? 'ATE' : 'CON'), pr = PROBLEMAS[cod][0];
      nc.push({ codigo: cod, texto: (f.tipo === 'aterramento' ? 'Resistência de aterramento' : 'Continuidade') + ' acima da referência em ' + (f.ref || '—') + ': ' + String(f.valor).replace('.', ',') + ' Ω (ref. ' + String(f.limite).replace('.', ',') + ' Ω)', obs: '', fotos: [],
        problemas: [], recomendacao: pr[1], prioridade: pr[2] });
    });
    return nc;
  }

  function parecerSugerido(laudo) {
    var ncs = naoConformidades(laudo), vazios = (laudo.checklist || []).filter(function (i) { return !i.r; }).length;
    if (vazios) return '';
    if (!ncs.length) return 'conforme';
    // só pendências de até 90 dias (ex.: documentação, identificação): conforme com ressalvas
    return ncs.every(function (x) { return x.prioridade === 'B'; }) ? 'conforme_ressalvas' : 'nao_conforme';
  }

  // O que falta para o laudo poder sair do rascunho (revisão) e para ser concluído
  function pendencias(laudo, paraConcluir) {
    var p = [];
    if (!laudo.edificacaoId) p.push('Escolher a edificação');
    if (!laudo.nivelProtecao) p.push('Informar o nível de proteção');
    var vazios = (laudo.checklist || []).filter(function (i) { return !i.r; }).length;
    if (vazios) p.push(vazios + ' item(ns) do checklist sem resposta');
    (laudo.checklist || []).forEach(function (i) { if (i.r === 'NC' && !String(i.obs || '').trim() && !(i.problemas || []).length) p.push(i.codigo + ': escolher o problema encontrado ou descrever'); });
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
  // Textos do laudo gerados pelo checklist e pelas medições (o engenheiro revisa e completa)
  function dataBr(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function br(n) { return String(Math.round(n * 100) / 100).replace('.', ','); }
  function textosAutomaticos(laudo) {
    var ck = laudo.checklist || [], m = laudo.medicoes || {}, lim = m.limites || LIMITES_PADRAO, ncs = naoConformidades(laudo), par = parecerSugerido(laudo);
    var verificados = ck.filter(function (i) { return i.r === 'C' || i.r === 'NC'; }).length, na = ck.filter(function (i) { return i.r === 'NA'; }).length;
    var at = (m.aterramento || []).map(function (x) { return num(x.valorOhm); }).filter(function (v) { return !isNaN(v); });
    var co = (m.continuidade || []).map(function (x) { return num(x.valorOhm); }).filter(function (v) { return !isNaN(v); });
    var nomeBloco = {}; CHECKLIST.forEach(function (b) { nomeBloco[b.bloco] = b.nome.replace(/^Subsistema de /, '').toLowerCase(); });
    var blocosNc = []; ck.forEach(function (i) { if (i.r === 'NC' && blocosNc.indexOf(nomeBloco[i.bloco]) < 0) blocosNc.push(nomeBloco[i.bloco]); });
    if (ncs.some(function (x) { return /^MED-/.test(x.codigo); })) blocosNc.push('medições elétricas');
    var t = 'O SPDA da edificação ' + (laudo.edificacaoNome || '') + ' foi inspecionado em ' + (dataBr(laudo.dataInspecao) || '—') + ', conforme a ABNT NBR 5419-3, com nível de proteção ' + (laudo.nivelProtecao ? 'NP ' + laudo.nivelProtecao : 'não informado') + '. ' +
      'Foram verificados ' + verificados + ' itens dos subsistemas de captação, descidas, aterramento, equipotencialização, proteção contra surtos e documentação' + (na ? ' (' + na + ' não aplicáveis)' : '') + '.';
    if (at.length) t += ' A resistência de aterramento foi medida em ' + at.length + ' ponto(s), com valores entre ' + br(Math.min.apply(null, at)) + ' e ' + br(Math.max.apply(null, at)) + ' Ω (referência ≤ ' + br(lim.aterramentoOhm) + ' Ω).';
    if (co.length) t += ' A continuidade elétrica foi medida em ' + co.length + ' trecho(s), com valor máximo de ' + br(Math.max.apply(null, co)) + ' Ω (referência ≤ ' + br(lim.continuidadeOhm) + ' Ω).';
    var cont = { I: 0, A: 0, B: 0 }; ncs.forEach(function (x) { cont[x.prioridade] = (cont[x.prioridade] || 0) + 1; });
    if (!ncs.length) t += '\n\nNão foram encontradas não conformidades. O SPDA encontra-se em conformidade com os requisitos verificados da ABNT NBR 5419.';
    else {
      t += '\n\nForam identificadas ' + ncs.length + ' não conformidade(s)' + (blocosNc.length ? ', em ' + blocosNc.join(', ') : '') + ': ' +
        [cont.I ? cont.I + ' de correção imediata' : '', cont.A ? cont.A + ' para até 30 dias' : '', cont.B ? cont.B + ' para até 90 dias' : ''].filter(Boolean).join(', ') + '. ';
      t += par === 'conforme_ressalvas' ? 'As pendências não comprometem a função de proteção do SPDA, que se encontra em conformidade com ressalvas até a execução do plano de ação.'
        : 'O SPDA não atende plenamente à ABNT NBR 5419 e deve ser corrigido conforme o plano de ação' + (cont.I ? ', com prioridade para os itens de correção imediata' : '') + '.';
    }
    var ordem = ['I', 'A', 'B'], recs = ncs.slice().sort(function (a, b) { return ordem.indexOf(a.prioridade) - ordem.indexOf(b.prioridade); });
    var r = recs.map(function (x, k) { return (k + 1) + '. [' + x.codigo + '] ' + (x.recomendacao || 'Corrigir: ' + (x.obs || x.texto)) + ' Prazo: ' + (PRIORIDADES[x.prioridade] || PRIORIDADES.A)[0].toLowerCase() + '.'; });
    r.push((recs.length + 1) + '. Realizar nova inspeção em ' + (Number(laudo.periodicidadeMeses) || PERIODICIDADE_PADRAO_MESES) + ' meses, ou antes, após descarga atmosférica na edificação, reformas ou ampliações.');
    if (recs.length) r.push((recs.length + 2) + '. Após as correções, repetir as medições e registrar a verificação em relatório.');
    return { parecer: par, texto: t, recomendacoes: r.join('\n') };
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

  // ---------- Gerenciamento de risco por zonas (ABNT NBR 5419-2:2015, risco R1 - perda de vida humana) ----------
  // Zona (ZS): parte da edificação com características próprias (piso, risco de incêndio, ocupação).
  // Aqui calculamos as componentes devidas à descarga NA ESTRUTURA (fonte S1): RA (choque por toque/passo) e
  // RB (danos físicos/incêndio). As componentes RC/RM (sistemas internos) e RU/RV/RW/RZ (linhas) ficam por conta
  // do engenheiro (DPS e linhas), e o laudo diz isso.
  var RISCO = {
    RT: 1e-5, // risco tolerável para perda de vida humana (Tabela 4)
    LT: 1e-2, // perda típica por choque (Tabela C.2)
    PISO: { // rt - Tabela C.3
      concreto: ['Agricultura, concreto', 1e-2], ceramica: ['Mármore, cerâmica', 1e-3],
      carpete: ['Cascalho, tapete, carpete', 1e-4], madeira: ['Asfalto, linóleo, madeira', 1e-5]
    },
    INCENDIO: { // rf - Tabela C.5
      explosao_0_20: ['Explosão: zonas 0, 20 e explosivos sólidos', 1], explosao_1_21: ['Explosão: zonas 1, 21', 1e-1], explosao_2_22: ['Explosão: zonas 2, 22', 1e-3],
      alto: ['Incêndio alto', 1e-1], normal: ['Incêndio normal', 1e-2], baixo: ['Incêndio baixo', 1e-3], nenhum: ['Sem risco de incêndio ou explosão', 0]
    },
    PROVIDENCIAS: { // rp - Tabela C.4
      nenhuma: ['Nenhuma providência', 1], manuais: ['Extintores, hidrantes, alarme manual, rotas de fuga', 0.5], automaticas: ['Instalações automáticas (sprinklers, alarme automático)', 0.2]
    },
    PERIGO: { // hz - Tabela C.6
      nenhum: ['Sem perigo especial', 1], panico_baixo: ['Baixo nível de pânico (até 2 pavimentos e até 100 pessoas)', 2],
      panico_medio: ['Nível médio de pânico (100 a 1.000 pessoas)', 5], evacuacao: ['Dificuldade de evacuação (ex.: hospitais)', 5], panico_alto: ['Alto nível de pânico (mais de 1.000 pessoas)', 10]
    },
    OCUPACAO: { // LF - Tabela C.2 (tipo da zona)
      explosao: ['Risco de explosão', 1e-1], hospital: ['Hospital, hotel, escola, edifício cívico', 1e-1], publico: ['Entretenimento público, igreja, museu', 5e-2],
      industrial: ['Industrial, comercial', 2e-2], outros: ['Outros', 1e-2]
    },
    TOQUE: { // PTA - Tabela B.1
      nenhuma: ['Nenhuma medida de proteção', 1], avisos: ['Avisos de alerta', 1e-1], isolacao: ['Isolação elétrica da descida (3 mm de polietileno reticulado)', 1e-2],
      equipot: ['Equipotencialização efetiva do solo', 1e-2], barreira: ['Barreiras físicas ou estrutura usada como descida', 0]
    },
    LOCALIZACAO: { // CD - Tabela A.1
      cercada_altos: ['Cercada por objetos mais altos', 0.25], cercada_iguais: ['Cercada por objetos da mesma altura ou mais baixos', 0.5],
      isolada: ['Isolada: nenhum outro objeto nas vizinhanças', 1], colina: ['Isolada no topo de uma colina ou monte', 2]
    },
    PB: { nenhum: 1, IV: 0.2, III: 0.1, II: 0.05, I: 0.02 }, // Tabela B.2
    ORDEM_NP: ['nenhum', 'IV', 'III', 'II', 'I'] // do menos para o mais rigoroso
  };
  function novaZona(dados) {
    dados = dados || {};
    return { id: dados.id || ('z' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)), nome: dados.nome || '', descricao: dados.descricao || '',
      piso: dados.piso || 'concreto', incendio: dados.incendio || 'normal', providencias: dados.providencias || 'manuais', perigo: dados.perigo || 'nenhum',
      ocupacao: dados.ocupacao || 'industrial', toque: dados.toque || 'nenhuma', pessoas: dados.pessoas == null ? '' : dados.pessoas, horasAno: dados.horasAno == null ? 8760 : dados.horasAno,
      materiaisPerigosos: !!dados.materiaisPerigosos, npAdotado: dados.npAdotado || '', justificativa: dados.justificativa || '' };
  }
  function coef(tab, chave, padrao) { var x = RISCO[tab][chave] || RISCO[tab][padrao]; return x[1]; }
  function areaColeta(L, W, H) { return L * W + 2 * (3 * H) * (L + W) + Math.PI * Math.pow(3 * H, 2); } // AD - Equação A.2
  var ALERTA_NP_I = 'O Nível I não basta para baixar o risco ao tolerável: são necessárias medidas adicionais ' +
    '(ex.: blindagem/isolação das descidas, equipotencialização do solo, barreiras e avisos contra tensão de toque e passo, ' +
    'proteção automática contra incêndio, restrição de permanência de pessoas nas zonas críticas).';
  // Sugestão automática do NP (NBR 5419-2): risco sem proteção; se passar de RT, testa NP IV, III, II e I (Tabela B.2, PB)
  // e devolve o primeiro que atende. riscoCom(np) recebe 'nenhum' ou o nível e devolve R1 da estrutura.
  function sugerirNivelProtecao(riscoCom, rt) {
    rt = rt || RISCO.RT;
    var semProtecao = riscoCom('nenhum'), tentativas = [{ nivel: 'nenhum', risco: semProtecao, atende: semProtecao <= rt }];
    if (semProtecao <= rt) return { riscoSemProtecao: semProtecao, spdaObrigatorio: false, nivel: 'nenhum', nivelSugerido: 'Não requerido', riscoCalculado: semProtecao, alerta: '', tentativas: tentativas };
    var niveis = ['IV', 'III', 'II', 'I'];
    for (var i = 0; i < niveis.length; i++) {
      var r = riscoCom(niveis[i]);
      tentativas.push({ nivel: niveis[i], risco: r, atende: r <= rt });
      if (r <= rt) return { riscoSemProtecao: semProtecao, spdaObrigatorio: true, nivel: niveis[i], nivelSugerido: niveis[i], riscoCalculado: r, alerta: '', tentativas: tentativas };
    }
    return { riscoSemProtecao: semProtecao, spdaObrigatorio: true, nivel: 'insuficiente', nivelSugerido: 'Especial (Nível I insuficiente - exige medidas extras)',
      riscoCalculado: tentativas[tentativas.length - 1].risco, alerta: ALERTA_NP_I, tentativas: tentativas };
  }
  // Calcula RA e RB por zona e o total da estrutura para cada NP; sugere o NP mínimo (RA + RB <= RT).
  function calcularRisco(ed) {
    var dm = (ed && ed.dimensoes) || {}, r = (ed && ed.risco) || {}, zonas = r.zonas || [];
    var L = num(dm.comprimentoM), W = num(dm.larguraM), H = num(dm.alturaM), NG = num(r.ng), CD = coef('LOCALIZACAO', r.localizacao, 'cercada_iguais');
    var faltam = [];
    if (!(L > 0 && W > 0 && H > 0)) faltam.push('dimensões da edificação (comprimento, largura e altura)');
    if (!(NG > 0)) faltam.push('densidade de descargas NG (descargas/km²/ano)');
    if (!zonas.length) faltam.push('pelo menos uma zona');
    var nt = num(r.pessoasTotal) || zonas.reduce(function (t, z) { return t + num(z.pessoas); }, 0);
    if (zonas.length && !(nt > 0)) faltam.push('número de pessoas nas zonas');
    var AD = L > 0 && W > 0 && H > 0 ? areaColeta(L, W, H) : 0, ND = NG * AD * CD * 1e-6; // Equação A.4
    var porZona = zonas.map(function (z) {
      var f = nt > 0 ? (num(z.pessoas) / nt) * (Math.min(8760, num(z.horasAno)) / 8760) : 0;
      var rt = coef('PISO', z.piso, 'concreto'), rf = coef('INCENDIO', z.incendio, 'normal'), rp = coef('PROVIDENCIAS', z.providencias, 'nenhuma'), hz = coef('PERIGO', z.perigo, 'nenhum');
      var LF = coef('OCUPACAO', z.ocupacao, 'outros'), PTA = coef('TOQUE', z.toque, 'nenhuma');
      var LA = rt * RISCO.LT * f, LB = rp * rf * hz * LF * f; // Equações C.1 e C.3
      var porNp = {};
      RISCO.ORDEM_NP.forEach(function (np) { var PB = RISCO.PB[np]; porNp[np] = { RA: ND * PTA * PB * LA, RB: ND * PB * LB }; porNp[np].R = porNp[np].RA + porNp[np].RB; });
      var npMin = RISCO.ORDEM_NP.filter(function (np) { return porNp[np].R <= RISCO.RT; })[0] || 'insuficiente';
      return { id: z.id, nome: z.nome, f: f, rt: rt, rf: rf, rp: rp, hz: hz, LF: LF, PTA: PTA, LA: LA, LB: LB, porNp: porNp, npMinimo: npMin };
    });
    var total = {}; RISCO.ORDEM_NP.forEach(function (np) { total[np] = porZona.reduce(function (t, z) { return t + z.porNp[np].R; }, 0); });
    var sug = faltam.length ? null : sugerirNivelProtecao(function (np) { return total[np]; });
    var npMinimo = sug ? sug.nivel : '';
    // NP adotado: o mais rigoroso entre o mínimo calculado e o escolhido em cada zona
    var npAdotado = npMinimo === 'insuficiente' ? 'I' : npMinimo;
    zonas.forEach(function (z) { if (z.npAdotado && RISCO.ORDEM_NP.indexOf(z.npAdotado) > RISCO.ORDEM_NP.indexOf(npAdotado)) npAdotado = z.npAdotado; });
    var R = faltam.length || !npAdotado ? null : total[npAdotado];
    return { faltam: faltam, L: L, W: W, H: H, NG: NG, CD: CD, AD: AD, ND: ND, nt: nt, zonas: porZona, total: total, npMinimo: npMinimo, npAdotado: faltam.length ? '' : npAdotado, R: R,
      spdaObrigatorio: sug ? sug.spdaObrigatorio : null, nivelSugerido: sug ? sug.nivelSugerido : '', riscoSemProtecao: sug ? sug.riscoSemProtecao : null,
      riscoCalculado: sug ? sug.riscoCalculado : null, alerta: sug ? sug.alerta : '', tentativas: sug ? sug.tentativas : [] };
  }

  var SPDA = {
    COLECOES: COLECOES, NIVEIS: NIVEIS, METODOS_CAPTACAO: METODOS_CAPTACAO, TIPOS_INSPECAO: TIPOS_INSPECAO, STATUS_LAUDO: STATUS_LAUDO,
    RESPOSTAS: RESPOSTAS, LIMITES_PADRAO: LIMITES_PADRAO, PERIODICIDADE_PADRAO_MESES: PERIODICIDADE_PADRAO_MESES, CHECKLIST: CHECKLIST,
    novaEdificacao: novaEdificacao, novoLaudo: novoLaudo, novaFoto: novaFoto, checklistEmBranco: checklistEmBranco,
    avaliarMedicoes: avaliarMedicoes, naoConformidades: naoConformidades, parecerSugerido: parecerSugerido,
    pendencias: pendencias, podeMudarStatus: podeMudarStatus, aoConcluir: aoConcluir, proximoNumero: proximoNumero, num: num,
    PROBLEMAS: PROBLEMAS, PRIORIDADES: PRIORIDADES, problemasDe: problemasDe, textosAutomaticos: textosAutomaticos,
    RISCO: RISCO, novaZona: novaZona, calcularRisco: calcularRisco, areaColeta: areaColeta, sugerirNivelProtecao: sugerirNivelProtecao
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SPDA; else raiz.SPDA = SPDA;
})(typeof window !== 'undefined' ? window : this);
