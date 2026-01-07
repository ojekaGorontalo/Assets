import { 
    auth, 
    database, 
    RecaptchaVerifier,
    ref, 
    set, 
    get,
    signInWithPhoneNumber 
} from './firebaseConfig.js';

// Konfigurasi Warna
const COLORS = {
    primary: '#00C853',
    primaryLight: '#64DD17',
    secondary: '#757575',
    danger: '#ff4444',
    lightGray: '#f5f5f5'
};

// State Aplikasi
let appVerifier;
let confirmationResult;
let currentUser = null;

// Inisialisasi reCAPTCHA
function initializeRecaptcha() {
    appVerifier = new RecaptchaVerifier(auth, 'submitBtn', {
        'size': 'invisible',
        'callback': () => {
            console.log('reCAPTCHA terverifikasi');
        }
    });
}

// DOM Elements
const elements = {
    loginCard: document.getElementById('loginCard'),
    dashboard: document.getElementById('dashboard'),
    phoneNumber: document.getElementById('phoneNumber'),
    otpSection: document.getElementById('otpSection'),
    otpInputs: document.querySelectorAll('.otp-input'),
    submitBtn: document.getElementById('submitBtn'),
    resendSection: document.getElementById('resendSection'),
    resendBtn: document.getElementById('resendBtn'),
    errorMessage: document.getElementById('errorMessage'),
    
    // Profile elements
    avatarInitial: document.getElementById('avatarInitial'),
    userName: document.getElementById('userName'),
    userPhone: document.getElementById('userPhone'),
    userPerjalanan: document.getElementById('userPerjalanan'),
    userRating: document.getElementById('userRating'),
    userStatus: document.getElementById('userStatus'),
    
    // Tabs
    tabs: document.querySelectorAll('.tab'),
    profileTab: document.getElementById('profileTab'),
    usersTab: document.getElementById('usersTab'),
    usersList: document.getElementById('usersList'),
    
    // Modal
    editModal: document.getElementById('editModal'),
    editName: document.getElementById('editName'),
    editAddress: document.getElementById('editAddress'),
    editStatus: document.getElementById('editStatus'),
    
    // Buttons
    editProfileBtn: document.getElementById('editProfileBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    saveProfileBtn: document.getElementById('saveProfileBtn'),
    cancelEditBtn: document.getElementById('cancelEditBtn')
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initializeRecaptcha();
    setupEventListeners();
    checkAuthState();
});

// Setup Event Listeners
function setupEventListeners() {
    // OTP Input handling
    elements.otpInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            if (e.target.value.length === 1) {
                const nextIndex = parseInt(e.target.dataset.index) + 1;
                const nextInput = document.querySelector(`.otp-input[data-index="${nextIndex}"]`);
                if (nextInput) nextInput.focus();
            }
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && e.target.value === '') {
                const prevIndex = parseInt(e.target.dataset.index) - 1;
                const prevInput = document.querySelector(`.otp-input[data-index="${prevIndex}"]`);
                if (prevInput) prevInput.focus();
            }
        });
    });

    // Submit Button
    elements.submitBtn.addEventListener('click', handleSubmit);

    // Resend OTP
    elements.resendBtn.addEventListener('click', (e) => {
        e.preventDefault();
        sendOTP();
    });

    // Tabs
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            switchTab(tabId);
        });
    });

    // Edit Profile
    elements.editProfileBtn.addEventListener('click', openEditModal);
    elements.logoutBtn.addEventListener('click', handleLogout);
    elements.saveProfileBtn.addEventListener('click', saveProfile);
    elements.cancelEditBtn.addEventListener('click', closeEditModal);
}

// Auth State Observer
function checkAuthState() {
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            loadUserData(user.uid);
            showDashboard();
        } else {
            showLogin();
        }
    });
}

// Send OTP
async function sendOTP() {
    const phoneNumber = elements.phoneNumber.value;
    
    if (!phoneNumber || !phoneNumber.startsWith('+62')) {
        showError('Masukkan nomor telepon Indonesia yang valid (contoh: +628123456789)');
        return;
    }

    try {
        elements.submitBtn.disabled = true;
        elements.submitBtn.textContent = 'Mengirim OTP...';

        confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
        
        showOTPInput();
        showSuccess('OTP telah dikirim via SMS!');
    } catch (error) {
        showError(`Gagal mengirim OTP: ${error.message}`);
    } finally {
        elements.submitBtn.disabled = false;
        elements.submitBtn.textContent = 'Verifikasi OTP';
    }
}

// Handle Submit
async function handleSubmit() {
    if (!confirmationResult) {
        await sendOTP();
        return;
    }

    // Verify OTP
    const otp = Array.from(elements.otpInputs)
        .map(input => input.value)
        .join('');

    if (otp.length !== 6) {
        showError('Masukkan 6 digit kode OTP');
        return;
    }

    try {
        elements.submitBtn.disabled = true;
        elements.submitBtn.textContent = 'Memverifikasi...';

        const result = await confirmationResult.confirm(otp);
        await handleSuccessfulLogin(result.user);
    } catch (error) {
        showError(`Kode OTP salah: ${error.message}`);
        elements.submitBtn.disabled = false;
        elements.submitBtn.textContent = 'Verifikasi OTP';
    }
}

// Handle Successful Login
async function handleSuccessfulLogin(user) {
    const userRef = ref(database, `users/${user.uid}`);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
        // User baru, buat data default
        const userData = {
            phone: elements.phoneNumber.value,
            address: '',
            firebase_key: user.uid,
            profilUrl: '',
            gender: '',
            name: 'Pengguna JeGo',
            perjalanan: 0,
            rating: 5,
            status: 'Aktif',
            createdAt: new Date().toISOString()
        };

        await set(userRef, userData);
        showSuccess('Akun berhasil dibuat!');
    }

    currentUser = user;
    loadUserData(user.uid);
    showDashboard();
}

// Load User Data
async function loadUserData(uid) {
    try {
        const userRef = ref(database, `users/${uid}`);
        const snapshot = await get(userRef);
        
        if (snapshot.exists()) {
            const userData = snapshot.val();
            updateProfileUI(userData);
            
            // Load users list if on users tab
            if (elements.usersTab.classList.contains('active')) {
                loadUsersList();
            }
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Load Users List
async function loadUsersList() {
    try {
        elements.usersList.innerHTML = '<div class="loading">Memuat data pengguna...</div>';
        
        // Note: In production, implement proper pagination and security rules
        // For demo, we'll show only current user's data due to security rules
        if (currentUser) {
            const userRef = ref(database, `users/${currentUser.uid}`);
            const snapshot = await get(userRef);
            
            if (snapshot.exists()) {
                const userData = snapshot.val();
                elements.usersList.innerHTML = createUserCard(userData, currentUser.uid);
            }
        }
    } catch (error) {
        console.error('Error loading users:', error);
        elements.usersList.innerHTML = '<p style="color: #666; text-align: center;">Tidak dapat memuat data pengguna</p>';
    }
}

// Create User Card HTML
function createUserCard(userData, uid) {
    const initials = userData.name ? userData.name.charAt(0).toUpperCase() : 'J';
    const statusClass = userData.status === 'Aktif' ? 'badge-active' : 'badge-inactive';
    
    return `
        <div class="user-card">
            <div class="user-info">
                <div class="avatar" style="background: ${getRandomColor()}">${initials}</div>
                <div class="user-details">
                    <h3>${userData.name || 'Pengguna JeGo'}</h3>
                    <p>${userData.phone || ''}</p>
                    <p>${userData.gender || ''} • ${userData.address || 'Alamat belum diisi'}</p>
                    <p>Perjalanan: <span class="perjalanan">${userData.perjalanan || 0}</span></p>
                    <p>Rating: <span class="rating">${userData.rating || 5}</span> ⭐</p>
                    <span class="badge ${statusClass}">${userData.status || 'Aktif'}</span>
                </div>
            </div>
        </div>
    `;
}

// Update Profile UI
function updateProfileUI(userData) {
    // Set avatar initial
    const initial = userData.name ? userData.name.charAt(0).toUpperCase() : 'J';
    elements.avatarInitial.textContent = initial;
    elements.avatarInitial.style.background = getRandomColor();
    
    // Update text content
    elements.userName.textContent = userData.name || 'Pengguna JeGo';
    elements.userPhone.textContent = userData.phone || '';
    elements.userPerjalanan.textContent = userData.perjalanan || 0;
    elements.userRating.textContent = userData.rating || 5;
    elements.userStatus.textContent = userData.status || 'Aktif';
    
    // Update status badge class
    elements.userStatus.className = 'badge ' + 
        (userData.status === 'Aktif' ? 'badge-active' : 'badge-inactive');
    
    // Fill edit form
    elements.editName.value = userData.name || '';
    elements.editAddress.value = userData.address || '';
    elements.editStatus.value = userData.status || 'Aktif';
    
    // Set gender radio
    const genderRadio = document.querySelector(`input[name="gender"][value="${userData.gender || ''}"]`);
    if (genderRadio) genderRadio.checked = true;
}

// Save Profile
async function saveProfile() {
    if (!currentUser) return;

    const userData = {
        name: elements.editName.value,
        address: elements.editAddress.value,
        gender: document.querySelector('input[name="gender"]:checked')?.value || '',
        status: elements.editStatus.value,
        updatedAt: new Date().toISOString()
    };

    try {
        elements.saveProfileBtn.disabled = true;
        elements.saveProfileBtn.textContent = 'Menyimpan...';

        const userRef = ref(database, `users/${currentUser.uid}`);
        await set(userRef, { ...userData, phone: currentUser.phoneNumber });
        
        await loadUserData(currentUser.uid);
        closeEditModal();
        showSuccess('Profil berhasil diperbarui!');
    } catch (error) {
        showError(`Gagal menyimpan: ${error.message}`);
    } finally {
        elements.saveProfileBtn.disabled = false;
        elements.saveProfileBtn.textContent = 'Simpan Perubahan';
    }
}

// Logout
async function handleLogout() {
    try {
        await auth.signOut();
        showSuccess('Berhasil keluar');
    } catch (error) {
        showError(`Gagal keluar: ${error.message}`);
    }
}

// UI Helper Functions
function showOTPInput() {
    elements.otpSection.style.display = 'block';
    elements.resendSection.style.display = 'block';
    elements.submitBtn.textContent = 'Verifikasi OTP';
    elements.otpInputs[0].focus();
}

function showDashboard() {
    elements.loginCard.style.display = 'none';
    elements.dashboard.style.display = 'block';
}

function showLogin() {
    elements.loginCard.style.display = 'block';
    elements.dashboard.style.display = 'none';
    elements.otpSection.style.display = 'none';
    elements.resendSection.style.display = 'none';
    elements.submitBtn.textContent = 'Dapatkan Kode OTP';
    elements.phoneNumber.value = '';
    elements.otpInputs.forEach(input => input.value = '');
    confirmationResult = null;
    currentUser = null;
}

function switchTab(tabId) {
    // Update active tab
    elements.tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabId);
    });
    
    // Show active tab content
    elements.profileTab.classList.toggle('active', tabId === 'profile');
    elements.usersTab.classList.toggle('active', tabId === 'users');
    
    // Load data if users tab
    if (tabId === 'users') {
        loadUsersList();
    }
}

function openEditModal() {
    elements.editModal.style.display = 'flex';
}

function closeEditModal() {
    elements.editModal.style.display = 'none';
}

function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.style.display = 'block';
    setTimeout(() => {
        elements.errorMessage.style.display = 'none';
    }, 5000);
}

function showSuccess(message) {
    // Create temporary success message
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${COLORS.primary};
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        z-index: 10000;
        box-shadow: 0 4px 15px rgba(0, 200, 83, 0.3);
    `;
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        document.body.removeChild(successDiv);
    }, 3000);
}

// Utility Functions
function getRandomColor() {
    const colors = [
        'linear-gradient(135deg, #00C853, #64DD17)',
        'linear-gradient(135deg, #2196F3, #03A9F4)',
        'linear-gradient(135deg, #FF9800, #FFB74D)',
        'linear-gradient(135deg, #9C27B0, #E1BEE7)',
        'linear-gradient(135deg, #607D8B, #90A4AE)'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Initialize
window.addEventListener('load', () => {
    console.log('JeGo Application Loaded');
});
