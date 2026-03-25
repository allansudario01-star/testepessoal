document.addEventListener('DOMContentLoaded', function () {

  if (typeof window.db === 'undefined') {
    mostrarErroFirebase();
    return;
  }

  window.palletService = new PalletService();
  window.agendamentoService = new AgendamentoService();

  window.palletService.setAgendamentoService(window.agendamentoService);

  configurarInterface();
  configurarTabs();
  configurarBotoes();
  configurarModals();

  renderizarPallets();
  renderizarAgendamentos();
  renderizarFinalizados();

  configurarMonitorConexao();

  function mostrarErroFirebase() {
    const main = document.querySelector('main');
    main.innerHTML = `
            <div style="
                background: #e74c3c;
                color: white;
                padding: 30px;
                border-radius: 15px;
                text-align: center;
                margin: 20px;
            ">
                <h2>❌ Erro de Conexão</h2>
                <p>Não foi possível conectar ao Firebase.</p>
                <p>Verifique sua internet e recarregue a página.</p>
                <button onclick="location.reload()" style="
                    background: white;
                    color: #e74c3c;
                    border: none;
                    padding: 15px 30px;
                    border-radius: 10px;
                    margin-top: 20px;
                    font-size: 16px;
                ">Recarregar</button>
            </div>
        `;
  }

  function configurarInterface() {
    const metaViewport = document.querySelector('meta[name=viewport]');
    metaViewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes, viewport-fit=cover';
    document.querySelectorAll('input').forEach(input => {
      input.addEventListener('focus', () => {
        input.style.fontSize = '16px';
      });
    });
  }

  function configurarTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(tabName + '-tab').classList.add('active');
        if (tabName === 'finalizados') {
          renderizarFinalizados();
        }
        if (tabName === 'agendamentos') {
          renderizarAgendamentos();
        }
      });
    });
  }

  function resetFormularioVolumetriaAlta() {
    document.getElementById('nf').value = '';
    document.getElementById('recebedor').value = '';
    document.getElementById('hub').value = '';
    document.getElementById('estado').value = '';
    document.getElementById('cidade').value = '';
    document.getElementById('maxVolumes').value = '';
    document.getElementById('volumes-diversos-checkbox').checked = false;
    document.getElementById('volumes-fixo-container').style.display = 'block';

    // Resetar data de agendamento
    document.querySelectorAll('input[name="data-agendamento-tipo"]').forEach(radio => {
      if (radio.value === 'aguardando') radio.checked = true;
    });
    document.getElementById('data-agendamento-fixa').style.display = 'none';
    document.getElementById('data-agendamento-fixa').value = '';
  }

  function resetFormularioDiversos() {
    document.getElementById('hub-diversos').value = '';
    document.getElementById('estado-diversos').value = '';
  }

  async function salvarObservacaoAtual() {
    const observacao = document.getElementById('observacao-pallet').value;
    if (window.palletAtual && window.palletService) {
      await window.palletService.salvarObservacao(window.palletAtual, observacao);
    }
  }

  async function salvarDataAgendamentoAtual() {
    if (!window.palletAtual) return;

    const dataTipo = document.querySelector('input[name="ajustar-data-tipo"]:checked')?.value;
    let dataAgendamento = '';

    if (dataTipo === 'fixa') {
      dataAgendamento = document.getElementById('ajustar-data-fixa').value;
      if (dataAgendamento) {
        dataAgendamento = new Date(dataAgendamento).toLocaleDateString('pt-BR');
      }
    } else if (dataTipo === 'aguardando') {
      dataAgendamento = 'AGUARDANDO AGENDAMENTO';
    }

    if (dataAgendamento) {
      await window.palletService.salvarDataAgendamento(window.palletAtual, dataAgendamento, dataTipo);
    }
  }

  function configurarBotoes() {
    document.getElementById('create-pallet-btn').addEventListener('click', () => {
      document.getElementById('tipo-pallet-modal').classList.remove('hidden');
    });

    document.getElementById('tipo-volumetria-alta').addEventListener('click', () => {
      document.getElementById('tipo-pallet-modal').classList.add('hidden');
      document.getElementById('pallet-modal-title').textContent = 'Novo Pallet - Volumetria Alta';
      resetFormularioVolumetriaAlta();
      document.getElementById('pallet-modal').classList.remove('hidden');
    });

    document.getElementById('tipo-agendamento').addEventListener('click', () => {
      document.getElementById('tipo-pallet-modal').classList.add('hidden');
      document.getElementById('pallet-modal-title').textContent = 'Novo Pallet - Agendamento';
      resetFormularioVolumetriaAlta();
      document.getElementById('pallet-modal').classList.remove('hidden');
    });

    document.getElementById('tipo-diversos').addEventListener('click', () => {
      document.getElementById('tipo-pallet-modal').classList.add('hidden');
      resetFormularioDiversos();
      document.getElementById('pallet-diversos-modal').classList.remove('hidden');
    });

    document.getElementById('cancel-tipo-modal').addEventListener('click', () => {
      document.getElementById('tipo-pallet-modal').classList.add('hidden');
    });

    // Checkbox para volumes diversos
    document.getElementById('volumes-diversos-checkbox').addEventListener('change', (e) => {
      const volumesFixoContainer = document.getElementById('volumes-fixo-container');
      if (e.target.checked) {
        volumesFixoContainer.style.display = 'none';
        document.getElementById('maxVolumes').removeAttribute('required');
      } else {
        volumesFixoContainer.style.display = 'block';
        document.getElementById('maxVolumes').setAttribute('required', 'required');
      }
    });

    // Radio buttons para data de agendamento
    document.querySelectorAll('input[name="data-agendamento-tipo"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const dataFixaInput = document.getElementById('data-agendamento-fixa');
        if (e.target.value === 'fixa') {
          dataFixaInput.style.display = 'block';
          dataFixaInput.setAttribute('required', 'required');
        } else {
          dataFixaInput.style.display = 'none';
          dataFixaInput.removeAttribute('required');
        }
      });
    });

    document.getElementById('pallet-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const volumesDiversos = document.getElementById('volumes-diversos-checkbox').checked;
      let maxVolumes = null;

      if (!volumesDiversos) {
        maxVolumes = parseInt(document.getElementById('maxVolumes').value);
      }

      // Pegar data de agendamento
      const dataTipo = document.querySelector('input[name="data-agendamento-tipo"]:checked').value;
      let dataAgendamento = '';
      let dataAgendamentoTipo = dataTipo;

      if (dataTipo === 'fixa') {
        const dataFixa = document.getElementById('data-agendamento-fixa').value;
        if (dataFixa) {
          dataAgendamento = new Date(dataFixa).toLocaleDateString('pt-BR');
        }
      } else if (dataTipo === 'aguardando') {
        dataAgendamento = 'AGUARDANDO AGENDAMENTO';
      }

      const dados = {
        notaFiscal: document.getElementById('nf').value,
        recebedor: document.getElementById('recebedor').value,
        hub: document.getElementById('hub').value,
        estado: document.getElementById('estado').value,
        cidade: document.getElementById('cidade').value,
        maxVolumes: maxVolumes,
        volumesDiversos: volumesDiversos,
        dataAgendamento: dataAgendamento,
        dataAgendamentoTipo: dataAgendamentoTipo
      };

      const tipo = document.getElementById('pallet-modal-title').textContent.includes('Agendamento') ? 'AGENDAMENTO' : 'VOLUMETRIA_ALTA';
      await window.palletService.create(dados, tipo);
      document.getElementById('pallet-modal').classList.add('hidden');
      renderizarPallets();
    });

    document.getElementById('pallet-diversos-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const dados = {
        hub: document.getElementById('hub-diversos').value,
        estado: document.getElementById('estado-diversos').value,
        cidade: ''
      };
      await window.palletService.create(dados, 'DIVERSOS');
      document.getElementById('pallet-diversos-modal').classList.add('hidden');
      renderizarPallets();
    });

    document.getElementById('close-modal').addEventListener('click', () => {
      document.getElementById('pallet-modal').classList.add('hidden');
    });

    document.getElementById('close-diversos-modal').addEventListener('click', () => {
      document.getElementById('pallet-diversos-modal').classList.add('hidden');
    });

    document.getElementById('close-ajustar-modal').addEventListener('click', async () => {
      await salvarObservacaoAtual();
      await salvarDataAgendamentoAtual();
      document.getElementById('ajustar-modal').classList.add('hidden');
    });

    document.getElementById('search-nf').addEventListener('input', debounce(renderizarPallets, 300));
    document.getElementById('search-agendamentos').addEventListener('input', debounce(renderizarAgendamentos, 300));
    document.getElementById('search-finalizados')?.addEventListener('input', debounce(renderizarFinalizados, 300));

    document.getElementById('clear-history')?.addEventListener('click', () => {
      if (confirm('⚠️ Limpar todo o histórico de pallets finalizados?')) {
        window.palletService.limparHistorico();
        renderizarFinalizados();
      }
    });

    document.getElementById('save-volume').addEventListener('click', async () => {
      if (!window.palletAtual) return;
      await salvarObservacaoAtual();
      await salvarDataAgendamentoAtual();
      const novosVolumes = parseInt(document.getElementById('manual-volume').value) || 0;
      await window.palletService.updateVolumes(window.palletAtual, novosVolumes);
      document.getElementById('ajustar-modal').classList.add('hidden');
      renderizarPallets();
    });

    document.getElementById('finalize-from-ajustar').addEventListener('click', async () => {
      await salvarObservacaoAtual();
      await salvarDataAgendamentoAtual();
      const pallet = window.palletService.pallets.get(window.palletAtual);
      if (!pallet) return;
      document.getElementById('ajustar-modal').classList.add('hidden');
      if (pallet.tipo === 'VOLUMETRIA_ALTA' || pallet.tipo === 'AGENDAMENTO') {
        document.getElementById('finalizar-modal').classList.remove('hidden');
      } else {
        finalizarPalletDireto(window.palletAtual, false);
      }
    });

    document.getElementById('delete-from-ajustar').addEventListener('click', async () => {
      await salvarObservacaoAtual();
      if (confirm('⚠️ Tem certeza que deseja excluir este pallet?')) {
        await window.palletService.excluir(window.palletAtual);
        document.getElementById('ajustar-modal').classList.add('hidden');
        renderizarPallets();
      }
    });

    document.getElementById('confirm-finalizar-sim').addEventListener('click', async () => {
      await finalizarPalletComConfirmacao(window.palletAtual, true);
    });

    document.getElementById('confirm-finalizar-nao').addEventListener('click', async () => {
      await finalizarPalletComConfirmacao(window.palletAtual, false);
    });

    document.getElementById('cancel-finalizar').addEventListener('click', () => {
      document.getElementById('finalizar-modal').classList.add('hidden');
    });

    document.getElementById('confirmar-imprimir').addEventListener('click', async () => {
      const fileInput = document.getElementById('imagem-qrcode');
      const file = fileInput.files[0];
      let imagemBase64 = null;
      if (file) {
        imagemBase64 = await lerArquivoComoBase64(file);
      }
      const pallet = window.palletService.pallets.get(window.palletAImprimir);
      if (pallet) {
        const isAgendado = pallet.agendamentoMarcado;
        window.palletService.imprimirEtiqueta(pallet, isAgendado, imagemBase64);
      }
      document.getElementById('anexar-imagem-modal').classList.add('hidden');
    });

    document.getElementById('imprimir-sem-imagem').addEventListener('click', () => {
      const pallet = window.palletService.pallets.get(window.palletAImprimir);
      if (pallet) {
        const isAgendado = pallet.agendamentoMarcado;
        window.palletService.imprimirEtiqueta(pallet, isAgendado, null);
      }
      document.getElementById('anexar-imagem-modal').classList.add('hidden');
    });

    document.getElementById('cancelar-imagem-modal').addEventListener('click', () => {
      document.getElementById('anexar-imagem-modal').classList.add('hidden');
    });
  }

  function lerArquivoComoBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function finalizarPalletComConfirmacao(id, bipado) {
    await window.palletService.finalizar(id, bipado);
    document.getElementById('finalizar-modal').classList.add('hidden');
    renderizarPallets();
    renderizarFinalizados();
  }

  async function finalizarPalletDireto(id, bipado) {
    await window.palletService.finalizar(id, bipado);
    renderizarPallets();
    renderizarFinalizados();
  }

  function configurarModals() {
  }

  function configurarMonitorConexao() {
    window.addEventListener('online', () => {
      document.getElementById('offline-banner').classList.add('hidden');
    });
    window.addEventListener('offline', () => {
      document.getElementById('offline-banner').classList.remove('hidden');
    });
  }

  window.abrirModalAjustar = function (id) {
    const p = window.palletService.pallets.get(id);
    if (!p) return;
    window.palletAtual = id;
    const isVolumetriaAlta = p.tipo === 'VOLUMETRIA_ALTA';
    const isAgendamento = p.tipo === 'AGENDAMENTO';
    const modalTitle = document.getElementById('ajustar-modal-title');
    const infoDiv = document.getElementById('ajustar-info');
    const volumeControls = document.getElementById('volume-controls-container');
    const saveButton = document.getElementById('save-volume');
    const observacaoTextarea = document.getElementById('observacao-pallet');
    const dataAgendamentoContainer = document.getElementById('data-agendamento-container');

    if (observacaoTextarea) {
      observacaoTextarea.value = p.observacao || '';
    }

    if (isAgendamento) {
      modalTitle.innerText = `Ajustar Pallet Agendado - ${p.notaFiscal || 'AGENDAMENTO'}`;

      // Configurar dados de agendamento
      dataAgendamentoContainer.style.display = 'block';
      if (p.dataAgendamentoTipo === 'fixa' && p.dataAgendamento) {
        document.querySelector('input[name="ajustar-data-tipo"][value="fixa"]').checked = true;
        document.getElementById('ajustar-data-fixa').style.display = 'block';
        // Converter data de volta para formato YYYY-MM-DD
        const partes = p.dataAgendamento.split('/');
        if (partes.length === 3) {
          document.getElementById('ajustar-data-fixa').value = `${partes[2]}-${partes[1]}-${partes[0]}`;
        }
      } else {
        document.querySelector('input[name="ajustar-data-tipo"][value="aguardando"]').checked = true;
        document.getElementById('ajustar-data-fixa').style.display = 'none';
      }

      // Configurar evento para os radios
      document.querySelectorAll('input[name="ajustar-data-tipo"]').forEach(radio => {
        radio.onchange = () => {
          if (radio.value === 'fixa') {
            document.getElementById('ajustar-data-fixa').style.display = 'block';
          } else {
            document.getElementById('ajustar-data-fixa').style.display = 'none';
          }
        };
      });
    } else {
      dataAgendamentoContainer.style.display = 'none';
    }

    if (isVolumetriaAlta || isAgendamento) {
      const volumesDisplay = p.volumesDiversos ? 'DIVERSOS' : `${p.volumesAtuais || 0} / ${p.maxVolumes || '?'}`;

      infoDiv.innerHTML = `
            <div>
                <strong>Número Fiscal:</strong> ${p.notaFiscal || 'N/A'}<br>
                <strong>Recebedor:</strong> ${p.recebedor || 'N/A'}<br>
                <strong>Unidade:</strong> ${p.hub}<br>
                <strong>UF:</strong> ${p.estado}<br>
                <strong>Cidade:</strong> ${p.cidade || 'N/A'}<br>
                <strong>Volumes:</strong> ${volumesDisplay}<br>
                ${isAgendamento && p.dataAgendamento ? `<strong>📅 Data Agendamento:</strong> ${p.dataAgendamento}<br>` : ''}
                <strong>Status:</strong> ${p.agendamentoMarcado ? '📅 AGENDADO' : '📦 BOLSÃO'}<br>
                ${p.observacao ? `<strong>📝 Obs:</strong> ${p.observacao}` : ''}
            </div>
        `;

      if (!p.volumesDiversos) {
        volumeControls.innerHTML = `
            <button class="btn-volume" data-value="-10">-10</button>
            <button class="btn-volume" data-value="-5">-5</button>
            <button class="btn-volume" data-value="-1">-1</button>
            <input type="number" id="manual-volume" min="0" value="${p.volumesAtuais || 0}" placeholder="0">
            <button class="btn-volume" data-value="1">+1</button>
            <button class="btn-volume" data-value="5">+5</button>
            <button class="btn-volume" data-value="10">+10</button>
        `;
        saveButton.style.display = 'block';

        volumeControls.querySelectorAll('.btn-volume').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const valor = parseInt(e.target.dataset.value);
            const atual = parseInt(document.getElementById('manual-volume').value) || 0;
            document.getElementById('manual-volume').value = Math.max(0, atual + valor);
          });
        });
      } else {
        volumeControls.innerHTML = `<div style="text-align: center; color: #7f8c8d;">📦 Volumetria Diversa - sem controle de volumes</div>`;
        saveButton.style.display = 'none';
      }
    } else if (p.tipo === 'DIVERSOS') {
      dataAgendamentoContainer.style.display = 'none';
      infoDiv.innerHTML = `
            <div>
                <strong>Unidade:</strong> ${p.hub}<br>
                <strong>UF:</strong> ${p.estado}<br>
                <strong>Cidade:</strong> DIVERSOS<br>
                <strong>Volumes:</strong> DIVERSOS
                ${p.observacao ? `<br><strong>📝 Obs:</strong> ${p.observacao}` : ''}
            </div>
        `;
      volumeControls.innerHTML = `<div style="text-align: center; color: #7f8c8d;">Não é possível ajustar volumes para pallets de diversos.</div>`;
      saveButton.style.display = 'none';
    }

    document.getElementById('ajustar-modal').classList.remove('hidden');
  };

  window.finalizarPallet = function (id) {
    const p = window.palletService.pallets.get(id);
    if (!p) return;
    window.palletAtual = id;
    if (p.tipo === 'VOLUMETRIA_ALTA' || p.tipo === 'AGENDAMENTO') {
      document.getElementById('finalizar-modal').classList.remove('hidden');
    } else {
      finalizarPalletDireto(id, false);
    }
  };

  window.anexarPallet = async function (id) {
    const palletPrincipal = window.palletService.pallets.get(id);
    if (!palletPrincipal || (palletPrincipal.tipo !== 'VOLUMETRIA_ALTA' && palletPrincipal.tipo !== 'AGENDAMENTO')) {
      alert('Só é possível anexar a pallets de volumetria alta ou agendamento.');
      return;
    }
    const novoPallet = await window.palletService.anexarPallet(id);
    if (novoPallet) {
      alert(`Pallet anexado criado com sucesso!`);
      renderizarPallets();
    } else {
      alert('Erro ao criar pallet anexado.');
    }
  };

  window.imprimirPallet = function (id) {
    const pallet = window.palletService.pallets.get(id);
    if (!pallet) return;

    window.palletAImprimir = id;

    if (pallet.tipo === 'VOLUMETRIA_ALTA' || pallet.tipo === 'AGENDAMENTO') {
      document.getElementById('anexar-imagem-modal').classList.remove('hidden');
    } else {
      const isAgendado = false;
      window.palletService.imprimirEtiqueta(pallet, isAgendado, null);
    }
  };

  window.excluirPallet = async function (id) {
    if (confirm('⚠️ Tem certeza que deseja excluir este pallet?')) {
      await window.palletService.excluir(id);
      renderizarPallets();
    }
  };

  window.reimprimirEtiqueta = function (id) {
    const pallet = window.palletService.finalizados.get(id);
    if (!pallet) return;
    const isAgendado = pallet.tipo === 'VOLUMETRIA_ALTA' || pallet.tipo === 'AGENDAMENTO' ? pallet.agendamentoMarcado : false;
    window.palletService.imprimirEtiqueta(pallet, isAgendado, null);
  };

  function renderizarPallets() {
    const busca = document.getElementById('search-nf').value;
    const pallets = window.palletService.listar(busca);
    const lista = document.getElementById('pallets-list');

    if (pallets.length === 0) {
      lista.innerHTML = '<div style="text-align: center; padding: 50px; color: #7f8c8d;">📦 Nenhum pallet ativo</div>';
      return;
    }

    let html = '';

    const palletsPrincipais = pallets.filter(p => !p.palletPrincipalId);

    for (const p of palletsPrincipais) {
      const anexos = pallets.filter(a => a.palletPrincipalId === p.id);
      const isDiversos = p.tipo === 'DIVERSOS';
      const isAgendamento = p.tipo === 'AGENDAMENTO';
      const agendado = (p.tipo === 'VOLUMETRIA_ALTA' || p.tipo === 'AGENDAMENTO') ? p.agendamentoMarcado : false;
      let cardClass = `pallet-card ${agendado ? 'agendado' : ''}`;
      if (isDiversos) cardClass += ' diversos';
      if (isAgendamento) cardClass += ' agendamento';

      const totalPalletsGrupo = 1 + anexos.length;

      const volumesDisplay = p.volumesDiversos ? 'DIVERSOS' : (p.tipo === 'DIVERSOS' ? 'DIVERSOS' : `${p.volumesAtuais || 0} / ${p.maxVolumes || '?'}`);

      html += `
            <div class="${cardClass}" style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span class="nf-tag">${isDiversos ? 'DIVERSOS' : (isAgendamento ? '📅 AGENDAMENTO' : `NF ${p.notaFiscal}`)}</span>
                    ${(p.tipo === 'VOLUMETRIA_ALTA' || p.tipo === 'AGENDAMENTO') ? (agendado ? '<span class="agendado-badge">📅 AGENDADO</span>' : '<span class="nao-agendado-badge">📦 BOLSÃO</span>') : ''}
                </div>

                <div class="info-grid">
                    <div class="info-item">
                        <small>Recebedor</small>
                        <strong>${p.recebedor || 'DIVERSOS'}</strong>
                    </div>
                    <div class="info-item">
                        <small>Unidade/UF</small>
                        <strong>${p.hub} - ${p.estado}</strong>
                    </div>
                    ${!isDiversos ? `
                    <div class="info-item">
                        <small>Cidade</small>
                        <strong>${p.cidade || 'N/A'}</strong>
                    </div>
                    ` : ''}
                    <div class="info-item">
                        <small>Volumes</small>
                        <strong>${volumesDisplay}</strong>
                    </div>
                </div>
                ${isAgendamento && p.dataAgendamento ? `
                <div style="margin-top: 10px; padding: 8px; background: #fff3e0; border-radius: 8px; font-size: 12px; color: #e67e22; border-left: 3px solid #f39c12;">
                    📅 ${p.dataAgendamento}
                </div>
                ` : ''}
                ${p.observacao ? `
                <div style="margin-top: 10px; padding: 8px; background: #fff3e0; border-radius: 8px; font-size: 12px; color: #e67e22; border-left: 3px solid #f39c12;">
                    📝 ${p.observacao}
                </div>
                ` : ''}
                ${!isDiversos && !p.volumesDiversos && p.volumesAtuais >= p.maxVolumes ? '<div class="completo-alert">✅ PALLET COMPLETO</div>' : ''}

                <div class="card-actions">
                    <button onclick="abrirModalAjustar('${p.id}')">Ajustar</button>
                    <button onclick="finalizarPallet('${p.id}')">Finalizar</button>
                    ${!isDiversos ? `<button onclick="anexarPallet('${p.id}')">Anexar Pallet</button>` : ''}
                    <button onclick="imprimirPallet('${p.id}')">Imprimir</button>
                    <button onclick="excluirPallet('${p.id}')">Excluir</button>
                </div>
        `;

      if (anexos.length > 0) {
        html += `<div style="margin-top: 15px; padding-top: 10px; border-top: 2px dashed #ccc;">`;
        html += `<div style="font-size: 12px; color: #7f8c8d; margin-bottom: 10px;">📎 Pallets anexados (${totalPalletsGrupo} pallets no total):</div>`;

        let index = 2;
        for (const anexo of anexos) {
          const agendadoAnexo = anexo.tipo === 'VOLUMETRIA_ALTA' || anexo.tipo === 'AGENDAMENTO' ? anexo.agendamentoMarcado : false;
          const volumesAnexo = anexo.volumesDiversos ? 'DIVERSOS' : `${anexo.volumesAtuais} / ${anexo.maxVolumes}`;
          html += `
                    <div class="pallet-card anexado" style="margin-bottom: 10px; background: #f9f9f9; border-left: 4px solid #f39c12;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <span class="nf-tag" style="font-size: 16px;">Anexado ${index}/${totalPalletsGrupo} - ${anexo.tipo === 'AGENDAMENTO' ? '📅 ' : ''}NF ${anexo.notaFiscal}</span>
                            ${(anexo.tipo === 'VOLUMETRIA_ALTA' || anexo.tipo === 'AGENDAMENTO') ? (agendadoAnexo ? '<span class="agendado-badge" style="font-size: 10px;">📅 AGENDADO</span>' : '<span class="nao-agendado-badge" style="font-size: 10px;">📦 BOLSÃO</span>') : ''}
                        </div>
                        <div class="info-grid" style="grid-template-columns: 1fr 1fr; gap: 8px;">
                            <div class="info-item"><small>Recebedor</small><strong>${anexo.recebedor}</strong></div>
                            <div class="info-item"><small>Unidade/UF</small><strong>${anexo.hub} - ${anexo.estado}</strong></div>
                            <div class="info-item"><small>Volumes</small><strong>${volumesAnexo}</strong></div>
                        </div>
                        ${anexo.dataAgendamento ? `
                        <div style="margin-top: 8px; padding: 6px; background: #fff3e0; border-radius: 6px; font-size: 11px; color: #e67e22;">
                            📅 ${anexo.dataAgendamento}
                        </div>
                        ` : ''}
                        ${anexo.observacao ? `
                        <div style="margin-top: 8px; padding: 6px; background: #fff3e0; border-radius: 6px; font-size: 11px; color: #e67e22;">
                            📝 ${anexo.observacao}
                        </div>
                        ` : ''}
                        <div class="card-actions" style="margin-top: 10px;">
                            <button onclick="abrirModalAjustar('${anexo.id}')" style="padding: 8px; font-size: 12px;">Ajustar</button>
                            <button onclick="finalizarPallet('${anexo.id}')" style="padding: 8px; font-size: 12px;">Finalizar</button>
                            <button onclick="imprimirPallet('${anexo.id}')" style="padding: 8px; font-size: 12px;">Imprimir</button>
                            <button onclick="excluirPallet('${anexo.id}')" style="padding: 8px; font-size: 12px;">Excluir</button>
                        </div>
                    </div>
                `;
          index++;
        }
        html += `</div>`;
      }

      html += `</div>`;
    }

    lista.innerHTML = html;
  }

  function renderizarAgendamentos() {
    const busca = document.getElementById('search-agendamentos').value.toLowerCase();
    let agendamentos = window.agendamentoService.listar();

    if (busca) {
      agendamentos = agendamentos.filter(a => a.displayString.toLowerCase().includes(busca));
    }

    const lista = document.getElementById('agendamentos-list');

    if (agendamentos.length === 0) {
      lista.innerHTML = '<div style="text-align: center; padding: 20px; color: #7f8c8d;">📋 Nenhum agendamento encontrado</div>';
      return;
    }

    let html = '';
    agendamentos.forEach(a => {
      html += `
            <div class="agendamento-item">
                <div class="agendamento-info">
                    ${a.displayString}
                    <small>${new Date(a.criadoEm).toLocaleDateString()}</small>
                </div>
            </div>
        `;
    });
    lista.innerHTML = html;
  }

  function renderizarFinalizados() {
    const busca = document.getElementById('search-finalizados')?.value || '';
    const finalizados = window.palletService.listarFinalizados(busca);
    const lista = document.getElementById('finalizados-list');

    if (finalizados.length === 0) {
      lista.innerHTML = '<div style="text-align: center; padding: 50px; color: #7f8c8d;">📦 Nenhum pallet finalizado</div>';
      return;
    }

    let html = '';
    finalizados.forEach(p => {
      const dataFinalizacao = new Date(p.finalizadoEm).toLocaleDateString('pt-BR');
      const isDiversos = p.tipo === 'DIVERSOS';
      const isAgendamento = p.tipo === 'AGENDAMENTO';
      const volumesDisplay = p.volumesDiversos ? 'DIVERSOS' : (isDiversos ? 'DIVERSOS' : `${p.volumesAtuais}/${p.maxVolumes}`);

      html += `
                <div class="finalizado-card">
                    <div class="finalizado-header">
                        <span>${isAgendamento ? '📅 ' : ''}${isDiversos ? 'DIVERSOS' : `NF ${p.notaFiscal}`}</span>
                        ${!isDiversos ? `<span class="finalizado-badge ${p.bipado ? 'bipado' : 'nao-bipado'}">
                            ${p.bipado ? '✅ BIPADO' : '⚠️ NÃO BIPADO'}
                        </span>` : ''}
                    </div>

                    <div class="finalizado-info">
                        <div><small>Recebedor</small><br>${p.recebedor || 'DIVERSOS'}</div>
                        <div><small>Unidade/UF</small><br>${p.hub} - ${p.estado}</div>
                        <div><small>Volumes</small><br>${volumesDisplay}</div>
                        <div><small>Finalizado</small><br>${dataFinalizacao}</div>
                    </div>
                    ${isAgendamento && p.dataAgendamento ? `
                    <div style="margin-top: 10px; padding: 8px; background: #fff3e0; border-radius: 8px; font-size: 12px; color: #e67e22;">
                        📅 ${p.dataAgendamento}
                    </div>
                    ` : ''}
                    ${p.observacao ? `
                    <div style="margin-top: 10px; padding: 8px; background: #fff3e0; border-radius: 8px; font-size: 12px; color: #e67e22;">
                        📝 ${p.observacao}
                    </div>
                    ` : ''}
                    <div style="margin-top: 15px;">
                        <button onclick="reimprimirEtiqueta('${p.id}')" style="width: 100%; padding: 10px; background: #3498db; color: white; border: none; border-radius: 8px;">
                            🖨️ Reimprimir
                        </button>
                    </div>
                </div>
            `;
    });
    lista.innerHTML = html;
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
});
