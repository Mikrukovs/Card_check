// Управление загрузкой логотипов в карточках
class CardCarouselManager {
    constructor() {
        this.inputs = Array.from(document.querySelectorAll('.logo-input'));
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.sampleSize = 80;
        this.storageKey = 'card-data';
        this.bindEvents();
        this.restoreCards();
    }

    bindEvents() {
        if (!this.inputs.length) return;
        this.inputs.forEach(input => {
            input.addEventListener('change', (event) => this.handleLogoUpload(event));
        });
    }

    // Восстановление карточек из localStorage
    restoreCards() {
        const savedData = this.loadAllCardsData();
        if (!savedData) return;

        Object.keys(savedData).forEach(cardId => {
            const data = savedData[cardId];
            if (!data || !data.imageUrl) return;

            const card = document.querySelector(`.carousel-card[data-card-id="${cardId}"]`);
            if (!card) return;

            const previewImg = card.querySelector('.logo-image');
            const placeholder = card.querySelector('.logo-placeholder');

            if (previewImg && data.imageUrl) {
                previewImg.src = data.imageUrl;
                card.classList.add('has-logo');
                placeholder?.setAttribute('aria-hidden', 'true');
            }

            if (data.backgroundColor) {
                card.style.background = data.backgroundColor;
                card.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }
        });
    }

    // Сохранение данных карточки
    saveCardData(cardId, data) {
        try {
            const allData = this.loadAllCardsData() || {};
            allData[cardId] = {
                ...allData[cardId],
                ...data
            };
            localStorage.setItem(this.storageKey, JSON.stringify(allData));
        } catch (error) {
            console.warn('Не удалось сохранить данные карточки', error);
        }
    }

    // Загрузка всех данных карточек
    loadAllCardsData() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.warn('Не удалось загрузить данные карточек', error);
            return null;
        }
    }

    handleLogoUpload(event) {
        const input = event.target;
        const file = input?.files?.[0];
        const card = input?.closest('.carousel-card');
        if (!file || !card) {
            return;
    }
    
        const cardId = card.getAttribute('data-card-id');
        const previewImg = card.querySelector('.logo-image');
        const placeholder = card.querySelector('.logo-placeholder');
        if (!previewImg) {
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            previewImg.src = dataUrl;
            card.classList.add('has-logo');
            placeholder?.setAttribute('aria-hidden', 'true');
            
            // Сохраняем изображение в localStorage
            this.saveCardData(cardId, { imageUrl: dataUrl });
            
            this.applyCardColors(card, dataUrl);
            input.value = '';
        };
        reader.readAsDataURL(file);
    }

    applyCardColors(card, dataUrl) {
        if (!this.ctx) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const palette = this.analyzePalette(img);
            if (palette) {
                this.setCardBackground(card, palette);
            }
        };
        img.onerror = () => {
            console.warn('Не удалось загрузить изображение для карточки');
        };
        img.src = dataUrl;
        }
        
    // Проверка наличия прозрачности в изображении
    checkImageTransparency(image) {
        try {
            const size = Math.min(image.width, image.height, 100); // Небольшой семпл для быстрой проверки
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = size;
            tempCanvas.height = size;
            tempCtx.drawImage(image, 0, 0, size, size);
            const { data } = tempCtx.getImageData(0, 0, size, size);
            
            // Проверяем каждый 10-й пиксель для оптимизации
            for (let i = 3; i < data.length; i += 40) { // +40 = каждый 10-й пиксель (4 байта * 10)
                if (data[i] < 255) {
                    return true; // Найден прозрачный/полупрозрачный пиксель
                }
            }
            return false;
        } catch (error) {
            console.warn('Не удалось проверить прозрачность изображения', error);
            return false;
        }
    }
        
    // Анализ палитры: без градиентов, все проверки выполняются только по краям картинки
    analyzePalette(image) {
        try {
            const size = this.sampleSize;
            this.canvas.width = size;
            this.canvas.height = size;
            this.ctx.clearRect(0, 0, size, size);
            this.ctx.drawImage(image, 0, 0, size, size);
            const { data } = this.ctx.getImageData(0, 0, size, size);
            const stats = this.collectColorStats(data, size);
            if (!stats || !stats.edgeColors || stats.edgeColors.length === 0) return null;

            const EDGE_DOMINANCE_THRESHOLD = 0.58;
            const EDGE_VARIANCE_THRESHOLD = 320;
            const WHITE_EDGE_THRESHOLD = 0.35;
            const dominantEdge = this.extractDominantColor(stats.edgeColors);

            if (!dominantEdge) {
                return {
                    mode: 'solid',
                    solid: 'rgb(45, 45, 45)'
                };
            }

            // Проверка черного края
            if (this.isAlmostBlack(dominantEdge.color) && dominantEdge.dominance >= WHITE_EDGE_THRESHOLD) {
                // Черный край - используем темный фон с добавлением 10% белого
                const blackWithWhite = this.mixWithWhite({ r: 20, g: 20, b: 20 }, 0.1);
                return {
                    mode: 'solid',
                    solid: this.rgbString(blackWithWhite)
                };
            }

            // Проверка белого края
            if (this.isAlmostWhite(dominantEdge.color) && dominantEdge.dominance >= WHITE_EDGE_THRESHOLD) {
                // Белый край - проверяем края на наличие темных цветов (черный логотип)
                const darkColors = stats.edgeColors.filter(color => {
                    const { l } = this.rgbToHsl(color.r, color.g, color.b);
                    return l < 0.4; // Темные цвета
                });

                // Если есть темные цвета в краях (черный логотип), используем темный фон с добавлением 10% белого
                if (darkColors.length > stats.edgeColors.length * 0.15) {
                    const blackWithWhite = this.mixWithWhite({ r: 20, g: 20, b: 20 }, 0.1);
                    return {
                        mode: 'solid',
                        solid: this.rgbString(blackWithWhite)
                    };
                }

                // Иначе используем белый фон с добавлением 25% черного для большего затемнения
                const whiteWithBlack = this.mixWithBlack({ r: 255, g: 255, b: 255 }, 0.30);
                return {
                    mode: 'solid',
                    solid: this.rgbString(whiteWithBlack)
                };
            }

            // Однородный край - используем его цвет
            if (dominantEdge.dominance >= EDGE_DOMINANCE_THRESHOLD && dominantEdge.variance < EDGE_VARIANCE_THRESHOLD) {
                let finalColor = dominantEdge.color;
                const { l } = this.rgbToHsl(finalColor.r, finalColor.g, finalColor.b);
                
                // Если черный или его оттенки - добавляем 10% белого
                if (this.isAlmostBlack(finalColor)) {
                    finalColor = this.mixWithWhite(finalColor, 0.1);
                }
                // Если белый или его оттенки - добавляем 25% черного для большего затемнения
                else if (this.isAlmostWhite(finalColor)) {
                    finalColor = this.mixWithBlack(finalColor, 0.30);
                }
                // Если светлый цвет (L > 0.7) - добавляем больше черного для затемнения
                else if (l > 0.5) {
                    finalColor = this.mixWithBlack(finalColor, 0.1);
                }
                
                const solidColor = this.rgbString(this.ensureUsableColor(finalColor));
                return {
                    mode: 'solid',
                    solid: solidColor
                };
            }

            // Сложный логотип: находим доминантный цвет по краям
            // Фильтруем слишком светлые и слишком темные цвета
            const filteredColors = stats.edgeColors.filter(color => {
                const { l } = this.rgbToHsl(color.r, color.g, color.b);
                return l <= 0.9 && l >= 0.15;
            });
        
            if (filteredColors.length === 0) {
                // Если все цвета отфильтрованы, проверяем, может быть все края черные
                const allDark = stats.edgeColors.every(color => {
                    const { l } = this.rgbToHsl(color.r, color.g, color.b);
                    return l < 0.15;
                });
                
                if (allDark && stats.edgeColors.length > 0) {
                    // Все края черные - используем черный фон с 10% белого
                    const blackWithWhite = this.mixWithWhite({ r: 20, g: 20, b: 20 }, 0.1);
                    return {
                        mode: 'solid',
                        solid: this.rgbString(blackWithWhite)
                    };
                }
                
                return {
                    mode: 'solid',
                    solid: 'rgb(45, 45, 45)'
                };
        }
        
            // Ищем доминантный цвет с учетом насыщенности
            const dominantAll = this.extractDominantColorWeighted(filteredColors);
            if (!dominantAll) {
                return {
                    mode: 'solid',
                    solid: 'rgb(45, 45, 45)'
                };
            }

            let finalColor = dominantAll.color;
            const { l } = this.rgbToHsl(finalColor.r, finalColor.g, finalColor.b);
        
            // Если черный или его оттенки - добавляем 10% белого
            if (this.isAlmostBlack(finalColor)) {
                finalColor = this.mixWithWhite(finalColor, 0.1);
            }
            // Если белый или его оттенки - добавляем 25% черного для большего затемнения
            else if (this.isAlmostWhite(finalColor)) {
                finalColor = this.mixWithBlack(finalColor, 0.30);
            }
            // Если светлый цвет (L > 0.7) - добавляем больше черного для затемнения
            else if (l > 0.7) {
                finalColor = this.mixWithBlack(finalColor, 0.30);
            }

            const solidColor = this.rgbString(this.ensureUsableColor(finalColor));
            return {
                mode: 'solid',
                solid: solidColor
            };
        } catch (error) {
            console.warn('Не удалось вычислить палитру карточки', error);
            return null;
            }
    }

    mixWithBlack(color, blackRatio) {
        // blackRatio - доля черного (0.15 = 15%)
        // colorRatio - доля исходного цвета (0.85 = 85%)
        const colorRatio = 1 - blackRatio;
        return {
            r: Math.round(color.r * colorRatio),
            g: Math.round(color.g * colorRatio),
            b: Math.round(color.b * colorRatio)
        };
    }

    collectColorStats(data, size) {
        const margin = Math.floor(size * 0.10);
        const half = size / 2;
        const stats = {
            total: this.createAccumulator(),
            edge: this.createAccumulator(),
            topLeft: this.createAccumulator(),
            bottomRight: this.createAccumulator(),
            allColors: [],
            edgeColors: []
        };

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;
                const alpha = data[idx + 3];
                if (alpha < 20) continue;
                const color = { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
                stats.allColors.push(color);
                this.accumulate(stats.total, color);

                const isEdge = x < margin || y < margin || x >= size - margin || y >= size - margin;
                if (isEdge) {
                    this.accumulate(stats.edge, color);
                    stats.edgeColors.push(color);
                }

                if (x < half && y < half) {
                    this.accumulate(stats.topLeft, color);
                } else if (x >= half && y >= half) {
                    this.accumulate(stats.bottomRight, color);
                }
            }
        }

        this.finalizeAccumulator(stats.edge);
        this.finalizeAccumulator(stats.total);
        this.finalizeAccumulator(stats.topLeft);
        this.finalizeAccumulator(stats.bottomRight);

        return stats;
    }

    createAccumulator() {
        return {
            r: 0,
            g: 0,
            b: 0,
            r2: 0,
            g2: 0,
            b2: 0,
            count: 0,
            average: { r: 0, g: 0, b: 0 },
            deviation: 0
        };
    }

    accumulate(acc, color) {
        acc.r += color.r;
        acc.g += color.g;
        acc.b += color.b;
        acc.r2 += color.r * color.r;
        acc.g2 += color.g * color.g;
        acc.b2 += color.b * color.b;
        acc.count += 1;
    }

    finalizeAccumulator(acc) {
        if (acc.count === 0) return;
        acc.average = {
            r: acc.r / acc.count,
            g: acc.g / acc.count,
            b: acc.b / acc.count
        };
        const varianceR = acc.r2 / acc.count - Math.pow(acc.average.r, 2);
        const varianceG = acc.g2 / acc.count - Math.pow(acc.average.g, 2);
        const varianceB = acc.b2 / acc.count - Math.pow(acc.average.b, 2);
        const avgVariance = Math.max(0, (varianceR + varianceG + varianceB) / 3);
        acc.deviation = Math.sqrt(avgVariance);
    }

    extractDominantColor(colors, options = {}) {
        if (!colors || !colors.length) return null;
        const { step = 20 } = options;
        const buckets = this.buildBuckets(colors, step);
        let topBucket = null;
        buckets.forEach(bucket => {
            if (!topBucket || bucket.count > topBucket.count) {
                topBucket = bucket;
            }
        });
        if (!topBucket || topBucket.count === 0) return null;
        const average = {
            r: topBucket.r / topBucket.count,
            g: topBucket.g / topBucket.count,
            b: topBucket.b / topBucket.count
        };
        const varianceR = topBucket.r2 / topBucket.count - Math.pow(average.r, 2);
        const varianceG = topBucket.g2 / topBucket.count - Math.pow(average.g, 2);
        const varianceB = topBucket.b2 / topBucket.count - Math.pow(average.b, 2);
        const variance = Math.max(0, (varianceR + varianceG + varianceB) / 3);
        return {
            color: average,
            dominance: topBucket.count / colors.length,
            variance
        };
        }
        
    extractDominantColorWeighted(colors) {
        if (!colors || !colors.length) return null;
        const step = 24;
        const buckets = this.buildBuckets(colors, step);
        const scoredBuckets = [];

        buckets.forEach(bucket => {
            if (bucket.count === 0) return;
            const average = {
                r: bucket.r / bucket.count,
                g: bucket.g / bucket.count,
                b: bucket.b / bucket.count
            };
            const { s, l } = this.rgbToHsl(average.r, average.g, average.b);
        
            // Вес = количество пикселей * насыщенность * нормализованная яркость
            // Предпочитаем насыщенные цвета средней яркости
            const saturationWeight = Math.pow(s, 1.5); // Усиливаем влияние насыщенности
            const lightnessWeight = l > 0.2 && l < 0.85 ? 1.0 : 0.5; // Штраф за слишком светлые/темные
            const score = bucket.count * saturationWeight * lightnessWeight;

            scoredBuckets.push({
                color: average,
                count: bucket.count,
                score: score,
                saturation: s,
                lightness: l
            });
        });

        if (scoredBuckets.length === 0) return null;
            
        // Сортируем по score и берем топ-3, затем выбираем самый частый среди них
        scoredBuckets.sort((a, b) => b.score - a.score);
        const topCandidates = scoredBuckets.slice(0, 3);
        
        // Выбираем самый частый среди топ-кандидатов
        const best = topCandidates.reduce((best, current) => 
            current.count > best.count ? current : best
        );

        const varianceR = 0; // Упрощаем для сложных логотипов
        const varianceG = 0;
        const varianceB = 0;
        const variance = 0;

        return {
            color: best.color,
            dominance: best.count / colors.length,
            variance
        };
    }
    
    buildBuckets(colors, step = 24) {
        const buckets = new Map();
        colors.forEach(color => {
            const key = `${Math.floor(color.r / step)}-${Math.floor(color.g / step)}-${Math.floor(color.b / step)}`;
            const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0, r2: 0, g2: 0, b2: 0 };
            bucket.count += 1;
            bucket.r += color.r;
            bucket.g += color.g;
            bucket.b += color.b;
            bucket.r2 += color.r * color.r;
            bucket.g2 += color.g * color.g;
            bucket.b2 += color.b * color.b;
            buckets.set(key, bucket);
        });
        return buckets;
    }

    ensureUsableColor(color) {
        const { h, s, l } = this.rgbToHsl(color.r, color.g, color.b);
        const safeL = Math.min(0.82, Math.max(0.18, l));
        const safeS = Math.min(0.9, s); // Убираем минимум насыщенности, чтобы не портить серые цвета
        const { r, g, b } = this.hslToRgb(h, safeS, safeL);
        return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
    }
    
    colorDistance(a, b) {
        const dr = a.r - b.r;
        const dg = a.g - b.g;
        const db = a.b - b.b;
        return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    isAlmostWhite(color) {
        const { s, l } = this.rgbToHsl(color.r, color.g, color.b);
        return l >= 0.82 && s <= 0.22;
    }

    isAlmostBlack(color) {
        const { s, l } = this.rgbToHsl(color.r, color.g, color.b);
        return l <= 0.18 && s <= 0.22;
    }

    mixWithWhite(color, whiteRatio) {
        // whiteRatio - доля белого (0.1 = 10%)
        // colorRatio - доля исходного цвета (0.9 = 90%)
        const colorRatio = 1 - whiteRatio;
        return {
            r: Math.round(color.r * colorRatio + 255 * whiteRatio),
            g: Math.round(color.g * colorRatio + 255 * whiteRatio),
            b: Math.round(color.b * colorRatio + 255 * whiteRatio)
        };
        }
        
    rgbString(color, alpha = 1) {
        const r = Math.round(color.r);
        const g = Math.round(color.g);
        const b = Math.round(color.b);
        if (alpha !== 1) {
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return `rgb(${r}, ${g}, ${b})`;
    }

    adjustLightness(rgbColor, delta) {
        const { h, s, l } = this.rgbToHsl(rgbColor.r, rgbColor.g, rgbColor.b);
        const nextL = Math.max(0, Math.min(1, l + delta));
        const { r, g, b } = this.hslToRgb(h, s, nextL);
        return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
        }

    rgbToHsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s;
        const l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                default:
                    h = (r - g) / d + 4;
                    break;
            }
            h /= 6;
        }
        return { h, s, l };
    }

    hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l; // achromatic
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return { r: r * 255, g: g * 255, b: b * 255 };
    }

    setCardBackground(card, palette) {
        if (!palette || !palette.solid) return;
        const cardId = card.getAttribute('data-card-id');
        
        card.style.background = palette.solid;
        card.dataset.cardColor = palette.solid;
        card.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        
        // Сохраняем цвет фона в localStorage
        if (cardId) {
            this.saveCardData(cardId, { backgroundColor: palette.solid });
        }
    }
}

