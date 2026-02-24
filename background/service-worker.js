chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'ORDER_SCRAPED') {
    saveOrUpdateOrder(msg.payload);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ADD_ORDER') {
    chrome.storage.local.get(['orders'], res => {
      const orders = res.orders || {};
      saveOrUpdateOrder(msg.payload)

      chrome.storage.local.set({ orders }, () => {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('assets/icon48.png'),
          title: 'INAMINDER',
          message: 'Pesanan berhasil ditambahkan: ' + msg.payload.orderId
        });
        sendResponse({ success: true });
      });
    });
    return true;
  }
});

function convertNegotiationToOrderUrl(order) {
  if (!order.url) return order.url;

  const isNegotiation = order.url.includes('/negotiation/');
  const rawId = order.orderId?.replace('EP-', '');

  if (!rawId) return order.url;

  // jika sudah masuk ORDER context ATAU status sudah terbuat
  const status = order.status?.toLowerCase() || '';
  const shouldConvert =
    status.includes('terbuat') ||
    order.context === 'ORDER';

  if (!shouldConvert) return order.url;
  if (!isNegotiation) return order.url;

  try {
    const urlObj = new URL(order.url);
    const orderKey = urlObj.searchParams.get('orderKey');

    if (!orderKey) return order.url;

    return `https://penyedia.inaproc.id/order/detail?id=${rawId}&orderKey=${orderKey}`;
  } catch {
    return order.url;
  }
}



function saveOrUpdateOrder(order) {
  if (!order || !order.orderId) return;

  chrome.storage.local.get(['orders'], (res) => {
    const orders = res.orders || {};
    const prev = orders[order.orderId];

    // notif perubahan status
    if (prev && prev.status !== order.status) {
      notifyStatusChange(order);
    }

    const convertedUrl = convertNegotiationToOrderUrl(order);
    // merge state lama (penting untuk _notified)
    orders[order.orderId] = {
      ...prev,
      ...order,
      url: convertedUrl
    };

    // urgent logic
    if (isUrgent(orders[order.orderId]) && !orders[order.orderId]._notified) {
      showUrgentNotification(order);
      orders[order.orderId]._notified = true;
    }

    // hitung badge
    const urgentCount = countUrgentOrders(orders);

    chrome.storage.local.set({ orders }, () => {
      updateBadge(urgentCount);
    });
  });
}


function notifyStatusChange(order) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('assets/icon48.png'),
    title: 'Status Pesanan Berubah',
    message: `${order.orderId}\nStatus: ${order.status}`
  });
}

function isUrgent(order) {
  if (!order.dueDate) return false;

  const now = new Date();
  const deadline = new Date(order.dueDate);

  if (isNaN(deadline)) return false;

  const diffHours = (deadline - now) / (1000 * 60 * 60);
  return diffHours <= 24 && diffHours > 0;
}


function countUrgentOrders(orders) {
  return Object.values(orders).filter(isUrgent).length;
}


function updateBadge(urgentCount) {
  if (urgentCount > 0) {
    chrome.action.setBadgeText({
      text: urgentCount.toString()
    });

    chrome.action.setBadgeBackgroundColor({
      color: '#d93025' // merah
    });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

function showUrgentNotification(order) {
  chrome.notifications.create(`urgent-${order.orderId}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('assets/icon48.png'),
    title: '⚠️ Pesanan URGENT',
    message: `Pesanan ${order.orderId} perlu segera direspons`,
    priority: 2
  });
}

// Saat service worker pertama kali dijalankan
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('checkUrgent', { periodInMinutes: 60 }); // setiap 60 menit
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkUrgent') {
    chrome.storage.local.get(['orders'], (res) => {
      const orders = res.orders || {};
      let updated = false;
      Object.values(orders).forEach(order => {
        if (isUrgent(order) && !order._notified) {
          showUrgentNotification(order);
          order._notified = true;
          updated = true;
        }
      });
      if (updated) {
        chrome.storage.local.set({ orders });
      }
    });
  }
});