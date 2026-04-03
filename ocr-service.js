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

      const dados = {
        notaFiscal: this.extrairNotaFiscal(text),
        recebedor: this.extrairRecebedor(text),
        hub: this.extrairHub(text),
        estado: this.extrairEstado(text),
        cidade: this.extrairCidade(text)
      };

      return dados;
    } catch (error) {
      console.error('Erro ao processar imagem:', error);
      return null;
    }
  }

  extrairNotaFiscal(texto) {
    const patterns = [
      /NF[:\s]*(\d+)/i,
      /NOTA[:\s]*FISCAL[:\s]*(\d+)/i,
      /N[º°][:\s]*(\d+)/i,
      /NUMERO[:\s]*(\d+)/i,
      /(\d{8,12})/
    ];

    for (const pattern of patterns) {
      const match = texto.match(pattern);
      if (match) return match[1];
    }
    return '';
  }

  extrairRecebedor(texto) {
    const patterns = [
      /RECEBEDOR[:\s]*([A-Z\s]{3,30}?)(?:\n|$)/i,
      /CLIENTE[:\s]*([A-Z\s]{3,30}?)(?:\n|$)/i,
      /DESTINAT[ÁA]RIO[:\s]*([A-Z\s]{3,30}?)(?:\n|$)/i
    ];

    for (const pattern of patterns) {
      const match = texto.match(pattern);
      if (match) return match[1].trim();
    }

    const linhas = texto.split('\n');
    for (const linha of linhas) {
      if (linha.length > 5 && linha.length < 40 && /[A-Z]{3,}/.test(linha)) {
        return linha.trim();
      }
    }
    return '';
  }

  extrairHub(texto) {
    const patterns = [
      /HUB[:\s]*([A-Z]{3,10})/i,
      /UNIDADE[:\s]*([A-Z]{3,10})/i,
      /FILIAL[:\s]*([A-Z]{3,10})/i
    ];

    for (const pattern of patterns) {
      const match = texto.match(pattern);
      if (match) return match[1].toUpperCase();
    }
    return '';
  }

  extrairEstado(texto) {
    const estados = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

    for (const estado of estados) {
      const regex = new RegExp(`\\b${estado}\\b`);
      if (regex.test(texto)) return estado;
    }
    return '';
  }

  extrairCidade(texto) {
    const patterns = [
      /CIDADE[:\s]*([A-Z\s]{3,30}?)(?:\n|$)/i,
      /MUNIC[ÍI]PIO[:\s]*([A-Z\s]{3,30}?)(?:\n|$)/i
    ];

    for (const pattern of patterns) {
      const match = texto.match(pattern);
      if (match) return match[1].trim();
    }

    const linhas = texto.split('\n');
    for (const linha of linhas) {
      if (linha.length > 4 && linha.length < 35 && /[A-Z]{3,}/.test(linha) && !linha.includes('NF')) {
        return linha.trim();
      }
    }
    return '';
  }
}

window.OCRService = new OCRService();
