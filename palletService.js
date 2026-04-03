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
    <title>Formulário Operacional</title>
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
            margin: 0;
            padding: 0;
            background: #e0e0e0;
            display: flex;
            justify-content: center;
            font-family: Arial, sans-serif;
        }
        @media print {
            body {
                background: white;
            }
            .no-print {
                display: none;
            }
        }
        .no-print {
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 10px 20px;
            background: #2c3e50;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            z-index: 1000;
        }
        table {
            border-collapse: collapse;
            width: 100%;
        }
        td, th {
            border: 1px solid black;
            padding: 3px;
            vertical-align: top;
        }
        .checkbox-square {
            display: inline-block;
            width: 10px;
            height: 10px;
            border: 1px solid black;
            margin-right: 3px;
            background: white;
        }
        .section-title {
            background: #e8e8e8;
            font-weight: bold;
            padding: 3px;
            text-align: center;
            font-size: 10px;
        }
        .dotted-line {
            border-bottom: 1px dotted #999;
            min-width: 80px;
            display: inline-block;
        }
        .vertical-text {
            writing-mode: vertical-rl;
            text-orientation: mixed;
            transform: rotate(180deg);
            text-align: center;
            font-weight: bold;
            font-size: 12px;
            letter-spacing: 2px;
        }
        .sidebar-cell {
            width: 35px;
            text-align: center;
            vertical-align: top;
            background: #f5f5f5;
            border-left: 2px solid #ccc;
        }
        .main-content {
            flex: 1;
            padding-right: 5px;
        }
        .sidebar-container {
            width: 35px;
            padding-left: 5px;
        }
        .sidebar-item {
            text-align: center;
        }
        /* Alturas específicas para alinhamento com as seções */
        .sidebar-separacao {
            height: 54px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 8px;
        }
        .sidebar-servico {
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 5px;
        }
        .sidebar-transferencia {
            height: 67px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 5px;
        }
        .sidebar-lastmile {
            height: 54px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 5px;
        }
        .container-flex {
            display: flex;
            height: 100%;
        }
    </style>
</head>
<body>
    <div style="
        width: 210mm;
        height: 297mm;
        padding: 8mm;
        font-family: Arial, sans-serif;
        font-size: 10px;
        background: white;
        position: relative;
    ">

        <div class="container-flex">
            <div class="main-content">

                <h2 style="text-align:center; margin-bottom:5px; font-size:14px;">
                    FORMULÁRIO DE CONTROLE E PLANEJAMENTO OPERACIONAL
                </h2>

                <table style="margin-bottom:5px;">
                    <tr>
                        <td style="width:33%"><strong>Nº OS Container:</strong> _______________</td>
                        <td style="width:33%"><strong>Data/Hora:</strong> ${dataHora}</td>
                        <td style="width:33%"><strong>Versão:</strong> V01FO02042026</td>
                    </tr>
                </table>

                <table style="margin-bottom:5px;">
                    <tr>
                        <td style="width:25%"><strong>REGIÃO:</strong> ${pallet.regiao || ''}</td>
                        <td style="width:25%"><strong>SUB:</strong> ${pallet.subregiao || ''}</td>
                        <td style="width:25%"><strong>CIDADE:</strong> ${pallet.cidade || ''}</td>
                        <td style="width:25%"><strong>UF:</strong> ${pallet.estado || ''}</td>
                    </tr>
                </table>

                <div style="margin-bottom:4px;">
                    <strong>Embarcador:</strong> <span class="dotted-line" style="width:75%">_________________________</span>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                    <div><strong>Recebedor:</strong> ${pallet.recebedor || ''}</div>
                    <div>${qrCodeUrl ? `<img src="${qrCodeUrl}" width="60" style="border:1px solid #ccc;"/>` : ''}</div>
                </div>

                <table style="margin-bottom:5px;">
                    <tr>
                        <td style="width:50%"><strong>Volumes:</strong> ${volumesDisplay}</td>
                        <td style="width:50%"><strong>Pallets:</strong> ${palletsDisplay}</td>
                    </tr>
                    <tr>
                        <td><strong>CONFERÊNCIA:</strong> ☐ Completo ☐ Parcial</td>
                        <td><strong>Perecíveis:</strong> ☐ SIM ☐ NÃO</td>
                    </tr>
                    <tr>
                        <td><strong>Único Destinatário:</strong> ☐ SIM ☐ NÃO</td>
                        <td><strong>Nº NF:</strong> ${pallet.notaFiscal || ''}</td>
                    </tr>
                </table>

                <div style="margin-bottom:6px;">
                    <strong>Responsável Separação:</strong> <span class="dotted-line" style="width:65%">_________________________</span>
                </div>

                <table style="margin-bottom:5px; width:100%;">
                    <tr class="section-title">
                        <td colspan="2">SERVIÇO</td>
                    </tr>
                    <tr>
                        <td style="width:50%">☐ Entrega direta não exclusivo - alta volumetria (+30)</td>
                        <td style="width:50%">☐ Crossdocking</td>
                    </tr>
                    <tr>
                        <td>☐ Entrega direta não exclusivo - fracionado (-30)</td>
                        <td>☐ Ponto de encontro</td>
                    </tr>
                    <tr>
                        <td colspan="2">☐ Entrega direta exclusivo (EPI)</td>
                    </tr>
                </table>

                ${[1, 2, 3, 4].map(i => `
                <table style="margin-bottom:4px; width:100%;">
                    <tr class="section-title">
                        <td colspan="3">Trecho 0${i}</td>
                    </tr>
                    <tr>
                        <td style="width:33%"><strong>Data/Hora:</strong> ______</td>
                        <td style="width:33%"><strong>Viagem:</strong> ______</td>
                        <td style="width:33%"><strong>Doca:</strong> ______</td>
                    </tr>
                    <tr>
                        <td><strong>Origem:</strong> ______</td>
                        <td><strong>Destino:</strong> ______</td>
                        <td><strong>Linha:</strong> ______</td>
                    </tr>
                    <tr>
                        <td colspan="3"><strong>Atividade:</strong> ________________</td>
                    </tr>
                    <tr>
                        <td><strong>Hora Chegada:</strong> ______</td>
                        <td><strong>Hora Partida:</strong> ______</td>
                        <td></td>
                    </tr>
                    <tr>
                        <td><strong>Motorista:</strong> ______</td>
                        <td><strong>Placa:</strong> ______</td>
                        <td><strong>Veículo:</strong> ______</td>
                    </tr>
                </table>
                `).join('')}

                <div style="margin-top:4px;">
                    <strong>Responsável Planejamento:</strong> <span class="dotted-line" style="width:55%">_________________________</span>
                </div>

            </div>

            <div class="sidebar-container">
                <div class="sidebar-item sidebar-separacao">
                    <div class="vertical-text">SEPARAÇÃO</div>
                </div>
                <div class="sidebar-item sidebar-servico">
                    <div class="vertical-text">SERVIÇO</div>
                </div>
                <div class="sidebar-item sidebar-transferencia">
                    <div class="vertical-text">TRANSFERÊNCIA</div>
                </div>
                <div class="sidebar-item sidebar-lastmile">
                    <div class="vertical-text">LAST MILE</div>
                </div>
            </div>
        </div>

    </div>

    <button onclick="window.print()" class="no-print">🖨️ IMPRIMIR</button>
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
