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
    document.getElementById('regiao').value = '';
    document.getElementById('subregiao').value = '';
    document.getElementById('maxVolumes').value = '';
  }

  function resetFormularioAgendamento() {
    document.getElementById('agendamento-nf').value = '';
    document.getElementById('agendamento-recebedor').value = '';
    document.getElementById('agendamento-hub').value = '';
    document.getElementById('agendamento-estado').value = '';
    document.getElementById('agendamento-cidade').value = '';
    document.getElementById('agendamento-regiao').value = '';
    document.getElementById('agendamento-subregiao').value = '';
    document.getElementById('agendamento-maxVolumes').value = '';
    document.getElementById('agendamento-volumes-texto').value = 'DIVERSOS';

    document.querySelector('input[name="agendamento-volume-tipo"][value="fixo"]').checked = true;
    document.getElementById('agendamento-volumes-fixo').style.display = 'block';
    document.getElementById('agendamento-volumes-diversos').style.display = 'none';
    document.getElementById('agendamento-maxVolumes').setAttribute('required', 'required');
    document.getElementById('agendamento-volumes-texto').removeAttribute('required');
  }

  function resetFormularioDiversos() {
    document.getElementById('hub-diversos').value = '';
    document.getElementById('estado-diversos').value = '';
    document.getElementById('regiao-diversos').value = '';
    document.getElementById('subregiao-diversos').value = '';
  }

  function configurarBotoes() {
    document.getElementById('create-pallet-btn').addEventListener('click', () => {
      document.getElementById('tipo-pallet-modal').classList.remove('hidden');
    });

    document.getElementById('tipo-volumetria-alta').addEventListener('click', () => {
      document.getElementById('tipo-pallet-modal').classList.add('hidden');
      resetFormularioVolumetriaAlta();
      document.getElementById('pallet-modal').classList.remove('hidden');
    });

    document.getElementById('tipo-agendamento').addEventListener('click', () => {
      document.getElementById('tipo-pallet-modal').classList.add('hidden');
      resetFormularioAgendamento();
      document.getElementById('pallet-agendamento-modal').classList.remove('hidden');
    });

    document.getElementById('tipo-diversos').addEventListener('click', () => {
      document.getElementById('tipo-pallet-modal').classList.add('hidden');
      resetFormularioDiversos();
      document.getElementById('pallet-diversos-modal').classList.remove('hidden');
    });

    document.getElementById('cancel-tipo-modal').addEventListener('click', () => {
      document.getElementById('tipo-pallet-modal').classList.add('hidden');
    });

    document.getElementById('scan-btn-modal').addEventListener('click', () => {
      window.currentFormType = 'volumetria';
      abrirCamera();
    });

    document.getElementById('scan-btn-agendamento').addEventListener('click', () => {
      window.currentFormType = 'agendamento';
      abrirCamera();
    });

    document.querySelectorAll('input[name="agendamento-volume-tipo"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const fixoDiv = document.getElementById('agendamento-volumes-fixo');
        const diversosDiv = document.getElementById('agendamento-volumes-diversos');
        const maxVolumesInput = document.getElementById('agendamento-maxVolumes');
        const volumesTextoInput = document.getElementById('agendamento-volumes-texto');

        if (e.target.value === 'fixo') {
          fixoDiv.style.display = 'block';
          diversosDiv.style.display = 'none';
          maxVolumesInput.setAttribute('required', 'required');
          volumesTextoInput.removeAttribute('required');
        } else {
          fixoDiv.style.display = 'none';
          diversosDiv.style.display = 'block';
          maxVolumesInput.removeAttribute('required');
          volumesTextoInput.setAttribute('required', 'required');
        }
      });
    });

    document.getElementById('pallet-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const dados = {
        notaFiscal: document.getElementById('nf').value,
        recebedor: document.getElementById('recebedor').value,
        hub: document.getElementById('hub').value,
        estado: document.getElementById('estado').value,
        cidade: document.getElementById('cidade').value,
        regiao: document.getElementById('regiao').value,
        subregiao: document.getElementById('subregiao').value,
        maxVolumes: document.getElementById('maxVolumes').value
      };
      await window.palletService.create(dados, 'VOLUMETRIA_ALTA');
      document.getElementById('pallet-modal').classList.add('hidden');
      renderizarPallets();
    });

    document.getElementById('pallet-agendamento-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const volumeTipo = document.querySelector('input[name="agendamento-volume-tipo"]:checked').value;
      let maxVolumes = null;
      let volumesDiversos = false;
      let volumesTexto = '';

      if (volumeTipo === 'fixo') {
        maxVolumes = parseInt(document.getElementById('agendamento-maxVolumes').value);
        volumesDiversos = false;
      } else {
        volumesDiversos = true;
        volumesTexto = document.getElementById('agendamento-volumes-texto').value;
      }

      const dados = {
        notaFiscal: document.getElementById('agendamento-nf').value,
        recebedor: document.getElementById('agendamento-recebedor').value,
        hub: document.getElementById('agendamento-hub').value,
        estado: document.getElementById('agendamento-estado').value,
        cidade: document.getElementById('agendamento-cidade').value,
        regiao: document.getElementById('agendamento-regiao').value,
        subregiao: document.getElementById('agendamento-subregiao').value,
        maxVolumes: maxVolumes,
        volumesDiversos: volumesDiversos,
        volumesTexto: volumesTexto
      };

      await window.palletService.create(dados, 'AGENDAMENTO');
      document.getElementById('pallet-agendamento-modal').classList.add('hidden');
      renderizarPallets();
    });

    document.getElementById('pallet-diversos-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const dados = {
        hub: document.getElementById('hub-diversos').value,
        estado: document.getElementById('estado-diversos').value,
        cidade: 'DIVERSOS',
        regiao: document.getElementById('regiao-diversos').value,
        subregiao: document.getElementById('subregiao-diversos').value
      };
      await window.palletService.create(dados, 'DIVERSOS');
      document.getElementById('pallet-diversos-modal').classList.add('hidden');
      renderizarPallets();
    });

    document.getElementById('close-modal').addEventListener('click', () => {
      document.getElementById('pallet-modal').classList.add('hidden');
    });

    document.getElementById('close-agendamento-modal').addEventListener('click', () => {
      document.getElementById('pallet-agendamento-modal').classList.add('hidden');
    });

    document.getElementById('close-diversos-modal').addEventListener('click', () => {
      document.getElementById('pallet-diversos-modal').classList.add('hidden');
    });

    document.getElementById('close-ajustar-modal').addEventListener('click', async () => {
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
      const novosVolumes = parseInt(document.getElementById('manual-volume').value) || 0;
      await window.palletService.updateVolumes(window.palletAtual, novosVolumes);
      document.getElementById('ajustar-modal').classList.add('hidden');
      renderizarPallets();
    });

    document.getElementById('finalize-from-ajustar').addEventListener('click', async () => {
      const pallet = window.palletService.pallets.get(window.palletAtual);
      if (!pallet) return;
      document.getElementById('ajustar-modal').classList.add('hidden');
      document.getElementById('finalizar-modal').classList.remove('hidden');
    });

    document.getElementById('delete-from-ajustar').addEventListener('click', async () => {
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

    document.getElementById('confirmar-imprimir-codigo').addEventListener('click', async () => {
      const codigoLista = document.getElementById('codigo-lista-input').value.trim();
      const pallet = window.palletService.pallets.get(window.palletAImprimir);
      if (pallet) {
        window.palletService.imprimirEtiqueta(pallet, codigoLista || null);
      }
      document.getElementById('codigo-lista-modal').classList.add('hidden');
    });

    document.getElementById('imprimir-sem-codigo').addEventListener('click', () => {
      const pallet = window.palletService.pallets.get(window.palletAImprimir);
      if (pallet) {
        window.palletService.imprimirEtiqueta(pallet, null);
      }
      document.getElementById('codigo-lista-modal').classList.add('hidden');
    });

    document.getElementById('cancelar-codigo-modal').addEventListener('click', () => {
      document.getElementById('codigo-lista-modal').classList.add('hidden');
    });

    document.getElementById('close-camera').addEventListener('click', () => {
      fecharCamera();
    });

    document.getElementById('capture-photo').addEventListener('click', async () => {
      await capturarEProcessarFoto();
    });
  }

  async function abrirCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.getElementById('camera-video');
      video.srcObject = stream;
      document.getElementById('camera-modal').classList.remove('hidden');
    } catch (error) {
      alert('❌ Erro ao abrir câmera: ' + error.message);
    }
  }

  function fecharCamera() {
    const video = document.getElementById('camera-video');
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(track => track.stop());
    }
    document.getElementById('camera-modal').classList.add('hidden');
  }

  async function capturarEProcessarFoto() {
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL('image/jpeg');

    if (window.OCRService) {
      const dadosExtraidos = await window.OCRService.extrairDadosSelo(imageData);

      if (dadosExtraidos) {
        if (window.currentFormType === 'volumetria') {
          if (dadosExtraidos.notaFiscal) document.getElementById('nf').value = dadosExtraidos.notaFiscal;
          if (dadosExtraidos.recebedor) document.getElementById('recebedor').value = dadosExtraidos.recebedor;
          if (dadosExtraidos.hub) document.getElementById('hub').value = dadosExtraidos.hub;
          if (dadosExtraidos.estado) document.getElementById('estado').value = dadosExtraidos.estado;
          if (dadosExtraidos.cidade) document.getElementById('cidade').value = dadosExtraidos.cidade;
        } else if (window.currentFormType === 'agendamento') {
          if (dadosExtraidos.notaFiscal) document.getElementById('agendamento-nf').value = dadosExtraidos.notaFiscal;
          if (dadosExtraidos.recebedor) document.getElementById('agendamento-recebedor').value = dadosExtraidos.recebedor;
          if (dadosExtraidos.hub) document.getElementById('agendamento-hub').value = dadosExtraidos.hub;
          if (dadosExtraidos.estado) document.getElementById('agendamento-estado').value = dadosExtraidos.estado;
          if (dadosExtraidos.cidade) document.getElementById('agendamento-cidade').value = dadosExtraidos.cidade;
        }
        alert('✅ Dados do selo carregados com sucesso!');
      } else {
        alert('⚠️ Não foi possível ler o selo. Preencha manualmente.');
      }
    }

    fecharCamera();
  }

  async function finalizarPalletComConfirmacao(id, bipado) {
    await window.palletService.finalizar(id, bipado);
    document.getElementById('finalizar-modal').classList.add('hidden');
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
    const modalTitle = document.getElementById('ajustar-modal-title');
    const infoDiv = document.getElementById('ajustar-info');
    const volumeControls = document.getElementById('volume-controls-container');
    const saveButton = document.getElementById('save-volume');

    modalTitle.innerText = `Ajustar Pallet - ${p.notaFiscal || 'DIVERSOS'}`;

    let volumesDisplay = '';
    if (p.tipo === 'DIVERSOS') {
      volumesDisplay = 'DIVERSOS';
    } else if (p.volumesDiversos) {
      volumesDisplay = p.volumesTexto || 'DIVERSOS';
    } else {
      volumesDisplay = `${p.volumesAtuais || 0} / ${p.maxVolumes || '?'}`;
    }

    let subrotaInfo = '';
    if (p.subregiao) {
      subrotaInfo = `<br><strong>📍 Sub-região:</strong> ${p.subregiao}`;
    }

    infoDiv.innerHTML = `
      <div>
        <strong>Número Fiscal:</strong> ${p.notaFiscal || 'DIVERSOS'}<br>
        <strong>Recebedor:</strong> ${p.recebedor || 'DIVERSOS'}<br>
        <strong>Unidade:</strong> ${p.hub}<br>
        <strong>UF:</strong> ${p.estado}<br>
        <strong>Cidade:</strong> ${p.cidade}<br>
        <strong>Região:</strong> ${p.regiao || 'N/A'}<br>
        <strong>Sub-região:</strong> ${p.subregiao || 'N/A'}<br>
        <strong>Volumes:</strong> ${volumesDisplay}${subrotaInfo}
      </div>
    `;

    if (!p.volumesDiversos && p.tipo !== 'DIVERSOS') {
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
      volumeControls.innerHTML = `<div style="text-align: center; color: #7f8c8d;">${p.volumesDiversos ? '📦 Volumetria Diversa - sem controle de volumes' : 'DIVERSOS'}</div>`;
      saveButton.style.display = 'none';
    }

    document.getElementById('ajustar-modal').classList.remove('hidden');
  };

  window.finalizarPallet = function (id) {
    window.palletAtual = id;
    document.getElementById('finalizar-modal').classList.remove('hidden');
  };

  window.anexarPallet = async function (id) {
    const palletPrincipal = window.palletService.pallets.get(id);
    if (!palletPrincipal || palletPrincipal.tipo !== 'VOLUMETRIA_ALTA') {
      alert('Só é possível anexar a pallets de volumetria alta.');
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
    document.getElementById('codigo-lista-modal').classList.remove('hidden');
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
    window.palletService.imprimirEtiqueta(pallet, null);
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

      let volumesDisplay = '';
      if (isDiversos) {
        volumesDisplay = 'DIVERSOS';
      } else if (isAgendamento && p.volumesDiversos) {
        volumesDisplay = p.volumesTexto || 'DIVERSOS';
      } else {
        volumesDisplay = `${p.volumesAtuais || 0} / ${p.maxVolumes || '?'}`;
      }

      html += `
        <div class="pallet-card" style="margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span class="nf-tag">${isDiversos ? 'DIVERSOS' : (isAgendamento ? '📅 ' + p.notaFiscal : `NF ${p.notaFiscal}`)}</span>
          </div>

          <div class="info-grid">
            <div class="info-item"><small>Recebedor</small><strong>${p.recebedor || 'DIVERSOS'}</strong></div>
            <div class="info-item"><small>Unidade/UF</small><strong>${p.hub} - ${p.estado}</strong></div>
            <div class="info-item"><small>Cidade</small><strong>${p.cidade || 'N/A'}</strong></div>
            <div class="info-item"><small>Região</small><strong>${p.regiao || 'N/A'}</strong></div>
            <div class="info-item"><small>Sub-região</small><strong>${p.subregiao || 'N/A'}</strong></div>
            <div class="info-item"><small>Volumes</small><strong>${volumesDisplay}</strong></div>
          </div>

          ${!isDiversos && !p.volumesDiversos && p.volumesAtuais >= p.maxVolumes ? '<div class="completo-alert">✅ PALLET COMPLETO</div>' : ''}

          <div class="card-actions">
            <button onclick="abrirModalAjustar('${p.id}')">Ajustar</button>
            <button onclick="finalizarPallet('${p.id}')">Finalizar</button>
            ${!isDiversos && !isAgendamento ? `<button onclick="anexarPallet('${p.id}')">Anexar Pallet</button>` : ''}
            <button onclick="imprimirPallet('${p.id}')">Imprimir</button>
            <button onclick="excluirPallet('${p.id}')">Excluir</button>
          </div>
        </div>
      `;

      if (anexos.length > 0) {
        html += `<div style="margin-top: 15px; padding-top: 10px; border-top: 2px dashed #ccc;">`;
        html += `<div style="font-size: 12px; color: #7f8c8d; margin-bottom: 10px;">📎 Pallets anexados (${1 + anexos.length} pallets no total):</div>`;

        for (const anexo of anexos) {
          const volumesAnexo = `${anexo.volumesAtuais} / ${anexo.maxVolumes}`;
          html += `
            <div class="pallet-card anexado" style="margin-bottom: 10px; background: #f9f9f9; border-left: 4px solid #f39c12;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span class="nf-tag" style="font-size: 16px;">Anexado - NF ${anexo.notaFiscal}</span>
              </div>
              <div class="info-grid" style="grid-template-columns: 1fr 1fr; gap: 8px;">
                <div class="info-item"><small>Recebedor</small><strong>${anexo.recebedor}</strong></div>
                <div class="info-item"><small>Unidade/UF</small><strong>${anexo.hub} - ${anexo.estado}</strong></div>
                <div class="info-item"><small>Volumes</small><strong>${volumesAnexo}</strong></div>
              </div>
              <div class="card-actions" style="margin-top: 10px;">
                <button onclick="abrirModalAjustar('${anexo.id}')" style="padding: 8px; font-size: 12px;">Ajustar</button>
                <button onclick="finalizarPallet('${anexo.id}')" style="padding: 8px; font-size: 12px;">Finalizar</button>
                <button onclick="imprimirPallet('${anexo.id}')" style="padding: 8px; font-size: 12px;">Imprimir</button>
                <button onclick="excluirPallet('${anexo.id}')" style="padding: 8px; font-size: 12px;">Excluir</button>
              </div>
            </div>
          `;
        }
        html += `</div>`;
      }
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
            ${a.uf}/${a.hub}/${a.recebedor}/${a.tipo}
            ${a.subrota ? `<div style="font-size: 12px; color: #e67e22; margin-top: 4px;">📍 ${a.hub} ${a.subrota}</div>` : ''}
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
      let volumesDisplay = '';

      if (isDiversos) {
        volumesDisplay = 'DIVERSOS';
      } else if (isAgendamento && p.volumesDiversos) {
        volumesDisplay = p.volumesTexto || 'DIVERSOS';
      } else {
        volumesDisplay = `${p.volumesAtuais}/${p.maxVolumes}`;
      }

      html += `
        <div class="finalizado-card">
          <div class="finalizado-header">
            <span>${isAgendamento ? '📅 ' : ''}${isDiversos ? 'DIVERSOS' : `NF ${p.notaFiscal}`}</span>
            <span class="finalizado-badge ${p.bipado ? 'bipado' : 'nao-bipado'}">
              ${p.bipado ? '✅ BIPADO' : '⚠️ NÃO BIPADO'}
            </span>
          </div>

          <div class="finalizado-info">
            <div><small>Recebedor</small><br>${p.recebedor || 'DIVERSOS'}</div>
            <div><small>Unidade/UF</small><br>${p.hub} - ${p.estado}</div>
            <div><small>Cidade</small><br>${p.cidade || 'N/A'}</div>
            <div><small>Região</small><br>${p.regiao || 'N/A'}</div>
            <div><small>Sub-região</small><br>${p.subregiao || 'N/A'}</div>
            <div><small>Volumes</small><br>${volumesDisplay}</div>
            <div><small>Finalizado</small><br>${dataFinalizacao}</div>
          </div>

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
