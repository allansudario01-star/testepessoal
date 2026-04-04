class PalletService {
    constructor() {
        this.pallets = new Map();
        this.finalizados = new Map();
        this.agendamentoService = null;
        this.loadFromStorage();
        this.setupRealtimeListener();
    }

    setAgendamentoService(service) {
        this.agendamentoService = service;
    }

    setupRealtimeListener() {
        if (window.db) {
            window.db.collection('agendamentos').onSnapshot(() => {
                if (window.renderizarPallets) {
                    window.renderizarPallets();
                }
            });
        }
    }

    loadFromStorage() {
        const saved = localStorage.getItem('pallets');
        if (saved) {
            try {
                const lista = JSON.parse(saved);
                lista.forEach(p => this.pallets.set(p.id, p));
            } catch (e) {
            }
        }

        const finalizados = localStorage.getItem('palletsFinalizados');
        if (finalizados) {
            try {
                const lista = JSON.parse(finalizados);
                lista.forEach(p => this.finalizados.set(p.id, p));
            } catch (e) {
            }
        }
    }

    saveToStorage() {
        const lista = Array.from(this.pallets.values());
        localStorage.setItem('pallets', JSON.stringify(lista));
    }

    saveFinalizadosToStorage() {
        const lista = Array.from(this.finalizados.values());
        localStorage.setItem('palletsFinalizados', JSON.stringify(lista));
    }

    async create(data, tipo) {
        const id = Date.now().toString();
        const basePallet = {
            id,
            tipo: tipo,
            criadoEm: new Date().toISOString(),
            ultimaAtualizacao: new Date().toISOString(),
            status: 'ativo',
            bipado: false,
            palletsVinculados: [],
            palletPrincipalId: null,
            observacao: ''
        };

        let novo;
        if (tipo === 'VOLUMETRIA_ALTA') {
            novo = {
                ...basePallet,
                notaFiscal: data.notaFiscal.toUpperCase().trim(),
                recebedor: data.recebedor.toUpperCase().trim(),
                hub: data.hub.toUpperCase().trim(),
                estado: data.estado.toUpperCase().trim(),
                cidade: data.cidade.toUpperCase().trim(),
                regiao: data.regiao.toUpperCase().trim(),
                subregiao: data.subregiao ? data.subregiao.toString().replace(/\D/g, '') : '',
                maxVolumes: parseInt(data.maxVolumes),
                volumesAtuais: 0,
                volumesDiversos: false
            };
        } else if (tipo === 'AGENDAMENTO') {
            novo = {
                ...basePallet,
                notaFiscal: data.notaFiscal.toUpperCase().trim(),
                recebedor: data.recebedor.toUpperCase().trim(),
                hub: data.hub.toUpperCase().trim(),
                estado: data.estado.toUpperCase().trim(),
                cidade: data.cidade.toUpperCase().trim(),
                regiao: data.regiao.toUpperCase().trim(),
                subregiao: data.subregiao ? data.subregiao.toString().replace(/\D/g, '') : '',
                maxVolumes: data.maxVolumes,
                volumesAtuais: 0,
                volumesDiversos: data.volumesDiversos || false,
                volumesTexto: data.volumesTexto || 'DIVERSOS'
            };
        } else {
            novo = {
                ...basePallet,
                notaFiscal: 'DIVERSOS',
                recebedor: 'DIVERSOS',
                hub: data.hub.toUpperCase().trim(),
                estado: data.estado.toUpperCase().trim(),
                cidade: 'DIVERSOS',
                regiao: data.regiao.toUpperCase().trim(),
                subregiao: data.subregiao ? data.subregiao.toString().replace(/\D/g, '') : '',
                maxVolumes: null,
                volumesAtuais: null
            };
        }

        this.pallets.set(id, novo);
        this.saveToStorage();

        try {
            await window.db.collection('pallets').doc(id).set(novo);
        } catch (e) {
        }

        return novo;
    }

    async anexarPallet(idPalletPrincipal) {
        const palletPrincipal = this.pallets.get(idPalletPrincipal);
        if (!palletPrincipal || palletPrincipal.tipo !== 'VOLUMETRIA_ALTA') {
            return null;
        }

        const novoId = Date.now().toString();
        const palletAnexado = {
            ...palletPrincipal,
            id: novoId,
            palletPrincipalId: idPalletPrincipal,
            criadoEm: new Date().toISOString(),
            ultimaAtualizacao: new Date().toISOString(),
            status: 'ativo',
            volumesAtuais: 0,
            palletsVinculados: []
        };

        this.pallets.set(novoId, palletAnexado);

        if (!palletPrincipal.palletsVinculados) {
            palletPrincipal.palletsVinculados = [];
        }
        palletPrincipal.palletsVinculados.push(novoId);
        this.pallets.set(idPalletPrincipal, palletPrincipal);

        this.saveToStorage();

        try {
            await window.db.collection('pallets').doc(novoId).set(palletAnexado);
            await window.db.collection('pallets').doc(idPalletPrincipal).update({
                palletsVinculados: palletPrincipal.palletsVinculados
            });
        } catch (e) {
        }

        return palletAnexado;
    }

    async updateVolumes(id, novosVolumes) {
        const pallet = this.pallets.get(id);
        if (!pallet || pallet.tipo === 'DIVERSOS') return;
        if (pallet.volumesDiversos) return;

        pallet.volumesAtuais = Math.min(novosVolumes, pallet.maxVolumes);
        if (pallet.volumesAtuais < 0) pallet.volumesAtuais = 0;

        pallet.ultimaAtualizacao = new Date().toISOString();

        this.saveToStorage();

        try {
            await window.db.collection('pallets').doc(id).update({
                volumesAtuais: pallet.volumesAtuais,
                ultimaAtualizacao: pallet.ultimaAtualizacao
            });
        } catch (e) {
        }
    }

    async finalizar(id, bipado = false) {
        const pallet = this.pallets.get(id);
        if (!pallet) return;

        if (pallet.palletPrincipalId) {
            const principal = this.pallets.get(pallet.palletPrincipalId);
            if (principal && principal.palletsVinculados) {
                const index = principal.palletsVinculados.indexOf(id);
                if (index > -1) principal.palletsVinculados.splice(index, 1);
                this.pallets.set(principal.id, principal);
                this.saveToStorage();
            }
        }

        if (pallet.tipo === 'VOLUMETRIA_ALTA' && pallet.palletsVinculados && pallet.palletsVinculados.length > 0) {
            for (const anexoId of pallet.palletsVinculados) {
                const anexo = this.pallets.get(anexoId);
                if (anexo && anexo.status === 'ativo') {
                    anexo.finalizadoEm = new Date().toISOString();
                    anexo.bipado = bipado;
                    anexo.status = 'finalizado';
                    this.finalizados.set(anexoId, anexo);
                    this.pallets.delete(anexoId);
                }
            }
        }

        pallet.finalizadoEm = new Date().toISOString();
        pallet.bipado = bipado;
        pallet.status = 'finalizado';

        this.finalizados.set(id, pallet);
        this.pallets.delete(id);

        this.saveToStorage();
        this.saveFinalizadosToStorage();

        try {
            await window.db.collection('pallets').doc(id).delete();
            await window.db.collection('palletsFinalizados').doc(id).set(pallet);
        } catch (e) {
        }
    }

    async excluir(id) {
        const pallet = this.pallets.get(id);
        if (!pallet) return;

        if (pallet.palletPrincipalId) {
            const principal = this.pallets.get(pallet.palletPrincipalId);
            if (principal && principal.palletsVinculados) {
                const index = principal.palletsVinculados.indexOf(id);
                if (index > -1) principal.palletsVinculados.splice(index, 1);
                this.pallets.set(principal.id, principal);
            }
        }

        this.pallets.delete(id);
        this.saveToStorage();

        try {
            await window.db.collection('pallets').doc(id).delete();
        } catch (e) {
        }
    }

    listar(buscaNF = '') {
        let lista = Array.from(this.pallets.values());

        if (buscaNF) {
            lista = lista.filter(p => p.notaFiscal?.includes(buscaNF.toUpperCase()));
        }

        return lista.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
    }

    listarFinalizados(busca = '') {
        let lista = Array.from(this.finalizados.values());

        if (busca) {
            const buscaUpper = busca.toUpperCase();
            lista = lista.filter(p =>
                p.notaFiscal?.toUpperCase().includes(buscaUpper) ||
                p.recebedor?.toUpperCase().includes(buscaUpper) ||
                p.hub?.toUpperCase().includes(buscaUpper) ||
                p.estado?.toUpperCase().includes(buscaUpper)
            );
        }

        return lista.sort((a, b) =>
            new Date(b.finalizadoEm) - new Date(a.finalizadoEm)
        );
    }

    limparHistorico() {
        this.finalizados.clear();
        this.saveFinalizadosToStorage();
    }

    obterTotalPalletsGrupo(pallet) {
        if (pallet.tipo !== 'VOLUMETRIA_ALTA') return 1;

        if (pallet.palletPrincipalId) {
            const principal = this.pallets.get(pallet.palletPrincipalId);
            if (principal) {
                return 1 + (principal.palletsVinculados?.length || 0);
            }
        }

        return 1 + (pallet.palletsVinculados?.length || 0);
    }

    obterIndiceNoGrupo(pallet) {
        if (pallet.tipo !== 'VOLUMETRIA_ALTA') return 1;

        if (!pallet.palletPrincipalId) {
            return 1;
        }

        const principal = this.pallets.get(pallet.palletPrincipalId);
        if (principal && principal.palletsVinculados) {
            const index = principal.palletsVinculados.indexOf(pallet.id);
            if (index !== -1) {
                return index + 2;
            }
        }

        return 1;
    }

    gerarQRCode(codigo) {
        if (!codigo) return null;
        return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(codigo)}`;
    }

    gerarEtiquetaHTML(pallet, codigoLista = null) {
        const dataAtual = new Date();
        const dataHora = dataAtual.toLocaleString('pt-BR');
        const qrCodeUrl = codigoLista ? this.gerarQRCode(codigoLista) : null;

        const volumesDisplay = pallet.volumesDiversos
            ? (pallet.volumesTexto || 'DIVERSOS')
            : `${pallet.volumesAtuais || 0} / ${pallet.maxVolumes || ''}`;

        const totalPallets = this.obterTotalPalletsGrupo(pallet);
        const indiceAtual = this.obterIndiceNoGrupo(pallet);
        const palletsDisplay = pallet.tipo === 'VOLUMETRIA_ALTA'
            ? `${indiceAtual} / ${totalPallets}`
            : '';

        return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Formulário Operacional - ${pallet.notaFiscal || 'DIVERSOS'}</title>
<style>
    @page {
        size: A4;
        margin: 0;
    }
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }
    body {
        font-family: 'Helvetica', 'Arial', sans-serif;
        background: white;
        margin: 0;
        padding: 0;
    }
    .page {
        width: 210mm;
        height: 297mm;
        position: relative;
        background: white;
        padding: 12mm 15mm;
    }

    /* Grid principal */
    .main-grid {
        display: flex;
        gap: 10mm;
        width: 100%;
    }

    /* Lado esquerdo */
    .left-side {
        flex: 2;
    }

    /* Lado direito (QR Code) */
    .right-side {
        flex: 1;
        display: flex;
        justify-content: flex-end;
        align-items: flex-start;
    }
    .qrcode-box {
        width: 45mm;
        height: 45mm;
        border: 1px solid #ddd;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #fafafa;
    }
    .qrcode-box img {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }

    /* Cabeçalho */
    .header-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8mm;
        padding-bottom: 3mm;
        border-bottom: 1px solid #ccc;
    }
    .campo-container {
        font-size: 10px;
        font-weight: bold;
    }
    .campo-linha {
        border-bottom: 1px solid #000;
        min-width: 70mm;
        display: inline-block;
        margin-left: 5px;
    }

    /* Info linha (Região, Sub, Cidade, UF) */
    .info-row {
        display: flex;
        gap: 8mm;
        margin-bottom: 10mm;
        justify-content: space-between;
    }
    .info-block {
        flex: 1;
    }
    .info-label {
        font-size: 9px;
        font-weight: bold;
        margin-bottom: 2mm;
        color: #333;
    }
    .info-value {
        font-size: 20px;
        font-weight: bold;
        padding: 3mm 0;
        border-bottom: 1px solid #000;
    }
    .cidade-value {
        font-size: 14px;
    }

    /* Embarcador / Recebedor */
    .embarcador-row {
        margin-bottom: 8mm;
    }
    .embarcador-item {
        display: flex;
        align-items: baseline;
        margin-bottom: 6mm;
    }
    .embarcador-label {
        font-size: 10px;
        font-weight: bold;
        width: 25mm;
    }
    .embarcador-linha {
        border-bottom: 1px solid #000;
        flex: 1;
        margin-left: 5mm;
        height: 8mm;
    }
    .recebedor-text {
        font-size: 12px;
        font-weight: bold;
        margin-left: 5mm;
    }

    /* Volumes e Pallets */
    .volumes-row {
        display: flex;
        gap: 20mm;
        margin-bottom: 8mm;
    }
    .volumes-item {
        flex: 1;
    }
    .volumes-label {
        font-size: 10px;
        font-weight: bold;
        margin-bottom: 2mm;
    }
    .volumes-value {
        font-size: 22px;
        font-weight: bold;
        padding: 3mm 0;
        border-bottom: 1px solid #000;
    }

    /* Conferência e Perecíveis */
    .check-row {
        display: flex;
        gap: 20mm;
        margin-bottom: 8mm;
    }
    .check-group {
        display: flex;
        gap: 5mm;
        align-items: center;
    }
    .checkbox {
        width: 5mm;
        height: 5mm;
        border: 1px solid #000;
        display: inline-block;
        background: white;
    }
    .checkbox-label {
        font-size: 10px;
    }

    /* Destinatário e NF */
    .destinatario-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8mm;
        align-items: baseline;
    }
    .destinatario-group {
        display: flex;
        gap: 5mm;
        align-items: center;
    }
    .nf-text {
        font-size: 12px;
        font-weight: bold;
    }

    /* Responsável separar */
    .resp-separar {
        margin-bottom: 12mm;
    }
    .resp-label {
        font-size: 10px;
        font-weight: bold;
        margin-bottom: 3mm;
    }
    .resp-linha {
        border-bottom: 1px solid #000;
        width: 100%;
        height: 8mm;
    }

    /* Seção Serviço */
    .servico-section {
        margin: 10mm 0;
        padding-top: 5mm;
        border-top: 1px solid #ccc;
    }
    .servico-title {
        font-size: 12px;
        font-weight: bold;
        margin-bottom: 5mm;
        background: #f0f0f0;
        padding: 2mm 3mm;
    }
    .servico-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 5mm;
        flex-wrap: wrap;
    }
    .servico-check-group {
        display: flex;
        gap: 3mm;
        align-items: center;
        flex: 2;
    }
    .servico-data {
        font-size: 10px;
        display: flex;
        align-items: center;
        gap: 3mm;
    }
    .servico-linha {
        border-bottom: 1px solid #000;
        width: 40mm;
        height: 6mm;
    }

    /* Tabela de Trechos */
    .trechos-section {
        margin: 8mm 0;
    }
    .trechos-title {
        font-size: 12px;
        font-weight: bold;
        margin-bottom: 5mm;
        background: #f0f0f0;
        padding: 2mm 3mm;
    }
    .trecho-card {
        margin-bottom: 6mm;
        border: 1px solid #e0e0e0;
        padding: 4mm;
        border-radius: 2mm;
    }
    .trecho-header {
        font-weight: bold;
        font-size: 11px;
        margin-bottom: 3mm;
        background: #f9f9f9;
        padding: 2mm;
    }
    .trecho-linha {
        display: flex;
        gap: 5mm;
        margin-bottom: 3mm;
        flex-wrap: wrap;
        align-items: baseline;
    }
    .trecho-campo {
        border-bottom: 1px solid #000;
        min-width: 35mm;
        height: 7mm;
        display: inline-block;
    }
    .trecho-label {
        font-size: 9px;
        font-weight: bold;
        min-width: 30mm;
    }

    /* Responsável planejamento */
    .resp-planejamento {
        margin-top: 8mm;
        padding-top: 5mm;
        border-top: 1px solid #ccc;
    }
    .planejamento-linha {
        border-bottom: 1px solid #000;
        width: 100%;
        height: 8mm;
        margin-top: 3mm;
    }

    /* Botão de impressão */
    .no-print {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 10px 20px;
        background: #2c3e50;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        z-index: 1000;
    }
    @media print {
        .no-print {
            display: none;
        }
        .page {
            padding: 0;
        }
    }
</style>
</head>
<body>
<div class="page">
    <!-- CABEÇALHO -->
    <div class="header-row">
        <div class="campo-container">Nº OS do Container: <span class="campo-linha"></span></div>
        <div class="campo-container">Data/Hora: ${dataHora}</div>
    </div>

    <!-- INFORMAÇÕES PRINCIPAIS (Região, Sub, Cidade, UF) -->
    <div class="info-row">
        <div class="info-block">
            <div class="info-label">REGIÃO</div>
            <div class="info-value">${pallet.regiao || ''}</div>
        </div>
        <div class="info-block">
            <div class="info-label">SUB-REGIÃO</div>
            <div class="info-value" style="font-size: 18px;">${pallet.subregiao || ''}</div>
        </div>
        <div class="info-block">
            <div class="info-label">CIDADE</div>
            <div class="info-value cidade-value">${pallet.cidade || ''}</div>
        </div>
        <div class="info-block">
            <div class="info-label">UF</div>
            <div class="info-value" style="font-size: 20px;">${pallet.estado || ''}</div>
        </div>
    </div>

    <!-- LADO ESQUERDO + QR CODE -->
    <div class="main-grid">
        <div class="left-side">
            <!-- Embarcador / Recebedor -->
            <div class="embarcador-row">
                <div class="embarcador-item">
                    <div class="embarcador-label">Embarcador:</div>
                    <div class="embarcador-linha"></div>
                </div>
                <div class="embarcador-item">
                    <div class="embarcador-label">Recebedor:</div>
                    <div class="recebedor-text">${pallet.recebedor || ''}</div>
                </div>
            </div>

            <!-- Volumes e Pallets -->
            <div class="volumes-row">
                <div class="volumes-item">
                    <div class="volumes-label">Volumes</div>
                    <div class="volumes-value">${volumesDisplay}</div>
                </div>
                <div class="volumes-item">
                    <div class="volumes-label">Pallets</div>
                    <div class="volumes-value">${palletsDisplay}</div>
                </div>
            </div>

            <!-- Conferência e Perecíveis -->
            <div class="check-row">
                <div class="check-group">
                    <span class="checkbox"></span>
                    <span class="checkbox-label">Completo</span>
                </div>
                <div class="check-group">
                    <span class="checkbox"></span>
                    <span class="checkbox-label">Parcial</span>
                </div>
                <div class="check-group" style="margin-left: 10mm;">
                    <span class="checkbox"></span>
                    <span class="checkbox-label">Sim (Perecível)</span>
                </div>
                <div class="check-group">
                    <span class="checkbox"></span>
                    <span class="checkbox-label">Não</span>
                </div>
            </div>

            <!-- Único destinatário e NF -->
            <div class="destinatario-row">
                <div class="destinatario-group">
                    <span class="checkbox"></span>
                    <span class="checkbox-label">Único Destinatário</span>
                </div>
                <div class="destinatario-group">
                    <span class="checkbox"></span>
                    <span class="checkbox-label">Múltiplos Destinatários</span>
                </div>
                <div class="nf-text">Nº da NF: ${pallet.notaFiscal || ''}</div>
            </div>

            <!-- Responsável por separar -->
            <div class="resp-separar">
                <div class="resp-label">Responsável por separar:</div>
                <div class="resp-linha"></div>
            </div>
        </div>

        <!-- QR CODE LADO DIREITO -->
        <div class="right-side">
            <div class="qrcode-box">
                ${qrCodeUrl ? `<img src="${qrCodeUrl}" />` : ''}
            </div>
        </div>
    </div>

    <!-- SERVIÇO -->
    <div class="servico-section">
        <div class="servico-title">SERVIÇO</div>
        <div class="servico-item">
            <div class="servico-check-group">
                <span class="checkbox"></span>
                <span>Entrega direta ao recebedor não exclusivo - alta volumetria (+30)</span>
            </div>
        </div>
        <div class="servico-item">
            <div class="servico-check-group">
                <span class="checkbox"></span>
                <span>Entrega direta ao recebedor não exclusivo - fracionado (-30)</span>
            </div>
        </div>
        <div class="servico-item">
            <div class="servico-check-group">
                <span class="checkbox"></span>
                <span>Entrega direta ao recebedor exclusivo (EPI)</span>
            </div>
            <div class="servico-data">
                <span>Data/Hora:</span>
                <div class="servico-linha"></div>
            </div>
        </div>
        <div class="servico-item">
            <div class="servico-check-group">
                <span class="checkbox"></span>
                <span>Crossdocking (quando há necessidade de seguir mais trechos na viagem)</span>
            </div>
        </div>
        <div class="servico-item">
            <div class="servico-check-group">
                <span class="checkbox"></span>
                <span>Ponto de Encontro (quando não há necessidade de seguir outros trechos)</span>
            </div>
        </div>
    </div>

    <!-- TRANSFERÊNCIA / LAST MILE -->
    <div class="trechos-section">
        <div class="trechos-title">TRANSFERÊNCIA / LAST MILE</div>
        ${[1, 2, 3, 4].map(i => `
        <div class="trecho-card">
            <div class="trecho-header">Trecho 0${i}</div>
            <div class="trecho-linha">
                <span class="trecho-label">Data/Hora:</span>
                <div class="trecho-campo"></div>
                <span class="trecho-label" style="margin-left: 5mm;">Nº Viagem:</span>
                <div class="trecho-campo"></div>
                <span class="trecho-label" style="margin-left: 5mm;">Doca:</span>
                <div class="trecho-campo"></div>
            </div>
            <div class="trecho-linha">
                <span class="trecho-label">Origem:</span>
                <div class="trecho-campo" style="min-width: 50mm;"></div>
                <span class="trecho-label" style="margin-left: 5mm;">Destino:</span>
                <div class="trecho-campo" style="min-width: 50mm;"></div>
                <span class="trecho-label" style="margin-left: 5mm;">Linha:</span>
                <div class="trecho-campo"></div>
            </div>
            <div class="trecho-linha">
                <span class="trecho-label">Atividade:</span>
                <div class="trecho-campo" style="min-width: 40mm;"></div>
                <span class="trecho-label" style="margin-left: 5mm;">Hora Chegada (carregar):</span>
                <div class="trecho-campo"></div>
                <span class="trecho-label" style="margin-left: 5mm;">Hora Partida (corte):</span>
                <div class="trecho-campo"></div>
            </div>
            <div class="trecho-linha">
                <span class="trecho-label">Motorista:</span>
                <div class="trecho-campo" style="min-width: 50mm;"></div>
                <span class="trecho-label" style="margin-left: 5mm;">Placa:</span>
                <div class="trecho-campo"></div>
                <span class="trecho-label" style="margin-left: 5mm;">Tipo Veículo:</span>
                <div class="trecho-campo"></div>
            </div>
        </div>
        `).join('')}
    </div>

    <!-- RESPONSÁVEL PLANEJAMENTO -->
    <div class="resp-planejamento">
        <div class="resp-label">Responsável Planejamento:</div>
        <div class="planejamento-linha"></div>
    </div>
</div>

<button class="no-print" onclick="window.print()">🖨️ IMPRIMIR FORMULÁRIO</button>
</body>
</html>
    `;
    }

    imprimirEtiqueta(pallet, codigoLista = null) {
        const html = this.gerarEtiquetaHTML(pallet, codigoLista);

        const janela = window.open('', '_blank');
        janela.document.write(`
            <html>
                <head>
                    <title>Etiqueta Pallet - ${pallet.notaFiscal || 'DIVERSOS'}</title>
                    <style>
                        @page {
                            size: A4;
                            margin: 0;
                        }
                        * {
                            margin: 0;
                            padding: 0;
                            box-sizing: border-box;
                        }
                        body {
                            display: flex;
                            justify-content: center;
                            background: #f0f0f0;
                            font-family: Arial, sans-serif;
                        }
                        @media print {
                            body {
                                background: white;
                                margin: 0;
                                padding: 0;
                            }
                            .no-print {
                                display: none;
                            }
                        }
                        .no-print {
                            position: fixed;
                            bottom: 20px;
                            right: 20px;
                            padding: 12px 24px;
                            background: #3498db;
                            color: white;
                            border: none;
                            border-radius: 5px;
                            font-size: 16px;
                            font-weight: bold;
                            cursor: pointer;
                            z-index: 1000;
                        }
                    </style>
                </head>
                <body>
                    ${html}
                    <button onclick="window.print()" class="no-print">🖨️ IMPRIMIR</button>
                </body>
            </html>
        `);
        janela.document.close();
    }
}
