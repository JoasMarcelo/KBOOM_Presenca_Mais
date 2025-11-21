'use strict';

import { DOM } from '../config/dom-selectors.js';
import { state } from '../config/state.js';
import { Utils } from '../utils/helpers.js';
import { DBService } from './db.service.js';
import { UIManager } from '../ui/ui-manager.js';

export const ImportExportService = {
    /** Lida com o arquivo de importação, roteando para a função correta. */
    handleImportFile: async (file) => {
        if (!file) return;
        Utils.updateStatus(DOM.importStatus, `Processando "${file.name}"...`, 'info');
        
        const fileName = file.name.toLowerCase();
        let importFunction;
        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) importFunction = ImportExportService.fromExcel;
        else if (fileName.endsWith('.db') || fileName.endsWith('.sqlite')) importFunction = ImportExportService.fromSQLite;
        else {
            Utils.updateStatus(DOM.importStatus, 'Erro: Arquivo não suportado. Use .xlsx, .db ou .sqlite.', 'error');
            return;
        }
        
        try {
            await DBService.createIncrementalBackup();
            const result = await importFunction(file, state.db);
            const { importados = 0, atualizados = 0, ignorados = 0 } = result;
            
            let msg = `${importados} aluno(s) novo(s) adicionado(s).`;
            if (atualizados > 0) msg += ` ${atualizados} registro(s) atualizado(s).`;
            if (ignorados > 0) msg += ` ${ignorados} duplicado(s) ignorado(s).`;
            
            Utils.updateStatus(DOM.importStatus, msg, 'success');
            state.alunos = DBService.getAlunos(state.db);
            UIManager.renderAll();
            await DBService.saveWorkingCopy();
        } catch (e) {
            Utils.updateStatus(DOM.importStatus, `Erro ao importar: ${e.message}`, 'error');
            console.error(e);
        } finally {
            DOM.importFileInput.value = '';
        }
    },

    /** Importa alunos de um arquivo Excel. */
    fromExcel: (file, db) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                let importados = 0, ignorados = 0;
                
                db.exec("BEGIN TRANSACTION;");
                sheetData.forEach(aluno => {
                    const nome = Utils.getProp(aluno, ['Nome', 'nome', 'Aluno']);
                    const turma = Utils.getProp(aluno, ['Turma', 'turma']);
                    // Tenta capturar UID_RFID de colunas comuns
                    const uid = Utils.getProp(aluno, ['UID_RFID', 'uid_rfid', 'RFID', 'rfid', 'UID', 'uid']);
                    
                    if (nome && turma) {
                        const result = DBService.upsertAlunoByNomeTurma(db, { 
                            nome: String(nome), 
                            turma: String(turma),
                            UID_RFID: uid ? String(uid) : null
                        });
                        if (result?.action === 'inserted') importados++;
                        else ignorados++;
                    }
                });
                db.exec("COMMIT;");
                resolve({ importados, ignorados });
            } catch (err) {
                db.exec("ROLLBACK;");
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    }),

    /** Importa (mescla) alunos de outro banco de dados SQLite. */
    fromSQLite: async (file, db) => {
        const SQL = await initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}` });
        const importedDb = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
        const result = importedDb.exec("SELECT * FROM alunos");
        let importados = 0, atualizados = 0;

        if (result.length > 0 && result[0].values.length > 0) {
            const columns = result[0].columns;
            const colMap = Object.fromEntries(columns.map((col, index) => [col, index]));

            db.exec("BEGIN TRANSACTION;");
            try {
                result[0].values.forEach(row => {
                    const alunoFromImport = {
                        id: row[colMap.id],
                        nome: row[colMap.nome],
                        turma: row[colMap.turma],
                        codigo_barra: row[colMap.codigo_barra],
                        foto: row[colMap.foto],
                        // Importa o RFID se a coluna existir no banco de origem
                        UID_RFID: (colMap.UID_RFID !== undefined) ? row[colMap.UID_RFID] : null
                    };
                    const res = DBService.upsertAlunoById(db, alunoFromImport);
                    if (res?.action === 'inserted') importados++;
                    if (res?.action === 'updated') atualizados++;
                });
                db.exec("COMMIT;");
            } catch (e) { db.exec("ROLLBACK;"); throw e; }
        }
        importedDb.close();
        return { importados, atualizados };
    },
    
    /** Exporta o banco de dados atual para um arquivo .db. */
    exportDatabase: (db, schoolName) => {
        const data = db.export();
        const blob = new Blob([data], { type: "application/octet-stream" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${schoolName.replace(/ /g, '_')}_backup.db`;
        a.click();
        URL.revokeObjectURL(a.href);
    },
};