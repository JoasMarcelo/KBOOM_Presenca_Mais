const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const pageTypeSelect = document.getElementById('page-type');
    const pageOrientationSelect = document.getElementById('page-orientation'); // NOVO
    
    // Controles de Layout
    const autoLayoutCheckbox = document.getElementById('auto-layout-checkbox');
    const autoLayoutSettings = document.getElementById('auto-layout-settings');
    const manualLayoutSettings = document.getElementById('manual-layout-settings');
    const autoColsInput = document.getElementById('auto-cols');
    const autoRowsInput = document.getElementById('auto-rows');

    const imageWidthInput = document.getElementById('image-width');
    const imageHeightInput = document.getElementById('image-height');
    const keepProportionCheckbox = document.getElementById('keep-proportion');
    const proportionInfo = document.getElementById('proportion-info');
    const marginHInput = document.getElementById('margin-h');
    const marginVInput = document.getElementById('margin-v');
    const pageMarginTopInput = document.getElementById('page-margin-top');
    const pageMarginBottomInput = document.getElementById('page-margin-bottom');
    const pageMarginLeftInput = document.getElementById('page-margin-left');
    const pageMarginRightInput = document.getElementById('page-margin-right');
    
    const showFilenameCheckbox = document.getElementById('show-filename');
    const generatePdfBtn = document.getElementById('generate-pdf-btn');
    const resetBtn = document.getElementById('reset-btn');
    const previewArea = document.getElementById('preview-area');
    const alertBox = document.getElementById('alert-box');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');

    const PAGE_SIZES = {
        a4: { width: 210, height: 297 },
        letter: { width: 215.9, height: 279.4 },
        legal: { width: 215.9, height: 355.6 }
    };

    let images = [];
    let currentPage = 1;
    let totalPages = 1;
    let firstImageAspectRatio = null;
    let isUpdatingProportionally = false;

    window.initializeWithZip = async function(zipBlob) {
        if (zipBlob) {
            try {
                const uploadSection = document.getElementById('drop-zone').parentElement;
                if (uploadSection) uploadSection.style.display = 'none';
                await handleZipFile(zipBlob, true);
                updatePreview();
            } catch (e) { console.error("Erro ao processar o ZIP recebido:", e); showAlert("Falha ao ler o arquivo de crachás recebido."); }
        }
    };

    // --- MANIPULAÇÃO DE EVENTOS ---
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
    fileInput.addEventListener('change', () => handleFiles(fileInput.files));
    
    const allLayoutInputs = [
        pageTypeSelect, pageOrientationSelect, autoLayoutCheckbox, autoColsInput, autoRowsInput,
        imageWidthInput, imageHeightInput, marginHInput, marginVInput, 
        pageMarginTopInput, pageMarginBottomInput, pageMarginLeftInput, 
        pageMarginRightInput, showFilenameCheckbox
    ];
    allLayoutInputs.forEach(input => { input.addEventListener('change', () => { currentPage = 1; updatePreview(); }); });
    
    imageWidthInput.addEventListener('input', () => {
        if (isUpdatingProportionally) return;
        if (keepProportionCheckbox.checked && firstImageAspectRatio) {
            isUpdatingProportionally = true;
            const width = parseFloat(imageWidthInput.value);
            imageHeightInput.value = (width / firstImageAspectRatio).toFixed(2);
            isUpdatingProportionally = false;
        }
        updatePreview();
    });
    imageHeightInput.addEventListener('input', () => {
        if (isUpdatingProportionally) return;
        if (keepProportionCheckbox.checked && firstImageAspectRatio) {
            isUpdatingProportionally = true;
            const height = parseFloat(imageHeightInput.value);
            imageWidthInput.value = (height * firstImageAspectRatio).toFixed(2);
            isUpdatingProportionally = false;
        }
        updatePreview();
    });
    keepProportionCheckbox.addEventListener('change', () => { if (keepProportionCheckbox.checked && firstImageAspectRatio) { imageWidthInput.dispatchEvent(new Event('input')); } });

    autoLayoutCheckbox.addEventListener('change', () => { toggleLayoutMode(); updatePreview(); });

    generatePdfBtn.addEventListener('click', generatePDF);
    resetBtn.addEventListener('click', () => { 
        images = []; fileInput.value = ''; currentPage = 1;
        firstImageAspectRatio = null; keepProportionCheckbox.checked = false; keepProportionCheckbox.disabled = true;
        proportionInfo.style.visibility = 'hidden'; autoLayoutCheckbox.checked = false;
        toggleLayoutMode(); updatePreview(); 
    });
    prevPageBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; updatePreview(); } });
    nextPageBtn.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; updatePreview(); } });

    // --- FUNÇÕES DE LÓGICA ---
    function toggleLayoutMode() {
        const isAuto = autoLayoutCheckbox.checked;
        autoLayoutSettings.style.display = isAuto ? 'block' : 'none';
        manualLayoutSettings.style.display = isAuto ? 'none' : 'block';
    }

    async function handleFiles(files) {
        if (images.length === 0) {
            const firstImageFile = Array.from(files).find(f => f.type.startsWith('image/'));
            if (firstImageFile) { await setAspectRatioFromFile(firstImageFile); }
        }
        for (const file of files) {
            if (file.type.startsWith('image/')) { images.push({ name: file.name, url: URL.createObjectURL(file) }); } 
            else if (file.name.endsWith('.zip')) { await handleZipFile(file); }
        }
        currentPage = 1; updatePreview();
    }

    async function handleZipFile(zipFile) {
        try {
            const zip = await JSZip.loadAsync(zipFile);
            const imagePromises = []; let firstImageEntry = null;
            zip.forEach((_, zipEntry) => {
                if (!zipEntry.dir && /\.(jpe?g|png|gif|bmp)$/i.test(zipEntry.name) && !zipEntry.name.startsWith('__MACOSX')) {
                    if (images.length === 0 && !firstImageEntry) { firstImageEntry = zipEntry; }
                    imagePromises.push(zipEntry.async('blob').then(blob => { images.push({ name: zipEntry.name, url: URL.createObjectURL(blob) }); }));
                }
            });
            if (firstImageEntry) { await setAspectRatioFromFile(await firstImageEntry.async('blob')); }
            await Promise.all(imagePromises);
        } catch (error) { console.error("Erro ao processar o arquivo ZIP:", error); showAlert("Falha ao ler o arquivo ZIP."); }
    }

    function setAspectRatioFromFile(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                firstImageAspectRatio = img.naturalWidth / img.naturalHeight;
                keepProportionCheckbox.disabled = false; keepProportionCheckbox.checked = true;
                proportionInfo.style.visibility = 'visible';
                imageWidthInput.dispatchEvent(new Event('input')); 
                URL.revokeObjectURL(img.src); resolve();
            };
            img.onerror = reject; img.src = URL.createObjectURL(file);
        });
    }
    
    function getLayoutSettings() {
        const pageFormat = pageTypeSelect.value;
        const orientation = pageOrientationSelect.value; // NOVO
        const basePageDimensions = PAGE_SIZES[pageFormat];
        let pageDimensions = { ...basePageDimensions };

        // MODIFICADO: Inverte as dimensões se a orientação for paisagem
        if (orientation === 'landscape') {
            pageDimensions = { width: basePageDimensions.height, height: basePageDimensions.width };
        }
        
        const settings = { format: pageFormat, orientation: orientation };

        if (autoLayoutCheckbox.checked) {
            const cols = parseInt(autoColsInput.value) || 1;
            const rows = parseInt(autoRowsInput.value) || 1;
            if (!firstImageAspectRatio) return { ...settings, imagesPerPage: 0, error: true };

            const pageAspectRatio = pageDimensions.width / pageDimensions.height;
            const gridAspectRatio = (cols * firstImageAspectRatio) / rows;
            if (gridAspectRatio > pageAspectRatio) {
                settings.imgWidth = pageDimensions.width / cols;
                settings.imgHeight = settings.imgWidth / firstImageAspectRatio;
            } else {
                settings.imgHeight = pageDimensions.height / rows;
                settings.imgWidth = settings.imgHeight * firstImageAspectRatio;
            }
            const remainingHSpace = pageDimensions.width - (cols * settings.imgWidth);
            const remainingVSpace = pageDimensions.height - (rows * settings.imgHeight);
            settings.spacingH = remainingHSpace / (cols + 1);
            settings.spacingV = remainingVSpace / (rows + 1);
            settings.marginLeft = settings.spacingH;
            settings.marginTop = settings.spacingV;
            settings.cols = cols;
            settings.rows = rows;
            settings.imagesPerPage = cols * rows;
        } else {
            settings.marginTop = parseFloat(pageMarginTopInput.value);
            settings.marginLeft = parseFloat(pageMarginLeftInput.value);
            const availableWidth = pageDimensions.width - settings.marginLeft - parseFloat(pageMarginRightInput.value);
            const availableHeight = pageDimensions.height - settings.marginTop - parseFloat(pageMarginBottomInput.value);
            settings.imgWidth = parseFloat(imageWidthInput.value);
            settings.imgHeight = parseFloat(imageHeightInput.value);
            settings.spacingH = parseFloat(marginHInput.value);
            settings.spacingV = parseFloat(marginVInput.value);
            settings.cols = Math.floor((availableWidth + settings.spacingH) / (settings.imgWidth + settings.spacingH));
            settings.rows = Math.floor((availableHeight + settings.spacingV) / (settings.imgHeight + settings.spacingV));
            if (settings.cols < 0) settings.cols = 0;
            if (settings.rows < 0) settings.rows = 0;
            settings.imagesPerPage = settings.cols * settings.rows;
        }
        return settings;
    }

    function updatePreview() {
        previewArea.innerHTML = '';
        alertBox.style.display = 'none';

        const s = getLayoutSettings();
        
        // MODIFICADO: Ajusta as dimensões da área de preview com base na orientação
        const baseDims = PAGE_SIZES[pageTypeSelect.value];
        const orientation = pageOrientationSelect.value;
        previewArea.style.width = `${orientation === 'landscape' ? baseDims.height : baseDims.width}mm`;
        previewArea.style.height = `${orientation === 'landscape' ? baseDims.width : baseDims.height}mm`;

        if (images.length === 0) { pageInfo.textContent = 'Página 1 de 1'; return; }
        if (autoLayoutCheckbox.checked && !firstImageAspectRatio) { showAlert('Carregue uma imagem para usar o Layout Automático.'); return; }
        if (s.imagesPerPage <= 0 || s.imgWidth <= 0 || s.imgHeight <= 0) {
            showAlert('As imagens não cabem na página com as configurações atuais.');
            pageInfo.textContent = 'Página 1 de 1'; totalPages = 1; return;
        }
        totalPages = Math.ceil(images.length / s.imagesPerPage);
        if (currentPage > totalPages) currentPage = totalPages;
        pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
        const startIndex = (currentPage - 1) * s.imagesPerPage;
        const endIndex = Math.min(startIndex + s.imagesPerPage, images.length);
        const imagesOnPage = images.slice(startIndex, endIndex);

        imagesOnPage.forEach((image, index) => {
            const row = Math.floor(index / s.cols);
            const col = index % s.cols;
            const x = s.marginLeft + col * (s.imgWidth + s.spacingH);
            const y = s.marginTop + row * (s.imgHeight + s.spacingV);
            const imgElement = document.createElement('div');
            imgElement.className = 'preview-image';
            imgElement.style.left = `${x}mm`;
            imgElement.style.top = `${y}mm`;
            imgElement.style.width = `${s.imgWidth}mm`;
            imgElement.style.height = `${s.imgHeight}mm`;
            imgElement.style.backgroundImage = `url('${image.url}')`;
            if (showFilenameCheckbox.checked) {
                const nameElement = document.createElement('div');
                nameElement.className = 'image-name';
                nameElement.textContent = image.name;
                imgElement.appendChild(nameElement);
            }
            previewArea.appendChild(imgElement);
        });
    }

    async function generatePDF() {
        if (images.length === 0) { showAlert("Nenhuma imagem para gerar PDF."); return; }
        const s = getLayoutSettings();
        if (s.imagesPerPage <= 0) { showAlert('Impossível gerar PDF. As imagens não cabem na página.'); return; }

        const { jsPDF } = window.jspdf;
        // MODIFICADO: Passa a orientação para o construtor do jsPDF
        const doc = new jsPDF({ orientation: s.orientation, unit: 'mm', format: s.format });

        for (let i = 0; i < images.length; i++) {
            const pageIndex = Math.floor(i / s.imagesPerPage);
            const indexOnPage = i % s.imagesPerPage;
            if (indexOnPage === 0 && pageIndex > 0) doc.addPage(s.format, s.orientation); // Adiciona nova página com a mesma orientação
            
            const row = Math.floor(indexOnPage / s.cols);
            const col = indexOnPage % s.cols;
            const x = s.marginLeft + col * (s.imgWidth + s.spacingH);
            const y = s.marginTop + row * (s.imgHeight + s.spacingV);
            try {
                const image = await loadImage(images[i].url);
                doc.addImage(image, 'JPEG', x, y, s.imgWidth, s.imgHeight);
                if (showFilenameCheckbox.checked) {
                    doc.setFontSize(8); doc.setTextColor(100);
                    doc.text(images[i].name, x + s.imgWidth / 2, y + s.imgHeight + 3, { align: 'center' });
                }
            } catch (error) { console.error("Erro ao adicionar imagem ao PDF:", images[i].name, error); }
        }
        doc.save('imagens.pdf');
    }

    function loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image(); img.crossOrigin = 'Anonymous';
            img.onload = () => resolve(img); img.onerror = (e) => reject(e);
            img.src = url;
        });
    }

    function showAlert(message) {
        alertBox.textContent = message; alertBox.style.display = 'block';
    }

    // Inicialização da página
    proportionInfo.style.visibility = 'hidden';
    toggleLayoutMode();
    updatePreview();