const dayjs = require('dayjs');

// แผนที่ชื่อเดือนไทย (เต็มและย่อ) -> เลขเดือน
const THAI_MONTHS = {
  'มกราคม': 1, 'ม.ค.': 1, 'มค': 1,
  'กุมภาพันธ์': 2, 'ก.พ.': 2, 'กพ': 2,
  'มีนาคม': 3, 'มี.ค.': 3, 'มีค': 3,
  'เมษายน': 4, 'เม.ย.': 4, 'เมย': 4,
  'พฤษภาคม': 5, 'พ.ค.': 5, 'พค': 5,
  'มิถุนายน': 6, 'มิ.ย.': 6, 'มิย': 6,
  'กรกฎาคม': 7, 'ก.ค.': 7, 'กค': 7,
  'สิงหาคม': 8, 'ส.ค.': 8, 'สค': 8,
  'กันยายน': 9, 'ก.ย.': 9, 'กย': 9,
  'ตุลาคม': 10, 'ต.ค.': 10, 'ตค': 10,
  'พฤศจิกายน': 11, 'พ.ย.': 11, 'พย': 11,
  'ธันวาคม': 12, 'ธ.ค.': 12, 'ธค': 12,
};

// คำวันที่แบบสัมพัทธ์ -> จำนวนวันที่บวกจากวันนี้
// เรียงจากยาวไปสั้น เพื่อกันจับคำผิด (เช่น "มะรืนนี้" ต้องเจอก่อน "รืนนี้")
const RELATIVE_DAYS = [
  ['มะรืนนี้', 2],
  ['มะรืน', 2],
  ['พรุ่งนี้', 1],
  ['วันนี้', 0],
];

function toGregorianYear(y) {
  if (y > 2400) return y - 543; // ปี พ.ศ. -> ค.ศ.
  if (y < 100) return 2000 + y; // ปีย่อ 2 หลัก
  return y;
}

/**
 * พยายามหา "วันที่" จากข้อความ โดยไม่แก้ไขข้อความต้นฉบับ
 * คืนค่า { dateKey: 'YYYY-MM-DD', displayDate: 'DD/MM/YYYY' } หรือ null ถ้าหาไม่เจอ
 */
function parseOrderMessage(text) {
  const now = dayjs();

  // 1) คำวันที่แบบสัมพัทธ์ เช่น พรุ่งนี้ / มะรืนนี้ / วันนี้
  for (const [word, offset] of RELATIVE_DAYS) {
    if (text.includes(word)) {
      const d = now.add(offset, 'day');
      return { dateKey: d.format('YYYY-MM-DD'), displayDate: d.format('DD/MM/YYYY') };
    }
  }

  // 2) รูปแบบ dd/mm หรือ dd/mm/yyyy (หรือใช้ - แทน /)
  let m = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = m[3] ? toGregorianYear(parseInt(m[3], 10)) : now.year();
    if (month >= 1 && month <= 12) {
      const d = dayjs(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      if (d.isValid()) return { dateKey: d.format('YYYY-MM-DD'), displayDate: d.format('DD/MM/YYYY') };
    }
  }

  // 3) รูปแบบ "วันที่ เดือน (ปี)" เช่น "20 กันยายน" หรือ "20 ก.ย. 2569"
  const monthNames = Object.keys(THAI_MONTHS).sort((a, b) => b.length - a.length).join('|');
  const re = new RegExp(`(\\d{1,2})\\s*(${monthNames})\\s*(\\d{2,4})?`);
  m = text.match(re);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = THAI_MONTHS[m[2]];
    const year = m[3] ? toGregorianYear(parseInt(m[3], 10)) : now.year();
    const d = dayjs(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    if (d.isValid()) return { dateKey: d.format('YYYY-MM-DD'), displayDate: d.format('DD/MM/YYYY') };
  }

  return null;
}

module.exports = { parseOrderMessage };
