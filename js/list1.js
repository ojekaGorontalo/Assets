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

// ==================== VARIABEL GLOBAL ====================

let database;
let auth;
let currentDriver = null;

// Orders & UI State
let ordersRef = null;
let ordersListener = null;
let modalMap = null;
let directionsService = null;
let directionsRenderer = null;
let currentSelectedOrder = null;
let countdownInterval = null;
let currentFilter = 'all';

// GPS & Tracking
let driverLocation = {
  latitude: null,
  longitude: null,
  accuracy: null,
  lastUpdated: null
};
let locationWatchId = null;
let locationTrackingEnabled = false;
let locationTrackingInterval = null;

// Autobid System
let autobidEnabled = false;
let autobidInterval = null;
let isAutobidProcessing = false;
let processedOrders = new Set();

// Driver Settings
let acceptKurirEnabled = true;
let customRadius = 1.0;
let filterTujuanEnabled = false;
let filterTujuanText = '';

// ==================== INISIALISASI FIREBASE ====================

function initializeFirebase() {
  try {
    if (typeof firebase === 'undefined') {
      console.error('Firebase SDK tidak terload');
      showPopup('Gagal memuat Firebase SDK. Periksa koneksi internet.', 'Error', 'error');
      return false;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }

    database = firebase.database();
    auth = firebase.auth();
    
    console.log('✅ Firebase berhasil diinisialisasi');
    
    auth.onAuthStateChanged(handleAuthStateChanged);
    
    return true;
  } catch (error) {
    console.error('❌ Error inisialisasi Firebase:', error);
    showPopup('Gagal terhubung ke server. Periksa koneksi internet Anda.', 'Koneksi Error', 'error');
    return false;
  }
}

// ==================== HANDLER AUTH STATE ====================

async function handleAuthStateChanged(user) {
  if (user) {
    console.log('✅ Firebase Auth: User signed in', {
      uid: user.uid,
      phoneNumber: user.phoneNumber
    });
    
    await loadDriverData(user.uid);
    
  } else {
    console.log('🔐 Firebase Auth: No user signed in');
    redirectToLogin('not_logged_in');
  }
}

// ==================== LOAD DATA DRIVER ====================

async function loadDriverData(uid) {
  try {
    console.log('🔍 Memuat data driver dari Firebase untuk UID:', uid);
    
    const driverRef = database.ref('drivers/' + uid);
    const snapshot = await driverRef.once('value');
    const driverData = snapshot.val();
    
    if (!driverData) {
      console.error('❌ Data driver tidak ditemukan di Firebase');
      showPopup('Data driver tidak ditemukan. Silakan daftar ulang.', 'Error', 'error');
      redirectToLogin('driver_not_found');
      return;
    }
    
    if (driverData.status !== 'accepted') {
      console.error('❌ Status driver tidak aktif:', driverData.status);
      showPopup('Akun driver Anda belum aktif. Silakan tunggu verifikasi admin.', 'Status Driver', 'warning');
      redirectToLogin('driver_not_accepted');
      return;
    }
    
    currentDriver = {
      uid: uid,
      ...driverData,
      name: driverData.name || driverData.fullName,
      phone: driverData.phone,
      vehicleType: driverData.vehicleType,
      vehicleBrand: driverData.vehicleBrand,
      plateNumber: driverData.plateNumber,
      fotoProfilURL: driverData.fotoProfilURL || driverData.profilePhotoUrl || '',
      avgRating: driverData.avgRating || driverData.rating || 5,
      totalTrips: driverData.totalTrips || driverData.perjalanan || 0
    };
    
    console.log('✅ Data driver berhasil dimuat:', currentDriver.name);
    
    localStorage.setItem('jego_logged_in_driver', JSON.stringify(currentDriver));
    
    startApp();
    
  } catch (error) {
    console.error('❌ Error memuat data driver:', error);
    showPopup('Gagal memuat data driver. Silakan coba lagi.', 'Error', 'error');
  }
}

// ==================== REDIRECT KE LOGIN ====================

function redirectToLogin(reason) {
  console.log('🔄 Redirect ke halaman login. Reason:', reason);
  
  sendToKodular({
    action: "navigate",
    target: "login",
    reason: reason
  });
  
  showPopup('Anda belum login atau akun tidak aktif. Aplikasi akan membuka halaman login.', 'Perhatian', 'warning');
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

// ==================== FUNGSI UTAMA SEND TO KODULAR ====================

function sendToKodular(data) {
  console.log('📤 Mengirim data ke Kodular:', data);
  const jsonString = JSON.stringify(data);

  if (typeof window.AppInventor !== 'undefined' && window.AppInventor.setWebViewString) {
    window.AppInventor.setWebViewString(jsonString);
    console.log('✅ Data berhasil dikirim via AppInventor.setWebViewString');
    return true;
  } else if (typeof window.android !== 'undefined' && window.android.receiveData) {
    window.android.receiveData(jsonString);
    console.log('✅ Data berhasil dikirim via android.receiveData');
    return true;
  } else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.observe) {
    window.webkit.messageHandlers.observe.postMessage(data);
    console.log('✅ Data berhasil dikirim via webkit.messageHandlers');
    return true;
  }

  console.log('📝 Mode browser: Tidak ada bridge ke Kodular yang terdeteksi');
  console.log('👁️ Data yang akan dikirim ke Kodular (browser mode):', data);
  return false;
}

// ==================== FUNGSI UTAMA START APP ====================

function startApp() {
  console.log('🚀 Memulai aplikasi untuk driver:', currentDriver.name);
  
  setupEventListeners();
  
  setTimeout(() => {
    startGPSMonitoring();
  }, 1000);
  
  loadSettingsFromStorage();
  
  setTimeout(() => {
    loadOrders();
  }, 500);
  
  checkActiveOrderForDriver();
  
  console.log('🔍 STATUS SISTEM:');
  console.log('- Driver:', currentDriver.name);
  console.log('- Tracking:', locationTrackingEnabled ? '✅ ON' : '❌ OFF');
  console.log('- Autobid:', autobidEnabled ? '✅ ON' : '❌ OFF');
}

// ==================== FUNGSI LOAD SETTINGS ====================

function loadSettingsFromStorage() {
  const savedTracking = localStorage.getItem('jego_location_tracking_enabled');
  const savedAutobid = localStorage.getItem('jego_autobid_enabled');
  const savedAcceptKurir = localStorage.getItem('jego_accept_kurir');
  const savedRadius = localStorage.getItem('jego_custom_radius');
  const savedFilterTujuan = localStorage.getItem('jego_filter_tujuan');
  
  if (savedTracking !== null) {
    locationTrackingEnabled = savedTracking === 'true';
    updateLocationToggleButton();
  }
  
  if (savedAutobid !== null) {
    autobidEnabled = savedAutobid === 'true';
    updateAutobidButton();
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
    try {
      const filterData = JSON.parse(savedFilterTujuan);
      filterTujuanText = filterData.text || '';
      filterTujuanEnabled = filterData.enabled || false;
    } catch (e) {
      console.error('Error parsing filter tujuan:', e);
    }
  }
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
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
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
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

function updateDriverLocation(position) {
  driverLocation = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    lastUpdated: new Date()
  };

  console.log(`📍 Lokasi driver diperbarui: ${driverLocation.latitude}, ${driverLocation.longitude}`);
  
  saveDriverLocationToStorage();

  if (locationTrackingEnabled) {
    sendLocationToFirebase();
  }
}

function saveDriverLocationToStorage() {
  try {
    localStorage.setItem('jego_driver_location', JSON.stringify(driverLocation));
  } catch (error) {
    console.error('❌ Gagal menyimpan lokasi driver:', error);
  }
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

// ==================== LOCATION TRACKING ====================

function toggleLocationTracking() {
  if (!database) {
    showPopup('Tidak terhubung ke server. Periksa koneksi internet Anda.', 'Koneksi Error', 'error');
    return;
  }

  locationTrackingEnabled = !locationTrackingEnabled;
  updateLocationToggleButton();

  if (locationTrackingEnabled) {
    if (!driverLocation.latitude || !driverLocation.longitude) {
      showPopup('GPS diperlukan untuk mengaktifkan tracking. Pastikan lokasi Anda aktif.', 'GPS Error', 'warning');
      locationTrackingEnabled = false;
      updateLocationToggleButton();
      return;
    }
    startLocationTracking();
  } else {
    if (autobidEnabled) {
      autobidEnabled = false;
      stopAutobid();
      updateAutobidButton();
    }
    stopLocationTracking();
  }

  localStorage.setItem('jego_location_tracking_enabled', locationTrackingEnabled);
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
  
  if (currentDriver && currentDriver.uid) {
    database.ref('drivers/' + currentDriver.uid).update({
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
  if (!auth || !auth.currentUser) {
    console.log('🔐 Tidak bisa mengirim lokasi: belum login Firebase Auth');
    return;
  }

  if (!currentDriver || !currentDriver.uid) {
    console.log('❌ Tidak ada data driver untuk mengirim lokasi');
    return;
  }

  if (!driverLocation.latitude || !driverLocation.longitude) {
    console.log('❌ Tidak ada data lokasi untuk dikirim');
    return;
  }

  const locationUpdate = {
    latitude: driverLocation.latitude,
    longitude: driverLocation.longitude,
    accuracy: driverLocation.accuracy,
    last_updated: new Date().toISOString(),
    online: true,
    tracking_enabled: true
  };

  database.ref('drivers/' + currentDriver.uid).update(locationUpdate)
    .then(() => {
      console.log('✅ Lokasi driver dikirim ke Firebase');
    })
    .catch(error => {
      console.error('❌ Gagal mengirim lokasi ke Firebase:', error);
    });
}

// ==================== FUNGSI LOAD ORDERS ====================

function loadOrders() {
  console.log('🔄 Memulai loadOrders...');
  
  const ordersList = document.getElementById('ordersList');
  if (!ordersList) {
    console.error('❌ Element ordersList tidak ditemukan!');
    return;
  }

  ordersList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const loadingTimeout = setTimeout(() => {
    if (ordersList.querySelector('.loading')) {
      console.log('⚠️ Timeout loading orders');
      showConnectionError();
    }
  }, 10000);

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
        ordersList.innerHTML = `
          <div class="empty-state">
            <div>📝</div>
            <p>Tidak ada permintaan order saat ini</p>
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
          <div>📝</div>
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

function filterOrderByVehicleType(order) {
  if (!currentDriver) return false;
  
  const driverVehicleType = currentDriver.vehicleType;
  const orderVehicleType = order.vehicle;
  
  const vehicleMapping = {
    'motor': ['motor', 'kurir_motor'],
    'bentor': ['bentor', 'kurir_bentor'],
    'mobil': ['mobil']
  };
  
  return vehicleMapping[driverVehicleType]?.includes(orderVehicleType) || false;
}

function filterOrderByType(order) {
  if (currentFilter === 'all') {
    const isKurir = order.vehicle && order.vehicle.includes('kurir');
    if (!acceptKurirEnabled && isKurir) {
      return false;
    }
    return true;
  }

  const isKurir = order.vehicle && order.vehicle.includes('kurir');
  
  if (!acceptKurirEnabled && isKurir) {
    return false;
  }
  
  if (currentFilter === 'penumpang') return !isKurir;
  if (currentFilter === 'kurir') return isKurir;
  
  return true;
}

// ==================== RENDER ORDERS LIST ====================

function renderOrdersList(orders, ordersList) {
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
      console.log(`🚫 Render: Skip order kurir karena acceptKurirEnabled = false`);
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

// ==================== FUNGSI HELPER ====================

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

// ==================== SETUP EVENT LISTENERS ====================

function setupEventListeners() {
  const menuBtn = document.getElementById('menuBtn');
  if (menuBtn) menuBtn.addEventListener('click', openSidebar);
  
  const closeSidebarBtn = document.getElementById('closeSidebar');
  if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
  
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
  
  const locationToggleBtn = document.getElementById('locationToggleBtn');
  if (locationToggleBtn) locationToggleBtn.addEventListener('click', toggleLocationTracking);
  
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', refreshData);
  
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
}

// ==================== FUNGSI UTILITY ====================

function refreshData() {
  console.log('🔄 Refresh data manual');
  loadOrders();
  
  if (locationTrackingEnabled && driverLocation.latitude && driverLocation.longitude) {
    sendLocationToFirebase();
  }
}

function showConnectionError() {
  const ordersList = document.getElementById('ordersList');
  
  ordersList.innerHTML = `
    <div class="empty-state">
      <div>⚠️</div>
      <p>Gagal terhubung ke server</p>
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

// ==================== FUNGSI SIDEBAR & SETTINGS ====================

function openSidebar() {
  document.getElementById('sidebar').style.display = 'block';
  loadSettingsToUI();
}

function closeSidebar() {
  document.getElementById('sidebar').style.display = 'none';
}

function loadSettingsToUI() {
  const savedAcceptKurir = localStorage.getItem('jego_accept_kurir');
  const savedRadius = localStorage.getItem('jego_custom_radius');
  const savedFilterTujuan = localStorage.getItem('jego_filter_tujuan');

  if (savedAcceptKurir !== null) {
    acceptKurirEnabled = savedAcceptKurir === 'true';
  } else {
    acceptKurirEnabled = true;
  }

  const autobidToggle = document.getElementById('autobidToggle');
  const acceptKurirToggle = document.getElementById('acceptKurirToggle');
  const radiusInput = document.getElementById('radiusInput');
  const filterTujuanInput = document.getElementById('filterTujuanInput');

  if (autobidToggle) autobidToggle.checked = autobidEnabled;
  if (acceptKurirToggle) acceptKurirToggle.checked = acceptKurirEnabled;
  if (radiusInput) radiusInput.value = customRadius = savedRadius ? parseFloat(savedRadius) : 1.0;

  if (savedFilterTujuan) {
    const filterData = JSON.parse(savedFilterTujuan);
    if (filterTujuanInput) filterTujuanInput.value = filterTujuanText = filterData.text || '';
  }

  updateAutobidToggleStatus();
}

function saveSettings() {
  try {
    const acceptKurirToggle = document.getElementById('acceptKurirToggle');
    const radiusInput = document.getElementById('radiusInput');
    const filterTujuanInput = document.getElementById('filterTujuanInput');

    if (acceptKurirToggle) acceptKurirEnabled = acceptKurirToggle.checked;
    if (radiusInput) customRadius = parseFloat(radiusInput.value);
    if (filterTujuanInput) filterTujuanText = filterTujuanInput.value;

    if (isNaN(customRadius) || customRadius < 0.1 || customRadius > 10) {
      showPopup('Jarak radius harus antara 0.1 - 10 km', 'Validasi Error', 'warning');
      if (radiusInput) radiusInput.value = 1.0;
      customRadius = 1.0;
      return;
    }

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

function updateAutobidButton() {
  const autobidToggle = document.getElementById('autobidToggle');
  if (autobidToggle) {
    autobidToggle.checked = autobidEnabled;
  }
}

// ==================== FUNGSI ORDER DETAIL ====================

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
  }

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

    const customerName = currentOrder.user_data?.name || currentOrder.user_data?.nama || 'Tidak diketahui';
    const customerPhoto = getCustomerPhoto(currentOrder);

    const modalCustomerName = document.getElementById('modalCustomerName');
    if (modalCustomerName) {
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
    }

    const modalAddressA = document.getElementById('modalAddressA');
    const modalAddressB = document.getElementById('modalAddressB');
    const modalDuration = document.getElementById('modalDuration');
    const modalDistance = document.getElementById('modalDistance');
    const modalPrice = document.getElementById('modalPrice');
    const modalPromoInfo = document.getElementById('modalPromoInfo');

    if (modalAddressA) modalAddressA.textContent = currentOrder.alamat_a || '-';
    if (modalAddressB) modalAddressB.textContent = currentOrder.alamat_b || '-';
    if (modalDuration) modalDuration.textContent = currentOrder.durasi || '-';
    if (modalDistance) modalDistance.textContent = currentOrder.jarak || '-';

    const discountedPrice = calculateDiscountedPrice(currentOrder);
    const hasRealPromo = discountedPrice.hasDiscount;

    if (hasRealPromo && modalPromoInfo) {
      modalPromoInfo.style.display = 'block';
      const modalPromoCode = document.getElementById('modalPromoCode');
      const modalPromoDiscount = document.getElementById('modalPromoDiscount');
      if (modalPromoCode) modalPromoCode.textContent = currentOrder.kode_promo || currentOrder.promo_data?.code || '-';
      if (modalPromoDiscount) modalPromoDiscount.textContent = currentOrder.diskon_persen ? `${currentOrder.diskon_persen}%` : (currentOrder.promo_data?.discount ? `${currentOrder.promo_data.discount}%` : '-');

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

    const driverDistance = getDriverToPickupDistance(currentOrder);
    const driverDistanceContainer = document.getElementById('driverDistanceContainer');
    const driverDistanceElement = document.getElementById('driverDistance');

    if (driverDistance !== null && driverDistanceElement && driverDistanceContainer) {
      let distanceText;
      if (driverDistance < 1) {
        distanceText = Math.round(driverDistance * 1000) + ' M';
      } else {
        distanceText = driverDistance.toFixed(1) + ' KM';
      }
      driverDistanceElement.textContent = distanceText;
      driverDistanceContainer.style.display = 'block';
    } else if (driverDistanceContainer) {
      driverDistanceContainer.style.display = 'none';
    }

    const countdownContainer = document.getElementById('countdownContainer');
    const ambilBtn = document.getElementById('ambilBtn');
    const closeModal = document.getElementById('closeModal');

    if (countdownContainer) countdownContainer.style.display = 'none';
    if (ambilBtn) {
      ambilBtn.disabled = false;
      ambilBtn.textContent = 'Kirim Penawaran';
    }
    if (closeModal) closeModal.classList.remove('disabled');

    const orderModal = document.getElementById('orderModal');
    if (orderModal) {
      orderModal.style.display = 'flex';
      if (!modalMap) initModalMap();
      showRouteOnMap(currentOrder);
    }

  }).catch((error) => {
    console.error('Error checking order status:', error);
    showPopup('Gagal memuat detail order. Silakan coba lagi.', 'Error', 'error');
  });
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

  console.log(`📍 Jarak driver ke order ${order.order_id || order.id}: ${distance.toFixed(2)} KM (Radius: ${customRadius}km)`);

  return distance <= customRadius;
}

// ==================== FUNGSI MAP ====================

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
  if (!order.from_lat || !order.from_lng || !order.to_lat || !order.to_lng) return;
  if (!directionsService || !directionsRenderer) return;

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

// ==================== FUNGSI CUSTOMER PHOTO ====================

function showCustomerPhoto(photoUrl, customerName) {
  const photoModal = document.getElementById('photoModal');
  const largePhoto = document.getElementById('largeCustomerPhoto');
  const largeName = document.getElementById('largeCustomerName');

  if (largePhoto) largePhoto.src = photoUrl;
  if (largePhoto) largePhoto.alt = customerName;
  if (largeName) largeName.textContent = customerName;
  if (photoModal) photoModal.style.display = 'flex';
}

function closePhotoModal() {
  const photoModal = document.getElementById('photoModal');
  if (photoModal) photoModal.style.display = 'none';
}

// ==================== FUNGSI AUTOBID ====================

function toggleAutobid() {
  if (!database) {
    showPopup('Tidak terhubung ke server. Periksa koneksi internet Anda.', 'Koneksi Error', 'error');
    return;
  }

  if (!locationTrackingEnabled) {
    showPopup('Aktifkan tracking terlebih dahulu untuk menggunakan autobid', 'Peringatan', 'warning');
    const autobidToggle = document.getElementById('autobidToggle');
    if (autobidToggle) autobidToggle.checked = false;
    return;
  }

  if (!driverLocation.latitude || !driverLocation.longitude) {
    showPopup('GPS diperlukan untuk mengaktifkan Autobid. Pastikan lokasi Anda aktif.', 'GPS Error', 'warning');
    updateGPSStatus(false, 'GPS diperlukan untuk Autobid');
    const autobidToggle = document.getElementById('autobidToggle');
    if (autobidToggle) autobidToggle.checked = false;
    return;
  }

  autobidEnabled = !autobidEnabled;
  updateAutobidButton();

  if (autobidEnabled) {
    startAutobid();
  } else {
    stopAutobid();
  }

  localStorage.setItem('jego_autobid_enabled', autobidEnabled);
}

function startAutobid() {
  console.log('🚀 Autobid diaktifkan');
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

function checkOrdersForAutobid() {
  if (!autobidEnabled || !currentDriver || isAutobidProcessing ||
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
          console.log(`🚫 Autobid: Skip order ${orderId} (order kurir - tidak boleh autobid)`);
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

function showAutobidOrderModal(order) {
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

    const customerName = currentOrder.user_data?.name || currentOrder.user_data?.nama || 'Tidak diketahui';
    const customerPhoto = getCustomerPhoto(currentOrder);

    const autobidCustomerName = document.getElementById('autobidCustomerName');
    if (autobidCustomerName) {
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
    }

    const autobidAddressA = document.getElementById('autobidAddressA');
    const autobidAddressB = document.getElementById('autobidAddressB');
    const autobidDuration = document.getElementById('autobidDuration');
    const autobidDistance = document.getElementById('autobidDistance');
    const autobidPrice = document.getElementById('autobidPrice');
    const autobidPromoInfo = document.getElementById('autobidPromoInfo');

    if (autobidAddressA) autobidAddressA.textContent = currentOrder.alamat_a || '-';
    if (autobidAddressB) autobidAddressB.textContent = currentOrder.alamat_b || '-';
    if (autobidDuration) autobidDuration.textContent = currentOrder.durasi || '-';
    if (autobidDistance) autobidDistance.textContent = currentOrder.jarak || '-';

    const discountedPrice = calculateDiscountedPrice(currentOrder);
    if (autobidPrice) autobidPrice.textContent = discountedPrice.hargaDiskon ? `Rp ${discountedPrice.hargaDiskon.toLocaleString('id-ID')}` : '-';

    if (discountedPrice.hasDiscount && autobidPromoInfo) {
      autobidPromoInfo.style.display = 'block';
      autobidPromoInfo.innerHTML = `
        <div class="autobid-promo-badge">🎉 ORDER PROMO - ${currentOrder.diskon_persen}%</div>
        <div style="font-size: 0.7rem; color: #856404;">
          Harga asli: Rp ${discountedPrice.hargaAsal.toLocaleString('id-ID')} →
          Harga diskon: Rp ${discountedPrice.hargaDiskon.toLocaleString('id-ID')}
        </div>
      `;
    } else if (autobidPromoInfo) {
      autobidPromoInfo.style.display = 'none';
    }

    const autobidModal = document.getElementById('autobidModal');
    if (autobidModal) {
      autobidModal.style.display = 'flex';
      playAutobidSound();
      
      sendToKodular({
        action: 'autobid_order_found',
        order_id: orderKey,
        order_data: currentOrder,
        message: `Autobid menemukan order dalam radius jarak terdekat. Segera mengirim penawaran.`
      });

      sendAutobidOffer();
    }

  }).catch((error) => {
    console.error('Error checking order status:', error);
    isAutobidProcessing = false;
    processedOrders.delete(orderKey);
  });
}

// ==================== FUNGSI SUARA ====================

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

    if (currentSelectedOrder) {
      const orderId = currentSelectedOrder.order_id || currentSelectedOrder.id;
      sendToKodular({
        action: "order_accepted",
        order_id: orderId
      });
    }

  } catch (error) {
    console.error('Error memutar suara order diterima:', error);
    if (currentSelectedOrder) {
      const orderId = currentSelectedOrder.order_id || currentSelectedOrder.id;
      sendToKodular({
        action: "order_accepted",
        order_id: orderId
      });
    }
  }
}

// ==================== FUNGSI ORDER ACTIVE ====================

function checkActiveOrderForDriver() {
  if (!currentDriver || !currentDriver.uid) {
    console.log('❌ Tidak ada data driver untuk mengecek order berjalan');
    return;
  }

  if (!auth || !auth.currentUser) {
    console.log('🔐 Belum login, tidak bisa cek active order');
    return;
  }

  console.log('🔍 Mengecek order berjalan untuk driver:', currentDriver.uid);

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
          order.selected_driver.driver_id === currentDriver.uid &&
          activeStatuses.includes(order.status)) {
          activeOrder = order;
          activeOrderId = orderId;
          console.log('✅ Order berjalan ditemukan:', orderId, 'Status:', order.status);
        }
      });
    }

    if (activeOrder) {
      console.log('🎉 Driver memiliki order berjalan:', activeOrderId, 'Status:', activeOrder.status);

      saveAcceptedOrderToLocalStorage(activeOrder, activeOrder.selected_driver);

      sendToKodular({
        action: 'active_order_found',
        order_id: activeOrderId,
        order_status: activeOrder.status,
        message: `Anda memiliki order yang sedang berjalan (Status: ${activeOrder.status}).`
      });

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

function saveAcceptedOrderToLocalStorage(orderData, driverData) {
  try {
    const acceptedOrderData = {
      ...orderData,
      driver_data: driverData,
      accepted_at: new Date().toISOString(),
      type: 'driver_accepted_order',
      is_active: true
    };

    localStorage.setItem('jego_driver_accepted_order', JSON.stringify(acceptedOrderData));
    console.log('✅ Order yang diterima driver disimpan ke localStorage:', orderData.order_id);
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

function updateActiveOrderBadge(hasActiveOrder) {
  const badge = document.getElementById('activeOrderBadge');
  if (badge) {
    badge.style.display = hasActiveOrder ? 'flex' : 'none';
  }
}

// ==================== INISIALISASI APLIKASI ====================

function initJeGoApp() {
  console.log('🚀 Aplikasi JeGo diinisialisasi');
  // Firebase akan memanggil handleAuthStateChanged saat auth state siap
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
});
