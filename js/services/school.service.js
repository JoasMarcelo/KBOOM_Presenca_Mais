'use strict';

import { state, crachaConfig } from '../config/state.js';
import { CONFIG } from '../config/constants.js';
import { UIManager } from '../ui/ui-manager.js';
import { Utils } from '../utils/helpers.js';
import { FileService } from './file.service.js';
import { DBService } from './db.service.js';
import { PresenceService } from './presence.service.js';

export const SchoolService = {
    /** Abre a conexão com o IndexedDB para o armazenamento de escolas. */
    openIDB: () => new Promise((resolve, reject) => {
        if (state.idb) return resolve(state.idb);
        const request = indexedDB.open(CONFIG.DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(CONFIG.DB_STORE_NAME, { keyPath: 'id' });
        request.onsuccess = () => { state.idb = request.result; resolve(state.idb); };
        request.onerror = () => reject(request.error);
    }),

    /** Obtém todas as escolas do IndexedDB. */
    getAll: async () => {
        const db = await SchoolService.openIDB();
        return new Promise((resolve, reject) => {
            const request = db.transaction(CONFIG.DB_STORE_NAME, 'readonly').objectStore(CONFIG.DB_STORE_NAME).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /** Salva (cria ou atualiza) uma escola no IndexedDB. */
    save: async (school) => {
        const db = await SchoolService.openIDB();
        const tx = db.transaction(CONFIG.DB_STORE_NAME, 'readwrite');
        tx.objectStore(CONFIG.DB_STORE_NAME).put(school);
        return tx.complete;
    },

    /** Exclui uma escola do IndexedDB. */
    delete: async (schoolId) => {
        const db = await SchoolService.openIDB();
        const tx = db.transaction(CONFIG.DB_STORE_NAME, 'readwrite');
        tx.objectStore(CONFIG.DB_STORE_NAME).delete(schoolId);
        return tx.complete;
    },

    /** Carrega uma escola, define como ativa e inicializa seus dados. */
    load: async (school) => {
        try {
            Utils.updateStatus(document.getElementById('status-presenca'), 'Carregando escola...', 'info');

            if (!school) throw new Error("Objeto escola inválido.");

            // =========================================================================
            // 1. Validar e Carregar Pasta de Planilhas
            // =========================================================================
            let activeSpreadsheetFolderHandle = school.spreadsheetFolderHandle;

            if (!activeSpreadsheetFolderHandle || !(activeSpreadsheetFolderHandle instanceof FileSystemDirectoryHandle)) {
                Utils.showToast("Selecione a pasta de planilhas novamente.", "warning", 5000);
                try {
                    activeSpreadsheetFolderHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                    school.spreadsheetFolderHandle = activeSpreadsheetFolderHandle;
                    await SchoolService.save(school);
                } catch (e) {
                    return; // Cancelado pelo usuário
                }
            } else {
                if (!(await FileService.verifyPermission(activeSpreadsheetFolderHandle, true))) {
                    Utils.showToast("Permissão negada à pasta de planilhas.", "error");
                    return;
                }
            }

            // =========================================================================
            // 2. Validar e Carregar Base de Dados
            // =========================================================================
            let activeDbHandle = school.dbHandle;

            // Tenta reidratar se necessário
            if ((!activeDbHandle || !(activeDbHandle instanceof FileSystemFileHandle)) && school.dbHandle) {
                try {
                    activeDbHandle = await FileService.rehydrateHandle(activeSpreadsheetFolderHandle, school.dbHandle);
                } catch (err) {
                    console.warn("Falha ao reidratar DB:", err);
                }
            }

            if (!activeDbHandle || !(activeDbHandle instanceof FileSystemFileHandle)) {
                Utils.showToast("Arquivo de banco de dados não encontrado. Edite a escola.", "error", 7000);
                if(window.startSchoolEdit) window.startSchoolEdit(school);
                return;
            }

            if (!(await FileService.verifyPermission(activeDbHandle, true))) {
                Utils.showToast("Permissão de acesso à base de dados negada.", "error");
                return;
            }

            // =========================================================================
            // 3. Validar Outros Arquivos (Opcionais)
            // =========================================================================
            let activeLogoHandle = school.logoHandle;
            if (activeLogoHandle && !(activeLogoHandle instanceof FileSystemFileHandle)) activeLogoHandle = null;
            
            let activeTemplateHandle = school.templateHandle;
            if (activeTemplateHandle && !activeTemplateHandle.isPredefined && !(activeTemplateHandle instanceof FileSystemFileHandle)) activeTemplateHandle = null;

            let activeBackupFolderHandle = school.backupFolderHandle;
            if (activeBackupFolderHandle && !(activeBackupFolderHandle instanceof FileSystemDirectoryHandle)) {
                try {
                    activeBackupFolderHandle = await FileService.rehydrateHandle(activeSpreadsheetFolderHandle, school.backupFolderHandle);
                } catch (e) { activeBackupFolderHandle = null; }
            }

            // =========================================================================
            // 4. Atualizar Estado Global
            // =========================================================================
            state.activeSchool = {
                ...school,
                dbHandle: activeDbHandle,
                logoHandle: activeLogoHandle,
                templateHandle: activeTemplateHandle,
                spreadsheetFolderHandle: activeSpreadsheetFolderHandle,
                backupFolderHandle: activeBackupFolderHandle
            };
            state.directoryHandle = activeSpreadsheetFolderHandle;

            // =========================================================================
            // 5. Criar Cópia de Trabalho (Working DB)
            // =========================================================================
            const workingDbHandle = await FileService.setupWorkingDirectory(state.activeSchool);

            // Verificação crítica para evitar o erro "reading 'name' of null"
            if (!workingDbHandle) {
                throw new Error("Falha ao criar arquivo temporário da base de dados.");
            }

            state.activeSchool.workingDbHandle = workingDbHandle;
            await SchoolService.save(state.activeSchool);

            // =========================================================================
            // 6. Inicializar Serviços e UI
            // =========================================================================
            state.db = await DBService.initialize(workingDbHandle);
            state.alunos = DBService.getAlunos(state.db);

            const savedConfig = DBService.getCrachaConfig(state.db);
            Object.assign(crachaConfig, JSON.parse(JSON.stringify(CONFIG.CRACHA_DEFAULT_CONFIG)));
            if (savedConfig) Object.assign(crachaConfig, savedConfig);

            UIManager.showMainPanel();
            UIManager.renderAll();

            // Atualiza o cabeçalho usando ?. para segurança extra contra nulos
            const schoolName = state.activeSchool?.name || "Escola";
            const dbName = workingDbHandle?.name || "DB Desconhecido";
            
            if (UIManager.updateHeader) {
                UIManager.updateHeader(schoolName, dbName);
            }

            if (state.directoryHandle) {
                await PresenceService.initializeAllClassSheets();
            }

            Utils.showToast(`Escola "${schoolName}" carregada!`, 'success');

        } catch (err) {
            console.error("Erro crítico em load:", err);
            Utils.showToast(`Erro ao carregar: ${err.message || "Falha desconhecida"}`, "error");
        }
    },
};