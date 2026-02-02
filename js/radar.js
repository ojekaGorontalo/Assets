// radar.js - Radar Animation System untuk JeGo Driver
// ==================== SISTEM RADAR PENCARIAN ORDER ====================

let radarContainer = null;
let radarAnimationInterval = null;

// Fungsi untuk membuat container radar sederhana
function createRadarContainer() {
    console.log('🛠️ Membuat container radar...');
    
    if (radarContainer) {
        return radarContainer;
    }
    
    const container = document.createElement('div');
    container.id = 'radarContainer';
    container.className = 'radar-container';
    
    container.innerHTML = `
        <div class="radar-simple">
            <div class="radar-scan"></div>
            <div class="radar-center"></div>
            <div class="radar-dot radar-dot-1"></div>
            <div class="radar-dot radar-dot-2"></div>
            <div class="radar-dot radar-dot-3"></div>
        </div>
        
        <div id="radarText">
            <h2>Mencari order di sekitar...</h2>
            <p id="radarSubtitle">Radius: 1.0 km</p>
        </div>
    `;
    
    // Tambahkan ke body jika belum ada
    if (!document.getElementById('radarContainer')) {
        document.body.appendChild(container);
    }
    
    radarContainer = container;
    return container;
}

// Fungsi untuk menampilkan/menyembunyikan radar
function toggleRadarAnimation(ordersCount) {
    const radar = document.getElementById('radarContainer');
    const ordersList = document.getElementById('ordersList');
    
    if (!radar) {
        createRadarContainer();
        return toggleRadarAnimation(ordersCount);
    }
    
    console.log(`📊 Toggle radar: ${ordersCount} order ditemukan`);
    
    if (ordersCount === 0) {
        // Tampilkan radar
        radar.style.display = 'flex';
        if (ordersList) ordersList.style.display = 'none';
        
        // Update radius info
        const subtitle = document.getElementById('radarSubtitle');
        if (subtitle) {
            subtitle.textContent = `Radius: ${customRadius} km`;
        }
        
        // Aktifkan animasi
        startRadarAnimation();
        
        console.log('🔍 Radar aktif - Mencari order...');
        sendToKodular({
            action: 'radar_active',
            status: 'searching',
            message: 'Radar aktif mencari order',
            radius: customRadius
        });
    } else {
        // Sembunyikan radar
        radar.style.display = 'none';
        if (ordersList) ordersList.style.display = 'block';
        
        // Hentikan animasi
        stopRadarAnimation();
        
        console.log('✅ Radar nonaktif - Order ditemukan');
        sendToKodular({
            action: 'radar_inactive',
            status: 'orders_found',
            message: 'Radar nonaktif - Order ditemukan'
        });
    }
}

// Fungsi untuk memulai animasi radar
function startRadarAnimation() {
    console.log('🔄 Memulai animasi radar...');
    
    // Hapus interval sebelumnya jika ada
    if (radarAnimationInterval) {
        clearInterval(radarAnimationInterval);
    }
    
    // Animasi sederhana untuk scanning dots
    let dotCounter = 0;
    radarAnimationInterval = setInterval(() => {
        const dots = document.querySelectorAll('.radar-dot');
        dots.forEach(dot => dot.style.opacity = '0');
        
        const activeDot = dots[dotCounter % dots.length];
        if (activeDot) {
            activeDot.style.opacity = '1';
        }
        
        dotCounter++;
    }, 500);
}

// Fungsi untuk menghentikan animasi radar
function stopRadarAnimation() {
    console.log('⏹️ Menghentikan animasi radar');
    
    if (radarAnimationInterval) {
        clearInterval(radarAnimationInterval);
        radarAnimationInterval = null;
    }
    
    // Reset opacity dots
    const dots = document.querySelectorAll('.radar-dot');
    dots.forEach(dot => dot.style.opacity = '0');
}

// Fungsi untuk radar loading sederhana
function showLoadingRadar(message = 'Menyiapkan aplikasi...') {
    const loadingEl = document.getElementById('loadingOverlay');
    
    if (loadingEl) {
        loadingEl.innerHTML = `
            <div class="loading-radar-simple">
                <div class="radar-loader"></div>
                <div id="loadingText">${message}</div>
            </div>
        `;
        loadingEl.style.display = 'flex';
    }
}

// CSS untuk radar (bisa dipindahkan ke file CSS terpisah)
function injectRadarStyles() {
    if (document.getElementById('radar-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'radar-styles';
    style.textContent = `
        .radar-container {
            position: fixed;
            top: 70px;
            left: 0;
            width: 100%;
            height: calc(100% - 70px - 60px);
            background: linear-gradient(135deg, #ff6b35 0%, #ff8e53 100%);
            display: none;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 85;
        }
        
        .radar-simple {
            width: 200px;
            height: 200px;
            border-radius: 50%;
            border: 2px solid rgba(255, 255, 255, 0.2);
            position: relative;
            overflow: hidden;
        }
        
        .radar-scan {
            width: 100%;
            height: 100%;
            background: conic-gradient(transparent, #ffffff);
            border-radius: 50%;
            animation: radarSpin 2s linear infinite;
        }
        
        .radar-center {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 20px;
            height: 20px;
            background: #ffffff;
            border-radius: 50%;
            box-shadow: 0 0 20px #ffffff;
        }
        
        .radar-dot {
            position: absolute;
            width: 8px;
            height: 8px;
            background: #ffffff;
            border-radius: 50%;
            opacity: 0;
            transition: opacity 0.3s;
        }
        
        .radar-dot-1 { top: 30%; left: 40%; }
        .radar-dot-2 { top: 60%; left: 70%; }
        .radar-dot-3 { top: 40%; left: 20%; }
        
        #radarText {
            margin-top: 40px;
            text-align: center;
            color: white;
            font-family: 'Segoe UI', Arial, sans-serif;
            max-width: 300px;
        }
        
        #radarText h2 {
            margin: 0 0 10px 0;
            font-size: 1.5rem;
            font-weight: 300;
        }
        
        #radarSubtitle {
            margin: 0;
            font-size: 0.9rem;
            opacity: 0.8;
        }
        
        .loading-radar-simple {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        
        .radar-loader {
            width: 60px;
            height: 60px;
            border: 3px solid rgba(255, 255, 255, 0.3);
            border-top: 3px solid #ffffff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes radarSpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    
    document.head.appendChild(style);
}

// Inisialisasi radar system
function initRadarSystem() {
    console.log('🚀 Menginisialisasi sistem radar...');
    injectRadarStyles();
    createRadarContainer();
}