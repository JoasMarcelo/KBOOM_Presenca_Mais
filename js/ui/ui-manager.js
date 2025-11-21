'use strict';

import { DOM, crachaCtx } from '../config/dom-selectors.js';
import { CONFIG } from '../config/constants.js';
import { state } from '../config/state.js';
import { SchoolService } from '../services/school.service.js';
import { PresenceService } from '../services/presence.service.js';
import { Utils } from '../utils/helpers.js';

export const UIManager = {
    showMainPanel: () => {
        DOM.schoolSelectionScreen.classList.add(CONFIG.CSS_CLASSES.HIDDEN);
        DOM.mainPanel.classList.remove(CONFIG.CSS_CLASSES.HIDDEN);
    },

    showSchoolSelection: () => {
        DOM.mainPanel.classList.add(CONFIG.CSS_CLASSES.HIDDEN);
        DOM.schoolSelectionScreen.classList.remove(CONFIG.CSS_CLASSES.HIDDEN);
        state.activeSchool = null;
        state.db = null;
        state.alunos = [];
        state.presencas = [];
    },

    renderAll: () => {
        PresenceService.load();
        UIManager.renderAlunosTable();
        UIManager.renderPresencaTable();
        UIManager.renderCrachasList();
    },

    updateHeader: (schoolName, dbName) => {
        DOM.schoolNameHeader.textContent = schoolName;
        DOM.dbStatusHeader.textContent = `Base: ${dbName} (Em uso)`;
    },

    renderSchoolList: async () => {
        const schools = await SchoolService.getAll();
        DOM.schoolList.innerHTML = '';
        if (schools.length === 0) {
            DOM.schoolList.innerHTML = `<div class="no-schools"><p>Nenhuma escola cadastrada.</p></div>`;
            return;
        }
        for (const school of schools) {
            const card = document.createElement('div');
            card.className = 'school-card';
            let logoUrl = 'assets/img/logos/default_logo_school.png';
            if (school.logoHandle) {
                try { logoUrl = URL.createObjectURL(await school.logoHandle.getFile()); }
                catch (err) { console.warn(`Logo não carregado para ${school.name}:`, err); }
            }
            card.innerHTML = `
                <div class="school-card-content" data-school-id="${school.id}"><img src="${logoUrl}" alt="Logo"><h3>${school.name}</h3></div>
                <div class="school-actions">
                    <button class="btn btn-small btn-edit-school" data-school-id="${school.id}">Editar</button>
                    <button class="btn btn-small btn-error btn-delete-school" data-school-id="${school.id}">Excluir</button>
                </div>`;
            DOM.schoolList.appendChild(card);
            card.querySelector('img').onload = () => { if(logoUrl.startsWith('blob:')) URL.revokeObjectURL(logoUrl); };
        }
    },
     resetAndCloseModal: () => {
        DOM.addSchoolModal.classList.add(CONFIG.CSS_CLASSES.HIDDEN);
        DOM.addSchoolForm.reset();
        delete DOM.addSchoolForm.dataset.editingSchoolId;
        DOM.logoFileNameSpan.textContent = 'Nenhum arquivo';
        DOM.templateFileNameSpan.textContent = 'Nenhum arquivo';
        DOM.dbFileNameSpan.textContent = 'Nenhum arquivo';

        if(DOM.folderStatusModal) DOM.folderStatusModal.textContent = 'Nenhuma pasta selecionada.';
        if(DOM.backupFolderStatusModal) DOM.backupFolderStatusModal.textContent = 'Nenhuma pasta selecionada.';
        
        state.newSchoolFiles = { 
            logo: null, 
            db: null, 
            template: null, 
            spreadsheetFolder: null, 
            backupFolder: null
        }; 

        DOM.modalTitle.textContent = 'Cadastrar Nova Escola';
        Utils.hideStatus(DOM.modalStatus);
    },

    renderAlunosTable: () => {
        DOM.tabelaAlunosBody.innerHTML = '';
        const searchTerm = Utils.normalizeString(DOM.searchAlunoInput.value);
        const filtered = state.alunos.filter(aluno => 
            Utils.normalizeString(aluno.Nome).includes(searchTerm) || 
            Utils.normalizeString(aluno.Turma).includes(searchTerm) ||
            (aluno.Codigo_Barras || '').includes(searchTerm) ||
            (aluno.UID_RFID || '').includes(searchTerm)
        ).sort((a,b) => a.Nome.localeCompare(b.Nome));

        if (filtered.length === 0) {
            DOM.tabelaAlunosBody.innerHTML = `<tr><td colspan="6" class="empty-table-message">${searchTerm ? 'Nenhum aluno encontrado.' : 'Nenhum aluno cadastrado.'}</td></tr>`;
            return;
        }
        filtered.forEach(aluno => {
            const row = DOM.tabelaAlunosBody.insertRow();
            row.dataset.alunoId = aluno.id;
            
            const fotoPreview = aluno.foto ? `<img src="data:image/jpeg;base64,${btoa(String.fromCharCode.apply(null, aluno.foto))}" class="aluno-foto-preview" alt="Foto">` : `<span>Sem Foto</span>`;
            
            // ATUALIZADO: Inclui colunas para Código de Barras E para UID RFID
            // Adicionei atributos data-field para facilitar a edição no main.js
            row.innerHTML = `
                <td data-field="nome">${aluno.Nome}</td>
                <td data-field="turma">${aluno.Turma}</td>
                <td data-field="codigo">${aluno.Codigo_Barras || ''}</td>
                <td data-field="uid">${aluno.UID_RFID || '-'}</td>
                <td class="foto-cell">
                    <div>${fotoPreview}<label class="btn-upload-overlay"><i class="fi fi-sr-camera-retro"></i><input type="file" class="foto-upload-input" data-aluno-id="${aluno.id}" accept="image/*" hidden></label></div>
                </td>
                <td class="actions-cell">
                    <div>
                        <button class="btn btn-small edit-btn"><i class="fi fi-sr-user-pen"></i></button>
                        <button class="btn btn-small btn-error delete-btn"><i class="fi fi-sr-trash"></i></button>
                    </div>
                </td>`;
        });
    },
    renderPresencaTable: () => {
        DOM.tabelaPresencaBody.innerHTML = '';
        if (state.presencas.length === 0) {
            DOM.tabelaPresencaBody.innerHTML = '<tr><td colspan="4" class="empty-table-message">Nenhuma presença hoje.</td></tr>';
            return;
        }
        state.presencas.sort((a,b) => b.hora.localeCompare(a.hora)).forEach(p => {
            const aluno = state.alunos.find(a => a.id === p.alunoId);
            if (aluno) {
                DOM.tabelaPresencaBody.insertRow().innerHTML = `
                    <td>${aluno.Nome}</td><td>${aluno.Turma}</td><td>${p.hora}</td>
                    <td class="actions-cell"><button class="btn btn-small btn-error remover-presenca-btn" data-aluno-id="${aluno.id}"><i class="fi fi-sr-trash"></i></button></td>`;
            }
        });
    },

    renderCrachasList: () => {
        DOM.listaCrachasAlunos.innerHTML = '';
        state.alunos.sort((a,b) => a.Nome.localeCompare(b.Nome)).forEach(aluno => {
            const li = document.createElement('li');
            li.textContent = `${aluno.Nome} - ${aluno.Turma}`;
            li.dataset.alunoId = aluno.id;
            if(state.selectedAlunoCracha?.id === aluno.id) li.classList.add(CONFIG.CSS_CLASSES.SELECTED);
            DOM.listaCrachasAlunos.appendChild(li);
        });
    },
    
    clearCanvas: () => {
        crachaCtx.clearRect(0, 0, DOM.crachaCanvas.width, DOM.crachaCanvas.height);
        crachaCtx.fillStyle = '#f0f0f0';
        crachaCtx.fillRect(0, 0, DOM.crachaCanvas.width, DOM.crachaCanvas.height);
        crachaCtx.fillStyle = '#666';
        crachaCtx.textAlign = 'center';
        crachaCtx.font = '16px "Segoe UI"';
        crachaCtx.fillText("Selecione um aluno", DOM.crachaCanvas.width / 2, DOM.crachaCanvas.height / 2);
    },

    resetConfirmationArea: () => {
        state.alunoParaConfirmar = null;
        DOM.presenceConfirmationArea.classList.add(CONFIG.CSS_CLASSES.HIDDEN);
        DOM.barcodeInput.value = '';
        DOM.barcodeInput.focus();
        Utils.updateStatus(DOM.statusPresenca, 'Aguardando leitura...', 'info');
    },

    openExportModal: (mode) => {
        state.exportMode = mode;
        DOM.exportDirectBtn.textContent = (mode === 'single') ? 'Baixar Imagem (.png)' : 'Baixar Todos (.zip)';
        DOM.exportOptionsModal.classList.remove(CONFIG.CSS_CLASSES.HIDDEN);
    },
    closeExportModal: () => DOM.exportOptionsModal.classList.add(CONFIG.CSS_CLASSES.HIDDEN),

    openTemplateSelector: () => {
        DOM.templateGallery.innerHTML = '';
        state.selectedTemplatePath = null;
        CONFIG.PREDEFINED_TEMPLATES.forEach(path => {
            DOM.templateGallery.innerHTML += `<div class="template-item" data-path="${path}"><img src="${path}" alt="Template"></div>`;
        });
        DOM.templateGallery.innerHTML += `<div class="template-item template-upload-card" id="upload-new-template-btn"><span>+</span>Adicionar Novo</div>`;
        DOM.templateSelectorModal.classList.remove(CONFIG.CSS_CLASSES.HIDDEN);
    },
    closeTemplateSelector: () => DOM.templateSelectorModal.classList.add(CONFIG.CSS_CLASSES.HIDDEN),
    
    // Adiciona a linha com o campo manual-uid
    addManualRegistryRow: () => {
        const row = DOM.tabelaCadastroManualBody.insertRow();
        row.innerHTML = `
            <td><input type="text" class="manual-nome edit-input" required placeholder="Nome completo"></td>
            <td><input type="text" class="manual-turma edit-input" required placeholder="Turma"></td>
            <td><input type="text" class="manual-codigo edit-input" placeholder="Cód. Barras (Opcional)"></td>
            <td><input type="text" class="manual-uid edit-input" placeholder="UID RFID"></td>
            <td><div class="foto-cell"><label class="btn btn-small"><i class="fi fi-sr-camera-retro"></i><input type="file" class="manual-foto" accept="image/*" hidden></label><span class="file-name-display">Sem Foto</span></div></td>
            <td><button type="button" class="btn btn-small btn-error delete-row-btn"><i class="fi fi-sr-trash"></i></button></td>`;
        row.querySelector('.manual-foto').addEventListener('change', (e) => { 
            const input = e.currentTarget;
            input.closest('td').querySelector('.file-name-display').textContent = input.files.length > 0 ? input.files[0].name : 'Sem Foto';
        });
    },
    
    updateStatus: (message, type) => {
        const element = DOM.zipStatus;
        if (!element) return;

        element.innerHTML = message;
        element.className = 'status-box';
        element.style.display = 'block';
        if (type) element.classList.add(type);
    },

    hideStatus: () => {
        const element = DOM.zipStatus;
        if (element) {
            element.style.display = 'none';
        }
    }
};