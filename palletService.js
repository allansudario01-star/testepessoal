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
        const dataHora = dataAtual.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const qrCodeUrl = codigoLista ? this.gerarQRCode(codigoLista) : null;
        const volumesDisplay = pallet.volumesDiversos
            ? (pallet.volumesTexto || 'DIVERSOS')
            : `${pallet.volumesAtuais || 0} / ${pallet.maxVolumes || ''}`;
        const totalPallets = this.obterTotalPalletsGrupo(pallet);
        const indiceAtual = this.obterIndiceNoGrupo(pallet);
        const palletsDisplay = pallet.tipo === 'VOLUMETRIA_ALTA' ? `${indiceAtual} / ${totalPallets}` : '';

        return `
<style>
@page { size: A4 portrait; margin: 10mm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
</style>
<div style="
    width: 190mm;
    height: 277mm;
    font-family: Arial, sans-serif;
    font-size: 10px;
    line-height: 1.2;
    color: #000;
    background: white;
    padding: 6mm;
">
    <div style="border: 2px solid #000; border-radius: 0; padding: 5mm; height: 100%;">

        <!-- TÍTULO -->
        <div style="text-align: center; margin-bottom: 4mm; font-size: 16px; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 2mm;">
            FORMULÁRIO DE CONTROLE E PLANEJAMENTO OPERACIONAL
        </div>

        <!-- HEADER 3 CAMPOS -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 3mm; padding: 2mm; background: #f0f0f0;">
            <div style="width: 32%;"><strong>Nº OS Container:</strong><br><span style="border-bottom: 1px solid #000; display: block; height: 2mm;"></span></div>
            <div style="width: 32%; text-align: center;"><strong>Data/Hora:</strong> ${dataHora}</div>
            <div style="width: 32%; text-align: right;"><strong>V01FO02042026</strong></div>
        </div>

        <!-- REGIÃO/SUB/CIDADE/UF -->
        <div style="display: flex; gap: 3mm; margin-bottom: 3mm; font-size: 9.5px;">
            <div style="flex: 1;"><strong>REGIÃO:</strong> ${pallet.regiao || ''}</div>
            <div style="flex: 1;"><strong>SUB:</strong> ${pallet.subregiao || ''}</div>
            <div style="flex: 1;"><strong>CIDADE:</strong> ${pallet.cidade || ''}</div>
            <div style="flex: 1;"><strong>UF:</strong> ${pallet.estado || ''}</div>
        </div>

        <!-- EMBARCADOR -->
        <div style="margin-bottom: 3mm;">
            <strong>Embarcador:</strong> <span style="border-bottom: 1px dotted #000; width: 70%; display: inline-block;"></span>
        </div>

        <!-- RECEBEDOR + QR -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3mm; padding: 2mm; background: #fff8e1;">
            <div style="flex: 1; font-size: 11px; font-weight: bold;">Recebedor: ${pallet.recebedor || ''}</div>
            <div style="width: 60px; height: 60px; border: 1px solid #000; ${qrCodeUrl ? `background: url(${qrCodeUrl}) center/contain no-repeat;` : 'background: #f9f9f9;'}"></div>
        </div>

        <!-- GRID 2x4 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; margin-bottom: 3mm; padding: 2mm; background: #e6f3ff; font-size: 9px;">
            <div>Volumes: <strong>${volumesDisplay}</strong></div>
            <div>Pallets: <strong>${palletsDisplay}</strong></div>
            <div>CONFERÊNCIA: ☐ Completo ☐ Parcial</div>
            <div>Perecíveis: ☐ SIM ☐ NÃO</div>
            <div>Único Destinatário: ☐ SIM ☐ NÃO</div>
            <div>Nº NF: ${pallet.notaFiscal || ''}</div>
        </div>

        <!-- RESPONSÁVEL SEPARAÇÃO -->
        <div style="margin-bottom: 4mm;">
            <strong>Responsável Separação:</strong> <span style="border-bottom: 1px dotted #000; width: 65%; display: inline-block;"></span>
        </div>

        <!-- SERVIÇO -->
        <div style="margin: 3mm 0; background: #333; color: white; padding: 2mm; text-align: center; font-weight: bold; font-size: 10px;">
            SERVIÇO
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5mm; margin-bottom: 4mm; padding: 2mm; background: #f9f9f9; font-size: 9px;">
            <div>☐ Entrega direta não exclusivo - alta volumetria (+30)</div>
            <div>☐ Entrega direta não exclusivo - fracionado (-30)</div>
            <div>☐ Entrega direta exclusivo (EPI)</div>
            <div>☐ Crossdocking</div>
            <div>☐ Ponto de encontro</div>
            <div></div>
        </div>

        <!-- TRECHOS OPERACIONAIS -->
        <div style="margin: 3mm 0 2mm 0; background: #333; color: white; padding: 2mm; text-align: center; font-weight: bold; font-size: 10px;">
            TRECHOS OPERACIONAIS
        </div>

        ${[1, 2, 3, 4].map(i => `
        <div style="border: 1px solid #ccc; border-radius: 3px; padding: 3mm; margin-bottom: 2.5mm; background: #fafafa; page-break-inside: avoid; font-size: 9px;">
            <div style="background: #e9e9e9; padding: 1.5mm 3mm; margin: -3mm -3mm 2mm -3mm; font-weight: bold;">
                TRECHO ${i}
            </div>
            <div style="display: flex; gap: 4mm; flex-wrap: wrap; margin-bottom: 1.5mm;">
                <span>Data/Hora: <u>______</u></span>
                <span>Viagem: <u>______</u></span>
                <span>Doca: <u>______</u></span>
            </div>
            <div style="display: flex; gap: 4mm; flex-wrap: wrap; margin-bottom: 1.5mm;">
                <span>Origem: <u>________________</u></span>
                <span>Destino: <u>________________</u></span>
            </div>
            <div style="margin-bottom: 1.5mm;">Linha: <u>____________________________</u></div>
            <div style="margin-bottom: 1.5mm;">Atividade: <u>________________________________________________</u></div>
            <div style="display: flex; gap: 4mm; flex-wrap: wrap; margin-bottom: 1.5mm;">
                <span>H.Chegada: <u>___</u></span>
                <span>H.Partida: <u>___</u></span>
            </div>
            <div style="display: flex; gap: 4mm; flex-wrap: wrap;">
                <span>Motorista: <u>________________</u></span>
                <span>Placa: <u>___</u></span>
                <span>Veículo: <u>________________</u></span>
            </div>
        </div>
        `).join('')}

        <!-- RODAPÉ -->
        <div style="border-top: 1px solid #000; padding-top: 2mm; text-align: right; font-size: 10px; margin-top: 2mm;">
            <strong>Responsável Planejamento:</strong> <span style="border-bottom: 1px dotted #000; width: 50%; display: inline-block;"></span>
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
