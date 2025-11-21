'use strict';

import { DOM, crachaCtx } from '../config/dom-selectors.js';
import { state, crachaConfig } from '../config/state.js';
import { Utils } from '../utils/helpers.js';
import { UIManager } from '../ui/ui-manager.js';
const REF_CANVAS_WIDTH = 638;
const REF_CANVAS_HEIGHT = 1000;
const REDUCTION_FACTOR = 1;
export let alturaCracha = 0;
export let larguraCracha = 0;
/**
 * Calcula a posição dinâmica do código de barras.
 * Mantém a lógica onde 0,0 é o centro.
 * Y negativo move para baixo (na lógica de renderização atual onde centerY - Y).
 * @param {number} width Largura real do template
 * @param {number} height Altura real do template
 * @returns {object} {x, y} Coordenadas calculadas
 */
export function calculateAutoBarcodePosition(width, height) {
    // A lógica de desenho usa: adjustedY = centerY - (POS_Y * scale)
    // Para mover para baixo (parte inferior do crachá), precisamos de um Y negativo.
    // Ex: Altura 1000. Centro = 500.
    // Queremos posição ~800px (parte inferior).
    // 500 - (-300) = 800.
    // Então retornamos aprox -30% da altura total.
    return {
        x: 0, // Centro horizontal
        y: -(height * 0.30) // Posiciona no terço inferior dinamicamente
    };
}
export const CrachaService = {
    /**
     * Desenha o crachá de um aluno no canvas principal.
     * @param {object} aluno - O objeto do aluno.
     */
    generate: async (aluno) => {
        if (!state.activeSchool?.templateHandle) {
            throw new Error("Template de crachá não configurado para a escola ativa.");
        }

        const { Nome, Turma, Codigo_Barras } = aluno;
        const templateHandle = state.activeSchool.templateHandle;
        let imageUrl, isObjectURL = false;

        crachaCtx.clearRect(0, 0, DOM.crachaCanvas.width, DOM.crachaCanvas.height);
        
        if (templateHandle.isPredefined) {
            imageUrl = templateHandle.path;
        } else {
            const templateFile = await templateHandle.getFile();
            imageUrl = URL.createObjectURL(templateFile);
            isObjectURL = true;
        }

        try {
            const template = await Utils.loadImage(imageUrl);
            window.largura = template.width;
            window.altura = template.height;
            larguraCracha = template.width;
            alturaCracha = template.height;
            // 1. AJUSTA O TAMANHO DO CANVAS PRINCIPAL
            DOM.crachaCanvas.width = template.width;
            DOM.crachaCanvas.height = template.height;
            
            // 2. CALCULA OS FATORES DE ESCALA SEPARADAMENTE
            const scaleX = template.width / REF_CANVAS_WIDTH;
            const scaleY = template.height / REF_CANVAS_HEIGHT;
            let barcodePos = { x: 0, y: 0 };
            if (crachaConfig.BARCODE_POSITION === 'AUTO') {
                // Calcula posição absoluta em pixels para este template
                const autoPos = calculateAutoBarcodePosition(template.width, template.height);
                
                // Ajusta para a escala de referência para manter consistência matemática
                // O renderizador multiplica por scaleX/Y, então dividimos aqui para anular
                barcodePos.x = autoPos.x / scaleX;
                barcodePos.y = autoPos.y / scaleY;
            } else {
                barcodePos = crachaConfig.BARCODE_POSITION;
            }

            // 3. PARÂMETROS ESCALADOS: Usa scaleX para X/largura e scaleY para Y/altura
            const scaledConfig = {
                // ... (FONT_SIZE, TEXT_Y_POSITION, etc. - inalterados)
                FONT_SIZE: crachaConfig.FONT_SIZE * scaleY, 
                TEXT_Y_POSITION: crachaConfig.TEXT_Y_POSITION * scaleY,
                TURMA_FONT_SIZE: crachaConfig.TURMA_FONT_SIZE * scaleY,
                TURMA_Y_POSITION: crachaConfig.TURMA_Y_POSITION * scaleY,
                
                BARCODE_POSITION: { 
                    x: barcodePos.x * scaleX, 
                    y: barcodePos.y * scaleY 
                },
                BARCODE_SIZE: { 
                    // NOVO: Aplica o fator de redução na largura
                    width: crachaConfig.BARCODE_SIZE.width * scaleX * REDUCTION_FACTOR, 
                    // NOVO: Aplica o fator de redução na altura (para manter proporção)
                    height: crachaConfig.BARCODE_SIZE.height * scaleX * REDUCTION_FACTOR
                }
            };

            crachaCtx.drawImage(template, 0, 0, DOM.crachaCanvas.width, DOM.crachaCanvas.height);
            
            // 4. USA OS VALORES ESCALADOS
            // Nome
            crachaCtx.font = `bold ${scaledConfig.FONT_SIZE}px "${crachaConfig.FONT_FAMILY}"`;
            crachaCtx.fillStyle = crachaConfig.TEXT_COLOR;
            crachaCtx.textAlign = 'center';
            // A posição X (largura/2) é relativa ao canvas e não precisa de escala.
            crachaCtx.fillText(Nome, DOM.crachaCanvas.width / 2, scaledConfig.TEXT_Y_POSITION);
            
            // Turma
            crachaCtx.font = `600 ${scaledConfig.TURMA_FONT_SIZE}px "${crachaConfig.FONT_FAMILY}"`;
            crachaCtx.fillStyle = crachaConfig.TURMA_TEXT_COLOR;
            crachaCtx.fillText(Turma, DOM.crachaCanvas.width / 2, scaledConfig.TURMA_Y_POSITION);
            
            const barcodeCanvas = document.createElement('canvas');
            JsBarcode(barcodeCanvas, Codigo_Barras, { 
                format: "EAN13", 
                margin: 0, 
                displayValue: false,
                height: 80
            });
            console.log('barcodeCanvas size:', barcodeCanvas.width, barcodeCanvas.height);
            // Calcula fator de escala (tamanho visual final)
            const scaledWidth = crachaConfig.BARCODE_SIZE.width * scaleX * REDUCTION_FACTOR;
            const scaledHeight = crachaConfig.BARCODE_SIZE.height * scaleY * REDUCTION_FACTOR;

            // Usa a largura real do conteúdo do código de barras
            const actualBarcodeWidth = barcodeCanvas.width;
            const actualBarcodeHeight = barcodeCanvas.height;

            // Calcula a posição central
            // O ponto zero é o canto esquerdo da imagem, então centralizamos com base nisso
            // Calcula a posição X central com deslocamento configurável
            // BARCODE_POSITION.x agora é um offset relativo ao centro
            const centerX = DOM.crachaCanvas.width / 2;
            const centerY = DOM.crachaCanvas.height / 2;

            // Calcula posições ajustadas com base no centro
            // BARCODE_POSITION.x e .y são deslocamentos relativos ao centro
            // X positivo → direita; Y positivo → para cima
            const adjustedX = centerX + scaledConfig.BARCODE_POSITION.x - (scaledWidth / 2);
            const adjustedY = centerY - scaledConfig.BARCODE_POSITION.y - (scaledHeight / 2);

            crachaCtx.drawImage(
                barcodeCanvas,
                0, 0, actualBarcodeWidth, actualBarcodeHeight,
                adjustedX, adjustedY, scaledWidth, scaledHeight
            );
        } finally {
            if (isObjectURL) URL.revokeObjectURL(imageUrl);
        }

    },
    
    /** Inicia o download do crachá atualmente exibido como uma imagem PNG. */
    downloadSingle: async () => {
        if (!state.selectedAlunoCracha) return;
        try {
            await CrachaService.generate(state.selectedAlunoCracha);
            const a = document.createElement('a');
            a.download = `${state.selectedAlunoCracha.Nome.replace(/ /g, '_')}_cracha.png`;
            a.href = DOM.crachaCanvas.toDataURL('image/png');
            a.click();
        } catch (err) {
            Utils.showToast('Erro ao gerar imagem do crachá.', 'error');
            console.error(err);
        } finally {
            UIManager.closeExportModal();
        }
    },

    /** Gera e inicia o download de todos os crachás em um arquivo ZIP. */
    downloadAllAsZip: async () => {
        if (state.alunos.length === 0) {
            Utils.showToast('Não há alunos para exportar.', 'warning');
            return;
        }
        
        const zip = new JSZip();
        DOM.downloadTodosCrachasBtn.disabled = true;
        Utils.updateStatus(DOM.zipStatus, 'Iniciando geração...', 'info');

        try {
            for (let i = 0; i < state.alunos.length; i++) {
                const aluno = state.alunos[i];
                Utils.updateStatus(DOM.zipStatus, `Gerando ${i + 1}/${state.alunos.length}: ${aluno.Nome}...`, 'warning');
                await CrachaService.generate(aluno);
                const blob = await new Promise(resolve => DOM.crachaCanvas.toBlob(resolve, 'image/png'));
                if (blob) zip.file(`${aluno.Nome.replace(/ /g, '_')}_cracha.png`, blob);
            }

            Utils.updateStatus(DOM.zipStatus, 'Compactando arquivo...', 'warning');
            const content = await zip.generateAsync({ type: 'blob' });
            
            const a = document.createElement('a');
            a.href = URL.createObjectURL(content);
            a.download = 'todos_os_crachas.zip';
            a.click();
            URL.revokeObjectURL(a.href);
            Utils.updateStatus(DOM.zipStatus, 'Download iniciado!', 'success');

        } catch (error) {
            Utils.updateStatus(DOM.zipStatus, 'Erro durante a geração do ZIP.', 'error');
            console.error("Erro ao gerar ZIP de crachás:", error);
        } finally {
            setTimeout(() => { Utils.hideStatus(DOM.zipStatus); }, 5000);
            DOM.downloadTodosCrachasBtn.disabled = false;
            UIManager.clearCanvas();
            UIManager.closeExportModal();
        }
    },

    /** Prepara os crachás e os envia para a página do gerador de PDF. */
    exportToPdf: async () => {
        UIManager.closeExportModal();
    
        const alunosParaProcessar = (state.exportMode === 'single' && state.selectedAlunoCracha)
            ? [state.selectedAlunoCracha]
            : state.alunos;
        
        if (alunosParaProcessar.length === 0) {
            Utils.showToast('Nenhum crachá para exportar.', 'error');
            return;
        }
    
        // Exibe uma mensagem de status inicial na aba principal.
        UIManager.updateStatus('Iniciando geração dos crachás...', 'info');
    
        try {
            // PASSO 1: Processamento pesado (geração de imagens e do zip).
            const zip = new JSZip();
            for (let i = 0; i < alunosParaProcessar.length; i++) {
                const aluno = alunosParaProcessar[i];
                UIManager.updateStatus(`Processando ${i + 1}/${alunosParaProcessar.length}: ${aluno.Nome}...`, 'warning');
                
                await CrachaService.generate(aluno); // Reutiliza a função de geração
                
                const blob = await new Promise(resolve => DOM.crachaCanvas.toBlob(resolve, 'image/png'));
                if (blob) zip.file(`${aluno.Nome.replace(/ /g, '_')}_cracha.png`, blob);
            }
    
            UIManager.updateStatus('Compactando e abrindo a aba de impressão...', 'warning');
            const zipBlob = await zip.generateAsync({ type: 'blob' });
    
            // PASSO 2: Tenta abrir a nova janela APÓS o processamento.
            // ATENÇÃO: Esta ação pode ser bloqueada por navegadores.
            const pdfWindow = window.open('gerador_pdf/gerador.html', '_blank');
    
            if (!pdfWindow) {
                Utils.showToast('Pop-up bloqueado. Habilite pop-ups para este site e tente novamente.', 'error');
                UIManager.updateStatus('A exportação falhou devido ao bloqueio de pop-up.', 'error');
                return; // Encerra a função se o pop-up foi bloqueado.
            }
    
            // PASSO 3: Aguarda a nova janela carregar completamente.
            pdfWindow.addEventListener('load', () => {
                // PASSO 4: Envia os dados para a nova janela.
                if (typeof pdfWindow.initializeWithZip === 'function') {
                    pdfWindow.initializeWithZip(zipBlob);
                } else {
                    Utils.showToast('Erro de comunicação com a aba de PDF.', 'error');
                    console.error("A função 'initializeWithZip' não foi encontrada na janela de destino.");
                    if (!pdfWindow.closed) pdfWindow.close();
                }
            }, { once: true });
    
            UIManager.updateStatus('Pronto! Verifique a nova aba que foi aberta.', 'success');
    
        } catch (error) {
            Utils.showToast(`Erro ao preparar crachás: ${error.message}`, 'error');
            console.error("Erro na exportação para PDF:", error);
        } finally {
            // Limpa o status e o canvas após a operação, independentemente do resultado.
            setTimeout(() => { UIManager.hideStatus(); }, 5000);
            UIManager.clearCanvas();
        }
    },
};