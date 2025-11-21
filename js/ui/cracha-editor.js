'use strict';

import { state, crachaConfig } from '../config/state.js';
import { CONFIG } from '../config/constants.js';
import { DBService } from '../services/db.service.js';
// CORREÇÃO 1: Adicionado calculateAutoBarcodePosition no import
import { CrachaService, calculateAutoBarcodePosition } from '../services/cracha.service.js';
import { Utils } from '../utils/helpers.js';

const REF_CANVAS_WIDTH = 638;
const REF_CANVAS_HEIGHT = 1000;
const REDUCTION_FACTOR = 1;

export const CrachaEditor = {
    modalElement: null,
    previewCanvas: null,
    previewCtx: null,
    controlsContainer: null,
    originalBarcodeRatio: 0.54,
    alunoExemplo: { Nome: "NOME DO ALUNO", Turma: "TURMA", Codigo_Barras: "987654321098" },

    /**
     * Abre e inicializa o modal do editor de crachás.
     */
    open: function() {
        if (this.modalElement) return; // Previne a abertura de múltiplos modais.
        
        document.body.classList.add('modal-open');
        this.createModal(); // Cria o HTML do modal e o anexa ao corpo do documento.

        // Seleciona os elementos recém-criados.
        this.previewCanvas = document.getElementById('preview-canvas');
        this.previewCtx = this.previewCanvas.getContext('2d');
        this.controlsContainer = document.getElementById('editor-controles');

        // Calcula a proporção do código de barras de forma segura.
        if (crachaConfig.BARCODE_SIZE && crachaConfig.BARCODE_SIZE.width > 0) {
            this.originalBarcodeRatio = crachaConfig.BARCODE_SIZE.height / crachaConfig.BARCODE_SIZE.width;
        }
        
        // CORREÇÃO 2: Removidas as chamadas duplicadas que estavam aqui embaixo.
        // O fluxo agora é sequencial: Renderiza (descobre tamanho) -> Depois preenche controles -> Depois ativa eventos.
        this.renderPreview().then(() => {
            this.populateControls(); 
            this.addEventListeners();
        });
    },

    /**
     * Cria o elemento DOM do modal e o injeta na página.
     */
    createModal: function() {
        const modalHTML = `
            <div class="editor-container">
                <div class="editor-header">
                    <h2>Personalizar Layout do Crachá</h2>
                    <button id="fechar-editor-btn" class="btn-close" title="Fechar">&times;</button>
                </div>
                <div id="preview-cracha">
                    <canvas id="preview-canvas"></canvas>
                </div>
                <div id="editor-controles"></div>
                <div class="editor-footer">
                    <button id="resetar-cracha-btn" class="btn btn-error">Resetar para Padrão</button>
                    <button id="salvar-cracha-config-btn" class="btn btn-success">Salvar Configurações</button>
                </div>
            </div>`;
        this.modalElement = document.createElement('div');
        this.modalElement.id = 'cracha-editor-modal';
        this.modalElement.innerHTML = modalHTML;
        document.body.appendChild(this.modalElement);
    },

    /**
     * Adiciona os listeners de eventos aos elementos do modal.
     */
    addEventListeners: function() {
        this.modalElement.querySelector('#fechar-editor-btn').addEventListener('click', () => this.close());
        this.modalElement.querySelector('#salvar-cracha-config-btn').addEventListener('click', () => this.save());
        this.modalElement.querySelector('#resetar-cracha-btn').addEventListener('click', () => this.reset());
        this.controlsContainer.addEventListener('input', (e) => this.handleControlChange(e));
    },

    /**
     * Lida com mudanças nos inputs de configuração e atualiza a pré-visualização.
     */
    handleControlChange: function(e) {
        const target = e.target;
        const key = target.dataset.configKey;
        if (!key) return;

        let value = (target.type === 'color' || target.tagName === 'SELECT')
            ? target.value
            : parseInt(target.value, 10) || 0;

        const keys = key.split('.');
        if (keys.length === 2) {
            // Se mudar a posição e estava em AUTO, captura os valores atuais dos inputs para virar MANUAL
            if (keys[0] === 'BARCODE_POSITION' && crachaConfig.BARCODE_POSITION === 'AUTO') {
                const inputX = this.controlsContainer.querySelector('[data-config-key="BARCODE_POSITION.x"]');
                const inputY = this.controlsContainer.querySelector('[data-config-key="BARCODE_POSITION.y"]');
                crachaConfig.BARCODE_POSITION = {
                    x: parseInt(inputX.value, 10) || 0,
                    y: parseInt(inputY.value, 10) || 0
                };
            }

            // Atualiza o valor no objeto de configuração
            if (typeof crachaConfig[keys[0]] === 'object') {
                crachaConfig[keys[0]][keys[1]] = value;
            }

            // Mantém a proporção se alterar a largura do barcode
            if (keys[0] === 'BARCODE_SIZE' && keys[1] === 'width' && this.originalBarcodeRatio > 0) {
                crachaConfig.BARCODE_SIZE.height = Math.round(value * this.originalBarcodeRatio);
                const span = document.getElementById('valor-tamanho');
                if (span) span.textContent = `X: ${crachaConfig.BARCODE_SIZE.width} Y: ${crachaConfig.BARCODE_SIZE.height}`;
            }
        } else {
            crachaConfig[key] = value;
        }

        this.renderPreview();
    },

    /**
     * Renderiza a pré-visualização do crachá no canvas.
     */
    renderPreview: async function() {
        if (!state.activeSchool?.templateHandle) {
            this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
            this.previewCtx.textAlign = 'center';
            this.previewCtx.fillText("Template não encontrado", this.previewCanvas.width / 2, this.previewCanvas.height / 2);
            return;
        }

        let imageUrl, isObjectURL = false;
        
        if (state.activeSchool.templateHandle.isPredefined) {
            imageUrl = state.activeSchool.templateHandle.path;
        } else {
            try {
                const templateFile = await state.activeSchool.templateHandle.getFile();
                imageUrl = URL.createObjectURL(templateFile);
                isObjectURL = true;
            } catch (e) {
                console.error("Não foi possível carregar o arquivo de template.", e);
                return;
            }
        }

        try {
            const template = await Utils.loadImage(imageUrl);
            
            // 1. AJUSTA O TAMANHO DO CANVAS
            this.previewCanvas.width = template.width;
            this.previewCanvas.height = template.height;
            
            // 2. CALCULA OS FATORES DE ESCALA
            const scaleX = template.width / REF_CANVAS_WIDTH;
            const scaleY = template.height / REF_CANVAS_HEIGHT;

            // 3. LÓGICA DINÂMICA: Calcula posição se for AUTO ou usa a salva
            let barcodePos = { x: 0, y: 0 };
            if (crachaConfig.BARCODE_POSITION === 'AUTO') {
                const autoPos = calculateAutoBarcodePosition(template.width, template.height);
                barcodePos.x = autoPos.x / scaleX;
                barcodePos.y = autoPos.y / scaleY;
            } else {
                barcodePos = crachaConfig.BARCODE_POSITION;
            }

            const scaledConfig = {
                FONT_SIZE: crachaConfig.FONT_SIZE * scaleY,
                TEXT_Y_POSITION: crachaConfig.TEXT_Y_POSITION * scaleY,
                TURMA_FONT_SIZE: crachaConfig.TURMA_FONT_SIZE * scaleY,
                TURMA_Y_POSITION: crachaConfig.TURMA_Y_POSITION * scaleY,
                
                BARCODE_POSITION: { 
                    x: barcodePos.x * scaleX, 
                    y: barcodePos.y * scaleY 
                },
                BARCODE_SIZE: { 
                    width: crachaConfig.BARCODE_SIZE.width * scaleX * REDUCTION_FACTOR, 
                    height: crachaConfig.BARCODE_SIZE.height * scaleY * REDUCTION_FACTOR 
                }
            };

            this.previewCtx.drawImage(template, 0, 0, this.previewCanvas.width, this.previewCanvas.height);
            
            // Textos
            this.previewCtx.font = `bold ${scaledConfig.FONT_SIZE}px "${crachaConfig.FONT_FAMILY}"`;
            this.previewCtx.fillStyle = crachaConfig.TEXT_COLOR;
            this.previewCtx.textAlign = 'center';
            this.previewCtx.fillText(this.alunoExemplo.Nome, this.previewCanvas.width / 2, scaledConfig.TEXT_Y_POSITION);
            
            this.previewCtx.font = `600 ${scaledConfig.TURMA_FONT_SIZE}px "${crachaConfig.FONT_FAMILY}"`;
            this.previewCtx.fillStyle = crachaConfig.TURMA_TEXT_COLOR;
            this.previewCtx.fillText(this.alunoExemplo.Turma, this.previewCanvas.width / 2, scaledConfig.TURMA_Y_POSITION);

            // Código de Barras
            if (typeof JsBarcode === 'function') {
                const barcodeCanvas = document.createElement('canvas');
                JsBarcode(barcodeCanvas, this.alunoExemplo.Codigo_Barras, { 
                    format: "EAN13", 
                    margin: 0, 
                    displayValue: false 
                });

                const scaledWidth = scaledConfig.BARCODE_SIZE.width;
                const scaledHeight = scaledConfig.BARCODE_SIZE.height;

                const centerX = this.previewCanvas.width / 2;
                const centerY = this.previewCanvas.height / 2;

                const adjustedX = centerX + scaledConfig.BARCODE_POSITION.x - (scaledWidth / 2);
                const adjustedY = centerY - scaledConfig.BARCODE_POSITION.y - (scaledHeight / 2);

                this.previewCtx.drawImage(
                    barcodeCanvas,
                    adjustedX,
                    adjustedY,
                    scaledWidth,
                    scaledHeight
                );
            } else {
                console.error("JsBarcode não está carregado.");
            }
        } catch (err) {
            console.error("Erro ao renderizar preview:", err);
        } finally {
            if (isObjectURL) URL.revokeObjectURL(imageUrl);
        }
    },

    /**
     * Preenche a área de controles com inputs baseados na configuração atual.
     */
    populateControls: function() {
        let displayX = 0;
        let displayY = 0;

        // Se for AUTO, calculamos o valor real baseado no canvas atual para mostrar ao usuário
        if (crachaConfig.BARCODE_POSITION === 'AUTO' && this.previewCanvas) {
            const scaleX = this.previewCanvas.width / REF_CANVAS_WIDTH;
            const scaleY = this.previewCanvas.height / REF_CANVAS_HEIGHT;
            const autoPos = calculateAutoBarcodePosition(this.previewCanvas.width, this.previewCanvas.height);
            
            displayX = Math.round(autoPos.x / scaleX);
            displayY = Math.round(autoPos.y / scaleY);
        } else if (crachaConfig.BARCODE_POSITION) {
            displayX = crachaConfig.BARCODE_POSITION.x;
            displayY = crachaConfig.BARCODE_POSITION.y;
        }

        this.controlsContainer.innerHTML = `
            <div class="control-group"><h4>Nome do Aluno</h4>
                <label>Fonte: <select data-config-key="FONT_FAMILY" id="font-family-select">
                    <option value="League Spartan">League Spartan</option>
                    <option value="Arial">Arial</option>
                    <option value="Verdana">Verdana</option>
                    <option value="Helvetica">Helvetica</option>
                </select></label>
                <label>Cor: <input type="color" data-config-key="TEXT_COLOR" value="${crachaConfig.TEXT_COLOR}"></label>
                <label>Tamanho (px): <input type="number" data-config-key="FONT_SIZE" value="${crachaConfig.FONT_SIZE}"></label>
                <label>Posição Y (px): <input type="number" data-config-key="TEXT_Y_POSITION" value="${crachaConfig.TEXT_Y_POSITION}"></label>
            </div>
            <div class="control-group"><h4>Turma</h4>
                <label>Cor: <input type="color" data-config-key="TURMA_TEXT_COLOR" value="${crachaConfig.TURMA_TEXT_COLOR}"></label>
                <label>Tamanho (px): <input type="number" data-config-key="TURMA_FONT_SIZE" value="${crachaConfig.TURMA_FONT_SIZE}"></label>
                <label>Posição Y (px): <input type="number" data-config-key="TURMA_Y_POSITION" value="${crachaConfig.TURMA_Y_POSITION}"></label>
            </div>
            <div class="control-group"><h4>Código de Barras</h4>
                <label>
                    Tamanho: 
                    <span id="valor-tamanho">X: ${crachaConfig.BARCODE_SIZE.width} Y: ${crachaConfig.BARCODE_SIZE.height}</span>
                    <input 
                        type="number" 
                        data-config-key="BARCODE_SIZE.width" 
                        value="${crachaConfig.BARCODE_SIZE.width}"
                        oninput="document.getElementById('valor-tamanho').textContent = this.value">
                </label>
                <label>Posição X (px): <input type="number" data-config-key="BARCODE_POSITION.x" value="${displayX}"></label>
                <label>Posição Y (px): <input type="number" data-config-key="BARCODE_POSITION.y" value="${displayY}"></label>
            </div>`;
        
        // Define o valor do select corretamente
        const fontFamilySelect = this.controlsContainer.querySelector('#font-family-select');
        if (fontFamilySelect) fontFamilySelect.value = crachaConfig.FONT_FAMILY;
    },

    /**
     * Salva as configurações atuais no banco de dados.
     */
    save: async function() {
        try {
            await DBService.saveCrachaConfig(state.db, crachaConfig);
            Utils.showToast('Configurações salvas com sucesso!', 'success');
            if (state.selectedAlunoCracha) {
                CrachaService.generate(state.selectedAlunoCracha);
            }
            this.close();
        } catch(e) {
            Utils.showToast(`Falha ao salvar configurações: ${e.message}`, 'error');
        }
    },
    
    /**
     * Restaura as configurações para o valor padrão.
     */
    reset: function() {
        Object.assign(crachaConfig, JSON.parse(JSON.stringify(CONFIG.CRACHA_DEFAULT_CONFIG)));
        crachaConfig.BARCODE_POSITION = 'AUTO'; 
        Utils.showToast('Restaurado para Padrão (Posição Automática).', 'info');
        
        // Recarrega preview e depois atualiza controles
        this.renderPreview().then(() => this.populateControls());
    },

    /**
     * Fecha e remove o modal da página.
     */
    close: function() {
        if (!this.modalElement) return;
        document.body.classList.remove('modal-open');
        this.modalElement.remove();
        this.modalElement = null;
    }
};