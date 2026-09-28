// Arquivos de exemplo para os testes de upload (homologação, itens de ata,
// planilha de demanda e modelos de minuta). Usado pelo ambiente de teste
// local (ambiente-teste.js) e pelo ambiente hospedado (iniciar-demo.js), que
// os serve para download em /arquivos-teste/. Gerados a cada subida para
// sempre baterem com o formato que o código atual espera.
const fs = require('fs');
const path = require('path');

async function gerarArquivos(ARQUIVOS) {
  const XLSX = require('xlsx');
  const JSZip = require('jszip');
  fs.mkdirSync(ARQUIVOS, { recursive: true });

  // Célula numérica com formato de milhar — o caso que antes era lido 1000x menor.
  const comMilhar = (ws, colunas) => {
    const faixa = XLSX.utils.decode_range(ws['!ref']);
    for (let r = faixa.s.r; r <= faixa.e.r; r++) {
      for (const c of colunas) {
        const cel = ws[XLSX.utils.encode_cell({ r, c })];
        if (cel && typeof cel.v === 'number') cel.z = '#,##0.00';
      }
    }
  };
  const salvar = (nome, linhas, colunasNumericas = []) => {
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    comMilhar(ws, colunasNumericas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planilha1');
    XLSX.writeFile(wb, path.join(ARQUIVOS, nome));
  };

  const cabecalho = ['ITEM', 'QUANTIDADE', 'UNIDADE', 'DESCRIÇÃO', 'MARCA', 'MODELO', 'UNITÁRIO ADJUDICADO', 'TOTAL ADJUDICADO'];
  salvar('homologacao_exemplo.xlsx', [
    ['Fornecedor: FORNECEDOR MODELO LTDA- 00.000.000/0001-00'],
    cabecalho,
    [1, 1500, 'RESMA', 'Papel A4 75 g (resma com 500 folhas)', 'Chamex', 'A4', 21.9, 32850],
    [2, 2000, 'UN', 'Caneta esferográfica azul', 'Bic', 'Cristal', 1.8765, 3753],
    [],
    ['Fornecedor: PAPELARIA CENTRAL LTDA- 44.555.666/0001-77'],
    cabecalho,
    [3, 300, 'CX', 'Grampo 26/6 (caixa com 5000)', 'Jocar', '26/6', 6.5, 1950],
  ], [1, 6, 7]);
  salvar('itens_ata_exemplo.xlsx', [
    ['Item', 'Descrição', 'Unidade', 'Quantidade', 'Preço unitário'],
    [1, 'Água mineral 20 L', 'GL', 1200, 11.5],
    [2, 'Copo descartável 200 ml (pacote)', 'PCT', 3000, 4.35],
  ], [3, 4]);
  salvar('demanda_exemplo.xlsx', [
    ['Número do item', 'Quantidade'],
    [1, 10],
    [2, 5],
  ]);

  const docx = async (nome, paragrafos) => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    // cada parágrafo é uma lista de trechos (<w:r>) — o primeiro modelo
    // quebra um marcador em dois trechos, como o Word faz na prática
    const corpo = paragrafos.map((trechos) => `<w:p>${trechos.map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`).join('')}</w:p>`).join('');
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}</w:body></w:document>`);
    fs.writeFileSync(path.join(ARQUIVOS, nome), await zip.generateAsync({ type: 'nodebuffer' }));
  };
  await docx('modelo_CONTRATO.docx', [
    ['CONTRATO Nº {{numero_', 'contrato}}'],
    ['Processo {{numero_processo}} — Licitação {{licitacao_numero}}'],
    ['Contratada: {{fornecedor_razao_social}} (CNPJ {{fornecedor_cnpj}})'],
    ['Órgão: {{orgao_gerenciador}}'],
    ['Objeto: {{objeto_contrato}}'],
    ['Valor total: R$ {{valor_total}}'],
    ['Vigência: {{vigencia_inicial}} a {{vigencia_final}}'],
  ]);
  await docx('modelo_ARP.docx', [
    ['ATA DE REGISTRO DE PREÇOS {{numero_arp}}'],
    ['Detentor: {{fornecedor_razao_social}} (CNPJ {{fornecedor_cnpj}}) — Licitação {{licitacao_numero}}'],
    ['Vigência: {{vigencia_inicial}} a {{vigencia_final}}'],
  ]);
  await docx('modelo_ADITIVO.docx', [
    ['{{numero_aditivo}} ao contrato {{numero_contrato}}'],
    ['Tipo: {{tipo_aditivo}} — Percentual: {{percentual}} — Valor: R$ {{valor_acrescimo}} — Dias: {{dias_prorrogacao}}'],
    ['Fundamento: {{fundamento_legal}}. Justificativa: {{justificativa}}. Assinado em {{data_assinatura}}.'],
  ]);
  await docx('modelo_APOSTILAMENTO.docx', [
    ['Apostilamento ao contrato {{numero_contrato}} — {{tipo_apostilamento}}'],
    ['{{descricao}} (de R$ {{valor_anterior}} para R$ {{valor_novo}}) — {{data}}'],
  ]);
}


module.exports = { gerarArquivos };
