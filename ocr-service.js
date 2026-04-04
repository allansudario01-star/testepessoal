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

      console.log('📝 Texto OCR:', text);

      const hubInfo = this.extrairHubInfo(text);

      const dados = {
        notaFiscal: this.extrairNotaFiscal(text),
        recebedor: this.extrairRecebedor(text),
        hub: hubInfo.hub,
        subRegiao: hubInfo.subRegiao,
        volumeTotal: this.extrairVolumeTotal(text),
        estado: this.extrairEstado(text),
        cidade: this.extrairCidade(text)
      };

      console.log('📊 Dados extraídos:', dados);

      return dados;

    } catch (error) {
      console.error('Erro ao processar imagem:', error);
      return null;
    }
  }

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

  // ================================
  // EXTRAÇÕES CORRETAS
  // ================================

  extrairNotaFiscal(texto) {
    const match = texto.match(/\b0*(\d{5,})\b/);
    return match ? match[1] : '';
  }

  extrairRecebedor(texto) {
    const match = texto.match(/RECEBEDOR[:\s]*([A-Z\s\u00C0-\u00FF]+)/i);
    return match ? match[1].trim().substring(0, 50) : '';
  }

  extrairHubInfo(texto) {
    const match = texto.match(/\b0([A-Z]{3})(\d{3})\b/);

    if (match) {
      return {
        hub: match[1],        // RJS
        subRegiao: match[2]   // 000
      };
    }

    return { hub: '', subRegiao: '' };
  }

  extrairVolumeTotal(texto) {
    const matches = texto.match(/\b\d{4}\b/g);

    if (matches && matches.length >= 2) {
      return matches[matches.length - 1]; // pega o último (total)
    }

    return '';
  }

  extrairEstado(texto) {
    const match = texto.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
    return match ? match[1] : '';
  }

  extrairCidade(texto) {
    const match = texto.match(/\b(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\s+([A-Z\s\u00C0-\u00FF]+)/i);

    if (match && match[1]) {
      return match[1].replace(/[0-9]/g, '').trim();
    }

    return '';
  }
}

window.OCRService = new OCRService();
