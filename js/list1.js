// ==================== FUNGSI CALLBACK UNTUK GOOGLE MAPS API ====================

function initApp() {
  console.log('✅ Google Maps API berhasil di-load');
  // Inisialisasi Firebase setelah Google Maps siap
  initializeFirebase();
  // Panggil fungsi inisialisasi aplikasi
  initJeGoApp();
}

// ==================== KONFIGURASI FIREBASE ====================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDpGc_CsbNi1igA29n6qDhcX0oDkHNVscc",
  authDomain: "game-balap-simpel.firebaseapp.com",
  databaseURL: "https://game-balap-simpel-default-rtdb.firebaseio.com",
  projectId: "game-balap-simpel",
  storageBucket: "game-balap-simpel.firebasestorage.app",
  messagingSenderId: "864576853495",
  appId: "1:864576853495:web:6f16eb757fd3d8affb0af2",
  measurementId: "G-YWJPK7Y3J4"
};

// Initialize Firebase dengan error handling yang lebih baik
let database;
let auth;
let firebaseApp;

// ==================== OPTIMASI PERFORMANCE FIREBASE ====================
console.log('⚡ Mengaktifkan optimasi performance Firebase');

// 1. Batasi jumlah operasi Firebase
const MAX_FIREBASE_OPS_PER_MINUTE = 30;
let firebaseOpsCount = 0;
let firebaseOpsResetTime = Date.now();

function checkFirebaseRateLimit() {
    const now = Date.now();
    if (now - firebaseOpsResetTime > 60000) {
        firebaseOpsCount = 0;
        firebaseOpsResetTime = now;
    }
    
    if (firebaseOpsCount >= MAX_FIREBASE_OPS_PER_MINUTE) {
        console.warn('⚠️ Firebase rate limit reached, delaying operation');
        return false;
    }
    
    firebaseOpsCount++;
    console.log(`📊 Firebase ops count: ${firebaseOpsCount}/${MAX_FIREBASE_OPS_PER_MINUTE}`);
    return true;
}

// 2. Batch update untuk status
let statusUpdateBatch = [];
let isProcessingBatch = false;
let batchProcessingTimeout = null;

function addToStatusBatch(orderId, driverId, status) {
    statusUpdateBatch.push({
        orderId,
        driverId, 
        status,
        timestamp: new Date().toISOString()
    });
    
    console.log(`📦 Status masuk batch: ${status} (total: ${statusUpdateBatch.length})`);
    
    if (!batchProcessingTimeout) {
        batchProcessingTimeout = setTimeout(processStatusBatch, 2000);
    }
    
    if (statusUpdateBatch.length >= 10) {
        processStatusBatch();
    }
}

function processStatusBatch() {
    if (isProcessingBatch || statusUpdateBatch.length === 0) {
        if (batchProcessingTimeout) {
            clearTimeout(batchProcessingTimeout);
            batchProcessingTimeout = null;
        }
        return;
    }
    
    isProcessingBatch = true;
    const batchToProcess = [...statusUpdateBatch];
    statusUpdateBatch = [];
    
    if (batchProcessingTimeout) {
        clearTimeout(batchProcessingTimeout);
        batchProcessingTimeout = null;
    }
    
    console.log(`🔄 Processing batch: ${batchToProcess.length} status updates`);
    
    const updatePromises = batchToProcess.map(item => {
        if (!checkFirebaseRateLimit()) {
            return new Promise((resolve) => {
                setTimeout(() => resolve(true), 100);
            });
        }
        
        const offerRef = database.ref(`orders/${item.orderId}/driver_offers/${item.driverId}`);
        return offerRef.update({
            status: item.status,
            status_updated_at: item.timestamp
        }).then(() => {
            console.log(`✅ Status ${item.orderId} diupdate: ${item.status}`);
            sendStatusNotificationToDriver(item.orderId, item.driverId, item.status);
            return true;
        }).catch(error => {
            console.error(`❌ Gagal update status ${item.orderId}:`, error);
            return false;
        });
    });
    
    Promise.all(updatePromises)
        .then(() => {
            console.log(`✅ ${batchToProcess.length} status update selesai`);
            isProcessingBatch = false;
            
            if (statusUpdateBatch.length > 0) {
                batchProcessingTimeout = setTimeout(processStatusBatch, 1000);
            }
        })
        .catch(error => {
            console.error('❌ Error batch update:', error);
            isProcessingBatch = false;
            
            if (statusUpdateBatch.length > 0) {
                batchProcessingTimeout = setTimeout(processStatusBatch, 2000);
            }
        });
}

// ==================== SISTEM LOADING STATUS YANG DIPERBAIKI ====================
// Hanya 5 state yang diperlukan sesuai aturan
let loadingStates = {
    firebase: false,
    gps: false,
    orders: false,
    driverData: false,
    appInitialized: false
};

let loadingTimeout = null;
let isFirstLoad = true;
let firebaseRetryCount = 0;
const MAX_FIREBASE_RETRY = 3;

// Failsafe: force close loading setelah 15 detik
let loadingFailsafeTimeout = null;

function checkAllLoadingComplete() {
    console.log('🔍 Mengecek semua loading state:', loadingStates);
    
    const allComplete = Object.values(loadingStates).every(state => state === true);
    
    if (allComplete) {
        console.log('✅ SEMUA LOADING SELESAI');
        hideLoading();
        clearLoadingTimeout();
        if (loadingFailsafeTimeout) {
            clearTimeout(loadingFailsafeTimeout);
            loadingFailsafeTimeout = null;
        }
        isFirstLoad = false;
    } else {
        console.log('⏳ Masih menunggu loading state:', 
            Object.keys(loadingStates).filter(key => !loadingStates[key]));
    }
}

function setLoadingState(key, value) {
    // Hanya izinkan key yang ada dalam loadingStates
    if (key in loadingStates) {
        loadingStates[key] = value;
        console.log(`🔄 Loading state [${key}]: ${value}`);
        checkAllLoadingComplete();
    } else {
        console.warn(`⚠️ Key loading state tidak valid: ${key}`);
    }
}

function showLoading(message = 'Menyiapkan aplikasi...') {
    const loadingEl = document.getElementById('loadingOverlay');
    
    if (loadingEl) {
        showLoadingRadar(message);
    }
    
    clearLoadingTimeout();
    loadingTimeout = setTimeout(() => {
        if (document.getElementById('loadingOverlay')?.style.display === 'flex') {
            console.log('⚠️ Loading timeout - proses terlalu lama, force close');
            hideLoading();
        }
    }, 30000);
}

function hideLoading() {
    console.log('🛑 Menyembunyikan loading overlay');
    const loadingEl = document.getElementById('loadingOverlay');
    if (loadingEl) {
        loadingEl.style.display = 'none';
        console.log('✅ Loading overlay disembunyikan');
    }
    clearLoadingTimeout();
    
    // Juga sembunyikan radar jika masih tampil
    const radarContainer = document.getElementById('radarContainer');
    if (radarContainer && radarContainer.style.display === 'flex') {
        console.log('📡 Radar tetap ditampilkan karena tidak ada order');
    }
}

function clearLoadingTimeout() {
    if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = null;
    }
}

// ==================== FUNGSI INITIALIZE FIREBASE YANG DIPERBAIKI ====================
function initializeFirebase() {
  console.log('🔄 Memulai inisialisasi Firebase...');
  showLoading('Menyambungkan ke server...');
  
  // Failsafe: force close loading setelah 15 detik
  loadingFailsafeTimeout = setTimeout(() => {
    console.log('⏰ Failsafe: Force close loading setelah 15 detik');
    setLoadingState('firebase', true);
    setLoadingState('gps', true);
    setLoadingState('driverData', true);
    setLoadingState('orders', true);
    setLoadingState('appInitialized', true);
  }, 15000);
  
  setLoadingState('firebase', false);
  
  function proceedWithFirebaseInit() {
    try {
      if (typeof firebase === 'undefined') {
        console.warn('⚠️ Firebase SDK belum terload');
        
        if (firebaseRetryCount < MAX_FIREBASE_RETRY) {
          firebaseRetryCount++;
          console.log(`🔄 Coba lagi Firebase (percobaan ${firebaseRetryCount}/${MAX_FIREBASE_RETRY})...`);
          
          setTimeout(() => {
            if (typeof firebase !== 'undefined') {
              console.log('✅ Firebase SDK sekarang tersedia, melanjutkan...');
              proceedWithFirebaseInit();
            } else {
              proceedWithFirebaseInit();
            }
          }, 2000);
          return false;
        } else {
          console.error('❌ Firebase SDK tidak terload setelah beberapa percobaan');
          // Tetap set true meskipun gagal
          setLoadingState('firebase', true);
          return false;
        }
      }
      
      if (!firebase.apps.length) {
        firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
      } else {
        firebaseApp = firebase.app();
      }
      
      database = firebase.database();
      auth = firebase.auth();
      
      console.log('✅ Firebase berhasil diinisialisasi');
      setLoadingState('firebase', true);
      
      testFirebaseConnection();
      
      return true;
      
    } catch (error) {
      console.error('❌ Error saat inisialisasi Firebase app:', error);
      
      if (firebaseRetryCount < MAX_FIREBASE_RETRY) {
        firebaseRetryCount++;
        console.log(`🔄 Retry inisialisasi Firebase (percobaan ${firebaseRetryCount}/${MAX_FIREBASE_RETRY})...`);
        
        setTimeout(() => {
          proceedWithFirebaseInit();
        }, 3000);
        return false;
      } else {
        console.error('❌ Firebase gagal diinisialisasi setelah beberapa percobaan');
        // Tetap set true meskipun gagal
        setLoadingState('firebase', true);
        return false;
      }
    }
  }
  
  return proceedWithFirebaseInit();
}

function testFirebaseConnection() {
  if (!database) {
    console.log('❌ Database tidak tersedia untuk test koneksi');
    return;
  }
  
  console.log('🔍 Testing koneksi Firebase...');
  
  const testRef = database.ref('.info/connected');
  
  testRef.once('value').then((snapshot) => {
    const connected = snapshot.val();
    if (connected) {
      console.log('✅ Koneksi Firebase aktif');
    } else {
      console.log('⚠️ Koneksi Firebase terputus');
    }
  }, (error) => {
    console.error('❌ Error test koneksi Firebase:', error);
  });
}

// ==================== FUNGSI BARU: SISTEM USER DATA MANAGEMENT ====================

let userDataRefreshInterval = null;
let currentUserData = null;

function getDriverData() {
    console.log("🔍 [DEBUG] Memulai getDriverData");
    
    try {
        const loggedInDriver = localStorage.getItem('jego_logged_in_driver');
        console.log("ℹ️ [DEBUG] jego_logged_in_driver di localStorage:", loggedInDriver ? "Ada" : "Tidak ada");
        
        if (loggedInDriver) {
            const driverData = JSON.parse(loggedInDriver);
            console.log("✅ [DEBUG] Driver data ditemukan dari loginDriver.html:", {
                name: driverData.name || driverData.fullName,
                phone: driverData.phone,
                uid: driverData.uid,
                status: driverData.status
            });
            
            const mappedDriverData = {
                firebase_key: driverData.uid || driverData.userId,
                uid: driverData.uid || driverData.userId,
                key: driverData.uid || driverData.userId,
                driverId: driverData.uid || driverData.userId,
                name: driverData.name || driverData.fullName,
                fullName: driverData.name || driverData.fullName,
                phone: driverData.phone,
                phoneNumber: driverData.phone,
                email: driverData.email || '',
                address: driverData.address || '',
                rating: driverData.rating || 5,
                perjalanan: driverData.perjalanan || 0,
                avgRating: driverData.rating || 5,
                totalTrips: driverData.perjalanan || 0,
                fotoProfilURL: driverData.fotoProfilURL || '',
                fotoProfilStorage: 'default',
                profilePhotoUrl: driverData.fotoProfilURL || '',
                vehicle_type: driverData.vehicleType || '',
                vehicle_brand: driverData.vehicleBrand || '',
                plate_number: driverData.plateNumber || '',
                vehicleType: driverData.vehicleType || '',
                vehicleBrand: driverData.vehicleBrand || '',
                plateNumber: driverData.plateNumber || '',
                status: driverData.status || 'pending',
                role: 'driver',
                driverStatus: driverData.driverStatus || driverData.status || 'pending',
                createdAt: driverData.createdAt || new Date().toISOString(),
                last_updated: new Date().toISOString(),
                ...driverData
            };
            
            console.log("✅ [DEBUG] Driver data berhasil diparsing");
            return mappedDriverData;
        }
        
        const legacyData = localStorage.getItem('jeggo_logged_in_driver');
        if (legacyData) {
            console.log("⚠️ [DEBUG] Menggunakan fallback: jeggo_logged_in_driver");
            const driverData = JSON.parse(legacyData);
            return driverData;
        }
        
    } catch (error) {
        console.error('❌ [DEBUG] Error mengambil data driver:', error);
    }
    
    console.log("❌ [DEBUG] Tidak ada data driver ditemukan di localStorage");
    return null;
}

async function fetchLatestDriverData(driverKey) {
  if (!driverKey) {
    console.error("Driver key tidak tersedia untuk fetchLatestDriverData");
    return currentUserData;
  }
  
  try {
    console.log("🔍 [DEBUG] Memulai fetchLatestDriverData untuk key:", driverKey);
    const driverRef = database.ref('drivers/' + driverKey);
    const snapshot = await driverRef.once('value');
    const latestDriverData = snapshot.val();
    
    if (!latestDriverData) {
      console.error("Data driver tidak ditemukan di Firebase untuk key:", driverKey);
      return currentUserData;
    }
    
    console.log("🔍 [DEBUG] Data terbaru dari Firebase:", {
      avg_rating: latestDriverData.avg_rating,
      total_trips: latestDriverData.total_trips,
      name: latestDriverData.fullName
    });
    
    const updatedDriverData = {
      ...currentUserData,
      ...latestDriverData,
      driverId: driverKey,
      avgRating: latestDriverData.avg_rating || currentUserData.avgRating,
      totalTrips: latestDriverData.total_trips || currentUserData.totalTrips,
      last_updated_from_firebase: new Date().toISOString()
    };
    
    try {
      localStorage.setItem('jego_logged_in_driver', JSON.stringify(updatedDriverData));
      
      const jegoDrivers = JSON.parse(localStorage.getItem('jego_drivers')) || {};
      if (driverKey in jegoDrivers) {
        jegoDrivers[driverKey] = updatedDriverData;
        localStorage.setItem('jego_drivers', JSON.stringify(jegoDrivers));
      }
    } catch (e) {
      console.warn('Gagal update localStorage:', e);
    }
    
    console.log("✅ [DEBUG] Driver data diperbarui dari Firebase. Rating baru:", updatedDriverData.avgRating);
    return updatedDriverData;
    
  } catch (error) {
    console.error("❌ [DEBUG] Gagal mengambil data terbaru dari Firebase:", error);
    return currentUserData;
  }
}

function startDriverDataRefresh() {
  if (userDataRefreshInterval) {
    clearInterval(userDataRefreshInterval);
  }
  
  userDataRefreshInterval = setInterval(async () => {
    if (currentUserData && currentUserData.driverId) {
      console.log("🔄 [DEBUG] Auto-refresh driver data dari Firebase...");
      currentUserData = await fetchLatestDriverData(currentUserData.driverId);
    }
  }, 60000);
}

function stopDriverDataRefresh() {
  if (userDataRefreshInterval) {
    clearInterval(userDataRefreshInterval);
    userDataRefreshInterval = null;
  }
}

function checkIfDriverLoggedIn() {
    console.log("🔍 [DEBUG] Memeriksa status login driver...");
    
    const loggedInDriver = localStorage.getItem('jego_logged_in_driver');
    
    if (loggedInDriver) {
        try {
            const driverData = JSON.parse(loggedInDriver);
            const status = driverData.status || 'pending';
            
            if (status === 'accepted' || status === 'approved' || status === 'active') {
                console.log("✅ [DEBUG] Driver sudah login (aktif):", driverData.name || driverData.fullName);
                return true;
            } else if (status === 'pending') {
                console.log("⚠️ [DEBUG] Driver login tapi status pending, tetap izinkan akses");
                return true;
            } else {
                console.log("❌ [DEBUG] Driver login tapi status tidak aktif:", status);
                return false;
            }
        } catch (error) {
            console.error('❌ [DEBUG] Error parsing logged in driver:', error);
        }
    }
    
    if (auth && auth.currentUser) {
        console.log("✅ [DEBUG] Driver login via Firebase Auth");
        return true;
    }
    
    console.log("❌ [DEBUG] Driver belum login");
    return false;
}

// ==================== FUNGSI POPUP CUSTOM ====================

function showPopup(message, title = "Pemberitahuan", type = "info") {
  const popupOverlay = document.getElementById('popupOverlay');
  const popupTitle = document.getElementById('popupTitle');
  const popupMessage = document.getElementById('popupMessage');
  const popupIcon = document.getElementById('popupIcon');
  const popupButton = document.getElementById('popupButton');
  
  if (!popupOverlay || !popupTitle || !popupMessage || !popupIcon || !popupButton) {
    console.error('❌ Element popup tidak ditemukan');
    alert(`${title}: ${message}`);
    return;
  }
  
  try {
    popupTitle.textContent = title;
    popupMessage.textContent = message;
    
    switch(type) {
      case "success":
        popupIcon.textContent = "✅";
        popupButton.className = "popup-button popup-button-primary";
        break;
      case "warning":
        popupIcon.textContent = "⚠️";
        popupButton.className = "popup-button popup-button-warning";
        break;
      case "error":
        popupIcon.textContent = "❌";
        popupButton.className = "popup-button popup-button-danger";
        break;
      case "info":
      default:
        popupIcon.textContent = "ℹ️";
        popupButton.className = "popup-button popup-button-primary";
        break;
    }
    
    popupOverlay.style.display = 'flex';
    setTimeout(() => {
      popupOverlay.classList.add('active');
    }, 10);
    
  } catch (error) {
    console.error('❌ Error menampilkan popup:', error);
    alert(`${title}: ${message}`);
  }
}

function closePopup() {
  const popupOverlay = document.getElementById('popupOverlay');
  popupOverlay.style.display = 'none';
  popupOverlay.classList.remove('active');
}

// ==================== FUNGSI AUDIO YANG DIPERBARUI ====================
function playNewOrderSound() {
    try {
        console.log('🔊 Memutar suara order baru');
        const audio = new Audio('https://raw.githubusercontent.com/ojekaGorontalo/Assets/main/orderterbaru.mp3');
        audio.play().catch(e => console.log('Gagal memutar suara order baru:', e));
    } catch (error) {
        console.error('Error memutar suara order baru:', error);
    }
}

function playAutobidSound() {
    try {
        console.log('🔊 Memutar suara autobid');
        const audio = new Audio('https://raw.githubusercontent.com/ojekaGorontalo/Assets/main/audioautobid.mp3');
        audio.play().catch(e => console.log('Gagal memutar suara autobid:', e));
    } catch (error) {
        console.error('Error memutar suara autobid:', error);
    }
}

function playManualPopupSound() {
    try {
        console.log('🔊 Memutar suara popup manual');
        const audio = new Audio('https://raw.githubusercontent.com/ojekaGorontalo/Assets/main/audiopopupmanual.mp3');
        audio.play().catch(e => console.log('Gagal memutar suara popup manual:', e));
    } catch (error) {
        console.error('Error memutar suara popup manual:', error);
    }
}

function playOrderAcceptedSound() {
    try {
        console.log('🔊 Memutar suara order diterima');
        const audio = new Audio('https://raw.githubusercontent.com/ojekaGorontalo/Assets/main/audioorderaccepted.mp3');
        audio.play().catch(e => console.log('Gagal memutar suara order diterima:', e));
        
        // Redirect ke orderAccepted.html
        setTimeout(() => {
            window.location.href = 'orderAccepted.html';
        }, 1500);
        
    } catch (error) {
        console.error('Error memutar suara order diterima:', error);
        // Tetap redirect meskipun audio gagal
        setTimeout(() => {
            window.location.href = 'orderAccepted.html';
        }, 500);
    }
}

// Fungsi untuk mengirim data ke Kodular (disederhanakan, hanya untuk logging)
function sendToKodular(data) {
    console.log('📝 Data logging (tidak dikirim ke Kodular):', data);
    return false;
}

function getCustomerPhoto(order) {
    if (order.user_foto_profil && order.user_foto_profil !== '') {
        return order.user_foto_profil;
    } else if (order.user_data?.fotoProfilURL && order.user_data.fotoProfilURL !== '') {
        return order.user_data.fotoProfilURL;
    } else if (order.user_snapshot?.fotoProfilURL && order.user_snapshot.fotoProfilURL !== '') {
        return order.user_snapshot.fotoProfilURL;
    } else {
        return 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
    }
}

function formatTimeAgo(created_at) {
    if (!created_at) return 'Baru saja';
    
    const orderTime = new Date(created_at);
    const now = new Date();
    const diffInSeconds = Math.floor((now - orderTime) / 1000);
    
    if (diffInSeconds < 60) {
        return 'Baru saja';
    } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes} menit`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} jam`;
    } else {
        const days = Math.floor(diffInSeconds / 86400);
        return `${days} hari`;
    }
}

function canSystemProcessOrder(source) {
    if (source === "manual") {
        console.log("✅ Validasi: Source MANUAL - diizinkan");
        return true;
    } else if (source === "auto") {
        const isAllowed = locationTrackingEnabled;
        console.log(`✅ Validasi: Source AUTO - Tracking ${locationTrackingEnabled ? 'ON' : 'OFF'} -> ${isAllowed ? 'diizinkan' : 'ditolak'}`);
        return isAllowed;
    }
    return false;
}

function checkLoginStatus() {
    if (!checkIfDriverLoggedIn()) {
        console.log('❌ Driver belum login atau tidak aktif, redirect ke login');
        
        showPopup('Anda belum login atau akun tidak aktif. Aplikasi akan membuka halaman login.', 'Perhatian', 'warning');
        
        setTimeout(() => {
            window.location.href = 'loginDriver.html';
        }, 2000);
        
        return false;
    }
    
    const driverData = getDriverData();
    if (driverData && driverData.status === 'pending') {
        console.log('⚠️ Driver baru mendaftar, status pending. Menunggu verifikasi admin.');
        
        showPopup(
            'Pendaftaran Anda sedang diverifikasi oleh admin. Anda dapat melihat order tetapi belum dapat mengambil order hingga verifikasi selesai (1-2 hari kerja).', 
            'Menunggu Verifikasi', 
            'info'
        );
        
        return true;
    }
    
    return true;
}

// ==================== VARIABEL GLOBAL ====================
let ordersRef = null;
let ordersListener = null;
let modalMap = null;
let directionsService = null;
let directionsRenderer = null;
let currentSelectedOrder = null;
let countdownInterval = null;
let offerListenerRef = null;
let offerListener = null;
let currentDriverId = null;
let currentFilter = 'all';
let currentDriverData = null;
let autobidEnabled = false;
let autobidInterval = null;
let isAutobidProcessing = false;

let driverLocation = {
    latitude: null,
    longitude: null,
    accuracy: null,
    lastUpdated: null
};

let locationWatchId = null;
let processedOrders = new Set();
let isAutobidModal = false;
let activeOrderListenerRef = null;
let activeOrderListener = null;

let locationTrackingEnabled = false;
let locationTrackingInterval = null;

let lastSentOrdersCount = null;
let lastSentOrdersHash = null;
let isInitialLoad = true;

let autobidProgressInterval = null;
let autobidProgressTimeLeft = 30;

let currentDriverBalance = 0;
let balanceListener = null;

let manualCheckInterval = null;

let acceptKurirEnabled = true;
let customRadius = 1.0;
let filterTujuanEnabled = false;
let filterTujuanText = '';
let filterTujuanData = null;

// ==================== FUNGSI RADAR ANIMASI ====================

// Fungsi untuk menampilkan/menyembunyikan radar berdasarkan jumlah order
function toggleRadarAnimation(ordersCount) {
    const radarContainer = document.getElementById('radarContainer');
    const ordersList = document.getElementById('ordersList');
    
    if (!radarContainer) {
        // Buat container radar jika belum ada
        createRadarContainer();
        return toggleRadarAnimation(ordersCount);
    }
    
    console.log(`📊 Toggle radar: ${ordersCount} order ditemukan`);
    
    if (ordersCount === 0) {
        // Tampilkan radar full screen
        radarContainer.style.display = 'flex';
        ordersList.style.display = 'none';
        
        // Aktifkan animasi radar
        startRadarAnimation();
        
        console.log('📡 Radar aktif - Mencari order...');
    } else {
        // Sembunyikan radar
        radarContainer.style.display = 'none';
        ordersList.style.display = 'block';
        
        // Hentikan animasi radar
        stopRadarAnimation();
        
        console.log('✅ Radar nonaktif - Order ditemukan');
    }
}

// Fungsi untuk membuat container radar - DIKOREKSI
function createRadarContainer() {
    const container = document.createElement('div');
    container.id = 'radarContainer';
    container.style.cssText = `
        position: fixed;
        top: 70px; /* Mulai dari bawah header */
        left: 0;
        width: 100%;
        height: calc(100% - 70px - 60px); /* Header 70px + Bottom Nav 60px */
        background: linear-gradient(135deg, #ff6b35 0%, #ff8e53 100%);
        display: none;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 85; /* DIBAWAH HEADER (100) */
    `;
    
    // Tambahkan elemen radar
    container.innerHTML = `
        <div class="radar-wrapper" style="
            position: relative;
            width: 300px;
            height: 300px;
            margin: 0 auto;
        ">
            <!-- Lingkaran radar -->
            <div class="radar-circle" style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 250px;
                height: 250px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                box-shadow: 0 0 20px rgba(255, 255, 255, 0.1);
            "></div>
            
            <div class="radar-circle" style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 180px;
                height: 180px;
                border: 2px solid rgba(255, 255, 255, 0.2);
                border-radius: 50%;
            "></div>
            
            <div class="radar-circle" style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 110px;
                height: 110px;
                border: 2px solid rgba(255, 255, 255, 0.1);
                border-radius: 50%;
            "></div>
            
            <!-- Sinyal radar (garis berputar) -->
            <div class="radar-sweep" style="
                position: absolute;
                top: 50%;
                left: 50%;
                width: 150px;
                height: 150px;
                transform-origin: 0 0;
                transform: rotate(45deg);
            ">
                <div class="radar-line" style="
                    width: 150px;
                    height: 2px;
                    background: linear-gradient(90deg, transparent, #ffffff);
                    box-shadow: 0 0 10px #ffffff;
                    transform-origin: 0 0;
                "></div>
            </div>
            
            <!-- Titik tengah radar -->
            <div class="radar-center" style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 20px;
                height: 20px;
                background: #ffffff;
                border-radius: 50%;
                box-shadow: 0 0 20px #ffffff;
            "></div>
            
            <!-- Titik-titik acak untuk efek pencarian -->
            <div class="radar-dot" style="
                position: absolute;
                top: 30%;
                left: 40%;
                width: 8px;
                height: 8px;
                background: #ffffff;
                border-radius: 50%;
                opacity: 0;
                animation: pulseDot 2s infinite;
            "></div>
            
            <div class="radar-dot" style="
                position: absolute;
                top: 60%;
                left: 70%;
                width: 8px;
                height: 8px;
                background: #ffffff;
                border-radius: 50%;
                opacity: 0;
                animation: pulseDot 2s infinite 0.5s;
            "></div>
            
            <div class="radar-dot" style="
                position: absolute;
                top: 40%;
                left: 20%;
                width: 8px;
                height: 8px;
                background: #ffffff;
                border-radius: 50%;
                opacity: 0;
                animation: pulseDot 2s infinite 1s;
            "></div>
        </div>
        
        <!-- Teks status -->
        <div id="radarText" style="
            margin-top: 40px;
            text-align: center;
            color: white;
            font-family: 'Segoe UI', Arial, sans-serif;
        ">
            <h2 style="margin: 0 0 10px 0; font-size: 1.5rem; font-weight: 300;">
                Mencari order di sekitar...
            </h2>
        </div>
    `;
    
    // Tambahkan style animasi
    const style = document.createElement('style');
    style.textContent = `
        @keyframes radarSpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        @keyframes pulseDot {
            0% { opacity: 0; transform: scale(0.5); }
            50% { opacity: 1; transform: scale(1); }
            100% { opacity: 0; transform: scale(0.5); }
        }
        
        @keyframes radarPulse {
            0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4); }
            70% { box-shadow: 0 0 0 20px rgba(255, 255, 255, 0); }
            100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
        }
        
        .radar-sweep {
            animation: radarSpin 3s linear infinite;
        }
        
        .radar-center {
            animation: radarPulse 2s infinite;
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(container);
}

// Fungsi untuk memulai animasi radar
function startRadarAnimation() {
    console.log('🔄 Memulai animasi radar...');
}

// Fungsi untuk menghentikan animasi radar
function stopRadarAnimation() {
    console.log('⏹️ Menghentikan animasi radar');
}

// ==================== FUNGSI PERHITUNGAN HARGA DENGAN DISKON ====================
function calculateDiscountedPrice(order) {
    if (!order.diskon_persen || order.diskon_persen === 0) {
        return {
            hargaAsal: order.harga_total,
            hargaDiskon: order.harga_total,
            hasDiscount: false,
            diskonAmount: 0
        };
    }
    
    const hargaAsal = order.harga_asal || order.harga_total;
    const diskonAmount = Math.round(hargaAsal * (order.diskon_persen / 100));
    const hargaDiskon = Math.max(hargaAsal - diskonAmount, order.min_price || 10000);
    
    console.log(`💰 Perhitungan diskon: ${hargaAsal} - ${diskonAmount} (${order.diskon_persen}%) = ${hargaDiskon}`);
    
    return {
        hargaAsal: hargaAsal,
        hargaDiskon: hargaDiskon,
        hasDiscount: true,
        diskonAmount: diskonAmount
    };
}

// ==================== FUNGSI NAVIGASI BOTTOM NAV YANG DIPERBAIKI ====================
function navigateToScreen(screen) {
    console.log(`🔍 Navigasi ke screen: ${screen}`);
    
    updateActiveNavItem(screen);
    
    // Redirect langsung ke HTML
    switch(screen) {
        case 'home':
            window.location.href = 'index.html';
            break;
        case 'history':
            window.location.href = 'history.html';
            break;
        case 'balance':
            window.location.href = 'balance.html';
            break;
        case 'profile':
            window.location.href = 'profile.html';
            break;
        case 'active_order':
            window.location.href = 'orderAccepted.html';
            break;
        default:
            console.log(`⚠️ Screen ${screen} tidak dikenali`);
            showPopup(`Navigasi ke ${screen}`, 'Info', 'info');
            break;
    }
}

function updateActiveNavItem(screen) {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        if (item.dataset.screen === screen) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

function updateActiveOrderBadge(hasActiveOrder) {
    const badge = document.getElementById('activeOrderBadge');
    if (badge) {
        badge.style.display = hasActiveOrder ? 'flex' : 'none';
    }
}

// ==================== FUNGSI MANUAL CHECK INTERVAL BARU ====================
function startManualCheckInterval() {
    console.log('🔍 Memulai interval pemindaian manual (OPTIMIZED)...');
    
    stopManualCheckInterval();
    
    manualCheckInterval = setInterval(() => {
        if (locationTrackingEnabled && !autobidEnabled && 
            driverLocation.latitude && driverLocation.longitude) {
            checkOrdersForManualPopup();
        }
    }, 15000);
}

function stopManualCheckInterval() {
    if (manualCheckInterval) {
        clearInterval(manualCheckInterval);
        manualCheckInterval = null;
        console.log('🛑 Menghentikan interval pemindaian manual');
    }
}

// ==================== FUNGSI TOGGLE LOCATION TRACKING YANG DIPERBARUI ====================
function toggleLocationTracking() {
    if (!database) {
        showPopup('Tidak terhubung ke server. Periksa koneksi internet Anda.', 'Koneksi Error', 'error');
        return;
    }

    locationTrackingEnabled = !locationTrackingEnabled;
    updateLocationToggleButton();
    
    updateAutobidToggleStatus();
    
    if (locationTrackingEnabled) {
        if (!driverLocation.latitude || !driverLocation.longitude) {
            showPopup('GPS diperlukan untuk mengaktifkan tracking. Pastikan lokasi Anda aktif.', 'GPS Error', 'warning');
            locationTrackingEnabled = false;
            updateLocationToggleButton();
            updateAutobidToggleStatus();
            return;
        }
        
        startLocationTracking();
        
        if (!autobidEnabled) {
            startManualCheckInterval();
            setTimeout(() => {
                checkOrdersForManualPopup();
            }, 1000);
        }
        
    } else {
        if (autobidEnabled) {
            autobidEnabled = false;
            stopAutobid();
            updateAutobidButton();
        }
        
        stopLocationTracking();
        stopManualCheckInterval();
    }
    
    localStorage.setItem('jego_location_tracking_enabled', locationTrackingEnabled);
}

function updateAutobidToggleStatus() {
    const autobidToggle = document.getElementById('autobidToggle');
    if (autobidToggle) {
        if (locationTrackingEnabled) {
            autobidToggle.disabled = false;
            autobidToggle.parentElement.style.opacity = '1';
        } else {
            autobidToggle.disabled = true;
            autobidToggle.parentElement.style.opacity = '0.5';
        }
    }
}

function updateLocationToggleButton() {
    const locationToggleBtn = document.getElementById('locationToggleBtn');
    if (locationTrackingEnabled) {
        locationToggleBtn.innerHTML = '<span>📍</span> ON';
        locationToggleBtn.classList.add('active');
    } else {
        locationToggleBtn.innerHTML = '<span>📍</span> OFF';
        locationToggleBtn.classList.remove('active');
    }
}

function startLocationTracking() {
    console.log('📍 Memulai location tracking (OPTIMIZED)...');
    
    sendLocationToFirebase();
    
    locationTrackingInterval = setInterval(() => {
        if (locationTrackingEnabled) {
            sendLocationToFirebase();
        }
    }, 30000);
}

function stopLocationTracking() {
    console.log('🛑 Menghentikan location tracking...');
    if (locationTrackingInterval) {
        clearInterval(locationTrackingInterval);
        locationTrackingInterval = null;
    }
    
    if (currentDriverData && currentDriverData.driverId) {
        const driverId = currentDriverData.driverId;
        
        if (!checkFirebaseRateLimit()) {
            console.log('⏸️ Rate limit, delay update offline status');
            setTimeout(() => {
                database.ref('drivers/' + driverId).update({
                    latitude: null,
                    longitude: null,
                    online: false,
                    tracking_enabled: false
                })
                .then(() => {
                    console.log('✅ Status driver diupdate ke offline dan lokasi dihapus');
                })
                .catch(error => {
                    console.error('❌ Gagal mengupdate status online:', error);
                });
            }, 2000);
            return;
        }
        
        database.ref('drivers/' + driverId).update({
            latitude: null,
            longitude: null,
            online: false,
            tracking_enabled: false
        })
        .then(() => {
            console.log('✅ Status driver diupdate ke offline dan lokasi dihapus');
        })
        .catch(error => {
            console.error('❌ Gagal mengupdate status online:', error);
        });
    }
}

function sendLocationToFirebase() {
    if (!currentDriverData || !currentDriverData.driverId) {
        console.log('❌ Tidak ada data driver untuk mengirim lokasi');
        return;
    }
    
    if (!driverLocation.latitude || !driverLocation.longitude) {
        console.log('❌ Tidak ada data lokasi untuk dikirim');
        return;
    }
    
    if (!checkFirebaseRateLimit()) {
        console.log('⏸️ Rate limit, delay location update');
        return;
    }
    
    const driverId = currentDriverData.driverId;
    
    const locationUpdate = {
        latitude: driverLocation.latitude,
        longitude: driverLocation.longitude,
        accuracy: driverLocation.accuracy,
        last_updated: new Date().toISOString(),
        online: true,
        tracking_enabled: true
    };
    
    database.ref('drivers/' + driverId).update(locationUpdate)
        .then(() => {
            console.log('✅ Lokasi driver dikirim ke Firebase');
        })
        .catch(error => {
            console.error('❌ Gagal mengirim lokasi ke Firebase:', error);
        });
}

// ==================== FUNGSI UNTUK MENU LAYOUT ====================
function openSidebar() {
    document.getElementById('sidebar').style.display = 'block';
    loadSettingsToUI();
    updateStatusInfo();
}

function closeSidebar() {
    document.getElementById('sidebar').style.display = 'none';
}

function loadSettingsToUI() {
    console.log('🔍 Memuat pengaturan ke UI...');
    
    const savedAcceptKurir = localStorage.getItem('jego_accept_kurir');
    const savedRadius = localStorage.getItem('jego_custom_radius');
    const savedFilterTujuan = localStorage.getItem('jego_filter_tujuan');
    
    console.log('🔍 Nilai savedAcceptKurir dari localStorage:', savedAcceptKurir);
    
    if (savedAcceptKurir !== null) {
        acceptKurirEnabled = savedAcceptKurir === 'true';
    } else {
        acceptKurirEnabled = true;
    }
    
    console.log('✅ acceptKurirEnabled setelah parsing:', acceptKurirEnabled);
    
    document.getElementById('autobidToggle').checked = autobidEnabled;
    document.getElementById('acceptKurirToggle').checked = acceptKurirEnabled;
    document.getElementById('radiusInput').value = customRadius = savedRadius ? parseFloat(savedRadius) : 1.0;
    
    if (savedFilterTujuan) {
        const filterData = JSON.parse(savedFilterTujuan);
        document.getElementById('filterTujuanInput').value = filterTujuanText = filterData.text || '';
    }
    
    updateAutobidToggleStatus();
}

function saveSettings() {
    console.log('💾 Menyimpan pengaturan...');
    
    try {
        acceptKurirEnabled = document.getElementById('acceptKurirToggle').checked;
        customRadius = parseFloat(document.getElementById('radiusInput').value);
        filterTujuanText = document.getElementById('filterTujuanInput').value;
        
        if (isNaN(customRadius) || customRadius < 0.1 || customRadius > 10) {
            showPopup('Jarak radius harus antara 0.1 - 10 km', 'Validasi Error', 'warning');
            document.getElementById('radiusInput').value = 1.0;
            customRadius = 1.0;
            return;
        }
        
        console.log('✅ Pengaturan yang akan disimpan:');
        console.log('- acceptKurirEnabled:', acceptKurirEnabled);
        console.log('- customRadius:', customRadius);
        console.log('- filterTujuanText:', filterTujuanText);
        
        localStorage.setItem('jego_accept_kurir', acceptKurirEnabled);
        localStorage.setItem('jego_custom_radius', customRadius);
        localStorage.setItem('jego_filter_tujuan', JSON.stringify({
            text: filterTujuanText,
            enabled: filterTujuanEnabled
        }));
        
        console.log('✅ Pengaturan disimpan ke localStorage');
        
        if (autobidEnabled) {
            updateAutobidButton();
        }
        
        loadOrders();
        
        closeSidebar();
        
        showPopup('Pengaturan berhasil disimpan dan diterapkan', 'Sukses', 'success');
        
    } catch (error) {
        console.error('❌ Error menyimpan pengaturan:', error);
        showPopup('Gagal menyimpan pengaturan. Silakan coba lagi.', 'Error', 'error');
    }
}

function updateStatusInfo() {
    document.getElementById('gpsStatusInfo').textContent = 
        driverLocation.latitude ? 'Aktif' : 'Tidak aktif';
    document.getElementById('gpsStatusInfo').style.color = 
        driverLocation.latitude ? '#28a745' : '#dc3545';
    
    document.getElementById('trackingStatusInfo').textContent = 
        locationTrackingEnabled ? 'ON' : 'OFF';
    document.getElementById('trackingStatusInfo').style.color = 
        locationTrackingEnabled ? '#28a745' : '#dc3545';
    
    document.getElementById('balanceStatusInfo').textContent = 
        `Rp ${currentDriverBalance.toLocaleString('id-ID')}`;
    document.getElementById('balanceStatusInfo').style.color = 
        currentDriverBalance > 10000 ? '#28a745' : '#ff6b6b';
}

// ==================== FUNGSI LOAD FILTER TUJUAN DARI FIREBASE ====================
function loadFilterTujuanFromFirebase() {
    if (!database) {
        console.log('❌ Database tidak tersedia untuk load filter tujuan');
        // TIDAK memanggil setLoadingState karena filterTujuan bukan bagian dari loading state
        return;
    }
    
    console.log('🔍 Memuat filter tujuan dari Firebase...');
    const filterRef = database.ref('DataJego/Filter');
    
    filterRef.once('value').then(snapshot => {
        filterTujuanData = snapshot.val();
        
        if (filterTujuanData && filterTujuanData.status === 'ON') {
            document.getElementById('filterTujuanContainer').style.display = 'block';
            
            if (currentDriverData && currentDriverData.driverId) {
                const driverId = currentDriverData.driverId;
                
                if (filterTujuanData.All === true) {
                    filterTujuanEnabled = true;
                } else if (filterTujuanData.driver_id) {
                    const allowedDrivers = filterTujuanData.driver_id.split(',').map(id => id.trim());
                    filterTujuanEnabled = allowedDrivers.includes(driverId);
                } else {
                    filterTujuanEnabled = false;
                }
                
                const filterInput = document.getElementById('filterTujuanInput');
                filterInput.disabled = !filterTujuanEnabled;
                filterInput.placeholder = filterTujuanEnabled ? 
                    'Contoh: Kota Gorontalo, Tilongkabila, Limboto' : 
                    'Tidak diizinkan untuk driver Anda';
                    
                if (!filterTujuanEnabled) {
                    document.getElementById('filterTujuanContainer').style.opacity = '0.6';
                } else {
                    document.getElementById('filterTujuanContainer').style.opacity = '1';
                }
            }
        }
        
        console.log('✅ Filter tujuan berhasil dimuat');
    }).catch(error => {
        console.error('❌ Error loading filter tujuan:', error);
    });
}

// ==================== FUNGSI NAVIGASI SIDEBAR ====================
function setupSidebarNavigation() {
    const sidebarNavButtons = document.querySelectorAll('.sidebar-nav-button');
    
    sidebarNavButtons.forEach(button => {
        button.addEventListener('click', function() {
            const screen = this.getAttribute('data-screen');
            const buttonId = this.getAttribute('id');
            const buttonTitle = this.querySelector('.sidebar-nav-button-title').textContent;
            
            console.log(`🔍 Tombol sidebar diklik: ${buttonId} (${screen})`);
            
            // Redirect langsung ke halaman HTML
            switch(screen) {
                case 'profile':
                    window.location.href = 'profile.html';
                    break;
                case 'history':
                    window.location.href = 'history.html';
                    break;
                case 'balance':
                    window.location.href = 'balance.html';
                    break;
                case 'settings':
                    window.location.href = 'settings.html';
                    break;
                case 'help':
                    window.location.href = 'help.html';
                    break;
                case 'logout':
                    // Logout logic
                    localStorage.removeItem('jego_logged_in_driver');
                    window.location.href = 'loginDriver.html';
                    break;
                default:
                    console.log(`⚠️ Screen ${screen} tidak dikenali`);
                    showPopup(`Navigasi ke "${buttonTitle}"`, 'Info', 'info');
                    break;
            }
            
            closeSidebar();
        });
    });
}

// ==================== UPDATE FUNGSI FILTER ORDER ====================
function filterOrderByType(order) {
    if (currentFilter === 'all') {
        const isKurir = order.vehicle && order.vehicle.includes('kurir');
        if (!acceptKurirEnabled && isKurir) {
            console.log(`➡️ Filter: Skip order kurir karena acceptKurirEnabled = false`);
            return false;
        }
        return true;
    }
    
    const isKurir = order.vehicle && order.vehicle.includes('kurir');
    
    if (!acceptKurirEnabled && isKurir) {
        console.log(`➡️ Filter: Skip order kurir karena acceptKurirEnabled = false`);
        return false;
    }
    
    if (currentFilter === 'penumpang') return !isKurir;
    if (currentFilter === 'kurir') return isKurir;
    
    return true;
}

function checkOrderInRadius(order) {
    if (!driverLocation.latitude || !driverLocation.longitude) {
        console.log('❌ Driver tidak memiliki data koordinat GPS');
        return false;
    }
    
    if (!order.from_lat || !order.from_lng) {
        console.log('❌ Order tidak memiliki koordinat awal');
        return false;
    }
    
    const distance = calculateDistance(
        driverLocation.latitude,
        driverLocation.longitude,
        order.from_lat,
        order.from_lng
    );
    
    console.log(`🔍 Jarak driver ke order ${order.order_id || order.id}: ${distance.toFixed(2)} KM (Radius: ${customRadius}km)`);
    
    return distance <= customRadius;
}

// ==================== FUNGSI FILTER TUJUAN MULTIPLE KEYWORD (DIPERBAIKI) ====================
function checkFilterTujuan(order) {
    if (!filterTujuanEnabled || !filterTujuanText.trim()) {
        return true;
    }
    
    const searchText = filterTujuanText.toLowerCase().trim();
    
    if (!searchText) return true;
    
    const keywords = searchText.split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
    
    if (keywords.length === 0) return true;
    
    const alamatB = (order.alamat_b || '').toLowerCase();
    const tujuan = (order.tujuan || '').toLowerCase();
    
    const result = keywords.some(keyword => 
        alamatB.includes(keyword) || tujuan.includes(keyword)
    );
    
    console.log(`🔍 Filter Tujuan: Keywords "${keywords.join('", "')}"`);
    console.log(`   vs "${alamatB}" = ${result}`);
    
    return result;
}

// ==================== FUNGSI TOGGLE AUTOBID YANG DIPERBARUI ====================
function toggleAutobid() {
    if (!database) {
        showPopup('Tidak terhubung ke server. Periksa koneksi internet Anda.', 'Koneksi Error', 'error');
        return;
    }

    if (!locationTrackingEnabled) {
        showPopup('Aktifkan tracking terlebih dahulu untuk menggunakan autobid', 'Peringatan', 'warning');
        document.getElementById('autobidToggle').checked = false;
        return;
    }

    if (!driverLocation.latitude || !driverLocation.longitude) {
        showPopup('GPS diperlukan untuk mengaktifkan Autobid. Pastikan lokasi Anda aktif.', 'GPS Error', 'warning');
        updateGPSStatus(false, 'GPS diperlukan untuk Autobid');
        document.getElementById('autobidToggle').checked = false;
        return;
    }

    autobidEnabled = !autobidEnabled;
    updateAutobidButton();
    
    if (autobidEnabled) {
        stopManualCheckInterval();
        startAutobid();
    } else {
        stopAutobid();
        startManualCheckInterval();
        
        setTimeout(() => {
            checkOrdersForManualPopup();
        }, 1000);
    }
    
    localStorage.setItem('jego_autobid_enabled', autobidEnabled);
}

function updateAutobidButton() {
    const autobidToggle = document.getElementById('autobidToggle');
    if (autobidToggle) {
        autobidToggle.checked = autobidEnabled;
    }
}

// ==================== FUNGSI BARU: CEK ORDER UNTUK POPUP MANUAL ====================
function checkOrdersForManualPopup() {
    if (!canSystemProcessOrder("auto")) {
        console.log("🚫 Manual Popup dihentikan: Tracking OFF");
        return;
    }
    
    if (!locationTrackingEnabled || autobidEnabled || 
        !currentDriverData || isAutobidProcessing || 
        !driverLocation.latitude || !driverLocation.longitude) {
        return;
    }
    
    console.log(`🔍 Manual Popup: Mencari order dalam radius ${customRadius}KM...`);
    
    const ordersList = document.querySelectorAll('.order-item');
    let foundOrder = false;
    
    for (const orderItem of ordersList) {
        const orderId = orderItem.dataset.orderId;
        
        if (processedOrders.has(orderId)) {
            continue;
        }
        
        const orderRef = database.ref('orders/' + orderId);
        orderRef.once('value').then(snapshot => {
            const order = snapshot.val();
            if (order && order.status === 'searching') {
                
                const isKurir = order.vehicle && order.vehicle.includes('kurir');
                
                if (isKurir) {
                    const isInRadius = checkOrderInRadius(order);
                    if (!isInRadius) {
                        console.log(`➡️ Manual Popup: Skip order kurir ${orderId} (di luar radius)`);
                        return;
                    }
                    console.log(`🎉 Manual Popup: Order KURIR ${orderId} dalam radius, menampilkan modal...`);
                }
                
                if (!acceptKurirEnabled && isKurir) {
                    return;
                }
                
                const matchesTujuan = checkFilterTujuan(order);
                if (!matchesTujuan && filterTujuanText.trim()) {
                    return;
                }
                
                processedOrders.add(orderId);
                foundOrder = true;
                
                // Putar suara popup manual
                playManualPopupSound();
                
                showOrderDetail(order);
                return;
            }
        });
    }
}

// ==================== FUNGSI AUTOBID YANG DIPERBARUI ====================
function checkOrdersForAutobid() {
    if (!canSystemProcessOrder("auto")) {
        console.log("🚫 Autobid dihentikan: Tracking OFF");
        return;
    }
    
    if (!autobidEnabled || !currentDriverData || isAutobidProcessing || 
        !driverLocation.latitude || !driverLocation.longitude) {
        return;
    }
    
    console.log(`🔍 Autobid: Mencari order NON-KURIR dalam radius ${customRadius}KM...`);
    
    const ordersList = document.querySelectorAll('.order-item');
    
    for (const orderItem of ordersList) {
        const orderId = orderItem.dataset.orderId;
        
        if (processedOrders.has(orderId)) {
            continue;
        }
        
        const orderRef = database.ref('orders/' + orderId);
        orderRef.once('value').then(snapshot => {
            const order = snapshot.val();
            if (order && order.status === 'searching') {
                
                const isKurir = order.vehicle && order.vehicle.includes('kurir');
                if (isKurir) {
                    console.log(`➡️ Autobid: Skip order ${orderId} (order kurir - tidak boleh autobid)`);
                    return;
                }
                
                if (!acceptKurirEnabled && isKurir) {
                    return;
                }
                
                const isInRadius = checkOrderInRadius(order);
                if (!isInRadius) {
                    return;
                }
                
                const matchesTujuan = checkFilterTujuan(order);
                if (!matchesTujuan && filterTujuanText.trim()) {
                    return;
                }
                
                console.log(`🎉 Autobid: Order ${orderId} (NON-KURIR) memenuhi semua filter, menampilkan modal...`);
                isAutobidProcessing = true;
                processedOrders.add(orderId);
                showAutobidOrderModal(order);
                return;
            }
        });
    }
}

function startAutobid() {
    console.log('🚀 Autobid diaktifkan dengan optimasi (15 detik)');
    
    autobidInterval = setInterval(() => {
        if (!isAutobidProcessing && driverLocation.latitude && driverLocation.longitude) {
            checkOrdersForAutobid();
        }
    }, 15000);
    
    checkOrdersForAutobid();
}

function stopAutobid() {
    console.log('🛑 Autobid dinonaktifkan');
    if (autobidInterval) {
        clearInterval(autobidInterval);
        autobidInterval = null;
    }
    isAutobidProcessing = false;
}

// ==================== FUNGSI GPS DAN LOKASI ====================
function startGPSMonitoring() {
    console.log('📍 Memulai monitoring GPS...');
    showLoading('Mendeteksi lokasi GPS...');
    setLoadingState('gps', false);
    
    if (!navigator.geolocation) {
        console.error('❌ Browser tidak mendukung geolocation');
        updateGPSStatus(false, 'GPS tidak didukung');
        // Tetap set true meskipun gagal
        setLoadingState('gps', true);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            updateDriverLocation(position);
            updateGPSStatus(true, '');
            setLoadingState('gps', true);
        },
        (error) => {
            console.error('❌ Error mendapatkan lokasi:', error);
            handleLocationError(error);
            // Tetap set true meskipun gagal
            setLoadingState('gps', true);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        }
    );

    locationWatchId = navigator.geolocation.watchPosition(
        (position) => {
            updateDriverLocation(position);
            updateGPSStatus(true, '');
        },
        (error) => {
            console.error('❌ Error update lokasi:', error);
            handleLocationError(error);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 30000
        }
    );
}

function updateDriverLocation(position) {
    driverLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        lastUpdated: new Date()
    };
    
    console.log(`📍 Lokasi driver diperbarui: ${driverLocation.latitude}, ${driverLocation.longitude} (akurasi: ${driverLocation.accuracy}m)`);
    
    saveDriverLocationToStorage();
    
    if (locationTrackingEnabled) {
        sendLocationToFirebase();
    }
    
    if (autobidEnabled && !isAutobidProcessing) {
        checkOrdersForAutobid();
    }
}

function saveDriverLocationToStorage() {
    try {
        localStorage.setItem('jego_driver_location', JSON.stringify(driverLocation));
    } catch (error) {
        console.error('❌ Gagal menyimpan lokasi driver:', error);
    }
}

function loadDriverLocationFromStorage() {
    try {
        const savedLocation = localStorage.getItem('jego_driver_location');
        if (savedLocation) {
            const location = JSON.parse(savedLocation);
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const lastUpdated = new Date(location.lastUpdated);
            
            if (lastUpdated > fiveMinutesAgo) {
                driverLocation = location;
                updateGPSStatus(true, 'Lokasi aktif (cache)');
                return true;
            }
        }
    } catch (error) {
        console.error('❌ Gagal memuat lokasi driver:', error);
    }
    return false;
}

function handleLocationError(error) {
    let errorMessage = 'Error tidak diketahui';
    
    switch(error.code) {
        case error.PERMISSION_DENIED:
            errorMessage = 'Izinkan akses lokasi.';
            break;
        case error.POSITION_UNAVAILABLE:
            errorMessage = 'Informasi lokasi tidak tersedia.';
            break;
        case error.TIMEOUT:
            errorMessage = 'Request lokasi timeout.';
            break;
    }
    
    console.error('❌ Error GPS:', errorMessage);
    updateGPSStatus(false, errorMessage);
    
    if (!loadDriverLocationFromStorage()) {
        // Tidak meminta lokasi dari Kodular lagi
        showPopup('Izinkan akses lokasi untuk fitur yang lebih baik.', 'GPS Error', 'warning');
    }
}

function updateGPSStatus(isActive, message) {
    const gpsDot = document.getElementById('gpsDot');
    const gpsText = document.getElementById('gpsText');
    
    if (isActive) {
        gpsDot.className = 'gps-dot gps-active';
        gpsText.textContent = message || 'Lokasi aktif';
    } else {
        gpsDot.className = 'gps-dot gps-inactive';
        gpsText.textContent = message || 'Lokasi tidak aktif';
    }
    
    gpsText.style.display = 'none';
}

// ==================== FUNGSI PERHITUNGAN JARAK REAL ====================
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance;
}

function getDriverToPickupDistance(order) {
    if (!driverLocation.latitude || !driverLocation.longitude || !order.from_lat || !order.from_lng) {
        return null;
    }
    
    return calculateDistance(
        driverLocation.latitude,
        driverLocation.longitude,
        order.from_lat,
        order.from_lng
    );
}

// ==================== FUNGSI UNTUK MENAMPILKAN FOTO PROFIL BESAR ====================
function showCustomerPhoto(photoUrl, customerName) {
    const photoModal = document.getElementById('photoModal');
    const largePhoto = document.getElementById('largeCustomerPhoto');
    const largeName = document.getElementById('largeCustomerName');
    
    largePhoto.src = photoUrl;
    largePhoto.alt = customerName;
    largeName.textContent = customerName;
    
    photoModal.style.display = 'flex';
}

function closePhotoModal() {
    document.getElementById('photoModal').style.display = 'none';
}

// ==================== FUNGSI BARU: UPDATE STATUS DRIVER OFFER ====================
function updateDriverOfferStatus(orderId, driverId, status) {
    if (!orderId || !driverId || !status) return;
    
    console.log(`🔍 Queue status update: ${orderId} - ${driverId} - ${status}`);
    addToStatusBatch(orderId, driverId, status);
}

function sendStatusNotificationToDriver(orderId, driverId, status) {
    const statusMessages = {
        'accepted': {
            title: '🎉 PENAWARAN DITERIMA!',
            message: 'Selamat! Customer menerima penawaran Anda.',
            type: 'success'
        },
        'rejected': {
            title: '❌ PENAWARAN DITOLAK',
            message: 'Customer memilih driver lain untuk order ini.',
            type: 'warning'
        },
        'expired': {
            title: '⌛ WAKTU HABIS',
            message: 'Waktu penawaran telah habis.',
            type: 'info'
        },
        'cancelled': {
            title: '🚫 ORDER DIBATALKAN',
            message: 'Order telah dibatalkan oleh customer.',
            type: 'error'
        }
    };
    
    const notification = statusMessages[status] || {
        title: '📢 STATUS PENAWARAN',
        message: `Status penawaran: ${status}`,
        type: 'info'
    };
    
    // Gunakan popup untuk notifikasi
    showPopup(notification.message, notification.title, notification.type);
}

// ==================== FUNGSI MODAL DETAIL ORDER MANUAL - DIUBAH ====================
function showOrderDetail(order) {
    const isKurir = order.vehicle && order.vehicle.includes('kurir');
    
    if (isKurir) {
        if (!locationTrackingEnabled) {
            showPopup('Untuk mengambil order kurir, aktifkan tracking lokasi terlebih dahulu.', 'Peringatan', 'warning');
            return;
        }
        
        const isInRadius = checkOrderInRadius(order);
        if (!isInRadius) {
            showPopup(`Order kurir berada di luar radius (${customRadius}km). Aktifkan tracking untuk melihat order dalam radius.`, 'Peringatan', 'warning');
            return;
        }
        
        console.log(`✅ Order kurir memenuhi syarat: tracking ON dan dalam radius`);
    }
    
    if (!checkDriverData()) return;

    const orderKey = order.order_id || order.id;
    const orderRef = database.ref('orders/' + orderKey);
    
    orderRef.once('value').then((snapshot) => {
        const currentOrder = snapshot.val();
        
        if (!currentOrder || currentOrder.status !== 'searching') {
            showPopup('Order ini sudah diambil oleh driver lain.', 'Info', 'info');
            loadOrders();
            return;
        }
        
        currentSelectedOrder = currentOrder;
        currentDriverId = generateDriverId();
        
        const customerName = currentOrder.user_data?.name || currentOrder.user_data?.nama || 'Tidak diketahui';
        const customerPhoto = getCustomerPhoto(currentOrder);
        
        const modalCustomerName = document.getElementById('modalCustomerName');
        modalCustomerName.innerHTML = `
            <img class="modal-customer-photo" src="${customerPhoto}" alt="${customerName}"
                onerror="this.src='https://cdn-icons-png.flaticon.com/512/3135/3135715.png'">
            <span>${customerName}</span>
        `;
        
        const modalPhoto = modalCustomerName.querySelector('.modal-customer-photo');
        if (modalPhoto) {
            modalPhoto.style.cursor = 'pointer';
            modalPhoto.addEventListener('click', function(e) {
                e.stopPropagation();
                showCustomerPhoto(this.src, customerName);
            });
        }
        
        document.getElementById('modalAddressA').textContent = currentOrder.alamat_a || '-';
        document.getElementById('modalAddressB').textContent = currentOrder.alamat_b || '-';
        document.getElementById('modalDuration').textContent = currentOrder.durasi || '-';
        document.getElementById('modalDistance').textContent = currentOrder.jarak || '-';
        
        const discountedPrice = calculateDiscountedPrice(currentOrder);
        const hasRealPromo = discountedPrice.hasDiscount;
        
        const modalPrice = document.getElementById('modalPrice');
        const modalPromoInfo = document.getElementById('modalPromoInfo');
        
        if (hasRealPromo) {
            modalPromoInfo.style.display = 'block';
            document.getElementById('modalPromoCode').textContent = currentOrder.kode_promo || currentOrder.promo_data?.code || '-';
            document.getElementById('modalPromoDiscount').textContent = currentOrder.diskon_persen ? `${currentOrder.diskon_persen}%` : (currentOrder.promo_data?.discount ? `${currentOrder.promo_data.discount}%` : '-');
            
            modalPrice.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center;">
                    <span style="text-decoration: line-through; color: #999; font-size: 0.9rem;">
                        Rp ${discountedPrice.hargaAsal.toLocaleString('id-ID')}
                    </span>
                    <span style="color: var(--success); font-weight: 700;">
                        Rp ${discountedPrice.hargaDiskon.toLocaleString('id-ID')}
                    </span>
                </div>
            `;
            
        } else {
            modalPromoInfo.style.display = 'none';
            modalPrice.textContent = discountedPrice.hargaDiskon ? `Rp ${discountedPrice.hargaDiskon.toLocaleString('id-ID')}` : '-';
        }
        
        const modalDeliveryInfo = document.getElementById('modalDeliveryInfo');
        if (currentOrder.vehicle && currentOrder.vehicle.includes('kurir') && currentOrder.delivery_data) {
            modalDeliveryInfo.innerHTML = `
                <div class="modal-delivery-info">
                    <div class="modal-delivery-item">
                        <span class="modal-delivery-label">Jenis Barang:</span>
                        <span class="modal-delivery-value">${currentOrder.delivery_data.itemCategory || '-'}</span>
                    </div>
                    <div class="modal-delivery-item">
                        <span class="modal-delivery-label">Deskripsi:</span>
                        <span class="modal-delivery-value">${currentOrder.delivery_data.description || '-'}</span>
                    </div>
                </div>
            `;
        } else {
            modalDeliveryInfo.innerHTML = '';
        }
        
        const driverDistance = getDriverToPickupDistance(currentOrder);
        if (driverDistance !== null) {
            let distanceText;
            if (driverDistance < 1) {
                distanceText = Math.round(driverDistance * 1000) + ' M';
            } else {
                distanceText = driverDistance.toFixed(1) + ' KM';
            }
            document.getElementById('driverDistance').textContent = distanceText;
            document.getElementById('driverDistanceContainer').style.display = 'block';
        } else {
            document.getElementById('driverDistanceContainer').style.display = 'none';
        }
        
        document.getElementById('closeModal').style.display = 'none';
        
        document.getElementById('countdownContainer').style.display = 'none';
        document.getElementById('ambilBtn').disabled = false;
        document.getElementById('ambilBtn').textContent = 'Kirim Penawaran';
        
        isAutobidModal = false;
        
        document.getElementById('orderModal').style.display = 'flex';
        
        if (!modalMap) initModalMap();
        showRouteOnMap(currentOrder);
        
    }).catch((error) => {
        console.error('Error checking order status:', error);
        showPopup('Gagal memuat detail order. Silakan coba lagi.', 'Error', 'error');
    });
}

// ==================== FUNGSI MODAL AUTOBID - DIUBAH ====================
function showAutobidOrderModal(order) {
    if (!checkDriverData()) return;

    const orderKey = order.order_id || order.id;
    const orderRef = database.ref('orders/' + orderKey);
    
    orderRef.once('value').then((snapshot) => {
        const currentOrder = snapshot.val();
        
        if (!currentOrder || currentOrder.status !== 'searching') {
            isAutobidProcessing = false;
            processedOrders.delete(orderKey);
            return;
        }
        
        currentSelectedOrder = currentOrder;
        currentDriverId = generateDriverId();
        
        const customerName = currentOrder.user_data?.name || currentOrder.user_data?.nama || 'Tidak diketahui';
        const customerPhoto = getCustomerPhoto(currentOrder);
        
        const autobidCustomerName = document.getElementById('autobidCustomerName');
        autobidCustomerName.innerHTML = `
            <img class="autobid-customer-photo" src="${customerPhoto}" alt="${customerName}"
                onerror="this.src='https://cdn-icons-png.flaticon.com/512/3135/3135715.png'">
            <span>${customerName}</span>
        `;
        
        const autobidPhoto = autobidCustomerName.querySelector('.autobid-customer-photo');
        if (autobidPhoto) {
            autobidPhoto.style.cursor = 'pointer';
            autobidPhoto.addEventListener('click', function(e) {
                e.stopPropagation();
                showCustomerPhoto(this.src, customerName);
            });
        }
        
        document.getElementById('autobidAddressA').textContent = currentOrder.alamat_a || '-';
        document.getElementById('autobidAddressB').textContent = currentOrder.alamat_b || '-';
        document.getElementById('autobidDuration').textContent = currentOrder.durasi || '-';
        document.getElementById('autobidDistance').textContent = currentOrder.jarak || '-';
        
        const discountedPrice = calculateDiscountedPrice(currentOrder);
        document.getElementById('autobidPrice').textContent = discountedPrice.hargaDiskon ? `Rp ${discountedPrice.hargaDiskon.toLocaleString('id-ID')}` : '-';
        
        const autobidPromoInfo = document.getElementById('autobidPromoInfo');
        if (discountedPrice.hasDiscount) {
            autobidPromoInfo.style.display = 'block';
            autobidPromoInfo.innerHTML = `
                <div class="autobid-promo-badge">🎉 ORDER PROMO - ${currentOrder.diskon_persen}%</div>
                <div style="font-size: 0.7rem; color: #856404;">
                    Harga asli: Rp ${discountedPrice.hargaAsal.toLocaleString('id-ID')} → 
                    Harga diskon: Rp ${discountedPrice.hargaDiskon.toLocaleString('id-ID')}
                </div>
            `;
        } else {
            autobidPromoInfo.style.display = 'none';
        }
        
        const autobidDeliveryInfo = document.getElementById('autobidDeliveryInfo');
        if (currentOrder.vehicle && currentOrder.vehicle.includes('kurir') && currentOrder.delivery_data) {
            autobidDeliveryInfo.innerHTML = `
                <div style="background: #fff3cd; padding: 8px; border-radius: 6px; margin: 8px 0; border-left: 3px solid #ffc107;">
                    <div style="display: flex; margin-bottom: 4px; font-size: 0.75rem;">
                        <span style="font-weight: 600; min-width: 70px;">Jenis:</span>
                        <span>${currentOrder.delivery_data.itemCategory || '-'}</span>
                    </div>
                    <div style="display: flex; font-size: 0.75rem;">
                        <span style="font-weight: 600; min-width: 70px;">Deskripsi:</span>
                        <span>${currentOrder.delivery_data.description || '-'}</span>
                    </div>
                </div>
            `;
        } else {
            autobidDeliveryInfo.innerHTML = '';
        }
        
        autobidProgressTimeLeft = 30;
        document.getElementById('autobidProgressBar').style.width = '100%';
        document.getElementById('autobidProgressText').textContent = 'Mengirim penawaran...';
        
        document.getElementById('autobidModal').style.display = 'flex';
        
        playAutobidSound();
        
        sendAutobidOffer();
        
    }).catch((error) => {
        console.error('Error checking order status:', error);
        isAutobidProcessing = false;
        processedOrders.delete(orderKey);
    });
}

// ==================== FUNGSI PROGRESS BAR AUTOBID ====================
function startAutobidProgressBar() {
    if (autobidProgressInterval) {
        clearInterval(autobidProgressInterval);
    }
    
    autobidProgressTimeLeft = 30;
    const progressBar = document.getElementById('autobidProgressBar');
    const progressText = document.getElementById('autobidProgressText');
    
    progressBar.style.width = '100%';
    progressText.textContent = 'Menunggu konfirmasi customer...';
    
    autobidProgressInterval = setInterval(() => {
        autobidProgressTimeLeft--;
        
        const progressPercent = (autobidProgressTimeLeft / 30) * 100;
        progressBar.style.width = `${progressPercent}%`;
        
        if (autobidProgressTimeLeft <= 0) {
            clearInterval(autobidProgressInterval);
            progressText.textContent = 'Waktu habis - Order tidak dikonfirmasi';
            progressBar.style.background = '#dc3545';
            
            if (currentSelectedOrder && currentDriverId) {
                updateDriverOfferStatus(currentSelectedOrder.order_id || currentSelectedOrder.id, currentDriverId, 'expired');
            }
            
            setTimeout(() => {
                closeAutobidModal();
            }, 2000);
        }
    }, 1000);
}

function stopAutobidProgressBar() {
    if (autobidProgressInterval) {
        clearInterval(autobidProgressInterval);
        autobidProgressInterval = null;
    }
}

function closeAutobidModal() {
    document.getElementById('autobidModal').style.display = 'none';
    stopAutobidProgressBar();
    currentSelectedOrder = null;
    currentDriverId = null;
    isAutobidProcessing = false;
}

function sendAutobidOffer() {
    if (!currentSelectedOrder || !currentDriverId) {
        isAutobidProcessing = false;
        closeAutobidModal();
        return;
    }
    
    if (!checkDriverData()) {
        isAutobidProcessing = false;
        closeAutobidModal();
        return;
    }

    const orderId = currentSelectedOrder.order_id || currentSelectedOrder.id;
    const driverId = currentDriverId;
    
    const orderRef = database.ref('orders/' + orderId);
    orderRef.once('value').then((snapshot) => {
        const currentOrder = snapshot.val();
        
        if (!currentOrder || currentOrder.status !== 'searching') {
            showPopup('Order ini sudah diambil oleh driver lain.', 'Info', 'info');
            closeAutobidModal();
            isAutobidProcessing = false;
            return;
        }
        
        const priorityData = getDriverPriorityData();
        const driverDistance = getDriverToPickupDistance(currentOrder);
        const priorityScore = calculatePriorityScore(
            priorityData.priorityLevel,
            priorityData.rating,
            driverDistance
        );
        
        const driverData = {
            id: driverId,
            name: currentDriverData.fullName,
            plate_number: currentDriverData.plateNumber,
            vehicle_type: currentDriverData.vehicleType,
            vehicle_brand: currentDriverData.vehicleBrand,
            driver_id: currentDriverData.driverId,
            profile_photo_url: currentDriverData.profilePhotoUrl || '',
            offered_at: new Date().toISOString(),
            autobid: true,
            priority_level: priorityData.priorityLevel,
            avg_rating: priorityData.rating,
            priority_score: priorityScore,
            status: 'offered'
        };
        
        if (!checkFirebaseRateLimit()) {
            console.log('⏸️ Rate limit, delay autobid offer');
            setTimeout(() => {
                sendAutobidOffer();
            }, 2000);
            return;
        }
        
        orderRef.child('driver_offers').child(driverId).set(driverData)
            .then(() => {
                console.log('✅ Autobid: Penawaran berhasil dikirim untuk order:', orderId);
                
                document.getElementById('autobidProgressText').textContent = 'Penawaran terkirim! Menunggu konfirmasi...';
                document.getElementById('autobidProgressBar').style.background = 'linear-gradient(to right, var(--primary), var(--secondary))';
                
                startAutobidProgressBar();
                listenForAutobidOrderResponse(orderId, driverId);
            })
            .catch((error) => {
                console.error('❌ Autobid: Gagal mengirim penawaran:', error);
                
                document.getElementById('autobidProgressText').textContent = 'Gagal mengirim penawaran';
                document.getElementById('autobidProgressBar').style.background = '#dc3545';
                
                setTimeout(() => {
                    closeAutobidModal();
                }, 2000);
                
                isAutobidProcessing = false;
                processedOrders.delete(orderId);
            });
    }).catch((error) => {
        console.error('❌ Autobid: Error checking order status:', error);
        
        document.getElementById('autobidProgressText').textContent = 'Error memeriksa order';
        document.getElementById('autobidProgressBar').style.background = '#dc3545';
        
        setTimeout(() => {
            closeAutobidModal();
        }, 2000);
        
        isAutobidProcessing = false;
        processedOrders.delete(orderId);
    });
}

function listenForAutobidOrderResponse(orderId, driverId) {
    const orderRef = database.ref('orders/' + orderId);
    orderRef.on('value', (snapshot) => {
        const order = snapshot.val();
        
        if (!order) {
            console.log('🗑️ Order Autobid dihapus:', orderId);
            stopAutobidProgressBar();
            document.getElementById('autobidProgressText').textContent = 'Order dibatalkan customer';
            document.getElementById('autobidProgressBar').style.background = '#dc3545';
            
            updateDriverOfferStatus(orderId, driverId, 'cancelled');
            
            setTimeout(() => {
                closeAutobidModal();
            }, 2000);
            
            isAutobidProcessing = false;
            processedOrders.delete(orderId);
            return;
        }
        
        if (order.status === 'cancelled_by_user' || order.status === 'cancelled_by_system') {
            console.log(`🔍 Order dibatalkan dengan status: ${order.status}`);
            
            stopAutobidProgressBar();
            document.getElementById('autobidProgressText').textContent = 'Order dibatalkan';
            document.getElementById('autobidProgressBar').style.background = '#ffc107';
            
            updateDriverOfferStatus(orderId, driverId, 'cancelled');
            
            setTimeout(() => {
                closeAutobidModal();
            }, 2000);
            
            isAutobidProcessing = false;
            processedOrders.delete(orderId);
            return;
        }
        
        if (order.status === 'cancelled_by_driver') {
            console.log(`🔍 Order dibatalkan oleh driver: ${order.status}`);
            
            stopAutobidProgressBar();
            document.getElementById('autobidProgressText').textContent = 'Order dibatalkan oleh driver';
            document.getElementById('autobidProgressBar').style.background = '#dc3545';
            
            updateDriverOfferStatus(orderId, driverId, 'cancelled');
            
            setTimeout(() => {
                closeAutobidModal();
            }, 2000);
            
            isAutobidProcessing = false;
            processedOrders.delete(orderId);
            return;
        }
        
        if (order.status === 'accepted') {
            const selectedDriver = order.selected_driver;
            const isOurDriver = selectedDriver && selectedDriver.id === driverId;
            
            if (isOurDriver) {
                stopAutobidProgressBar();
                document.getElementById('autobidProgressText').textContent = 'SELAMAT! Penawaran DITERIMA';
                document.getElementById('autobidProgressBar').style.background = '#28a745';
                document.getElementById('autobidProgressBar').style.width = '100%';
                
                updateDriverOfferStatus(orderId, driverId, 'accepted');
                
                const saveSuccess = saveAcceptedOrderToLocalStorage(order, selectedDriver);
                
                playOrderAcceptedSound(); // Ini akan redirect ke orderAccepted.html
                
                setTimeout(() => {
                    closeAutobidModal();
                    loadOrders();
                }, 3000);
                
            } else {
                stopAutobidProgressBar();
                document.getElementById('autobidProgressText').textContent = 'Order diambil driver lain';
                document.getElementById('autobidProgressBar').style.background = '#dc3545';
                
                updateDriverOfferStatus(orderId, driverId, 'rejected');
                
                setTimeout(() => {
                    closeAutobidModal();
                }, 1000);
            }
            processedOrders.delete(orderId);
        }
        
        if (order.status !== 'searching' && order.status !== 'accepted' && 
            order.status !== 'cancelled_by_user' && order.status !== 'cancelled_by_system' && 
            order.status !== 'cancelled_by_driver') {
            stopAutobidProgressBar();
            document.getElementById('autobidProgressText').textContent = `Order ${order.status}`;
            document.getElementById('autobidProgressBar').style.background = '#dc3545';
            
            updateDriverOfferStatus(orderId, driverId, 'cancelled');
            
            setTimeout(() => {
                closeAutobidModal();
            }, 1000);
            
            processedOrders.delete(orderId);
        }
    });
}

// ==================== FUNGSI UNTUK KONTROL PENGIRIMAN DATA KE KODULAR ====================
function generateOrdersHash(orders) {
    if (!orders || orders.length === 0) return 'empty';
    
    const orderIds = orders.map(order => order.id || order.order_id).sort().join(',');
    return btoa(orderIds).substring(0, 16);
}

function sendOrdersToKodular(orders) {
    // Tidak mengirim ke Kodular, hanya logging
    const currentCount = orders.length;
    const currentHash = generateOrdersHash(orders);
    
    console.log(`📊 Orders count: ${currentCount}, Hash: ${currentHash}`);
}

// ==================== FUNGSI TAMPILAN ORDER DENGAN INFORMASI JARAK ====================
function loadOrders() {
    console.log('🔍 Memulai loadOrders...');
    console.log('✅ Status acceptKurirEnabled saat loadOrders:', acceptKurirEnabled);
    
    setLoadingState('orders', false);
    showLoading('Memuat daftar order...');
    
    const ordersList = document.getElementById('ordersList');
    if (!ordersList) {
        console.error('❌ Element ordersList tidak ditemukan!');
        setLoadingState('orders', true);
        return;
    }

    ordersList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    const loadingTimeout = setTimeout(() => {
        if (ordersList.querySelector('.loading')) {
            console.log('⚠️ Timeout loading orders');
            showConnectionError();
            setLoadingState('orders', true);
        }
    }, 15000);

    if (!checkDriverData()) {
        console.log('❌ Driver tidak terdaftar, berhenti load orders');
        clearTimeout(loadingTimeout);
        setLoadingState('orders', true);
        return;
    }

    if (!database) {
        clearTimeout(loadingTimeout);
        showConnectionError();
        setLoadingState('orders', true);
        return;
    }

    checkActiveOrderForDriver();

    if (ordersListener && ordersRef) {
        ordersRef.off('value', ordersListener);
    }

    try {
        ordersRef = database.ref('orders');
        
        ordersListener = ordersRef.on('value', (snapshot) => {
            console.log('✅ Data orders diterima dari Firebase');
            clearTimeout(loadingTimeout);
            
            const orders = snapshot.val();
            ordersList.innerHTML = '';

            if (!orders || Object.keys(orders).length === 0) {
                console.log('🗑️ Tidak ada orders di Firebase');
                
                // Tampilkan radar animasi
                toggleRadarAnimation(0);
                
                // Putar suara order baru
                playNewOrderSound();
                
                // Tetap set loading state ke true meskipun order kosong
                setLoadingState('orders', true);
                sendOrdersToKodular([]);
                return;
            }

            processOrdersData(orders, ordersList);
            
        }, (error) => {
            console.error('❌ Error loading orders dari Firebase:', error);
            clearTimeout(loadingTimeout);
            showConnectionError();
            // Tetap set true meskipun error
            setLoadingState('orders', true);
        });
        
    } catch (error) {
        console.error('❌ Error accessing Firebase:', error);
        clearTimeout(loadingTimeout);
        showConnectionError();
        // Tetap set true meskipun error
        setLoadingState('orders', true);
    }
}

function processOrdersData(orders, ordersList) {
    try {
        const sortedOrders = Object.entries(orders)
            .map(([id, order]) => ({ id, ...order }))
            .filter(order => order.status === 'searching')
            .filter(order => filterOrderByVehicleType(order))
            .filter(order => filterOrderByType(order))
            .sort((a, b) => {
                const timeA = new Date(a.created_at || 0).getTime();
                const timeB = new Date(b.created_at || 0).getTime();
                return timeB - timeA;
            });

        // Toggle radar berdasarkan jumlah order
        toggleRadarAnimation(sortedOrders.length);
        
        // Putar suara order baru
        if (sortedOrders.length > 0) {
            playNewOrderSound();
        }
        
        sendOrdersToKodular(sortedOrders);

        if (sortedOrders.length === 0) {
            // Radar sudah ditampilkan oleh toggleRadarAnimation
            setLoadingState('orders', true);
            return;
        }

        renderOrdersList(sortedOrders, ordersList);
        setLoadingState('orders', true);
        
    } catch (error) {
        console.error('❌ Error processing orders data:', error);
        showConnectionError();
        setLoadingState('orders', true);
    }
}

function renderOrdersList(orders, ordersList) {
    // Pastikan radar disembunyikan
    toggleRadarAnimation(orders.length);
    
    orders.forEach(order => {
        const orderItem = document.createElement('div');
        orderItem.className = 'order-item';
        orderItem.dataset.orderId = order.id;
        
        const customerName = order.user_data?.name || order.user_data?.nama || 'Tidak diketahui';
        const customerPhoto = getCustomerPhoto(order);
        const alamatA = order.alamat_a || '-';
        const alamatB = order.alamat_b || '-';
        const durasi = order.durasi || '-';
        const jarak = order.jarak || '-';
        
        const discountedPrice = calculateDiscountedPrice(order);
        const hasPromo = discountedPrice.hasDiscount || order.promo_data || order.kode_promo;
        const isKurir = order.vehicle && order.vehicle.includes('kurir');
        
        if (!acceptKurirEnabled && isKurir) {
            console.log(`➡️ Render: Skip order kurir karena acceptKurirEnabled = false`);
            return;
        }
        
        let hargaDisplay = '';
        let promoBadge = '';
        
        if (hasPromo && discountedPrice.hasDiscount) {
            promoBadge = '<span class="promo-badge">🎉 PROMO</span>';
            hargaDisplay = `
                <div class="price-promo">
                    <span class="original-price">Rp ${discountedPrice.hargaAsal.toLocaleString('id-ID')}</span>
                    <span class="promo-price">Rp ${discountedPrice.hargaDiskon.toLocaleString('id-ID')}</span>
                </div>
            `;
        } else {
            hargaDisplay = `<span class="detail-value price-highlight">Rp ${discountedPrice.hargaDiskon.toLocaleString('id-ID')}</span>`;
        }

        let driverDistanceDisplay = '-';
        if (driverLocation.latitude && driverLocation.longitude && order.from_lat && order.from_lng) {
            const distance = getDriverToPickupDistance(order);
            if (distance !== null) {
                if (distance < 1) {
                    driverDistanceDisplay = Math.round(distance * 1000) + ' M';
                } else {
                    driverDistanceDisplay = distance.toFixed(1) + ' KM';
                }
            }
        }

        const rating = order.user_data?.rating || order.user_data?.Ratings || 0;
        const tripCount = order.user_data?.perjalanan || order.user_data?.Perjalanan || 0;
        
        const timeAgo = formatTimeAgo(order.created_at);

        let deliveryInfoHTML = '';
        if (isKurir && order.delivery_data) {
            deliveryInfoHTML = `
                <div class="delivery-info">
                    <div class="delivery-item">
                        <span class="delivery-label">Jenis Barang:</span>
                        <span class="delivery-value">${order.delivery_data.itemCategory || '-'}</span>
                    </div>
                    <div class="delivery-item">
                        <span class="delivery-label">Deskripsi:</span>
                        <span class="delivery-value">${order.delivery_data.description || '-'}</span>
                    </div>
                </div>
            `;
        }

        orderItem.innerHTML = `
            <div class="order-header">
                <div class="order-badges">
                    ${isKurir ? '<span class="kurir-badge">📦 KURIR</span>' : ''}
                    ${promoBadge}
                </div>
            </div>
            <div class="route-info-with-photo">
                <div class="customer-info-left">
                    <img class="customer-photo-left" src="${customerPhoto}" alt="${customerName}" 
                        data-customer-name="${customerName}"
                        onerror="this.src='https://cdn-icons-png.flaticon.com/512/3135/3135715.png'">
                    <div class="customer-name-left">${customerName}</div>
                    <div class="customer-rating">
                        <span class="rating-stars">⭐ ${rating.toFixed(1)}</span>
                        <span class="trip-count">(${tripCount})</span>
                    </div>
                    <div class="order-time">${timeAgo}</div>
                </div>
                <div class="route-addresses-right">
                    <div class="route-point">
                        <div class="point-marker point-marker-a">A</div>
                        <div class="point-address point-address-a">${alamatA}</div>
                    </div>
                    <div class="route-point">
                        <div class="point-marker point-marker-b">B</div>
                        <div class="point-address">${alamatB}</div>
                    </div>
                </div>
            </div>
            ${deliveryInfoHTML}
            <div class="order-details">
                <div class="detail-item">
                    <span class="detail-value">${durasi}</span>
                    <span class="detail-label">Durasi</span>
                </div>
                <div class="detail-item">
                    <span class="detail-value">${jarak}</span>
                    <span class="detail-label">Jarak</span>
                </div>
                <div class="detail-item">
                    ${hargaDisplay}
                    <span class="detail-label">Harga</span>
                </div>
                <div class="detail-item">
                    <span class="detail-value">${driverDistanceDisplay}</span>
                    <span class="detail-label">Jemput</span>
                </div>
            </div>
        `;
        
        orderItem.addEventListener('click', () => {
            showOrderDetail(order);
        });
        
        const photoElement = orderItem.querySelector('.customer-photo-left');
        if (photoElement) {
            photoElement.addEventListener('click', function(e) {
                e.stopPropagation();
                const photoUrl = this.src;
                const customerName = this.getAttribute('data-customer-name') || this.alt;
                showCustomerPhoto(photoUrl, customerName);
            });
        }
        
        ordersList.appendChild(orderItem);
    });
}

// ==================== FUNGSI BARU: TAMPILAN ERROR KONEKSI ====================
function showConnectionError() {
    const ordersList = document.getElementById('ordersList');
    
    ordersList.innerHTML = `
        <div class="empty-state">
            <div>⚠️</div>
            <p>Gagal terhubung ke server</p>
            <p style="margin-top: 10px; font-size: 0.8rem; color: #666;">
                Periksa koneksi internet Anda dan coba refresh.
            </p>
            <button onclick="refreshData()" style="margin-top: 10px; padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 5px; cursor: pointer;">
                Refresh
            </button>
        </div>
    `;
}

// ==================== FUNGSI UTAMA YANG SUDAH ADA ====================
function generateDriverId() {
    return 'DRIVER_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function checkDriverData() {
    try {
        setLoadingState('driverData', false);
        
        const driverData = getDriverData();
        
        console.log('🔍 Data driver dari getDriverData:', driverData ? 'Ada' : 'Tidak ada');
        
        if (!driverData) {
            console.log('❌ Tidak ada data driver valid di localStorage');
            showDriverNotRegistered();
            // Tetap set true meskipun gagal
            setLoadingState('driverData', true);
            return false;
        }
        
        console.log('👤 Parsed driver data:', driverData);
        
        if (driverData.uid || driverData.driverId) {
            currentDriverData = driverData;
            currentUserData = driverData;
            
            updateDriverPhoto();
            
            initializeBalanceSystem();
            
            const savedAutobid = localStorage.getItem('jego_autobid_enabled');
            if (savedAutobid !== null) {
                autobidEnabled = savedAutobid === 'true';
                updateAutobidButton();
            }
            
            loadLocationTrackingSetting();
            
            const savedAcceptKurir = localStorage.getItem('jego_accept_kurir');
            const savedRadius = localStorage.getItem('jego_custom_radius');
            const savedFilterTujuan = localStorage.getItem('jego_filter_tujuan');
            
            if (savedAcceptKurir !== null) {
                acceptKurirEnabled = savedAcceptKurir === 'true';
            } else {
                acceptKurirEnabled = true;
            }
            
            console.log('✅ acceptKurirEnabled dari localStorage saat checkDriverData:', acceptKurirEnabled);
            
            if (savedRadius) {
                customRadius = parseFloat(savedRadius);
            }
            
            if (savedFilterTujuan) {
                const filterData = JSON.parse(savedFilterTujuan);
                filterTujuanText = filterData.text || '';
                filterTujuanEnabled = filterData.enabled || false;
            }
            
            console.log('✅ Driver data valid dan diterima');
            
            if (driverData.driverId || driverData.uid) {
                startDriverDataRefresh();
            }
            
            setLoadingState('driverData', true);
            return true;
        } else {
            console.log('❌ Data driver tidak lengkap');
            showDriverNotRegistered();
            // Tetap set true meskipun gagal
            setLoadingState('driverData', true);
            return false;
        }
    } catch (error) {
        console.error('❌ Error checking driver data:', error);
        showDriverNotRegistered();
        // Tetap set true meskipun gagal
        setLoadingState('driverData', true);
        return false;
    }
}

function showDriverNotRegistered() {
    const ordersList = document.getElementById('ordersList');
    if (ordersList) {
        ordersList.innerHTML = `
            <div class="empty-state">
                <div>🚫</div>
                <p>Anda belum terdaftar sebagai driver atau belum login</p>
                <p style="margin-top: 10px; font-size: 0.8rem;">
                    <a href="loginDriver.html" style="color: var(--primary); text-decoration: underline;">
                        Login sebagai Driver
                    </a>
                </p>
            </div>
        `;
    }
}

function loadLocationTrackingSetting() {
    const savedLocationTracking = localStorage.getItem('jego_location_tracking_enabled');
    if (savedLocationTracking !== null) {
        locationTrackingEnabled = savedLocationTracking === 'true';
        updateLocationToggleButton();
        updateAutobidToggleStatus();
        
        if (locationTrackingEnabled) {
            startLocationTracking();
            
            if (!autobidEnabled) {
                startManualCheckInterval();
            }
        }
    }
}

function updateDriverPhoto() {
    const driverPhoto = document.getElementById('driverPhoto');
    if (currentDriverData && currentDriverData.profilePhotoUrl) {
        driverPhoto.src = currentDriverData.profilePhotoUrl;
    } else {
        driverPhoto.src = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
    }
}

function filterOrderByVehicleType(order) {
    if (!currentDriverData) return false;
    
    const driverVehicleType = currentDriverData.vehicleType;
    const orderVehicleType = order.vehicle;
    
    const vehicleMapping = {
        'motor': ['motor', 'kurir_motor'],
        'bentor': ['bentor', 'kurir_bentor'],
        'mobil': ['mobil']
    };
    
    return vehicleMapping[driverVehicleType]?.includes(orderVehicleType) || false;
}

function initModalMap() {
    const mapElement = document.getElementById('modalMap');
    modalMap = new google.maps.Map(mapElement, {
        zoom: 12,
        center: { lat: 0.5441, lng: 123.0595 },
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }]
    });
    
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: modalMap,
        suppressMarkers: false,
        polylineOptions: { strokeColor: '#289672', strokeWeight: 6, strokeOpacity: 0.8 }
    });
}

function showRouteOnMap(order) {
    if (!order.from_lat || !order.from_lng || !order.to_lat || !order.to_lng) return;
    
    const from = new google.maps.LatLng(order.from_lat, order.from_lng);
    const to = new google.maps.LatLng(order.to_lat, order.to_lng);
    
    directionsService.route({
        origin: from,
        destination: to,
        travelMode: google.maps.TravelMode.DRIVING,
        region: "ID"
    }, (result, status) => {
        if (status === 'OK') {
            directionsRenderer.setDirections(result);
            const bounds = new google.maps.LatLngBounds();
            bounds.extend(from);
            bounds.extend(to);
            modalMap.fitBounds(bounds);
        }
    });
}

function startCountdown(orderId, driverId) {
    let timeLeft = 30;
    document.getElementById('countdownTimer').textContent = timeLeft;
    document.getElementById('countdownContainer').style.display = 'block';
    
    if (countdownInterval) clearInterval(countdownInterval);
    
    countdownInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('countdownTimer').textContent = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            updateDriverOfferStatus(orderId, driverId, 'expired');
            closeModalAndRefresh();
            isAutobidProcessing = false;
        }
    }, 1000);
}

function removeDriverOffer(orderId, driverId) {
    const orderRef = database.ref('orders/' + orderId);
    
    orderRef.child('driver_offers').child(driverId).update({
        status: 'expired',
        expired_at: new Date().toISOString()
    })
    .then(() => {
        console.log('✅ Status offer diupdate ke expired');
        
        setTimeout(() => {
            orderRef.child('driver_offers').child(driverId).remove()
                .then(() => console.log('🗑️ Offer dihapus setelah expired'))
                .catch(error => console.error('❌ Gagal menghapus data driver:', error));
        }, 2000);
    })
    .catch(error => {
        console.error('❌ Gagal update status offer:', error);
        orderRef.child('driver_offers').child(driverId).remove();
    });
}

function closeModalAndRefresh() {
    document.getElementById('closeModal').style.display = 'block';
    
    document.getElementById('orderModal').style.display = 'none';
    document.getElementById('autobidModal').style.display = 'none';
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    if (offerListenerRef && offerListener) {
        offerListenerRef.off('value', offerListener);
        offerListenerRef = null;
        offerListener = null;
    }
    
    isAutobidModal = false;
    
    currentSelectedOrder = null;
    currentDriverId = null;
    isAutobidProcessing = false;
    
    loadOrders();
}

function listenForOrderResponse(orderId, driverId) {
    if (offerListenerRef && offerListener) {
        offerListenerRef.off('value', offerListener);
    }
    
    offerListenerRef = database.ref('orders/' + orderId);
    offerListener = offerListenerRef.on('value', (snapshot) => {
        const order = snapshot.val();
        
        if (!order) {
            closeModalAndRefresh();
            updateDriverOfferStatus(orderId, driverId, 'cancelled');
            isAutobidProcessing = false;
            processedOrders.delete(orderId);
            return;
        }
        
        if (order.status === 'cancelled_by_user' || order.status === 'cancelled_by_system') {
            console.log(`🔍 Order dibatalkan dengan status: ${order.status}`);
            
            updateDriverOfferStatus(orderId, driverId, 'cancelled');
            closeModalAndRefresh();
            isAutobidProcessing = false;
            processedOrders.delete(orderId);
            return;
        }
        
        if (order.status === 'cancelled_by_driver') {
            console.log(`🔍 Order dibatalkan oleh driver: ${order.status}`);
            
            updateDriverOfferStatus(orderId, driverId, 'cancelled');
            closeModalAndRefresh();
            isAutobidProcessing = false;
            processedOrders.delete(orderId);
            return;
        }
        
        if (order.status === 'accepted') {
            const selectedDriver = order.selected_driver;
            const isOurDriver = selectedDriver && selectedDriver.id === driverId;
            
            if (isOurDriver) {
                if (countdownInterval) clearInterval(countdownInterval);
                
                updateDriverOfferStatus(orderId, driverId, 'accepted');
                
                const saveSuccess = saveAcceptedOrderToLocalStorage(order, selectedDriver);
                
                playOrderAcceptedSound(); // Ini akan redirect ke orderAccepted.html
                
                closeModalAndRefresh();
            } else {
                if (countdownInterval) clearInterval(countdownInterval);
                updateDriverOfferStatus(orderId, driverId, 'rejected');
                closeModalAndRefresh();
            }
            processedOrders.delete(orderId);
        }
        
        if (order.status !== 'searching' && order.status !== 'accepted' && 
            order.status !== 'cancelled_by_user' && order.status !== 'cancelled_by_system' && 
            order.status !== 'cancelled_by_driver') {
            if (countdownInterval) clearInterval(countdownInterval);
            updateDriverOfferStatus(orderId, driverId, 'cancelled');
            closeModalAndRefresh();
            processedOrders.delete(orderId);
        }
    });
}

function sendDriverOffer() {
    if (!currentSelectedOrder || !currentDriverId) return;
    
    if (!checkDriverData()) return;
    
    const isKurir = currentSelectedOrder.vehicle && currentSelectedOrder.vehicle.includes('kurir');
    if (isKurir) {
        if (!locationTrackingEnabled) {
            showPopup('Untuk mengambil order kurir, aktifkan tracking lokasi terlebih dahulu.', 'Peringatan', 'warning');
            return;
        }
        
        const isInRadius = checkOrderInRadius(currentSelectedOrder);
        if (!isInRadius) {
            showPopup(`Order kurir berada di luar radius (${customRadius}km).`, 'Peringatan', 'warning');
            return;
        }
    }
    
    const orderId = currentSelectedOrder.order_id || currentSelectedOrder.id;
    const driverId = currentDriverId;
    const ambilBtn = document.getElementById('ambilBtn');
    
    ambilBtn.disabled = true;
    ambilBtn.textContent = 'Mengirim...';
    
    const orderRef = database.ref('orders/' + orderId);
    orderRef.once('value').then((snapshot) => {
        const currentOrder = snapshot.val();
        
        if (!currentOrder || currentOrder.status !== 'searching') {
            showPopup('Order ini sudah diambil oleh driver lain.', 'Info', 'info');
            closeModalAndRefresh();
            return;
        }
        
        const priorityData = getDriverPriorityData();
        const driverDistance = getDriverToPickupDistance(currentOrder);
        const priorityScore = calculatePriorityScore(
            priorityData.priorityLevel,
            priorityData.rating,
            driverDistance
        );
        
        const driverData = {
            id: driverId,
            name: currentDriverData.fullName,
            plate_number: currentDriverData.plateNumber,
            vehicle_type: currentDriverData.vehicleType,
            vehicle_brand: currentDriverData.vehicleBrand,
            driver_id: currentDriverData.driverId,
            profile_photo_url: currentDriverData.profilePhotoUrl || '',
            offered_at: new Date().toISOString(),
            priority_level: priorityData.priorityLevel,
            avg_rating: priorityData.rating,
            priority_score: priorityScore,
            status: 'offered'
        };
        
        if (!checkFirebaseRateLimit()) {
            console.log('⏸️ Rate limit, delay driver offer');
            setTimeout(() => {
                sendDriverOffer();
            }, 2000);
            return;
        }
        
        orderRef.child('driver_offers').child(driverId).set(driverData)
            .then(() => {
                console.log('Penawaran driver berhasil dikirim untuk order:', orderId);
                startCountdown(orderId, driverId);
                listenForOrderResponse(orderId, driverId);
                ambilBtn.textContent = 'Menunggu Konfirmasi';
            })
            .catch((error) => {
                console.error('Gagal mengirim penawaran:', error);
                showPopup('Gagal mengirim penawaran. Silakan coba lagi.', 'Error', 'error');
                ambilBtn.disabled = false;
                ambilBtn.textContent = 'Kirim Penawaran';
            });
    }).catch((error) => {
        console.error('Error checking order status:', error);
        showPopup('Gagal memeriksa status order. Silakan coba lagi.', 'Error', 'error');
        ambilBtn.disabled = false;
        ambilBtn.textContent = 'Kirim Penawaran';
    });
}

// ==================== SISTEM PRIORITAS DRIVER ====================
const PRIORITY_WEIGHTS = {
    'basic': 1,
    'standard': 2,
    'regular': 3,
    'essential': 4
};

function getPriorityWeight(priorityLevel) {
    return PRIORITY_WEIGHTS[priorityLevel] || 1;
}

function calculatePriorityScore(priorityLevel, rating, distanceToPickup) {
    const levelWeight = getPriorityWeight(priorityLevel);
    const ratingValue = rating || 0;
    const distance = distanceToPickup || 0;
    
    const priorityScore = (levelWeight * 1000) + (ratingValue * 100) - (distance * 100);
    
    console.log(`📊 Priority Score Calculation:`, {
        level: priorityLevel,
        weight: levelWeight,
        rating: ratingValue,
        distance: distance,
        priorityScore: priorityScore
    });
    
    return priorityScore;
}

function getPriorityBadgeClass(priorityLevel) {
    const classMap = {
        'basic': 'priority-basic',
        'standard': 'priority-standard',
        'regular': 'priority-regular',
        'essential': 'priority-essential'
    };
    return classMap[priorityLevel] || 'priority-basic';
}

function getPriorityLabel(priorityLevel) {
    const labelMap = {
        'basic': 'Basic',
        'standard': 'Standard',
        'regular': 'Regular',
        'essential': 'Essential'
    };
    return labelMap[priorityLevel] || 'Basic';
}

function getDriverPriorityData() {
    if (!currentDriverData) {
        return {
            priorityLevel: 'basic',
            rating: 0,
            priorityScore: 0
        };
    }
    
    const priorityLevel = currentDriverData.priority_level || 'basic';
    const rating = currentDriverData.avgRating || 0;
    
    return {
        priorityLevel: priorityLevel,
        rating: rating,
        priorityLabel: getPriorityLabel(priorityLevel),
        badgeClass: getPriorityBadgeClass(priorityLevel)
    };
}

function updatePriorityBadgeInHeader() {
    const priorityData = getDriverPriorityData();
    
    const existingBadge = document.getElementById('priorityHeaderBadge');
    if (existingBadge) {
        existingBadge.remove();
    }
    
    console.log(`📊 Priority Level: ${priorityData.priorityLevel}, Rating: ${priorityData.rating}`);
}

// ==================== SISTEM SALDO DRIVER (OPTIMIZED) ====================
function initializeBalanceSystem() {
    if (!currentDriverData || !currentDriverData.driverId) {
        console.log('❌ Tidak ada data driver untuk inisialisasi sistem saldo');
        return;
    }

    const driverId = currentDriverData.driverId;
    const balanceRef = database.ref('drivers/' + driverId + '/Balance');

    if (balanceListener) {
        balanceRef.off('value', balanceListener);
        balanceListener = null;
    }
    
    function checkBalance() {
        if (!checkFirebaseRateLimit()) {
            console.log('⏸️ Rate limit, delay balance check');
            setTimeout(checkBalance, 5000);
            return;
        }
        
        balanceRef.once('value').then((snapshot) => {
            const newBalance = snapshot.val() || 0;
            currentDriverBalance = newBalance;
            
            console.log(`💰 Saldo diperbarui: Rp ${newBalance.toLocaleString('id-ID')} (60 detik update)`);
            
            if (currentDriverData) {
                currentDriverData.balance = newBalance;
                try {
                    localStorage.setItem('driverData', JSON.stringify(currentDriverData));
                } catch (e) {
                    console.warn('Gagal simpan balance ke localStorage:', e);
                }
            }
        }).catch(error => {
            console.error('❌ Error cek saldo:', error);
        });
    }
    
    checkBalance();
    
    setInterval(checkBalance, 60000);
    
    console.log('✅ Sistem saldo: polling 60 detik dengan rate limiting');
}

// ==================== FUNGSI LOCALSTORAGE ORDER DITERIMA ====================
function saveAcceptedOrderToLocalStorage(orderData, driverData) {
    try {
        const deliveryData = orderData.delivery_data ? {
            itemCategory: orderData.delivery_data.itemCategory,
            description: orderData.delivery_data.description,
            senderPhone: orderData.delivery_data.senderPhone,
            receiverPhone: orderData.delivery_data.receiverPhone
        } : null;

        const acceptedOrderData = {
            ...orderData,
            driver_data: driverData,
            delivery_data: deliveryData,
            accepted_at: new Date().toISOString(),
            type: 'driver_accepted_order',
            is_active: true
        };
        
        localStorage.setItem('jego_driver_accepted_order', JSON.stringify(acceptedOrderData));
        console.log('✅ Order yang diterima driver disimpan ke localStorage:', orderData.order_id);
        
        if (deliveryData) {
            localStorage.setItem('jego_delivery_data', JSON.stringify(deliveryData));
            console.log('✅ Data pengiriman disimpan ke localStorage:', deliveryData);
        }
        
        updateActiveOrderBadge(true);
        
        return true;
    } catch (error) {
        console.error('❌ Gagal menyimpan order yang diterima ke localStorage:', error);
        return false;
    }
}

function removeAcceptedOrderFromLocalStorage() {
    try {
        localStorage.removeItem('jego_driver_accepted_order');
        localStorage.removeItem('jego_delivery_data');
        console.log('✅ Order yang diterima driver dihapus dari localStorage');
        
        updateActiveOrderBadge(false);
    } catch (error) {
        console.error('❌ Gagal menghapus order yang diterima dari localStorage:', error);
    }
}

function getAcceptedOrderFromLocalStorage() {
    try {
        const acceptedOrder = localStorage.getItem('jego_driver_accepted_order');
        return acceptedOrder ? JSON.parse(acceptedOrder) : null;
    } catch (error) {
        console.error('❌ Gagal mengambil order yang diterima dari localStorage:', error);
        return null;
    }
}

// ==================== FUNGSI CEK ORDER BERJALAN YANG DIPERBAIKI ====================
function checkActiveOrderForDriver() {
    if (!currentDriverData || !currentDriverData.driverId) {
        console.log('❌ Tidak ada data driver untuk mengecek order berjalan');
        return;
    }

    console.log('🔍 Mengecek order berjalan untuk driver:', currentDriverData.driverId);

    const ordersRef = database.ref('orders');
    ordersRef.once('value').then(snapshot => {
        const orders = snapshot.val();
        let activeOrder = null;
        let activeOrderId = null;

        if (orders) {
            Object.keys(orders).forEach(orderId => {
                const order = orders[orderId];
                
                const activeStatuses = ['accepted', 'on_the_way', 'arrived', 'picked_up', 'on_trip'];
                
                if (order.selected_driver && 
                    order.selected_driver.driver_id === currentDriverData.driverId && 
                    activeStatuses.includes(order.status)) {
                    activeOrder = order;
                    activeOrderId = orderId;
                    console.log('✅ Order berjalan ditemukan:', orderId, 'Status:', order.status);
                }
            });
        }

        if (activeOrder) {
            console.log('🎉 Driver memiliki order berjalan:', activeOrderId, 'Status:', activeOrder.status);
            
            activeOrder.orderId = activeOrderId;
            saveAcceptedOrderToLocalStorage(activeOrder, activeOrder.selected_driver);
            
            startActiveOrderListener(activeOrderId);
            
            showActiveOrderNotification(activeOrder);
            
        } else {
            console.log('❌ Tidak ada order berjalan untuk driver ini');
            removeAcceptedOrderFromLocalStorage();
            hideActiveOrderNotification();
            stopActiveOrderListener();
        }
    }).catch(error => {
        console.error('❌ Error checking active orders:', error);
    });
}

function startActiveOrderListener(orderId) {
    stopActiveOrderListener();

    console.log('👂 Mulai listen untuk order aktif:', orderId);
    
    activeOrderListenerRef = database.ref('orders/' + orderId);
    activeOrderListener = activeOrderListenerRef.on('value', (snapshot) => {
        const order = snapshot.val();
        
        if (!order) {
            console.log('🗑️ Order aktif dihapus:', orderId);
            removeAcceptedOrderFromLocalStorage();
            stopActiveOrderListener();
            hideActiveOrderNotification();
            return;
        }

        const completedStatuses = ['completed', 'cancelled', 'rejected', 'failed'];
        
        if (completedStatuses.includes(order.status)) {
            console.log('🔍 Status order berubah ke selesai/dibatalkan:', order.status);
            removeAcceptedOrderFromLocalStorage();
            stopActiveOrderListener();
            hideActiveOrderNotification();
            
            loadOrders();
        }
        else {
            const activeStatuses = ['accepted', 'on_the_way', 'arrived', 'picked_up', 'on_trip'];
            if (activeStatuses.includes(order.status)) {
                showActiveOrderNotification(order);
            } else {
                console.log('🔍 Status order tidak aktif:', order.status);
                hideActiveOrderNotification();
                removeAcceptedOrderFromLocalStorage();
                stopActiveOrderListener();
            }
        }
    });
}

function stopActiveOrderListener() {
    if (activeOrderListenerRef && activeOrderListener) {
        activeOrderListenerRef.off('value', activeOrderListener);
        activeOrderListenerRef = null;
        activeOrderListener = null;
        console.log('🛑 Listener order aktif dihentikan');
    }
}

function hideActiveOrderNotification() {
    const existingNotification = document.querySelector('.active-order-notification');
    if (existingNotification) {
        existingNotification.remove();
        console.log('🗑️ Notifikasi order berjalan disembunyikan');
    }
    
    updateActiveOrderBadge(false);
}

function showActiveOrderNotification(order) {
    hideActiveOrderNotification();

    const activeStatuses = ['accepted', 'on_the_way', 'arrived', 'picked_up', 'on_trip'];
    if (!activeStatuses.includes(order.status)) {
        console.log('🚫 Order tidak aktif, tidak menampilkan notifikasi. Status:', order.status);
        return;
    }

    const statusTexts = {
        'accepted': 'DITERIMA',
        'on_the_way': 'MENUJU LOKASI',
        'arrived': 'SUDAH SAMPAI', 
        'picked_up': 'PENUMPANG/DIBARANG DIANGKUT',
        'on_trip': 'MENUJU TUJUAN'
    };
    
    const statusText = statusTexts[order.status] || order.status;

    const notification = document.createElement('div');
    notification.className = 'active-order-notification';
    notification.innerHTML = `
        <strong>🚖 ORDER BERJALAN - ${statusText}</strong><br>
        <small>${order.alamat_a} → ${order.alamat_b}</small><br>
        <button id="viewActiveOrder" style="background: white; color: #f57c00; border: none; padding: 6px 12px; border-radius: 4px; margin-top: 8px; font-weight: bold; cursor: pointer;">
            LIHAT ORDER
        </button>
    `;
    
    const container = document.querySelector('.container');
    container.insertBefore(notification, container.firstChild);
    
    document.getElementById('viewActiveOrder').addEventListener('click', () => {
        window.location.href = 'orderAccepted.html';
    });
    
    console.log('📢 Notifikasi order berjalan ditampilkan untuk status:', order.status);
}

// ==================== FUNGSI TAMBAHAN UNTUK REFRESH ====================
function refreshData() {
    console.log('🔍 Refresh data manual');
    
    // Jika radar sedang aktif, update teks
    if (document.getElementById('radarContainer')?.style.display === 'flex') {
        const radarText = document.querySelector('#radarText h2');
        if (radarText) {
            radarText.textContent = 'Memperbarui pencarian...';
            setTimeout(() => {
                radarText.textContent = 'Mencari order di sekitar...';
            }, 1500);
        }
    }
    
    loadOrders();
    
    if (locationTrackingEnabled && driverLocation.latitude && driverLocation.longitude) {
        sendLocationToFirebase();
    }
}

function closeModal() {
    document.getElementById('closeModal').style.display = 'block';
    
    document.getElementById('orderModal').style.display = 'none';
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    if (offerListenerRef && offerListener) {
        offerListenerRef.off('value', offerListener);
        offerListenerRef = null;
        offerListener = null;
    }
    currentSelectedOrder = null;
    currentDriverId = null;
    isAutobidProcessing = false;
}

// ==================== FUNGSI BARU: ANIMASI RADAR PENCARIAN ====================

function createRadarAnimation(isSimple = false) {
    const radarContainer = document.createElement('div');
    radarContainer.className = 'radar-container';
    
    if (isSimple) {
        radarContainer.innerHTML = `
            <div class="radar-simple" style="
                width: 100px;
                height: 100px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.05);
                position: relative;
                overflow: hidden;
            ">
                <div class="radar-simple-scan" style="
                    width: 100%;
                    height: 100%;
                    background: conic-gradient(transparent, #ffffff);
                    border-radius: 50%;
                    animation: radarSpin 2s linear infinite;
                "></div>
                <div class="radar-simple-center" style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 10px;
                    height: 10px;
                    background: #ffffff;
                    border-radius: 50%;
                    box-shadow: 0 0 10px #ffffff;
                "></div>
            </div>
        `;
    } else {
        radarContainer.innerHTML = `
            <div class="radar-circle" style="
                width: 200px;
                height: 200px;
                border: 2px solid rgba(255, 255, 255, 0.1);
                border-radius: 50%;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
            "></div>
            <div class="radar-circle" style="
                width: 150px;
                height: 150px;
                border: 2px solid rgba(255, 255, 255, 0.1);
                border-radius: 50%;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
            "></div>
            <div class="radar-circle" style="
                width: 100px;
                height: 100px;
                border: 2px solid rgba(255, 255, 255, 0.1);
                border-radius: 50%;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
            "></div>
            <div class="radar-scan" style="
                width: 100px;
                height: 100px;
                position: absolute;
                top: 50%;
                left: 50%;
                transform-origin: 0 0;
                transform: rotate(45deg) translate(-50%, -50%);
            ">
                <div style="
                    width: 100px;
                    height: 2px;
                    background: linear-gradient(90deg, transparent, #ffffff);
                    box-shadow: 0 0 10px #ffffff;
                    transform-origin: 0 0;
                "></div>
            </div>
            <div class="radar-center" style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 20px;
                height: 20px;
                background: #ffffff;
                border-radius: 50%;
                box-shadow: 0 0 20px #ffffff;
            "></div>
            <div class="radar-dot" style="
                position: absolute;
                top: 30%;
                left: 40%;
                width: 8px;
                height: 8px;
                background: #ffffff;
                border-radius: 50%;
                opacity: 0;
                animation: pulseDot 2s infinite;
            "></div>
            <div class="radar-dot" style="
                position: absolute;
                top: 60%;
                left: 70%;
                width: 8px;
                height: 8px;
                background: #ffffff;
                border-radius: 50%;
                opacity: 0;
                animation: pulseDot 2s infinite 0.5s;
            "></div>
            <div class="radar-dot" style="
                position: absolute;
                top: 40%;
                left: 20%;
                width: 8px;
                height: 8px;
                background: #ffffff;
                border-radius: 50%;
                opacity: 0;
                animation: pulseDot 2s infinite 1s;
            "></div>
        `;
    }
    
    return radarContainer;
}

function showRadarSearch() {
    const ordersList = document.getElementById('ordersList');
    
    if (!ordersList) {
        console.error('❌ Element ordersList tidak ditemukan!');
        return;
    }
    
    ordersList.innerHTML = `
        <div class="empty-state-with-radar">
            <div class="empty-state-title">📡 Mencari Order Terdekat...</div>
            <div class="empty-state-subtitle">
                Sistem sedang memindai area sekitar Anda untuk menemukan order yang tersedia.
            </div>
        </div>
    `;
    
    const emptyState = ordersList.querySelector('.empty-state-with-radar');
    
    const radar = createRadarAnimation(false);
    emptyState.insertBefore(radar, emptyState.querySelector('.empty-state-subtitle'));
    
    const radarText = document.createElement('div');
    radarText.className = 'radar-text';
    radarText.textContent = 'Memindai...';
    emptyState.appendChild(radarText);
    
    startRadarScanning();
}

function showLoadingRadar(message = 'Menyiapkan aplikasi...') {
    const loadingEl = document.getElementById('loadingOverlay');
    
    if (loadingEl) {
        loadingEl.innerHTML = `
            <div class="loading-radar">
                ${createRadarAnimation(true).outerHTML}
                <div id="loadingText" style="margin-top: 20px; font-weight: 600; color: var(--primary);">
                    ${message}
                </div>
            </div>
        `;
        loadingEl.style.display = 'flex';
    }
}

function startRadarScanning() {
    console.log('📡 Memulai radar scanning...');
    
    if (!driverLocation.latitude || !driverLocation.longitude) {
        console.log('📍 GPS tidak aktif, radar scanning menunggu lokasi...');
        
        const radarText = document.querySelector('.radar-text');
        if (radarText) {
            radarText.textContent = 'Menunggu lokasi GPS...';
            radarText.style.color = '#ff9800';
        }
        
        setTimeout(startRadarScanning, 3000);
        return;
    }
    
    const radarText = document.querySelector('.radar-text');
    if (radarText) {
        radarText.textContent = 'Memindai...';
        radarText.style.color = '#ffffff';
    }
    
    console.log('📍 Radar scanning aktif');
}

// ==================== FUNGSI BARU: SIMULASI ORDER BARU (UNTUK DEMO) ====================

function simulateNewOrderForDemo() {
    if (window.location.href.indexOf('file://') !== -1 || 
        window.location.hostname === 'localhost') {
        
        const ordersList = document.getElementById('ordersList');
        if (!ordersList) return;
        
        const radar = ordersList.querySelector('.radar-container');
        if (radar) {
            console.log('🎬 Mode Demo: Simulasi order baru ditemukan');
            
            ordersList.innerHTML = `
                <div class="empty-state-with-radar">
                    <div class="empty-state-title" style="color: #ffffff;">🎉 ORDER DITEMUKAN!</div>
                    <div class="empty-state-subtitle">
                        Radar berhasil menemukan order baru dalam radius Anda. 
                        Order akan segera muncul di daftar.
                    </div>
                    <div style="margin-top: 20px;">
                        <button onclick="refreshData()" style="padding: 10px 20px; background: var(--primary); color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600;">
                            Muat Ulang Daftar Order
                        </button>
                    </div>
                </div>
            `;
        }
    }
}

// ==================== FUNGSI UTAMA INISIALISASI APLIKASI ====================
function initJeGoApp() {
    console.log('🚀 Aplikasi JeGo diinisialisasi');
    
    if (!checkLoginStatus()) {
        console.log('🛑 Login tidak valid, set semua loading state ke true');
        setLoadingState('firebase', true);
        setLoadingState('gps', true);
        setLoadingState('driverData', true);
        setLoadingState('orders', true);
        setLoadingState('appInitialized', true);
        return;
    }
    
    setupEventListeners();
    
    // Buat container radar
    createRadarContainer();
    
    setTimeout(() => {
        startGPSMonitoring();
    }, 1000);
    
    loadDriverLocationFromStorage();
    
    setTimeout(() => {
        loadFilterTujuanFromFirebase();
    }, 1500);
    
    setTimeout(() => {
        loadOrders();
        
        setTimeout(() => {
            startRadarScanning();
        }, 2000);
    }, 500);
    
    setTimeout(() => {
        setupSidebarNavigation();
    }, 500);
    
    const acceptedOrder = getAcceptedOrderFromLocalStorage();
    if (acceptedOrder) {
        console.log('✅ Order yang diterima ditemukan di localStorage');
    }
    
    console.log('🔧 STATUS SISTEM FINAL:');
    console.log('- Tracking:', locationTrackingEnabled ? '✅ ON' : '❌ OFF');
    console.log('- Autobid:', autobidEnabled ? '✅ ON' : '❌ OFF');
    console.log('- Terima Kurir:', acceptKurirEnabled ? '✅ ON' : '❌ OFF');
    console.log('- Radius:', customRadius + ' km');
    console.log('- Validasi Sistem:', canSystemProcessOrder("auto") ? '✅ Aktif' : '❌ Nonaktif');
    console.log('- Radar System:', '✅ Siap');
    
    // Set appInitialized ke true setelah semua proses selesai
    setTimeout(() => {
        console.log('✅ Aplikasi siap, set appInitialized ke true');
        setLoadingState('appInitialized', true);
    }, 3000);
}

// ==================== SETUP EVENT LISTENERS ====================
function setupEventListeners() {
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) menuBtn.addEventListener('click', openSidebar);
    
    const closeSidebarBtn = document.getElementById('closeSidebar');
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
    
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
    
    const saveSettingsBtn = document.getElementById('saveSettings');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);
    
    const clearFilterTujuan = document.getElementById('clearFilterTujuan');
    if (clearFilterTujuan) clearFilterTujuan.addEventListener('click', function() {
        document.getElementById('filterTujuanInput').value = '';
        filterTujuanText = '';
    });
    
    const autobidToggle = document.getElementById('autobidToggle');
    if (autobidToggle) {
        autobidToggle.addEventListener('change', function(e) {
            console.log('🔍 autobidToggle changed:', e.target.checked);
            toggleAutobid();
        });
    }
    
    const acceptKurirToggle = document.getElementById('acceptKurirToggle');
    if (acceptKurirToggle) {
        acceptKurirToggle.addEventListener('change', function(e) {
            console.log('🔍 acceptKurirToggle changed:', e.target.checked);
            acceptKurirEnabled = e.target.checked;
            localStorage.setItem('jego_accept_kurir', acceptKurirEnabled);
            console.log('✅ acceptKurirEnabled disimpan ke localStorage:', acceptKurirEnabled);
            loadOrders();
        });
    }
    
    const radiusInput = document.getElementById('radiusInput');
    if (radiusInput) {
        radiusInput.addEventListener('change', function(e) {
            const value = parseFloat(e.target.value);
            if (value >= 0.1 && value <= 10) {
                customRadius = value;
            } else {
                e.target.value = customRadius;
                showPopup('Jarak radius harus antara 0.1 - 10 km', 'Validasi Error', 'warning');
            }
        });
    }
    
    const filterTujuanInput = document.getElementById('filterTujuanInput');
    if (filterTujuanInput) {
        filterTujuanInput.addEventListener('input', function(e) {
            filterTujuanText = e.target.value;
        });
    }
    
    const locationToggleBtn = document.getElementById('locationToggleBtn');
    if (locationToggleBtn) locationToggleBtn.addEventListener('click', toggleLocationTracking);
    
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshData);
    
    const closeModalBtn = document.getElementById('closeModal');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    
    const ambilBtn = document.getElementById('ambilBtn');
    if (ambilBtn) ambilBtn.addEventListener('click', sendDriverOffer);
    
    const popupButton = document.getElementById('popupButton');
    if (popupButton) popupButton.addEventListener('click', closePopup);
    
    const popupOverlay = document.getElementById('popupOverlay');
    if (popupOverlay) {
        popupOverlay.addEventListener('click', (e) => {
            if (e.target === popupOverlay) {
                closePopup();
            }
        });
    }
    
    const autobidModal = document.getElementById('autobidModal');
    if (autobidModal) {
        autobidModal.addEventListener('click', (e) => {
            if (e.target === autobidModal) {
                console.log('🚫 Modal Autobid tidak bisa di-close');
            }
        });
    }
    
    const orderModal = document.getElementById('orderModal');
    if (orderModal) {
        orderModal.addEventListener('click', (e) => {
            if (e.target === orderModal) closeModal();
        });
    }
    
    const closePhotoModalBtn = document.getElementById('closePhotoModal');
    if (closePhotoModalBtn) closePhotoModalBtn.addEventListener('click', closePhotoModal);
    
    const photoModal = document.getElementById('photoModal');
    if (photoModal) {
        photoModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closePhotoModal();
            }
        });
    }
    
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const screen = item.dataset.screen;
            console.log(`🔍 Klik nav item: ${screen}`);
            
            navigateToScreen(screen);
        });
    });
    
    if (window.location.href.indexOf('file://') !== -1 || 
        window.location.hostname === 'localhost') {
        
        setTimeout(() => {
            const headerControls = document.querySelector('.header-controls');
            if (headerControls && !document.getElementById('demoOrderBtn')) {
                const demoBtn = document.createElement('button');
                demoBtn.id = 'demoOrderBtn';
                demoBtn.innerHTML = '🎬 DEMO';
                demoBtn.style.cssText = `
                    background: rgba(255, 107, 53, 0.2);
                    color: #ff6b35;
                    border: none;
                    border-radius: 8px;
                    padding: 8px 12px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 0.75rem;
                    margin-left: 8px;
                `;
                demoBtn.title = 'Simulasi order baru (hanya untuk demo)';
                demoBtn.addEventListener('click', simulateNewOrderForDemo);
                
                headerControls.appendChild(demoBtn);
            }
        }, 2000);
    }
}

// ==================== INISIALISASI SAAT HALAMAN DIMUAT ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Halaman JeGo Driver dimuat');
    
    setTimeout(() => {
        const firebaseInitialized = initializeFirebase();
        
        if (firebaseInitialized) {
            console.log('✅ Firebase siap, inisialisasi aplikasi...');
        } else {
            console.log('⚠️ Firebase belum siap, tunggu inisialisasi...');
            setTimeout(() => {
                initJeGoApp();
            }, 3000);
        }
    }, 1000);
});

window.addEventListener('beforeunload', () => {
    if (locationWatchId) {
        navigator.geolocation.clearWatch(locationWatchId);
    }
    if (locationTrackingInterval) {
        clearInterval(locationTrackingInterval);
    }
    if (autobidInterval) {
        clearInterval(autobidInterval);
    }
    if (autobidProgressInterval) {
        clearInterval(autobidProgressInterval);
    }
    if (manualCheckInterval) {
        clearInterval(manualCheckInterval);
    }
    if (balanceListener) {
        const driverId = currentDriverData?.driverId;
        if (driverId) {
            database.ref('drivers/' + driverId + '/Balance').off('value', balanceListener);
        }
    }
    stopDriverDataRefresh();
    
    processStatusBatch();
});
