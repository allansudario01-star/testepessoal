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
      alert('❌ OCR não inicializado.');
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
      console.error('Erro no OCR:', error);
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
  // 🔧 NORMALIZAÇÃO (ESSENCIAL)
  // ================================
  normalizarTexto(texto) {
    return texto
      .toUpperCase()
      .replace(/O/g, '0')   // O → 0
      .replace(/I/g, '1')   // I → 1
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  // ================================
  // 🧾 NOTA FISCAL
  // ================================
  extrairNotaFiscal(texto) {
    const match = texto.match(/\b0*(\d{5,})\b/);
    return match ? match[1] : '';
  }

  // ================================
  // 👤 RECEBEDOR (RESISTENTE A ERRO)
  // ================================
  extrairRecebedor(texto) {
    const linhas = texto.split('\n');

    for (let linha of linhas) {
      const normalizada = this.normalizarTexto(linha);

      if (
        normalizada.includes('RECEBED') ||
        normalizada.includes('RECEB') ||
        normalizada.includes('MOSP') ||  // HOSP bugado
        normalizada.includes('HOSP')
      ) {
        return linha.trim();
      }
    }

    return '';
  }

  // ================================
  // 📦 HUB + SUBREGIÃO
  // ================================
  extrairHubInfo(texto) {
    const normalizado = this.normalizarTexto(texto);

    const match = normalizado.match(/\b0([A-Z]{3})(\d{3})\b/);

    if (match) {
      return {
        hub: match[1],
        subRegiao: match[2]
      };
    }

    return { hub: '', subRegiao: '' };
  }

  // ================================
  // 📊 VOLUME TOTAL
  // ================================
  extrairVolumeTotal(texto) {
    const numeros = texto.match(/\b\d{2,4}\b/g);

    if (!numeros) return '';

    let maior = numeros[0];

    for (let n of numeros) {
      if (parseInt(n) > parseInt(maior)) {
        maior = n;
      }
    }

    return maior;
  }

  // ================================
  // 🌎 ESTADO
  // ================================
  extrairEstado(texto) {
    const match = texto.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
    return match ? match[1] : '';
  }

  // ================================
  // 🏙️ CIDADE
  // ================================
  extrairCidade(texto) {
    const match = texto.match(/\bRJ\s+([A-Z\s]+)/i);

    if (match) {
      return match[1]
        .replace(/[^A-Z\s]/g, '')
        .trim();
    }

    return '';
  }
}

window.OCRService = new OCRService();
