'use strict';

import { CONFIG } from '../config/constants.js';
import { state } from '../config/state.js';
import { DOM } from '../config/dom-selectors.js';
import { Utils } from '../utils/helpers.js';

export const FileService = {
    /** Abre a conexão com o IndexedDB para handles de arquivos. */
    openHandleDB: () => new Promise((resolve, reject) => {
        const request = indexedDB.open(CONFIG.HANDLE_DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(CONFIG.HANDLE_STORE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }),

    /** Salva o handle do diretório principal no IndexedDB. (Mantido para compatibilidade/legado) */
    saveDirectoryHandle: async (handle) => {
        const db = await FileService.openHandleDB();
        const tx = db.transaction(CONFIG.HANDLE_STORE_NAME, 'readwrite');
        tx.objectStore(CONFIG.HANDLE_STORE_NAME).put(handle, CONFIG.HANDLE_KEY);
        return tx.complete;
    },

    /** Obtém o handle do diretório salvo no IndexedDB. (Mantido para compatibilidade/legado) */
    getSavedDirectoryHandle: async () => {
        const db = await FileService.openHandleDB();
        return new Promise((resolve) => {
            const request = db.transaction(CONFIG.HANDLE_STORE_NAME).objectStore(CONFIG.HANDLE_STORE_NAME).get(CONFIG.HANDLE_KEY);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null); // Retorna nulo em caso de erro
        });
    },

    /** Verifica e solicita permissão de acesso a um handle do sistema de arquivos. */
    verifyPermission: async (fileHandle, readOnly = false) => {
        if (!fileHandle || fileHandle.isPredefined) return true;
        const options = { mode: readOnly ? 'read' : 'readwrite' };
        if (await fileHandle.queryPermission(options) === 'granted') return true;
        return await fileHandle.requestPermission(options) === 'granted';
    },

    /** Carrega e verifica o handle do diretório salvo. (Mantido para compatibilidade) */
    loadAndVerifySavedHandle: async () => {
        const savedHandle = await FileService.getSavedDirectoryHandle();
        if (savedHandle) {
            // [REFATORAÇÃO 5.2: state.directoryHandle agora serve como um valor de fallback/legado global]
            if (await FileService.verifyPermission(savedHandle)) {
                state.directoryHandle = savedHandle;
                // A atualização de status aqui pode ser redundante se uma escola for carregada logo em seguida.
                // Mantido o status para o caso de nenhuma escola estar ativa.
                Utils.updateStatus(DOM.folderStatus, `Pasta salva "${savedHandle.name}" carregada.`, 'success');
            } else {
                Utils.updateStatus(DOM.folderStatus, `Permissão para a pasta "${savedHandle.name}" foi negada. Selecione-a novamente.`, 'warning');
            }
        }
    },

    /** Garante a estrutura de pastas e cria/carrega uma cópia de trabalho do banco de dados. */
    setupWorkingDirectory: async (school) => {
        // [REFATORAÇÃO 4.2 e 5.3: Usa handles da escola ou fallback para o comportamento legado/padrão]
        // spreadsheetHandle é o handle da pasta de planilhas/principal da escola (já definido em state.directoryHandle pelo SchoolService.load)
        const spreadsheetHandle = state.directoryHandle; 
        const backupHandle = school.backupFolderHandle; // Pode ser null
        
        if (!spreadsheetHandle || !school.dbHandle) {
            Utils.showToast("Pasta principal ou banco de dados original não definidos.", "error");
            return null;
        }

        try {
            // Nomes de diretório e arquivo
            const safeSchoolName = school.name.replace(/ /g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
            const schoolDirName = school.name.replace(/[^a-zA-Z0-9_ -]/g, '');
            const workingCopyName = `${safeSchoolName}.db`;
            
            let finalBackupDirHandle;

            if (backupHandle) {
                // [REFATORAÇÃO 4.3: Usa pasta de backup específica da escola]
                // Cria a subestrutura (Nome da Escola/base) dentro da pasta de backup definida na escola.
                const schoolDirHandle = await backupHandle.getDirectoryHandle(schoolDirName, { create: true });
                finalBackupDirHandle = await schoolDirHandle.getDirectoryHandle('base', { create: true });
            } else {
                // [REFATORAÇÃO 3.1: Comportamento padrão/legado - usa subpasta da pasta de planilha]
                // Cria a estrutura SchoolName/backup/base dentro da pasta da planilha (spreadsheetHandle).
                // Isso mantém o comportamento existente (criação automática de backup com base na pasta da planilha).
                const schoolDirHandle = await spreadsheetHandle.getDirectoryHandle(schoolDirName, { create: true });
                const backupDirHandle = await schoolDirHandle.getDirectoryHandle('backup', { create: true });
                finalBackupDirHandle = await backupDirHandle.getDirectoryHandle('base', { create: true });
            }

            let workingDbHandle;

            try {
                workingDbHandle = await finalBackupDirHandle.getFileHandle(workingCopyName, { create: false });
            } catch (error) {
                if (error.name === 'NotFoundError') {
                    Utils.showToast("Criando cópia de trabalho da base de dados...", "info");
                    const originalFile = await school.dbHandle.getFile();
                    const originalData = await originalFile.arrayBuffer();
                    workingDbHandle = await finalBackupDirHandle.getFileHandle(workingCopyName, { create: true });
                    const writable = await workingDbHandle.createWritable();
                    await writable.write(originalData);
                    await writable.close();
                } else {
                    throw error;
                }
            }
            
            return workingDbHandle;

        } catch (err) {
            console.error("Falha ao configurar o diretório de trabalho:", err);
            Utils.showToast(`Erro crítico na configuração dos arquivos: ${err.message}`, 'error');
            return null;
        }
    },
};