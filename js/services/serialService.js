/**
 * serialService.js
 * Módulo responsável pela comunicação com a Web Serial API.
 */

let port;
let reader;
let inputDone;
let outputDone;
let inputStream;
let keepReading = false;

// Lista de callbacks registrados
const subscribers = [];

/**
 * Registra uma função para ser chamada quando novos dados (uma linha completa) chegarem.
 * @param {Function} callback - Função que receberá a string de dados.
 */
export function onSerialData(callback) {
    if (typeof callback === 'function') {
        subscribers.push(callback);
    }
}

/**
 * Dispara todos os callbacks registrados com os dados recebidos.
 * @param {string} data - A string recebida da porta serial.
 */
function notifySubscribers(data) {
    subscribers.forEach(callback => {
        try {
            callback(data);
        } catch (error) {
            console.error("Erro ao executar callback serial:", error);
        }
    });
}

/**
 * Solicita permissão ao usuário, abre a porta e inicia a leitura.
 * Deve ser chamada por um gesto do usuário (ex: clique de botão).
 */
export async function connectSerial() {
    // Se já estiver lendo, não faz nada ou reinicia conforme lógica desejada.
    if (port && port.readable) {
        console.warn("Porta já está aberta.");
        return;
    }

    try {
        // 1. Solicita ao usuário que selecione uma porta
        port = await navigator.serial.requestPort();

        // 2. Abre a porta (BaudRate padrão 9600, ajuste conforme seu dispositivo)
        await port.open({ baudRate: 9600 });

        console.log("Porta Serial Conectada:", port.getInfo());

        // 3. Inicia o loop de leitura
        keepReading = true;
        readLoop();

    } catch (error) {
        console.error("Erro ao conectar na porta serial:", error);
    }
}

/**
 * Loop interno de leitura.
 * Lê o stream, decodifica bytes para texto e monta linhas completas.
 */
async function readLoop() {
    const textDecoder = new TextDecoderStream();
    inputDone = port.readable.pipeTo(textDecoder.writable);
    inputStream = textDecoder.readable;
    
    reader = inputStream.getReader();

    // Buffer para armazenar pedaços de texto até encontrar uma quebra de linha
    let buffer = "";

    try {
        while (keepReading) {
            const { value, done } = await reader.read();

            if (done) {
                // O stream foi cancelado ou fechado
                break;
            }

            if (value) {
                buffer += value;

                // Verifica se existe quebra de linha no buffer
                // Serial geralmente envia \r\n ou \n
                let lines = buffer.split(/\r?\n/);

                // O último elemento do array é um pedaço incompleto (ou vazio se terminou em \n)
                // Mantemos ele no buffer para a próxima leitura
                buffer = lines.pop(); 

                // Processa todas as linhas completas encontradas
                for (const line of lines) {
                    if (line) {
                        notifySubscribers(line);
                    }
                }
            }
        }
    } catch (error) {
        console.error("Erro de leitura serial:", error);
    } finally {
        // Limpeza e liberação do lock
        reader.releaseLock();
        console.log("Leitura serial finalizada.");
    }
}