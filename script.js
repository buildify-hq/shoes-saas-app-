const SUPABASE_URL = 'https://naehmnkvjsxrhzgvpmpj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hZWhtbmt2anN4cmh6Z3ZwbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0OTkyOTYsImV4cCI6MjA4MDA3NTI5Nn0.rDagdxfbZ1rQK1YnFdxJxhFOZ-KPRLl8UrwIFe8QKaE'; 

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentShopId = null;
let isStaffMode = false;

let foundSaleArticle = null;
let foundReturnArticle = null;
let foundPurchaseArticle = null;
let cart = [];

let currentGenderFilter = 'Men';
let currentTypeFilter = 'Formal';

let confirmCallback = null; 

const ADMIN_EMAIL = 'admin14@shoeshop.com'; 
const SECRET_ADMIN_ID = 'sagar_admin';      

let html5QrcodeScanner = null;

// ---------- Helpers ----------
function esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function localDateStr(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function startOfTodayISO() {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
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

window.onload = () => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('themeIcon').innerHTML = savedTheme === 'dark' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    updateArticleTypes();
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

function startScanner(targetInputId) {
    document.getElementById('scannerModal').style.display = 'flex';
    if (html5QrcodeScanner) { html5QrcodeScanner.clear(); }
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 250} }, false);
    html5QrcodeScanner.render((decodedText, decodedResult) => {
        document.getElementById(targetInputId).value = decodedText;
        closeScanner();
        if(targetInputId === 'saleArtNo') searchSaleArticle();
        else if(targetInputId === 'dashSearchArt') searchDashboardArticle();
        else if(targetInputId === 'purArtNo') searchPurchaseArticle();
        else if(targetInputId === 'retArtNo') searchReturnArticle();
        showToast("Barcode Scanned!");
    }, (errorMessage) => {});
}

function closeScanner() {
    document.getElementById('scannerModal').style.display = 'none';
    if (html5QrcodeScanner) { html5QrcodeScanner.clear(); }
}

function calculateStaffPayment() {
    const total = parseFloat(document.getElementById('staffTotalSalary').value) || 0;
    const advance = parseFloat(document.getElementById('staffAdvance').value) || 0;
    const leaves = parseFloat(document.getElementById('staffLeaveDeduction').value) || 0;
    let net = total - advance - leaves;
    if(net < 0) net = 0; 
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
        document.getElementById('staffNameInput').value = '';
        document.getElementById('staffTotalSalary').value = '';
        document.getElementById('staffAdvance').value = '';
        document.getElementById('staffLeaveDeduction').value = '';
        document.getElementById('staffNetPayable').innerText = '₹0';
        switchTab('dashboard');
    } catch (err) {
        showToast("Error: " + err.message, true);
    }
}

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
    else { currentUser = authData.user; currentShopId = shop.id; document.getElementById('headerShopName').innerText = shop.shop_name; showOwnerDashboard(); }
}

async function saveTarget() {
    const target = parseInt(document.getElementById('targetInput').value) || 0;
    if(target < 0) { showToast("Target cannot be negative!", true); return; } 
    await supabaseClient.from('shops').update({ daily_target: target }).eq('id', currentShopId);
    showToast("Target Updated!");
    switchTab('dashboard');
}

async function searchDashboardArticle() {
    const artNo = document.getElementById('dashSearchArt').value.trim();
    const resultDiv = document.getElementById('dashSearchResult');
    if(!artNo) { resultDiv.innerHTML = ''; return; }
    const { data: articles, error } = await supabaseClient.from('articles').select(`id, article_no, name, category, stock_batches (color, size, remaining_qty)`).eq('shop_id', currentShopId).eq('article_no', artNo).maybeSingle();
    if(error || !articles) { resultDiv.innerHTML = '<p style="color:var(--danger); font-size:14px; text-align:center;">Article not found!</p>'; return; }
    
    let totalPairs = 0;
    let groupedByColor = {};
    if(articles.stock_batches) {
        articles.stock_batches.forEach(b => {
            totalPairs += b.remaining_qty;
            if(b.remaining_qty > 0) {
                let c = b.color || ''; 
                if(c === 'Default') c = '';
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
            sizesHtml += `<span class="size-badge">S${size}: ${groupedByColor[color][size]}</span>`; 
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

async function loadSuperAdminData() {
    const list = document.getElementById('saOwnerList');
    const searchTerm = document.getElementById('saSearch').value.toLowerCase();
    const { data: shops, error } = await supabaseClient.from('shops').select('*');
    if (error) { list.innerHTML = "Error loading shops."; return; }
    
    const filtered = shops.filter(s => (s.owner_name && s.owner_name.toLowerCase().includes(searchTerm)) || (s.shop_name && s.shop_name.toLowerCase().includes(searchTerm)));
    const today = new Date();
    let activeCount = shops.filter(s => s.status === 'active' && new Date(s.expiry_date) > today).length;
    document.getElementById('saStats').innerText = `Total Owners: ${shops.length} | Active: ${activeCount}`;
    
    list.innerHTML = '';
    if(filtered.length === 0) { list.innerHTML = '<p style="text-align:center; color:var(--text-muted);">No shops found.</p>'; return; }

    filtered.forEach(s => {
        let isActive = s.status === 'active';
        let expiryStr = s.expiry_date ? new Date(s.expiry_date).toLocaleDateString('en-GB') : 'Not Set';
        list.innerHTML += `
        <div class="sa-card">
            <div class="sa-card-top">
                <div class="sa-avatar">${esc((s.owner_name || 'S').charAt(0).toUpperCase())}</div>
                <div class="sa-info">
                    <h4>${esc(s.owner_name) || 'Unknown'}</h4>
                    <p><i class="fa-solid fa-store"></i> ${esc(s.shop_name)} • <i class="fa-solid fa-phone"></i> ${esc(s.phone) || 'N/A'}</p>
                    <div class="sa-valid"><i class="fa-regular fa-calendar-check"></i> Valid till: ${expiryStr}</div>
                </div>
                <div class="sa-toggle ${isActive ? 'active' : ''}" onclick="toggleShopStatus('${s.id}', '${s.status}')"></div>
            </div>
            <div class="sa-actions">
                <a href="tel:${esc(s.phone)}" class="sa-act-btn call"><i class="fa-solid fa-phone"></i> Call</a>
                <a href="https://wa.me/91${esc(s.phone)}" target="_blank" class="sa-act-btn wa"><i class="fa-brands fa-whatsapp"></i> WA</a>
                <button class="sa-act-btn add" onclick="add30Days('${s.id}', '${s.expiry_date}')"><i class="fa-solid fa-clock"></i> +30 Days</button>
                <button class="sa-act-btn edit" onclick="editOwner('${s.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
                <button class="sa-act-btn del" onclick="askConfirm('Delete this shop completely?', () => deleteOwner('${s.id}'))"><i class="fa-solid fa-trash"></i> Delete</button>
            </div>
        </div>`;
    });
}

async function loadAdminReport() {
    document.getElementById('adminReportContainer').style.display = 'block';
    
    const { data: shops, error } = await supabaseClient.from('shops').select('*');
    if (error) { showToast("Error loading report!", true); return; }

    const today = new Date();
    let activeCount = 0;
    let expiredCount = 0;

    shops.forEach(shop => {
        if (shop.status === 'active' && shop.expiry_date && new Date(shop.expiry_date) > today) {
            activeCount++;
        } else {
            expiredCount++;
        }
    });

    document.getElementById('adminTotalShops').innerText = shops.length;
    document.getElementById('adminActiveShops').innerText = activeCount;
    document.getElementById('adminExpiredShops').innerText = expiredCount;
    
    document.getElementById('adminReportContainer').scrollIntoView({ behavior: 'smooth' });
}

function openOwnerModal(mode) {
    document.getElementById('ownerModal').style.display = 'flex';
    if(mode === 'add') {
        document.getElementById('modalTitle').innerText = "Add New Owner";
        document.getElementById('editOwnerId').value = "";
        document.getElementById('saOwnerName').value = "";
        document.getElementById('saShopName').value = "";
        document.getElementById('saPhone').value = "";
        document.getElementById('saOwnerPin').value = "";
    }
}

async function editOwner(id) {
    const { data: shop } = await supabaseClient.from('shops').select('*').eq('id', id).single();
    if(shop) {
        document.getElementById('ownerModal').style.display = 'flex';
        document.getElementById('modalTitle').innerText = "Edit Owner";
        document.getElementById('editOwnerId').value = shop.id;
        document.getElementById('saOwnerName').value = shop.owner_name || '';
        document.getElementById('saShopName').value = shop.shop_name || '';
        document.getElementById('saPhone').value = shop.phone || '';
        document.getElementById('saOwnerPin').value = shop.pin || '';
    }
}

async function saveOwner() {
    const id = document.getElementById('editOwnerId').value;
    const name = document.getElementById('saOwnerName').value;
    const shopName = document.getElementById('saShopName').value;
    const phone = document.getElementById('saPhone').value;
    const pin = document.getElementById('saOwnerPin').value;

    if(!name || !shopName || !pin) { showToast("Name, Shop Name and PIN required!", true); return; }
    if(pin.length < 6) { showToast("PIN must be at least 6 digits!", true); return; }

    if(id) {
        await supabaseClient.from('shops').update({ owner_name: name, shop_name: shopName, phone: phone, pin: pin }).eq('id', id);
        showToast("Owner Updated!", false);
    } else {
        const auth_email = `${shopName.replace(/\s+/g, '').toLowerCase()}${Date.now()}@shoeshop.com`;
        const { data: { session: adminSession } } = await supabaseClient.auth.getSession();
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({ email: auth_email, password: pin, options: { data: { shop_name: shopName } } });
        if (adminSession) { await supabaseClient.auth.setSession({ access_token: adminSession.access_token, refresh_token: adminSession.refresh_token }); }
        if(authError) { showToast("Error: " + authError.message, true); return; }
        const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const { error: shopError } = await supabaseClient.from('shops').insert([{ owner_name: name, shop_name: shopName, phone: phone, pin: pin, auth_email: auth_email, status: 'active', expiry_date: expiry }]);
        if(shopError) { showToast("Error: " + shopError.message, true); return; }
        showToast("Owner Added!", false);
    }
    
    document.getElementById('ownerModal').style.display = 'none';
    loadSuperAdminData();
}

async function toggleShopStatus(id, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    await supabaseClient.from('shops').update({ status: newStatus }).eq('id', id);
    showToast(`Shop marked as ${newStatus}`, false);
    loadSuperAdminData();
}

async function add30Days(id, currentExpiry) {
    let newDate = currentExpiry ? new Date(currentExpiry) : new Date();
    if(newDate < new Date()) newDate = new Date();
    newDate.setDate(newDate.getDate() + 30);
    await supabaseClient.from('shops').update({ expiry_date: newDate.toISOString() }).eq('id', id);
    showToast("+30 Days Added!", false);
    loadSuperAdminData();
}

async function deleteOwner(id) {
    await supabaseClient.from('shops').delete().eq('id', id);
    showToast("Shop Deleted!", false);
    loadSuperAdminData();
}

function showOwnerDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topHeader').style.display = 'flex'; 
    document.getElementById('bottomNav').style.display = 'flex';
    
    document.getElementById('menuBtn').style.display = isStaffMode ? 'none' : 'inline-block';
    if(isStaffMode) {
        document.getElementById('nav-dash').style.display = 'none';
        let navMore = document.getElementById('nav-more');
        navMore.setAttribute('onclick', 'handleLogout()');
        navMore.innerHTML = '<i class="fa-solid fa-arrow-right-from-bracket nav-icon"></i> Logout';
        navMore.style.display = 'none';
        document.getElementById('nav-stock').style.display = 'flex';
        document.getElementById('nav-sale').style.display = 'flex';
        switchTab('sale');
    } else {
        document.getElementById('nav-dash').style.display = 'flex';
        let navMore = document.getElementById('nav-more');
        navMore.setAttribute('onclick', 'toggleSidebar()');
        navMore.innerHTML = '<i class="fa-solid fa-bars nav-icon"></i> Menu';
        navMore.style.display = 'none';
        document.getElementById('nav-stock').style.display = 'flex';
        document.getElementById('nav-sale').style.display = 'flex';
        switchTab('dashboard');
    }
}

function switchTab(tabName) {
    if(isStaffMode && (tabName === 'dashboard' || tabName === 'staff' || tabName === 'staffPin' || tabName === 'target')) return; 
    const screens = ['dashboardScreen', 'stockScreen', 'saleScreen', 'articleScreen', 'purchaseScreen', 'returnScreen', 'expenseScreen', 'creditsScreen', 'staffPinScreen', 'targetScreen', 'staffScreen', 'reportsScreen', 'lowStockAlertScreen', 'historyScreen'];
    screens.forEach(s => { let el = document.getElementById(s); if(el) el.style.display = 'none'; });
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    if(tabName === 'dashboard') { document.getElementById('dashboardScreen').style.display = 'block'; document.getElementById('nav-dash').classList.add('active'); loadDashboardData(); } 
    else if(tabName === 'stock') { document.getElementById('stockScreen').style.display = 'block'; document.getElementById('nav-stock').classList.add('active'); initStockTab(); } 
    else if(tabName === 'sale') { document.getElementById('saleScreen').style.display = 'block'; document.getElementById('nav-sale').classList.add('active'); document.getElementById('saleArticleDetails').style.display = 'none'; document.getElementById('staffReturnBtn').style.display = isStaffMode ? 'flex' : 'none'; } 
    else if(tabName === 'staff') { document.getElementById('staffScreen').style.display = 'block'; } 
    else if(tabName === 'article') { document.getElementById('articleScreen').style.display = 'block'; updateArticleTypes(); } 
    else if(tabName === 'return') { document.getElementById('returnScreen').style.display = 'block'; document.getElementById('retArticleDetails').style.display = 'none'; } 
    else if(tabName === 'purchase') { document.getElementById('purchaseScreen').style.display = 'block'; document.getElementById('purArticleDetails').style.display = 'none'; }
    else if(tabName === 'expense') { document.getElementById('expenseScreen').style.display = 'block'; }
    else if(tabName === 'credits') { document.getElementById('creditsScreen').style.display = 'block'; loadCredits(); }
    else if(tabName === 'staffPin') { document.getElementById('staffPinScreen').style.display = 'block'; loadStaffPin(); }
    else if(tabName === 'target') { document.getElementById('targetScreen').style.display = 'block'; loadTargetData(); }
    else if(tabName === 'reports') { document.getElementById('reportsScreen').style.display = 'block'; document.getElementById('reportDate').value = localDateStr(new Date()); loadReportData(); }
    else if(tabName === 'history') { document.getElementById('historyScreen').style.display = 'block'; document.getElementById('nav-hist').classList.add('active'); loadHistory(); }
    else if(tabName === 'lowStockAlert') { document.getElementById('lowStockAlertScreen').style.display = 'block'; loadLowStockAlerts(); }
}

async function loadStaffPin() {
    const { data } = await supabaseClient.from('shops').select('staff_pin').eq('id', currentShopId).single();
    document.getElementById('displayStaffPin').innerText = (data && data.staff_pin) ? data.staff_pin : '----';
}

async function generateStaffPin() {
    const newPin = Math.floor(100000 + Math.random() * 900000).toString();
    await supabaseClient.from('shops').update({ staff_pin: newPin }).eq('id', currentShopId);
    document.getElementById('displayStaffPin').innerText = newPin;
    showToast("New Staff PIN Generated!", false);
}

async function resetStaffPin() {
    await supabaseClient.from('shops').update({ staff_pin: null }).eq('id', currentShopId);
    document.getElementById('displayStaffPin').innerText = '----';
    showToast("Staff PIN Removed!", false);
}

async function loadTargetData() {
    const { data } = await supabaseClient.from('shops').select('daily_target').eq('id', currentShopId).single();
    document.getElementById('targetInput').value = (data && data.daily_target) ? data.daily_target : 0;
}

function quickExpense(reason) {
    document.getElementById('expReason').value = reason;
    switchTab('expense');
}

async function loadReportData() {
    const selectedDate = document.getElementById('reportDate').value;
    if (!selectedDate || !currentShopId) return;
    const [rStart, rEnd] = dayRange(selectedDate);
    const { data: sales } = await supabaseClient.from('sales').select('total_amount, total_profit').eq('shop_id', currentShopId).gte('sale_date', rStart).lt('sale_date', rEnd);
    let totalSales = 0, totalProfit = 0;
    if (sales) { sales.forEach(s => { totalSales += s.total_amount; totalProfit += s.total_profit; }); }
    document.getElementById('reportSales').innerText = "₹" + totalSales;
    document.getElementById('reportProfit').innerText = "₹" + totalProfit;

    if(document.getElementById('salesChart')) {
        loadChartData('weekly');
    }
}

let mySalesChart = null;
async function loadChartData(type) {
    if (!currentShopId || typeof Chart === 'undefined') return;
    const btnWeekly = document.getElementById('btnWeekly');
    const btnMonthly = document.getElementById('btnMonthly');
    const on = (b) => { b.style.background = 'linear-gradient(135deg, #1D4ED8, #1E40AF)'; b.style.color = 'white'; };
    const off = (b) => { b.style.background = 'transparent'; b.style.color = 'var(--primary)'; };
    if (type === 'weekly') { on(btnWeekly); off(btnMonthly); } else { on(btnMonthly); off(btnWeekly); }

    const days = type === 'weekly' ? 7 : 28;
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
    const { data: sales } = await supabaseClient.from('sales').select('total_amount, sale_date').eq('shop_id', currentShopId).gte('sale_date', start.toISOString());
    const perDay = {};
    (sales || []).forEach(x => { const k = localDateStr(new Date(x.sale_date)); perDay[k] = (perDay[k] || 0) + x.total_amount; });

    let labels = [], salesData = [];
    if (type === 'weekly') {
        for (let i = 0; i < 7; i++) {
            const d = new Date(start); d.setDate(start.getDate() + i);
            labels.push(d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }));
            salesData.push(perDay[localDateStr(d)] || 0);
        }
    } else {
        for (let w = 0; w < 4; w++) {
            let total = 0;
            for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + w * 7 + i); total += perDay[localDateStr(d)] || 0; }
            labels.push(`Week ${w + 1}`); salesData.push(total);
        }
    }

    if (mySalesChart) { mySalesChart.destroy(); }
    const ctx = document.getElementById('salesChart').getContext('2d');
    mySalesChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Sales (₹)', data: salesData, backgroundColor: 'rgba(29, 78, 216, 0.7)', borderColor: 'rgba(29, 78, 216, 1)', borderWidth: 1, borderRadius: 6 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(148, 163, 184, 0.1)' }, ticks: { color: '#94A3B8' } },
                x: { grid: { display: false }, ticks: { color: '#94A3B8' } }
            }
        }
    });
}

async function loadLowStockAlerts() {
    const container = document.getElementById('lowStockListContainer');
    container.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Loading...</p>';
    const { data: articles } = await supabaseClient.from('articles').select(`id, article_no, name, category, stock_batches (remaining_qty)`).eq('shop_id', currentShopId);
    
    let lowStockHtml = '';
    if(articles) {
        articles.forEach(art => {
            let artTotal = 0;
            if(art.stock_batches) { art.stock_batches.forEach(batch => { artTotal += batch.remaining_qty; }); }
            if(artTotal <= 5 && artTotal >= 0) {
                let badgeColor = artTotal === 0 ? 'var(--danger)' : 'var(--warning)';
                lowStockHtml += `
                <div class="app-card" style="border-left: 4px solid ${badgeColor}; padding: 15px; margin-bottom: 10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h4 style="margin:0; font-size:15px;">[${esc(art.article_no)}] ${esc(art.name) || 'Unnamed'}</h4>
                        <span style="background:${badgeColor}; color:white; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:bold;">${artTotal} Pairs Left</span>
                    </div>
                    <p style="margin:5px 0 0 0; font-size:12px; color:var(--text-muted);">${esc(art.category)}</p>
                </div>`;
            }
        });
    }
    if(lowStockHtml === '') {
        container.innerHTML = '<div style="text-align:center; padding: 30px; color: var(--success);"><i class="fa-solid fa-check-circle" style="font-size: 40px; margin-bottom: 10px;"></i><h3>All Good!</h3><p>सर्व शूजचा स्टॉक व्यवस्थित आहे.</p></div>';
    } else {
        container.innerHTML = lowStockHtml;
    }
}

async function loadDashboardData() {
    if(!currentShopId) return;
    const { data: shopData } = await supabaseClient.from('shops').select('daily_target').eq('id', currentShopId).single();
    let dailyTarget = shopData && shopData.daily_target ? shopData.daily_target : 0;
    document.getElementById('targetDisplay').innerText = dailyTarget;
    
    const { data: articles } = await supabaseClient.from('articles').select(`id, article_no, name, category, stock_batches (remaining_qty)`).eq('shop_id', currentShopId);
    let gentsTotal = 0, ladiesTotal = 0, kidsTotal = 0;
    let lowStockItems = [];
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
            
            if(artTotal <= 5) {
                lowStockItems.push({article_no: art.article_no, name: art.name, total: artTotal});
            }
        });
    }
    document.getElementById('gentsStockDisplay').innerText = gentsTotal + " P";
    document.getElementById('ladiesStockDisplay').innerText = ladiesTotal + " P";
    document.getElementById('kidsStockDisplay').innerText = kidsTotal + " P";
    document.getElementById('totalAllStockDisplay').innerText = (gentsTotal + ladiesTotal + kidsTotal) + " Pairs";

    let badge = document.getElementById('menuAlertBadge');
    if(lowStockItems.length > 0) {
        badge.style.display = 'inline-block';
        badge.innerText = lowStockItems.length;
    } else {
        badge.style.display = 'none';
    }

    const todayStr = startOfTodayISO();
    const { data: todaySales } = await supabaseClient.from('sales').select(`id, total_amount, total_profit, discount_amount, sale_items (quantity, size, selling_price, articles(article_no, name))`).eq('shop_id', currentShopId).gte('sale_date', todayStr);
    const { data: todayReturns } = await supabaseClient.from('returns').select(`quantity, refund_amount, size, articles(cost_price)`).eq('shop_id', currentShopId).gte('return_date', todayStr);
    const { data: todayExpenses } = await supabaseClient.from('expenses').select('*').eq('shop_id', currentShopId).gte('expense_date', todayStr);

    let tSalesAmt = 0, tProfitAmt = 0, tExpenseAmt = 0;
    let transactionsHtml = '';

    if(todaySales) {
        todaySales.forEach(s => {
            tSalesAmt += s.total_amount;
            tProfitAmt += s.total_profit;
            if(s.sale_items) { s.sale_items.forEach(item => { transactionsHtml += `<div style="display:flex; justify-content:space-between; font-size:13px; padding:8px 0; border-bottom:1px dashed var(--border-color); color:var(--success); font-weight:600;"><span><i class="fa-solid fa-bag-shopping"></i> Sale: [${esc(item.articles.article_no)}] S${item.size} x${item.quantity}</span><span>+₹${item.quantity * item.selling_price}</span></div>`; }); }
            if(s.discount_amount > 0) { transactionsHtml += `<div style="display:flex; justify-content:space-between; font-size:13px; padding:8px 0; border-bottom:1px dashed var(--border-color); color:var(--warning); font-weight:600;"><span><i class="fa-solid fa-tag"></i> Discount</span><span>-₹${s.discount_amount}</span></div>`; }
        });
    }
    if(todayReturns) {
        todayReturns.forEach(r => {
            tSalesAmt -= r.refund_amount;
            let returnCost = r.articles && r.articles.cost_price ? r.articles.cost_price : 0;
            tProfitAmt -= (r.refund_amount - returnCost);
            transactionsHtml += `<div style="display:flex; justify-content:space-between; font-size:13px; padding:8px 0; border-bottom:1px dashed var(--border-color); color:var(--warning); font-weight:600;"><span><i class="fa-solid fa-rotate-left"></i> Return: Size ${r.size} x${r.quantity}</span><span>-₹${r.refund_amount}</span></div>`;
        });
    }
    if(todayExpenses) {
        todayExpenses.forEach(e => {
            tProfitAmt -= e.amount;
            tExpenseAmt += e.amount;
            transactionsHtml += `<div style="display:flex; justify-content:space-between; font-size:13px; padding:8px 0; border-bottom:1px dashed var(--border-color); color:var(--danger); font-weight:600;"><span><i class="fa-solid fa-money-bill-transfer"></i> ${esc(e.reason)}</span><span>-₹${e.amount}</span></div>`;
        });
    }

    const transDiv = document.getElementById('todayTransactions');
    if(transactionsHtml === '') { transDiv.innerHTML = '<p style="font-size: 14px; color: var(--text-muted); text-align: center;">No transactions today.</p>'; } 
    else {
        let netCash = tSalesAmt - tExpenseAmt; 
        let isPositive = netCash >= 0;
        transactionsHtml += `<div class="net-cash-flow-box"><div class="title"><i class="fa-solid fa-wallet" style="color: var(--primary);"></i> Net Cash:</div><div class="amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}₹${netCash}</div></div>`;
        transDiv.innerHTML = transactionsHtml;
    }

    document.getElementById('todaySalesDisplay').innerText = "₹" + tSalesAmt;
    document.getElementById('todayProfitDisplay').innerText = "₹" + tProfitAmt;

    if(dailyTarget > 0) {
        let percent = Math.min(100, Math.round((tSalesAmt / dailyTarget) * 100));
        document.getElementById('targetProgressBar').style.width = percent + '%';
        document.getElementById('targetPercent').innerText = percent + '%';
        if(percent >= 100) { document.getElementById('targetProgressBar').style.background = 'var(--success)'; }
        else if(percent > 50) { document.getElementById('targetProgressBar').style.background = 'var(--warning)'; }
        else { document.getElementById('targetProgressBar').style.background = 'var(--primary)'; }
    } else {
        document.getElementById('targetProgressBar').style.width = '0%';
        document.getElementById('targetPercent').innerText = '0%';
    }
}

async function loadCredits() {
    const list = document.getElementById('creditsList');
    const { data: credits } = await supabaseClient.from('credits').select('*').eq('shop_id', currentShopId).order('created_at', { ascending: false });
    list.innerHTML = '';
    if(!credits || credits.length === 0) { list.innerHTML = '<p style="text-align:center; font-size:14px; color:var(--text-muted);">No pending credits.</p>'; return; }
    credits.forEach(c => {
        let isPaid = c.status === 'paid';
        let waLink = `https://wa.me/91${c.phone}?text=${encodeURIComponent(`नमस्कार ${c.customer_name}, तुमची आमच्या दुकानात ₹${c.amount} ची उधारी बाकी आहे. कृपया भेट द्या.`)}`;
        let actionBtn = `<a href="${waLink}" target="_blank" class="btn-small" style="background:#25D366; color:white; text-decoration:none; display:inline-flex; align-items:center; gap:5px; border-radius: 8px;"><i class="fa-brands fa-whatsapp"></i> Reminder</a>`;
        list.innerHTML += `
        <div class="credit-card ${isPaid ? 'paid' : ''}">
            <div><strong style="font-size: 16px;">${esc(c.customer_name)}</strong><br><span style="color:var(--text-muted); font-size: 13px;"><i class="fa-solid fa-phone"></i> ${esc(c.phone)}</span><br><span style="color:var(--warning); font-weight:800; font-size: 18px;">₹${c.amount}</span></div>
            ${isPaid ? '<span style="color:var(--success); font-weight: bold;"><i class="fa-solid fa-circle-check"></i> Paid</span>' : `<div style="display:flex; flex-direction:column; gap:8px;">${actionBtn}<button class="btn-small btn-success" onclick="markCreditPaid('${c.id}')" style="border-radius: 8px;"><i class="fa-solid fa-check"></i> Paid</button></div>`}
        </div>`;
    });
}

async function saveCredit() {
    const name = document.getElementById('credName').value;
    const phone = document.getElementById('credPhone').value;
    const amount = parseInt(document.getElementById('credAmount').value);
    if(!name || !amount || amount <= 0) { showToast("Enter valid name and amount!", true); return; } 
    await supabaseClient.from('credits').insert([{ shop_id: currentShopId, customer_name: name, phone: phone, amount: amount }]);
    showToast("Credit Added!", false);
    document.getElementById('credName').value = ''; document.getElementById('credPhone').value = ''; document.getElementById('credAmount').value = '';
    loadCredits();
}

async function markCreditPaid(id) {
    await supabaseClient.from('credits').update({ status: 'paid' }).eq('id', id);
    showToast("Marked as Paid!", false);
    loadCredits();
}

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

async function loadMyStockList() {
    const stockListDiv = document.getElementById('stockList');
    if(!currentShopId) return;
    const { data: articles } = await supabaseClient.from('articles').select(`id, article_no, name, category, stock_batches (color, size, remaining_qty)`).eq('shop_id', currentShopId).order('created_at', { ascending: false });
    updateStockTotals(articles);
    stockListDiv.innerHTML = ''; 
    if(!articles || articles.length === 0) { stockListDiv.innerHTML = '<p style="font-size: 14px; color: var(--text-muted); text-align: center; padding: 20px;">No articles added yet.</p>'; return; }

    let filteredArticles = articles.filter(art => {
        let cat = art.category;
        if(cat === 'Formal' || cat === 'Sport' || cat === 'Sandal' || cat === 'Chappal' || cat === 'Slippers') cat = 'Men - ' + cat;
        if(cat === 'Ladies') cat = 'Ladies - Chappal';
        if(cat === 'LadiesSandal') cat = 'Ladies - Sandal';
        if(cat === 'Kids') cat = 'Boys - Chappal';
        return cat === `${currentGenderFilter} - ${currentTypeFilter}`;
    });

    if(filteredArticles.length === 0) { stockListDiv.innerHTML = `<p style="font-size: 14px; color: var(--text-muted); text-align: center; padding: 20px;">No ${currentTypeFilter} shoes found for ${currentGenderFilter}.</p>`; return; }

    filteredArticles.forEach(art => {
        let totalPairs = 0;
        let groupedByColor = {};
        if(art.stock_batches) {
            art.stock_batches.forEach(b => {
                totalPairs += b.remaining_qty;
                if(b.remaining_qty > 0) {
                    let c = b.color || ''; 
                    if(c === 'Default') c = '';
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
                sizesHtml += `<span class="size-badge">S${size}: ${groupedByColor[color][size]}</span>`; 
            });
            let colorTitle = (color === '') ? '' : `<span class="color-title"><i class="fa-solid fa-palette"></i> ${esc(color)}</span>`;
            colorHtml += `<div class="color-group-display">${colorTitle}<div>${sizesHtml}</div></div>`;
        }

        let alertBadge = '';
        if (totalPairs === 0) { alertBadge = `<span style="background: var(--danger); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 8px;">Out of Stock</span>`; }
        else if (totalPairs <= 5) { alertBadge = `<span style="background: var(--warning); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 8px;">Low Stock</span>`; }

        let delBtn = !isStaffMode ? `<button onclick="askConfirm('Delete this article permanently?', () => deleteArticle('${art.id}'))" style="position: absolute; top: 15px; right: 15px; width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; background: rgba(239, 68, 68, 0.15); border: none; border-radius: 50%; color: var(--danger); cursor: pointer; z-index: 10;"><i class="fa-solid fa-trash" style="font-size: 14px;"></i></button>` : '';

        stockListDiv.innerHTML += `
        <div class="stock-card" style="border-left: 5px solid ${totalPairs > 5 ? 'var(--primary)' : (totalPairs > 0 ? 'var(--warning)' : 'var(--danger)')};">
            ${delBtn}
            <div style="display:flex; justify-content:space-between; align-items:center; padding-right: 35px;">
                <h4>[${esc(art.article_no)}] ${esc(art.name) || 'Unnamed'} ${alertBadge}</h4>
            </div>
            <p style="margin:0 0 15px 0; font-size:13px; color:var(--text-muted); font-weight: 600;">${esc(art.category)}</p>
            <div style="display:flex; justify-content:flex-end; margin-bottom: 10px;">
                 <span style="background:var(--primary); padding:6px 12px; border-radius:8px; font-size:13px; font-weight:800; color:white; box-shadow: 0 2px 5px rgba(59, 130, 246, 0.3);">Total: ${totalPairs}</span>
            </div>
            ${colorHtml || '<p style="font-size:14px; color:var(--danger); font-weight: bold;">Out of Stock</p>'}
        </div>`;
    });
}

async function searchStockArticle() {
    const searchTerm = document.getElementById('stockSearch').value.trim().toLowerCase();
    const stockListDiv = document.getElementById('stockList');
    if(!searchTerm) { loadMyStockList(); return; }
    const { data: articles } = await supabaseClient.from('articles').select(`id, article_no, name, category, stock_batches (color, size, remaining_qty)`).eq('shop_id', currentShopId);
    let filtered = articles.filter(art => (art.article_no && art.article_no.toLowerCase().includes(searchTerm)) || (art.name && art.name.toLowerCase().includes(searchTerm)));
    stockListDiv.innerHTML = ''; 
    if(filtered.length === 0) { stockListDiv.innerHTML = '<p style="font-size: 14px; color: var(--text-muted); text-align: center; padding: 20px;">No articles found.</p>'; return; }

    filtered.forEach(art => {
        let totalPairs = 0;
        let groupedByColor = {};
        if(art.stock_batches) {
            art.stock_batches.forEach(b => {
                totalPairs += b.remaining_qty;
                if(b.remaining_qty > 0) {
                    let c = b.color || ''; 
                    if(c === 'Default') c = '';
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
                sizesHtml += `<span class="size-badge">S${size}: ${groupedByColor[color][size]}</span>`; 
            });
            let colorTitle = (color === '') ? '' : `<span class="color-title"><i class="fa-solid fa-palette"></i> ${esc(color)}</span>`;
            colorHtml += `<div class="color-group-display">${colorTitle}<div>${sizesHtml}</div></div>`;
        }
        stockListDiv.innerHTML += `
        <div class="stock-card" style="border-left: 5px solid ${totalPairs > 5 ? 'var(--primary)' : (totalPairs > 0 ? 'var(--warning)' : 'var(--danger)')};">
            <div style="display:flex; justify-content:space-between; align-items:center; padding-right: 35px;">
                <h4>[${esc(art.article_no)}] ${esc(art.name) || 'Unnamed'}</h4>
            </div>
            <p style="margin:0 0 15px 0; font-size:13px; color:var(--text-muted); font-weight: 600;">${esc(art.category)}</p>
            <div style="display:flex; justify-content:flex-end; margin-bottom: 10px;">
                 <span style="background:var(--primary); padding:6px 12px; border-radius:8px; font-size:13px; font-weight:800; color:white; box-shadow: 0 2px 5px rgba(59, 130, 246, 0.3);">Total: ${totalPairs}</span>
            </div>
            ${colorHtml || '<p style="font-size:14px; color:var(--danger); font-weight: bold;">Out of Stock</p>'}
        </div>`;
    });
}

async function deleteArticle(articleId) {
    if(isStaffMode) return;
    showToast("Deleting...", false);
    const { error } = await supabaseClient.from('articles').delete().eq('id', articleId);
    if(error) { showToast("Error deleting: " + error.message, true); } 
    else { showToast("Article Deleted! 🗑️", false); loadMyStockList(); loadDashboardData(); }
}

function updateArticleTypes() {
    const gender = document.getElementById('artGender').value;
    const typeSelect = document.getElementById('artType');
    typeSelect.innerHTML = '';
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

    const gender = document.getElementById('artGender').value;
    const type = document.getElementById('artType').value;
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
    document.getElementById('artNo').value = ""; document.getElementById('artName').value = "";
    document.getElementById('colorContainer').innerHTML = ''; addColorSection();
    switchTab('stock');
}

async function searchSaleArticle() {
    const artNo = document.getElementById('saleArtNo').value;
    if(!artNo) return;
    const { data: articles, error } = await supabaseClient.from('articles').select(`id, article_no, name, category, mrp, cost_price, stock_batches (color, size, remaining_qty)`).eq('shop_id', currentShopId).eq('article_no', artNo).single();
    if (error || !articles) { showToast("Article not found!", true); document.getElementById('saleArticleDetails').style.display = 'none'; return; }

    foundSaleArticle = articles;
    document.getElementById('saleArtName').innerText = `[${articles.article_no}] ${articles.name}`;
    const sizeSelect = document.getElementById('saleSize');
    sizeSelect.innerHTML = '';
    let aggregatedStock = {};
    articles.stock_batches.forEach(batch => {
        if(batch.remaining_qty > 0) {
            let c = batch.color || ''; 
            if (c === 'Default') c = ''; 
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
    if(!hasStock) { showToast("Out of stock!", true); return; }
    document.getElementById('salePrice').value = articles.mrp || 0;
    document.getElementById('saleQty').value = 1;
    document.getElementById('saleArticleDetails').style.display = 'block';
}

function addToCart() {
    const colorSizeStr = document.getElementById('saleSize').value;
    if(!colorSizeStr) return;
    const parts = colorSizeStr.split('|||');
    const color = parts[0]; 
    const size = parts[1];
    const qty = parseInt(document.getElementById('saleQty').value);
    const price = parseInt(document.getElementById('salePrice').value);
    if(qty <= 0) { showToast("Quantity must be at least 1", true); return; }

    let totalAvailableForSize = foundSaleArticle.stock_batches.filter(b => { 
        let bColor = b.color || ''; if (bColor === 'Default') bColor = ''; 
        return bColor === color && String(b.size).trim() === size; 
    }).reduce((sum, b) => sum + b.remaining_qty, 0);
    
    const inCartQty = cart.filter(c => { 
        let cColor = c.color || ''; if (cColor === 'Default') cColor = ''; 
        return c.id === foundSaleArticle.id && c.size === size && cColor === color; 
    }).reduce((sum, item) => sum + item.qty, 0);
    
    if((inCartQty + qty) > totalAvailableForSize) { showToast("Not enough stock!", true); return; }

    cart.push({ id: foundSaleArticle.id, artNo: foundSaleArticle.article_no, color: color, size: size, qty: qty, price: price, cost: foundSaleArticle.cost_price || 0 });
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

async function confirmSale() {
    if(cart.length === 0) { showToast("Cart is empty!", true); return; }
    let subTotal = 0;
    cart.forEach(item => { subTotal += (item.qty * item.price); });
    let discount = parseInt(document.getElementById('saleDiscount').value) || 0;
    if(discount < 0) { showToast("Discount cannot be negative!", true); return; }
    if(discount >= subTotal) { showToast("Discount cannot be greater than Subtotal!", true); return; }
    const btn = document.getElementById('confirmSaleBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    try {
        const items = cart.map(i => ({ article_id: i.id, size: String(i.size), qty: i.qty, price: i.price, cost: i.cost || 0, color: i.color || '' }));
        const { error } = await supabaseClient.rpc('confirm_sale', { p_discount: discount, p_items: items });
        if (error) throw error;
        cart = [];
        document.getElementById('saleDiscount').value = 0;
        renderCart();
        showToast("Sale Confirmed! 🎉", false);
        switchTab(isStaffMode ? 'history' : 'dashboard');
    } catch (err) { showToast("Error: " + err.message, true); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Confirm Sale'; }
}

async function searchPurchaseArticle() {
    const artNo = document.getElementById('purArtNo').value;
    if(!artNo) return;
    const { data: articles, error } = await supabaseClient.from('articles').select(`id, article_no, name, cost_price, stock_batches (color, size)`).eq('shop_id', currentShopId).eq('article_no', artNo).single();
    if (error || !articles) { showToast("Article not found!", true); document.getElementById('purArticleDetails').style.display = 'none'; return; }
    foundPurchaseArticle = articles;
    document.getElementById('purArtName').innerText = `[${articles.article_no}] ${articles.name}`;
    const colorSelect = document.getElementById('purColor');
    colorSelect.innerHTML = '';
    let uniqueColors = new Set();
    articles.stock_batches.forEach(batch => { let c = batch.color || ''; if (c === 'Default') c = ''; uniqueColors.add(c); });
    uniqueColors.forEach(color => { let displayColor = (color === '') ? 'No Color' : color; colorSelect.innerHTML += `<option value="${esc(color)}">${esc(displayColor)}</option>`; });
    updatePurchaseSizes();
    document.getElementById('purCost').value = articles.cost_price || 0;
    document.getElementById('purArticleDetails').style.display = 'block';
}

function updatePurchaseSizes() {
    const color = document.getElementById('purColor').value;
    const sizeSelect = document.getElementById('purSize');
    sizeSelect.innerHTML = '';
    let uniqueSizes = new Set();
    foundPurchaseArticle.stock_batches.forEach(batch => { let bColor = batch.color || ''; if (bColor === 'Default') bColor = ''; if(bColor === color) uniqueSizes.add(String(batch.size).trim()); });
    uniqueSizes.forEach(size => { sizeSelect.innerHTML += `<option value="${esc(size)}">Size ${esc(size)}</option>`; });
}

async function processPurchase() {
    const color = document.getElementById('purColor').value;
    const size = document.getElementById('purSize').value;
    const qty = parseInt(document.getElementById('purQty').value);
    const cost = parseInt(document.getElementById('purCost').value) || 0;
    const supplier = document.getElementById('purSupplier').value;
    if(!size || !qty || qty <= 0) { showToast("Invalid details!", true); return; }

    let query = supabaseClient.from('stock_batches').select('id, remaining_qty, initial_qty').eq('shop_id', currentShopId).eq('article_id', foundPurchaseArticle.id).eq('size', size);
    if(color && color !== 'Default') { query = query.eq('color', color); } else { query = query.or('color.is.null,color.eq.Default,color.eq.'); }
    
    const { data: existingBatch } = await query.limit(1).maybeSingle();

    if (existingBatch) {
        await supabaseClient.from('stock_batches').update({ 
            remaining_qty: existingBatch.remaining_qty + qty,
            initial_qty: existingBatch.initial_qty + qty 
        }).eq('id', existingBatch.id);
    } else {
        await supabaseClient.from('stock_batches').insert([{ shop_id: currentShopId, article_id: foundPurchaseArticle.id, size: size, color: color, initial_qty: qty, remaining_qty: qty, cost_price: cost }]);
    }

    await supabaseClient.from('purchases').insert([{ shop_id: currentShopId, article_id: foundPurchaseArticle.id, size: size, quantity: qty, cost_price: cost, supplier_name: supplier }]);
    showToast(`✅ Added ${qty} pairs to stock!`, false);
    document.getElementById('purArticleDetails').style.display = 'none';
    document.getElementById('purArtNo').value = '';
    document.getElementById('purSupplier').value = '';
}

async function saveExpense() {
    const reason = document.getElementById('expReason').value;
    const amount = parseInt(document.getElementById('expAmount').value);
    if(!reason || !amount || amount <= 0) { showToast("Enter valid reason and amount!", true); return; }
    showToast("Saving expense...", false);
    try {
        const { error } = await supabaseClient.from('expenses').insert([{ shop_id: currentShopId, reason: reason, amount: amount }]);
        if (error) throw error;
        showToast("Expense Saved! 💸", false);
        document.getElementById('expReason').value = ''; document.getElementById('expAmount').value = '';
        switchTab('dashboard');
    } catch (err) { showToast("Error: " + err.message, true); }
}

async function searchReturnArticle() {
    const artNo = document.getElementById('retArtNo').value;
    if(!artNo) return;
    const { data: articles, error } = await supabaseClient.from('articles').select(`id, article_no, name, cost_price, mrp, stock_batches (color, size)`).eq('shop_id', currentShopId).eq('article_no', artNo).single();
    if (error || !articles) { showToast("Article not found!", true); document.getElementById('retArticleDetails').style.display = 'none'; return; }
    foundReturnArticle = articles;
    document.getElementById('retArtName').innerText = `[${articles.article_no}] ${articles.name}`;
    const sizeSelect = document.getElementById('retSize');
    sizeSelect.innerHTML = '';
    let uniqueColorSizes = new Set();
    articles.stock_batches.forEach(batch => { let c = batch.color || ''; if (c === 'Default') c = ''; uniqueColorSizes.add(`${c}|||${String(batch.size).trim()}`); });
    uniqueColorSizes.forEach(val => { const parts = val.split('|||'); const c = parts[0]; const s = parts[1]; let displayColor = (c === '') ? '' : `${c} - `; sizeSelect.innerHTML += `<option value="${esc(val)}">${esc(displayColor)}Size ${esc(s)}</option>`; });
    document.getElementById('retQty').value = 1;
    document.getElementById('retPrice').value = articles.mrp || 0;
    document.getElementById('retArticleDetails').style.display = 'block';
}

async function processReturn() {
    const parts = document.getElementById('retSize').value.split('|||');
    const color = parts[0], size = parts[1];
    const qty = parseInt(document.getElementById('retQty').value);
    const refund = parseInt(document.getElementById('retPrice').value) || 0;
    if(!size || !qty || qty <= 0) { showToast("Invalid details!", true); return; }
    if(refund <= 0) { showToast("Refund रक्कम टाका!", true); return; }
    const { error } = await supabaseClient.rpc('process_return', { p_article: String(foundReturnArticle.id), p_color: color || '', p_size: String(size), p_qty: qty, p_refund: refund });
    if (error) { showToast("Error: " + error.message, true); return; }
    showToast(`✅ Return done! Stock +${qty}`, false);
    document.getElementById('retArticleDetails').style.display = 'none';
    document.getElementById('retArtNo').value = '';
    switchTab('history');
}

// ---------- History ----------
let histFilter = 'all';
function setHistFilter(f, el) {
    histFilter = f;
    document.querySelectorAll('#historyScreen .hist-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    loadHistory();
}
function delBtn(kind, id) {
    return isStaffMode ? '' : `<button class="hist-del" onclick="deleteHistory('${kind}','${id}')"><i class="fa-solid fa-trash"></i></button>`;
}
function deleteHistory(kind, id) {
    const msg = kind === 'sale' ? 'हे बिल delete करायचं? (stock परत जमा होईल)' : kind === 'return' ? 'ही return नोंद delete करायची? (stock कमी होईल)' : 'हा खर्च delete करायचा?';
    askConfirm(msg, async () => {
        const fn = { sale: 'delete_sale', return: 'delete_return', expense: 'delete_expense' }[kind];
        const { error } = await supabaseClient.rpc(fn, { p_id: String(id) });
        if (error) { showToast('Error: ' + error.message, true); return; }
        showToast('Deleted ✅', false);
        loadHistory();
    });
}
function clearHistory() {
    const dateEl = document.getElementById('histDate');
    const d = (dateEl && dateEl.value) || localDateStr(new Date());
    askConfirm(`${d} ची सगळी History (Sales, Returns, Expenses) delete करायची? Stock बदलणार नाही.`, async () => {
        const r = dayRange(d);
        const { error } = await supabaseClient.rpc('clear_history', { p_from: r[0], p_to: r[1] });
        if (error) { showToast('Error: ' + error.message, true); return; }
        showToast('History cleared ✅', false);
        switchTab('history');
    });
}
function fmtTime(iso) { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); }
async function loadHistory() {
    const dateEl = document.getElementById('histDate');
    if(!dateEl.value) dateEl.value = localDateStr(new Date());
    const list = document.getElementById('historyList');
    list.innerHTML = '<div class="hist-empty"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    const r = dayRange(dateEl.value);
    const { data, error } = await supabaseClient.rpc('get_history', { p_from: r[0], p_to: r[1] });
    if (error) { list.innerHTML = `<div class="hist-empty">Error: ${esc(error.message)}</div>`; return; }
    const sales = data.sales || [], rets = data.returns || [], exps = data.expenses || [];
    let sTotal = 0, rTotal = 0, eTotal = 0;
    sales.forEach(s => sTotal += s.total_amount); rets.forEach(x => rTotal += x.refund_amount); exps.forEach(x => eTotal += x.amount);
    document.getElementById('histSales').innerText = '₹' + sTotal;
    document.getElementById('histReturns').innerText = '₹' + rTotal;
    document.getElementById('histNet').innerText = '₹' + (sTotal - rTotal - eTotal);

    let rows = [];
    sales.forEach(s => rows.push({ t: s.sale_date, type: 'sale', html: `
        <div class="hist-card sale"><div class="hist-head"><span class="hist-badge sale"><i class="fa-solid fa-bag-shopping"></i> Sale</span><span class="hist-right"><span class="hist-time">${fmtTime(s.sale_date)}</span>${delBtn('sale', s.id)}</span></div>
        ${(s.items||[]).length ? '' : '<div class="hist-line muted"><span>⚠ जुनं अर्धवट बिल (items नाहीत) — delete करा</span></div>'}
        ${(s.items||[]).map(i => `<div class="hist-line"><span>[${esc(i.article_no)}] ${esc(i.name||'')} • S${esc(i.size)} × ${i.qty}</span><b>₹${i.qty * i.price}</b></div>`).join('')}
        ${s.discount_amount > 0 ? `<div class="hist-line muted"><span>Discount</span><b>-₹${s.discount_amount}</b></div>` : ''}
        <div class="hist-total"><span>Total</span><b class="pos">+₹${s.total_amount}</b></div></div>` }));
    rets.forEach(x => rows.push({ t: x.return_date, type: 'return', html: `
        <div class="hist-card ret"><div class="hist-head"><span class="hist-badge ret"><i class="fa-solid fa-rotate-left"></i> Return</span><span class="hist-right"><span class="hist-time">${fmtTime(x.return_date)}</span>${delBtn('return', x.id)}</span></div>
        <div class="hist-line"><span>[${esc(x.article_no||'-')}] ${esc(x.name||'')} • S${esc(x.size)} × ${x.quantity}</span><b class="warn">-₹${x.refund_amount}</b></div>
        <div class="hist-line muted"><span>Stock +${x.quantity} जोडी परत जमा</span></div></div>` }));
    exps.forEach(x => rows.push({ t: x.expense_date, type: 'expense', html: `
        <div class="hist-card exp"><div class="hist-head"><span class="hist-badge exp"><i class="fa-solid fa-money-bill-transfer"></i> Expense</span><span class="hist-right"><span class="hist-time">${fmtTime(x.expense_date)}</span>${delBtn('expense', x.id)}</span></div>
        <div class="hist-line"><span>${esc(x.reason)}</span><b class="neg">-₹${x.amount}</b></div></div>` }));
    rows = rows.filter(x => histFilter === 'all' || x.type === histFilter).sort((a, b) => new Date(b.t) - new Date(a.t));
    list.innerHTML = rows.length ? rows.map(x => x.html).join('') : '<div class="hist-empty"><i class="fa-regular fa-folder-open"></i><p>या दिवशी काहीही नोंद नाही</p></div>';
}

async function downloadExcel() {
    if(!currentShopId) return;
    const { data: allData } = await supabaseClient.from('sales').select(`sale_date, total_amount, total_profit, sale_items (quantity, size, selling_price, articles(article_no, name))`).eq('shop_id', currentShopId).order('sale_date', { ascending: false });
    let excelData = [];
    if(allData) {
        allData.forEach(s => {
            if(s.sale_items) {
                s.sale_items.forEach(item => {
                    excelData.push({ Date: new Date(s.sale_date).toLocaleDateString(), "Article No": item.articles.article_no, "Name": item.articles.name, "Size": item.size, "Qty": item.quantity, "Total Amount": s.total_amount, "Profit": s.total_profit });
                });
            }
        });
    }
    if(excelData.length === 0) { showToast("No data to export!", true); return; }
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Report");
    XLSX.writeFile(wb, "Sales_Report.xlsx");
    showToast("Excel Downloaded! 📥", false);
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    isStaffMode = false;
    currentShopId = null;
    cart = [];
    localStorage.removeItem('isStaff'); 
    document.getElementById('topHeader').style.display = 'none';
    document.getElementById('bottomNav').style.display = 'none';
    document.getElementById('superAdminScreen').style.display = 'none';
    switchTab(''); 
    document.getElementById('loginScreen').style.display = 'block'; 
    document.getElementById('nav-dash').style.display = 'flex';
    let navMore = document.getElementById('nav-more');
    navMore.setAttribute('onclick', 'toggleSidebar()');
    navMore.innerHTML = '<i class="fa-solid fa-bars nav-icon"></i> Menu';
    document.getElementById('nav-stock').style.display = 'flex';
    document.getElementById('nav-sale').style.display = 'flex';
}

async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) { 
        currentUser = session.user; 
        if (currentUser.email === ADMIN_EMAIL) {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('topHeader').style.display = 'none'; 
            document.getElementById('superAdminScreen').style.display = 'block';
            document.getElementById('bottomNav').style.display = 'none';
            loadSuperAdminData();
        } else {
            const { data: shop } = await supabaseClient.from('shops').select('*').eq('auth_email', currentUser.email).single();
            if(shop) {
                if (shop.status !== 'active' || !shop.expiry_date || new Date() > new Date(shop.expiry_date)) {
                    await supabaseClient.auth.signOut();
                    showToast("Subscription expired / inactive! Contact Admin.", true);
                    return;
                }
                currentShopId = shop.id;
                document.getElementById('headerShopName').innerText = shop.shop_name;
                isStaffMode = localStorage.getItem('isStaff') === 'true'; 
                showOwnerDashboard(); 
            }
        }
    }
}

// ---------- PWA ----------
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW error', err));
    });
}
