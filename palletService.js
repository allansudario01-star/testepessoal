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
<div style="
    width: 210mm;
    min-height: 297mm;
    padding: 15mm;
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 11px;
    box-sizing: border-box;
    background: white;
    color: #1a1a1a;
">
    <div style="
        border: 2px solid #2c3e50;
        border-radius: 8px;
        padding: 8mm;
        height: 100%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    ">
        <h2 style="
            text-align: center;
            margin: 0 0 8mm 0;
            font-size: 18px;
            font-weight: 800;
            color: #2c3e50;
            letter-spacing: 1px;
            border-bottom: 3px solid #3498db;
            padding-bottom: 5px;
        ">
            📋 FORMULÁRIO DE CONTROLE E PLANEJAMENTO OPERACIONAL
        </h2>

        <div style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6mm;
            background: #ecf0f1;
            padding: 4mm;
            border-radius: 6px;
        ">
            <div style="width: 30%;"><strong>📦 Nº OS Container:</strong> ____________________</div>
            <div style="width: 35%; text-align: center;"><strong>📅 Data/Hora:</strong> ${dataHora}</div>
            <div style="width: 30%; text-align: right;"><strong>🔖 Versão:</strong> V01FO02042026</div>
        </div>

        <div style="
            background: #f8f9fa;
            padding: 5mm;
            border-radius: 6px;
            margin-bottom: 5mm;
            border-left: 4px solid #3498db;
        ">
            <div style="display: flex; gap: 8mm; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 120px;"><strong>📍 REGIÃO:</strong> <span style="color:#2c3e50;">${pallet.regiao || ''}</span></div>
                <div style="flex: 1; min-width: 80px;"><strong>📌 SUB:</strong> <span style="color:#2c3e50;">${pallet.subregiao || ''}</span></div>
                <div style="flex: 1; min-width: 100px;"><strong>🏙️ CIDADE:</strong> <span style="color:#2c3e50;">${pallet.cidade || ''}</span></div>
                <div style="flex: 1; min-width: 60px;"><strong>🇧🇷 UF:</strong> <span style="color:#2c3e50;">${pallet.estado || ''}</span></div>
            </div>
        </div>

        <div style="margin-bottom: 4mm;">
            <strong>🚛 Embarcador:</strong> <span style="border-bottom: 1px dotted #999; min-width: 250px; display: inline-block; width: 75%;">_________________________</span>
        </div>

        <div style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 5mm;
            background: #fff3e0;
            padding: 4mm;
            border-radius: 6px;
        ">
            <div style="font-size: 13px; flex: 1;"><strong>🏢 Recebedor:</strong> ${pallet.recebedor || ''}</div>
            <div>${qrCodeUrl ? `<img src="${qrCodeUrl}" width="80" style="border: 1px solid #bdc3c7; border-radius: 4px; padding: 2px; background: white;"/>` : ''}</div>
        </div>

        <div style="
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4mm;
            margin-bottom: 5mm;
            background: #e8f4f8;
            padding: 4mm;
            border-radius: 6px;
        ">
            <div><strong>📦 Volumes:</strong> <span style="font-weight: bold; font-size: 13px;">${volumesDisplay}</span></div>
            <div><strong>📦 Pallets:</strong> <span style="font-weight: bold; font-size: 13px;">${palletsDisplay}</span></div>
            <div style="line-height: 1.4;"><strong>✅ CONFERÊNCIA:</strong> ☐ Completo ☐ Parcial</div>
            <div style="line-height: 1.4;"><strong>❄️ Perecíveis:</strong> ☐ SIM ☐ NÃO</div>
            <div style="line-height: 1.4;"><strong>🎯 Único Destinatário:</strong> ☐ SIM ☐ NÃO</div>
            <div><strong>📄 Nº NF:</strong> ${pallet.notaFiscal || ''}</div>
        </div>

        <div style="margin-bottom: 6mm;">
            <strong>👤 Responsável Separação:</strong> <span style="border-bottom: 1px dotted #999; display: inline-block; width: 70%;">_________________________</span>
        </div>

        <div style="
            margin: 6mm 0 5mm 0;
            background: #2c3e50;
            color: white;
            padding: 3mm;
            border-radius: 4px;
            text-align: center;
        ">
            <strong style="font-size: 13px;">🛠️ SERVIÇO</strong>
        </div>

        <div style="
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 3mm;
            margin-bottom: 6mm;
            padding: 3mm;
            background: #f9f9f9;
            border-radius: 6px;
        ">
            <div>☐ Entrega direta não exclusivo - alta volumetria (+30)</div>
            <div>☐ Entrega direta não exclusivo - fracionado (-30)</div>
            <div>☐ Entrega direta exclusivo (EPI)</div>
            <div>☐ Crossdocking</div>
            <div>☐ Ponto de encontro</div>
        </div>

        <div style="
            margin: 6mm 0 5mm 0;
            background: #2c3e50;
            color: white;
            padding: 3mm;
            border-radius: 4px;
            text-align: center;
        ">
            <strong style="font-size: 13px;">🗺️ TRECHOS OPERACIONAIS</strong>
        </div>

        ${[1, 2, 3, 4].map(i => `
        <div style="
            margin-bottom: 5mm;
            border: 1px solid #dcdde1;
            border-radius: 6px;
            padding: 4mm;
            background: #fefefe;
            page-break-inside: avoid;
        ">
            <div style="
                background: #ecf0f1;
                padding: 2mm 4mm;
                border-radius: 4px 4px 0 0;
                margin: -4mm -4mm 3mm -4mm;
                font-weight: bold;
                color: #2c3e50;
            ">
                🚚 TRECHO ${i}
            </div>
            <div style="display: flex; gap: 5mm; flex-wrap: wrap; margin-bottom: 3mm;">
                <span><strong>📅 Data/Hora:</strong> __________</span>
                <span><strong>✈️ Viagem:</strong> __________</span>
                <span><strong>🚪 Doca:</strong> __________</span>
            </div>
            <div style="display: flex; gap: 5mm; flex-wrap: wrap; margin-bottom: 3mm;">
                <span><strong>📍 Origem:</strong> __________</span>
                <span><strong>📍 Destino:</strong> __________</span>
                <span><strong>🛣️ Linha:</strong> __________</span>
            </div>
            <div style="margin-bottom: 3mm;"><strong>📋 Atividade:</strong> ____________________</div>
            <div style="display: flex; gap: 5mm; flex-wrap: wrap; margin-bottom: 3mm;">
                <span><strong>⏱️ Hora Chegada:</strong> __________</span>
                <span><strong>⏱️ Hora Partida:</strong> __________</span>
            </div>
            <div style="display: flex; gap: 5mm; flex-wrap: wrap;">
                <span><strong>👨‍✈️ Motorista:</strong> __________</span>
                <span><strong>🚛 Placa:</strong> __________</span>
                <span><strong>🚛 Veículo:</strong> __________</span>
            </div>
        </div>
        `).join('')}

        <div style="
            margin-top: 6mm;
            padding-top: 4mm;
            border-top: 2px solid #bdc3c7;
            text-align: right;
            font-style: italic;
            color: #7f8c8d;
        ">
            <strong>📝 Responsável Planejamento:</strong> _________________________
        </div>
    </div>
</div>`;
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
