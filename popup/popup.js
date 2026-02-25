// Parse date string "DD Mon YYYY" to Date object
function parseDate(dateStr) {
  if (!dateStr) return new Date('Invalid');

  const cleaned = dateStr.split(',')[0].trim(); // buang jam
  return new Date(`${cleaned} 00:00:00`);
}

// Format date for display
function formatDate(date) {
  return new Date(date).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

// Calculate urgency level based on days until deadline
function getUrgencyLevel(dueDate) {
  const now = new Date();
  const due = parseDate(dueDate);
  if (isNaN(due)) return 'normal';

  const diffHours = (due - now) / (1000 * 60 * 60);

  if (diffHours < 24 || diffHours < 0) return 'urgent';
  return 'normal';
}

// Load orders from Chrome storage
async function loadOrders() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['orders'], (result) => {
      resolve(result.orders || {});
    });
  });
}

// Render orders list
async function renderOrders({
    // filterOrderId = '', 
    filterCustomer = '',
    filterDate = '',
    filterStatus = '',
    filterUrgency = ''
 } = {}) {
  const orders = await loadOrders();
  const orderList = document.getElementById('orderList');
  orderList.innerHTML = '';

  // Convert to array and sort by due date (most urgent first)
  let orderArray = Object.values(orders).map(order => ({
    ...order,
    urgencyLevel: getUrgencyLevel(order.dueDate),
    dueDateObj: parseDate(order.dueDate)
  }));

  console.log(orderArray)
  // Sort by due date (closest first)
  orderArray.sort((a, b) => a.dueDateObj - b.dueDateObj);
  function normalizeDate(dateStr) {
    if (!dateStr) return '';
    return dateStr.split(',')[0].trim(); // buang jam
  }

  // Apply filters

    orderArray = orderArray.filter(order => {
      // const matchesOrderId =
      //   !filterOrderId || order.orderId.includes(filterOrderId);

      const matchesCustomer = !filterCustomer || 
        (order.customerName && order.customerName.toLowerCase().includes(filterCustomer.toLowerCase()));

      const matchesDate =
        !filterDate || normalizeDate(order.dueDate) === filterDate;

      const matchesStatus =
        !filterStatus || order.status === filterStatus;

      const matchesUrgency =
        !filterUrgency || order.urgencyLevel === filterUrgency;

      return (
        // matchesOrderId &&
        matchesCustomer &&
        matchesDate &&
        matchesStatus &&
        matchesUrgency
      );
    });

  // Render filtered and sorted orders
  orderArray.forEach((order) => {
    const li = document.createElement('li');
    li.className = `card ${order.urgencyLevel}`;
    // li.dataset.orderId = order.orderId;
    li.dataset.customerName = order.customerName;

    li.innerHTML = `
      <div class="card_desc">
        <div class="no_pesanan">${order.orderId}</div>
        <div class="no_pesanan">${order.customerName}</div>
        <div class="due_date">${order.dueDate}</div>
        <div class="status ${order.urgencyLevel}">${order.status}</div>
      </div>

      <div class="card_btn">
        <div class="card_btn_visit">
          <a href="${order.url}" target="_blank">
            <img src="../assets/link_ext_black.png" alt="">
          </a>
        </div>
        <div class="card_btn_delete">
          <button class="delete-btn" data-order-id="${order.orderId}" style="background: none; border: none; cursor: pointer; padding: 4px;">
            <img src="../assets/delete.png" alt="">
          </button>
        </div>
      </div>
    `;

    orderList.appendChild(li);


  });

  // Attach delete listeners
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteOrder(btn.dataset.orderId);
    });
  });

}

// Delete order from storage
async function deleteOrder(orderId) {
  const orders = await loadOrders();
  delete orders[orderId];

  chrome.storage.local.set({ orders }, () => {
    renderOrders();
  });
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // const searchInputOrderId = document.querySelector('.search input[type="text"]');
  const searchInputCustomer = document.querySelector('.search input[type="text"]');
  const searchInputDate = document.querySelector('.search input[type="date"]');
  const statusPicker = document.getElementById('status_picker');
  const urgencyPicker = document.getElementById('urgency_picker');

  const addBtn = document.querySelector('.btn_add');

  // Load and render orders on popup open
  renderOrders();

  function applyFilters() {
    renderOrders({
      // filterOrderId: searchInputOrderId.value,
      filterCustomer: searchInputCustomer.value,
      filterDate: searchInputDate.value
        ? formatDateForInput(searchInputDate.value)
        : '',
      filterStatus: statusPicker.value,
      filterUrgency: urgencyPicker.value
    });
  }
  // searchInputOrderId?.addEventListener('input', applyFilters);
  searchInputCustomer?.addEventListener('input', applyFilters);
  searchInputDate?.addEventListener('change', applyFilters);
  statusPicker?.addEventListener('change', applyFilters);
  urgencyPicker?.addEventListener('change', applyFilters);


  // Add button functionality - scrape from current page
  addBtn?.addEventListener('click', () => {
    console.log('[POPUP] Add button clicked');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {

      // ❌ 1. Tidak ada tab aktif
      if (!tabs || !tabs.length) {
        console.error('[ERROR][TAB] No active tab found');
        alert('Error: Tidak ada tab aktif');
        return;
      }

      const tab = tabs[0];

      // ❌ 2. URL bukan INAPROC
      // if (!tab.url || !tab.url.includes('penyedia.inaproc.id/negotiation') || !tab.url.includes('penyedia.inaproc.id/order')) {
      if (!tab.url || !tab.url.includes('penyedia.inaproc.id/')) {
        console.error('[ERROR][URL] Invalid page:', tab.url);
        alert('Error: Halaman bukan detail pesanan INAPROC');
        return;
      }

      console.log('[POPUP] Active tab:', tab.id, tab.url);

      chrome.tabs.sendMessage(
        tab.id,
        { type: 'GET_PAGE_DATA' },
        (response) => {

          // ❌ 3. Gagal kirim message
          if (chrome.runtime.lastError) {
            console.error(
              '[ERROR][SEND_MESSAGE]',
              chrome.runtime.lastError.message
            );
            alert('Error: Content script tidak aktif di halaman ini');
            return;
          }

          // ❌ 4. Content tidak membalas
          if (!response) {
            console.error('[ERROR][RESPONSE] No response from content');
            alert('Error: Tidak ada respon dari halaman');
            return;
          }

          // ❌ 5. orderData null
          if (!response.orderData) {
            console.error('[ERROR][DATA] orderData is null', response);
            alert('Error: Data pesanan tidak ditemukan di halaman');
            return;
          }

          console.log('[SUCCESS] Order data received:', response.orderData);

          chrome.runtime.sendMessage({
            type: 'ADD_ORDER',
            payload: response.orderData
          });

          setTimeout(() => renderOrders(), 500);
        }
      );
    });
  });


  // Listen for storage changes to update list in real-time
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.orders) {
      applyFilters();
    }
  });
});

// Convert input date format (YYYY-MM-DD) to display format (DD Mon YYYY)
function formatDateForInput(inputDate) {
  const date = new Date(inputDate + 'T00:00:00');
  const day = String(date.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}
