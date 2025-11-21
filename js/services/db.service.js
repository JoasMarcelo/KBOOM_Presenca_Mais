'use strict';

import { state } from '../config/state.js';
import { Utils } from '../utils/helpers.js';
import { FileService } from './file.service.js';

export const DBService = {
    /** Inicializa uma instância do banco de dados sql.js. */
    initialize: async (fileHandle) => {
        const SQL = await initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}` });
        let db;
        if (fileHandle) {
            try {
                const file = await fileHandle.getFile();
                if (file.size > 0) db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
            } catch (e) { console.error("Arquivo DB não encontrado, criando um novo.", e); }
        }
        if (!db) {
            db = new SQL.Database();
            // ATUALIZADO: Adicionado UID_RFID na criação da tabela
            db.run(`CREATE TABLE IF NOT EXISTS alunos (
                id TEXT PRIMARY KEY, 
                nome TEXT NOT NULL, 
                turma TEXT NOT NULL, 
                codigo_barra TEXT UNIQUE, 
                foto BLOB,
                nome_normalizado TEXT,
                turma_normalizada TEXT,
                UID_RFID TEXT
            );`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_nome_turma_normalizado ON alunos (nome_normalizado, turma_normalizada);`);
        } else {
            // ATUALIZADO: Migração para bancos existentes (tenta adicionar a coluna se não existir)
            try {
                db.run("ALTER TABLE alunos ADD COLUMN UID_RFID TEXT;");
            } catch (e) {
                // Ignora erro se a coluna já existir
            }
        }
        return db;
    },

    /** Salva a cópia de trabalho do banco de dados no arquivo correspondente. */
    saveWorkingCopy: async () => {
        if (!state.db || !state.activeSchool?.workingDbHandle) return false;
        
        try {
            if (!await FileService.verifyPermission(state.activeSchool.workingDbHandle)) {
                throw new Error("Permissão negada para a base de trabalho.");
            }
            
            const data = state.db.export();
            const writable = await state.activeSchool.workingDbHandle.createWritable();
            await writable.write(data);
            await writable.close();
            return true;

        } catch(err) {
            console.error("Erro ao persistir DB:", err);
            Utils.showToast(`Falha ao salvar DB de trabalho: ${err.message}`, 'error');
            return false;
        }
    },

    /** Cria um backup incremental e rotacionado do banco de dados. */
    createIncrementalBackup: async () => {
        if (!state.db || !state.activeSchool || !state.directoryHandle) return;

        try {
            const schoolDirName = state.activeSchool.name.replace(/[^a-zA-Z0-9_ -]/g, '');
            const schoolDirHandle = await state.directoryHandle.getDirectoryHandle(schoolDirName, { create: true });
            const backupDirHandle = await schoolDirHandle.getDirectoryHandle('backup', { create: true });

            let backups = [];
            for await (const entry of backupDirHandle.values()) {
                if (entry.kind === 'file' && entry.name.startsWith('alunos_v') && entry.name.endsWith('.db')) {
                    const version = parseInt(entry.name.replace('alunos_v', '').replace('.db', ''));
                    if (!isNaN(version)) backups.push({ name: entry.name, version });
                }
            }
            backups.sort((a, b) => a.version - b.version);
            if (backups.length >= 5) {
                await backupDirHandle.removeEntry(backups[0].name);
            }
            const newVersion = (backups.length > 0 ? backups[backups.length - 1].version : 0) + 1;
            const newBackupFileName = `alunos_v${newVersion}.db`;

            const backupFileHandle = await backupDirHandle.getFileHandle(newBackupFileName, { create: true });
            const writable = await backupFileHandle.createWritable();
            await writable.write(state.db.export());
            await writable.close();
        } catch (err) {
            console.error("Falha ao criar o backup incremental:", err);
            Utils.showToast(`Erro no backup incremental: ${err.message}`, 'error');
            throw new Error("Falha no backup, operação cancelada.");
        }
    },
    
    // --- Funções de CRUD para alunos ---
    getAlunos: (db) => {
        const stmt = db.prepare("SELECT * FROM alunos");
        const alunos = [];
        while (stmt.step()) alunos.push(stmt.getAsObject());
        stmt.free();
        // ATUALIZADO: Mapeando UID_RFID no retorno
        return alunos.map(a => ({ 
            id: a.id, 
            Nome: a.nome, 
            Turma: a.turma, 
            Codigo_Barras: a.codigo_barra, 
            foto: a.foto,
            UID_RFID: a.UID_RFID 
        }));
    },
    addAluno: (db, aluno) => {
        const nomeNormalizado = Utils.normalizeString(aluno.nome);
        const turmaNormalizada = Utils.normalizeString(aluno.turma);
        const stmt = db.prepare("SELECT id FROM alunos WHERE nome_normalizado = ? AND turma_normalizada = ?");
        stmt.bind([nomeNormalizado, turmaNormalizada]);
        const existe = stmt.step();
        stmt.free();

        if (!existe) {
            // ATUALIZADO: Inserindo UID_RFID
            const insertStmt = db.prepare(`INSERT INTO alunos (id, nome, turma, codigo_barra, nome_normalizado, turma_normalizada, UID_RFID) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            insertStmt.run([
                crypto.randomUUID(), 
                aluno.nome.trim(), 
                aluno.turma.trim(), 
                Utils.generateValidBarcode(), 
                nomeNormalizado, 
                turmaNormalizada,
                aluno.UID_RFID || null // Garante null se undefined
            ]);
            insertStmt.free();
            return true;
        }
        return false;
    },
     updateAluno: (db, alunoId, novoNome, novaTurma, novoCodigoBarra, novoRfid) => {
        const nomeNormalizado = Utils.normalizeString(novoNome);
        const turmaNormalizada = Utils.normalizeString(novaTurma);
        
        // Tratamento para garantir que string vazia vire null (para não salvar string vazia no banco)
        const codigoParaSalvar = novoCodigoBarra && novoCodigoBarra.trim() !== "" ? novoCodigoBarra.trim() : null;
        const rfidParaSalvar = novoRfid && novoRfid.trim() !== "" ? novoRfid.trim() : null;

        const stmt = db.prepare(`
            UPDATE alunos 
            SET nome = ?, 
                turma = ?, 
                codigo_barra = ?, 
                UID_RFID = ?, 
                nome_normalizado = ?, 
                turma_normalizada = ? 
            WHERE id = ?
        `);
        
        // ATENÇÃO: A ordem aqui TEM que bater com os "?" acima
        stmt.run([
            novoNome.trim(), 
            novaTurma.trim(), 
            codigoParaSalvar, // 3º interrogação: codigo_barra
            rfidParaSalvar,   // 4º interrogação: UID_RFID
            nomeNormalizado, 
            turmaNormalizada, 
            alunoId
        ]);
        stmt.free();
    },
    updateFotoAluno: (db, alunoId, fotoBytes) => {
        const stmt = db.prepare("UPDATE alunos SET foto = ? WHERE id = ?");
        stmt.run([fotoBytes, alunoId]);
        stmt.free();
    },
    upsertAlunoByNomeTurma: (db, aluno) => {
        const nomeNormalizado = Utils.normalizeString(aluno.nome);
        const turmaNormalizada = Utils.normalizeString(aluno.turma);
        const selectStmt = db.prepare("SELECT id FROM alunos WHERE nome_normalizado = ? AND turma_normalizada = ?");
        selectStmt.bind([nomeNormalizado, turmaNormalizada]);
        const existe = selectStmt.step();
        selectStmt.free();
        
        if (existe) return { action: 'skipped' };
        
        // ATUALIZADO: Inserindo UID_RFID
        const insertStmt = db.prepare(`INSERT INTO alunos (id, nome, turma, codigo_barra, nome_normalizado, turma_normalizada, UID_RFID) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        insertStmt.run([
            crypto.randomUUID(), 
            aluno.nome.trim(), 
            aluno.turma.trim(), 
            Utils.generateValidBarcode(), 
            nomeNormalizado, 
            turmaNormalizada,
            aluno.UID_RFID || null
        ]);
        insertStmt.free();
        return { action: 'inserted' };
    },
    upsertAlunoById: (db, aluno) => {
        const selectStmt = db.prepare("SELECT id FROM alunos WHERE id = ?");
        selectStmt.bind([aluno.id]);
        const existe = selectStmt.step();
        selectStmt.free();
        
        const nomeNormalizado = Utils.normalizeString(aluno.nome);
        const turmaNormalizada = Utils.normalizeString(aluno.turma);

        if (existe) {
            // ATUALIZADO: Atualizando UID_RFID
            const stmt = db.prepare(`UPDATE alunos SET nome = ?, turma = ?, codigo_barra = ?, foto = ?, nome_normalizado = ?, turma_normalizada = ?, UID_RFID = ? WHERE id = ?`);
            stmt.run([aluno.nome, aluno.turma, aluno.codigo_barra, aluno.foto, nomeNormalizado, turmaNormalizada, aluno.UID_RFID || null, aluno.id]);
            stmt.free();
            return { action: 'updated' };
        } else {
            // ATUALIZADO: Inserindo UID_RFID
            const stmt = db.prepare(`INSERT INTO alunos (id, nome, turma, codigo_barra, foto, nome_normalizado, turma_normalizada, UID_RFID) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            stmt.run([aluno.id, aluno.nome, aluno.turma, aluno.codigo_barra || Utils.generateValidBarcode(), aluno.foto, nomeNormalizado, turmaNormalizada, aluno.UID_RFID || null]);
            stmt.free();
            return { action: 'inserted' };
        }
    },
    deleteAluno: (db, alunoId) => {
        const stmt = db.prepare("DELETE FROM alunos WHERE id = ?");
        stmt.run([alunoId]);
        stmt.free();
    },

    // --- Funções de configuração do crachá ---
    getCrachaConfig: (db) => {
        try {
            const stmt = db.prepare("SELECT cracha_config FROM config_escola WHERE id = 1");
            if (stmt.step()) {
                const configJSON = stmt.getAsObject().cracha_config;
                stmt.free();
                if (configJSON) return JSON.parse(configJSON);
            }
            stmt.free();
        } catch (e) { console.warn("Tabela de configuração não encontrada, usando padrão."); }
        return null;
    },
    saveCrachaConfig: async (db, config) => {
        await DBService.createIncrementalBackup();
        const configJSON = JSON.stringify(config);
        db.run(`CREATE TABLE IF NOT EXISTS config_escola (id INTEGER PRIMARY KEY, cracha_config TEXT);`);
        db.run("INSERT OR IGNORE INTO config_escola (id) VALUES (1);");
        const stmt = db.prepare("UPDATE config_escola SET cracha_config = ? WHERE id = 1");
        stmt.run([configJSON]);
        stmt.free();
        await DBService.saveWorkingCopy();
    }
};