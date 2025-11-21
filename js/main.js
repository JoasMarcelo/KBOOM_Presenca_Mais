'use strict';

// Configuração e Estado
import { CONFIG } from './config/constants.js';
import { state } from './config/state.js';
import { DOM } from './config/dom-selectors.js';

// Utilitários
import { Utils } from './utils/helpers.js';

// Módulos da UI
import { UIManager } from './ui/ui-manager.js';
import { CrachaEditor } from './ui/cracha-editor.js';

// Serviços
import { SchoolService } from './services/school.service.js';
import { FileService } from './services/file.service.js';
import { DBService } from './services/db.service.js';
import { PresenceService } from './services/presence.service.js';
import { CrachaService } from './services/cracha.service.js';
import { ImportExportService } from './services/import-export.service.js';
import { connectSerial, onSerialData } from './services/serialService.js';

PresenceService.init();

/**
 * Lida com cliques na lista de escolas (selecionar, editar, excluir).
 */
async function handleSchoolListClick(e) {
    const schoolCard = e.target.closest('.school-card-content');
    const editBtn = e.target.closest('.btn-edit-school');
    const deleteBtn = e.target.closest('.btn-delete-school');
    
    const schoolId = editBtn?.dataset.schoolId || deleteBtn?.dataset.schoolId || schoolCard?.dataset.schoolId;
    if (!schoolId) return;

    if (deleteBtn) {
        if (confirm('Tem certeza que deseja excluir esta escola?')) {
            await SchoolService.delete(schoolId);
            UIManager.renderSchoolList();
            Utils.showToast("Escola excluída.", 'info');
        }
        return;
    }

    const schools = await SchoolService.getAll();
    const school = schools.find(s => s.id === schoolId);
    if (!school) return;

    if (editBtn) {
        startSchoolEdit(school);
    } else if (schoolCard) {
        await SchoolService.load(school);
    }
}

async function handleSelectDirectory(type) {
    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        state.newSchoolFiles[type] = handle;
        const statusElement = (type === 'spreadsheetFolder') ? DOM.folderStatusModal : DOM.backupFolderStatusModal;
        statusElement.textContent = `Pasta selecionada: "${handle.name}".`;
    } catch (e) {
        if (e.name !== 'AbortError') console.error(e);
    }
}
/**
 * Função que injeta o valor recebido no elemento focado atualmente.
 * Se o elemento for um input ou textarea, insere o texto na posição do cursor.
 * 
 * @param {string} value - O texto recebido da porta serial.
 */
function injectIntoFocusedInput(value) {
    const activeElement = document.activeElement;

    // Verifica se existe um elemento focado e se é um campo de texto
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        
        // Tratamento especial para inputs que suportam seleção de cursor (text, search, url, tel, password)
        // Inputs como 'number' ou 'email' às vezes lançam erro ao acessar selectionStart em alguns browsers.
        try {
            const startPos = activeElement.selectionStart;
            const endPos = activeElement.selectionEnd;

            // Texto atual do input
            const text = activeElement.value;

            // Insere o valor serial onde o cursor está (ou substitui a seleção)
            activeElement.value = 
                text.substring(0, startPos) + 
                value + 
                text.substring(endPos, text.length);

            // Move o cursor para o final do texto inserido
            const newCursorPos = startPos + value.length;
            activeElement.setSelectionRange(newCursorPos, newCursorPos);

            // Dispara evento de 'input' para frameworks reativos (React, Vue, etc) perceberem a mudança
            activeElement.dispatchEvent(new Event('input', { bubbles: true }));

        } catch (e) {
            // Fallback para inputs que não suportam cursor (ex: type="number" em alguns browsers)
            // Apenas concatena ao final
            activeElement.value += value;
            activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
    } else {
        console.warn("Nenhum input focado para receber os dados:", value);
    }
}
function handleResetBackupFolder() {
    state.newSchoolFiles.backupFolder = null;
    DOM.backupFolderStatusModal.textContent = 'Usando padrão (subpasta de "planilhas").';
}


function startSchoolEdit(school) {
    DOM.newSchoolNameInput.value = school.name;
    DOM.logoFileNameSpan.textContent = school.logoHandle?.name || 'Nenhum arquivo';
    DOM.templateFileNameSpan.textContent = school.templateHandle?.name || 'Nenhum arquivo';
    DOM.dbFileNameSpan.textContent = school.dbHandle?.name || 'Nenhum arquivo';
    
    state.newSchoolFiles = { 
        logo: school.logoHandle, 
        db: school.dbHandle, 
        template: school.templateHandle,
        spreadsheetFolder: school.spreadsheetFolderHandle || null,
        backupFolder: school.backupFolderHandle || null
    };
    
    DOM.folderStatusModal.textContent = school.spreadsheetFolderHandle ? 
        `Pasta selecionada: "${school.spreadsheetFolderHandle.name}".` : 'Nenhuma pasta selecionada.';
        
    DOM.backupFolderStatusModal.textContent = school.backupFolderHandle ? 
        `Pasta selecionada: "${school.backupFolderHandle.name}".` : 'Nenhuma pasta selecionada.';
    
    DOM.addSchoolForm.dataset.editingSchoolId = school.id;
    DOM.modalTitle.textContent = 'Editar Escola';
    DOM.addSchoolModal.classList.remove(CONFIG.CSS_CLASSES.HIDDEN);
    Utils.hideStatus(DOM.modalStatus);
}

async function handleSchoolFormSubmit(e) {
    e.preventDefault();
    const schoolName = DOM.newSchoolNameInput.value.trim();
    const { template, db, spreadsheetFolder, backupFolder } = state.newSchoolFiles;
    
    if (!schoolName || !template || !db || (!spreadsheetFolder && !state.directoryHandle)) {
        const requiredFields = [schoolName, template, db];
        if (!spreadsheetFolder) {
            requiredFields.push(state.directoryHandle); 
        }

        if (requiredFields.some(field => !field)) {
            Utils.updateStatus(DOM.modalStatus, "Nome, template, base de dados e Pasta de Planilhas são obrigatórios.", 'error');
            return;
        }
    }

    const editingSchoolId = DOM.addSchoolForm.dataset.editingSchoolId;
    let schoolData = {
        name: schoolName,
        logoHandle: state.newSchoolFiles.logo,
        dbHandle: db,
        templateHandle: template,
        spreadsheetFolderHandle: spreadsheetFolder || null, 
        backupFolderHandle: backupFolder || null, 
    };

    if (editingSchoolId) {
        const schools = await SchoolService.getAll();
        const existingSchool = schools.find(s => s.id === editingSchoolId);
        schoolData = { ...existingSchool, ...schoolData }; 
        
        if (!spreadsheetFolder) schoolData.spreadsheetFolderHandle = existingSchool.spreadsheetFolderHandle;
        if (!backupFolder) schoolData.backupFolderHandle = existingSchool.backupFolderHandle;
        
    } else {
        schoolData.id = crypto.randomUUID();
    }
    
    await SchoolService.save(schoolData);
    UIManager.resetAndCloseModal();
    await UIManager.renderSchoolList();

    if (state.activeSchool?.id === editingSchoolId) {
        await SchoolService.load(schoolData);
    }
    Utils.showToast(`Escola ${editingSchoolId ? 'atualizada' : 'criada'} com sucesso!`, 'success');
}

async function handleCreateDbFile() {
    try {
        const handle = await window.showSaveFilePicker({ 
            suggestedName: 'nova_base_alunos.db', 
            types: [{ description: 'Banco de Dados SQLite', accept: { 'application/x-sqlite3': ['.db', '.sqlite'] } }] 
        });
        state.newSchoolFiles.db = handle;
        DOM.dbFileNameSpan.textContent = `(Nova) ${handle.name}`;
    } catch(e) { /* Usuário cancelou */ }
}

function handleSelectFile(type) {
    return async () => {
        const pickerOptions = {
            logo: { types: [{ description: 'Imagens', accept: { 'image/*': ['.png', '.jpg'] } }] },
            db: { types: [{ description: 'Base de Dados', accept: { 'application/x-sqlite3': ['.db', '.sqlite'] } }] },
            template: { types: [{ description: 'Templates de Crachá', accept: { 'image/*': ['.png', '.jpg'] } }] }
        };

        try {
            const [handle] = await window.showOpenFilePicker(pickerOptions[type]);
            state.newSchoolFiles[type] = handle;
            
            const spanMap = {
                logo: DOM.logoFileNameSpan,
                db: DOM.dbFileNameSpan,
                template: DOM.templateFileNameSpan
            };
            
            const span = spanMap[type];
            if (span) span.textContent = handle.name;

        } catch (e) { /* usuário cancelou */ }
    };
}

/**
 * Busca um aluno pelo código de barras OU UID RFID e mostra a área de confirmação.
 * @param {string} barcode O código de barras ou RFID lido.
 */
function findStudentForConfirmation(barcode) {
    const cleanBarcode = String(barcode || '').trim();
    
    // Se o campo ficou vazio (usuário apagou tudo), escondemos o painel e retornamos
    if (!cleanBarcode) {
        state.alunoParaConfirmar = null;
        DOM.presenceConfirmationArea.classList.add(CONFIG.CSS_CLASSES.HIDDEN);
        Utils.updateStatus(DOM.statusPresenca, 'Aguardando...', 'info');
        return;
    }

    const aluno = state.alunos.find(a => 
        a.Codigo_Barras === cleanBarcode || 
        a.UID_RFID === cleanBarcode
    );

    if (aluno) {
        // --- ALUNO ENCONTRADO ---
        state.alunoParaConfirmar = aluno;
        const fotoSrc = aluno.foto ? `data:image/jpeg;base64,${btoa(String.fromCharCode.apply(null, aluno.foto))}` : 'assets/img/placeholder.png';
        
        DOM.presenceConfirmationArea.innerHTML = `
            <img src="${fotoSrc}" alt="Foto">
            <div class="confirmation-details">
                <h3>${aluno.Nome}</h3>
                <p>${aluno.Turma}</p>
                <div class="button-group">
                    <button id="confirm-presence-btn" class="btn btn-success">Confirmar</button>
                    <button id="cancel-presence-btn" class="btn btn-secondary">Cancelar</button>
                </div>
            </div>`;
        
        DOM.presenceConfirmationArea.classList.remove(CONFIG.CSS_CLASSES.HIDDEN);

        // Botão Confirmar: Registra e limpa
        DOM.presenceConfirmationArea.querySelector('#confirm-presence-btn').addEventListener('click', async (e) => {
            await PresenceService.register(e); 
            DOM.barcodeInput.value = '';       
            DOM.barcodeInput.focus();          
        }, { once: true });

        // Botão Cancelar: Reseta UI e limpa
        DOM.presenceConfirmationArea.querySelector('#cancel-presence-btn').addEventListener('click', () => {
            UIManager.resetConfirmationArea(); 
            // O resetConfirmationArea do ui-manager já limpa o input, conforme configuramos
        }, { once: true });

        Utils.updateStatus(DOM.statusPresenca, `Aluno encontrado. Confirme a presença.`, 'info');

    } else {
        // --- CORREÇÃO AQUI: ALUNO NÃO ENCONTRADO (ENQUANTO DIGITA) ---
        
        // Apenas limpamos a variável de estado e escondemos o painel.
        state.alunoParaConfirmar = null;
        DOM.presenceConfirmationArea.classList.add(CONFIG.CSS_CLASSES.HIDDEN);

        // IMPORTANTE: NÃO chamamos UIManager.resetConfirmationArea() aqui,
        // pois isso apagaria o que você está digitando.
        
        Utils.updateStatus(DOM.statusPresenca, `Procurando... "${cleanBarcode}"`, 'warning');
    }
}

/**
 * Lida com cliques na tabela de alunos (editar, salvar, cancelar, excluir).
 * @param {Event} e O evento de clique.
 */
async function handleAlunosTableClick(e) {
    const row = e.target.closest('tr');
    if (!row?.dataset.alunoId) return;

    const clickedButton = e.target.closest('button');
    if (!clickedButton) return;

    const alunoId = row.dataset.alunoId;

    // --- EXCLUIR ---
    if (clickedButton.classList.contains('delete-btn')) {
        if (confirm('Excluir este aluno?')) {
            try {
                await DBService.createIncrementalBackup();
                DBService.deleteAluno(state.db, alunoId);
                await DBService.saveWorkingCopy();
                state.alunos = DBService.getAlunos(state.db);
                UIManager.renderAll();
                Utils.showToast("Aluno excluído com sucesso!", 'info');
            } catch (error) {
                console.error("Erro ao excluir:", error);
            }
        }

    // --- EDITAR ---
    } else if (clickedButton.classList.contains('edit-btn')) {
        if(row.classList.contains(CONFIG.CSS_CLASSES.EDITING)) return;
        row.classList.add(CONFIG.CSS_CLASSES.EDITING);
        
        // 1. Seleciona as células CORRETAS usando data-field
        const nomeCell = row.querySelector('td[data-field="nome"]');
        const turmaCell = row.querySelector('td[data-field="turma"]');
        const codigoCell = row.querySelector('td[data-field="codigo"]');
        const uidCell = row.querySelector('td[data-field="uid"]');

        // 2. Pega os valores atuais (se for undefined ou null, vira string vazia)
        const valNome = nomeCell.textContent || '';
        const valTurma = turmaCell.textContent || '';
        const valCodigo = codigoCell.textContent || '';
        // Se o UID for visualmente "-", limpamos para o input
        const valUid = (uidCell.textContent === '-' || uidCell.textContent === 'undefined') ? '' : uidCell.textContent;

        // 3. Transforma em inputs
        nomeCell.innerHTML = `<input type="text" value="${valNome}" placeholder="Nome">`;
        turmaCell.innerHTML = `<input type="text" value="${valTurma}" placeholder="Turma">`;
        // Placeholder 'Auto' para indicar que se deixar vazio não apaga, ou gera um novo (dependendo da sua regra)
        // Aqui vamos apenas exibir o valor atual
        codigoCell.innerHTML = `<input type="text" value="${valCodigo}" placeholder="EAN13">`; 
        uidCell.innerHTML = `<input type="text" value="${valUid}" placeholder="RFID">`;

        // Troca botões
        row.querySelector('.actions-cell div').innerHTML = `<button class="btn btn-small btn-success save-btn"><i class="fi fi-sr-disk"></i></button><button class="btn btn-small cancel-btn"><i class="fi fi-sr-cross-small"></i></button>`;
        nomeCell.querySelector('input').focus();

    // --- SALVAR ---
    } else if (clickedButton.classList.contains('save-btn')) {
        // 1. Captura os valores dos inputs com segurança
        const novoNome = row.querySelector('td[data-field="nome"] input').value;
        const novaTurma = row.querySelector('td[data-field="turma"] input').value;
        const novoCodigo = row.querySelector('td[data-field="codigo"] input').value;
        const novoUid = row.querySelector('td[data-field="uid"] input').value;

        if (!novoNome.trim() || !novaTurma.trim()) {
            Utils.showToast("Nome e Turma são obrigatórios.", "error");
            return;
        }

        try {
            await DBService.createIncrementalBackup();
            
            // 2. CHAMADA CORRIGIDA:
            // Ordem: db, id, Nome, Turma, CODIGO, RFID
            DBService.updateAluno(
                state.db, 
                alunoId, 
                novoNome, 
                novaTurma, 
                novoCodigo, // Passa o valor do campo Código
                novoUid     // Passa o valor do campo UID
            );

            await DBService.saveWorkingCopy();
            state.alunos = DBService.getAlunos(state.db);
            UIManager.renderAll();
            Utils.showToast("Aluno atualizado!", 'success');
        } catch (error) {
            console.error("Erro ao salvar:", error);
            Utils.showToast(`Erro: ${error.message}`, 'error');
        }

    // --- CANCELAR ---
    } else if (clickedButton.classList.contains('cancel-btn')) {
        UIManager.renderAlunosTable();
    }
}

/**
 * Salva os alunos adicionados manualmente.
 */
async function handleSaveManualStudents() {
    const rows = DOM.tabelaCadastroManualBody.querySelectorAll('tr');
    if (rows.length === 0) return;

    DOM.saveManualAlunosBtn.disabled = true;
    let adicionados = 0;
    try {
        await DBService.createIncrementalBackup();
        state.db.exec("BEGIN TRANSACTION;");
        for (const row of rows) {
            const nome = row.querySelector('.manual-nome').value.trim();
            const turma = row.querySelector('.manual-turma').value.trim();
            const codigo = row.querySelector('.manual-codigo').value.trim();
            const uid = row.querySelector('.manual-uid').value.trim(); // CORREÇÃO: Captura UID

            // CORREÇÃO: Passa o UID no objeto para o DBService
            if (nome && turma) {
                // Objeto com todas as propriedades
                const alunoData = { 
                    nome, 
                    turma, 
                    codigo_barra: codigo || null, // Se vazio, o DBService gera um automático (se configurado) ou deixa null
                    UID_RFID: uid || null 
                };
                
                if(DBService.addAluno(state.db, alunoData)) {
                    adicionados++;
                }
            }
        }
        state.db.exec("COMMIT;");
        await DBService.saveWorkingCopy();
        Utils.showToast(`${adicionados} aluno(s) salvo(s)!`, 'success');
        DOM.tabelaCadastroManualBody.innerHTML = '';
        state.alunos = DBService.getAlunos(state.db);
        UIManager.renderAll();
    } catch (error) {
        state.db.exec("ROLLBACK;");
        Utils.showToast('Erro ao salvar alunos.', 'error');
        console.error(error);
    } finally {
        DOM.saveManualAlunosBtn.disabled = false;
    }
}

// Inicialização
async function init() {
    if (!('showDirectoryPicker' in window && 'indexedDB' in window)) {
        document.body.innerHTML = '<h1>Navegador Incompatível</h1>';
        return;
    }
    onSerialData(injectIntoFocusedInput);
    const connectBtn = document.getElementById('btnConnect');
    if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
            await connectSerial();
        });
    } else {
        console.error("Botão com id 'btnConnect' não encontrado no HTML. A conexão serial requer interação do usuário.");
    }
    await SchoolService.openIDB();
    await FileService.loadAndVerifySavedHandle();
    
    // Listeners
    DOM.addSchoolBtn.addEventListener('click', () => {
        UIManager.resetAndCloseModal(); 
        DOM.addSchoolModal.classList.remove(CONFIG.CSS_CLASSES.HIDDEN);
    });
    DOM.changeSchoolBtn.addEventListener('click', () => {
        UIManager.showSchoolSelection();
        UIManager.renderSchoolList();
    });
    DOM.schoolList.addEventListener('click', handleSchoolListClick);
    
    DOM.addSchoolForm.addEventListener('submit', handleSchoolFormSubmit);
    DOM.cancelModalBtn.addEventListener('click', UIManager.resetAndCloseModal);
    DOM.selectLogoBtn.addEventListener('click', handleSelectFile('logo'));
    DOM.selectTemplateBtn.addEventListener('click', UIManager.openTemplateSelector);
    DOM.selectDbBtn.addEventListener('click', handleSelectFile('db'));
    DOM.createDbModalBtn.addEventListener('click', handleCreateDbFile);
    
    DOM.selectFolderBtnModal.addEventListener('click', () => handleSelectDirectory('spreadsheetFolder'));
    DOM.selectBackupFolderBtnModal.addEventListener('click', () => handleSelectDirectory('backupFolder'));
    DOM.resetBackupFolderBtnModal.addEventListener('click', handleResetBackupFolder);

    DOM.templateGallery.addEventListener('click', (e) => {
        const item = e.target.closest('.template-item');
        if (!item) return;
        if (item.id === 'upload-new-template-btn') {
            handleSelectFile('template')();
        } else {
            document.querySelectorAll('.template-item.selected').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            state.selectedTemplatePath = item.dataset.path;
        }
    });
    DOM.confirmTemplateBtn.addEventListener('click', () => {
        if(state.selectedTemplatePath) {
            const fileName = state.selectedTemplatePath.split('/').pop();
            state.newSchoolFiles.template = { name: fileName, path: state.selectedTemplatePath, isPredefined: true }; 
            DOM.templateFileNameSpan.textContent = fileName;
            
            // === NOVO: Reseta a posição para automática ao trocar de template ===
            // Isso garante que o cálculo dinâmico rode para as novas dimensões
            if (typeof crachaConfig !== 'undefined') {
                crachaConfig.BARCODE_POSITION = 'AUTO';
            }
        }
        UIManager.closeTemplateSelector();
    });
    DOM.cancelTemplateModalBtn.addEventListener('click', UIManager.closeTemplateSelector);

    DOM.allTabs.forEach(tab => tab.addEventListener('click', e => {
        DOM.allTabs.forEach(t => t.classList.remove('active'));
        DOM.tabContents.forEach(c => c.classList.remove('active'));
        const targetTab = e.currentTarget;
        targetTab.classList.add('active');
        document.getElementById(targetTab.dataset.tab).classList.add('active');
    }));

    DOM.barcodeInput.addEventListener('input', e => { if (e.target.value.length >= 1) findStudentForConfirmation(e.target.value); });
    DOM.tabelaPresencaBody.addEventListener('click', e => {
        const btn = e.target.closest('.remover-presenca-btn');
        if (btn) PresenceService.remove(btn.dataset.alunoId);
    });

    DOM.searchAlunoInput.addEventListener('input', UIManager.renderAlunosTable);
    DOM.tabelaAlunosBody.addEventListener('click', handleAlunosTableClick);
    DOM.tabelaAlunosBody.addEventListener('change', async (e) => {
        const input = e.target;
        if (!input.classList.contains('foto-upload-input')) return;
        if (input.files.length > 0) {
            await DBService.createIncrementalBackup();
            const bytes = await Utils.compressAndConvertToJPEG(input.files[0]);
            DBService.updateFotoAluno(state.db, input.dataset.alunoId, bytes);
            await DBService.saveWorkingCopy();
            state.alunos = DBService.getAlunos(state.db);
            UIManager.renderAlunosTable();
        }
    });

    DOM.listaCrachasAlunos.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (!li) return;
        state.selectedAlunoCracha = state.alunos.find(a => a.id === li.dataset.alunoId);
        if (state.selectedAlunoCracha) {
            CrachaService.generate(state.selectedAlunoCracha);
            DOM.downloadCrachaBtn.disabled = false;
            UIManager.renderCrachasList();
        }
    });
    DOM.downloadCrachaBtn.addEventListener('click', () => state.selectedAlunoCracha && UIManager.openExportModal('single'));
    DOM.downloadTodosCrachasBtn.addEventListener('click', () => state.alunos.length > 0 && UIManager.openExportModal('all'));
    DOM.personalizarLayoutBtn.addEventListener('click', () => {
        CrachaEditor.open();
    });

    DOM.exportDirectBtn.addEventListener('click', () => { (state.exportMode === 'single') ? CrachaService.downloadSingle() : CrachaService.downloadAllAsZip(); });
    DOM.exportPdfBtn.addEventListener('click', CrachaService.exportToPdf);
    DOM.cancelExportBtn.addEventListener('click', UIManager.closeExportModal);
    
    DOM.addAlunoRowBtn.addEventListener('click', UIManager.addManualRegistryRow);
    DOM.saveManualAlunosBtn.addEventListener('click', handleSaveManualStudents);
    DOM.tabelaCadastroManualBody.addEventListener('click', e => { if(e.target.closest('.delete-row-btn')) e.target.closest('tr').remove(); });
    
    ['dragover', 'drop'].forEach(event => DOM.importDropZone.addEventListener(event, e => e.preventDefault()));
    DOM.importDropZone.addEventListener('dragover', () => DOM.importDropZone.classList.add('dragover'));
    DOM.importDropZone.addEventListener('dragleave', () => DOM.importDropZone.classList.remove('dragover'));
    DOM.importDropZone.addEventListener('drop', e => {
        DOM.importDropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) ImportExportService.handleImportFile(e.dataTransfer.files[0]);
    });
    DOM.importBrowseBtn.addEventListener('click', () => DOM.importFileInput.click());
    DOM.importFileInput.addEventListener('change', e => ImportExportService.handleImportFile(e.target.files[0]));
    DOM.exportDbBtn.addEventListener('click', async () => { if (await DBService.saveWorkingCopy()) ImportExportService.exportDatabase(state.db, state.activeSchool.name); });
    
    UIManager.showSchoolSelection();
    await UIManager.renderSchoolList();
    UIManager.clearCanvas();
}

document.addEventListener('DOMContentLoaded', init);