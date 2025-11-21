'use strict';


export const CONFIG = {
    DB_NAME: 'SchoolManagerDB',
    DB_STORE_NAME: 'SchoolsStore',
    HANDLE_DB_NAME: 'AppHandlesDB',
    HANDLE_STORE_NAME: 'HandlesStore',
    HANDLE_KEY: 'savedDirectoryHandle',
    PRESENCE_KEY_PREFIX: 'presencaDB_',
    PREDEFINED_TEMPLATES: [
        'assets/templates/template_cracha.png',
        'assets/templates/template_azul.png',
        'assets/templates/template_cinza.png',
        'assets/templates/template_amarelo.png',
    ],
    // Mapeamento de classes CSS para evitar "magic strings"
    CSS_CLASSES: {
        HIDDEN: 'hidden',
        ACTIVE: 'active',
        SELECTED: 'selected',
        EDITING: 'editing',
        LOADING: 'loading',
        DRAGOVER: 'dragover',
    },
    // Configurações padrão para o crachá
    CRACHA_DEFAULT_CONFIG: {
        FONT_FAMILY: 'League Spartan',
        FONT_SIZE: 60,
        TEXT_COLOR: '#FFFFFF',
        TEXT_Y_POSITION: 280,
        TURMA_FONT_SIZE: 40,
        TURMA_TEXT_COLOR: '#FFFFFF',
        TURMA_Y_POSITION: 340,
        BARCODE_POSITION: 'AUTO',
        BARCODE_SIZE: { width: 380, height: 206 }
    }
};