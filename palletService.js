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
<style>
@page { size: A4; margin: 0; }

body {
    margin: 0;
    font-family: Arial, sans-serif;
}

.page {
    position: relative;
    width: 210mm;
    height: 297mm;
}

/* CHECKBOX */
.checkbox {
    width: 4mm;
    height: 4mm;
    border: 1px solid #000;
    display: inline-block;
    margin-right: 2mm;
}

/* LINHA */
.line {
    border-bottom: 1px solid #000;
    width: 100%;
    height: 4mm;
}

/* SIDEBAR */
.sidebar {
    position: absolute;
    right: 0;
    width: 8mm;
    text-align: center;
    font-size: 9px;
    font-weight: bold;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
}

.sep { top: 90mm; }
.serv { top: 120mm; }
.transf { top: 150mm; }
.last { top: 200mm; }

.no-print {
    position: fixed;
    bottom: 10px;
    right: 10px;
}

@media print {
    .no-print { display: none; }
}
</style>
</head>

<body>

<div class="page">

<!-- SIDEBARS -->
<div class="sidebar sep">SEPARAÇÃO</div>
<div class="sidebar serv">SERVIÇO</div>
<div class="sidebar transf">TRANSFERÊNCIA</div>
<div class="sidebar last">LAST MILE</div>

<!-- HEADER -->
<div style="position:absolute; top:10mm; left:10mm; font-size:10px;">
    Nº Container:
</div>
<div style="position:absolute; top:15mm; left:10mm; width:60mm; border-bottom:1px solid #000;"></div>

<div style="position:absolute; top:10mm; right:10mm; font-size:10px;">
    ${dataHora}
</div>

<!-- REGIAO -->
<div style="position:absolute; top:25mm; left:10mm; font-size:8px;">REGIÃO</div>
<div style="position:absolute; top:30mm; left:10mm; font-size:20px; font-weight:bold;">
    ${pallet.regiao || ''}
</div>

<!-- SUB -->
<div style="position:absolute; top:25mm; left:80mm; font-size:8px;">SUB</div>
<div style="position:absolute; top:30mm; left:80mm; font-size:20px; font-weight:bold;">
    ${pallet.subregiao || ''}
</div>

<!-- CIDADE -->
<div style="position:absolute; top:25mm; left:130mm; font-size:8px;">CIDADE</div>
<div style="position:absolute; top:30mm; left:130mm; font-size:14px;">
    ${pallet.cidade || ''}
</div>

<!-- UF -->
<div style="position:absolute; top:25mm; right:10mm; font-size:8px;">UF</div>
<div style="position:absolute; top:30mm; right:10mm; font-size:20px; font-weight:bold;">
    ${pallet.estado || ''}
</div>

<!-- EMBARCADOR -->
<div style="position:absolute; top:50mm; left:10mm;">Embarcador:</div>
<div style="position:absolute; top:55mm; left:10mm; width:120mm;" class="line"></div>

<!-- RECEBEDOR -->
<div style="position:absolute; top:65mm; left:10mm;">
    Recebedor: ${pallet.recebedor || ''}
</div>

<!-- QR -->
${qrCodeUrl ? `
<img src="${qrCodeUrl}"
style="position:absolute; top:55mm; right:10mm; width:35mm; height:35mm;" />
` : ''}

<!-- VOLUMES -->
<div style="position:absolute; top:80mm; left:10mm;">
    Volumes: ${volumesDisplay}
</div>

<!-- PALLETS -->
<div style="position:absolute; top:80mm; left:80mm;">
    Pallets: ${palletsDisplay}
</div>

<!-- CONFERENCIA -->
<div style="position:absolute; top:90mm; left:10mm;">
    CONFERÊNCIA:
    <span class="checkbox"></span> Completo
    <span class="checkbox"></span> Parcial
</div>

<!-- PERECIVEIS -->
<div style="position:absolute; top:90mm; left:100mm;">
    Perecíveis:
    <span class="checkbox"></span> Sim
    <span class="checkbox"></span> Não
</div>

<!-- DESTINATARIO -->
<div style="position:absolute; top:100mm; left:10mm;">
    Único Destinatário:
    <span class="checkbox"></span> Sim
    <span class="checkbox"></span> Não
</div>

<!-- NF -->
<div style="position:absolute; top:100mm; left:120mm;">
    Nº NF: ${pallet.notaFiscal || ''}
</div>

<!-- RESPONSAVEL -->
<div style="position:absolute; top:115mm; left:10mm;">
    Responsável Separação:
</div>
<div style="position:absolute; top:120mm; left:10mm; width:120mm;" class="line"></div>

<!-- SERVIÇO -->
<div style="position:absolute; top:130mm; left:10mm;">
    <span class="checkbox"></span> Alta volumetria (+30)
</div>

<div style="position:absolute; top:130mm; left:100mm;">
    Data/Hora:
</div>

<div style="position:absolute; top:140mm; left:10mm;">
    <span class="checkbox"></span> Fracionado (-30)
</div>

<div style="position:absolute; top:150mm; left:10mm;">
    <span class="checkbox"></span> Exclusivo (EPI)
</div>

<div style="position:absolute; top:160mm; left:10mm;">
    <span class="checkbox"></span> Crossdocking
</div>

<div style="position:absolute; top:170mm; left:10mm;">
    <span class="checkbox"></span> Ponto de encontro
</div>

<!-- TRANSFERENCIA / LAST MILE SIMPLIFICADO -->
${[1, 2, 3, 4].map((i, idx) => `
<div style="position:absolute; top:${180 + (idx * 25)}mm; left:10mm; font-weight:bold;">
    Trecho 0${i}
</div>

<div style="position:absolute; top:${185 + (idx * 25)}mm; left:10mm;">
    Data/Hora:
</div>

<div style="position:absolute; top:${185 + (idx * 25)}mm; left:70mm;">
    Viagem:
</div>

<div style="position:absolute; top:${185 + (idx * 25)}mm; left:120mm;">
    Doca:
</div>
`).join('')}

<!-- RESPONSAVEL FINAL -->
<div style="position:absolute; bottom:15mm; left:10mm;">
    Responsável Planejamento:
</div>
<div style="position:absolute; bottom:10mm; left:10mm; width:150mm;" class="line"></div>

</div>

<button onclick="window.print()" class="no-print">IMPRIMIR</button>

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
