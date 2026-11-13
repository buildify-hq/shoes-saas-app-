const SUPABASE_URL = 'https://naehmnkvjsxrhzgvpmpj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hZWhtbmt2anN4cmh6Z3ZwbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0OTkyOTYsImV4cCI6MjA4MDA3NTI5Nn0.rDagdxfbZ1rQK1YnFdxJxhFOZ-KPRLl8UrwIFe8QKaE'; 

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentShopId = null;
let isStaffMode = false;
let currentShopName = '';
let currentShopDetails = { name: '', address: '', phone: '', logo: '' }; 

let foundSaleArticle = null;
let foundReturnArticle = null;
let foundPurchaseArticle = null;
let cart = [];

let currentGenderFilter = 'Men';
let currentTypeFilter = 'Formal';
let currentAdminTab = 'shops';

let confirmCallback = null; 
let currentBillData = null;

const ADMIN_EMAIL = 'admin14@shoeshop.com'; 
const SECRET_ADMIN_ID = 'sagar_admin';      

let html5QrcodeScanner = null;

// ---------- Dynamic Script Loader ----------
function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}

// ---------- Helpers ----------
function esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function localDateStr(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function dayRange(dateStr) {
    const start = new Date(dateStr + 'T00:00:00');
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return [start.toISOString(), end.toISOString()];
}
function updateStockTotals(articles) {
    let g = 0, l = 0, k = 0;
    (articles || []).forEach(art => {
        let t = 0;
        (art.stock_batches || []).forEach(b => { t += b.remaining_qty; });
        let cat = art.category || '';
        if (['Formal', 'Sport', 'Sandal', 'Chappal', 'Slippers'].includes(cat)) cat = 'Men';
        if (cat === 'LadiesSandal') cat = 'Ladies';
        if (cat === 'Kids') cat = 'Boys';
        if (cat.includes('Ladies')) l += t;
        else if (cat.includes('Boys') || cat.includes('Girls')) k += t;
        else g += t;
    });
    document.getElementById('gentsStockDisplay').innerText = g + ' P';
    document.getElementById('ladiesStockDisplay').innerText = l + ' P';
    document.getElementById('kidsStockDisplay').innerText = k + ' P';
    document.getElementById('totalAllStockDisplay').innerText = (g + l + k) + ' Pairs';
}
function initStockTab() {
    const box = document.getElementById('typeFilterContainer');
    if (box && box.children.length === 0) {
        const activeBtn = document.querySelector('#genderFilterContainer .filter-btn.active');
        setStockFilter(currentGenderFilter, activeBtn);
    } else { loadMyStockList(); }
}

function cleanOldData() {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    let held = getHeld();
    let cleanHeld = held.filter(bill => bill.t > thirtyDaysAgo);
    if (held.length !== cleanHeld.length) {
        setHeld(cleanHeld);
        console.log("जुनं होल्ड बिल्स ऑटोमॅटिक डिलीट झालं.");
    }
}

window.onload = () => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('themeIcon').innerHTML = savedTheme === 'dark' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    updateArticleTypes();
    cleanOldData(); 
    checkSession();
};

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sideMenuOverlay');
    if(sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        overlay.style.display = 'none';
    } else {
        sidebar.classList.add('open');
        overlay.style.display = 'block';
    }
}

function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    
    document.getElementById('themeIcon').innerHTML = newTheme === 'dark' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    localStorage.setItem('theme', newTheme);
}

function showToast(msg, isError = false) {
    const toast = document.getElementById("toast");
    toast.innerText = msg;
    toast.style.backgroundColor = isError ? "rgba(239, 68, 68, 0.95)" : "rgba(16, 185, 129, 0.95)";
    toast.style.color = "white";
    toast.className = "show";
    setTimeout(function(){ toast.className = toast.className.replace("show", ""); }, 3000);
}

function askConfirm(msg, callback) {
    document.getElementById('confirmMsgText').innerText = msg;
    document.getElementById('customConfirmModal').style.display = 'flex';
    confirmCallback = callback;
}
function closeConfirm() {
    document.getElementById('customConfirmModal').style.display = 'none';
    confirmCallback = null;
}
document.getElementById('confirmYesBtn').onclick = () => {
    if(confirmCallback) confirmCallback();
    closeConfirm();
};

// ---------- Barcode Scanner & Voice Search ----------
let scannerCams = [], scannerCamIdx = 0, scannerTarget = null, scannerBusy = false;
let isTorchOn = false; 

// 🌟 Voice Search (बोलून शोधणे)
function startVoiceSearch(targetInputId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('तुमच्या फोनवर Voice Search सपोर्ट करत नाही.', true); 
        return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; 
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    showToast('🎤 बोला... (Listening)', false);
    recognition.start();
    
    recognition.onresult = function(event) {
        const speechResult = event.results[0][0].transcript;
        document.getElementById(targetInputId).value = speechResult;
        
        if(targetInputId === 'saleArtNo') searchSaleArticle();
        else if(targetInputId === 'dashSearchArt') searchDashboardArticle();
        else if(targetInputId === 'stockSearch') searchStockArticle();
        
        showToast('Searching: ' + speechResult, false);
    };
    
    recognition.onerror = function(event) { 
        showToast('आवाज ऐकू आला नाही, पुन्हा प्रयत्न करा.', true); 
    };
}

async function onScanSuccess(text) {
    const target = scannerTarget;
    closeScanner();
    if (!target) return;
    const code = String(text).trim();
    document.getElementById(target).value = code;
    if (target === 'artNo') { showToast('Barcode saved as Article No.'); return; }

    const { data, error } = await supabaseClient.from('articles').select('id').eq('shop_id', currentShopId).eq('article_no', code).maybeSingle();
    if (error) { showToast('Error: ' + error.message, true); return; }
    if (!data) {
        if (target === 'retArtNo' || isStaffMode) { showToast(`Article "${code}" not found`, true); return; }
        askConfirm(`Barcode "${code}" is not in your stock. Add it as a new article?`, () => {
            switchTab('article');
            document.getElementById('artNo').value = code;
            const nameEl = document.getElementById('artName'); if (nameEl) nameEl.focus();
            showToast('Article No. filled. Enter name, price and stock.');
        });
        return;
    }
    if (target === 'saleArtNo') searchSaleArticle();
    else if (target === 'dashSearchArt') searchDashboardArticle();
    else if (target === 'purArtNo') searchPurchaseArticle();
    else if (target === 'retArtNo') searchReturnArticle();
    showToast("Barcode Scanned!");
}

async function beginScan(cameraConfig) {
    html5QrcodeScanner = new Html5Qrcode('reader', { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
    const qrbox = (w, hgt) => {
        return { width: Math.floor(w * 0.8), height: Math.floor(hgt * 0.3) }; 
    };
    await html5QrcodeScanner.start(cameraConfig, { fps: 30, qrbox: qrbox }, onScanSuccess, () => {});
    setTimeout(checkTorchSupport, 1000);
}

async function toggleTorch() {
    const video = document.querySelector('#reader video');
    if (video && video.srcObject) {
        const track = video.srcObject.getVideoTracks()[0];
        try {
            isTorchOn = !isTorchOn;
            await track.applyConstraints({ advanced: [{ torch: isTorchOn }] });
        } catch (e) {
            showToast('Flashlight चालू होत नाहीये', true);
        }
    }
}

function checkTorchSupport() {
    const video = document.querySelector('#reader video');
    if (video && video.srcObject) {
        const track = video.srcObject.getVideoTracks()[0];
        if (track) {
            const capabilities = track.getCapabilities();
            if (capabilities.torch) {
                document.getElementById('torchBtn').style.display = 'flex'; 
            } else {
                document.getElementById('torchBtn').style.display = 'none'; 
            }
        }
    }
}

async function stopScannerInstance() {
    if (!html5QrcodeScanner) return;
    const sc = html5QrcodeScanner; html5QrcodeScanner = null;
    try { if (sc.isScanning) await sc.stop(); sc.clear(); } catch (e) {}
}

async function startScanner(targetInputId) {
    if (scannerBusy) return;
    scannerBusy = true; scannerTarget = targetInputId;
    document.getElementById('scannerModal').style.display = 'flex';
    try {
        await stopScannerInstance();
        try { await beginScan({ facingMode: 'environment' }); } catch (e) {
            const cams = await Html5Qrcode.getCameras(); if (!cams.length) throw e;
            scannerCams = cams; const idx = cams.findIndex(c => /back|rear|environment/i.test(c.label));
            scannerCamIdx = idx >= 0 ? idx : cams.length - 1;
            await beginScan(cams[scannerCamIdx].id); return;
        }
        try {
            scannerCams = await Html5Qrcode.getCameras();
            const did = html5QrcodeScanner.getRunningTrackSettings().deviceId;
            const k = scannerCams.findIndex(c => c.id === did); scannerCamIdx = k >= 0 ? k : 0;
        } catch (e) {}
    } catch (err) { showToast('Camera error: allow camera permission and try again', true); closeScanner(); } 
    finally { scannerBusy = false; }
}

async function switchScannerCamera() {
    if (scannerBusy) return;
    scannerBusy = true;
    try {
        if (scannerCams.length < 2) scannerCams = await Html5Qrcode.getCameras();
        if (scannerCams.length < 2) { showToast('Only one camera found', true); return; }
        scannerCamIdx = (scannerCamIdx + 1) % scannerCams.length;
        await stopScannerInstance(); await beginScan(scannerCams[scannerCamIdx].id);
    } catch (e) { showToast('Could not switch camera', true); } 
    finally { scannerBusy = false; }
}

function closeScanner() {
    document.getElementById('scannerModal').style.display = 'none';
    stopScannerInstance();
    isTorchOn = false;
    document.getElementById('torchBtn').style.display = 'none';
}

// ---------- Settings & Login ----------
async function handleLogin() {
    const nameInput = document.getElementById('loginShopName').value.trim();
    const pinInput = document.getElementById('loginPin').value.trim();
    if(!nameInput || !pinInput) { showToast("Please enter Shop Name and PIN", true); return; }
    
    if (nameInput === SECRET_ADMIN_ID) {
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({ email: ADMIN_EMAIL, password: pinInput });
        if (authError) { showToast("Auth Error: " + authError.message, true); } 
        else { 
            currentUser = authData.user; 
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('topHeader').style.display = 'none'; 
            document.getElementById('superAdminScreen').style.display = 'block';
            document.getElementById('bottomNav').style.display = 'none';
            loadSuperAdminData();
        }
        return;
    }

    const { data: shop, error } = await supabaseClient.from('shops').select('*').ilike('shop_name', nameInput.replace(/[\\%_]/g, '\\$&')).maybeSingle();
    if (error || !shop) { showToast("Shop not found! Check the name.", true); return; }
    if (shop.status !== 'active') { showToast("Shop is inactive. Contact Admin.", true); return; }
    if (!shop.expiry_date || new Date() > new Date(shop.expiry_date)) { showToast("Subscription expired! Contact Admin.", true); return; }

    const strPinInput = String(pinInput);
    const strOwnerPin = String(shop.pin);
    const strStaffPin = shop.staff_pin ? String(shop.staff_pin) : null;

    if (strPinInput === strOwnerPin) { isStaffMode = false; localStorage.setItem('isStaff', 'false'); } 
    else if (strStaffPin && strPinInput === strStaffPin) { isStaffMode = true; localStorage.setItem('isStaff', 'true'); } 
    else { showToast("Invalid PIN! Please check your PIN.", true); return; }

    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({ email: shop.auth_email, password: shop.pin, options: { emailRedirectTo: window.location.origin } });

    if (authError) { showToast("Login failed: " + authError.message, true); } 
    else { 
        currentUser = authData.user; 
        currentShopId = shop.id; 
        currentShopName = shop.shop_name; 
        currentShopDetails = { name: shop.shop_name, phone: shop.phone, address: shop.address, logo: shop.logo_url };
        document.getElementById('headerShopName').innerText = currentShopName; 
        showOwnerDashboard(); 
    }
}

async function loadShopSettings() {
    const { data } = await supabaseClient.from('shops').select('shop_name, phone, address, logo_url').eq('id', currentShopId).single();
    if(data) {
        document.getElementById('setShopName').value = data.shop_name || '';
        document.getElementById('setShopPhone').value = data.phone || '';
        document.getElementById('setShopAddress').value = data.address || '';
        document.getElementById('setShopLogo').value = data.logo_url || '';
    }
}

async function saveShopSettings() {
    const name = document.getElementById('setShopName').value.trim();
    const phone = document.getElementById('setShopPhone').value.trim();
    const address = document.getElementById('setShopAddress').value.trim();
    const logo = document.getElementById('setShopLogo').value.trim();
    
    if(!name) { showToast("Shop Name आवश्यक आहे!", true); return; }

    showToast("Saving...", false);
    const { error } = await supabaseClient.from('shops').update({ 
        shop_name: name, phone: phone, address: address, logo_url: logo 
    }).eq('id', currentShopId);

    if(error) { showToast("Error: " + error.message, true); return; }
    
    currentShopDetails = { name, phone, address, logo };
    currentShopName = name;
    document.getElementById('headerShopName').innerText = name;
    showToast("Shop Settings Updated! ✅", false);
    switchTab('dashboard');
}

// ---------- Main Navigation ----------
function showOwnerDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topHeader').style.display = 'flex'; 
    document.getElementById('bottomNav').style.display = 'flex';
    document.getElementById('menuBtn').style.display = isStaffMode ? 'none' : 'flex';
    
    const menuItems = document.querySelectorAll('.sidebar .menu-item');
    if(isStaffMode) {
        document.getElementById('nav-dash').style.display = 'none';
        let navMore = document.getElementById('nav-more');
        navMore.setAttribute('onclick', 'handleLogout()');
        navMore.innerHTML = '<i class="fa-solid fa-arrow-right-from-bracket nav-icon"></i> Logout';
        navMore.style.display = 'none';
        
        menuItems.forEach(item => {
            const text = item.innerText || '';
            if (text.includes('History') || text.includes('Logout')) { item.style.display = 'flex'; } else { item.style.display = 'none'; }
        });

        document.getElementById('nav-stock').style.display = 'flex';
        document.getElementById('nav-sale').style.display = 'flex';
        switchTab('sale'); 
    } else {
        document.getElementById('nav-dash').style.display = 'flex';
        let navMore = document.getElementById('nav-more');
        navMore.setAttribute('onclick', 'toggleSidebar()');
        navMore.innerHTML = '<i class="fa-solid fa-bars nav-icon"></i> Menu';
        navMore.style.display = 'none';
        
        menuItems.forEach(item => { item.style.display = 'flex'; });
        document.getElementById('nav-stock').style.display = 'flex';
        document.getElementById('nav-sale').style.display = 'flex';
        switchTab('dashboard');
    }
}

function switchTab(tabName) {
    if(isStaffMode && ['closing', 'dashboard', 'staff', 'reports', 'article', 'purchase', 'lowStockAlert', 'labels', 'staffPin', 'bulkImport', 'shopSettings'].includes(tabName)) {
        showToast("Access Denied! Only Owner can access this.", true); return;
    }
    
    const screens = ['dashboardScreen', 'stockScreen', 'saleScreen', 'articleScreen', 'purchaseScreen', 'returnScreen', 'expenseScreen', 'creditsScreen', 'staffPinScreen', 'staffScreen', 'reportsScreen', 'lowStockAlertScreen', 'historyScreen', 'closingScreen', 'labelsScreen', 'bulkImportScreen', 'shopSettingsScreen'];
    screens.forEach(s => { let el = document.getElementById(s); if(el) el.style.display = 'none'; });
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    if(tabName === 'dashboard') { document.getElementById('dashboardScreen').style.display = 'block'; document.getElementById('nav-dash').classList.add('active'); loadDashboardData(); } 
    else if(tabName === 'stock') { document.getElementById('stockScreen').style.display = 'block'; document.getElementById('nav-stock').classList.add('active'); initStockTab(); } 
    else if(tabName === 'sale') { document.getElementById('saleScreen').style.display = 'block'; document.getElementById('nav-sale').classList.add('active'); document.getElementById('saleArticleDetails').style.display = 'none'; document.getElementById('staffReturnBtn').style.display = isStaffMode ? 'flex' : 'none'; updateHeldCount(); } 
    else if(tabName === 'staff') { document.getElementById('staffScreen').style.display = 'block'; } 
    else if(tabName === 'article') { document.getElementById('articleScreen').style.display = 'block'; updateArticleTypes(); } 
    else if(tabName === 'return') { document.getElementById('returnScreen').style.display = 'block'; document.getElementById('retArticleDetails').style.display = 'none'; } 
    else if(tabName === 'purchase') { document.getElementById('purchaseScreen').style.display = 'block'; document.getElementById('purArticleDetails').style.display = 'none'; }
    else if(tabName === 'expense') { document.getElementById('expenseScreen').style.display = 'block'; }
    else if(tabName === 'credits') { document.getElementById('creditsScreen').style.display = 'block'; loadCredits(); }
    else if(tabName === 'staffPin') { document.getElementById('staffPinScreen').style.display = 'block'; loadStaffPin(); }
    else if(tabName === 'shopSettings') { document.getElementById('shopSettingsScreen').style.display = 'block'; loadShopSettings(); }
    else if(tabName === 'reports') { document.getElementById('reportsScreen').style.display = 'block'; document.getElementById('reportDate').value = localDateStr(new Date()); loadReportData(); }
    else if(tabName === 'history') { document.getElementById('historyScreen').style.display = 'block'; document.getElementById('nav-hist').classList.add('active'); loadHistory(); }
    else if(tabName === 'labels') { document.getElementById('labelsScreen').style.display = 'block'; loadLabels(); }
    else if(tabName === 'closing') { document.getElementById('closingScreen').style.display = 'block'; loadClosing(); }
    else if(tabName === 'lowStockAlert') { document.getElementById('lowStockAlertScreen').style.display = 'block'; loadLowStockAlerts(); }
    else if(tabName === 'bulkImport') { document.getElementById('bulkImportScreen').style.display = 'block'; }
}

// ---------- Dashboard & Animations ----------
function animateValue(id, start, end, duration) {
    if (start === end) { document.getElementById(id).innerText = "₹" + end; return; }
    let range = end - start;
    let current = start;
    let increment = end > start ? 1 : -1;
    let stepTime = Math.abs(Math.floor(duration / range));
    stepTime = Math.max(stepTime, 20); 
    let obj = document.getElementById(id);
    let timer = setInterval(function() {
        current += Math.ceil(range / 30); 
        if ((increment == 1 && current >= end) || (increment == -1 && current <= end)) {
            current = end;
            clearInterval(timer);
        }
        obj.innerText = "₹" + current;
    }, 30);
}

async function loadDashboardData() {
    if(!currentShopId) return;
    
    const hr = new Date().getHours();
    let greet = "Good Evening";
    if(hr < 12) greet = "Good Morning";
    else if(hr < 17) greet = "Good Afternoon";
    document.getElementById('dashGreeting').innerText = greet.toUpperCase();
    document.getElementById('dashUserName').innerText = currentShopName || 'Owner';

    const { data: articles } = await supabaseClient.from('articles').select(`id, article_no, name, category, stock_batches (remaining_qty)`).eq('shop_id', currentShopId);
    let gentsTotal = 0, ladiesTotal = 0, kidsTotal = 0, lowStockItemsCount = 0;

    if(articles) {
        articles.forEach(art => {
            let artTotal = 0;
            if(art.stock_batches) { art.stock_batches.forEach(batch => { artTotal += batch.remaining_qty; }); }
            let cat = art.category;
            if(cat === 'Formal' || cat === 'Sport' || cat === 'Sandal' || cat === 'Chappal' || cat === 'Slippers') cat = 'Men';
            if(cat === 'LadiesSandal') cat = 'Ladies';
            if(cat === 'Kids') cat = 'Boys';
            if(cat.includes('Ladies')) ladiesTotal += artTotal;
            else if(cat.includes('Boys') || cat.includes('Girls')) kidsTotal += artTotal;
            else gentsTotal += artTotal; 
            if(artTotal <= 2) { lowStockItemsCount++; }
        });
    }
    document.getElementById('gentsStockDisplay').innerText = gentsTotal + " P";
    document.getElementById('ladiesStockDisplay').innerText = ladiesTotal + " P";
    document.getElementById('kidsStockDisplay').innerText = kidsTotal + " P";
    document.getElementById('totalAllStockDisplay').innerText = (gentsTotal + ladiesTotal + kidsTotal) + " Pairs";

    let badge = document.getElementById('menuAlertBadge');
    if(lowStockItemsCount > 0) { badge.style.display = 'inline-block'; badge.innerText = lowStockItemsCount; } else { badge.style.display = 'none'; }

    const { data: credits } = await supabaseClient.from('credits').select('amount').eq('shop_id', currentShopId).eq('status', 'pending');
    let totalUdhaar = 0;
    if(credits) { credits.forEach(c => totalUdhaar += c.amount); }
    
    if (totalUdhaar > 0) {
        document.getElementById('dashUdhaarTotal').innerText = totalUdhaar;
        document.getElementById('udhaarAlertCard').style.display = 'block';
    } else {
        document.getElementById('udhaarAlertCard').style.display = 'none';
    }

    const tr = dayRange(localDateStr(new Date()));
    const yd = new Date(); yd.setDate(yd.getDate() - 1);
    const yr = dayRange(localDateStr(yd));
    const [hRes, yRes] = await Promise.all([
        supabaseClient.rpc('get_history', { p_from: tr[0], p_to: tr[1] }),
        supabaseClient.rpc('get_history', { p_from: yr[0], p_to: yr[1] })
    ]);
    const H = hRes.data || {}, Y = yRes.data || {};
    const todaySales = H.sales || [], todayReturns = H.returns || [], todayExpenses = H.expenses || [];

    let tSalesAmt = 0, tProfitAmt = 0, tExpenseAmt = 0, tReturnAmt = 0;
    let transactionsHtml = '';
    const row = (color, icon, text, amt) => `<div class="tx-row" style="color:${color};"><span><i class="fa-solid ${icon}"></i> ${text}</span><span>${amt}</span></div>`;

    todaySales.forEach(s => {
        tSalesAmt += s.total_amount; tProfitAmt += s.total_profit;
        (s.items || []).forEach(i => { transactionsHtml += row('var(--success)', 'fa-bag-shopping', `Sale: [${esc(i.article_no)}] S${esc(i.size)} x${i.qty}`, `+₹${i.qty * i.price}`); });
        if (s.discount_amount > 0) transactionsHtml += row('var(--warning)', 'fa-tag', 'Discount', `-₹${s.discount_amount}`);
    });
    todayReturns.forEach(r => {
        tSalesAmt -= r.refund_amount; tReturnAmt += r.refund_amount;
        tProfitAmt -= (r.refund_amount - (r.cost || 0) * r.quantity);
        transactionsHtml += row('var(--warning)', 'fa-rotate-left', `Return: [${esc(r.article_no || '-')}] S${esc(r.size)} x${r.quantity}`, `-₹${r.refund_amount}`);
    });
    todayExpenses.forEach(e => {
        tProfitAmt -= e.amount; tExpenseAmt += e.amount;
        transactionsHtml += row('var(--danger)', 'fa-money-bill-transfer', esc(e.reason), `-₹${e.amount}`);
    });

    if (transactionsHtml !== '') {
        transactionsHtml = `<div class="day-sum"><span><b>${todaySales.length}</b> bills</span><span><b>₹${tReturnAmt}</b> return</span><span><b>₹${tExpenseAmt}</b> expenses</span></div>` + transactionsHtml;
    }
    
    let ySales = 0;
    (Y.sales || []).forEach(s => ySales += s.total_amount); (Y.returns || []).forEach(r => ySales -= r.refund_amount);
    const cmp = document.getElementById('salesCompare');
    if (cmp) {
        if (ySales > 0) { const p = Math.round(((tSalesAmt - ySales) / ySales) * 100); cmp.innerHTML = `${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}% vs yesterday`; }
        else cmp.innerHTML = 'Yesterday: ₹0';
    }

    const transDiv = document.getElementById('todayTransactions');
    if(transactionsHtml === '') { transDiv.innerHTML = '<p style="font-size: 13px; color: var(--text-muted); text-align: center;">No transactions today.</p>'; } 
    else {
        let netCash = tSalesAmt - tExpenseAmt; 
        let isPositive = netCash >= 0;
        transactionsHtml += `<div class="net-cash-flow-box"><div class="title"><i class="fa-solid fa-wallet" style="color: var(--primary);"></i> Net Cash:</div><div class="amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}₹${netCash}</div></div>`;
        transDiv.innerHTML = transactionsHtml;
    }

    animateValue('todaySalesDisplay', 0, tSalesAmt, 1000);
    animateValue('todayProfitDisplay', 0, tProfitAmt, 1000);
}

async function searchDashboardArticle() {
    const artNo = document.getElementById('dashSearchArt').value.trim();
    const resultDiv = document.getElementById('dashSearchResult');
    if(!artNo) { resultDiv.innerHTML = ''; return; }
    const { data: articles, error } = await supabaseClient.from('articles').select(`id, article_no, name, category, stock_batches (color, size, remaining_qty)`).eq('shop_id', currentShopId).eq('article_no', artNo).maybeSingle();
    if(error || !articles) { resultDiv.innerHTML = '<p style="color:var(--danger); font-size:14px; text-align:center;">Article not found!</p>'; return; }
    
    let totalPairs = 0; let groupedByColor = {};
    if(articles.stock_batches) {
        articles.stock_batches.forEach(b => {
            totalPairs += b.remaining_qty;
            if(b.remaining_qty > 0) {
                let c = b.color || ''; if(c === 'Default') c = '';
                let s = String(b.size).trim();
                if(!groupedByColor[c]) groupedByColor[c] = {};
                if(!groupedByColor[c][s]) groupedByColor[c][s] = 0;
                groupedByColor[c][s] += b.remaining_qty;
            }
        });
    }
    let colorHtml = '';
    for(let color in groupedByColor) {
        let sizesHtml = '';
        Object.keys(groupedByColor[color]).sort((a,b)=>Number(a)-Number(b)).forEach(size => { 
            sizesHtml += `<span class="size-badge${groupedByColor[color][size] <= 2 ? ' low' : ''}">S${size}: ${groupedByColor[color][size]}</span>`; 
        });
        let colorTitle = (color === '') ? '' : `<span class="color-title"><i class="fa-solid fa-palette"></i> ${esc(color)}</span>`;
        colorHtml += `<div class="color-group-display">${colorTitle}<div>${sizesHtml}</div></div>`;
    }

    resultDiv.innerHTML = `
    <div class="stock-card" style="border-left: 4px solid var(--primary); margin-top:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h4>[${esc(articles.article_no)}] ${esc(articles.name) || 'Unnamed'}</h4>
            <span style="background:var(--primary); padding:6px 10px; border-radius:8px; font-size:13px; font-weight:bold; color:white;">Total: ${totalPairs}</span>
        </div>
        <p style="margin:0 0 12px 0; font-size:13px; color:var(--text-muted); font-weight: 600;">${esc(articles.category)}</p>
        ${colorHtml || '<p style="font-size:13px; color:var(--danger);">Out of Stock</p>'}
    </div>`;
}

// ---------- Sale & Bill ----------
async function searchSaleArticle() {
    const artNo = document.getElementById('saleArtNo').value;
    if(!artNo) return;
    const { data: articles, error } = await supabaseClient.from('articles').select(`id, article_no, name, category, mrp, cost_price, stock_batches (color, size, remaining_qty)`).eq('shop_id', currentShopId).eq('article_no', artNo).single();
    if (error || !articles) { showToast("Article not found!", true); document.getElementById('saleArticleDetails').style.display = 'none'; return; }

    foundSaleArticle = articles;
    document.getElementById('saleArtName').innerText = `[${articles.article_no}] ${articles.name}`;
    const sizeSelect = document.getElementById('saleSize'); sizeSelect.innerHTML = '';
    let aggregatedStock = {};
    articles.stock_batches.forEach(batch => {
        if(batch.remaining_qty > 0) {
            let c = batch.color || ''; if (c === 'Default') c = ''; 
            let s = String(batch.size).trim();
            if(!aggregatedStock[c]) aggregatedStock[c] = {};
            if(!aggregatedStock[c][s]) aggregatedStock[c][s] = 0;
            aggregatedStock[c][s] += batch.remaining_qty;
        }
    });
    let hasStock = false;
    for (let color in aggregatedStock) {
        for (let size in aggregatedStock[color]) {
            let displayColor = (color === '') ? '' : `${color} - `;
            sizeSelect.innerHTML += `<option value="${esc(color)}|||${esc(size)}">${esc(displayColor)}Size ${esc(size)} (Stock: ${aggregatedStock[color][size]})</option>`;
            hasStock = true;
        }
    }
    if(!hasStock) { showToast("Out of stock!", true); document.getElementById('saleChips').innerHTML = ''; return; }
    renderSaleChips(aggregatedStock);
    document.getElementById('salePrice').value = articles.mrp || 0;
    document.getElementById('saleQty').value = 1;
    document.getElementById('saleArticleDetails').style.display = 'block';
}

function renderSaleChips(agg) {
    const wrap = document.getElementById('saleChips'); let html = '';
    for (const color in agg) {
        if (color) html += `<div class="chip-color"><i class="fa-solid fa-palette"></i> ${esc(color)}</div>`;
        html += '<div class="chip-row">';
        Object.keys(agg[color]).sort((a, b) => Number(a) - Number(b)).forEach(size => {
            const q = agg[color][size];
            html += `<button type="button" class="chip${q <= 2 ? ' low' : ''}" data-val="${esc(color)}|||${esc(size)}" onclick="pickSaleChip(this)">S${esc(size)}<small>${q}</small></button>`;
        });
        html += '</div>';
    }
    wrap.innerHTML = html;
    const first = wrap.querySelector('.chip'); if (first) pickSaleChip(first);
}
function pickSaleChip(el) {
    document.querySelectorAll('#saleChips .chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('saleSize').value = el.dataset.val;
}

function addToCart() {
    const colorSizeStr = document.getElementById('saleSize').value;
    if(!colorSizeStr) return;
    const parts = colorSizeStr.split('|||');
    const color = parts[0], size = parts[1];
    const qty = parseInt(document.getElementById('saleQty').value);
    const price = parseInt(document.getElementById('salePrice').value);
    if(qty <= 0) { showToast("Quantity must be at least 1", true); return; }
    if(isNaN(price) || price <= 0) { showToast("Enter a valid selling price", true); return; }
    
    let totalAvailableForSize = foundSaleArticle.stock_batches.filter(b => { 
        let bColor = b.color || ''; if (bColor === 'Default') bColor = ''; 
        return bColor === color && String(b.size).trim() === size; 
    }).reduce((sum, b) => sum + b.remaining_qty, 0);
    
    const inCartQty = cart.filter(c => { 
        let cColor = c.color || ''; if (cColor === 'Default') cColor = ''; 
        return c.id === foundSaleArticle.id && c.size === size && cColor === color; 
    }).reduce((sum, item) => sum + item.qty, 0);
    
    if((inCartQty + qty) > totalAvailableForSize) { showToast("Not enough stock!", true); return; }

    cart.push({ id: foundSaleArticle.id, artNo: foundSaleArticle.article_no, color: color, size: size, qty: qty, price: price, cost: foundSaleArticle.cost_price || 0, name: foundSaleArticle.name });
    renderCart();
    document.getElementById('saleQty').value = 1;
    showToast("Added to bill.", false);
}

function renderCart() {
    const cartDiv = document.getElementById('cartList');
    let subTotal = 0;
    cartDiv.innerHTML = '';
    if(cart.length === 0) { cartDiv.innerHTML = '<p style="font-size: 14px; color: var(--text-muted); text-align: center; padding: 10px;">No items added.</p>'; }
    cart.forEach((item, index) => {
        subTotal += (item.qty * item.price);
        let displayColor = (item.color === '' || item.color === 'Default') ? '' : ` ${item.color} - `;
        cartDiv.innerHTML += `<div class="cart-item"><span style="font-weight: 600;">${esc(item.artNo)} (${esc(displayColor)}S${esc(item.size)}) <br><span style="color: var(--text-muted); font-size: 12px;">Qty: ${item.qty}</span></span><span style="text-align:right; font-weight:800; color:var(--success); font-size: 16px;">₹${item.qty * item.price}</span><b style="color:var(--danger);cursor:pointer; padding-left:15px; font-size: 18px;" onclick="removeFromCart(${index})"><i class="fa-solid fa-circle-xmark"></i></b></div>`;
    });
    let discount = parseInt(document.getElementById('saleDiscount').value) || 0;
    if(discount < 0) discount = 0;
    let finalTotal = subTotal - discount;
    if(finalTotal < 0) finalTotal = 0;
    document.getElementById('cartTotalAmt').innerText = "₹" + finalTotal;
}

function removeFromCart(index) { cart.splice(index, 1); renderCart(); }

function clearCart() {
    cart = [];
    document.getElementById('saleDiscount').value = 0;
    renderCart();
    document.getElementById('saleArticleDetails').style.display = 'none';
    showToast("Bill Cleared!", false);
}

function applyDiscount(percent) {
    if (cart.length === 0) { showToast("आधी बिलात माल टाका!", true); return; }
    let subTotal = 0;
    cart.forEach(item => { subTotal += (item.qty * item.price); });
    let discountAmt = Math.round(subTotal * (percent / 100));
    document.getElementById('saleDiscount').value = discountAmt;
    renderCart();
    showToast(`Discount: ${percent}% applied ✅`, false);
}

async function confirmSale() {
    if(cart.length === 0) { showToast("Cart is empty!", true); return; }
    let subTotal = 0;
    cart.forEach(item => { subTotal += (item.qty * item.price); });
    let discount = parseInt(document.getElementById('saleDiscount').value) || 0;
    if(discount < 0) { showToast("Discount cannot be negative!", true); return; }
    if(discount >= subTotal) { showToast("Discount cannot be greater than Subtotal!", true); return; }
    const btn = document.getElementById('confirmSaleBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    try {
        const items = cart.map(i => ({ article_id: i.id, size: String(i.size), qty: i.qty, price: i.price, cost: i.cost || 0, color: i.color || '' }));
        const { data: res, error } = await supabaseClient.rpc('confirm_sale', { p_discount: discount, p_items: items });
        if (error) throw error;
        
        const billData = { id: res && res.sale_id, items: cart.map(c => ({ ...c })), subTotal, discount, total: subTotal - discount,
            name: document.getElementById('saleCustName').value.trim(), phone: document.getElementById('saleCustPhone').value.trim() };
        cart = [];
        document.getElementById('saleDiscount').value = 0;
        document.getElementById('saleCustName').value = ''; document.getElementById('saleCustPhone').value = '';
        document.getElementById('saleChips').innerHTML = '';
        renderCart();
        showBill(billData);
        
        // 🌟 Text-to-Speech (बोलणारं बिल)
        if ('speechSynthesis' in window) {
            setTimeout(() => {
                const amountToSpeak = billData.total;
                const msg = new SpeechSynthesisUtterance(`Total amount is ${amountToSpeak} rupees. Thank you!`);
                msg.lang = 'en-IN';
                msg.rate = 1; 
                window.speechSynthesis.speak(msg);
            }, 800); 
        }
    } catch (err) { showToast("Error: " + err.message, true); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Confirm Sale'; }
}

// ---------- Bill Share (Tax Invoice) ----------
function showBill(b) {
    currentBillData = b;
    
    document.getElementById('invShopName').innerText = currentShopDetails.name || 'SJ DIGITAL LABS';
    document.getElementById('invShopPhone').innerText = currentShopDetails.phone || 'Your Phone';
    document.getElementById('invShopAddress').innerText = currentShopDetails.address || 'Your Shop Address Here';
    if(currentShopDetails.logo) document.getElementById('invShopLogo').src = currentShopDetails.logo;

    document.getElementById('invCustName').innerText = b.name || 'Walk-in Customer';
    document.getElementById('invCustPhone').innerText = b.phone || '-';
    document.getElementById('invNo').innerText = '#' + (b.id ? String(b.id).replace(/-/g, '').slice(-6).toUpperCase() : 'TEMP');
    document.getElementById('invDate').innerText = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    let itemsHtml = '';
    b.items.forEach(i => {
        itemsHtml += `
        <tr style="border-bottom: 1px dashed #ccc;">
            <td style="padding: 5px;">${i.artNo} (Size: ${i.size})<br><span style="font-size:10px; color:#555;">${i.name || ''}</span></td>
            <td style="text-align: center; padding: 5px;">${i.qty}</td>
            <td style="text-align: right; padding: 5px;">₹${i.price.toFixed(2)}</td>
            <td style="text-align: right; padding: 5px;">₹${(i.qty * i.price).toFixed(2)}</td>
        </tr>`;
    });
    document.getElementById('invItemsList').innerHTML = itemsHtml;
    document.getElementById('invSubTotal').innerText = `₹${b.subTotal.toFixed(2)}`;
    document.getElementById('invDiscount').innerText = `-₹${b.discount.toFixed(2)}`;
    document.getElementById('invNetTotal').innerText = `₹${b.total.toFixed(2)}`;
    document.getElementById('billModal').style.display = 'flex';
}

function printBill() {
    setTimeout(() => { window.print(); }, 300);
}

async function downloadAndShareBill(btn) {
    const captureArea = document.getElementById('invoiceCaptureArea');
    const originalText = btn.innerHTML;
    try {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
        btn.disabled = true;
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        const canvas = await html2canvas(captureArea, { scale: 2, backgroundColor: '#ffffff' });
        canvas.toBlob(async function(blob) {
            const file = new File([blob], 'invoice.png', { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: 'Invoice', text: 'Thank you for your purchase!' });
            } else {
                const link = document.createElement('a');
                link.download = `Invoice_${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                showToast("Image downloaded. Share manually.", false);
            }
            btn.innerHTML = originalText; btn.disabled = false;
        }, 'image/png');
    } catch (error) {
        showToast("Error generating image: " + error.message, true);
        btn.innerHTML = originalText; btn.disabled = false;
    }
}

function closeBill() {
    document.getElementById('billModal').style.display = 'none';
    switchTab(isStaffMode ? 'history' : 'dashboard');
}

// ---------- Return ----------
let retUnit = 0, recentBillItems = [];
function updateRetPrice() {
    const q = parseInt(document.getElementById('retQty').value) || 0;
    document.getElementById('retPrice').value = retUnit * q;
}
async function toggleRecentBills() {
    const box = document.getElementById('recentBills');
    if (box.style.display === 'block') { box.style.display = 'none'; return; }
    box.style.display = 'block'; box.innerHTML = skeleton(2);
    const from = new Date(); from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0);
    const to = new Date(); to.setDate(to.getDate() + 1); to.setHours(0, 0, 0, 0);
    const { data, error } = await supabaseClient.rpc('get_history', { p_from: from.toISOString(), p_to: to.toISOString() });
    if (error) { box.innerHTML = `<div class="hist-empty">Error: ${esc(error.message)}</div>`; return; }
    recentBillItems = [];
    (data.sales || []).forEach(s => (s.items || []).forEach(i => recentBillItems.push({ ...i, date: s.sale_date })));
    if (!recentBillItems.length) { box.innerHTML = emptyState('fa-receipt', 'No bills in the last 7 days'); return; }
    box.innerHTML = recentBillItems.map((i, idx) => `<button type="button" class="bill-pick" onclick="pickReturnItem(${idx})"><span>[${esc(i.article_no)}] ${esc(i.name || '')} • S${esc(i.size)} × ${i.qty}<small>${new Date(i.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} ${fmtTime(i.date)}</small></span><b>₹${i.price}</b></button>`).join('');
}
async function pickReturnItem(idx) {
    const it = recentBillItems[idx]; if (!it) return;
    document.getElementById('retArtNo').value = it.article_no;
    await searchReturnArticle();
    const sel = document.getElementById('retSize');
    for (const o of sel.options) { if (o.value.endsWith('|||' + String(it.size).trim())) { sel.value = o.value; break; } }
    retUnit = it.price; document.getElementById('retQty').value = 1; updateRetPrice();
    document.getElementById('recentBills').style.display = 'none';
}

async function searchReturnArticle() {
    const artNo = document.getElementById('retArtNo').value;
    if(!artNo) return;
    const { data: articles, error } = await supabaseClient.from('articles').select(`id, article_no, name, cost_price, mrp, stock_batches (color, size)`).eq('shop_id', currentShopId).eq('article_no', artNo).single();
    if (error || !articles) { showToast("Article not found!", true); document.getElementById('retArticleDetails').style.display = 'none'; return; }
    foundReturnArticle = articles;
    document.getElementById('retArtName').innerText = `[${articles.article_no}] ${articles.name}`;
    const sizeSelect = document.getElementById('retSize'); sizeSelect.innerHTML = '';
    let uniqueColorSizes = new Set();
    articles.stock_batches.forEach(batch => { let c = batch.color || ''; if (c === 'Default') c = ''; uniqueColorSizes.add(`${c}|||${String(batch.size).trim()}`); });
    uniqueColorSizes.forEach(val => { const parts = val.split('|||'); const c = parts[0]; const s = parts[1]; let displayColor = (c === '') ? '' : `${c} - `; sizeSelect.innerHTML += `<option value="${esc(val)}">${esc(displayColor)}Size ${esc(s)}</option>`; });
    document.getElementById('retQty').value = 1;
    retUnit = articles.mrp || 0;
    document.getElementById('retPrice').value = retUnit;
    document.getElementById('retArticleDetails').style.display = 'block';
}

async function processReturn() {
    const parts = document.getElementById('retSize').value.split('|||');
    const color = parts[0], size = parts[1];
    const qty = parseInt(document.getElementById('retQty').value);
    const refund = parseInt(document.getElementById('retPrice').value) || 0;
    if(!size || !qty || qty <= 0) { showToast("Invalid details!", true); return; }
    if(refund <= 0) { showToast("Enter the refund amount!", true); return; }
    const { error } = await supabaseClient.rpc('process_return', { p_article: String(foundReturnArticle.id), p_color: color || '', p_size: String(size), p_qty: qty, p_refund: refund });
    if (error) { showToast("Error: " + error.message, true); return; }
    showToast(`✅ Return done! Stock +${qty}`, false);
    document.getElementById('retArticleDetails').style.display = 'none';
    document.getElementById('retArtNo').value = '';
    switchTab('history');
}

// ---------- Expense, Udhaar & Staff ----------
async function saveExpense() {
    const reason = document.getElementById('expReason').value; const amount = parseInt(document.getElementById('expAmount').value);
    if(!reason || !amount || amount <= 0) { showToast("Enter valid reason and amount!", true); return; }
    showToast("Saving expense...", false);
    try {
        const { error } = await supabaseClient.from('expenses').insert([{ shop_id: currentShopId, reason: reason, amount: amount }]);
        if (error) throw error;
        showToast("Expense Saved! 💸", false); document.getElementById('expReason').value = ''; document.getElementById('expAmount').value = ''; switchTab('dashboard');
    } catch (err) { showToast("Error: " + err.message, true); }
}

async function loadCredits() {
    const list = document.getElementById('creditsList');
    const { data: credits } = await supabaseClient.from('credits').select('*').eq('shop_id', currentShopId).order('created_at', { ascending: false });
    list.innerHTML = '';
    if(!credits || credits.length === 0) { list.innerHTML = '<p style="text-align:center; font-size:14px; color:var(--text-muted);">No pending credits.</p>'; return; }
    credits.forEach(c => {
        let isPaid = c.status === 'paid';
        let waLink = `https://wa.me/91${c.phone}?text=${encodeURIComponent(`Hello ${c.customer_name}, you have a pending credit of ₹${c.amount} at our shop. Please visit us.`)}`;
        let actionBtn = `<a href="${waLink}" target="_blank" class="btn-small" style="background:#25D366; color:white; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:5px; border-radius: 8px;"><i class="fa-brands fa-whatsapp"></i> Reminder</a>`;
        
        list.innerHTML += `
        <div class="credit-card ${isPaid ? 'paid' : ''}">
            <div><strong style="font-size: 16px;">${esc(c.customer_name)}</strong><br><span style="color:var(--text-muted); font-size: 13px;"><i class="fa-solid fa-phone"></i> ${esc(c.phone)}</span><br><span style="color:var(--warning); font-weight:800; font-size: 18px;">₹${c.amount}</span></div>
            
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${isPaid ? '<span style="color:var(--success); font-weight: bold;"><i class="fa-solid fa-circle-check"></i> Paid</span>' : `<div style="display:flex; gap:6px;">${actionBtn}<button class="btn-small btn-success" onclick="markCreditPaid('${c.id}')" style="border-radius: 8px;"><i class="fa-solid fa-check"></i> Paid</button></div>`}
                
                <button class="btn-small btn-danger" onclick="deleteCredit('${c.id}')" style="border-radius: 8px; margin-top: 4px;"><i class="fa-solid fa-trash"></i> Delete</button>
            </div>
        </div>`;
    });
}

async function saveCredit() {
    const name = document.getElementById('credName').value; const phone = document.getElementById('credPhone').value; const amount = parseInt(document.getElementById('credAmount').value);
    if(!name || !amount || amount <= 0) { showToast("Enter valid name and amount!", true); return; } 
    await supabaseClient.from('credits').insert([{ shop_id: currentShopId, customer_name: name, phone: phone, amount: amount }]);
    showToast("Credit Added!", false); document.getElementById('credName').value = ''; document.getElementById('credPhone').value = ''; document.getElementById('credAmount').value = ''; loadCredits();
}

async function markCreditPaid(id) { await supabaseClient.from('credits').update({ status: 'paid' }).eq('id', id); showToast("Marked as Paid!", false); loadCredits(); }

async function deleteCredit(id) {
    askConfirm("ही उधारीची नोंद कायमची डिलीट करायची आहे का?", async () => {
        await supabaseClient.from('credits').delete().eq('id', id);
        showToast("Credit Deleted!", false);
        loadCredits();
    });
}

function calculateStaffPayment() {
    const total = parseFloat(document.getElementById('staffTotalSalary').value) || 0;
    const advance = parseFloat(document.getElementById('staffAdvance').value) || 0;
    const leaves = parseFloat(document.getElementById('staffLeaveDeduction').value) || 0;
    let net = total - advance - leaves; if(net < 0) net = 0; 
    document.getElementById('staffNetPayable').innerText = `₹${net}`;
}

function promptReleaseStaffPayment() {
    const name = document.getElementById('staffNameInput').value.trim();
    const netAmount = parseFloat(document.getElementById('staffNetPayable').innerText.replace('₹', '')) || 0;
    if(!name) { showToast("Enter Staff Name!", true); return; }
    if(netAmount <= 0) { showToast("Net Payable amount must be greater than 0!", true); return; }
    askConfirm(`Are you sure you want to release ₹${netAmount} to ${name}?`, () => executeStaffRelease(name, netAmount));
}

async function executeStaffRelease(name, amount) {
    showToast("Releasing payment...", false);
    try {
        const reason = `Salary - ${name}`;
        const { error } = await supabaseClient.from('expenses').insert([{ shop_id: currentShopId, reason: reason, amount: amount }]);
        if (error) throw error;
        showToast(`✅ Released ₹${amount} to ${name}`, false);
        document.getElementById('staffNameInput').value = ''; document.getElementById('staffTotalSalary').value = ''; document.getElementById('staffAdvance').value = ''; document.getElementById('staffLeaveDeduction').value = ''; document.getElementById('staffNetPayable').innerText = '₹0'; switchTab('dashboard');
    } catch (err) { showToast("Error: " + err.message, true); }
}

// ---------- Stock Management ----------
function setStockFilter(gender, btnElement) {
    currentGenderFilter = gender;
    document.querySelectorAll('#genderFilterContainer .filter-btn').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
    let types = [];
    if(gender === 'Men' || gender === 'Ladies') { types = ['Formal', 'Sport', 'Chappal', 'Sandal', 'Slippers']; }
    else if(gender === 'Boys' || gender === 'Girls') { types = ['School', 'Sport', 'Chappal', 'Sandal', 'Slippers']; } 
    else { types = ['Chappal', 'Sandal', 'Slippers']; }
    currentTypeFilter = types[0];
    const typeContainer = document.getElementById('typeFilterContainer');
    typeContainer.innerHTML = '';
    types.forEach((type, index) => {
        let btn = document.createElement('div');
        btn.className = `sub-filter-btn ${index === 0 ? 'active' : ''}`;
        btn.innerText = type;
        btn.onclick = function() {
            document.querySelectorAll('#typeFilterContainer .sub-filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentTypeFilter = type;
            loadMyStockList();
        };
        typeContainer.appendChild(btn);
    });
    loadMyStockList();
}

const STOCK_PAGE = 40;
let stockRenderList = [], stockRenderCount = 0, stockSearchT;
function debounceStockSearch() { clearTimeout(stockSearchT); stockSearchT = setTimeout(searchStockArticle, 350); }
function stockRowHtml(art) {
    let total = 0; const grouped = {};
    (art.stock_batches || []).forEach(b => {
        const qty = Number(b.remaining_qty) || 0;
        total += qty;
        if (qty > 0) {
            let col = b.color || ''; if (col === 'Default') col = '';
            const s = String(b.size).trim();
            if (!grouped[col]) grouped[col] = {};
            grouped[col][s] = (grouped[col][s] || 0) + qty;
        }
    });
    const colors = Object.keys(grouped);
    let detail = '';
    colors.forEach(col => {
        let sizes = '';
        Object.keys(grouped[col]).sort((a, b) => Number(a) - Number(b)).forEach(sz => {
            const q = grouped[col][sz];
            sizes += `<span class="size-badge${q <= 2 ? ' low' : ''}">S${esc(sz)}: ${q}</span>`;
        });
        detail += `<div class="color-group-display">${col ? `<span class="color-title"><i class="fa-solid fa-palette"></i> ${esc(col)}</span>` : ''}<div>${sizes}</div></div>`;
    });
    if (!detail) detail = '<p class="srow-out">Out of stock</p>';
    const status = total === 0 ? 'out' : (total <= 5 ? 'low' : 'ok');
    const category = String(art.category || '');
    const isLadies = category.toLowerCase().includes('ladies');
    const isGirls = category.toLowerCase().includes('girls');
    const isBoys = category.toLowerCase().includes('boys') || category === 'Kids';
    const isKids = isBoys || isGirls;
    const categoryIcon = isLadies ? 'fa-person-dress' : (isGirls ? 'fa-child-dress' : (isKids ? 'fa-child' : 'fa-person'));
    const categoryLabel = isLadies ? 'Ladies' : (isGirls ? 'Girls' : (isBoys ? 'Boys' : (category ? 'Gents' : 'Uncategorized')));
    const del = isStaffMode ? '' : `<button class="srow-del" onclick="askConfirm('Delete this article permanently?', () => deleteArticle('${esc(art.id)}'))"><i class="fa-solid fa-trash"></i> Delete article</button>`;
    const sub = [category, colors.length > 1 ? colors.length + ' colors' : ''].filter(Boolean).map(esc).join(' • ');
    return `<div class="srow ${status}">
        <div class="srow-main" onclick="this.parentElement.classList.toggle('open')">
            <div class="srow-category-icon ${isLadies ? 'ladies' : (isKids ? 'kids' : 'gents')}" aria-hidden="true"><i class="fa-solid ${categoryIcon}"></i></div>
            <div class="srow-info"><div class="srow-title"><b>${esc(art.article_no)}</b><span>${esc(art.name) || 'Unnamed'}</span></div><div class="srow-sub"><span class="srow-category-label">${categoryLabel}</span>${sub ? ' • ' + sub : ''}</div></div>
            <div class="srow-qty ${status}">${total}<small>pairs</small></div>
            <i class="fa-solid fa-chevron-down srow-arrow"></i>
        </div>
        <div class="srow-detail">${detail}${del}</div></div>`;
}
function renderStockRows(list) {
    stockRenderList = list; stockRenderCount = 0;
    document.getElementById('stockList').innerHTML = `<div class="stock-count">${list.length} article${list.length === 1 ? '' : 's'}</div><div id="stockRows"></div><div id="stockMore"></div>`;
    moreStockRows();
}
function moreStockRows() {
    const next = stockRenderList.slice(stockRenderCount, stockRenderCount + STOCK_PAGE);
    document.getElementById('stockRows').insertAdjacentHTML('beforeend', next.map(stockRowHtml).join(''));
    stockRenderCount += next.length;
    const left = stockRenderList.length - stockRenderCount;
    document.getElementById('stockMore').innerHTML = left > 0 ? `<button class="btn-outline" onclick="moreStockRows()">Show more (${left} left)</button>` : '';
}

async function loadMyStockList() {
    const stockListDiv = document.getElementById('stockList');
    if(!currentShopId) return;
    stockListDiv.innerHTML = skeleton(3);
    const { data: articles } = await supabaseClient.from('articles').select(`id, article_no, name, category, stock_batches (color, size, remaining_qty)`).eq('shop_id', currentShopId).order('created_at', { ascending: false });
    updateStockTotals(articles);
    stockListDiv.innerHTML = ''; 
    if(!articles || articles.length === 0) { stockListDiv.innerHTML = emptyState('fa-box-open', 'No articles added yet', '<button class="btn-primary" onclick="switchTab(\'article\')" style="width:auto; padding:12px 22px;"><i class="fa-solid fa-plus"></i> Add your first article</button>'); return; }

    let filteredArticles = articles.filter(art => {
        let cat = art.category;
        if(cat === 'Formal' || cat === 'Sport' || cat === 'Sandal' || cat === 'Chappal' || cat === 'Slippers') cat = 'Men - ' + cat;
        if(cat === 'Ladies') cat = 'Ladies - Chappal';
        if(cat === 'LadiesSandal') cat = 'Ladies - Sandal';
        if(cat === 'Kids') cat = 'Boys - Chappal';
        return cat === `${currentGenderFilter} - ${currentTypeFilter}`;
    });

    if(filteredArticles.length === 0) { stockListDiv.innerHTML = emptyState('fa-shoe-prints', `${currentGenderFilter} - ${currentTypeFilter} - no articles found`); return; }
    renderStockRows(filteredArticles);
}

async function searchStockArticle() {
    const searchTerm = document.getElementById('stockSearch').value.trim().toLowerCase();
    const stockListDiv = document.getElementById('stockList');
    if(!searchTerm) { loadMyStockList(); return; }
    const { data: articles } = await supabaseClient.from('articles').select(`id, article_no, name, category, stock_batches (color, size, remaining_qty)`).eq('shop_id', currentShopId);
    let filtered = articles.filter(art => (art.article_no && art.article_no.toLowerCase().includes(searchTerm)) || (art.name && art.name.toLowerCase().includes(searchTerm)));
    stockListDiv.innerHTML = ''; 
    if(filtered.length === 0) { stockListDiv.innerHTML = emptyState('fa-magnifying-glass', 'No articles found'); return; }
    renderStockRows(filtered);
}

async function deleteArticle(articleId) {
    if(isStaffMode) return;
    showToast("Deleting...", false);
    const { error } = await supabaseClient.from('articles').delete().eq('id', articleId);
    if(error) { showToast("Error deleting: " + error.message, true); } 
    else { showToast("Article Deleted! 🗑️", false); loadMyStockList(); loadDashboardData(); switchTab('lowStockAlert'); }
}

function updateArticleTypes() {
    const gender = document.getElementById('artGender').value;
    const typeSelect = document.getElementById('artType'); typeSelect.innerHTML = '';
    let types = [];
    if(gender === 'Men' || gender === 'Ladies') { types = ['Formal', 'Sport', 'Chappal', 'Sandal', 'Slippers']; } 
    else if(gender === 'Boys' || gender === 'Girls') { types = ['School', 'Sport', 'Chappal', 'Sandal', 'Slippers']; } 
    else { types = ['Chappal', 'Sandal', 'Slippers']; }
    types.forEach(t => { typeSelect.innerHTML += `<option value="${t}">${t}</option>`; });
    updateSizes();
}

function getSizeGridHTML() {
    const gender = document.getElementById('artGender').value;
    let html = `<div class="size-grid">`;
    let sizes = [];
    if(gender === 'Ladies') sizes = [3,4,5,6,7,8,9,10,11,12];
    else if(gender === 'Boys' || gender === 'Girls') sizes = [1,2,3,4,5,6,7,8,9,10,11,12,13];
    else sizes = [6,7,8,9,10,11,12];
    sizes.forEach(s => { html += `<div><label>${s}</label><input type="number" class="size-input-${s}" min="0" placeholder="0"></div>`; });
    html += `</div>`;
    return html;
}

function addColorSection() {
    const container = document.getElementById('colorContainer');
    const div = document.createElement('div');
    div.className = 'color-section';
    div.innerHTML = `
        <div class="color-header">
            <input type="text" class="color-name" placeholder="Color (Optional)" style="margin-bottom:0; width:70%;">
            <button class="btn-small btn-danger" onclick="this.parentElement.parentElement.remove()" style="padding: 10px 16px;"><i class="fa-solid fa-trash"></i></button>
        </div>
        ${getSizeGridHTML()}
    `;
    container.appendChild(div);
}

function updateSizes() {
    document.getElementById('colorContainer').innerHTML = '';
    addColorSection(); 
}

async function saveArticle() {
    const artNo = document.getElementById('artNo').value.trim();
    if(artNo === "") { showToast("Article No is required!", true); return; }
    const { data: existing } = await supabaseClient.from('articles').select('id').eq('shop_id', currentShopId).eq('article_no', artNo).maybeSingle();
    if (existing) { showToast("Error: Article No already exists!", true); return; }

    const gender = document.getElementById('artGender').value; const type = document.getElementById('artType').value;
    const combinedCategory = `${gender} - ${type}`;
    const { data: articleData, error: artError } = await supabaseClient.from('articles').insert([{
        shop_id: currentShopId, article_no: artNo, name: document.getElementById('artName').value, category: combinedCategory,
        cost_price: document.getElementById('artCost').value ? parseInt(document.getElementById('artCost').value) : 0, 
        mrp: document.getElementById('artMrp').value ? parseInt(document.getElementById('artMrp').value) : 0
    }]).select();

    if (artError) { showToast("Error: " + artError.message, true); return; }
    const articleId = articleData[0].id;
    const colorSections = document.querySelectorAll('.color-section');
    const costVal = document.getElementById('artCost').value ? parseInt(document.getElementById('artCost').value) : 0;
    const rows = [];
    colorSections.forEach(section => {
        const colorName = section.querySelector('.color-name').value.trim();
        section.querySelectorAll('input[type="number"]').forEach(input => {
            const q = parseInt(input.value);
            if (q > 0) rows.push({ shop_id: currentShopId, article_id: articleId, size: input.className.split('size-input-')[1], color: colorName, initial_qty: q, remaining_qty: q, cost_price: costVal });
        });
    });
    const totalAdded = rows.reduce((a, r) => a + r.initial_qty, 0);
    if (rows.length > 0) {
        const { error: batchError } = await supabaseClient.from('stock_batches').insert(rows);
        if (batchError) { await supabaseClient.from('articles').delete().eq('id', articleId); showToast("Error: " + batchError.message, true); return; }
    }
    showToast(`Article Saved with ${totalAdded} pairs! 🎉`, false);
    document.getElementById('artNo').value = ""; document.getElementById('artName').value = ""; document.getElementById('artCost').value = ""; document.getElementById('artMrp').value = "";
    document.getElementById('colorContainer').innerHTML = ''; addColorSection(); switchTab('stock');
}

// ---------- Add Stock / Purchase ----------
async function searchPurchaseArticle() {
    const artNo = document.getElementById('purArtNo').value; if(!artNo) return;
    const { data: articles, error } = await supabaseClient.from('articles').select(`id, article_no, name, cost_price, stock_batches (color, size)`).eq('shop_id', currentShopId).eq('article_no', artNo).single();
    if (error || !articles) { showToast("Article not found!", true); document.getElementById('purArticleDetails').style.display = 'none'; return; }
    foundPurchaseArticle = articles;
    document.getElementById('purArtName').innerText = `[${articles.article_no}] ${articles.name}`;
    const colorSelect = document.getElementById('purColor
