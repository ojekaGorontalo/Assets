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

function initializeFirebase() {
  try {
    // Cek apakah Firebase sudah tersedia
    if (typeof firebase === 'undefined') {
      console.error('Firebase SDK tidak terload');
      showPopup('Gagal memuat Firebase SDK. Periksa koneksi internet.', 'Error', 'error');
      return false;
    }
    
    // Inisialisasi Firebase app
    if (!firebase.apps.length) {
      firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    } else {
      firebaseApp = firebase.app();
    }
    
    database = firebase.database();
    auth = firebase.auth();
    console.log('✅ Firebase berhasil diinisialisasi');
    return true;
    
  } catch (error) {
    console.error('❌ Error inisialisasi Firebase:', error);
    // Tampilkan pesan error yang lebih user-friendly
    setTimeout(() => {
      showPopup('Gagal terhubung ke server. Periksa koneksi internet Anda.', 'Koneksi Error', 'error');
    }, 1000);
    return false;
  }
}

// ==================== SISTEM AUTHENTIKASI FIREBASE ====================

// Fungsi untuk cek status login driver dengan Firebase Auth
async function checkDriverAuthStatus() {
  try {
    // Cek apakah Firebase Auth sudah diinisialisasi
    if (!auth) {
      await initializeFirebase();
    }
    
    // Cek apakah ada user yang sudah login di Firebase Auth
    const user = auth.currentUser;
    
    if (user) {
      // User sudah login di Firebase
      console.log('✅ Driver sudah login via Firebase Auth:', user.uid);
      return {
        loggedIn: true,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        phoneNumber: user.phoneNumber
      };
    }
    
    // Cek localStorage untuk driver yang login sebelumnya
    const loggedInDriver = localStorage.getItem('jego_driver_data');
    const isLoggedIn = localStorage.getItem('jego_driver_logged_in');
    const driverStatus = localStorage.getItem('jego_driver_status');
    
    if (loggedInDriver && isLoggedIn === 'true' && driverStatus === 'active') {
      try {
        const driverData = JSON.parse(loggedInDriver);
        console.log('✅ Driver sudah login via localStorage:', driverData.driverId || driverData.uid);
        
        // Coba re-authenticate dengan Firebase jika ada email/password
        if (driverData.email && driverData.passwordHash) {
          // Note: Untuk aplikasi production, jangan simpan password di localStorage
          try {
            await auth.signInWithEmailAndPassword(driverData.email, driverData.passwordHash);
            console.log('✅ Re-authenticated dengan Firebase');
          } catch (authError) {
            console.log('⚠️ Gagal re-authenticate, menggunakan localStorage data');
          }
        }
        
        return {
          loggedIn: true,
          uid: driverData.driverId || driverData.uid,
          email: driverData.email,
          name: driverData.fullName,
          phoneNumber: driverData.phoneNumber
        };
      } catch (error) {
        console.error('❌ Error parsing driver data:', error);
        return { loggedIn: false };
      }
    }
    
    console.log('❌ Driver belum login');
    return { loggedIn: false };
    
  } catch (error) {
    console.error('❌ Error checking auth status:', error);
    return { loggedIn: false };
  }
}

// Fungsi untuk login driver dengan Firebase Auth
async function loginDriverWithFirebase(email, password) {
  try {
    console.log('🔐 Mencoba login dengan Firebase Auth...');
    
    if (!auth) {
      await initializeFirebase();
    }
    
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    console.log('✅ Login berhasil:', user.uid);
    
    // Simpan data user ke localStorage
    const driverData = {
      driverId: user.uid,
      email: user.email,
      displayName: user.displayName,
      phoneNumber: user.phoneNumber,
      loggedInAt: new Date().toISOString()
    };
    
    localStorage.setItem('jego_driver_data', JSON.stringify(driverData));
    localStorage.setItem('jego_driver_logged_in', 'true');
    localStorage.setItem('jego_driver_status', 'active');
    
    return {
      success: true,
      user: driverData
    };
    
  } catch (error) {
    console.error('❌ Error login dengan Firebase:', error);
    
    let errorMessage = 'Login gagal';
    if (error.code === 'auth/user-not-found') {
      errorMessage = 'Email tidak ditemukan';
    } else if (error.code === 'auth/wrong-password') {
      errorMessage = 'Password salah';
    } else if (error.code === 'auth/too-many-requests') {
      errorMessage = 'Terlalu banyak percobaan. Coba lagi nanti';
    }
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

// Fungsi untuk logout driver
async function logoutDriver() {
  try {
    console.log('🚪 Memulai proses logout...');
    
    // Hentikan semua listener dan interval
    stopLocationTracking();
    stopAutobid();
    stopManualCheckInterval();
    stopDriverDataRefresh();
    
    if (balanceListener && currentDriverData && currentDriverData.driverId) {
      const driverId = currentDriverData.driverId;
      database.ref('drivers/' + driverId + '/Balance').off('value', balanceListener);
    }
    
    // Hapus data dari localStorage
    localStorage.removeItem('jego_driver_data');
    localStorage.removeItem('jego_driver_logged_in');
    localStorage.removeItem('jego_driver_status');
    localStorage.removeItem('jego_location_tracking_enabled');
    localStorage.removeItem('jego_autobid_enabled');
    localStorage.removeItem('jego_accept_kurir');
    localStorage.removeItem('jego_custom_radius');
    localStorage.removeItem('jego_filter_tujuan');
    
    // Logout dari Firebase Auth
    if (auth) {
      await auth.signOut();
    }
    
    console.log('✅ Logout berhasil');
    
    // Kirim event ke Kodular untuk navigasi ke login
    sendToKodular({
      action: "navigate",
      target: "login",
      reason: "driver_logged_out"
    });
    
    // Tampilkan status logout
    showPopup('Anda telah logout dari sistem.', 'Logout Berhasil', 'success');
    
    // Redirect ke login page
    setTimeout(() => {
      if (window.location.href.indexOf('login') === -1) {
        window.location.href = "login_driver.html";
      }
    }, 2000);
    
    return true;
    
  } catch (error) {
    console.error('❌ Error logout:', error);
    showPopup('Gagal logout. Silakan coba lagi.', 'Error', 'error');
    return false;
  }
}

// ==================== FUNGSI BARU: SISTEM USER DATA MANAGEMENT ====================

// Variabel untuk auto-refresh user data
let userDataRefreshInterval = null;
let currentUserData = null;

// FUNGSI BARU: Ambil data user dari localStorage dengan konsistensi yang sama dengan rute.html
async function getDriverData() {
    console.log("🔍 [DEBUG] Memulai getDriverData");
    
    try {
        // 1. Cek status auth terlebih dahulu
        const authStatus = await checkDriverAuthStatus();
        
        if (!authStatus.loggedIn) {
            console.log("❌ [DEBUG] Driver belum login di Firebase Auth");
            return null;
        }
        
        // 2. Cek localStorage
        const loggedInDriver = localStorage.getItem('jego_driver_data');
        console.log("📁 [DEBUG] jego_driver_data di localStorage:", loggedInDriver ? "Ada" : "Tidak ada");
        
        if (loggedInDriver) {
            const driverData = JSON.parse(loggedInDriver);
            
            // 3. Ambil data terbaru dari Firebase jika driverId ada
            if (driverData.driverId && database) {
                console.log("🔍 [DEBUG] Mengambil data terbaru dari Firebase untuk:", driverData.driverId);
                
                try {
                    const driverRef = database.ref('drivers/' + driverData.driverId);
                    const snapshot = await driverRef.once('value');
                    const firebaseData = snapshot.val();
                    
                    if (firebaseData) {
                        // Gabungkan data dari localStorage dan Firebase
                        const mergedData = {
                            // Data dari localStorage (registrasi)
                            ...driverData,
                            // Data dari Firebase (update terbaru)
                            avg_rating: firebaseData.avg_rating,
                            total_trips: firebaseData.total_trips,
                            balance: firebaseData.balance,
                            online: firebaseData.online,
                            latitude: firebaseData.latitude,
                            longitude: firebaseData.longitude,
                            last_updated: new Date().toISOString()
                        };
                        
                        console.log("✅ [DEBUG] Driver data setelah merge dengan Firebase:", {
                            name: mergedData.fullName,
                            phone: mergedData.phoneNumber,
                            rating: mergedData.avg_rating,
                            trips: mergedData.total_trips,
                            balance: mergedData.balance
                        });
                        
                        return mergedData;
                    }
                } catch (firebaseError) {
                    console.error("❌ [DEBUG] Gagal ambil data dari Firebase:", firebaseError);
                    // Fallback ke data localStorage
                }
            }
            
            console.log("✅ [DEBUG] Driver data ditemukan di localStorage:", {
                name: driverData.fullName,
                phone: driverData.phoneNumber,
                driverId: driverData.driverId
            });
            
            return driverData;
        }
        
    } catch (error) {
        console.error('❌ [DEBUG] Error mengambil data driver:', error);
    }
    
    console.log("❌ [DEBUG] Tidak ada data driver ditemukan");
    return null;
}

// FUNGSI BARU: Ambil data user TERBARU dari Firebase
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
    
    // Gabungkan data: data Firebase memiliki prioritas tertinggi
    const updatedDriverData = {
      ...currentUserData, // Data lama dari cache
      ...latestDriverData, // Data baru dari Firebase (akan timpa field yang sama)
      // Pastikan driver_id tetap ada
      driverId: driverKey,
      // Pastikan field kritis diambil dari Firebase
      avgRating: latestDriverData.avg_rating || currentUserData.avgRating,
      totalTrips: latestDriverData.total_trips || currentUserData.totalTrips,
      // Timestamp pembaruan
      last_updated_from_firebase: new Date().toISOString()
    };
    
    // Update cache localStorage
    try {
      localStorage.setItem('jego_driver_data', JSON.stringify(updatedDriverData));
      
      // Update juga di jego_drivers jika ada
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
    return currentUserData; // Fallback ke data lama
  }
}

// FUNGSI BARU: Refresh data driver secara periodic
function startDriverDataRefresh() {
  // Hentikan interval sebelumnya jika ada
  if (userDataRefreshInterval) {
    clearInterval(userDataRefreshInterval);
  }
  
  // Refresh setiap 30 detik jika driver sedang aktif
  userDataRefreshInterval = setInterval(async () => {
    const authStatus = await checkDriverAuthStatus();
    if (authStatus.loggedIn && currentUserData && currentUserData.driverId) {
      console.log("🔄 [DEBUG] Auto-refresh driver data dari Firebase...");
      currentUserData = await fetchLatestDriverData(currentUserData.driverId);
    }
  }, 30000); // 30 detik
}

function stopDriverDataRefresh() {
  if (userDataRefreshInterval) {
    clearInterval(userDataRefreshInterval);
    userDataRefreshInterval = null;
  }
}

// FUNGSI BARU: Cek jika driver sudah login (konsisten dengan rute.html)
async function checkIfDriverLoggedIn() {
    console.log("🔍 [DEBUG] Memeriksa status login driver...");
    
    const authStatus = await checkDriverAuthStatus();
    
    if (authStatus.loggedIn) {
        console.log("✅ [DEBUG] Driver sudah login:", authStatus.uid);
        return true;
    }
    
    console.log("❌ [DEBUG] Driver belum login");
    return false;
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
  popupOverlay.style.display = 'none';
  popupOverlay.classList.remove('active');
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
async function checkLoginStatus() {
    // PERBAIKAN: Gunakan fungsi baru yang konsisten dengan rute.html
    const isLoggedIn = await checkIfDriverLoggedIn();
    
    if (!isLoggedIn) {
        console.log('❌ Driver belum login atau tidak aktif, kirim event ke Kodular');
        
        // Kirim event login ke Kodular (bukan redirect)
        sendToKodular({
            action: "navigate",
            target: "login",
            reason: "not_logged_in_or_inactive"
        });
        
        // Tampilkan pesan di halaman menggunakan showPopup baru
        showPopup('Anda belum login atau akun tidak aktif. Aplikasi akan membuka halaman login.', 'Perhatian', 'warning');
        return false;
    }
    return true;
}

// ==================== FUNGSI NOTIFIKASI SUARA ====================
function playNewOrderSound() {
    try {
        const audio = document.getElementById('newOrderSound');
        audio.currentTime = 0;
        audio.play().catch(e => console.log('Gagal memutar suara order baru:', e));
    } catch (error) {
        console.error('Error memutar suara order baru:', error);
    }
}

function playAutobidSound() {
    try {
        const audio = document.getElementById('autobidSound');
        audio.currentTime = 0;
        audio.play().catch(e => console.log('Gagal memutar suara autobid:', e));
    } catch (error) {
        console.error('Error memutar suara autobid:', error);
    }
}

function playOrderAcceptedSound() {
    try {
        const audio = document.getElementById('orderAcceptedSound');
        audio.currentTime = 0;
        audio.play().catch(e => console.log('Gagal memutar suara order diterima:', e));
        
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
async function toggleLocationTracking() {
    // Cek auth status terlebih dahulu
    const authStatus = await checkDriverAuthStatus();
    if (!authStatus.loggedIn) {
        showPopup('Anda harus login untuk mengaktifkan tracking.', 'Error', 'error');
        return;
    }
    
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
    if (locationTrackingEnabled) {
        locationToggleBtn.innerHTML = '<span>📍</span> ON';
        locationToggleBtn.classList.add('active');
    } else {
        locationToggleBtn.innerHTML = '<span>📍</span> OFF';
        locationToggleBtn.classList.remove('active');
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
            if (error.code === 'PERMISSION_DENIED') {
                showPopup('Tidak memiliki izin untuk update lokasi. Silakan login ulang.', 'Error', 'error');
            }
        });
    }
}

async function sendLocationToFirebase() {
    // Cek auth status terlebih dahulu
    const authStatus = await checkDriverAuthStatus();
    if (!authStatus.loggedIn) {
        console.log('❌ Driver tidak login, tidak bisa mengirim lokasi');
        return;
    }
    
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
            // Cek jika error karena permission denied
            if (error.code === 'PERMISSION_DENIED') {
                showPopup('Tidak memiliki izin untuk update lokasi. Silakan login ulang.', 'Error', 'error');
            }
        });
}

// ==================== FUNGSI UNTUK MENU LAYOUT ====================
// Fungsi untuk membuka sidebar
function openSidebar() {
    document.getElementById('sidebar').style.display = 'block';
    loadSettingsToUI();
    updateStatusInfo();
}

// Fungsi untuk menutup sidebar
function closeSidebar() {
    document.getElementById('sidebar').style.display = 'none';
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
    document.getElementById('autobidToggle').checked = autobidEnabled;
    document.getElementById('acceptKurirToggle').checked = acceptKurirEnabled;
    document.getElementById('radiusInput').value = customRadius = savedRadius ? parseFloat(savedRadius) : 1.0;
    
    if (savedFilterTujuan) {
        const filterData = JSON.parse(savedFilterTujuan);
        document.getElementById('filterTujuanInput').value = filterTujuanText = filterData.text || '';
    }
    
    // Update status toggle autobid berdasarkan tracking
    updateAutobidToggleStatus();
}

// PERBAIKAN: Fungsi untuk menyimpan pengaturan (TOMBOL SIMPAN PENGATURAN)
async function saveSettings() {
    // Cek auth status terlebih dahulu
    const authStatus = await checkDriverAuthStatus();
    if (!authStatus.loggedIn) {
        showPopup('Anda harus login untuk menyimpan pengaturan.', 'Error', 'error');
        return;
    }
    
    console.log('💾 Menyimpan pengaturan...');
    
    try {
        // Ambil nilai langsung dari UI untuk memastikan nilai terbaru
        acceptKurirEnabled = document.getElementById('acceptKurirToggle').checked;
        customRadius = parseFloat(document.getElementById('radiusInput').value);
        filterTujuanText = document.getElementById('filterTujuanInput').value;
        
        // Validasi radius
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
    // Cek auth status terlebih dahulu
    checkDriverAuthStatus().then(authStatus => {
        if (!authStatus.loggedIn) {
            console.log('❌ Driver belum login, tidak bisa load filter');
            return;
        }
        
        const filterRef = database.ref('DataJego/Filter');
        
        filterRef.once('value').then(snapshot => {
            filterTujuanData = snapshot.val();
            
            if (filterTujuanData && filterTujuanData.status === 'ON') {
                // Tampilkan container filter tujuan
                document.getElementById('filterTujuanContainer').style.display = 'block';
                
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
        }).catch(error => {
            console.error('Error loading filter tujuan:', error);
        });
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
async function toggleAutobid() {
    // Cek auth status terlebih dahulu
    const authStatus = await checkDriverAuthStatus();
    if (!authStatus.loggedIn) {
        showPopup('Anda harus login untuk mengaktifkan autobid.', 'Error', 'error');
        return;
    }
    
    // Cek koneksi Firebase
    if (!database) {
        showPopup('Tidak terhubung ke server. Periksa koneksi internet Anda.', 'Koneksi Error', 'error');
        return;
    }

    // Cek apakah location tracking aktif
    if (!locationTrackingEnabled) {
        showPopup('Aktifkan tracking terlebih dahulu untuk menggunakan autobid', 'Peringatan', 'warning');
        // Reset toggle button di UI
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
async function checkOrdersForManualPopup() {
    // Cek auth status terlebih dahulu
    const authStatus = await checkDriverAuthStatus();
    if (!authStatus.loggedIn) {
        return;
    }
    
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
async function checkOrdersForAutobid() {
    // Cek auth status terlebih dahulu
    const authStatus = await checkDriverAuthStatus();
    if (!authStatus.loggedIn) {
        return;
    }
    
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

// ==================== FUNGSI MODAL DETAIL ORDER MANUAL - DIUBAH ====================
async function showOrderDetail(order) {
    // Cek auth status terlebih dahulu
    const authStatus = await checkDriverAuthStatus();
    if (!authStatus.loggedIn) {
        showPopup('Anda harus login untuk melihat detail order.', 'Error', 'error');
        return;
    }
    
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
        
        // 1. TAMBAH NAMA DAN FOTO CUSTOMER DI MODAL
        // UPDATE: Gunakan user_data.name (bukan nama) sesuai struktur baru
        const customerName = currentOrder.user_data?.name || currentOrder.user_data?.nama || 'Tidak diketahui';
        const customerPhoto = getCustomerPhoto(currentOrder);
        
        // Update HTML untuk menampilkan foto dan nama
        const modalCustomerName = document.getElementById('modalCustomerName');
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
        
        document.getElementById('modalAddressA').textContent = currentOrder.alamat_a || '-';
        document.getElementById('modalAddressB').textContent = currentOrder.alamat_b || '-';
        document.getElementById('modalDuration').textContent = currentOrder.durasi || '-';
        document.getElementById('modalDistance').textContent = currentOrder.jarak || '-';
        
        // PERBAIKAN: Gunakan perhitungan diskon di modal
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
        
        // Tambahkan info pengiriman di modal
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
        
        // 6. JARAK DRIVER - HANYA ANGKA + SATUAN
        const driverDistance = getDriverToPickupDistance(currentOrder);
        if (driverDistance !== null) {
            let distanceText;
            if (driverDistance < 1) {
                // Konversi ke meter jika kurang dari 1 km
                distanceText = Math.round(driverDistance * 1000) + ' M';
            } else {
                distanceText = driverDistance.toFixed(1) + ' KM';
            }
            document.getElementById('driverDistance').textContent = distanceText;
            document.getElementById('driverDistanceContainer').style.display = 'block';
        } else {
            document.getElementById('driverDistanceContainer').style.display = 'none';
        }
        
        document.getElementById('countdownContainer').style.display = 'none';
        document.getElementById('ambilBtn').disabled = false;
        document.getElementById('ambilBtn').textContent = 'Kirim Penawaran';
        
        isAutobidModal = false;
        document.getElementById('closeModal').classList.remove('disabled');
        
        document.getElementById('orderModal').style.display = 'flex';
        
        // 5. MAP DIPERBESAR (TELAH DIATUR DI CSS)
        if (!modalMap) initModalMap();
        showRouteOnMap(currentOrder);
        
    }).catch((error) => {
        console.error('Error checking order status:', error);
        showPopup('Gagal memuat detail order. Silakan coba lagi.', 'Error', 'error');
    });
}

// ==================== FUNGSI MODAL AUTOBID - DIUBAH ====================
async function showAutobidOrderModal(order) {
    // Cek auth status terlebih dahulu
    const authStatus = await checkDriverAuthStatus();
    if (!authStatus.loggedIn) {
        return;
    }
    
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
        
        // 2. TAMBAH NAMA DAN FOTO CUSTOMER DI MODAL AUTOBID
        // UPDATE: Gunakan user_data.name (bukan nama) sesuai struktur baru
        const customerName = currentOrder.user_data?.name || currentOrder.user_data?.nama || 'Tidak diketahui';
        const customerPhoto = getCustomerPhoto(currentOrder);
        
        const autobidCustomerName = document.getElementById('autobidCustomerName');
        autobidCustomerName.innerHTML = `
            <img class="autobid-customer-photo" src="${customerPhoto}" alt="${customerName}"
                onerror="this.src='https://cdn-icons-png.flaticon.com/512/3135/3135715.png'">
            <span>${customerName}</span>
        `;
        
        // Tambahkan event listener untuk foto di modal autobid
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
        
        // PERBAIKAN: Gunakan perhitungan diskon di modal autobid
        const discountedPrice = calculateDiscountedPrice(currentOrder);
        document.getElementById('autobidPrice').textContent = discountedPrice.hargaDiskon ? `Rp ${discountedPrice.hargaDiskon.toLocaleString('id-ID')}` : '-';
        
        // TAMPILKAN INFO PROMO JIKA ADA
        const autobidPromoInfo = document.getElementById('autobidPromoInfo');
        if (discountedPrice.hasDiscount) {
            autobidPromoInfo.style.display = 'block';
            autobidPromoInfo.innerHTML = `
                <div class="autobid-promo-badge">🎁 ORDER PROMO - ${currentOrder.diskon_persen}%</div>
                <div style="font-size: 0.7rem; color: #856404;">
                    Harga asli: Rp ${discountedPrice.hargaAsal.toLocaleString('id-ID')} → 
                    Harga diskon: Rp ${discountedPrice.hargaDiskon.toLocaleString('id-ID')}
                </div>
            `;
        } else {
            autobidPromoInfo.style.display = 'none';
        }
        
        // Tambahkan info pengiriman untuk autobid modal
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
        
        // PUTAR SUARA AUTOBID
        playAutobidSound();
        
        sendToKodular({
            action: 'autobid_order_found',
            order_id: orderKey,
            order_data: currentOrder,
            message: `Autobid menemukan order dalam radius jarak terdekat. Segera mengirim penawaran.`
        });
        
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
                removeDriverOffer(currentSelectedOrder.order_id || currentSelectedOrder.id, currentDriverId);
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

async function sendAutobidOffer() {
    // Cek auth status terlebih dahulu
    const authStatus = await checkDriverAuthStatus();
    if (!authStatus.loggedIn) {
        isAutobidProcessing = false;
        closeAutobidModal();
        return;
    }
    
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
            priority_score: priorityScore
        };
        
        orderRef.child('driver_offers').child(driverId).set(driverData)
            .then(() => {
                console.log('✅ Autobid: Penawaran berhasil dikirim untuk order:', orderId);
                
                document.getElementById('autobidProgressText').textContent = 'Penawaran terkirim! Menunggu konfirmasi...';
                document.getElementById('autobidProgressBar').style.background = 'linear-gradient(to right, var(--primary), var(--secondary))';
                
                sendToKodular({
                    action: 'autobid_offer_sent',
                    order_id: orderId,
                    order_data: currentOrder,
                    priority_score: priorityScore,
                    message: `Autobid: Penawaran berhasil dikirim. Menunggu konfirmasi customer...`
                });
                
                startAutobidProgressBar();
                listenForAutobidOrderResponse(orderId, driverId);
            })
            .catch((error) => {
                console.error('❌ Autobid: Gagal mengirim penawaran:', error);
                
                document.getElementById('autobidProgressText').textContent = 'Gagal mengirim penawaran';
                document.getElementById('autobidProgressBar').style.background = '#dc3545';
                
                sendToKodular({ 
                    action: 'autobid_offer_failed', 
                    message: 'Autobid: Gagal mengirim penawaran.' 
                });
                
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
        
        sendToKodular({ 
            action: 'autobid_offer_check_failed', 
            message: 'Autobid: Gagal memeriksa status order.' 
        });
        
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
            console.log('📭 Order Autobid dihapus:', orderId);
            stopAutobidProgressBar();
            document.getElementById('autobidProgressText').textContent = 'Order dibatalkan customer';
            document.getElementById('autobidProgressBar').style.background = '#dc3545';
            
            setTimeout(() => {
                closeAutobidModal();
            }, 2000);
            
            sendToKodular({ action: 'order_cancelled', message: 'Order telah dibatalkan oleh customer.' });
            isAutobidProcessing = false;
            processedOrders.delete(orderId);
            return;
        }
        
        // CEK PEMBATALAN ORDER
        if (order.status === 'cancelled_by_user' || order.status === 'cancelled_by_system') {
            console.log(`🔄 Order dibatalkan dengan status: ${order.status}`);
            
            stopAutobidProgressBar();
            document.getElementById('autobidProgressText').textContent = 'Order dibatalkan';
            document.getElementById('autobidProgressBar').style.background = '#ffc107';
            
            setTimeout(() => {
                closeAutobidModal();
            }, 2000);
            
            isAutobidProcessing = false;
            processedOrders.delete(orderId);
            return;
        }
        
        if (order.status === 'cancelled_by_driver') {
            console.log(`🔄 Order dibatalkan oleh driver: ${order.status}`);
            
            stopAutobidProgressBar();
            document.getElementById('autobidProgressText').textContent = 'Order dibatalkan oleh driver';
            document.getElementById('autobidProgressBar').style.background = '#dc3545';
            
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
                
                const saveSuccess = saveAcceptedOrderToLocalStorage(order, selectedDriver);
                
                // PUTAR SUARA ORDER DITERIMA DAN KIRIM EVENT KE KODULAR
                playOrderAcceptedSound();
                
                sendToKodular({
                    action: 'order_accepted_by_us',
                    order_id: orderId,
                    order_data: order,
                    driver_data: selectedDriver,
                    saved_to_localstorage: saveSuccess,
                    message: 'Selamat! Penawaran Autobid Anda diterima oleh customer.'
                });
                
                setTimeout(() => {
                    closeAutobidModal();
                    loadOrders();
                }, 3000);
                
            } else {
                stopAutobidProgressBar();
                document.getElementById('autobidProgressText').textContent = 'Order diambil driver lain';
                document.getElementById('autobidProgressBar').style.background = '#dc3545';
                
                sendToKodular({
                    action: 'order_taken_by_other_driver',
                    order_id: orderId,
                    message: 'Order ini telah diambil oleh driver lain.'
                });
                
                setTimeout(() => {
                    closeAutobidModal();
                }, 2000);
            }
            processedOrders.delete(orderId);
        }
        
        if (order.status !== 'searching' && order.status !== 'accepted' && 
            order.status !== 'cancelled_by_user' && order.status !== 'cancelled_by_system' && 
            order.status !== 'cancelled_by_driver') {
            stopAutobidProgressBar();
            document.getElementById('autobidProgressText').textContent = `Order ${order.status}`;
            document.getElementById('autobidProgressBar').style.background = '#dc3545';
            
            sendToKodular({
                action: 'order_status_changed',
                order_id: orderId,
                status: order.status,
                message: `Status order berubah menjadi: ${order.status}`
            });
            
            setTimeout(() => {
                closeAutobidModal();
            }, 2000);
            
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
            customer_name: order.user_data?.name || order.user_data?.nama || 'Tidak diketahui', // UPDATE: gunakan name
            alamat_a: order.alamat_a || '-',
            alamat_b: order.alamat_b || '-',
            durasi: order.durasi || '-',
            jarak: order.jarak || '-',
            harga: order.harga_total || 0,
            status: order.status || 'unknown',
            created_at: order.created_at || null,
            // TAMBAHAN: Info promo untuk Kodular
            has_promo: !!(order.promo_data || order.kode_promo)
        }))
    };
    
    console.log('📤 Mengirim data orders ke Kodular:', data);
    sendToKodular(data);
    
    lastSentOrdersCount = currentCount;
    lastSentOrdersHash = currentHash;
    isInitialLoad = false;
}

// ==================== FUNGSI TAMPILAN ORDER DENGAN INFORMASI JARAK ====================
async function loadOrders() {
    console.log('🔄 Memulai loadOrders...');
    
    // Cek auth status terlebih dahulu
    const authStatus = await checkDriverAuthStatus();
    if (!authStatus.loggedIn) {
        console.log('❌ Driver belum login, tidak bisa load orders');
        showDriverNotRegistered();
        return;
    }
    
    const ordersList = document.getElementById('ordersList');
    if (!ordersList) {
        console.error('❌ Element ordersList tidak ditemukan!');
        return;
    }

    ordersList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    // Hapus timeout untuk demo mode
    const loadingTimeout = setTimeout(() => {
        if (ordersList.querySelector('.loading')) {
            console.log('⚠️ Timeout loading orders');
            showConnectionError();
        }
    }, 10000);

    if (!checkDriverData()) {
        console.log('❌ Driver tidak terdaftar, berhenti load orders');
        clearTimeout(loadingTimeout);
        return;
    }

    // Cek koneksi Firebase
    if (!database) {
        clearTimeout(loadingTimeout);
        showConnectionError();
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
                    <p>Tidak ada permintaan order</p>
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
    try {
        // PERBAIKAN: Gunakan fungsi getDriverData yang baru
        getDriverData().then(driverData => {
            if (!driverData) {
                showDriverNotRegistered();
                return false;
            }
            
            console.log('👤 Parsed driver data:', driverData);
            
            if (driverData.driverId && driverData.fullName) {
                currentDriverData = driverData;
                currentUserData = driverData; // Simpan juga di currentUserData untuk konsistensi
                
                updateDriverPhoto();
                
                // INISIALISASI SISTEM SALDO (TANPA PEMOTONGAN)
                initializeBalanceSystem();
                
                const savedAutobid = localStorage.getItem('jego_autobid_enabled');
                if (savedAutobid !== null) {
                    autobidEnabled = savedAutobid === 'true';
                    updateAutobidButton();
                }
                
                loadLocationTrackingSetting();
                
                // Load settings dari localStorage
                const savedAcceptKurir = localStorage.getItem('jego_accept_kurir');
                const savedRadius = localStorage.getItem('jego_custom_radius');
                const savedFilterTujuan = localStorage.getItem('jego_filter_tujuan');
                
                // PERBAIKAN: Pastikan parsing boolean dari localStorage benar
                if (savedAcceptKurir !== null) {
                    acceptKurirEnabled = savedAcceptKurir === 'true';
                } else {
                    acceptKurirEnabled = true; // Default value
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
                
                // MULAI AUTO-REFRESH DATA DRIVER
                if (driverData.driverId) {
                    startDriverDataRefresh();
                }
                
                return true;
            } else {
                console.log('❌ Data driver tidak lengkap');
                showDriverNotRegistered();
                return false;
            }
        });
        
    } catch (error) {
        console.error('❌ Error checking driver data:', error);
        showDriverNotRegistered();
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
        updateAutobidToggleStatus(); // UPDATE STATUS AUTOBID TOGGLE
        
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
            removeDriverOffer(orderId, driverId);
            closeModalAndRefresh();
            // showPopup('Waktu penawaran telah habis.', 'Info', 'info');
            isAutobidProcessing = false;
        }
    }, 1000);
}

function removeDriverOffer(orderId, driverId) {
    const orderRef = database.ref('orders/' + orderId);
    orderRef.child('driver_offers').child(driverId).remove()
        .then(() => console.log('Data driver dihapus karena waktu habis:', driverId))
        .catch(error => console.error('Gagal menghapus data driver:', error));
}

function closeModalAndRefresh() {
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
    document.getElementById('closeModal').classList.remove('disabled');
    
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
            showPopup('Order telah dibatalkan oleh customer.', 'Info', 'info');
            isAutobidProcessing = false;
            processedOrders.delete(orderId);
            return;
        }
        
        // CEK PEMBATALAN ORDER
        if (order.status === 'cancelled_by_user' || order.status === 'cancelled_by_system') {
            console.log(`🔄 Order dibatalkan dengan status: ${order.status}`);
            
            closeModalAndRefresh();
            showPopup(`Order dibatalkan (${order.status}).`, 'Info', 'info');
            isAutobidProcessing = false;
            processedOrders.delete(orderId);
            return;
        }
        
        if (order.status === 'cancelled_by_driver') {
            console.log(`🔄 Order dibatalkan oleh driver: ${order.status}`);
            
            closeModalAndRefresh();
            showPopup('Order dibatalkan oleh driver.', 'Info', 'info');
            isAutobidProcessing = false;
            processedOrders.delete(orderId);
            return;
        }
        
        if (order.status === 'accepted') {
            const selectedDriver = order.selected_driver;
            const isOurDriver = selectedDriver && selectedDriver.id === driverId;
            
            if (isOurDriver) {
                if (countdownInterval) clearInterval(countdownInterval);
                
                const saveSuccess = saveAcceptedOrderToLocalStorage(order, selectedDriver);
                
                // PUTAR SUARA ORDER DITERIMA DAN KIRIM EVENT KE KODULAR
                playOrderAcceptedSound();
                
                sendToKodular({
                    action: 'order_accepted_by_us',
                    order_id: orderId,
                    order_data: order,
                    driver_data: selectedDriver,
                    saved_to_localstorage: saveSuccess,
                    message: 'Selamat! Penawaran Anda diterima oleh customer.'
                });
                
                closeModalAndRefresh();
            } else {
                if (countdownInterval) clearInterval(countdownInterval);
                showPopup('Order ini telah diambil oleh driver lain.', 'Info', 'info');
                closeModalAndRefresh();
            }
            processedOrders.delete(orderId);
        }
        
        if (order.status !== 'searching' && order.status !== 'accepted' && 
            order.status !== 'cancelled_by_user' && order.status !== 'cancelled_by_system' && 
            order.status !== 'cancelled_by_driver') {
            if (countdownInterval) clearInterval(countdownInterval);
            showPopup(`Status order berubah menjadi: ${order.status}`, 'Info', 'info');
            closeModalAndRefresh();
            processedOrders.delete(orderId);
        }
    });
}

async function sendDriverOffer() {
    // Cek auth status terlebih dahulu
    const authStatus = await checkDriverAuthStatus();
    if (!authStatus.loggedIn) {
        showPopup('Anda harus login untuk mengirim penawaran.', 'Error', 'error');
        return;
    }
    
    if (!currentSelectedOrder || !currentDriverId) return;
    
    if (!checkDriverData()) return;
    
    // GUARD: Validasi untuk order kurir
    const isKurir = currentSelectedOrder.vehicle && currentSelectedOrder.vehicle.includes('kurir');
    if (isKurir) {
        // Untuk order kurir, pastikan tracking ON
        if (!locationTrackingEnabled) {
            showPopup('Untuk mengambil order kurir, aktifkan tracking lokasi terlebih dahulu.', 'Peringatan', 'warning');
            return;
        }
        
        // Pastikan dalam radius
        const isInRadius = checkOrderInRadius(currentSelectedOrder);
        if (!isInRadius) {
            showPopup(`Order kurir berada di luar radius (${customRadius}km).`, 'Peringatan', 'warning');
            return;
        }
    }
    
    // Lanjutkan proses normal...
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
            priority_score: priorityScore
        };
        
        orderRef.child('driver_offers').child(driverId).set(driverData)
            .then(() => {
                console.log('Penawaran driver berhasil dikirim untuk order:', orderId);
                sendToKodular({ 
                    action: 'offer_sent', 
                    order_id: orderId, 
                    priority_score: priorityScore,
                    message: `Penawaran berhasil dikirim. Menunggu konfirmasi customer...` 
                });
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

// ==================== SISTEM SALDO DRIVER (TANPA PEMOTONGAN) ====================
function initializeBalanceSystem() {
    if (!currentDriverData || !currentDriverData.driverId) {
        console.log('❌ Tidak ada data driver untuk inisialisasi sistem saldo');
        return;
    }

    const driverId = currentDriverData.driverId;
    const balanceRef = database.ref('drivers/' + driverId + '/Balance');

    // Setup real-time listener untuk saldo (HANYA UNTUK MENAMPILKAN, BUKAN PEMOTONGAN)
    balanceListener = balanceRef.on('value', (snapshot) => {
        const newBalance = snapshot.val() || 0;
        currentDriverBalance = newBalance;
        
        console.log(`💰 Saldo diperbarui (hanya info): Rp ${newBalance.toLocaleString('id-ID')}`);
        
        // Update di localStorage
        if (currentDriverData) {
            currentDriverData.balance = newBalance;
            localStorage.setItem('driverData', JSON.stringify(currentDriverData));
        }
    }, (error) => {
        console.error('❌ Error listening to balance:', error);
    });
}

// ==================== FUNGSI LOCALSTORAGE ORDER DITERIMA ====================
function saveAcceptedOrderToLocalStorage(orderData, driverData) {
    try {
        // Simpan data pengiriman lengkap jika ada
        const deliveryData = orderData.delivery_data ? {
            itemCategory: orderData.delivery_data.itemCategory,
            description: orderData.delivery_data.description,
            senderPhone: orderData.delivery_data.senderPhone, // Simpan nomor pengirim
            receiverPhone: orderData.delivery_data.receiverPhone // Simpan nomor penerima
        } : null;

        const acceptedOrderData = {
            ...orderData,
            driver_data: driverData,
            delivery_data: deliveryData, // Simpan data pengiriman lengkap
            accepted_at: new Date().toISOString(),
            type: 'driver_accepted_order',
            is_active: true
        };
        
        localStorage.setItem('jego_driver_accepted_order', JSON.stringify(acceptedOrderData));
        console.log('✅ Order yang diterima driver disimpan ke localStorage:', orderData.order_id);
        
        // Juga simpan data pengiriman terpisah untuk akses mudah
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
            console.log('🎯 Driver memiliki order berjalan:', activeOrderId, 'Status:', activeOrder.status);
            
            // Simpan data order yang aktif
            activeOrder.orderId = activeOrderId;
            saveAcceptedOrderToLocalStorage(activeOrder, activeOrder.selected_driver);
            
            // Kirim notifikasi ke Kodular (hanya untuk suara/info)
            sendToKodular({
                action: 'active_order_found',
                order_id: activeOrderId,
                order_status: activeOrder.status,
                message: `Anda memiliki order yang sedang berjalan (Status: ${activeOrder.status}).`
            });

            startActiveOrderListener(activeOrderId);
            
            // Tampilkan notifikasi di halaman
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
            console.log('📭 Order aktif dihapus:', orderId);
            removeAcceptedOrderFromLocalStorage();
            stopActiveOrderListener();
            hideActiveOrderNotification();
            
            sendToKodular({
                action: 'active_order_removed',
                order_id: orderId,
                message: 'Order aktif telah dihapus.'
            });
            return;
        }

        const completedStatuses = ['completed', 'cancelled', 'rejected', 'failed'];
        
        if (completedStatuses.includes(order.status)) {
            console.log('📝 Status order berubah ke selesai/dibatalkan:', order.status);
            removeAcceptedOrderFromLocalStorage();
            stopActiveOrderListener();
            hideActiveOrderNotification();
            
            sendToKodular({
                action: 'active_order_completed',
                order_id: orderId,
                status: order.status,
                message: `Order telah selesai dengan status: ${order.status}`
            });
            
            loadOrders();
        }
        else {
            const activeStatuses = ['accepted', 'on_the_way', 'arrived', 'picked_up', 'on_trip'];
            if (activeStatuses.includes(order.status)) {
                showActiveOrderNotification(order);
            } else {
                console.log('🔄 Status order tidak aktif:', order.status);
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
        <strong>🚗 ORDER BERJALAN - ${statusText}</strong><br>
        <small>${order.alamat_a} → ${order.alamat_b}</small><br>
        <button id="viewActiveOrder" style="background: white; color: #f57c00; border: none; padding: 6px 12px; border-radius: 4px; margin-top: 8px; font-weight: bold; cursor: pointer;">
            LIHAT ORDER
        </button>
    `;
    
    const container = document.querySelector('.container');
    container.insertBefore(notification, container.firstChild);
    
    document.getElementById('viewActiveOrder').addEventListener('click', () => {
        // Kirim event ke Kodular untuk membuka halaman active order
        sendToKodular({
            action: "navigate",
            target: "active_order"
        });
    });
    
    console.log('📢 Notifikasi order berjalan ditampilkan untuk status:', order.status);
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

// ==================== FUNGSI UTAMA INISIALISASI APLIKASI ====================
async function initJeGoApp() {
    console.log('🚀 Aplikasi JeGo diinisialisasi');
    
    // CEK LOGIN STATUS
    const isLoggedIn = await checkLoginStatus();
    if (!isLoggedIn) {
        return; // Hentikan eksekusi jika belum login
    }
    
    // Setup event listeners
    setupEventListeners();
    
    // Mulai monitoring GPS
    setTimeout(() => {
        startGPSMonitoring();
    }, 1000);
    
    // Load data dari storage
    loadDriverLocationFromStorage();
    
    // Load filter tujuan dari Firebase
    setTimeout(() => {
        loadFilterTujuanFromFirebase();
    }, 1500);
    
    // Load orders
    setTimeout(() => {
        loadOrders();
    }, 500);
    
    // Setup sidebar navigation
    setTimeout(() => {
        setupSidebarNavigation();
    }, 500);
    
    // Cek order yang sudah diterima
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
}

// ==================== SETUP EVENT LISTENERS ====================
function setupEventListeners() {
    // Event listeners baru untuk menu
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) menuBtn.addEventListener('click', openSidebar);
    
    const closeSidebarBtn = document.getElementById('closeSidebar');
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
    
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
    
    // TOMBOL SIMPAN PENGATURAN
    const saveSettingsBtn = document.getElementById('saveSettings');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);
    
    // Clear filter tujuan
    const clearFilterTujuan = document.getElementById('clearFilterTujuan');
    if (clearFilterTujuan) clearFilterTujuan.addEventListener('click', function() {
        document.getElementById('filterTujuanInput').value = '';
        filterTujuanText = '';
    });
    
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
            // Langsung simpan ke localStorage
            localStorage.setItem('jego_accept_kurir', acceptKurirEnabled);
            console.log('✅ acceptKurirEnabled disimpan ke localStorage:', acceptKurirEnabled);
            // Refresh orders list untuk menerapkan filter kurir
            loadOrders();
        });
    }
    
    // Radius input
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
    
    // Filter tujuan input
    const filterTujuanInput = document.getElementById('filterTujuanInput');
    if (filterTujuanInput) {
        filterTujuanInput.addEventListener('input', function(e) {
            filterTujuanText = e.target.value;
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
    
    const popupOverlay = document.getElementById('popupOverlay');
    if (popupOverlay) {
        popupOverlay.addEventListener('click', (e) => {
            if (e.target === popupOverlay) {
                closePopup();
            }
        });
    }
    
    // Modal autobid
    const autobidModal = document.getElementById('autobidModal');
    if (autobidModal) {
        autobidModal.addEventListener('click', (e) => {
            if (e.target === autobidModal) {
                console.log('🚫 Modal Autobid tidak bisa di-close');
            }
        });
    }
    
    // Modal order
    const orderModal = document.getElementById('orderModal');
    if (orderModal) {
        orderModal.addEventListener('click', (e) => {
            if (e.target === orderModal) closeModal();
        });
    }
    
    // Event listener untuk modal foto profil besar
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
    
    // Event listener untuk bottom navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const screen = item.dataset.screen;
            console.log(`🔄 Klik nav item: ${screen}`);
            
            // Panggil fungsi navigasi
            navigateToScreen(screen);
        });
    });
}

// ==================== INISIALISASI SAAT HALAMAN DIMUAT ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Halaman JeGo Driver dimuat');
    
    // Tunggu sedikit untuk memastikan Firebase SDK sudah terload
    setTimeout(() => {
        // Inisialisasi Firebase
        const firebaseInitialized = initializeFirebase();
        
        if (firebaseInitialized) {
            console.log('✅ Firebase siap, inisialisasi aplikasi...');
            
            // Setup auth state observer
            if (auth) {
                auth.onAuthStateChanged((user) => {
                    if (user) {
                        console.log('✅ User auth state changed: Logged in', user.uid);
                        initJeGoApp();
                    } else {
                        console.log('❌ User auth state changed: Logged out');
                        // Tampilkan login required
                        const ordersList = document.getElementById('ordersList');
                        if (ordersList) {
                            ordersList.innerHTML = `
                                <div class="empty-state">
                                    <div>🔒</div>
                                    <p>Silakan login untuk mengakses halaman driver</p>
                                    <button onclick="sendToKodular({action: 'navigate', target: 'login'})" 
                                        style="margin-top: 10px; padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 5px; cursor: pointer;">
                                        Login Sekarang
                                    </button>
                                </div>
                            `;
                        }
                    }
                });
            } else {
                // Fallback jika auth belum tersedia
                setTimeout(() => {
                    initJeGoApp();
                }, 1000);
            }
        } else {
            console.log('⚠️ Firebase belum siap, tunggu inisialisasi...');
            setTimeout(() => {
                initJeGoApp();
            }, 2000);
        }
    }, 500);
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
    // Hentikan auto-refresh data driver
    stopDriverDataRefresh();
});
