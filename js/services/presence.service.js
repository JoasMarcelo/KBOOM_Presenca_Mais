'use strict';

import { CONFIG } from '../config/constants.js';
import { state } from '../config/state.js';
import { DOM } from '../config/dom-selectors.js';
import { UIManager } from '../ui/ui-manager.js';
import { Utils } from '../utils/helpers.js';

export const PresenceService = {
    /** Gera a chave única para o localStorage baseada na escola e na data. */
    getTodayKey: () => `${CONFIG.PRESENCE_KEY_PREFIX}${state.activeSchool.id}_${new Date().toISOString().slice(0, 10)}`,

    /** Carrega os dados de presença do localStorage para o estado da aplicação. */
    load: () => {
        if (state.activeSchool) {
            state.presencas = JSON.parse(localStorage.getItem(PresenceService.getTodayKey())) || [];
        }
    },

    /** Salva os dados de presença do estado da aplicação no localStorage. */
    save: () => {
        if (state.activeSchool) {
            localStorage.setItem(PresenceService.getTodayKey(), JSON.stringify(state.presencas));
        }
    },
    
    /** Registra a presença de um aluno, atualizando o estado e a planilha. */
    register: async () => {
        const aluno = state.alunoParaConfirmar;
        if (!aluno) return;
        if (!state.directoryHandle) {
            Utils.showToast('ERRO: Vá para "Configurações" e selecione a pasta para salvar as planilhas.', 'error');
            return;
        }
        
        const horaAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        if (state.presencas.some(p => p.alunoId === aluno.id)) {
            const presencaExistente = state.presencas.find(p => p.alunoId === aluno.id);
            Utils.showToast(`${aluno.Nome} já marcou presença hoje às ${presencaExistente.hora}.`, 'warning');
        } else {
            try {
                Utils.updateStatus(DOM.statusPresenca, `Registrando ${aluno.Nome}...`, 'warning');
                await PresenceService.updatePresenceSheet(aluno, horaAtual, true);
                state.presencas.push({ alunoId: aluno.id, hora: horaAtual });
                PresenceService.save();
                Utils.showToast(`Presença registrada para ${aluno.Nome} às ${horaAtual}.`, 'success');
                UIManager.renderPresencaTable();
            } catch (error) {
                console.error("Erro no processo de registro:", error);
                Utils.showToast(`Falha ao salvar planilha: ${error.message}`, 'error');
            }
        }
        UIManager.resetConfirmationArea();
    },

    /** Remove a presença de um aluno. */
    remove: async (alunoId) => {
        const aluno = state.alunos.find(a => a.id === alunoId);
        if (!aluno || !confirm(`Remover a presença de ${aluno.Nome}?`)) return;

        try {
            await PresenceService.updatePresenceSheet(aluno, null, false); // Marca como ausente
            state.presencas = state.presencas.filter(p => p.alunoId !== alunoId);
            PresenceService.save();
            UIManager.renderPresencaTable();
            Utils.showToast(`Presença de ${aluno.Nome} removida.`, 'info');
        } catch (error) {
            console.error("Erro ao remover presença:", error);
            Utils.showToast(`Falha ao remover presença: ${error.message}`, 'error');
        }
    },
    
    /** Inicializa as planilhas de presença para todas as turmas da escola ativa. */
    initializeAllClassSheets: async () => {
        if (!state.directoryHandle || !state.activeSchool || !state.alunos.length) return;
        
        const hoje = new Date();
        const nomePastaDia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
        const pastaEscolaHandle = await state.directoryHandle.getDirectoryHandle(state.activeSchool.name.replace(/[^a-zA-Z0-9_ -]/g, ''), { create: true });
        const pastaDiaHandle = await pastaEscolaHandle.getDirectoryHandle(nomePastaDia, { create: true });

        const turmasUnicas = [...new Set(state.alunos.map(a => a.Turma || "Sem_Turma"))];
        let errorCount = 0;

        for (const nomeTurma of turmasUnicas) {
            const nomeArquivo = `${nomeTurma.replace(/[^a-zA-Z0-9_ -]/g, '')}.xlsx`;
            
            try {
                const arquivoHandle = await pastaDiaHandle.getFileHandle(nomeArquivo, { create: true });
                // Lógica complexa de leitura/escrita mantida
                const arquivo = await arquivoHandle.getFile();
                let dadosParaPlanilha = [];
                if (arquivo.size > 0) {
                    try {
                        dadosParaPlanilha = XLSX.utils.sheet_to_json(XLSX.read(await arquivo.arrayBuffer(), { type: 'buffer' }).Sheets[XLSX.read(await arquivo.arrayBuffer(), { type: 'buffer' }).SheetNames[0]]);
                    } catch (e) { console.warn(`Erro ao ler ${nomeArquivo}, será sobrescrito.`); }
                }

                const todosAlunosDaTurma = state.alunos.filter(a => (a.Turma || "Sem_Turma") === nomeTurma);
                const dadosMap = new Map(dadosParaPlanilha.map(p => [p.Nome, p]));

                dadosParaPlanilha = todosAlunosDaTurma.map(alunoDaLista => {
                    const dadosExistente = dadosMap.get(alunoDaLista.Nome);
                    const presenteHoje = state.presencas.find(p => p.alunoId === alunoDaLista.id);
                    
                    return {
                        "Nome": alunoDaLista.Nome,
                        "Presença": presenteHoje ? "SIM" : (dadosExistente?.["Presença"] === "SIM" ? "SIM" : "NÃO"),
                        "Hora da Presença": presenteHoje ? presenteHoje.hora : (dadosExistente?.["Hora da Presença"] || "")
                    };
                }).sort((a,b) => a.Nome.localeCompare(b.Nome));
                
                const novaPlanilha = XLSX.utils.json_to_sheet(dadosParaPlanilha);
                const novoWorkbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(novoWorkbook, novaPlanilha, nomeTurma.replace(/[\/\\?*[\]]/g, '-').substring(0, 31));
                const writable = await arquivoHandle.createWritable();
                await writable.write(new Uint8Array(XLSX.write(novoWorkbook, { bookType: 'xlsx', type: 'array' })));
                await writable.close();
            } catch (error) {
                errorCount++;
                Utils.showToast(`Falha ao inicializar planilha para ${nomeTurma}. Pode estar em uso.`, 'error');
                console.error(error);
            }
        }
        if (errorCount === 0) Utils.showToast(`${turmasUnicas.length} planilha(s) de presença inicializadas.`, 'info');
    },

    /** Atualiza a planilha de presença (XLSX) para um aluno. */
    updatePresenceSheet: async (aluno, hora, presente) => {
        if (!state.directoryHandle) throw new Error("Pasta principal não selecionada.");
        
        const hoje = new Date();
        const nomePastaDia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
        const pastaEscolaHandle = await state.directoryHandle.getDirectoryHandle(state.activeSchool.name.replace(/[^a-zA-Z0-9_ -]/g, ''), { create: true });
        const pastaDiaHandle = await pastaEscolaHandle.getDirectoryHandle(nomePastaDia, { create: true });
        const nomeTurma = aluno.Turma || "Sem_Turma";
        const nomeArquivo = `${nomeTurma.replace(/[^a-zA-Z0-9_ -]/g, '')}.xlsx`;

        try {
            const arquivoHandle = await pastaDiaHandle.getFileHandle(nomeArquivo, { create: true });
            const arquivo = await arquivoHandle.getFile();
            let dadosPlanilha = [];

            if (arquivo.size > 0) {
                 try {
                    const workbook = XLSX.read(await arquivo.arrayBuffer(), { type: 'buffer' });
                    dadosPlanilha = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                } catch(e) { console.warn(`Erro ao ler ${nomeArquivo}, será sobrescrito.`); }
            }

            const todosAlunosDaTurma = state.alunos.filter(a => (a.Turma || "Sem_Turma") === nomeTurma);
            const dadosMap = new Map(dadosPlanilha.map(p => [p.Nome, p]));

            const novaLista = todosAlunosDaTurma.map(alunoDaTurma => {
                const dadosExistentes = dadosMap.get(alunoDaTurma.Nome);
                let status = "NÃO", horaPresenca = "";

                if (alunoDaTurma.id === aluno.id) { // O aluno que está sendo atualizado
                    status = presente ? "SIM" : "NÃO";
                    horaPresenca = presente ? hora : "";
                } else { // Os outros alunos
                    status = state.presencas.some(p => p.alunoId === alunoDaTurma.id) ? "SIM" : "NÃO";
                    horaPresenca = state.presencas.find(p => p.alunoId === alunoDaTurma.id)?.hora || "";
                }
                
                return { "Nome": alunoDaTurma.Nome, "Presença": status, "Hora da Presença": horaPresenca };
            }).sort((a, b) => a.Nome.localeCompare(b.Nome));
            
            const worksheet = XLSX.utils.json_to_sheet(novaLista);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, nomeTurma.replace(/[\/\\?*[\]]/g, '-').substring(0, 31));
            
            const writable = await arquivoHandle.createWritable();
            await writable.write(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
            await writable.close();
        } catch (error) {
            if (error.name === 'InvalidStateError') throw new Error("Planilha em uso. Feche o arquivo e tente novamente.");
            else throw error;
        }
    },
    
    /** Adiciona os event listeners para as teclas de atalho (= para confirmar, - para cancelar). */
    init: () => {
        document.addEventListener('keydown', (event) => {
            // Só executa se houver um aluno pendente para confirmação
            if (!state.alunoParaConfirmar) {
                return;
            }

            if (event.key === '=') {
                event.preventDefault(); // Impede o comportamento padrão
                PresenceService.register();
            } else if (event.key === '-') {
                event.preventDefault(); // Impede o comportamento padrão
                UIManager.resetConfirmationArea();
            }
        });
    },
};

// Observação: Para que isso funcione, você deve garantir que o método
// PresenceService.init() seja chamado uma vez durante a inicialização do seu aplicativo.