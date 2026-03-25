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
        this.atualizarStatusAgendamentoEmTodosPallets();
    }

    setupRealtimeListener() {
        if (window.db) {
            window.db.collection('agendamentos').onSnapshot(() => {
                if (window.renderizarPallets) {
                    this.atualizarStatusAgendamentoEmTodosPallets();
                    window.renderizarPallets();
                }
            });
        }
    }

    verificarAgendamento(pallet) {
        if (!this.agendamentoService || pallet.tipo !== 'VOLUMETRIA_ALTA') {
            return false;
        }

        const agendamentos = this.agendamentoService.listar();
        return agendamentos.some(a =>
            a.uf === pallet.estado &&
            a.hub === pallet.hub &&
            a.recebedor === pallet.recebedor
        );
    }

    atualizarStatusAgendamentoEmTodosPallets() {
        for (const [id, pallet] of this.pallets.entries()) {
            if (pallet.tipo === 'VOLUMETRIA_ALTA') {
                const isAgendado = this.verificarAgendamento(pallet);
                if (pallet.agendamentoMarcado !== isAgendado) {
                    pallet.agendamentoMarcado = isAgendado;
                    this.saveToStorage();
                }
            }
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
            agendamentoMarcado: false,
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
                maxVolumes: parseInt(data.maxVolumes),
                volumesAtuais: 0
            };
        } else if (tipo === 'AGENDAMENTO') {
            novo = {
                ...basePallet,
                notaFiscal: data.notaFiscal.toUpperCase().trim(),
                recebedor: data.recebedor.toUpperCase().trim(),
                hub: data.hub.toUpperCase().trim(),
                estado: data.estado.toUpperCase().trim(),
                cidade: data.cidade.toUpperCase().trim(),
                maxVolumes: data.maxVolumes,
                volumesAtuais: 0,
                volumesDiversos: data.volumesDiversos || false,
                volumesTexto: data.volumesTexto || 'DIVERSOS',
                dataAgendamento: data.dataAgendamento || null,
                dataAgendamentoTipo: data.dataAgendamentoTipo || null,
                agendamentoMarcado: true
            };
        } else {
            novo = {
                ...basePallet,
                notaFiscal: 'DIVERSOS',
                recebedor: 'DIVERSOS',
                hub: data.hub.toUpperCase().trim(),
                estado: data.estado.toUpperCase().trim(),
                cidade: 'DIVERSOS',
                maxVolumes: null,
                volumesAtuais: null
            };
        }

        if (tipo === 'VOLUMETRIA_ALTA') {
            novo.agendamentoMarcado = this.verificarAgendamento(novo);
        }

        this.pallets.set(id, novo);
        this.saveToStorage();

        try {
            await window.db.collection('pallets').doc(id).set(novo);
        } catch (e) {
        }

        return novo;
    }

    async salvarDataAgendamento(id, dataAgendamento, dataTipo) {
        const pallet = this.pallets.get(id);
        if (!pallet || pallet.tipo !== 'AGENDAMENTO') return;

        pallet.dataAgendamento = dataAgendamento;
        pallet.dataAgendamentoTipo = dataTipo;
        pallet.ultimaAtualizacao = new Date().toISOString();

        this.saveToStorage();

        try {
            await window.db.collection('pallets').doc(id).update({
                dataAgendamento: pallet.dataAgendamento,
                dataAgendamentoTipo: pallet.dataAgendamentoTipo,
                ultimaAtualizacao: pallet.ultimaAtualizacao
            });
        } catch (e) {
        }
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
            palletsVinculados: [],
            agendamentoMarcado: palletPrincipal.agendamentoMarcado
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
        if (!pallet || pallet.tipo !== 'VOLUMETRIA_ALTA') return;

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

    async salvarObservacao(id, observacao) {
        const pallet = this.pallets.get(id);
        if (!pallet) return;

        pallet.observacao = observacao ? observacao.trim() : '';
        pallet.ultimaAtualizacao = new Date().toISOString();

        this.saveToStorage();

        try {
            await window.db.collection('pallets').doc(id).update({
                observacao: pallet.observacao,
                ultimaAtualizacao: pallet.ultimaAtualizacao
            });
        } catch (e) {
        }

        return pallet.observacao;
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

    gerarEtiquetaHTML(pallet, isAgendado, imagemBase64 = null) {
        const dataAtual = new Date();
        const dataSeparacao = dataAtual.toLocaleDateString('pt-BR');
        const horaAtual = dataAtual.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const dataEmBranco = '__/__/____';
        const horaEmBranco = '__:__';

        let tituloPallet = 'PALLET';
        let notaFiscalDisplay = pallet.notaFiscal;
        let recebedorDisplay = pallet.recebedor;
        let hubDisplay = pallet.hub;
        let ufCidadeDisplay = '';
        let volumesDisplay = '';
        let palletsDisplay = '';
        let isDiversos = pallet.tipo === 'DIVERSOS';
        let isAgendamento = pallet.tipo === 'AGENDAMENTO';

        if (pallet.tipo === 'VOLUMETRIA_ALTA') {
            tituloPallet = 'NOTA INFORMATIVA | +30 VOLUMES';
            ufCidadeDisplay = `${pallet.estado} - ${pallet.cidade}`;
            volumesDisplay = `
                <div style="text-align: center; background: #f8f9fa; padding: 12px; border-radius: 6px; border: 1px solid #ddd;">
                    <div style="font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">VOLUMES</div>
                    <div>
                        <span style="font-size: 26px; font-weight: bold;">${pallet.volumesAtuais}</span>
                        <span style="font-size: 16px;"> / ${pallet.maxVolumes}</span>
                    </div>
                </div>
            `;
            const totalPallets = this.obterTotalPalletsGrupo(pallet);
            const indiceAtual = this.obterIndiceNoGrupo(pallet);
            palletsDisplay = `
                <div style="text-align: center; background: #f8f9fa; padding: 12px; border-radius: 6px; border: 1px solid #ddd;">
                    <div style="font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">PALLETS</div>
                    <div>
                        <span style="font-size: 26px; font-weight: bold;">${indiceAtual}</span>
                        <span style="font-size: 16px;"> / ${totalPallets}</span>
                    </div>
                </div>
            `;
        } else if (pallet.tipo === 'AGENDAMENTO') {
            tituloPallet = 'NOTA INFORMATIVA | AGENDAMENTO';
            ufCidadeDisplay = `${pallet.estado} - ${pallet.cidade}`;

            if (pallet.volumesDiversos) {
                volumesDisplay = `
                    <div style="text-align: center; background: #f8f9fa; padding: 12px; border-radius: 6px; border: 1px solid #ddd;">
                        <div style="font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">VOLUMES</div>
                        <div>
                            <span style="font-size: 20px; font-weight: bold;">${pallet.volumesTexto || 'DIVERSOS'}</span>
                        </div>
                    </div>
                `;
            } else {
                volumesDisplay = `
                    <div style="text-align: center; background: #f8f9fa; padding: 12px; border-radius: 6px; border: 1px solid #ddd;">
                        <div style="font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">VOLUMES</div>
                        <div>
                            <span style="font-size: 26px; font-weight: bold;">${pallet.volumesAtuais || 0}</span>
                            <span style="font-size: 16px;"> / ${pallet.maxVolumes || '?'}</span>
                        </div>
                    </div>
                `;
            }
            palletsDisplay = '';
        } else {
            tituloPallet = 'NOTA INFORMATIVA | DIVERSOS';
            notaFiscalDisplay = 'DIVERSOS';
            recebedorDisplay = 'DIVERSOS';
            ufCidadeDisplay = `${pallet.estado} - DIVERSOS`;
            volumesDisplay = `
                <div style="text-align: center; background: #f8f9fa; padding: 12px; border-radius: 6px; border: 1px solid #ddd;">
                    <div style="font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">VOLUMES</div>
                    <div>
                        <span style="font-size: 20px; font-weight: bold;">DIVERSOS</span>
                    </div>
                </div>
            `;
            palletsDisplay = '';
        }

        const marcarAgendamento = pallet.tipo === 'VOLUMETRIA_ALTA' && pallet.agendamentoMarcado;
        const agendamentoChecked = marcarAgendamento ? 'background-color: #333; -webkit-print-color-adjust: exact; print-color-adjust: exact;' : '';

        let expedicaoContent = '';

        if (imagemBase64) {
            expedicaoContent = `
                <div style="display: flex; gap: 8mm; align-items: flex-start;">
                    <div style="flex: 2;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5mm;">
                            <div><span style="font-size: 10px; color: #777;">UNIDADE</span><br><strong style="font-size: 16px;">${hubDisplay}</strong></div>
                            <div><span style="font-size: 10px; color: #777;">NÚMERO FISCAL</span><br><strong style="font-size: 16px;">${notaFiscalDisplay}</strong></div>
                            <div><span style="font-size: 10px; color: #777;">RECEBEDOR</span><br><strong style="font-size: 16px;">${recebedorDisplay}</strong></div>
                            <div><span style="font-size: 10px; color: #777;">UF/CIDADE</span><br><strong style="font-size: 16px;">${ufCidadeDisplay}</strong></div>
                        </div>
                    </div>
                    <div style="width: 1px; background: #ddd; align-self: stretch;"></div>
                    <div style="flex: 1; text-align: center;">
                        <img src="${imagemBase64}" style="width: 100%; max-width: 140px; height: auto; object-fit: contain; margin: 0 auto; display: block;" />
                    </div>
                </div>
            `;
        } else {
            expedicaoContent = `
                <div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; max-width: 400px;">
                        <div><span style="font-size: 10px; color: #777;">UNIDADE</span><br><strong style="font-size: 16px;">${hubDisplay}</strong></div>
                        <div><span style="font-size: 10px; color: #777;">NÚMERO FISCAL</span><br><strong style="font-size: 16px;">${notaFiscalDisplay}</strong></div>
                        <div><span style="font-size: 10px; color: #777;">RECEBEDOR</span><br><strong style="font-size: 16px;">${recebedorDisplay}</strong></div>
                        <div><span style="font-size: 10px; color: #777;">UF/CIDADE</span><br><strong style="font-size: 16px;">${ufCidadeDisplay}</strong></div>
                    </div>
                </div>
            `;
        }

        return `
        <div style="
            font-family: Arial, sans-serif;
            width: 100%;
            max-width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 15mm;
            border: 1px solid #ccc;
            background: white;
            box-sizing: border-box;
            font-size: 14px;
            page-break-after: avoid;
            page-break-inside: avoid;
        ">
            <div style="text-align: center; margin-bottom: 8mm; border-bottom: 1px solid #ddd; padding-bottom: 4mm;">
                <h1 style="margin: 0; font-size: 26px; font-weight: bold;">${tituloPallet}</h1>
                <p style="color: #888; margin: 4px 0 0 0; font-size: 11px;">${dataSeparacao} ${horaAtual}</p>
            </div>

            <div style="margin-bottom: 8mm;">
                <h2 style="background: #f0f0f0; color: #333; padding: 4px 10px; border-radius: 4px; font-size: 15px; font-weight: bold; margin-bottom: 5mm; border-left: 3px solid #2c3e50;">EXPEDIÇÃO</h2>

                ${expedicaoContent}

                <div style="display: flex; gap: 8mm; justify-content: center; margin-top: 6mm;">
                    ${volumesDisplay}
                    ${palletsDisplay}
                </div>

                <div style="display: flex; gap: 10mm; margin-top: 6mm; flex-wrap: wrap;">
                    <div style="min-width: 120px;">
                        <span style="font-size: 10px; color: #777;">DATA SEPARAÇÃO</span><br>
                        <strong style="font-size: 14px;">${dataSeparacao}</strong>
                    </div>
                    <div style="flex: 1;">
                        <span style="font-size: 10px; color: #777;">RESPONSÁVEL SEPARAÇÃO</span><br>
                        <div style="border-bottom: 1px solid #999; width: 100%; height: 24px;"></div>
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 8mm;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10mm; flex-wrap: wrap;">
                    <div style="flex: 2; min-width: 200px;">
                        <h2 style="background: #f0f0f0; color: #333; padding: 4px 10px; border-radius: 4px; font-size: 15px; font-weight: bold; margin-bottom: 5mm; border-left: 3px solid #f39c12;">SERVIÇO</h2>
                        <div style="border: 1px solid #e0e0e0; border-radius: 6px; padding: 5mm;">
                            <div style="font-size: 11px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 3mm;">
                                <label style="display: flex; align-items: center; gap: 3mm; cursor: default;">
                                    <span style="border: 1.5px solid #333; display: inline-block; width: 12px; height: 12px;"></span>
                                    Entrega direta para o recebedor
                                </label>
                                <label style="display: flex; align-items: center; gap: 3mm; cursor: default;">
                                    <span style="border: 1.5px solid #333; display: inline-block; width: 12px; height: 12px;"></span>
                                    Envio para unidade ou ponto de encontro
                                </label>
                                <label style="display: flex; align-items: center; gap: 3mm; cursor: default;">
                                    <span style="border: 1.5px solid #333; display: inline-block; width: 12px; height: 12px;"></span>
                                    Interhub / Entrega para o recebedor
                                </label>
                                <label style="display: flex; align-items: center; gap: 3mm; cursor: default;">
                                    <span style="border: 1.5px solid #333; display: inline-block; width: 12px; height: 12px; ${agendamentoChecked}"></span>
                                    Agendamento
                                </label>
                            </div>
                        </div>
                    </div>
                    ${isAgendamento ? `
                    <div style="flex: 1; min-width: 150px;">
                        <h2 style="background: #f0f0f0; color: #333; padding: 4px 10px; border-radius: 4px; font-size: 15px; font-weight: bold; margin-bottom: 5mm; border-left: 3px solid #f39c12;">DATA AGENDAMENTO</h2>
                        <div style="border: 1px solid #e0e0e0; border-radius: 6px; padding: 8mm 5mm; text-align: center; background: #fff8e7;">
                            <div style="font-size: 18px; font-weight: bold; color: #e67e22;">
                                ${pallet.dataAgendamento || 'AGUARDANDO DATA DE AGENDAMENTO'}
                            </div>
                        </div>
                    </div>
                    ` : ''}
                </div>

                <div style="margin-top: 6mm;">
                    <div style="font-weight: bold; font-size: 12px; margin-bottom: 2mm; color: #555;">VINCULAR NF:</div>
                    <div style="border-bottom: 1px solid #999; height: 28px; width: 100%;"></div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 6mm;">
                    <div>
                        <span style="font-size: 10px; font-weight: bold; color: #777;">DATA PREV. EMBARQUE:</span><br>
                        <span style="font-size: 15px; font-weight: bold; letter-spacing: 1px;">${dataEmBranco}</span>
                    </div>
                    <div>
                        <span style="font-size: 10px; font-weight: bold; color: #777;">LIBERADO:</span><br>
                        <div style="display: flex; gap: 8mm; margin-top: 2px;">
                            <label style="display: flex; align-items: center; gap: 2mm; cursor: default;">
                                <span style="border: 1.5px solid #333; display: inline-block; width: 14px; height: 14px;"></span>
                                <span style="font-size: 12px;">SIM</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 2mm; cursor: default;">
                                <span style="border: 1.5px solid #333; display: inline-block; width: 14px; height: 14px;"></span>
                                <span style="font-size: 12px;">NÃO</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 8mm;">
                <h2 style="background: #f0f0f0; color: #333; padding: 4px 10px; border-radius: 4px; font-size: 15px; font-weight: bold; margin-bottom: 5mm; border-left: 3px solid #27ae60;">TRANSPORTE</h2>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-bottom: 5mm;">
                    <div>
                        <span style="font-size: 10px; font-weight: bold; color: #777;">MOTORISTA PREVISTO:</span><br>
                        <div style="border-bottom: 1px solid #999; height: 28px;"></div>
                    </div>
                    <div>
                        <span style="font-size: 10px; font-weight: bold; color: #777;">LIBERADO POR:</span><br>
                        <div style="border-bottom: 1px solid #999; height: 28px;"></div>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8mm;">
                    <div>
                        <span style="font-size: 10px; font-weight: bold; color: #777;">DATA REALIZADA ENTREGA:</span><br>
                        <span style="font-size: 14px; font-weight: bold; letter-spacing: 1px;">${dataEmBranco}</span>
                    </div>
                    <div>
                        <span style="font-size: 10px; font-weight: bold; color: #777;">HORA:</span><br>
                        <span style="font-size: 14px; font-weight: bold; letter-spacing: 1px;">${horaEmBranco}</span>
                    </div>
                </div>
            </div>

            <div style="margin-top: 5mm;">
                <div style="font-weight: bold; font-size: 12px; margin-bottom: 3mm; color: #555;">OBSERVAÇÃO:</div>
                <div style="border: 1px solid #ddd; min-height: 80px; border-radius: 4px; padding: 8px;">
                    ${pallet.observacao ? `<div style="color: #2c3e50; font-size: 12px; white-space: pre-wrap;">${pallet.observacao}</div>` : ''}
                </div>
            </div>
        </div>
    `;
    }

    imprimirEtiqueta(pallet, isAgendado, imagemBase64 = null) {
        const html = this.gerarEtiquetaHTML(pallet, isAgendado, imagemBase64);

        const janela = window.open('', '_blank');
        janela.document.write(`
        <html>
            <head>
                <title>Etiqueta Pallet - ${pallet.notaFiscal}</title>
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
                        align-items: center;
                        min-height: 100vh;
                        background: #f0f0f0;
                        font-family: Arial, sans-serif;
                        padding: 20px;
                    }
                    @media print {
                        body {
                            background: white;
                            padding: 0;
                            display: flex;
                            align-items: flex-start;
                            min-height: auto;
                        }
                        button {
                            display: none;
                        }
                    }
                </style>
            </head>
            <body>
                ${html}
                <button onclick="window.print()" style="
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
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    z-index: 1000;
                ">🖨️ IMPRIMIR</button>
            </body>
        </html>
    `);
        janela.document.close();
    }
}
