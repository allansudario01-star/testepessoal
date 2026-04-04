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
        margin: 8mm 10mm;
    }
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }
    body {
        font-family: 'Helvetica', 'Arial', sans-serif;
        background: white;
        font-size: 10px;
    }
    .page {
        width: 100%;
        min-height: 277mm;
        position: relative;
    }

    /* ========== BORDAS DAS SEÇÕES ========== */
    .section {
        border: 1px solid #000;
        margin-bottom: 6mm;
        position: relative;
    }
    .section-title-left {
        position: absolute;
        left: -8mm;
        top: 10mm;
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        font-weight: bold;
        font-size: 11px;
        text-align: center;
        letter-spacing: 1px;
    }
    .section-content {
        padding: 4mm 5mm;
    }

    /* Cabeçalho */
    .header-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 6mm;
        padding-bottom: 2mm;
        border-bottom: 1px solid #ccc;
    }
    .campo-container {
        font-size: 10px;
        font-weight: bold;
    }
    .campo-linha {
        border-bottom: 1px solid #000;
        min-width: 60mm;
        display: inline-block;
        margin-left: 3px;
    }

    /* Info linha (Região, Sub, Cidade, UF) - sem linhas */
    .info-row {
        display: flex;
        gap: 6mm;
        margin-bottom: 6mm;
        justify-content: space-between;
    }
    .info-block {
        flex: 1;
    }
    .info-label {
        font-size: 8px;
        font-weight: bold;
        margin-bottom: 1mm;
        color: #333;
    }
    .info-value {
        font-size: 18px;
        font-weight: bold;
    }
    .cidade-value {
        font-size: 13px;
    }

    /* Grid de duas colunas (esquerda + QR Code) */
    .two-columns {
        display: flex;
        gap: 6mm;
        margin-bottom: 4mm;
    }
    .left-col {
        flex: 2;
    }
    .right-col {
        flex: 1;
        display: flex;
        justify-content: flex-end;
        align-items: flex-start;
    }
    .qrcode-box {
        width: 40mm;
        height: 40mm;
        border: 1px solid #ccc;
        display: flex;
        align-items: center;
        justify-content: center;
        background: white;
    }
    .qrcode-box img {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }

    /* Embarcador / Recebedor */
    .embarcador-item {
        display: flex;
        align-items: baseline;
        margin-bottom: 4mm;
    }
    .embarcador-label {
        font-size: 10px;
        font-weight: bold;
        width: 22mm;
    }
    .embarcador-linha {
        border-bottom: 1px solid #000;
        flex: 1;
        margin-left: 3mm;
        height: 6mm;
    }
    .recebedor-text {
        font-size: 11px;
        font-weight: bold;
        margin-left: 3mm;
    }

    /* Volumes e Pallets com bordas arredondadas */
    .volumes-row {
        display: flex;
        gap: 12mm;
        margin-bottom: 5mm;
    }
    .volume-card, .pallet-card {
        flex: 1;
        border: 1.5px solid #000;
        border-radius: 6px;
        padding: 3mm 4mm;
        text-align: center;
    }
    .volume-label, .pallet-label {
        font-size: 9px;
        font-weight: bold;
        margin-bottom: 2mm;
    }
    .volume-number, .pallet-number {
        font-size: 20px;
        font-weight: bold;
    }

    /* Checkboxes */
    .check-row {
        display: flex;
        gap: 8mm;
        margin-bottom: 5mm;
        flex-wrap: wrap;
    }
    .check-group {
        display: flex;
        gap: 2mm;
        align-items: center;
    }
    .checkbox {
        width: 4.5mm;
        height: 4.5mm;
        border: 1px solid #000;
        display: inline-block;
        background: white;
    }
    .checkbox-label {
        font-size: 9px;
    }
    .section-label {
        font-weight: bold;
        margin-right: 3mm;
        font-size: 9px;
    }

    /* Destinatário e NF */
    .destinatario-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 5mm;
        flex-wrap: wrap;
    }
    .destinatario-group {
        display: flex;
        gap: 2mm;
        align-items: center;
    }
    .nf-text {
        font-size: 11px;
        font-weight: bold;
    }

    /* Responsável separar */
    .resp-separar {
        margin-bottom: 2mm;
    }
    .resp-linha {
        border-bottom: 1px solid #000;
        width: 100%;
        height: 7mm;
        margin-top: 2mm;
    }

    /* Seção Serviço */
    .servico-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4mm;
        flex-wrap: wrap;
    }
    .servico-check-group {
        display: flex;
        gap: 2mm;
        align-items: center;
        flex: 2;
    }
    .servico-data {
        font-size: 9px;
        display: flex;
        align-items: center;
        gap: 2mm;
    }
    .servico-linha {
        border-bottom: 1px solid #000;
        width: 35mm;
        height: 5mm;
    }

    /* Tabela de Trechos (compacta) */
    .trechos-table {
        width: 100%;
        border-collapse: collapse;
    }
    .trechos-table td {
        padding: 1.5mm 2mm;
        vertical-align: top;
        border: 0.5px solid #ddd;
    }
    .trecho-titulo {
        font-weight: bold;
        background: #f5f5f5;
        width: 12%;
    }
    .campo-trecho {
        border-bottom: 1px solid #000;
        min-width: 25mm;
        height: 5mm;
        display: inline-block;
    }
    .campo-trecho-peq {
        min-width: 15mm;
    }

    /* Responsável planejamento */
    .resp-planejamento {
        margin-top: 4mm;
    }
    .planejamento-linha {
        border-bottom: 1px solid #000;
        width: 100%;
        height: 7mm;
        margin-top: 2mm;
    }

    /* Botão de impressão */
    .no-print {
        position: fixed;
        bottom: 15px;
        right: 15px;
        padding: 8px 16px;
        background: #2c3e50;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-weight: bold;
        font-size: 11px;
        z-index: 1000;
    }
    @media print {
        .no-print {
            display: none;
        }
        .section {
            break-inside: avoid;
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

    <!-- INFORMAÇÕES PRINCIPAIS (sem linhas) -->
    <div class="info-row">
        <div class="info-block"><div class="info-label">REGIÃO</div><div class="info-value">${pallet.regiao || ''}</div></div>
        <div class="info-block"><div class="info-label">SUB-REGIÃO</div><div class="info-value" style="font-size:16px;">${pallet.subregiao || ''}</div></div>
        <div class="info-block"><div class="info-label">CIDADE</div><div class="info-value cidade-value">${pallet.cidade || ''}</div></div>
        <div class="info-block"><div class="info-label">UF</div><div class="info-value">${pallet.estado || ''}</div></div>
    </div>

    <!-- SEÇÃO SEPARAÇÃO -->
    <div class="section" style="margin-top: 2mm;">
        <div class="section-title-left">SEPARAÇÃO</div>
        <div class="section-content">
            <div class="two-columns">
                <div class="left-col">
                    <!-- Embarcador / Recebedor -->
                    <div class="embarcador-item">
                        <div class="embarcador-label">Embarcador:</div>
                        <div class="embarcador-linha"></div>
                    </div>
                    <div class="embarcador-item">
                        <div class="embarcador-label">Recebedor:</div>
                        <div class="recebedor-text">${pallet.recebedor || ''}</div>
                    </div>

                    <!-- Volumes e Pallets com bordas arredondadas -->
                    <div class="volumes-row">
                        <div class="volume-card">
                            <div class="volume-label">VOLUMES</div>
                            <div class="volume-number">${volumesDisplay}</div>
                        </div>
                        <div class="pallet-card">
                            <div class="pallet-label">PALLETS</div>
                            <div class="pallet-number">${palletsDisplay}</div>
                        </div>
                    </div>

                    <!-- Conferência e Perecíveis -->
                    <div class="check-row">
                        <span class="section-label">CONFERÊNCIA:</span>
                        <div class="check-group"><span class="checkbox"></span><span class="checkbox-label">Completo</span></div>
                        <div class="check-group"><span class="checkbox"></span><span class="checkbox-label">Parcial</span></div>
                        <span class="section-label" style="margin-left: 5mm;">CONTÉM PERECÍVEIS:</span>
                        <div class="check-group"><span class="checkbox"></span><span class="checkbox-label">Sim</span></div>
                        <div class="check-group"><span class="checkbox"></span><span class="checkbox-label">Não</span></div>
                    </div>

                    <!-- Único destinatário e NF -->
                    <div class="destinatario-row">
                        <div style="display: flex; gap: 5mm;">
                            <span class="section-label">ÚNICO DESTINATÁRIO:</span>
                            <div class="check-group"><span class="checkbox"></span><span class="checkbox-label">Sim</span></div>
                            <div class="check-group"><span class="checkbox"></span><span class="checkbox-label">Não</span></div>
                        </div>
                        <div class="nf-text">Nº da NF: ${pallet.notaFiscal || ''}</div>
                    </div>

                    <!-- Responsável por separar -->
                    <div class="resp-separar">
                        <div class="embarcador-label">Responsável por separar:</div>
                        <div class="resp-linha"></div>
                    </div>
                </div>

                <!-- QR CODE LADO DIREITO (condicional) -->
                <div class="right-col">
                    ${qrCodeUrl ? `<div class="qrcode-box"><img src="${qrCodeUrl}" /></div>` : '<div style="width:40mm;"></div>'}
                </div>
            </div>
        </div>
    </div>

    <!-- SEÇÃO SERVIÇO -->
    <div class="section">
        <div class="section-title-left">SERVIÇO</div>
        <div class="section-content">
            <div class="servico-item">
                <div class="servico-check-group"><span class="checkbox"></span><span>Entrega direta ao recebedor não exclusivo - alta volumetria (+30)</span></div>
            </div>
            <div class="servico-item">
                <div class="servico-check-group"><span class="checkbox"></span><span>Entrega direta ao recebedor não exclusivo - fracionado (-30)</span></div>
            </div>
            <div class="servico-item">
                <div class="servico-check-group"><span class="checkbox"></span><span>Entrega direta ao recebedor exclusivo (EPI)</span></div>
                <div class="servico-data"><span>Data/Hora:</span><div class="servico-linha"></div></div>
            </div>
            <div class="servico-item">
                <div class="servico-check-group"><span class="checkbox"></span><span>Crossdocking (quando há necessidade de seguir mais trechos na viagem)</span></div>
            </div>
            <div class="servico-item">
                <div class="servico-check-group"><span class="checkbox"></span><span>Ponto de Encontro (quando não há necessidade de seguir outros trechos)</span></div>
            </div>
        </div>
    </div>

    <!-- SEÇÃO TRANSFERÊNCIA (Trechos 1, 2, 3) -->
    <div class="section">
        <div class="section-title-left">TRANSFERÊNCIA</div>
        <div class="section-content" style="padding: 2mm 3mm;">
            <table class="trechos-table">
                ${[1, 2, 3].map(i => `
                    <tr>
                        <td class="trecho-titulo">Trecho 0${i}</td>
                        <td>Data/Hora: <span class="campo-trecho"></span></td>
                        <td>Nº Viagem: <span class="campo-trecho"></span></td>
                        <td>Doca: <span class="campo-trecho campo-trecho-peq"></span></td>
                    </tr>
                    <tr>
                        <td class="trecho-titulo"></td>
                        <td colspan="3">Origem: <span class="campo-trecho" style="min-width: 35mm;"></span> &nbsp; Destino: <span class="campo-trecho" style="min-width: 35mm;"></span> &nbsp; Linha: <span class="campo-trecho"></span></td>
                    </tr>
                    <tr>
                        <td class="trecho-titulo"></td>
                        <td colspan="3">Atividade: <span class="campo-trecho"></span> &nbsp; Hora Chegada: <span class="campo-trecho"></span> &nbsp; Hora Partida: <span class="campo-trecho"></span></td>
                    </tr>
                    <tr>
                        <td class="trecho-titulo"></td>
                        <td colspan="3">Motorista: <span class="campo-trecho"></span> &nbsp; Placa: <span class="campo-trecho"></span> &nbsp; Tipo Veículo: <span class="campo-trecho"></span></td>
                    </tr>
                    ${i < 3 ? '<tr><td colspan="4" style="padding: 0;"><hr style="margin: 1mm 0;" /></td></tr>' : ''}
                `).join('')}
            </table>
        </div>
    </div>

    <!-- SEÇÃO LAST MILE (Trecho 4) -->
    <div class="section">
        <div class="section-title-left">LAST MILE</div>
        <div class="section-content" style="padding: 2mm 3mm;">
            <table class="trechos-table">
                <tr>
                    <td class="trecho-titulo">Trecho 04</td>
                    <td>Data/Hora: <span class="campo-trecho"></span></td>
                    <td>Nº Viagem: <span class="campo-trecho"></span></td>
                    <td>Doca: <span class="campo-trecho campo-trecho-peq"></span></td>
                </tr>
                <tr>
                    <td class="trecho-titulo"></td>
                    <td colspan="3">Origem: <span class="campo-trecho" style="min-width: 35mm;"></span> &nbsp; Destino: <span class="campo-trecho" style="min-width: 35mm;"></span> &nbsp; Linha: <span class="campo-trecho"></span></td>
                </tr>
                <tr>
                    <td class="trecho-titulo"></td>
                    <td colspan="3">Atividade: <span class="campo-trecho"></span> &nbsp; Hora Chegada: <span class="campo-trecho"></span> &nbsp; Hora Partida: <span class="campo-trecho"></span></td>
                </tr>
                <tr>
                    <td class="trecho-titulo"></td>
                    <td colspan="3">Motorista: <span class="campo-trecho"></span> &nbsp; Placa: <span class="campo-trecho"></span> &nbsp; Tipo Veículo: <span class="campo-trecho"></span></td>
                </tr>
            </table>
        </div>
    </div>

    <!-- RESPONSÁVEL PLANEJAMENTO -->
    <div class="resp-planejamento">
        <div class="embarcador-label">Responsável Planejamento:</div>
        <div class="planejamento-linha"></div>
    </div>
</div>

<button class="no-print" onclick="window.print()">🖨️ IMPRIMIR</button>
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
