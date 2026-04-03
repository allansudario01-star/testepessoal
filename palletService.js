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
        const dataSeparacao = dataAtual.toLocaleDateString('pt-BR');
        const horaAtual = dataAtual.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const volumesCompletos = (pallet.volumesAtuais === pallet.maxVolumes && pallet.maxVolumes > 0);
        const statusVolumes = volumesCompletos ? 'COMPLETOS' : 'PARCIAL';

        let volumesDisplay = '';
        let palletsDisplay = '';

        if (pallet.tipo === 'DIVERSOS') {
            volumesDisplay = 'DIVERSOS';
        } else if (pallet.volumesDiversos) {
            volumesDisplay = pallet.volumesTexto || 'DIVERSOS';
        } else {
            volumesDisplay = `${pallet.volumesAtuais || 0} / ${pallet.maxVolumes || '?'}`;
        }

        const totalPallets = this.obterTotalPalletsGrupo(pallet);
        const indiceAtual = this.obterIndiceNoGrupo(pallet);

        if (pallet.tipo === 'VOLUMETRIA_ALTA') {
            palletsDisplay = `${indiceAtual} / ${totalPallets}`;
        }

        const qrCodeUrl = codigoLista ? this.gerarQRCode(codigoLista) : null;

        return `
            <div class="etiqueta-a4" style="
                font-family: Arial, sans-serif;
                width: 210mm;
                min-height: 297mm;
                margin: 0;
                padding: 15mm;
                background: white;
                box-sizing: border-box;
                font-size: 12px;
                position: relative;
            ">
                <div style="margin-bottom: 8mm;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 5mm; margin-bottom: 8mm;">
                        <div style="font-size: 24px; font-weight: bold;">NOTA INFORMATIVA</div>
                        <div style="text-align: right;">
                            <div style="font-size: 11px; color: #666;">Data/Hora: ${dataSeparacao} ${horaAtual}</div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6mm; margin-bottom: 8mm;">
                        <div>
                            <div style="font-size: 9px; color: #999;">NÚMERO OS CONTAINER</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"></div>
                        </div>
                        <div>
                            <div style="font-size: 9px; color: #999;">DATA/HORA</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"></div>
                        </div>
                        <div>
                            <div style="font-size: 9px; color: #999;">REGIÃO</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"><strong>${pallet.regiao || ''}</strong></div>
                        </div>
                        <div>
                            <div style="font-size: 9px; color: #999;">SUB-REGIÃO</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"><strong>${pallet.subregiao || ''}</strong></div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6mm; margin-bottom: 8mm;">
                        <div>
                            <div style="font-size: 9px; color: #999;">CIDADE</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"><strong>${pallet.cidade || ''}</strong></div>
                        </div>
                        <div>
                            <div style="font-size: 9px; color: #999;">UF</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"><strong>${pallet.estado || ''}</strong></div>
                        </div>
                        <div>
                            <div style="font-size: 9px; color: #999;">EMBARCADOR</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"></div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-bottom: 8mm;">
                        <div>
                            <div style="font-size: 9px; color: #999;">RECEBEDOR</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"><strong>${pallet.recebedor || ''}</strong></div>
                        </div>
                        <div>
                            <div style="font-size: 9px; color: #999;">NÚMERO NF</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"><strong>${pallet.notaFiscal || ''}</strong></div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-bottom: 8mm;">
                        <div>
                            <div style="font-size: 9px; color: #999;">VOLUMES</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"><strong>${volumesDisplay}</strong></div>
                        </div>
                        <div>
                            <div style="font-size: 9px; color: #999;">PALLETS</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"><strong>${palletsDisplay}</strong></div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-bottom: 8mm;">
                        <div>
                            <div style="font-size: 9px; color: #999;">CONFERÊNCIA VOLUMES</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"><strong>${statusVolumes}</strong></div>
                        </div>
                        <div>
                            <div style="font-size: 9px; color: #999;">CONTÉM PERECÍVEIS</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"></div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-bottom: 8mm;">
                        <div>
                            <div style="font-size: 9px; color: #999;">RESPONSÁVEL SEPARAÇÃO</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"></div>
                        </div>
                        <div>
                            <div style="font-size: 9px; color: #999;">QR CODE LISTA CONTAINER</div>
                            <div style="text-align: center;">
                                ${qrCodeUrl ? `<img src="${qrCodeUrl}" style="width: 60px; height: 60px; margin-top: 5px;" />` : '<div style="border-bottom: 1px solid #000; height: 20px;"></div>'}
                            </div>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 8mm;">
                    <div style="background: #f0f0f0; padding: 3mm; font-weight: bold; margin-bottom: 5mm;">SERVIÇO</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4mm;">
                        <div><input type="checkbox" style="margin-right: 5px;"> Entrega direta para o recebedor</div>
                        <div><input type="checkbox" style="margin-right: 5px;"> Interhub / Entrega para o recebedor</div>
                        <div><input type="checkbox" style="margin-right: 5px;"> Envio para unidade ou ponto de encontro</div>
                        <div><input type="checkbox" style="margin-right: 5px;"> Agendamento</div>
                    </div>
                </div>

                <div style="margin-bottom: 8mm;">
                    <div style="background: #f0f0f0; padding: 3mm; font-weight: bold; margin-bottom: 5mm;">TRECHOS</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6mm;">
                        <div>
                            <div style="font-size: 9px; color: #999;">TRECHO 1</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"></div>
                        </div>
                        <div>
                            <div style="font-size: 9px; color: #999;">TRECHO 2</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"></div>
                        </div>
                        <div>
                            <div style="font-size: 9px; color: #999;">TRECHO 3</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"></div>
                        </div>
                        <div>
                            <div style="font-size: 9px; color: #999;">TRECHO 4</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"></div>
                        </div>
                        <div>
                            <div style="font-size: 9px; color: #999;">+1</div>
                            <div style="border-bottom: 1px solid #000; height: 20px;"></div>
                        </div>
                    </div>
                </div>

                <div>
                    <div style="background: #f0f0f0; padding: 3mm; font-weight: bold; margin-bottom: 5mm;">RESPONSÁVEL PLANEJAMENTO</div>
                    <div style="border-bottom: 1px solid #000; height: 20px;"></div>
                </div>
            </div>
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
