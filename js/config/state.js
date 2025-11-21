'use strict';

import { CONFIG } from './constants.js';

// O estado central da aplicação
export let state = {
    // Dados da escola atualmente carregada
    activeSchool: null,
    // Conexão com o banco de dados IndexedDB principal (para escolas)
    idb: null,
    // Conexão com o banco de dados SQLite (sql.js) da escola ativa
    db: null,
    // Lista de alunos da escola ativa
    alunos: [],
    // Lista de presenças do dia para a escola ativa
    presencas: [],
    // Aluno atualmente selecionado na aba de crachás
    selectedAlunoCracha: null,
    // Handle (ponteiro) para a pasta principal de salvamento (agora armazena o handle da escola ativa)
    directoryHandle: null,
    // Aluno aguardando confirmação de presença
    alunoParaConfirmar: null,
    // Arquivos selecionados no modal de nova escola
    newSchoolFiles: { 
        logo: null, 
        db: null, 
        template: null,
        // [REFATORAÇÃO 2.2: Adiciona handles temporários para seleção de pasta no modal]
        spreadsheetFolder: null, // Handle da pasta de planilha selecionado no modal
        backupFolder: null       // Handle da pasta de backup selecionado no modal
    },
    // Modo de exportação de crachá ('single' ou 'all')
    exportMode: 'single',
    // Caminho do template predefinido selecionado
    selectedTemplatePath: null
};

// O objeto de configuração do crachá que será modificado dinamicamente
export const crachaConfig = JSON.parse(JSON.stringify(CONFIG.CRACHA_DEFAULT_CONFIG));