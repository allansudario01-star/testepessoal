class OCRService {
  constructor() {
    this.worker = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      if (typeof Tesseract === 'undefined') {
        await this.loadTesseract();
      }
      this.worker = await Tesseract.createWorker('por');
      this.initialized = true;
      console.log('✅ OCR inicializado');
    } catch (error) {
      console.error('Erro ao inicializar OCR:', error);
    }
  }

  loadTesseract() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async extrairDadosSelo(imageDataUrl) {
    await this.init();

    if (!this.worker) {
      alert('❌ OCR não inicializado. Tente novamente.');
      return null;
    }

    try {
      const { data: { text } } = await this.worker.recognize(imageDataUrl);
      console.log('📝 Texto extraído do OCR:', text);

      const dados = {
        notaFiscal: this.extrairNotaFiscal(text),
        recebedor: this.extrairRecebedor(text),
        hub: this.extrairHub(text),
        estado: this.extrairEstado(text),
        cidade: this.extrairCidade(text)
      };

      console.log('📊 Dados extraídos:', dados);

      // Verificar se encontrou pelo menos a nota fiscal
      if (!dados.notaFiscal && !dados.recebedor) {
        console.warn('⚠️ Poucos dados extraídos do OCR');
      }

      return dados;
    } catch (error) {
      console.error('Erro ao processar imagem:', error);
      return null;
    }
  }

  // Método para importar imagem do computador/dispositivo
  async importarImagem(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject('Nenhum arquivo selecionado');
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        const imageDataUrl = event.target.result;
        const dados = await this.extrairDadosSelo(imageDataUrl);
        resolve(dados);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  extrairNotaFiscal(texto) {
    // Baseado no selo: "Nº: 0000951176"
    const patterns = [
      /N[º°][:\s]*(\d+)/i,
      /NF[:\s]*(\d+)/i,
      /NOTA[:\s]*FISCAL[:\s]*(\d+)/i,
      /N[ÚU]MERO[:\s]*(\d+)/i,
      /PEDIDO[:\s]*EMBARCADOR[:\s]*(\d+)/i,
      /(\d{8,12})/  // Pega qualquer número com 8-12 dígitos
    ];

    for (const pattern of patterns) {
      const match = texto.match(pattern);
      if (match && match[1] && match[1].length >= 8) {
        return match[1];
      }
    }

    // Procura por números grandes no texto
    const numerosGrandes = texto.match(/\b\d{8,12}\b/g);
    if (numerosGrandes && numerosGrandes.length > 0) {
      return numerosGrandes[0];
    }

    return '';
  }

  extrairRecebedor(texto) {
    // Baseado no selo: "RECEBEDOR: HOSP SAO VICENTE DE PAULO"
    const patterns = [
      /RECEBEDOR[:\s]*([A-Z\s\u00C0-\u00FF]{3,50}?)(?:\n|$)/i,
      /RECEBEDOR[:\s]*([A-Z\s\u00C0-\u00FF]{3,50})/i,
      /DESTINAT[ÁA]RIO[:\s]*([A-Z\s\u00C0-\u00FF]{3,50}?)(?:\n|$)/i,
      /CLIENTE[:\s]*([A-Z\s\u00C0-\u00FF]{3,50}?)(?:\n|$)/i,
      /EXPEDIDOR[:\s]*([A-Z\s\u00C0-\u00FF]{3,50}?)(?:\n|$)/i
    ];

    for (const pattern of patterns) {
      const match = texto.match(pattern);
      if (match && match[1] && match[1].trim().length > 3) {
        let recebedor = match[1].trim();
        // Remove palavras comuns que podem vir junto
        recebedor = recebedor.replace(/^(HOSP|HOSPITAL|EMPRESA|LTDA|SA|S\/A)\s*/i, '');
        return recebedor.substring(0, 50);
      }
    }

    // Tenta encontrar linhas com texto em maiúsculas após "RECEBEDOR"
    const linhas = texto.split('\n');
    for (let i = 0; i < linhas.length; i++) {
      if (linhas[i].toUpperCase().includes('RECEBEDOR')) {
        if (i + 1 < linhas.length && linhas[i + 1].trim().length > 3) {
          return linhas[i + 1].trim().substring(0, 50);
        }
      }
    }

    return '';
  }

  extrairHub(texto) {
    // Baseado no selo: "UND DESTINO ORJ5000" e "ROTA ORJ5000"
    const patterns = [
      /UND[:\s]*DESTINO[:\s]*([A-Z0-9]{3,10})/i,
      /UNIDADE[:\s]*DESTINO[:\s]*([A-Z0-9]{3,10})/i,
      /ROTA[:\s]*([A-Z0-9]{3,10})/i,
      /HUB[:\s]*([A-Z0-9]{3,10})/i,
      /FILIAL[:\s]*([A-Z0-9]{3,10})/i
    ];

    for (const pattern of patterns) {
      const match = texto.match(pattern);
      if (match && match[1]) {
        return match[1].toUpperCase();
      }
    }
    return '';
  }

  extrairEstado(texto) {
    const estados = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

    // Procura no formato "UF CIDADE" ex: "RJ RIO DE JANEIRO"
    for (const estado of estados) {
      const regex = new RegExp(`\\b${estado}\\s+[A-Z\\s]{3,30}`, 'i');
      if (regex.test(texto)) return estado;

      const regexSimples = new RegExp(`\\b${estado}\\b`);
      if (regexSimples.test(texto)) return estado;
    }

    // Procura por siglas de estado no texto
    const siglaMatch = texto.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/i);
    if (siglaMatch) return siglaMatch[0].toUpperCase();

    return '';
  }

  extrairCidade(texto) {
    // Baseado no selo: "RJ RIO DE JANEIRO"
    const patterns = [
      /(?:RJ|SP|MG|RS|SC|PR|BA|PE|CE|DF)\s+([A-Z\s\u00C0-\u00FF]{3,30}?)(?:\n|$)/i,
      /CIDADE[:\s]*([A-Z\s\u00C0-\u00FF]{3,30}?)(?:\n|$)/i,
      /MUNIC[ÍI]PIO[:\s]*([A-Z\s\u00C0-\u00FF]{3,30}?)(?:\n|$)/i
    ];

    for (const pattern of patterns) {
      const match = texto.match(pattern);
      if (match && match[1] && match[1].trim().length > 3) {
        let cidade = match[1].trim();
        // Remove números e caracteres especiais
        cidade = cidade.replace(/[0-9]/g, '').trim();
        if (cidade.length > 2) return cidade.substring(0, 40);
      }
    }

    // Tenta encontrar após a UF
    const ufMatch = texto.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\s+([A-Z\s]{3,40})/i);
    if (ufMatch && ufMatch[2]) {
      return ufMatch[2].trim().substring(0, 40);
    }

    return '';
  }
}

window.OCRService = new OCRService();
