'use strict';

// [REFATORAÇÃO DOM-1.1: Adiciona seletores para os novos campos de pasta no modal]
export const DOM = {
    schoolSelectionScreen: document.getElementById('school-selection-screen'),
    mainPanel: document.getElementById('main-panel'),
    schoolList: document.getElementById('school-list'),
    addSchoolBtn: document.getElementById('add-school-btn'),
    // Modal de Adicionar/Editar Escola
    addSchoolModal: document.getElementById('add-school-modal'),
    addSchoolForm: document.getElementById('add-school-form'),
    modalTitle: document.getElementById('modal-title'),
    newSchoolNameInput: document.getElementById('new-school-name'),
    selectLogoBtn: document.getElementById('select-logo-btn'),
    logoFileNameSpan: document.getElementById('logo-file-name'),
    selectTemplateBtn: document.getElementById('select-template-btn'),
    templateFileNameSpan: document.getElementById('template-file-name'),
    // NOVOS/MOVIMENTOS - Configuração de Pasta no Modal
    selectFolderBtnModal: document.getElementById('select-folder-btn-modal'), // Novo seletor do modal
    folderStatusModal: document.getElementById('folder-status-modal'),     // Novo seletor do modal
    selectBackupFolderBtnModal: document.getElementById('select-backup-folder-btn-modal'),
    resetBackupFolderBtnModal: document.getElementById('reset-backup-folder-btn-modal'),
    backupFolderStatusModal: document.getElementById('backup-folder-status-modal'),
    // FIM NOVOS/MOVIMENTOS
    selectDbBtn: document.getElementById('select-db-btn'),
    dbFileNameSpan: document.getElementById('db-file-name'),
    createDbModalBtn: document.getElementById('create-db-modal-btn'),
    cancelModalBtn: document.getElementById('cancel-modal-btn'),
    modalStatus: document.getElementById('modal-status'),
    // Cabeçalho Principal
    schoolNameHeader: document.getElementById('school-name-header'),
    dbStatusHeader: document.getElementById('db-status-header'),
    changeSchoolBtn: document.getElementById('change-school-btn'),
    // Abas
    allTabs: document.querySelectorAll('.tab-link'),
    tabContents: document.querySelectorAll('.tab-content'),
    // Aba de Presença
    barcodeInput: document.getElementById('barcode-input'),
    searchStudentBtn: document.getElementById('search-student-btn'),
    statusPresenca: document.getElementById('status-presenca'),
    presenceConfirmationArea: document.getElementById('presence-confirmation-area'),
    tabelaPresencaBody: document.getElementById('tabela-presenca-body'),
    // Aba de Alunos
    tabelaAlunosBody: document.getElementById('tabela-alunos-body'),
    searchAlunoInput: document.getElementById('search-aluno-input'),
    // Aba de Crachás
    listaCrachasAlunos: document.getElementById('lista-crachas-alunos'),
    crachaCanvas: document.getElementById('cracha-canvas'),
    downloadCrachaBtn: document.getElementById('download-cracha-btn'),
    downloadTodosCrachasBtn: document.getElementById('download-todos-crachas-btn'),
    zipStatus: document.getElementById('zip-status'),
    personalizarLayoutBtn: document.getElementById('personalizar-layout-btn'),
    // Aba de Cadastro Manual
    tabelaCadastroManualBody: document.getElementById('tabela-cadastro-manual-body'),
    addAlunoRowBtn: document.getElementById('add-aluno-row-btn'),
    saveManualAlunosBtn: document.getElementById('save-manual-alunos-btn'),
    manualCadastroStatus: document.getElementById('manual-cadastro-status'),
    // Aba de Importação/Exportação
    importDropZone: document.getElementById('import-drop-zone'),
    importFileInput: document.getElementById('import-file-input'),
    importBrowseBtn: document.getElementById('import-browse-btn'),
    importStatus: document.getElementById('import-status'),
    exportDbBtn: document.getElementById('export-db-btn'),
    // Aba de Configurações - [REFATORAÇÃO DOM-1.2: Seletores de pasta removidos da aba de Configurações]
    // selectFolderBtn: document.getElementById('select-folder-btn'), // Removido
    // folderStatus: document.getElementById('folder-status'),     // Removido

    // selectBackupFolderBtnModal: document.getElementById('select-backup-folder-btn-modal'), // Mantido na seção de modal
    // resetBackupFolderBtnModal: document.getElementById('reset-backup-folder-btn-modal'), // Mantido na seção de modal
    // backupFolderStatusModal: document.getElementById('backup-folder-status-modal'), // Mantido na seção de modal

    // Modal de Exportação de Crachás
    exportOptionsModal: document.getElementById('export-options-modal'),
    exportDirectBtn: document.getElementById('export-direct-btn'),
    exportPdfBtn: document.getElementById('export-pdf-btn'),
    cancelExportBtn: document.getElementById('cancel-export-btn'),
    // Modal de Seleção de Template
    templateSelectorModal: document.getElementById('template-selector-modal'),
    templateGallery: document.getElementById('template-gallery'),
    cancelTemplateModalBtn: document.getElementById('cancel-template-modal-btn'),
    confirmTemplateBtn: document.getElementById('confirm-template-btn'),
};

export const crachaCtx = DOM.crachaCanvas.getContext('2d');