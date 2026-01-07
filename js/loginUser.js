// ===== FIREBASE CONFIGURATION =====
// Pastikan firebase-config.js sudah di-load sebelumnya

// ===== GLOBAL VARIABLES =====
let appVerifier = null;
let confirmationResult = null;
let currentUser = null;
let userData = null;
let resendTimer = null;
let timerSeconds = 60;

// ===== DOM ELEMENTS =====
const elements = {
    // Login Section
    loginCard: document.getElementById('loginCard'),
    phoneNumber: document.getElementById('phoneNumber'),
    otpSection: document.getElementById('otpSection'),
    otpInputs: document.querySelectorAll('.otp-input'),
    submitBtn: document.getElementById('submitBtn'),
    resendSection: document.getElementById('resendSection'),
    resendBtn: document.getElementById('resendBtn'),
    errorMessage: document.getElementById('errorMessage'),
    timerDisplay: document.getElementById('timer'),
    
    // Dashboard Section
    dashboard: document.getElementById('dashboard'),
    avatarInitial: document.getElementById('avatarInitial'),
    userName: document.getElementById('userName'),
    userPhone: document.getElementById('userPhone'),
    userPerjalanan: document.getElementById('userPerjalanan'),
    userRating: document.getElementById('userRating'),
    
    // Profile Info
    infoName: document.getElementById('infoName'),
    infoAddress: document.getElementById('infoAddress'),
    infoGender: document.getElementById('infoGender'),
    infoStatus: document.getElementById('infoStatus'),
    infoCreatedAt: document.getElementById('infoCreatedAt'),
    
    // Tabs
    tabs: document.querySelectorAll('.tab'),
    profileTab: document.getElementById('profileTab'),
    settingsTab: document.getElementById('settingsTab'),
    historyTab: document.getElementById('historyTab'),
    
    // History
    emptyHistory: document.getElementById('emptyHistory'),
    historyList: document.getElementById('historyList'),
    
    // Settings
    notifToggle: document.getElementById('notifToggle'),
    darkModeToggle: document.getElementById('darkModeToggle'),
    languageSelect: document.getElementById('languageSelect'),
    
    // Modal
    editModal: document.getElementById('editModal'),
    editName: document.getElementById('editName'),
    editAddress: document.getElementById('editAddress'),
    editStatus: document.getElementById('editStatus'),
    
    // Buttons
    editProfileBtn: document.getElementById('editProfileBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    saveProfileBtn: document.getElementById('saveProfileBtn'),
    cancelEditBtn: document.getElementById('cancelEditBtn'),
    closeModalBtn: document.getElementById('closeModalBtn')
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    // Check if Firebase is loaded
    if (!firebase || !firebase.apps.length) {
        showError('Firebase tidak terinisialisasi. Periksa koneksi internet Anda.');
        return;
    }
    
    initializeApp();
});

function initializeApp() {
    try {
        // Initialize Firebase services
        initializeFirebaseServices();
        
        // Setup event listeners
        setupEventListeners();
        
        // Check auth state
        checkAuthState();
        
        // Initialize UI
        initializeUI();
        
        console.log('JeGo App initialized successfully');
        
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Gagal menginisialisasi aplikasi. Silakan refresh halaman.');
    }
}

function initializeFirebaseServices() {
    try {
        const auth = firebase.auth();
        const database = firebase.database();
        
        // Setup reCAPTCHA
        appVerifier = new firebase.auth.RecaptchaVerifier('submitBtn', {
            'size': 'invisible',
            'callback': function(response) {
                console.log('reCAPTCHA terverifikasi');
            },
            'expired-callback': function() {
                console.log('reCAPTCHA expired');
                showError('Sesi reCAPTCHA telah berakhir. Silakan coba lagi.');
                resetOTPState();
            }
        });
        
        // Store services globally
        window.firebaseServices = { auth, database };
        
    } catch (error) {
        console.error('Error initializing Firebase:', error);
        throw error;
    }
}

function setupEventListeners() {
    // OTP Input handling
    elements.otpInputs.forEach(input => {
        input.addEventListener('input', handleOTPInput);
        input.addEventListener('keydown', handleOTPKeydown);
        input.addEventListener('paste', handleOTPPaste);
    });
    
    // Submit Button
    elements.submitBtn.addEventListener('click', handleSubmit);
    
    // Resend OTP
    elements.resendBtn.addEventListener('click', handleResendOTP);
    
    // Tabs
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    // Modal
    elements.editProfileBtn.addEventListener('click', openEditModal);
    elements.logoutBtn.addEventListener('click', handleLogout);
    elements.saveProfileBtn.addEventListener('click', saveProfile);
    elements.cancelEditBtn.addEventListener('click', closeEditModal);
    elements.closeModalBtn.addEventListener('click', closeEditModal);
    
    // Settings
    elements.notifToggle?.addEventListener('change', handleSettingChange);
    elements.darkModeToggle?.addEventListener('change', handleSettingChange);
    elements.languageSelect?.addEventListener('change', handleSettingChange);
    
    // Phone number input validation
    elements.phoneNumber.addEventListener('input', validatePhoneNumber);
    
    // Close modal on outside click
    elements.editModal.addEventListener('click', function(e) {
        if (e.target === this) closeEditModal();
    });
    
    // Handle escape key for modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && !elements.editModal.classList.contains('hidden')) {
            closeEditModal();
        }
    });
}

function initializeUI() {
    // Load saved settings
    loadSettings();
    
    // Update dark mode
    updateDarkMode();
}

// ===== AUTHENTICATION FUNCTIONS =====
function checkAuthState() {
    const { auth } = window.firebaseServices;
    
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            loadUserData();
            showDashboard();
        } else {
            showLogin();
        }
    });
}

async function handleSubmit() {
    const phoneNumber = elements.phoneNumber.value.trim();
    
    if (!validatePhoneNumber()) {
        return;
    }
    
    try {
        if (!confirmationResult) {
            // Send OTP
            await sendOTP(phoneNumber);
        } else {
            // Verify OTP
            await verifyOTP();
        }
    } catch (error) {
        console.error('Error in handleSubmit:', error);
        showError(getFirebaseErrorMessage(error));
    }
}

async function sendOTP(phoneNumber) {
    const { auth } = window.firebaseServices;
    
    try {
        // Format phone number
        const formattedPhone = formatPhoneNumber(phoneNumber);
        
        // Show loading state
        setButtonLoading(true, 'Mengirim OTP...');
        
        // Send OTP
        confirmationResult = await auth.signInWithPhoneNumber(
            formattedPhone, 
            appVerifier
        );
        
        // Show OTP input
        showOTPInput();
        
        // Start resend timer
        startResendTimer();
        
        // Show success message
        showSuccess('Kode OTP telah dikirim ke nomor Anda');
        
    } catch (error) {
        console.error('Error sending OTP:', error);
        throw error;
    } finally {
        setButtonLoading(false, 'Verifikasi OTP');
    }
}

async function verifyOTP() {
    const otpCode = getOTPCode();
    
    if (otpCode.length !== 6) {
        showError('Masukkan 6 digit kode OTP lengkap');
        return;
    }
    
    try {
        setButtonLoading(true, 'Memverifikasi...');
        
        // Confirm OTP
        const userCredential = await confirmationResult.confirm(otpCode);
        const user = userCredential.user;
        
        // Handle user login
        await handleUserLogin(user);
        
    } catch (error) {
        console.error('Error verifying OTP:', error);
        showError('Kode OTP salah atau telah kadaluarsa');
        throw error;
    } finally {
        setButtonLoading(false, 'Verifikasi OTP');
    }
}

async function handleUserLogin(user) {
    const { database } = window.firebaseServices;
    
    try {
        // Check if user exists in database
        const userRef = database.ref(`users/${user.uid}`);
        const snapshot = await userRef.once('value');
        
        if (!snapshot.exists()) {
            // New user - create default data
            const newUserData = createDefaultUserData(user);
            await userRef.set(newUserData);
            userData = newUserData;
            
            showSuccess('Akun baru berhasil dibuat!');
        } else {
            // Existing user - load data
            userData = snapshot.val();
        }
        
        // Update UI
        updateProfileUI();
        showDashboard();
        
        // Clear OTP inputs
        clearOTPInputs();
        
    } catch (error) {
        console.error('Error handling user login:', error);
        showError('Gagal memproses data pengguna');
        throw error;
    }
}

function createDefaultUserData(user) {
    const phone = user.phoneNumber || elements.phoneNumber.value;
    const now = new Date().toISOString();
    
    return {
        phone: phone,
        address: '',
        firebase_key: user.uid,
        profilUrl: '',
        gender: '',
        name: 'Pengguna JeGo',
        perjalanan: 0,
        rating: 5.0,
        status: 'Aktif',
        createdAt: now,
        updatedAt: now
    };
}

async function handleLogout() {
    const { auth } = window.firebaseServices;
    
    try {
        await auth.signOut();
        currentUser = null;
        userData = null;
        confirmationResult = null;
        
        showLogin();
        showSuccess('Berhasil keluar dari akun');
        
        // Clear any existing timer
        if (resendTimer) {
            clearInterval(resendTimer);
        }
        
    } catch (error) {
        console.error('Error logging out:', error);
        showError('Gagal keluar dari akun');
    }
}

// ===== DATABASE FUNCTIONS =====
async function loadUserData() {
    if (!currentUser) return;
    
    const { database } = window.firebaseServices;
    
    try {
        const userRef = database.ref(`users/${currentUser.uid}`);
        
        // Listen for real-time updates
        userRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                userData = snapshot.val();
                updateProfileUI();
            }
        });
        
    } catch (error) {
        console.error('Error loading user data:', error);
        showError('Gagal memuat data pengguna');
    }
}

async function saveProfile() {
    if (!currentUser || !userData) return;
    
    const { database } = window.firebaseServices;
    
    try {
        setButtonLoading(true, 'Menyimpan...', elements.saveProfileBtn);
        
        // Get updated data
        const updatedData = {
            name: elements.editName.value.trim() || userData.name,
            address: elements.editAddress.value.trim() || userData.address,
            gender: document.querySelector('input[name="gender"]:checked')?.value || userData.gender || '',
            status: elements.editStatus.value || userData.status || 'Aktif',
            updatedAt: new Date().toISOString()
        };
        
        // Update database
        const userRef = database.ref(`users/${currentUser.uid}`);
        await userRef.update(updatedData);
        
        // Update local data
        userData = { ...userData, ...updatedData };
        
        // Close modal
        closeEditModal();
        
        // Show success message
        showSuccess('Profil berhasil diperbarui!');
        
    } catch (error) {
        console.error('Error saving profile:', error);
        showError('Gagal menyimpan perubahan');
    } finally {
        setButtonLoading(false, 'Simpan Perubahan', elements.saveProfileBtn);
    }
}

// ===== UI FUNCTIONS =====
function showOTPInput() {
    elements.otpSection.classList.remove('hidden');
    elements.resendSection.classList.remove('hidden');
    elements.submitBtn.querySelector('.btn-text').textContent = 'Verifikasi OTP';
    
    // Focus first OTP input
    setTimeout(() => {
        if (elements.otpInputs[0]) {
            elements.otpInputs[0].focus();
        }
    }, 100);
}

function showDashboard() {
    elements.loginCard.classList.add('hidden');
    elements.dashboard.classList.remove('hidden');
    
    // Load user data if not loaded
    if (currentUser && !userData) {
        loadUserData();
    }
}

function showLogin() {
    elements.dashboard.classList.add('hidden');
    elements.loginCard.classList.remove('hidden');
    elements.otpSection.classList.add('hidden');
    elements.resendSection.classList.add('hidden');
    
    resetOTPState();
}

function switchTab(tabId) {
    // Update active tab
    elements.tabs.forEach(tab => {
        const isActive = tab.dataset.tab === tabId;
        tab.classList.toggle('active', isActive);
    });
    
    // Show active tab content
    elements.profileTab.classList.toggle('active', tabId === 'profile');
    elements.settingsTab.classList.toggle('active', tabId === 'settings');
    elements.historyTab.classList.toggle('active', tabId === 'history');
    
    // Load data for active tab
    switch(tabId) {
        case 'profile':
            updateProfileUI();
            break;
        case 'history':
            loadHistory();
            break;
    }
}

function updateProfileUI() {
    if (!userData) return;
    
    try {
        // Update avatar
        const initial = userData.name ? userData.name.charAt(0).toUpperCase() : 'J';
        elements.avatarInitial.textContent = initial;
        elements.avatarInitial.style.background = generateAvatarColor(initial);
        
        // Update header info
        elements.userName.textContent = userData.name || 'Pengguna JeGo';
        elements.userPhone.textContent = userData.phone || '';
        elements.userPerjalanan.textContent = userData.perjalanan || 0;
        elements.userRating.textContent = userData.rating?.toFixed(1) || '5.0';
        
        // Update detailed info
        elements.infoName.textContent = userData.name || 'Pengguna JeGo';
        elements.infoAddress.textContent = userData.address || 'Belum diisi';
        elements.infoGender.textContent = userData.gender || 'Belum diisi';
        
        // Update status
        const status = userData.status || 'Aktif';
        elements.infoStatus.textContent = status;
        elements.infoStatus.className = 'badge ' + (status === 'Aktif' ? 'badge-active' : 'badge-inactive');
        
        // Update created date
        if (userData.createdAt) {
            const date = new Date(userData.createdAt);
            elements.infoCreatedAt.textContent = formatDate(date);
        }
        
        // Fill edit modal
        elements.editName.value = userData.name || '';
        elements.editAddress.value = userData.address || '';
        elements.editStatus.value = status;
        
        // Set gender radio
        if (userData.gender) {
            const genderRadio = document.querySelector(`input[name="gender"][value="${userData.gender}"]`);
            if (genderRadio) genderRadio.checked = true;
        }
        
    } catch (error) {
        console.error('Error updating profile UI:', error);
    }
}

function openEditModal() {
    elements.editModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeEditModal() {
    elements.editModal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// ===== UTILITY FUNCTIONS =====
function validatePhoneNumber() {
    const phone = elements.phoneNumber.value.trim();
    const phoneRegex = /^(?:\+62|62|0)8[1-9][0-9]{6,9}$/;
    
    if (!phone) {
        showError('Nomor telepon harus diisi');
        return false;
    }
    
    if (!phoneRegex.test(phone)) {
        showError('Format nomor telepon tidak valid. Contoh: 081234567890');
        return false;
    }
    
    hideError();
    return true;
}

function formatPhoneNumber(phone) {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Convert to international format
    if (digits.startsWith('0')) {
        return '+62' + digits.substring(1);
    } else if (digits.startsWith('62')) {
        return '+' + digits;
    } else if (!digits.startsWith('+')) {
        return '+62' + digits;
    }
    
    return phone;
}

function getOTPCode() {
    return Array.from(elements.otpInputs)
        .map(input => input.value)
        .join('');
}

function clearOTPInputs() {
    elements.otpInputs.forEach(input => input.value = '');
}

function resetOTPState() {
    confirmationResult = null;
    elements.submitBtn.querySelector('.btn-text').textContent = 'Dapatkan Kode OTP';
    clearOTPInputs();
    
    if (resendTimer) {
        clearInterval(resendTimer);
        elements.timerDisplay.textContent = '(60)';
        timerSeconds = 60;
    }
}

function handleOTPInput(e) {
    const input = e.target;
    const value = input.value;
    
    // Only allow numbers
    if (!/^\d*$/.test(value)) {
        input.value = value.replace(/\D/g, '');
        return;
    }
    
    // Move to next input if value is entered
    if (value.length === 1) {
        const nextIndex = parseInt(input.dataset.index) + 1;
        const nextInput = document.querySelector(`.otp-input[data-index="${nextIndex}"]`);
        if (nextInput) nextInput.focus();
    }
}

function handleOTPKeydown(e) {
    const input = e.target;
    
    if (e.key === 'Backspace' && input.value === '') {
        const prevIndex = parseInt(input.dataset.index) - 1;
        const prevInput = document.querySelector(`.otp-input[data-index="${prevIndex}"]`);
        if (prevInput) prevInput.focus();
    }
}

function handleOTPPaste(e) {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').slice(0, 6);
    
    if (!/^\d{6}$/.test(pasteData)) {
        showError('Hanya angka yang diperbolehkan untuk OTP');
        return;
    }
    
    // Fill OTP inputs
    pasteData.split('').forEach((digit, index) => {
        if (elements.otpInputs[index]) {
            elements.otpInputs[index].value = digit;
        }
    });
    
    // Focus last input
    if (elements.otpInputs[pasteData.length - 1]) {
        elements.otpInputs[pasteData.length - 1].focus();
    }
}

function handleResendOTP(e) {
    e.preventDefault();
    
    if (timerSeconds > 0) {
        showError(`Tunggu ${timerSeconds} detik sebelum mengirim ulang`);
        return;
    }
    
    const phoneNumber = elements.phoneNumber.value.trim();
    if (phoneNumber) {
        sendOTP(phoneNumber);
    }
}

function startResendTimer() {
    timerSeconds = 60;
    
    if (resendTimer) {
        clearInterval(resendTimer);
    }
    
    resendTimer = setInterval(() => {
        timerSeconds--;
        elements.timerDisplay.textContent = `(${timerSeconds})`;
        
        if (timerSeconds <= 0) {
            clearInterval(resendTimer);
            elements.timerDisplay.textContent = '(Siap)';
        }
    }, 1000);
}

function generateAvatarColor(initial) {
    const colors = [
        'linear-gradient(135deg, #00C853, #64DD17)',
        'linear-gradient(135deg, #2196F3, #03A9F4)',
        'linear-gradient(135deg, #FF9800, #FFB74D)',
        'linear-gradient(135deg, #9C27B0, #E1BEE7)',
        'linear-gradient(135deg, #607D8B, #90A4AE)'
    ];
    
    const index = initial.charCodeAt(0) % colors.length;
    return colors[index];
}

function formatDate(date) {
    return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    }).format(date);
}

function setButtonLoading(isLoading, text, button = elements.submitBtn) {
    const btnText = button.querySelector('.btn-text');
    const btnIcon = button.querySelector('.btn-icon');
    
    if (isLoading) {
        button.disabled = true;
        button.style.opacity = '0.7';
        btnText.textContent = text;
        if (btnIcon) btnIcon.style.display = 'none';
    } else {
        button.disabled = false;
        button.style.opacity = '1';
        btnText.textContent = text;
        if (btnIcon) btnIcon.style.display = 'inline';
    }
}

// ===== ERROR HANDLING =====
function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.style.display = 'block';
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        hideError();
    }, 5000);
}

function hideError() {
    elements.errorMessage.style.display = 'none';
}

function getFirebaseErrorMessage(error) {
    const errorMessages = {
        'auth/invalid-phone-number': 'Nomor telepon tidak valid',
        'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti',
        'auth/code-expired': 'Kode OTP telah kadaluarsa',
        'auth/invalid-verification-code': 'Kode OTP salah',
        'auth/captcha-check-failed': 'Verifikasi keamanan gagal',
        'auth/network-request-failed': 'Koneksi internet bermasalah',
        'auth/user-disabled': 'Akun ini telah dinonaktifkan'
    };
    
    return errorMessages[error.code] || error.message || 'Terjadi kesalahan. Coba lagi.';
}

// ===== SUCCESS NOTIFICATION =====
function showSuccess(message) {
    const template = document.getElementById('successTemplate');
    const clone = template.content.cloneNode(true);
    const notification = clone.querySelector('.success-notification');
    const messageEl = clone.querySelector('.success-message');
    
    messageEl.textContent = message;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideUp 0.3s ease-out reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }, 3000);
}

// ===== SETTINGS FUNCTIONS =====
function loadSettings() {
    // Load notification setting
    const notifEnabled = localStorage.getItem('jeGo_notifications') !== 'false';
    if (elements.notifToggle) {
        elements.notifToggle.checked = notifEnabled;
    }
    
    // Load dark mode setting
    const darkMode = localStorage.getItem('jeGo_darkMode') === 'true';
    if (elements.darkModeToggle) {
        elements.darkModeToggle.checked = darkMode;
    }
    
    // Load language setting
    const language = localStorage.getItem('jeGo_language') || 'id';
    if (elements.languageSelect) {
        elements.languageSelect.value = language;
    }
}

function handleSettingChange(e) {
    const target = e.target;
    
    switch(target.id) {
        case 'notifToggle':
            localStorage.setItem('jeGo_notifications', target.checked);
            showSuccess(`Notifikasi ${target.checked ? 'diaktifkan' : 'dinonaktifkan'}`);
            break;
            
        case 'darkModeToggle':
            localStorage.setItem('jeGo_darkMode', target.checked);
            updateDarkMode();
            showSuccess(`Mode gelap ${target.checked ? 'diaktifkan' : 'dinonaktifkan'}`);
            break;
            
        case 'languageSelect':
            localStorage.setItem('jeGo_language', target.value);
            showSuccess('Bahasa diubah');
            // In a real app, you would reload the language here
            break;
    }
}

function updateDarkMode() {
    const darkMode = localStorage.getItem('jeGo_darkMode') === 'true';
    
    if (darkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

// ===== HISTORY FUNCTIONS =====
function loadHistory() {
    // This is a placeholder - in a real app, you would fetch this from Firebase
    elements.emptyHistory.style.display = 'block';
    elements.historyList.innerHTML = '';
}

// ===== ADDITIONAL CSS FOR DARK MODE =====
const darkModeCSS = `
    [data-theme="dark"] {
        color-scheme: dark;
    }
    
    [data-theme="dark"] body {
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    }
`;

// Add dark mode CSS to head
const style = document.createElement('style');
style.textContent = darkModeCSS;
document.head.appendChild(style);

// ===== INITIALIZE ON LOAD =====
// Add a small delay to ensure DOM is fully loaded
setTimeout(() => {
    if (!window.firebaseServices) {
        console.error('Firebase services not initialized');
        showError('Aplikasi tidak dapat diinisialisasi. Refresh halaman.');
    }
}, 1000);
