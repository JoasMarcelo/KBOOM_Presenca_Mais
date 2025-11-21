'use strict';

export const Utils = {
    /** Exibe uma notificação temporária (toast). */
    showToast: (message, type = 'info') => {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const messageSpan = document.createElement('span');
        messageSpan.textContent = message;
        const closeButton = document.createElement('button');
        closeButton.className = 'toast-close-btn';
        closeButton.innerHTML = '&times;';

        const timer = setTimeout(() => toast.remove(), 5000);
        closeButton.addEventListener('click', () => {
            toast.remove();
            clearTimeout(timer);
        });

        toast.appendChild(messageSpan);
        toast.appendChild(closeButton);
        container.appendChild(toast);
    },

    /** Atualiza um elemento de status com uma mensagem. */
    updateStatus: (element, message, type) => {
        if (!element) return;
        element.innerHTML = message;
        element.className = 'status-box'; // Reseta as classes
        element.style.display = 'block';
        if (type) element.classList.add(type);
    },

    /** Esconde um elemento de status. */
    hideStatus: (element) => {
        if (element) element.style.display = 'none';
    },

    /** Normaliza uma string para comparações (remove acentos, minúsculas, etc.). */
    normalizeString: (str) => {
        if (!str) return '';
        return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    },

    /** Obtém a primeira propriedade existente de um objeto a partir de uma lista de chaves possíveis. */
    getProp: (obj, keys) => {
        for (const key of keys) {
            if (obj[key] !== undefined) return obj[key];
        }
        return undefined;
    },

    /** Carrega uma imagem de forma assíncrona. */
    loadImage: (src) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Falha ao carregar: ${src}.`));
        img.src = src;
    }),

    /** Comprime uma imagem e a converte para JPEG. */
    compressAndConvertToJPEG: (file) => new Promise((resolve, reject) => {
        const MAX_DIMENSION = 400;
        const JPEG_QUALITY = 0.8;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = e => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                if (width > height) {
                    if (width > MAX_DIMENSION) {
                        height *= MAX_DIMENSION / width;
                        width = MAX_DIMENSION;
                    }
                } else {
                    if (height > MAX_DIMENSION) {
                        width *= MAX_DIMENSION / height;
                        height = MAX_DIMENSION;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                canvas.toBlob(async blob => {
                    if (!blob) return reject(new Error("Falha ao converter imagem."));
                    resolve(new Uint8Array(await blob.arrayBuffer()));
                }, 'image/jpeg', JPEG_QUALITY);
            };
            img.onerror = () => reject(new Error("Arquivo de imagem inválido."));
        };
        reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    }),

    /** Calcula o dígito verificador para um código EAN-13. */
    calculateEAN13Checksum: (code) => String((10 - (String(code).split('').reduce((sum, digit, index) => sum + parseInt(digit) * (index % 2 ? 3 : 1), 0) % 10)) % 10),

    /** Gera um código de barras EAN-13 válido e único. */
    generateValidBarcode: () => {
        const partialCode = String(Math.floor(1e11 + Math.random() * 9e11));
        return partialCode + Utils.calculateEAN13Checksum(partialCode);
    },
};