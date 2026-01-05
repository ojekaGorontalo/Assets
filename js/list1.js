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

let database = null;
let auth = null;
let currentDriver = null;

let ordersRef = null;
let ordersListener = null;
let modalMap = null;
let directionsService = null;
let directionsRenderer = null;
let currentSelectedOrder = null;
let countdownInterval = null;
let offerListenerRef = null;
let offerListener = null;
let currentFilter = 'all';
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

// ==================== FUNGSI CALLBACK UNTUK GOOGLE MAPS API ====================

function initApp() {
  console.log('✅ Google Maps API berhasil di-load');
  initializeFirebase();
}

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
    
    auth.onAuthStateChanged(handleAuthStateChange);
    
    return true;

  } catch (error) {
    console.error('❌ Error inisialisasi Firebase:', error);
    setTimeout(() => {
      showPopup('Gagal terhubung ke server. Periksa koneksi internet Anda.', 'Koneksi Error', 'error');
    }, 1000);
    return false;
  }
}

// ==================== HANDLE AUTH STATE CHANGE ====================

async function handleAuthStateChange(user) {
  if (user) {
    console.log('✅ Firebase Auth: User signed in', {
      uid: user.uid,
      isAnonymous: user.isAnonymous
    });
    
    if (user.isAnonymous) {
      console.log('❌ Anonymous auth tidak diizinkan, sign out...');
      await auth.signOut();
      redirectToLogin();
      return;
    }
    
    await loadDriverData(user.uid);
    
  } else {
    console.log('🔐 Firebase Auth: No user signed in');
    redirectToLogin();
  }
}

// ==================== LOAD DRIVER DATA ====================

async function loadDriverData(uid) {
  try {
    console.log('🔍 Memuat data driver untuk UID:', uid);
    
    const driverRef = database.ref('drivers/' + uid);
    const snapshot = await driverRef.once('value');
    const driverData = snapshot.val();
    
    if (!driverData) {
      console.error('❌ Data driver tidak ditemukan di Firebase');
      showPopup('Akun driver tidak ditemukan.', 'Error', 'error');
      await auth.signOut();
      redirectToLogin();
      return;
    }
    
    if (driverData.status !== 'accepted') {
      console.error('❌ Status driver tidak aktif:', driverData.status);
      showPopup('Akun driver belum aktif atau ditolak.', 'Error', 'error');
      await auth.signOut();
      redirectToLogin();
      return;
    }
    
    currentDriver = {
      ...driverData,
      uid: uid,
      driverId: uid
    };
    
    console.log('✅ Data driver berhasil dimuat:', currentDriver.name || currentDriver.phone);
    
    initJeGoApp();
    
  } catch (error) {
    console.error('❌ Error memuat data driver:', error);
    showPopup('Gagal memuat data driver. Periksa koneksi internet.', 'Error', 'error');
  }
}

// ==================== REDIRECT KE LOGIN ====================

function redirectToLogin() {
  console.log('🔄 Redirect ke halaman login...');
  
  sendToKodular({
    action: "navigate",
    target: "login",
    reason: "not_authenticated"
  });
  
  if (typeof window.AppInventor === 'undefined') {
    showPopup('Anda belum login atau akun tidak aktif. Aplikasi akan membuka halaman login.', 'Perhatian', 'warning');
  }
}

// ==================== FUNGSI UTAMA SEND TO KODULAR ====================

function sendToKodular(data) {
  console.log('📤 Mengirim data ke Kodular:', data);
  
  const jsonString = JSON.stringify(data);
  
  if (typeof window.AppInventor !== 'undefined' && window.AppInventor.setWebViewString) {
    window.AppInventor.setWebViewString(jsonString);
    return true;
  }
  
  else if (typeof window.android !== 'undefined') {
    if (window.android.receiveData) {
      window.android.receiveData(jsonString);
      return true;
    } else if (window.android.sendDataToKodular) {
      window.android.sendDataToKodular(jsonString);
      return true;
    }
  }
  
  else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.observe) {
    window.webkit.messageHandlers.observe.postMessage(data);
    return true;
  }
  
  console.log('📝 Mode browser: Tidak ada bridge ke Kodular');
  console.log('👁️ Data yang akan dikirim ke Kodular:', data);
  
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
      default:
        popupIcon.textContent = "ℹ️";
        popupButton.className = "popup-button popup-button-primary";
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

// ==================== FUNGSI UTAMA INISIALISASI APLIKASI ====================

function initJeGoApp() {
  console.log('🚀 Aplikasi JeGo diinisialisasi');
  
  if (!currentDriver || !currentDriver.uid) {
    console.error('❌ currentDriver tidak valid');
    redirectToLogin();
    return;
  }
  
  setupEventListeners();
  
  setTimeout(() => {
    startGPSMonitoring();
  }, 1000);
  
  loadSettingsFromStorage();
  
  setTimeout(() => {
    loadFilterTujuanFromFirebase();
  }, 1500);
  
  setTimeout(() => {
    loadOrders();
  }, 500);
  
  setTimeout(() => {
    setupSidebarNavigation();
  }, 500);
  
  initializeBalanceSystem();
  
  console.log('🔍 STATUS SISTEM:');
  console.log('- Driver:', currentDriver.name || currentDriver.phone);
  console.log('- Tracking:', locationTrackingEnabled ? 'ON' : 'OFF');
  console.log('- Autobid:', autobidEnabled ? 'ON' : 'OFF');
}

// ==================== FUNGSI LOAD SETTINGS ====================

function loadSettingsFromStorage() {
  const savedAcceptKurir = localStorage.getItem('jego_accept_kurir');
  const savedRadius = localStorage.getItem('jego_custom_radius');
  const savedFilterTujuan = localStorage.getItem('jego_filter_tujuan');
  const savedTracking = localStorage.getItem('jego_location_tracking_enabled');
  const savedAutobid = localStorage.getItem('jego_autobid_enabled');
  
  if (savedAcceptKurir !== null) {
    acceptKurirEnabled = savedAcceptKurir === 'true';
  }
  
  if (savedRadius) {
    customRadius = parseFloat(savedRadius);
  }
  
  if (savedFilterTujuan) {
    const filterData = JSON.parse(savedFilterTujuan);
    filterTujuanText = filterData.text || '';
  }
  
  if (savedTracking !== null) {
    locationTrackingEnabled = savedTracking === 'true';
    updateLocationToggleButton();
    
    if (locationTrackingEnabled) {
      startLocationTracking();
    }
  }
  
  if (savedAutobid !== null) {
    autobidEnabled = savedAutobid === 'true';
    updateAutobidButton();
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
    handleLocationError,
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
    handleLocationError,
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

  console.log(`📍 Lokasi driver diperbarui: ${driverLocation.latitude}, ${driverLocation.longitude}`);

  try {
    localStorage.setItem('jego_driver_location', JSON.stringify(driverLocation));
  } catch (error) {
    console.error('❌ Gagal menyimpan lokasi driver:', error);
  }

  if (locationTrackingEnabled) {
    sendLocationToFirebase();
  }
}

function sendLocationToFirebase() {
  if (!auth || !auth.currentUser || !currentDriver) {
    console.log('🔐 Tidak bisa mengirim lokasi: belum login');
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

// ==================== FUNGSI LOAD ORDERS ====================

function loadOrders() {
  console.log('🔄 Memulai loadOrders...');
  
  const ordersList = document.getElementById('ordersList');
  if (!ordersList) {
    console.error('❌ Element ordersList tidak ditemukan!');
    return;
  }
  
  if (!auth || !auth.currentUser || !currentDriver) {
    console.log('🔐 Belum login, tidak bisa load orders');
    ordersList.innerHTML = `
      <div class="empty-state">
        <div>🛑</div>
        <p>Anda belum login sebagai driver</p>
      </div>
    `;
    return;
  }
  
  ordersList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  
  checkActiveOrderForDriver();
  
  if (ordersListener && ordersRef) {
    ordersRef.off('value', ordersListener);
  }
  
  try {
    ordersRef = database.ref('orders');
    
    ordersListener = ordersRef.on('value', (snapshot) => {
      console.log('✅ Data orders diterima dari Firebase');
      
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
      showConnectionError();
    });
    
  } catch (error) {
    console.error('❌ Error accessing Firebase:', error);
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

// ==================== FUNGSI SISTEM SALDO ====================

function initializeBalanceSystem() {
  if (!currentDriver || !currentDriver.uid) {
    console.log('❌ Tidak ada data driver untuk inisialisasi sistem saldo');
    return;
  }
  
  const balanceRef = database.ref('drivers/' + currentDriver.uid + '/Balance');
  
  balanceListener = balanceRef.on('value', (snapshot) => {
    const newBalance = snapshot.val() || 0;
    currentDriverBalance = newBalance;
    console.log(`💰 Saldo diperbarui: Rp ${newBalance.toLocaleString('id-ID')}`);
  }, (error) => {
    console.error('❌ Error listening to balance:', error);
  });
}

// ==================== FUNGSI UTILITAS LAIN ====================

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
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
  
  return {
    hargaAsal: hargaAsal,
    hargaDiskon: hargaDiskon,
    hasDiscount: true,
    diskonAmount: diskonAmount
  };
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

function checkOrderInRadius(order) {
  if (!driverLocation.latitude || !driverLocation.longitude) {
    return false;
  }
  
  if (!order.from_lat || !order.from_lng) {
    return false;
  }
  
  const distance = calculateDistance(
    driverLocation.latitude,
    driverLocation.longitude,
    order.from_lat,
    order.from_lng
  );
  
  return distance <= customRadius;
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
    console.log('🛑 Initial load tanpa orders, skip kirim ke Kodular');
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

// ==================== FUNGSI TOGGLE LOCATION TRACKING ====================

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

// ==================== FUNGSI TOGGLE AUTOBID ====================

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

// ==================== FUNGSI AUTOBID ====================

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

function checkOrdersForAutobid() {
  if (!canSystemProcessOrder("auto")) {
    console.log("🛑 Autobid dihentikan: Tracking OFF");
    return;
  }

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

// ==================== FUNGSI MODAL ORDER ====================

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

  if (!currentDriver) return;

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

    document.getElementById('countdownContainer').style.display = 'none';
    document.getElementById('ambilBtn').disabled = false;
    document.getElementById('ambilBtn').textContent = 'Kirim Penawaran';

    isAutobidModal = false;
    document.getElementById('closeModal').classList.remove('disabled');

    document.getElementById('orderModal').style.display = 'flex';

    if (!modalMap) initModalMap();
    showRouteOnMap(currentOrder);

  }).catch((error) => {
    console.error('Error checking order status:', error);
    showPopup('Gagal memuat detail order. Silakan coba lagi.', 'Error', 'error');
  });
}

function showAutobidOrderModal(order) {
  if (!currentDriver) return;

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

// ==================== FUNGSI MANUAL CHECK ====================

function startManualCheckInterval() {
  console.log('🔍 Memulai interval pemindaian manual...');

  stopManualCheckInterval();

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

function checkOrdersForManualPopup() {
  if (!canSystemProcessOrder("auto")) {
    console.log("🛑 Manual Popup dihentikan: Tracking OFF");
    return;
  }

  if (!locationTrackingEnabled || autobidEnabled ||
    !currentDriver || isAutobidProcessing ||
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
            console.log(`🚫 Manual Popup: Skip order kurir ${orderId} (di luar radius)`);
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

        sendToKodular({
          action: 'manual_order_found',
          order_id: orderId,
          order_type: isKurir ? 'kurir' : 'penumpang',
          in_radius: true,
          message: `Order ${isKurir ? 'kurir' : 'penumpang'} terdekat ditemukan.`
        });

        showOrderDetail(order);
        return;
      }
    });
  }
}

// ==================== FUNGSI FILTER TUJUAN ====================

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

  return result;
}

function loadFilterTujuanFromFirebase() {
  if (!auth || !auth.currentUser) {
    console.log('🔐 Belum login, tidak bisa load filter tujuan');
    return;
  }

  const filterRef = database.ref('DataJego/Filter');

  filterRef.once('value').then(snapshot => {
    filterTujuanData = snapshot.val();

    if (filterTujuanData && filterTujuanData.status === 'ON') {
      document.getElementById('filterTujuanContainer').style.display = 'block';

      if (currentDriver && currentDriver.uid) {
        const driverId = currentDriver.uid;

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
  }).catch(error => {
    console.error('Error loading filter tujuan:', error);
  });
}

// ==================== FUNGSI NAVIGASI ====================

function navigateToScreen(screen) {
  console.log(`🔄 Navigasi ke screen: ${screen}`);

  updateActiveNavItem(screen);

  const success = sendToKodular({
    action: "navigate",
    target: screen,
    timestamp: new Date().getTime()
  });

  console.log(`📤 Hasil pengiriman navigasi ke ${screen}: ${success ? 'Berhasil' : 'Gagal'}`);

  if (!success) {
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

function setupSidebarNavigation() {
  const sidebarNavButtons = document.querySelectorAll('.sidebar-nav-button');

  sidebarNavButtons.forEach(button => {
    button.addEventListener('click', function() {
      const screen = this.getAttribute('data-screen');
      const buttonId = this.getAttribute('id');
      const buttonTitle = this.querySelector('.sidebar-nav-button-title').textContent;

      console.log(`🔄 Tombol sidebar diklik: ${buttonId} (${screen})`);

      const success = sendToKodular({
        action: "navigate",
        target: screen,
        button_id: buttonId,
        button_title: buttonTitle,
        timestamp: new Date().getTime()
      });

      console.log(`📤 Hasil pengiriman ke Kodular: ${success ? 'Berhasil' : 'Gagal'}`);

      closeSidebar();

      if (!success) {
        showPopup(`Navigasi ke "${buttonTitle}" - Mode browser aktif`, 'Info', 'info');
      }
    });
  });
}

// ==================== FUNGSI SIDEBAR ====================

function openSidebar() {
  document.getElementById('sidebar').style.display = 'block';
  loadSettingsToUI();
  updateStatusInfo();
}

function closeSidebar() {
  document.getElementById('sidebar').style.display = 'none';
}

function loadSettingsToUI() {
  console.log('🔄 Memuat pengaturan ke UI...');

  const savedAcceptKurir = localStorage.getItem('jego_accept_kurir');
  const savedRadius = localStorage.getItem('jego_custom_radius');
  const savedFilterTujuan = localStorage.getItem('jego_filter_tujuan');

  if (savedAcceptKurir !== null) {
    acceptKurirEnabled = savedAcceptKurir === 'true';
  } else {
    acceptKurirEnabled = true;
  }

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

    localStorage.setItem('jego_accept_kurir', acceptKurirEnabled);
    localStorage.setItem('jego_custom_radius', customRadius);
    localStorage.setItem('jego_filter_tujuan', JSON.stringify({
      text: filterTujuanText,
      enabled: filterTujuanEnabled
    }));

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

// ==================== FUNGSI MAP ====================

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

// ==================== FUNGSI FOTO PROFIL ====================

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

// ==================== FUNGSI REFRESH ====================

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
  isAutobidProcessing = false;
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
      console.log('🔄 autobidToggle changed:', e.target.checked);
      toggleAutobid();
    });
  }

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
        console.log('🛑 Modal Autobid tidak bisa di-close');
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
      console.log(`🔄 Klik nav item: ${screen}`);

      navigateToScreen(screen);
    });
  });
}

// ==================== INISIALISASI SAAT HALAMAN DIMUAT ====================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Halaman JeGo Driver dimuat');

  setTimeout(() => {
    if (typeof firebase !== 'undefined') {
      initializeFirebase();
    } else {
      console.error('Firebase SDK belum terload');
      showPopup('Gagal memuat Firebase SDK. Periksa koneksi internet.', 'Error', 'error');
    }
  }, 500);
});

// ==================== CLEANUP SAAT UNLOAD ====================

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
  
  if (balanceListener && currentDriver && currentDriver.uid) {
    const balanceRef = database.ref('drivers/' + currentDriver.uid + '/Balance');
    balanceRef.off('value', balanceListener);
  }
  
  if (auth && auth.currentUser) {
    auth.signOut();
  }
});

// ==================== FUNGSI TAMBAHAN YANG MASIH DIBUTUHKAN ====================

// Catatan: Beberapa fungsi seperti sendAutobidOffer, sendDriverOffer, checkActiveOrderForDriver, dll
// masih diperlukan tetapi karena panjang kode, saya sertakan template singkatnya.
// Anda perlu mengadaptasinya untuk menggunakan currentDriver yang konsisten.

function sendDriverOffer() {
  if (!currentSelectedOrder || !currentDriver) return;

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

  if (!auth || !auth.currentUser) {
    showPopup('Silakan login terlebih dahulu', 'Auth Required', 'warning');
    return;
  }

  const orderId = currentSelectedOrder.order_id || currentSelectedOrder.id;
  const driverId = currentDriver.uid;
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

    const driverData = {
      id: driverId,
      name: currentDriver.name,
      fullName: currentDriver.name,
      plate_number: currentDriver.plateNumber,
      vehicle_type: currentDriver.vehicleType,
      vehicle_brand: currentDriver.vehicleBrand,
      driver_id: currentDriver.uid,
      profile_photo_url: currentDriver.fotoProfilURL || currentDriver.profilePhotoUrl || '',
      offered_at: new Date().toISOString()
    };

    database.ref('orders/' + orderId + '/driver_offers/' + driverId).set(driverData)
      .then(() => {
        console.log('Penawaran driver berhasil dikirim untuk order:', orderId);
        sendToKodular({
          action: 'offer_sent',
          order_id: orderId,
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

function checkActiveOrderForDriver() {
  if (!currentDriver || !currentDriver.uid) {
    console.log('❌ Tidak ada data driver untuk mengecek order berjalan');
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
      hideActiveOrderNotification();
      stopActiveOrderListener();
    }
  }).catch(error => {
    console.error('❌ Error checking active orders:', error);
  });
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
  isAutobidProcessing = false;
  loadOrders();
}

// ==================== FUNGSI TAMBAHAN YANG DISEDERHANAKAN ====================

function sendAutobidOffer() {
  // Implementasi sederhana - sesuaikan dengan kebutuhan
  if (!currentSelectedOrder || !currentDriver) {
    isAutobidProcessing = false;
    closeAutobidModal();
    return;
  }

  const orderId = currentSelectedOrder.order_id || currentSelectedOrder.id;
  const driverId = currentDriver.uid;

  const orderRef = database.ref('orders/' + orderId);
  orderRef.once('value').then((snapshot) => {
    const currentOrder = snapshot.val();

    if (!currentOrder || currentOrder.status !== 'searching') {
      showPopup('Order ini sudah diambil oleh driver lain.', 'Info', 'info');
      closeAutobidModal();
      isAutobidProcessing = false;
      return;
    }

    const driverData = {
      id: driverId,
      name: currentDriver.name,
      fullName: currentDriver.name,
      plate_number: currentDriver.plateNumber,
      vehicle_type: currentDriver.vehicleType,
      vehicle_brand: currentDriver.vehicleBrand,
      driver_id: currentDriver.uid,
      profile_photo_url: currentDriver.fotoProfilURL || currentDriver.profilePhotoUrl || '',
      offered_at: new Date().toISOString(),
      autobid: true
    };

    database.ref('orders/' + orderId + '/driver_offers/' + driverId).set(driverData)
      .then(() => {
        console.log('✅ Autobid: Penawaran berhasil dikirim untuk order:', orderId);
        startAutobidProgressBar();
      })
      .catch((error) => {
        console.error('❌ Autobid: Gagal mengirim penawaran:', error);
        closeAutobidModal();
      });
  }).catch((error) => {
    console.error('❌ Autobid: Error checking order status:', error);
    closeAutobidModal();
  });
}

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
      closeAutobidModal();
    }
  }, 1000);
}

function closeAutobidModal() {
  document.getElementById('autobidModal').style.display = 'none';
  stopAutobidProgressBar();
  currentSelectedOrder = null;
  isAutobidProcessing = false;
}

function stopAutobidProgressBar() {
  if (autobidProgressInterval) {
    clearInterval(autobidProgressInterval);
    autobidProgressInterval = null;
  }
}

// ==================== FUNGSI START COUNTDOWN ====================

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
      isAutobidProcessing = false;
    }
  }, 1000);
}

function removeDriverOffer(orderId, driverId) {
  database.ref('orders/' + orderId + '/driver_offers/' + driverId).remove()
    .then(() => console.log('Data driver dihapus karena waktu habis:', driverId))
    .catch(error => console.error('Gagal menghapus data driver:', error));
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
        playOrderAcceptedSound();
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
