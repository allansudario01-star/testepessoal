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
            } catch (e) { }
        }

        const finalizados = localStorage.getItem('palletsFinalizados');
        if (finalizados) {
            try {
                const lista = JSON.parse(finalizados);
                lista.forEach(p => this.finalizados.set(p.id, p));
            } catch (e) { }
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
            palletPrincipalId: null
        };

        let novo;

        if (tipo === 'VOLUMETRIA_ALTA') {
            novo = {
                ...basePallet,
                notaFiscal: data.notaFiscal.toUpperCase().trim(),
                recebedor: data.recebedor.toUpperCase().trim(),
                hub: data.regiao ? data.regiao.toUpperCase().trim() : '',
                estado: data.estado.toUpperCase().trim(),
                cidade: data.cidade.toUpperCase().trim(),
                regiao: data.regiao ? data.regiao.toUpperCase().trim() : '',
                subregiao: data.subregiao ? data.subregiao.toString().trim() : '',
                maxVolumes: parseInt(data.maxVolumes),
                volumesAtuais: 0,
                volumesDiversos: false
            };
        } else {
            novo = {
                ...basePallet,
                notaFiscal: 'DIVERSOS',
                recebedor: 'DIVERSOS',
                hub: data.regiao ? data.regiao.toUpperCase().trim() : '',
                estado: data.estado.toUpperCase().trim(),
                cidade: 'DIVERSOS',
                regiao: data.regiao ? data.regiao.toUpperCase().trim() : '',
                subregiao: data.subregiao ? data.subregiao.toString().trim() : '',
                maxVolumes: null,
                volumesAtuais: null,
                volumesDiversos: true,
                volumesTexto: ''
            };
        }

        this.pallets.set(id, novo);
        this.saveToStorage();

        try {
            await window.db.collection('pallets').doc(id).set(novo);
        } catch (e) { }

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
        } catch (e) { }

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
        } catch (e) { }
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
        } catch (e) { }
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
        } catch (e) { }
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
        if (pallet.tipo !== 'VOLUMETRIA_ALTA') return null;
        if (pallet.palletPrincipalId) {
            const principal = this.pallets.get(pallet.palletPrincipalId);
            if (principal) {
                return 1 + (principal.palletsVinculados?.length || 0);
            }
        }
        return 1 + (pallet.palletsVinculados?.length || 0);
    }

    obterIndiceNoGrupo(pallet) {
        if (pallet.tipo !== 'VOLUMETRIA_ALTA') return null;
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

    getSubrotaDisplay(pallet) {
        if (pallet.subregiao && pallet.regiao) {
            return `${pallet.regiao}${pallet.subregiao}`;
        }
        if (pallet.regiao) {
            return pallet.regiao;
        }
        return pallet.subregiao || '';
    }

    gerarEtiquetaHTML(pallet, codigoLista = null) {
        const dataAtual = new Date();
        const dataHora = dataAtual.toLocaleString('pt-BR');
        const qrCodeUrl = codigoLista ? this.gerarQRCode(codigoLista) : null;
        const isDiversos = pallet.tipo === 'DIVERSOS';

        let volumesDisplay = '';
        if (isDiversos) {
            volumesDisplay = '______________';
        } else if (pallet.volumesDiversos) {
            volumesDisplay = pallet.volumesTexto || '______________';
        } else {
            volumesDisplay = `${pallet.volumesAtuais || 0} / ${pallet.maxVolumes || ''}`;
        }

        let palletsDisplay = '';
        if (!isDiversos && pallet.tipo === 'VOLUMETRIA_ALTA') {
            const totalPallets = this.obterTotalPalletsGrupo(pallet);
            const indiceAtual = this.obterIndiceNoGrupo(pallet);
            if (totalPallets !== null && indiceAtual !== null) {
                palletsDisplay = `${indiceAtual} / ${totalPallets}`;
            }
        }

        const subrotaDisplay = this.getSubrotaDisplay(pallet);

        return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Formulário Operacional - ${pallet.notaFiscal || 'DIVERSOS'}</title>
<style>
    @page {
        size: A4;
        margin: 6mm 10mm;
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
    }
    .section-title {
        background: #e0e0e0;
        padding: 1.5mm 4mm;
        font-weight: bold;
        font-size: 11px;
        border: 1px solid #aaa;
        margin-top: 3mm;
    }
    .section-content {
        border: 1px solid #aaa;
        border-top: none;
        padding: 3mm 4mm;
    }
    .header-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 4mm;
    }
    .campo-container {
        font-size: 10px;
        font-weight: bold;
    }
    .campo-linha {
        border-bottom: 1px solid #000;
        min-width: 55mm;
        display: inline-block;
        margin-left: 3px;
    }
    .info-row {
        display: flex;
        gap: 5mm;
        margin-bottom: 4mm;
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
    .two-columns {
        display: flex;
        gap: 5mm;
        margin-bottom: 3mm;
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
        width: 36mm;
        height: 36mm;
        border: 1px solid #aaa;
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
    .embarcador-item {
        display: flex;
        align-items: baseline;
        margin-bottom: 3mm;
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
        height: 5mm;
    }
    .recebedor-text {
        font-size: 11px;
        font-weight: bold;
        margin-left: 3mm;
    }
    .volumes-row {
        display: flex;
        gap: 10mm;
        margin-bottom: 3mm;
    }
    .volume-card, .pallet-card {
        flex: 1;
        border: 1.5px solid #000;
        border-radius: 5px;
        padding: 2mm 3mm;
        text-align: center;
    }
    .volume-label, .pallet-label {
        font-size: 8px;
        font-weight: bold;
        margin-bottom: 1mm;
    }
    .volume-number, .pallet-number {
        font-size: 18px;
        font-weight: bold;
    }
    .checkbox-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 3mm;
        flex-wrap: wrap;
    }
    .checkbox-group {
        display: inline-flex;
        align-items: center;
        gap: 2mm;
    }
    .checkbox {
        width: 3.5mm;
        height: 3.5mm;
        border: 1px solid #000;
        display: inline-block;
        background: white;
    }
    .checkbox-label {
        font-size: 9px;
    }
    .section-label {
        font-weight: bold;
        font-size: 9px;
    }
    .full-width {
        width: 100%;
    }
    .resp-linha, .planejamento-linha {
        border-bottom: 1px solid #000;
        flex: 1;
        margin-left: 5mm;
        height: 5mm;
    }
    .destinatario-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 3mm;
        flex-wrap: wrap;
    }
    .nf-text {
        font-size: 11px;
        font-weight: bold;
    }
    .linha-com-label {
        display: flex;
        align-items: baseline;
        margin-top: 3mm;
    }
    .servico-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2.5mm;
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
        width: 30mm;
        height: 4mm;
    }
    .trechos-table {
        width: 100%;
        border-collapse: collapse;
    }
    .trechos-table td {
        padding: 0.8mm 1.5mm;
        vertical-align: top;
        font-size: 9px;
    }
    .trecho-titulo {
        font-weight: bold;
        width: 12%;
        font-size: 9px;
    }
    .campo-trecho {
        border-bottom: 1px solid #000;
        min-width: 22mm;
        height: 4mm;
        display: inline-block;
    }
    .campo-trecho-peq {
        min-width: 14mm;
    }
    .trecho-label {
        font-size: 9px;
        font-weight: normal;
    }
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
    }
</style>
</head>
<body>
<div class="page">

    <div class="section-title">SEPARAÇÃO</div>
    <div class="section-content">
        <div class="header-row">
            <div class="campo-container">Nº OS do Container: <span class="campo-linha"></span></div>
            <div class="campo-container">Data/Hora: ${dataHora}</div>
        </div>

        <div class="info-row">
            <div class="info-block"><div class="info-label">REGIÃO</div><div class="info-value">${pallet.regiao || ''}</div></div>
            <div class="info-block"><div class="info-label">SUB-REGIÃO</div><div class="info-value" style="font-size:16px;">${subrotaDisplay}</div></div>
            <div class="info-block"><div class="info-label">CIDADE</div><div class="info-value cidade-value">${pallet.cidade || ''}</div></div>
            <div class="info-block"><div class="info-label">UF</div><div class="info-value">${pallet.estado || ''}</div></div>
        </div>

        <div class="two-columns">
            <div class="left-col">
                <div class="embarcador-item">
                    <div class="embarcador-label">Embarcador:</div>
                    <div class="embarcador-linha"></div>
                </div>
                <div class="embarcador-item">
                    <div class="embarcador-label">Recebedor:</div>
                    <div class="recebedor-text">${pallet.recebedor || ''}</div>
                </div>
                <div class="volumes-row">
                    <div class="volume-card">
                        <div class="volume-label">VOLUMES</div>
                        <div class="volume-number">${volumesDisplay}</div>
                    </div>
                    ${palletsDisplay ? `<div class="pallet-card">
                        <div class="pallet-label">PALLETS</div>
                        <div class="pallet-number">${palletsDisplay}</div>
                    </div>` : ''}
                </div>
            </div>
            <div class="right-col">
                ${qrCodeUrl ? `<div class="qrcode-box"><img src="${qrCodeUrl}" /></div>` : '<div style="width:36mm;"></div>'}
            </div>
        </div>

        <div class="checkbox-row">
            <div style="display: flex; gap: 6mm; align-items: center;">
                <span class="section-label">CONFERÊNCIA:</span>
                <div class="checkbox-group"><span class="checkbox"></span><span class="checkbox-label">Completo</span></div>
                <div class="checkbox-group"><span class="checkbox"></span><span class="checkbox-label">Parcial</span></div>
            </div>
            <div style="display: flex; gap: 6mm; align-items: center;">
                <span class="section-label">CONTÉM PERECÍVEIS:</span>
                <div class="checkbox-group"><span class="checkbox"></span><span class="checkbox-label">Sim</span></div>
                <div class="checkbox-group"><span class="checkbox"></span><span class="checkbox-label">Não</span></div>
            </div>
        </div>

        <div class="destinatario-row">
            <div style="display: flex; gap: 5mm; align-items: center;">
                <span class="section-label">ÚNICO DESTINATÁRIO:</span>
                <div class="checkbox-group"><span class="checkbox"></span><span class="checkbox-label">Sim</span></div>
                <div class="checkbox-group"><span class="checkbox"></span><span class="checkbox-label">Não</span></div>
            </div>
            <div class="nf-text">Nº da NF: ${pallet.notaFiscal || ''}</div>
        </div>

        <div class="linha-com-label">
            <div class="embarcador-label">Responsável por separar:</div>
            <div class="resp-linha"></div>
        </div>
    </div>

    <div class="section-title">SERVIÇO</div>
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

    <div class="section-title">TRANSFERÊNCIA</div>
    <div class="section-content" style="padding: 1.5mm 2mm;">
        <table class="trechos-table">
            ${[1, 2, 3].map(i => `
                <tr>
                    <td class="trecho-titulo">Trecho 0${i}</td>
                    <td><span class="trecho-label">Data/Hora:</span> <span class="campo-trecho"></span></td>
                    <td><span class="trecho-label">Nº Viagem:</span> <span class="campo-trecho"></span></td>
                    <td><span class="trecho-label">Doca:</span> <span class="campo-trecho campo-trecho-peq"></span></td>
                </tr>
                <tr>
                    <td class="trecho-titulo"></td>
                    <td colspan="3"><span class="trecho-label">Origem:</span> <span class="campo-trecho" style="min-width: 30mm;"></span> &nbsp; <span class="trecho-label">Destino:</span> <span class="campo-trecho" style="min-width: 30mm;"></span> &nbsp; <span class="trecho-label">Linha:</span> <span class="campo-trecho"></span></td>
                </tr>
                <tr>
                    <td class="trecho-titulo"></td>
                    <td colspan="3"><span class="trecho-label">Atividade:</span> <span class="campo-trecho"></span> &nbsp; <span class="trecho-label">Hora Chegada:</span> <span class="campo-trecho"></span> &nbsp; <span class="trecho-label">Hora Partida:</span> <span class="campo-trecho"></span></td>
                </tr>
                <tr>
                    <td class="trecho-titulo"></td>
                    <td colspan="3"><span class="trecho-label">Motorista:</span> <span class="campo-trecho"></span> &nbsp; <span class="trecho-label">Placa:</span> <span class="campo-trecho"></span> &nbsp; <span class="trecho-label">Tipo Veículo:</span> <span class="campo-trecho"></span></td>
                </tr>
                ${i < 3 ? '<tr><td colspan="4" style="padding: 0;"><hr style="margin: 0.5mm 0;" /></td></tr>' : ''}
            `).join('')}
        </table>
    </div>

    <div class="section-title">LAST MILE</div>
    <div class="section-content" style="padding: 1.5mm 2mm;">
        <table class="trechos-table">
            <tr>
                <td class="trecho-titulo">Trecho 04</td>
                <td><span class="trecho-label">Data/Hora:</span> <span class="campo-trecho"></span></td>
                <td><span class="trecho-label">Nº Viagem:</span> <span class="campo-trecho"></span></td>
                <td><span class="trecho-label">Doca:</span> <span class="campo-trecho campo-trecho-peq"></span></td>
            </tr>
            <tr>
                <td class="trecho-titulo"></td>
                <td colspan="3"><span class="trecho-label">Origem:</span> <span class="campo-trecho" style="min-width: 30mm;"></span> &nbsp; <span class="trecho-label">Destino:</span> <span class="campo-trecho" style="min-width: 30mm;"></span> &nbsp; <span class="trecho-label">Linha:</span> <span class="campo-trecho"></span></td>
            </tr>
            <tr>
                <td class="trecho-titulo"></td>
                <td colspan="3"><span class="trecho-label">Atividade:</span> <span class="campo-trecho"></span> &nbsp; <span class="trecho-label">Hora Chegada:</span> <span class="campo-trecho"></span> &nbsp; <span class="trecho-label">Hora Partida:</span> <span class="campo-trecho"></span></td>
            </tr>
            <tr>
                <td class="trecho-titulo"></td>
                <td colspan="3"><span class="trecho-label">Motorista:</span> <span class="campo-trecho"></span> &nbsp; <span class="trecho-label">Placa:</span> <span class="campo-trecho"></span> &nbsp; <span class="trecho-label">Tipo Veículo:</span> <span class="campo-trecho"></span></td>
            </tr>
        </table>
    </div>

    <div class="linha-com-label" style="margin-top: 4mm;">
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
