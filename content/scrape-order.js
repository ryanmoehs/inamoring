// Fungsi untuk mengambil data dari halaman
function getOrderData() {
  // 1. Cari nomor pesanan (selalu diawali EP-)
  const orderNumber = [...document.querySelectorAll('span')]
    .find(el => el.innerText.startsWith('EP-'))
    ?.innerText;
  if (!orderNumber) return null;

  // 2. Ambil nama CC
let customer = '';
if (location.pathname.startsWith('/negotiation')) {
  const el = [...document.querySelectorAll('.mb-1.flex.items-start.justify-start.gap-2.text-tertiary500')]
    .find(el => el.innerText.startsWith('Satuan Kerja'));
  customer = el ? el.innerText.replace("Satuan Kerja\n:\n", "").trim() : "Tidak Ditemukan";
} else {
  // Untuk halaman order, pastikan selektor tepat. Contoh:
  const el = document.querySelectorAll('.text-caption-lg-semibold.text-tertiary500')[2];
  customer = el ? el.innerText.trim() : "Tidak Ditemukan";
}
  // 3. Ambil status yang benar (bukan chip "Berlangsung")
  let statusInfo = '';
  const chips = document.querySelectorAll('.Chips_chips__wLizu,.flex.items-center.gap-x-1 .Chips_chips__wLizu');
  for (let chip of chips) {
    const text = chip.innerText.trim();
    if (text && text !== 'Berlangsung') {
      statusInfo = text;
      // if (statusInfo == 'Selesai'){
      //     const statSelesai =  document.querySelectorAll('.flex.items-center.gap-x-1 .Chips_chips__wLizu')
      //     if (statSelesai[1].innerText == 'Menunggu Keputusan Pesanan'){
      //         statusInfo = 'Ditinjau PPK'
      //         break
      //     } else {
      //           statusInfo = "Selesai - " + statSelesai[1].innerText
      //         break
      //     }
      // }
      break
    }
  }
  // Fallback jika tidak ketemu: ambil chip kedua dari .flex.items-center.gap-x-1
  if (!statusInfo) {
    const statusContainer = document.querySelectorAll('.flex.items-center.gap-x-1')[1];
    if (statusContainer) {
      const chip = statusContainer.querySelector('.Chips_chips__wLizu');
      statusInfo = chip ? chip.innerText.trim() : statusContainer.innerText.trim();
    }
  }

  // Ubah "Menunggu Keputusan Pesanan" menjadi "Ditinjau PPK"
  if (statusInfo === 'Menunggu Keputusan Pesanan') {
    statusInfo = 'Ditinjau PPK';
  }

  // 3. Ambil deadline lengkap (format: "25 Feb 2026, 16:59 UTC")
  const deadlineMatch = document.body.innerText.match(
    /\d{2}\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{4},\s\d{2}:\d{2}\s\w+/
  );
  const dueDate = deadlineMatch ? deadlineMatch[0] : '--';

  return {
    orderId: orderNumber,
    customerName: customer,
    status: statusInfo || 'Unknown',
    dueDate: dueDate,
    url: location.href,
    context: location.pathname.startsWith('/negotiation') ? 'NEGOSIASI' : 'ORDER',
    lastChecked: Date.now()
  };
}

// Kirim data saat halaman dimuat (otomatis)
chrome.runtime.sendMessage({
  type: 'ORDER_SCRAPED',
  payload: getOrderData()
});

// Tangani permintaan dari popup (tombol "Tambah Halaman Ini")
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PAGE_DATA') {
    sendResponse({ orderData: getOrderData() });
  }
});