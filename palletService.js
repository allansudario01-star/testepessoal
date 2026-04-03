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
<title>Formulário de Controle - ${pallet.notaFiscal || 'DIVERSOS'}</title>
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
        font-family: Arial, sans-serif;
        background: white;
        margin: 0;
        padding: 0;
    }
    .page {
        width: 210mm;
        height: 297mm;
        position: relative;
        page-break-after: avoid;
        background: white;
    }
    /* Layout principal em grid */
    .container {
        padding: 10mm 12mm;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
    }
    /* Sidebars verticais à direita */
    .sidebar-container {
        position: absolute;
        right: 0;
        top: 0;
        height: 100%;
        width: 10mm;
        display: flex;
        flex-direction: column;
        justify-content: space-around;
        align-items: center;
        font-size: 10px;
        font-weight: bold;
        text-align: center;
        writing-mode: vertical-rl;
        transform: rotate(180deg);
    }
    .sidebar-item {
        margin: 15mm 0;
    }
    /* Cabeçalho */
    .header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8mm;
        font-size: 10px;
    }
    .campo-linha {
        border-bottom: 1px solid #000;
        min-width: 60mm;
        display: inline-block;
    }
    /* Grid de informações principais */
    .info-grid {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        margin-bottom: 10mm;
    }
    .info-item {
        margin-bottom: 5mm;
    }
    .info-label {
        font-size: 8px;
        margin-bottom: 2mm;
    }
    .info-value {
        font-size: 18px;
        font-weight: bold;
        border-bottom: 1px solid #000;
        min-width: 50mm;
        padding: 2mm 0;
    }
    /* Seções de checkboxes */
    .section {
        margin-bottom: 8mm;
    }
    .section-title {
        font-weight: bold;
        font-size: 12px;
        margin-bottom: 4mm;
    }
    .checkbox-group {
        display: flex;
        flex-wrap: wrap;
        gap: 8mm;
        margin-bottom: 4mm;
    }
    .checkbox-item {
        display: inline-flex;
        align-items: center;
        gap: 2mm;
    }
    .checkbox {
        width: 5mm;
        height: 5mm;
        border: 1px solid black;
        display: inline-block;
        background: white;
    }
    .linha-campo {
        border-bottom: 1px solid #000;
        min-width: 40mm;
        display: inline-block;
    }
    /* QR Code */
    .qrcode-area {
        text-align: right;
        margin-bottom: 5mm;
    }
    .qrcode-img {
        width: 35mm;
        height: 35mm;
        border: 1px solid #ccc;
    }
    /* Tabela de trechos */
    .trechos-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 5mm;
    }
    .trechos-table td {
        padding: 2mm 0;
        vertical-align: top;
    }
    .trecho-titulo {
        font-weight: bold;
        width: 20%;
    }
    .trecho-campo {
        border-bottom: 1px solid #000;
        min-width: 30mm;
        display: inline-block;
    }
    .no-print {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 10px 20px;
        background: #3498db;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        z-index: 1000;
    }
    @media print {
        .no-print {
            display: none;
        }
        .page {
            margin: 0;
            box-shadow: none;
        }
    }
</style>
</head>
<body>
<div class="page">
    <div class="sidebar-container">
        <div class="sidebar-item">SEPARAÇÃO</div>
        <div class="sidebar-item">SERVIÇO</div>
        <div class="sidebar-item">TRANSFERÊNCIA</div>
        <div class="sidebar-item">LAST MILE</div>
    </div>

    <div class="container">
        <!-- CABEÇALHO -->
        <div>
            <div class="header">
                <div>Nº Container: <span class="campo-linha"></span></div>
                <div>Data/Hora: ${dataHora}</div>
            </div>

            <!-- INFORMAÇÕES PRINCIPAIS -->
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">REGIÃO</div>
                    <div class="info-value">${pallet.regiao || ''}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">SUB-REGIÃO</div>
                    <div class="info-value">${pallet.subregiao || ''}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">CIDADE</div>
                    <div class="info-value" style="font-size:14px;">${pallet.cidade || ''}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">UF</div>
                    <div class="info-value">${pallet.estado || ''}</div>
                </div>
            </div>

            <!-- EMBARCADOR / RECEBEDOR / QRCODE -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 8mm;">
                <div style="flex: 2;">
                    <div>Embarcador:</div>
                    <div class="linha-campo" style="width: 100%; margin-top: 2mm;"></div>
                    <div style="margin-top: 5mm;">Recebedor: ${pallet.recebedor || ''}</div>
                </div>
                <div class="qrcode-area" style="flex: 1; text-align: right;">
                    ${qrCodeUrl ? `<img src="${qrCodeUrl}" class="qrcode-img" />` : '<div style="width:35mm;height:35mm;border:1px solid #ccc;"></div>'}
                </div>
            </div>

            <!-- VOLUMES / PALLETS -->
            <div style="display: flex; gap: 20mm; margin-bottom: 8mm;">
                <div>Volumes: ${volumesDisplay}</div>
                <div>Pallets: ${palletsDisplay}</div>
            </div>

            <!-- CONFERÊNCIA / PERECÍVEIS -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 8mm;">
                <div>
                    CONFERÊNCIA:
                    <span class="checkbox-item"><span class="checkbox"></span> Completo</span>
                    <span class="checkbox-item"><span class="checkbox"></span> Parcial</span>
                </div>
                <div>
                    CONTÉM PERECÍVEIS:
                    <span class="checkbox-item"><span class="checkbox"></span> Sim</span>
                    <span class="checkbox-item"><span class="checkbox"></span> Não</span>
                </div>
            </div>

            <!-- ÚNICO DESTINATÁRIO / NF -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 8mm;">
                <div>
                    ÚNICO DESTINATÁRIO:
                    <span class="checkbox-item"><span class="checkbox"></span> Sim</span>
                    <span class="checkbox-item"><span class="checkbox"></span> Não</span>
                </div>
                <div>Nº da NF: ${pallet.notaFiscal || ''}</div>
            </div>

            <!-- RESPONSÁVEL POR SEPARAR -->
            <div style="margin-bottom: 8mm;">
                Responsável por separar:
                <div class="linha-campo" style="width: 100%; margin-top: 2mm;"></div>
            </div>
        </div>

        <!-- SERVIÇO (TRIAGEM) -->
        <div class="section">
            <div class="section-title">SERVIÇO</div>
            <div class="checkbox-group">
                <span class="checkbox-item"><span class="checkbox"></span> Entrega direta ao recebedor não exclusivo - alta volumetria (+30)</span>
                <span>Data/Hora: <span class="linha-campo" style="width: 30mm;"></span></span>
            </div>
            <div class="checkbox-group">
                <span class="checkbox-item"><span class="checkbox"></span> Entrega direta ao recebedor não exclusivo - fracionado (-30)</span>
            </div>
            <div class="checkbox-group">
                <span class="checkbox-item"><span class="checkbox"></span> Entrega direta ao recebedor exclusivo (EPI)</span>
            </div>
            <div class="checkbox-group">
                <span class="checkbox-item"><span class="checkbox"></span> Crossdocking (quando há necessidade de seguir mais trechos na viagem)</span>
            </div>
            <div class="checkbox-group">
                <span class="checkbox-item"><span class="checkbox"></span> Ponto de Encontro (quando não há necessidade de seguir outros trechos)</span>
            </div>
        </div>

        <!-- TRANSFERÊNCIA e LAST MILE (Trechos) -->
        <div>
            <div class="section-title">TRANSFERÊNCIA / LAST MILE</div>
            ${[1, 2, 3, 4].map(i => `
                <table class="trechos-table">
                    <tr>
                        <td class="trecho-titulo">Trecho 0${i}</td>
                        <td>Data/Hora: <span class="trecho-campo"></span></td>
                        <td>Nº Viagem: <span class="trecho-campo"></span></td>
                        <td>Doca: <span class="trecho-campo"></span></td>
                    </tr>
                    <tr>
                        <td></td>
                        <td colspan="3">Origem: <span class="trecho-campo" style="width: 40mm;"></span> &nbsp;&nbsp; Destino: <span class="trecho-campo" style="width: 40mm;"></span> &nbsp;&nbsp; Linha: <span class="trecho-campo"></span></td>
                    </tr>
                    <tr>
                        <td></td>
                        <td colspan="3">Atividade: <span class="trecho-campo"></span> &nbsp;&nbsp; Hora Chegada (carregar): <span class="trecho-campo"></span> &nbsp;&nbsp; Hora Partida (corte): <span class="trecho-campo"></span></td>
                    </tr>
                    <tr>
                        <td></td>
                        <td colspan="3">Motorista: <span class="trecho-campo"></span> &nbsp;&nbsp; Placa: <span class="trecho-campo"></span> &nbsp;&nbsp; Tipo Veiculo: <span class="trecho-campo"></span></td>
                    </tr>
                </table>
                ${i < 4 ? '<hr style="margin: 2mm 0;" />' : ''}
            `).join('')}
        </div>

        <!-- RESPONSÁVEL PLANEJAMENTO -->
        <div style="margin-top: 8mm;">
            Responsável Planejamento:
            <div class="linha-campo" style="width: 100%; margin-top: 2mm;"></div>
        </div>
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
