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
let firebaseInitialized = false;

// ==================== FUNGSI INISIALISASI FIREBASE YANG DIPERBAIKI ====================
function initializeFirebase() {
  console.log('🔄 Memulai inisialisasi Firebase...');
  
  if (firebaseInitialized) {
    console.log('✅ Firebase sudah diinisialisasi sebelumnya');
    return true;
  }
  
  try {
    // Cek apakah Firebase SDK sudah tersedia
    if (typeof firebase === 'undefined') {
      console.warn('⚠️ Firebase SDK belum terload');
      setTimeout(() => {
        if (typeof firebase === 'undefined') {
          console.error('❌ Firebase SDK tetap tidak terload setelah timeout');
          showConnectionError();
        }
      }, 3000);
      return false;
    }
    
    // Cek apakah sudah ada app yang diinisialisasi
    if (!firebase.apps.length) {
      firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
      console.log('✅ Firebase app baru diinisialisasi');
    } else {
      firebaseApp = firebase.app();
      console.log('✅ Firebase app sudah ada, menggunakan yang existing');
    }
    
    database = firebase.database();
    auth = firebase.auth();
    
    // Setup auth state listener dengan timeout
    setTimeout(() => {
      if (auth) {
        setupAuthStateListener();
      }
    }, 1000);
    
    firebaseInitialized = true;
    console.log('✅ Firebase berhasil diinisialisasi');
    return true;
    
  } catch (error) {
    console.error('❌ Error inisialisasi Firebase:', error);
    firebaseInitialized = false;
    
    setTimeout(() => {
      showConnectionError();
    }, 2000);
    
    return false;
  }
}

// ==================== FIREBASE AUTH STATE LISTENER ====================
function setupAuthStateListener() {
  if (!auth) {
    console.log('❌ Auth belum tersedia, delay setup listener');
    setTimeout(setupAuthStateListener, 1000);
    return;
  }
  
  console.log('👂 Setup auth state listener');
  
  auth.onAuthStateChanged((user) => {
    if (user) {
      console.log('✅ User authenticated:', user.uid);
      
      // Cek data driver di localStorage
      let currentDriverData = JSON.parse(localStorage.getItem('jego_driver_data') || '{}');
      
      // Update UID jika belum ada
      if (!currentDriverData.uid || currentDriverData.uid !== user.uid) {
        currentDriverData.uid = user.uid;
        currentDriverData.driverId = user.uid;
        localStorage.setItem('jego_driver_data', JSON.stringify(currentDriverData));
        console.log('✅ UID diperbarui di localStorage');
      }
      
      // Fetch data driver dari Firebase jika belum ada atau UID berubah
      fetchDriverDataFromFirebase(user.uid);
      
      sendToKodular({
        action: 'auth_state_changed',
        status: 'authenticated',
        uid: user.uid,
        message: 'Driver terautentikasi dengan Firebase'
      });
    } else {
      console.log('❌ User not authenticated atau logout');
      
      // Kirim event ke Kodular untuk redirect ke login
      sendToKodular({
        action: "navigate",
        target: "login",
        reason: "firebase_auth_expired"
      });
      
      // Tampilkan pesan user friendly
      showInfoMessage('Sesi login telah berakhir. Silakan login kembali.', true);
    }
  }, (error) => {
    console.error('❌ Error auth state listener:', error);
  });
}

// ==================== FUNGSI BARU: AMBIL DATA DRIVER DARI FIREBASE ====================
async function fetchDriverDataFromFirebase(driverUid) {
  console.log('🔍 Mengambil data driver dari Firebase dengan UID:', driverUid);
  
  if (!database) {
    console.log('❌ Database belum siap, delay fetch');
    setTimeout(() => fetchDriverDataFromFirebase(driverUid), 2000);
    return;
  }
  
  try {
    const driverRef = database.ref('drivers/' + driverUid);
    const snapshot = await driverRef.once('value');
    
    if (!snapshot.exists()) {
      console.error('❌ Data driver tidak ditemukan di Firebase untuk UID:', driverUid);
      
      // Coba lagi setelah delay
      setTimeout(() => fetchDriverDataFromFirebase(driverUid), 3000);
      return;
    }
    
    const driverData = snapshot.val();
    console.log('✅ Data driver ditemukan di Firebase:', {
      name: driverData.fullName || driverData.name,
      phone: driverData.phoneNumber || driverData.phone,
      status: driverData.status
    });
    
    // Tambahkan UID ke data driver
    driverData.uid = driverUid;
    driverData.driverId = driverUid;
    
    // Simpan ke localStorage sebagai cache
    localStorage.setItem('jego_driver_data', JSON.stringify(driverData));
    localStorage.setItem('jego_driver_logged_in', 'true');
    localStorage.setItem('jego_driver_status', driverData.status || 'active');
    localStorage.setItem('jego_driver_uid', driverUid);
    
    console.log('✅ Data driver disimpan ke localStorage');
    
    // Update currentDriverData jika aplikasi sudah berjalan
    if (window.currentDriverData) {
      window.currentDriverData = driverData;
      window.currentUserData = driverData;
    }
    
    // Refresh orders jika sudah ada listener
    if (window.loadOrders && typeof window.loadOrders === 'function') {
      setTimeout(() => {
        loadOrders();
      }, 1000);
    }
    
    return driverData;
    
  } catch (error) {
    console.error('❌ Error mengambil data driver dari Firebase:', error);
    
    // Coba lagi setelah delay
    setTimeout(() => fetchDriverDataFromFirebase(driverUid), 5000);
    return null;
  }
}

// ==================== FUNGSI VERIFIKASI FIREBASE AUTH YANG DIPERBAIKI ====================
function verifyFirebaseAuth() {
  try {
    if (!auth) {
      console.log('⚠️ Firebase Auth belum siap');
      return false;
    }
    
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.log('❌ Tidak ada user yang login di Firebase Auth');
      return false;
    }
    
    // Ambil UID dari localStorage untuk cross-check
    const storedDriverData = JSON.parse(localStorage.getItem('jego_driver_data') || '{}');
    const storedUid = storedDriverData.uid || storedDriverData.driverId;
    
    if (!storedUid) {
      console.log('⚠️ Tidak ada UID di localStorage, sync dengan Firebase');
      storedDriverData.uid = currentUser.uid;
      storedDriverData.driverId = currentUser.uid;
      localStorage.setItem('jego_driver_data', JSON.stringify(storedDriverData));
      return true;
    }
    
    if (currentUser.uid !== storedUid) {
      console.warn('⚠️ UID tidak cocok, sync ulang:', { 
        firebaseUid: currentUser.uid, 
        storedUid: storedUid 
      });
      
      // Sync UID
      storedDriverData.uid = currentUser.uid;
      storedDriverData.driverId = currentUser.uid;
      localStorage.setItem('jego_driver_data', JSON.stringify(storedDriverData));
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Error verifikasi Firebase Auth:', error);
    return false;
  }
}

// ==================== FUNGSI BARU: CEK STATUS LOGIN YANG DIPERBAIKI ====================
function checkIfDriverLoggedIn() {
  console.log("🔍 Memeriksa status login driver...");
  
  try {
    // 1. Cek localStorage terlebih dahulu (lebih cepat)
    const loggedInDriver = localStorage.getItem('jego_driver_data');
    const isLoggedIn = localStorage.getItem('jego_driver_logged_in');
    const driverStatus = localStorage.getItem('jego_driver_status');
    
    if (!loggedInDriver || isLoggedIn !== 'true' || driverStatus !== 'active') {
      console.log("❌ Driver belum login atau tidak aktif di localStorage");
      return false;
    }
    
    const driverData = JSON.parse(loggedInDriver);
    
    // 2. Cek apakah ada data minimal yang diperlukan
    if (!driverData.driverId && !driverData.uid) {
      console.log("❌ Tidak ada driverId atau UID di localStorage");
      return false;
    }
    
    // 3. Cek Firebase Auth (tapi jangan block jika Firebase belum siap)
    if (auth && auth.currentUser) {
      console.log("✅ Driver login via Firebase Auth");
      
      // Sync UID jika perlu
      if (driverData.uid !== auth.currentUser.uid) {
        console.log("🔄 Sync UID dengan Firebase Auth");
        driverData.uid = auth.currentUser.uid;
        driverData.driverId = auth.currentUser.uid;
        localStorage.setItem('jego_driver_data', JSON.stringify(driverData));
      }
      
      return true;
    } else {
      console.log("⚠️ Firebase Auth belum siap, gunakan localStorage");
      // Jika Firebase belum siap, tetap izinkan dengan cache localStorage
      // Tapi kirim request untuk verifikasi nanti
      setTimeout(() => {
        if (auth && !auth.currentUser) {
          console.log("⚠️ Firebase Auth masih kosong, coba sync");
          sendToKodular({
            action: "check_auth_status",
            message: "Memeriksa status autentikasi"
          });
        }
      }, 3000);
      
      return true; // Izinkan dengan cache sementara
    }
    
  } catch (error) {
    console.error('❌ Error checking driver login:', error);
    return false;
  }
}

// ==================== FUNGSI GET DRIVER DATA YANG DIPERBAIKI ====================
function getDriverData() {
  console.log("🔍 Memulai getDriverData");
  
  try {
    // 1. Coba ambil dari localStorage terlebih dahulu (cepat)
    const loggedInUser = localStorage.getItem('jego_driver_data');
    
    if (loggedInUser) {
      const driverData = JSON.parse(loggedInUser);
      
      // Cek data minimal
      if (!driverData.driverId && !driverData.uid) {
        console.log("❌ Data driver tidak lengkap di localStorage");
        return null;
      }
      
      console.log("✅ Driver data ditemukan di localStorage:", {
        name: driverData.fullName || driverData.name,
        phone: driverData.phoneNumber || driverData.phone,
        driverId: driverData.driverId,
        uid: driverData.uid
      });
      
      // Mapping field yang diperlukan
      const mappedDriverData = {
        // Field utama
        firebase_key: driverData.driverId || driverData.uid,
        uid: driverData.driverId || driverData.uid,
        key: driverData.driverId || driverData.uid,
        
        // Field identitas
        name: driverData.fullName || driverData.name,
        phone: driverData.phoneNumber || driverData.phone,
        email: driverData.email || '',
        
        // Field rating/perjalanan
        rating: driverData.avgRating || driverData.rating || 5,
        perjalanan: driverData.totalTrips || driverData.perjalanan || 0,
        
        // Field foto profil
        fotoProfilURL: driverData.profilePhotoUrl || driverData.fotoProfilURL || '',
        
        // Field kendaraan driver
        vehicle_type: driverData.vehicleType || driverData.vehicle_type,
        vehicle_brand: driverData.vehicleBrand || driverData.vehicle_brand,
        plate_number: driverData.plateNumber || driverData.plate_number,
        
        // Field status/role
        status: driverData.status || 'active',
        role: 'driver',
        
        // Metadata
        createdAt: driverData.createdAt || new Date().toISOString(),
        
        // Data driver lengkap
        ...driverData
      };
      
      console.log("✅ Driver data setelah mapping:", mappedDriverData.name);
      return mappedDriverData;
    }
    
    console.log("❌ Tidak ada data driver di localStorage");
    
    // 2. Coba ambil dari Firebase Auth jika tersedia
    if (auth && auth.currentUser) {
      const uid = auth.currentUser.uid;
      console.log("🔍 Mencoba fetch data driver dari Firebase dengan UID:", uid);
      
      // Fetch async, tapi return null dulu
      fetchDriverDataFromFirebase(uid);
      return null;
    }
    
    return null;
    
  } catch (error) {
    console.error('❌ Error mengambil data driver:', error);
    return null;
  }
}

// ==================== FUNGSI POPUP CUSTOM ====================

// Fungsi untuk menampilkan popup dengan error handling
function showPopup(message, title = "Pemberitahuan", type = "info") {
  const popupOverlay = document.getElementById('popupOverlay');
  const popupTitle = document.getElementById('popupTitle');
  const popupMessage = document.getElementById('popupMessage');
  const popupIcon = document.getElementById('popupIcon');
  const popupButton = document.getElementById('popupButton');
  
  // Cek jika element popup ada
  if (!popupOverlay || !popupTitle || !popupMessage || !popupIcon || !popupButton) {
    console.error('❌ Element popup tidak ditemukan');
    // Fallback ke alert
    alert(`${title}: ${message}`);
    return;
  }
  
  try {
    // Set konten popup
    popupTitle.textContent = title;
    popupMessage.textContent = message;
    
    // Set ikon dan warna berdasarkan tipe
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
    
    // Tampilkan popup
    popupOverlay.style.display = 'flex';
    setTimeout(() => {
      popupOverlay.classList.add('active');
    }, 10);
    
  } catch (error) {
    console.error('❌ Error menampilkan popup:', error);
    // Fallback ke alert
    alert(`${title}: ${message}`);
  }
}

// Fungsi untuk menutup popup
function closePopup() {
  const popupOverlay = document.getElementById('popupOverlay');
  if (popupOverlay) {
    popupOverlay.style.display = 'none';
    popupOverlay.classList.remove('active');
  }
}

// ==================== FUNGSI UTAMA SEND TO KODULAR - DIPERBAIKI ====================
function sendToKodular(data) {
    console.log('📤 Mengirim data ke Kodular:', data);
    
    // Konversi data ke string JSON
    const jsonString = JSON.stringify(data);
    console.log('📦 Data JSON:', jsonString);
    
    // Prioritaskan AppInventor (Kodular)
    if (typeof window.AppInventor !== 'undefined') {
        console.log('📱 Deteksi AppInventor (Kodular)');
        try {
            if (window.AppInventor.setWebViewString) {
                window.AppInventor.setWebViewString(jsonString);
                console.log('✅ Data berhasil dikirim via AppInventor.setWebViewString');
                return true;
            }
        } catch (error) {
            console.error('❌ Error mengirim via AppInventor:', error);
        }
    }
    
    // Fallback untuk Android
    else if (typeof window.android !== 'undefined') {
        console.log('📱 Deteksi Android');
        try {
            if (window.android.receiveData) {
                window.android.receiveData(jsonString);
                console.log('✅ Data berhasil dikirim via android.receiveData');
                return true;
            } else if (window.android.sendDataToKodular) {
                window.android.sendDataToKodular(jsonString);
                console.log('✅ Data berhasil dikirim via android.sendDataToKodular');
                return true;
            }
        } catch (error) {
            console.error('❌ Error mengirim via android:', error);
        }
    }
    
    // Fallback untuk iOS
    else if (window.webkit && window.webkit.messageHandlers) {
        console.log('📱 Deteksi iOS (WKWebView)');
        try {
            if (window.webkit.messageHandlers.observe) {
                window.webkit.messageHandlers.observe.postMessage(data);
                console.log('✅ Data berhasil dikirim via webkit.messageHandlers');
                return true;
            }
        } catch (error) {
            console.error('❌ Error mengirim via webkit:', error);
        }
    }
    
    // Metode alternatif menggunakan prompt (untuk debugging)
    else if (window.location.href.indexOf('file://') === -1) {
        console.log('🔧 Coba metode prompt untuk debugging');
        try {
            const result = prompt('KodularBridge', jsonString);
            if (result) {
                console.log('✅ Data berhasil dikirim via prompt');
                return true;
            }
        } catch (error) {
            console.error('❌ Error mengirim via prompt:', error);
        }
    }
    
    console.log('🔕 Mode browser: Tidak ada bridge ke Kodular yang terdeteksi');
    
    // Untuk debugging di browser, tampilkan data di console
    console.log('🔄 Data yang akan dikirim ke Kodular (browser mode):', data);
    
    return false;
}

// ==================== FUNGSI BARU: Ambil URL foto customer dengan fallback ====================
function getCustomerPhoto(order) {
    // Cek di berbagai kemungkinan lokasi data foto
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

// ==================== FUNGSI UNTUK FORMAT WAKTU ORDER ====================
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

// ==================== FUNGSI VALIDASI PUSAT ====================
function canSystemProcessOrder(source) {
    // source: "manual" (klik user) atau "auto" (sistem otomatis)
    if (source === "manual") {
        // Klik manual selalu diizinkan
        console.log("✅ Validasi: Source MANUAL - diizinkan");
        return true;
    } else if (source === "auto") {
        // Sistem otomatis hanya diizinkan jika tracking ON
        const isAllowed = locationTrackingEnabled;
        console.log(`✅ Validasi: Source AUTO - Tracking ${locationTrackingEnabled ? 'ON' : 'OFF'} -> ${isAllowed ? 'diizinkan' : 'ditolak'}`);
        return isAllowed;
    }
    return false;
}

// ==================== CEK LOGIN DAN KIRIM EVENT KE KODULAR ====================
function checkLoginStatus() {
    console.log('🔍 Memeriksa status login...');
    
    // Gunakan fungsi checkIfDriverLoggedIn yang sudah diperbaiki
    const isLoggedIn = checkIfDriverLoggedIn();
    
    if (!isLoggedIn) {
        console.log('❌ Driver belum login atau tidak aktif, kirim event ke Kodular');
        
        // Kirim event login ke Kodular
        sendToKodular({
            action: "navigate",
            target: "login",
            reason: "not_logged_in_or_inactive"
        });
        
        // Tampilkan pesan user friendly
        showInfoMessage('Silakan login terlebih dahulu untuk melanjutkan.', true);
        return false;
    }
    
    console.log('✅ Driver sudah login');
    return true;
}

// ==================== FUNGSI NOTIFIKASI SUARA ====================
function playNewOrderSound() {
    try {
        const audio = document.getElementById('newOrderSound');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.log('Gagal memutar suara order baru:', e));
        }
    } catch (error) {
        console.error('Error memutar suara order baru:', error);
    }
}

function playAutobidSound() {
    try {
        const audio = document.getElementById('autobidSound');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.log('Gagal memutar suara autobid:', e));
        }
    } catch (error) {
        console.error('Error memutar suara autobid:', error);
    }
}

function playOrderAcceptedSound() {
    try {
        const audio = document.getElementById('orderAcceptedSound');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.log('Gagal memutar suara order diterima:', e));
        }
        
        // KIRIM EVENT KE KODULAR (BUKAN REDIRECT)
        if (currentSelectedOrder) {
            const orderId = currentSelectedOrder.order_id || currentSelectedOrder.id;
            sendToKodular({
                action: "order_accepted",
                order_id: orderId
            });
        }
        
    } catch (error) {
        console.error('Error memutar suara order diterima:', error);
        // Fallback: kirim event ke Kodular
        if (currentSelectedOrder) {
            const orderId = currentSelectedOrder.order_id || currentSelectedOrder.id;
            sendToKodular({
                action: "order_accepted",
                order_id: orderId
            });
        }
    }
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

// ==================== VARIABEL BARU UNTUK GPS ====================
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

// ==================== VARIABEL BARU UNTUK LOCATION TRACKING ====================
let locationTrackingEnabled = false;
let locationTrackingInterval = null;

// ==================== VARIABEL UNTUK KONTROL PENGIRIMAN DATA KE KODULAR ====================
let lastSentOrdersCount = null;
let lastSentOrdersHash = null;
let isInitialLoad = true;

// ==================== VARIABEL BARU UNTUK PROGRESS AUTOBID ====================
let autobidProgressInterval = null;
let autobidProgressTimeLeft = 30;

// ==================== VARIABEL UNTUK SISTEM SALDO (TANPA PEMOTONGAN) ====================
let currentDriverBalance = 0;
let balanceListener = null;

// ==================== VARIABEL BARU UNTUK MANUAL CHECK INTERVAL ====================
let manualCheckInterval = null;

// ==================== VARIABEL BARU UNTUK MENU LAYOUT ====================
let acceptKurirEnabled = true;
let customRadius = 1.0; // Default 1km
let filterTujuanEnabled = false;
let filterTujuanText = '';
let filterTujuanData = null;

// ==================== FUNGSI PERHITUNGAN HARGA DENGAN DISKON ====================
function calculateDiscountedPrice(order) {
    // Jika tidak ada diskon, kembalikan harga normal
    if (!order.diskon_persen || order.diskon_persen === 0) {
        return {
            hargaAsal: order.harga_total,
            hargaDiskon: order.harga_total,
            hasDiscount: false,
            diskonAmount: 0
        };
    }
    
    // Hitung harga diskon
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

// ==================== FUNGSI NAVIGASI BOTTOM NAV YANG DIPERBARUI ====================
function navigateToScreen(screen) {
    console.log(`🔄 Navigasi ke screen: ${screen}`);
    
    // Update tampilan navigasi
    updateActiveNavItem(screen);
    
    // Kirim event navigasi ke Kodular
    const success = sendToKodular({
        action: "navigate",
        target: screen,
        timestamp: new Date().getTime()
    });
    
    console.log(`📤 Hasil pengiriman navigasi ke ${screen}: ${success ? 'Berhasil' : 'Gagal'}`);
    
    if (!success) {
        // Fallback untuk browser: tampilkan pesan menggunakan showPopup baru
        showPopup(`Navigasi ke ${screen} - Mode browser aktif`, 'Info', 'info');
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
    console.log('🔍 Memulai interval pemindaian manual...');
    
    // Hentikan interval sebelumnya jika ada
    stopManualCheckInterval();
    
    // Jalankan pemindaian manual setiap 5 detik
    manualCheckInterval = setInterval(() => {
        if (locationTrackingEnabled && !autobidEnabled && 
            driverLocation.latitude && driverLocation.longitude) {
            checkOrdersForManualPopup();
        }
    }, 5000);
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
    // Cek koneksi Firebase
    if (!database) {
        showPopup('Tidak terhubung ke server. Periksa koneksi internet Anda.', 'Koneksi Error', 'error');
        return;
    }

    locationTrackingEnabled = !locationTrackingEnabled;
    updateLocationToggleButton();
    
    // UPDATE: Jika tracking ON, aktifkan tombol autobid toggle
    updateAutobidToggleStatus();
    
    if (locationTrackingEnabled) {
        // Cek apakah GPS aktif
        if (!driverLocation.latitude || !driverLocation.longitude) {
            showPopup('GPS diperlukan untuk mengaktifkan tracking. Pastikan lokasi Anda aktif.', 'GPS Error', 'warning');
            locationTrackingEnabled = false;
            updateLocationToggleButton();
            updateAutobidToggleStatus();
            return;
        }
        
        startLocationTracking();
        
        // JALANKAN INTERVAL MANUAL JIKA AUTOBID OFF
        if (!autobidEnabled) {
            startManualCheckInterval();
            // Jalankan juga sekali langsung
            setTimeout(() => {
                checkOrdersForManualPopup();
            }, 1000);
        }
        
    } else {
        // UPDATE: Jika tracking OFF, matikan autobid jika sedang aktif
        if (autobidEnabled) {
            autobidEnabled = false;
            stopAutobid();
            updateAutobidButton();
        }
        
        stopLocationTracking();
        stopManualCheckInterval(); // HENTIKAN INTERVAL MANUAL
    }
    
    localStorage.setItem('jego_location_tracking_enabled', locationTrackingEnabled);
}

// FUNGSI BARU: Update status toggle autobid berdasarkan tracking
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
    if (locationToggleBtn) {
        if (locationTrackingEnabled) {
            locationToggleBtn.innerHTML = '<span>📍</span> ON';
            locationToggleBtn.classList.add('active');
        } else {
            locationToggleBtn.innerHTML = '<span>📍</span> OFF';
            locationToggleBtn.classList.remove('active');
        }
    }
}

function startLocationTracking() {
    console.log('📍 Memulai location tracking...');
    
    sendLocationToFirebase();
    
    locationTrackingInterval = setInterval(() => {
        sendLocationToFirebase();
    }, 10000);
}

function stopLocationTracking() {
    console.log('🛑 Menghentikan location tracking...');
    if (locationTrackingInterval) {
        clearInterval(locationTrackingInterval);
        locationTrackingInterval = null;
    }
    
    if (currentDriverData && currentDriverData.driverId) {
        const driverId = currentDriverData.driverId;
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
// Fungsi untuk membuka sidebar
function openSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.style.display = 'block';
        loadSettingsToUI();
        updateStatusInfo();
    }
}

// Fungsi untuk menutup sidebar
function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.style.display = 'none';
    }
}

// Fungsi untuk memuat pengaturan ke UI
function loadSettingsToUI() {
    console.log('🔄 Memuat pengaturan ke UI...');
    
    // Load dari localStorage
    const savedAcceptKurir = localStorage.getItem('jego_accept_kurir');
    const savedRadius = localStorage.getItem('jego_custom_radius');
    const savedFilterTujuan = localStorage.getItem('jego_filter_tujuan');
    
    console.log('📋 Nilai savedAcceptKurir dari localStorage:', savedAcceptKurir);
    
    // PERBAIKAN: Gunakan perbandingan yang benar untuk boolean dari localStorage
    if (savedAcceptKurir !== null) {
        acceptKurirEnabled = savedAcceptKurir === 'true';
    } else {
        acceptKurirEnabled = true; // Default value
    }
    
    console.log('✅ acceptKurirEnabled setelah parsing:', acceptKurirEnabled);
    
    // Set nilai ke UI
    const autobidToggle = document.getElementById('autobidToggle');
    const acceptKurirToggle = document.getElementById('acceptKurirToggle');
    const radiusInput = document.getElementById('radiusInput');
    
    if (autobidToggle) autobidToggle.checked = autobidEnabled;
    if (acceptKurirToggle) acceptKurirToggle.checked = acceptKurirEnabled;
    if (radiusInput) radiusInput.value = customRadius = savedRadius ? parseFloat(savedRadius) : 1.0;
    
    if (savedFilterTujuan) {
        const filterData = JSON.parse(savedFilterTujuan);
        const filterTujuanInput = document.getElementById('filterTujuanInput');
        if (filterTujuanInput) {
            filterTujuanInput.value = filterTujuanText = filterData.text || '';
        }
    }
    
    // Update status toggle autobid berdasarkan tracking
    updateAutobidToggleStatus();
}

// PERBAIKAN: Fungsi untuk menyimpan pengaturan (TOMBOL SIMPAN PENGATURAN)
function saveSettings() {
    console.log('💾 Menyimpan pengaturan...');
    
    try {
        // Ambil nilai langsung dari UI untuk memastikan nilai terbaru
        const acceptKurirToggle = document.getElementById('acceptKurirToggle');
        const radiusInput = document.getElementById('radiusInput');
        const filterTujuanInput = document.getElementById('filterTujuanInput');
        
        if (acceptKurirToggle) acceptKurirEnabled = acceptKurirToggle.checked;
        if (radiusInput) customRadius = parseFloat(radiusInput.value);
        if (filterTujuanInput) filterTujuanText = filterTujuanInput.value;
        
        // Validasi radius
        if (isNaN(customRadius) || customRadius < 0.1 || customRadius > 10) {
            showPopup('Jarak radius harus antara 0.1 - 10 km', 'Validasi Error', 'warning');
            if (radiusInput) radiusInput.value = 1.0;
            customRadius = 1.0;
            return;
        }
        
        console.log('✅ Pengaturan yang akan disimpan:');
        console.log('- acceptKurirEnabled:', acceptKurirEnabled);
        console.log('- customRadius:', customRadius);
        console.log('- filterTujuanText:', filterTujuanText);
        
        // Simpan ke localStorage
        localStorage.setItem('jego_accept_kurir', acceptKurirEnabled);
        localStorage.setItem('jego_custom_radius', customRadius);
        localStorage.setItem('jego_filter_tujuan', JSON.stringify({
            text: filterTujuanText,
            enabled: filterTujuanEnabled
        }));
        
        console.log('✅ Pengaturan disimpan ke localStorage');
        
        // Update status
        if (autobidEnabled) {
            updateAutobidButton();
        }
        
        // Refresh orders list dengan filter baru
        loadOrders();
        
        // Tutup sidebar
        closeSidebar();
        
        // Tampilkan konfirmasi menggunakan showPopup baru
        showPopup('Pengaturan berhasil disimpan dan diterapkan', 'Sukses', 'success');
        
        // Kirim event ke Kodular
        sendToKodular({
            action: 'settings_saved',
            accept_kurir: acceptKurirEnabled,
            radius: customRadius,
            filter_tujuan: filterTujuanText,
            message: 'Pengaturan driver berhasil disimpan'
        });
        
    } catch (error) {
        console.error('❌ Error menyimpan pengaturan:', error);
        showPopup('Gagal menyimpan pengaturan. Silakan coba lagi.', 'Error', 'error');
    }
}

// Fungsi untuk update info status di sidebar
function updateStatusInfo() {
    const gpsStatusInfo = document.getElementById('gpsStatusInfo');
    const trackingStatusInfo = document.getElementById('trackingStatusInfo');
    const balanceStatusInfo = document.getElementById('balanceStatusInfo');
    
    if (gpsStatusInfo) {
        gpsStatusInfo.textContent = driverLocation.latitude ? 'Aktif' : 'Tidak aktif';
        gpsStatusInfo.style.color = driverLocation.latitude ? '#28a745' : '#dc3545';
    }
    
    if (trackingStatusInfo) {
        trackingStatusInfo.textContent = locationTrackingEnabled ? 'ON' : 'OFF';
        trackingStatusInfo.style.color = locationTrackingEnabled ? '#28a745' : '#dc3545';
    }
    
    if (balanceStatusInfo) {
        balanceStatusInfo.textContent = `Rp ${currentDriverBalance.toLocaleString('id-ID')}`;
        balanceStatusInfo.style.color = currentDriverBalance > 10000 ? '#28a745' : '#ff6b6b';
    }
}

// ==================== FUNGSI LOAD FILTER TUJUAN DARI FIREBASE ====================
function loadFilterTujuanFromFirebase() {
    if (!database) {
        console.log('❌ Database belum siap, delay load filter');
        setTimeout(loadFilterTujuanFromFirebase, 2000);
        return;
    }
    
    const filterRef = database.ref('DataJego/Filter');
    
    filterRef.once('value').then(snapshot => {
        filterTujuanData = snapshot.val();
        
        if (filterTujuanData && filterTujuanData.status === 'ON') {
            // Tampilkan container filter tujuan
            const filterTujuanContainer = document.getElementById('filterTujuanContainer');
            if (filterTujuanContainer) {
                filterTujuanContainer.style.display = 'block';
            }
            
            // Cek apakah driver termasuk dalam daftar yang diizinkan
            if (currentDriverData && currentDriverData.driverId) {
                const driverId = currentDriverData.driverId;
                
                if (filterTujuanData.All === true) {
                    // Semua driver bisa menggunakan filter
                    filterTujuanEnabled = true;
                } else if (filterTujuanData.driver_id) {
                    // Hanya driver tertentu yang bisa menggunakan filter
                    const allowedDrivers = filterTujuanData.driver_id.split(',').map(id => id.trim());
                    filterTujuanEnabled = allowedDrivers.includes(driverId);
                } else {
                    filterTujuanEnabled = false;
                }
                
                // Nonaktifkan input jika driver tidak diizinkan
                const filterInput = document.getElementById('filterTujuanInput');
                if (filterInput) {
                    filterInput.disabled = !filterTujuanEnabled;
                    filterInput.placeholder = filterTujuanEnabled ? 
                        'Contoh: Kota Gorontalo, Tilongkabila, Limboto' : 
                        'Tidak diizinkan untuk driver Anda';
                    
                    const filterContainer = document.getElementById('filterTujuanContainer');
                    if (filterContainer) {
                        if (!filterTujuanEnabled) {
                            filterContainer.style.opacity = '0.6';
                        } else {
                            filterContainer.style.opacity = '1';
                        }
                    }
                }
            }
        }
    }).catch(error => {
        console.error('Error loading filter tujuan:', error);
    });
}

// ==================== FUNGSI NAVIGASI SIDEBAR ====================
function setupSidebarNavigation() {
    // Dapatkan semua tombol navigasi sidebar
    const sidebarNavButtons = document.querySelectorAll('.sidebar-nav-button');
    
    // Tambahkan event listener untuk setiap tombol
    sidebarNavButtons.forEach(button => {
        button.addEventListener('click', function() {
            const screen = this.getAttribute('data-screen');
            const buttonId = this.getAttribute('id');
            const buttonTitle = this.querySelector('.sidebar-nav-button-title').textContent;
            
            console.log(`🔄 Tombol sidebar diklik: ${buttonId} (${screen})`);
            
            // Kirim data ke Kodular
            const success = sendToKodular({
                action: "navigate",
                target: screen,
                button_id: buttonId,
                button_title: buttonTitle,
                timestamp: new Date().getTime()
            });
            
            console.log(`📤 Hasil pengiriman ke Kodular: ${success ? 'Berhasil' : 'Gagal'}`);
            
            // Tutup sidebar setelah mengklik
            closeSidebar();
            
            // Tampilkan konfirmasi jika di browser (debug mode)
            if (!success) {
                showPopup(`Navigasi ke "${buttonTitle}" - Mode browser aktif`, 'Info', 'info');
            }
        });
    });
}

// ==================== UPDATE FUNGSI FILTER ORDER ====================
function filterOrderByType(order) {
    if (currentFilter === 'all') {
        // Filter berdasarkan checkbox "Terima Kurir"
        const isKurir = order.vehicle && order.vehicle.includes('kurir');
        if (!acceptKurirEnabled && isKurir) {
            console.log(`⏭️ Filter: Skip order kurir karena acceptKurirEnabled = false`);
            return false;
        }
        return true;
    }
    
    const isKurir = order.vehicle && order.vehicle.includes('kurir');
    
    // Filter berdasarkan checkbox "Terima Kurir"
    if (!acceptKurirEnabled && isKurir) {
        console.log(`⏭️ Filter: Skip order kurir karena acceptKurirEnabled = false`);
        return false;
    }
    
    if (currentFilter === 'penumpang') return !isKurir;
    if (currentFilter === 'kurir') return isKurir;
    
    return true;
}

// Update fungsi checkOrderInRadius untuk menggunakan custom radius
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
    
    console.log(`📍 Jarak driver ke order ${order.order_id || order.id}: ${distance.toFixed(2)} KM (Radius: ${customRadius}km)`);
    
    return distance <= customRadius;
}

// ==================== FUNGSI FILTER TUJUAN MULTIPLE KEYWORD (DIPERBAIKI) ====================
function checkFilterTujuan(order) {
    if (!filterTujuanEnabled || !filterTujuanText.trim()) {
        return true; // Tidak ada filter, semua order diterima
    }
    
    const searchText = filterTujuanText.toLowerCase().trim();
    
    // Jika kosong, terima semua
    if (!searchText) return true;
    
    // Pisah berdasarkan koma, trim spasi, hilangkan yang kosong
    const keywords = searchText.split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
    
    // Jika tidak ada keyword valid, terima semua
    if (keywords.length === 0) return true;
    
    const alamatB = (order.alamat_b || '').toLowerCase();
    const tujuan = (order.tujuan || '').toLowerCase();
    
    // Cek apakah SALAH SATU keyword ada di alamat_b atau tujuan
    const result = keywords.some(keyword => 
        alamatB.includes(keyword) || tujuan.includes(keyword)
    );
    
    console.log(`🔍 Filter Tujuan: Keywords "${keywords.join('", "')}"`);
    console.log(`   vs "${alamatB}" = ${result}`);
    
    return result;
}

// ==================== FUNGSI TOGGLE AUTOBID YANG DIPERBARUI ====================
function toggleAutobid() {
    // Cek koneksi Firebase
    if (!database) {
        showPopup('Tidak terhubung ke server. Periksa koneksi internet Anda.', 'Koneksi Error', 'error');
        return;
    }

    // Cek apakah location tracking aktif
    if (!locationTrackingEnabled) {
        showPopup('Aktifkan tracking terlebih dahulu untuk menggunakan autobid', 'Peringatan', 'warning');
        // Reset toggle button di UI
        const autobidToggle = document.getElementById('autobidToggle');
        if (autobidToggle) {
            autobidToggle.checked = false;
        }
        return;
    }

    if (!driverLocation.latitude || !driverLocation.longitude) {
        showPopup('GPS diperlukan untuk mengaktifkan Autobid. Pastikan lokasi Anda aktif.', 'GPS Error', 'warning');
        updateGPSStatus(false, 'GPS diperlukan untuk Autobid');
        const autobidToggle = document.getElementById('autobidToggle');
        if (autobidToggle) {
            autobidToggle.checked = false;
        }
        return;
    }

    autobidEnabled = !autobidEnabled;
    updateAutobidButton();
    
    if (autobidEnabled) {
        // HENTIKAN INTERVAL MANUAL, JALANKAN AUTOBID
        stopManualCheckInterval();
        startAutobid();
    } else {
        // HENTIKAN AUTOBID, JALANKAN INTERVAL MANUAL
        stopAutobid();
        startManualCheckInterval();
        
        // Jalankan sekali langsung untuk menampilkan order yang ada
        setTimeout(() => {
            checkOrdersForManualPopup();
        }, 1000);
    }
    
    localStorage.setItem('jego_autobid_enabled', autobidEnabled);
}

function updateAutobidButton() {
    // Update toggle switch di menu
    const autobidToggle = document.getElementById('autobidToggle');
    if (autobidToggle) {
        autobidToggle.checked = autobidEnabled;
    }
}

// ==================== FUNGSI BARU: CEK ORDER UNTUK POPUP MANUAL ====================
function checkOrdersForManualPopup() {
    // GUARD: Sistem otomatis harus tracking ON
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
                
                // Untuk order kurir, validasi radius
                if (isKurir) {
                    const isInRadius = checkOrderInRadius(order);
                    if (!isInRadius) {
                        console.log(`⏭️ Manual Popup: Skip order kurir ${orderId} (di luar radius)`);
                        return;
                    }
                    console.log(`🎯 Manual Popup: Order KURIR ${orderId} dalam radius, menampilkan modal...`);
                }
                
                // Filter lainnya
                if (!acceptKurirEnabled && isKurir) {
                    return;
                }
                
                const matchesTujuan = checkFilterTujuan(order);
                if (!matchesTujuan && filterTujuanText.trim()) {
                    return;
                }
                
                processedOrders.add(orderId);
                foundOrder = true;
                
                // KIRIM NOTIFIKASI KE KODULAR
                sendToKodular({
                    action: 'manual_order_found',
                    order_id: orderId,
                    order_type: isKurir ? 'kurir' : 'penumpang',
                    in_radius: true,
                    message: `Order ${isKurir ? 'kurir' : 'penumpang'} terdekat ditemukan.`
                });
                
                // Tampilkan modal manual
                showOrderDetail(order);
                return;
            }
        });
    }
}

// ==================== FUNGSI AUTOBID YANG DIPERBARUI ====================
function checkOrdersForAutobid() {
    // GUARD 1: Validasi sistem otomatis
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
                
                // GUARD 2: Filter order kurir untuk autobid
                const isKurir = order.vehicle && order.vehicle.includes('kurir');
                if (isKurir) {
                    console.log(`⏭️ Autobid: Skip order ${orderId} (order kurir - tidak boleh autobid)`);
                    return;
                }
                
                // Filter lainnya tetap berjalan
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
                
                console.log(`🎯 Autobid: Order ${orderId} (NON-KURIR) memenuhi semua filter, menampilkan modal...`);
                isAutobidProcessing = true;
                processedOrders.add(orderId);
                showAutobidOrderModal(order);
                return;
            }
        });
    }
}

function startAutobid() {
    console.log('🚀 Autobid diaktifkan dengan GPS real dan sistem prioritas');
    
    autobidInterval = setInterval(() => {
        if (!isAutobidProcessing && driverLocation.latitude && driverLocation.longitude) {
            checkOrdersForAutobid();
        }
    }, 5000);
    
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
    if (!navigator.geolocation) {
        console.error('❌ Browser tidak mendukung geolocation');
        updateGPSStatus(false, 'GPS tidak didukung');
        return;
    }

    console.log('📍 Memulai monitoring GPS...');
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            updateDriverLocation(position);
            updateGPSStatus(true, '');
        },
        (error) => {
            console.error('❌ Error mendapatkan lokasi:', error);
            handleLocationError(error);
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
        requestLocationFromKodular();
    }
}

function requestLocationFromKodular() {
    console.log('📱 Meminta lokasi dari aplikasi Kodular...');
    sendToKodular({
        action: 'request_gps_location',
        message: 'Membutuhkan akses lokasi GPS untuk Autobid'
    });
}

function updateGPSStatus(isActive, message) {
    const gpsDot = document.getElementById('gpsDot');
    const gpsText = document.getElementById('gpsText');
    
    if (gpsDot && gpsText) {
        if (isActive) {
            gpsDot.className = 'gps-dot gps-active';
            gpsText.textContent = message || 'Lokasi aktif';
        } else {
            gpsDot.className = 'gps-dot gps-inactive';
            gpsText.textContent = message || 'Lokasi tidak aktif';
        }
        
        // Teks tetap disembunyikan, hanya dot yang ditampilkan
        gpsText.style.display = 'none';
    }
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
    
    if (photoModal && largePhoto && largeName) {
        largePhoto.src = photoUrl;
        largePhoto.alt = customerName;
        largeName.textContent = customerName;
        
        photoModal.style.display = 'flex';
    }
}

function closePhotoModal() {
    const photoModal = document.getElementById('photoModal');
    if (photoModal) {
        photoModal.style.display = 'none';
    }
}

// ==================== FUNGSI LOAD ORDERS YANG DIPERBAIKI ====================
function loadOrders() {
    console.log('🔄 Memulai loadOrders...');
    
    const ordersList = document.getElementById('ordersList');
    if (!ordersList) {
        console.error('❌ Element ordersList tidak ditemukan!');
        return;
    }

    // Tampilkan loading indicator
    ordersList.innerHTML = '<div class="loading"><div class="spinner"></div><p>Memuat orders...</p></div>';

    // Set timeout untuk loading (10 detik)
    const loadingTimeout = setTimeout(() => {
        if (ordersList.querySelector('.loading')) {
            console.log('⚠️ Timeout loading orders (10 detik)');
            showConnectionError();
        }
    }, 10000);

    // Cek driver data terlebih dahulu
    const driverData = getDriverData();
    if (!driverData) {
        console.log('❌ Data driver tidak ditemukan, tampilkan pesan login');
        clearTimeout(loadingTimeout);
        showDriverNotRegistered();
        return;
    }
    
    currentDriverData = driverData;
    
    // Cek koneksi Firebase
    if (!database) {
        console.log('❌ Database belum siap, tunggu inisialisasi...');
        clearTimeout(loadingTimeout);
        
        // Coba lagi setelah 2 detik
        setTimeout(() => {
            if (database) {
                loadOrders();
            } else {
                showConnectionError();
            }
        }, 2000);
        return;
    }

    // Hapus listener sebelumnya jika ada
    if (ordersListener && ordersRef) {
        ordersRef.off('value', ordersListener);
    }

    try {
        console.log('🔍 Mengambil orders dari Firebase...');
        ordersRef = database.ref('orders');
        
        ordersListener = ordersRef.on('value', (snapshot) => {
            console.log('✅ Data orders diterima dari Firebase');
            clearTimeout(loadingTimeout);
            
            const orders = snapshot.val();
            ordersList.innerHTML = '';

            if (!orders || Object.keys(orders).length === 0) {
                console.log('📭 Tidak ada orders di Firebase');
                ordersList.innerHTML = `
                    <div class="empty-state">
                        <div>📭</div>
                        <p>Tidak ada permintaan order saat ini</p>
                        <p style="margin-top: 10px; font-size: 0.8rem; color: #666;">
                            Orders akan muncul di sini ketika ada customer membutuhkan driver
                        </p>
                    </div>
                `;
                sendOrdersToKodular([]);
                return;
            }

            processOrdersData(orders, ordersList);
            
        }, (error) => {
            console.error('❌ Error loading orders dari Firebase:', error);
            clearTimeout(loadingTimeout);
            showConnectionError();
        });
        
    } catch (error) {
        console.error('❌ Error accessing Firebase:', error);
        clearTimeout(loadingTimeout);
        showConnectionError();
    }
}

// ==================== FUNGSI TAMPILAN ORDER DENGAN INFORMASI JARAK ====================
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

        sendOrdersToKodular(sortedOrders);

        if (sortedOrders.length === 0) {
            ordersList.innerHTML = `
                <div class="empty-state">
                    <div>📭</div>
                    <p>Tidak ada permintaan order yang tersedia</p>
                    <p style="margin-top: 10px; font-size: 0.8rem; color: #666;">
                        Semua order telah diambil atau tidak sesuai dengan kendaraan Anda
                    </p>
                </div>
            `;
            return;
        }

        renderOrdersList(sortedOrders, ordersList);
        
    } catch (error) {
        console.error('❌ Error processing orders data:', error);
        showConnectionError();
    }
}

function renderOrdersList(orders, ordersList) {
    orders.forEach(order => {
        const orderItem = document.createElement('div');
        orderItem.className = 'order-item';
        orderItem.dataset.orderId = order.id;
        
        // UPDATE: Gunakan user_data.name (bukan nama) sesuai struktur baru
        const customerName = order.user_data?.name || order.user_data?.nama || 'Tidak diketahui';
        const customerPhoto = getCustomerPhoto(order);
        const alamatA = order.alamat_a || '-';
        const alamatB = order.alamat_b || '-';
        const durasi = order.durasi || '-';
        const jarak = order.jarak || '-';
        
        // PERBAIKAN: Gunakan fungsi perhitungan diskon yang konsisten
        const discountedPrice = calculateDiscountedPrice(order);
        const hasPromo = discountedPrice.hasDiscount || order.promo_data || order.kode_promo;
        const isKurir = order.vehicle && order.vehicle.includes('kurir');
        
        // UPDATE: Filter kurir jika acceptKurirEnabled = false
        if (!acceptKurirEnabled && isKurir) {
            console.log(`⏭️ Render: Skip order kurir karena acceptKurirEnabled = false`);
            return; // Skip order kurir jika tidak diterima
        }
        
        let hargaDisplay = '';
        let promoBadge = '';
        
        if (hasPromo && discountedPrice.hasDiscount) {
            promoBadge = '<span class="promo-badge">🎁 PROMO</span>';
            hargaDisplay = `
                <div class="price-promo">
                    <span class="original-price">Rp ${discountedPrice.hargaAsal.toLocaleString('id-ID')}</span>
                    <span class="promo-price">Rp ${discountedPrice.hargaDiskon.toLocaleString('id-ID')}</span>
                </div>
            `;
        } else {
            hargaDisplay = `<span class="detail-value price-highlight">Rp ${discountedPrice.hargaDiskon.toLocaleString('id-ID')}</span>`;
        }

        // Hitung jarak driver ke titik jemput
        let driverDistanceDisplay = '-';
        if (driverLocation.latitude && driverLocation.longitude && order.from_lat && order.from_lng) {
            const distance = getDriverToPickupDistance(order);
            if (distance !== null) {
                // Tampilkan dalam km dengan 1 desimal, atau dalam meter jika < 1 km
                if (distance < 1) {
                    driverDistanceDisplay = Math.round(distance * 1000) + ' M';
                } else {
                    driverDistanceDisplay = distance.toFixed(1) + ' KM';
                }
            }
        }

        // Data rating dan trip count
        // UPDATE: Gunakan user_data.rating (bukan Ratings) dan user_data.perjalanan (bukan Perjalanan)
        const rating = order.user_data?.rating || order.user_data?.Ratings || 0;
        const tripCount = order.user_data?.perjalanan || order.user_data?.Perjalanan || 0;
        
        // Format waktu order
        const timeAgo = formatTimeAgo(order.created_at);

        // Tambahkan info pengiriman untuk kurir
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

        // LAYOUT BARU: Foto dan nama di sebelah kiri alamat
        orderItem.innerHTML = `
            <div class="order-header">
                <div class="order-badges">
                    ${isKurir ? '<span class="kurir-badge">📦 KURIR</span>' : ''}
                    ${promoBadge}
                </div>
                <!-- HAPUS STATUS BADGE -->
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
        
        // Tambahkan event listener untuk foto profil
        const photoElement = orderItem.querySelector('.customer-photo-left');
        if (photoElement) {
            photoElement.addEventListener('click', function(e) {
                e.stopPropagation(); // Mencegah trigger click pada order-item
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
    
    if (ordersList) {
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
    
    sendToKodular({
        action: 'connection_error',
        message: 'Tidak terhubung ke server. Periksa koneksi internet.'
    });
}

// ==================== FUNGSI UTAMA YANG SUDAH ADA ====================
function generateDriverId() {
    return 'DRIVER_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function checkDriverData() {
    console.log('🔍 Memeriksa data driver...');
    
    try {
        // Gunakan fungsi getDriverData yang sudah diperbaiki
        const driverData = getDriverData();
        
        if (!driverData) {
            console.log('❌ Tidak ada data driver valid');
            return false;
        }
        
        console.log('✅ Data driver ditemukan:', {
            name: driverData.name,
            driverId: driverData.driverId,
            uid: driverData.uid
        });
        
        currentDriverData = driverData;
        
        // Load settings dari localStorage
        const savedAutobid = localStorage.getItem('jego_autobid_enabled');
        const savedAcceptKurir = localStorage.getItem('jego_accept_kurir');
        const savedRadius = localStorage.getItem('jego_custom_radius');
        const savedFilterTujuan = localStorage.getItem('jego_filter_tujuan');
        
        if (savedAutobid !== null) {
            autobidEnabled = savedAutobid === 'true';
        }
        
        if (savedAcceptKurir !== null) {
            acceptKurirEnabled = savedAcceptKurir === 'true';
        } else {
            acceptKurirEnabled = true;
        }
        
        if (savedRadius) {
            customRadius = parseFloat(savedRadius);
        }
        
        if (savedFilterTujuan) {
            const filterData = JSON.parse(savedFilterTujuan);
            filterTujuanText = filterData.text || '';
            filterTujuanEnabled = filterData.enabled || false;
        }
        
        console.log('✅ Driver data valid dan diterima');
        return true;
        
    } catch (error) {
        console.error('❌ Error checking driver data:', error);
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
                    <a href="javascript:void(0)" onclick="sendToKodular({action: 'navigate', target: 'login'})" style="color: var(--primary); text-decoration: underline;">
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
            
            // JIKA LOCATION TRACKING ON DAN AUTOBID OFF, JALANKAN INTERVAL MANUAL
            if (!autobidEnabled) {
                startManualCheckInterval();
            }
        }
    }
}

function updateDriverPhoto() {
    const driverPhoto = document.getElementById('driverPhoto');
    if (driverPhoto && currentDriverData && currentDriverData.fotoProfilURL) {
        driverPhoto.src = currentDriverData.fotoProfilURL;
    } else if (driverPhoto) {
        driverPhoto.src = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
    }
}

function filterOrderByVehicleType(order) {
    if (!currentDriverData) return false;
    
    const driverVehicleType = currentDriverData.vehicle_type || currentDriverData.vehicleType;
    const orderVehicleType = order.vehicle;
    
    if (!driverVehicleType || !orderVehicleType) return false;
    
    const vehicleMapping = {
        'motor': ['motor', 'kurir_motor'],
        'bentor': ['bentor', 'kurir_bentor'],
        'mobil': ['mobil']
    };
    
    return vehicleMapping[driverVehicleType]?.includes(orderVehicleType) || false;
}

// ==================== FUNGSI MODAL DETAIL ORDER MANUAL - DIUBAH ====================
function showOrderDetail(order) {
    // Cek apakah order kurir
    const isKurir = order.vehicle && order.vehicle.includes('kurir');
    
    // Jika order kurir, validasi tracking dan radius
    if (isKurir) {
        // Cek tracking status
        if (!locationTrackingEnabled) {
            showPopup('Untuk mengambil order kurir, aktifkan tracking lokasi terlebih dahulu.', 'Peringatan', 'warning');
            return;
        }
        
        // Cek jarak untuk order kurir
        const isInRadius = checkOrderInRadius(order);
        if (!isInRadius) {
            showPopup(`Order kurir berada di luar radius (${customRadius}km). Aktifkan tracking untuk melihat order dalam radius.', 'Peringatan', 'warning');
            return;
        }
        
        console.log(`✅ Order kurir memenuhi syarat: tracking ON dan dalam radius`);
    }
    
    // Lanjutkan proses normal
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
        
        // TAMBAH NAMA DAN FOTO CUSTOMER DI MODAL
        const customerName = currentOrder.user_data?.name || currentOrder.user_data?.nama || 'Tidak diketahui';
        const customerPhoto = getCustomerPhoto(currentOrder);
        
        // Update HTML untuk menampilkan foto dan nama
        const modalCustomerName = document.getElementById('modalCustomerName');
        if (modalCustomerName) {
            modalCustomerName.innerHTML = `
                <img class="modal-customer-photo" src="${customerPhoto}" alt="${customerName}"
                    onerror="this.src='https://cdn-icons-png.flaticon.com/512/3135/3135715.png'">
                <span>${customerName}</span>
            `;
            
            // Tambahkan event listener untuk foto di modal detail
            const modalPhoto = modalCustomerName.querySelector('.modal-customer-photo');
            if (modalPhoto) {
                modalPhoto.style.cursor = 'pointer';
                modalPhoto.addEventListener('click', function(e) {
                    e.stopPropagation();
                    showCustomerPhoto(this.src, customerName);
                });
            }
        }
        
        const modalAddressA = document.getElementById('modalAddressA');
        const modalAddressB = document.getElementById('modalAddressB');
        const modalDuration = document.getElementById('modalDuration');
        const modalDistance = document.getElementById('modalDistance');
        
        if (modalAddressA) modalAddressA.textContent = currentOrder.alamat_a || '-';
        if (modalAddressB) modalAddressB.textContent = currentOrder.alamat_b || '-';
        if (modalDuration) modalDuration.textContent = currentOrder.durasi || '-';
        if (modalDistance) modalDistance.textContent = currentOrder.jarak || '-';
        
        // PERBAIKAN: Gunakan perhitungan diskon di modal
        const discountedPrice = calculateDiscountedPrice(currentOrder);
        const hasRealPromo = discountedPrice.hasDiscount;
        
        const modalPrice = document.getElementById('modalPrice');
        const modalPromoInfo = document.getElementById('modalPromoInfo');
        
        if (hasRealPromo) {
            if (modalPromoInfo) {
                modalPromoInfo.style.display = 'block';
                const modalPromoCode = document.getElementById('modalPromoCode');
                const modalPromoDiscount = document.getElementById('modalPromoDiscount');
                
                if (modalPromoCode) modalPromoCode.textContent = currentOrder.kode_promo || currentOrder.promo_data?.code || '-';
                if (modalPromoDiscount) modalPromoDiscount.textContent = currentOrder.diskon_persen ? `${currentOrder.diskon_persen}%` : (currentOrder.promo_data?.discount ? `${currentOrder.promo_data.discount}%` : '-');
            }
            
            if (modalPrice) {
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
            }
            
        } else {
            if (modalPromoInfo) modalPromoInfo.style.display = 'none';
            if (modalPrice) modalPrice.textContent = discountedPrice.hargaDiskon ? `Rp ${discountedPrice.hargaDiskon.toLocaleString('id-ID')}` : '-';
        }
        
        // Tambahkan info pengiriman di modal
        const modalDeliveryInfo = document.getElementById('modalDeliveryInfo');
        if (modalDeliveryInfo) {
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
        }
        
        // JARAK DRIVER - HANYA ANGKA + SATUAN
        const driverDistance = getDriverToPickupDistance(currentOrder);
        const driverDistanceContainer = document.getElementById('driverDistanceContainer');
        const driverDistanceElement = document.getElementById('driverDistance');
        
        if (driverDistance !== null) {
            let distanceText;
            if (driverDistance < 1) {
                // Konversi ke meter jika kurang dari 1 km
                distanceText = Math.round(driverDistance * 1000) + ' M';
            } else {
                distanceText = driverDistance.toFixed(1) + ' KM';
            }
            if (driverDistanceElement) driverDistanceElement.textContent = distanceText;
            if (driverDistanceContainer) driverDistanceContainer.style.display = 'block';
        } else {
            if (driverDistanceContainer) driverDistanceContainer.style.display = 'none';
        }
        
        const countdownContainer = document.getElementById('countdownContainer');
        const ambilBtn = document.getElementById('ambilBtn');
        const closeModalBtn = document.getElementById('closeModal');
        
        if (countdownContainer) countdownContainer.style.display = 'none';
        if (ambilBtn) {
            ambilBtn.disabled = false;
            ambilBtn.textContent = 'Kirim Penawaran';
        }
        
        isAutobidModal = false;
        if (closeModalBtn) closeModalBtn.classList.remove('disabled');
        
        const orderModal = document.getElementById('orderModal');
        if (orderModal) {
            orderModal.style.display = 'flex';
        }
        
        // MAP DIPERBESAR (TELAH DIATUR DI CSS)
        if (!modalMap) initModalMap();
        showRouteOnMap(currentOrder);
        
    }).catch((error) => {
        console.error('Error checking order status:', error);
        showPopup('Gagal memuat detail order. Silakan coba lagi.', 'Error', 'error');
    });
}

// ==================== FUNGSI MODAL MAP ====================
function initModalMap() {
    const mapElement = document.getElementById('modalMap');
    if (!mapElement) return;
    
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
    if (!modalMap || !directionsService || !directionsRenderer) return;
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

// ==================== FUNGSI TAMBAHAN UNTUK REFRESH ====================
function refreshData() {
    console.log('🔄 Refresh data manual');
    loadOrders();
    
    if (locationTrackingEnabled && driverLocation.latitude && driverLocation.longitude) {
        sendLocationToFirebase();
    }
}

function closeModal() {
    const orderModal = document.getElementById('orderModal');
    if (orderModal) {
        orderModal.style.display = 'none';
    }
    
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

// ==================== FUNGSI UNTUK KONTROL PENGIRIMAN DATA KE KODULAR ====================
function generateOrdersHash(orders) {
    if (!orders || orders.length === 0) return 'empty';
    
    const orderIds = orders.map(order => order.id || order.order_id).sort().join(',');
    return btoa(orderIds).substring(0, 16);
}

function sendOrdersToKodular(orders) {
    const currentCount = orders.length;
    const currentHash = generateOrdersHash(orders);
    
    if (currentCount === lastSentOrdersCount && currentHash === lastSentOrdersHash) {
        console.log('🔄 Data orders tidak berubah, skip kirim ke Kodular');
        return;
    }
    
    if (isInitialLoad && currentCount === 0) {
        console.log('🚫 Initial load tanpa orders, skip kirim ke Kodular');
        isInitialLoad = false;
        return;
    }
    
    const data = {
        action: 'orders_updated',
        orders_count: currentCount,
        orders: orders.map(order => ({
            id: order.order_id || order.id,
            customer_name: order.user_data?.name || order.user_data?.nama || 'Tidak diketahui',
            alamat_a: order.alamat_a || '-',
            alamat_b: order.alamat_b || '-',
            durasi: order.durasi || '-',
            jarak: order.jarak || '-',
            harga: order.harga_total || 0,
            status: order.status || 'unknown',
            created_at: order.created_at || null,
            has_promo: !!(order.promo_data || order.kode_promo)
        }))
    };
    
    console.log('📤 Mengirim data orders ke Kodular:', data);
    sendToKodular(data);
    
    lastSentOrdersCount = currentCount;
    lastSentOrdersHash = currentHash;
    isInitialLoad = false;
}

// ==================== FUNGSI INISIALISASI APLIKASI YANG DIPERBAIKI ====================
let appInitialized = false;

function initJeGoApp() {
    if (appInitialized) {
        console.log('⚠️ Aplikasi sudah diinisialisasi sebelumnya');
        return;
    }
    
    appInitialized = true;
    console.log('🚀 Aplikasi JeGo diinisialisasi');
    
    // CEK LOGIN STATUS (tidak terlalu ketat)
    const isLoggedIn = checkIfDriverLoggedIn();
    
    if (!isLoggedIn) {
        console.log('❌ Driver belum login atau tidak aktif');
        
        // Tampilkan pesan user friendly
        const ordersList = document.getElementById('ordersList');
        if (ordersList) {
            ordersList.innerHTML = `
                <div class="empty-state">
                    <div>🔒</div>
                    <p>Silakan login terlebih dahulu</p>
                    <p style="margin-top: 10px; font-size: 0.8rem; color: #666;">
                        Aplikasi akan redirect ke halaman login
                    </p>
                </div>
            `;
        }
        
        // Kirim event ke Kodular untuk redirect
        setTimeout(() => {
            sendToKodular({
                action: "navigate",
                target: "login",
                reason: "not_logged_in"
            });
        }, 2000);
        
        return;
    }
    
    console.log('✅ Driver sudah login, lanjutkan inisialisasi');
    
    // Setup event listeners
    setupEventListeners();
    
    // Mulai monitoring GPS
    setTimeout(() => {
        startGPSMonitoring();
    }, 1000);
    
    // Load data dari storage
    loadDriverLocationFromStorage();
    
    // Load location tracking setting
    loadLocationTrackingSetting();
    
    // Load filter tujuan dari Firebase
    setTimeout(() => {
        if (database) {
            loadFilterTujuanFromFirebase();
        }
    }, 1500);
    
    // Load orders dengan delay
    setTimeout(() => {
        console.log('🔄 Memuat orders...');
        loadOrders();
    }, 2000);
    
    // Setup sidebar navigation
    setTimeout(() => {
        setupSidebarNavigation();
    }, 500);
    
    console.log('🔧 STATUS SISTEM:');
    console.log('- Firebase:', firebaseInitialized ? '✅ INIT' : '❌ NOT INIT');
    console.log('- Database:', database ? '✅ READY' : '❌ NOT READY');
    console.log('- Auth:', auth ? '✅ READY' : '❌ NOT READY');
    console.log('- Driver Data:', currentDriverData ? '✅ LOADED' : '❌ NOT LOADED');
}

// ==================== SETUP EVENT LISTENERS ====================
function setupEventListeners() {
    console.log('🔧 Setup event listeners...');
    
    // Event listeners baru untuk menu
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) {
        menuBtn.addEventListener('click', openSidebar);
        console.log('✅ Menu button listener ditambahkan');
    }
    
    const closeSidebarBtn = document.getElementById('closeSidebar');
    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', closeSidebar);
    }
    
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }
    
    // TOMBOL SIMPAN PENGATURAN
    const saveSettingsBtn = document.getElementById('saveSettings');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveSettings);
    }
    
    // Event listeners untuk perubahan nilai
    const autobidToggle = document.getElementById('autobidToggle');
    if (autobidToggle) {
        autobidToggle.addEventListener('change', function(e) {
            console.log('🔄 autobidToggle changed:', e.target.checked);
            toggleAutobid();
        });
    }
    
    // Event listener untuk Terima Kurir
    const acceptKurirToggle = document.getElementById('acceptKurirToggle');
    if (acceptKurirToggle) {
        acceptKurirToggle.addEventListener('change', function(e) {
            console.log('🔄 acceptKurirToggle changed:', e.target.checked);
            acceptKurirEnabled = e.target.checked;
            localStorage.setItem('jego_accept_kurir', acceptKurirEnabled);
            console.log('✅ acceptKurirEnabled disimpan ke localStorage:', acceptKurirEnabled);
            loadOrders();
        });
    }
    
    // Event listeners yang sudah ada
    const locationToggleBtn = document.getElementById('locationToggleBtn');
    if (locationToggleBtn) locationToggleBtn.addEventListener('click', toggleLocationTracking);
    
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshData);
    
    const closeModalBtn = document.getElementById('closeModal');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    
    const ambilBtn = document.getElementById('ambilBtn');
    if (ambilBtn) ambilBtn.addEventListener('click', sendDriverOffer);
    
    // Event listener untuk modal informasi
    const popupButton = document.getElementById('popupButton');
    if (popupButton) popupButton.addEventListener('click', closePopup);
    
    console.log('✅ Event listeners siap');
}

// ==================== FUNGSI UTILITY ====================
function showInfoMessage(message, autoHide = false) {
    const popupOverlay = document.getElementById('popupOverlay');
    const popupMessage = document.getElementById('popupMessage');
    
    if (popupOverlay && popupMessage) {
        popupMessage.textContent = message;
        popupOverlay.style.display = 'flex';
        
        if (autoHide) {
            setTimeout(() => {
                popupOverlay.style.display = 'none';
            }, 3000);
        }
    } else {
        console.log('Info:', message);
    }
}

// ==================== INISIALISASI SAAT HALAMAN DIMUAT ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Halaman JeGo Driver dimuat');
    
    // Cek login status terlebih dahulu
    const isLoggedIn = checkIfDriverLoggedIn();
    
    if (!isLoggedIn) {
        console.log('❌ Driver belum login');
        showInfoMessage('Silakan login terlebih dahulu', true);
        
        // Kirim event ke Kodular untuk redirect
        setTimeout(() => {
            sendToKodular({
                action: "navigate",
                target: "login",
                reason: "not_logged_in_on_load"
            });
        }, 2000);
        return;
    }
    
    console.log('✅ Driver sudah login, tunggu inisialisasi Firebase');
    
    // Tunggu Google Maps API memanggil initApp()
    // initApp() akan dipanggil oleh Google Maps API saat ready
});

window.addEventListener('beforeunload', () => {
    console.log('🔄 Membersihkan resources sebelum unload');
    
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
    
    console.log('✅ Resources dibersihkan');
});
