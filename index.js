const express = require('express');
const line = require('@line/bot-sdk');
const cron = require('node-cron');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
const { parseOrderMessage } = require('./dateParser');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const GROUP_ID = process.env.GROUP_ID; // ใส่หลังจากรู้ Group ID แล้ว (ดูวิธีหาใน README)
const DATA_FILE = path.join(__dirname, 'data', 'orders.json');

const app = express();
const client = new line.Client(config);

// ---------- จัดการไฟล์ข้อมูลออเดอร์ ----------
function loadOrders() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveOrder(dateKey, rawText) {
  const orders = loadOrders();
  if (!orders[dateKey]) orders[dateKey] = [];
  orders[dateKey].push(rawText); // เก็บข้อความต้นฉบับเป๊ะๆ ไม่แก้ไขเนื้อหา
  fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2), 'utf8');
}

function clearOrdersForDate(dateKey) {
  const orders = loadOrders();
  delete orders[dateKey];
  fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2), 'utf8');
}

// ---------- Webhook จาก LINE ----------
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  // log group id ไว้ตอนติดตั้งครั้งแรก เพื่อเอาไปใส่ env var GROUP_ID
  if (event.source && event.source.type === 'group') {
    console.log('Group ID:', event.source.groupId);
  }

  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const text = event.message.text.trim();

  // 1) คำสั่งบันทึกออเดอร์ใหม่: ต้องขึ้นต้นด้วย "ออเดอร์"
  if (text.startsWith('ออเดอร์')) {
    const result = parseOrderMessage(text);

    if (!result) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'ไม่พบวันที่ในข้อความค่ะ กรุณาระบุวันที่ด้วย เช่น\n"ออเดอร์ เค้กช็อคโกแลต พรุ่งนี้"\n"ออเดอร์ คุกกี้ 20/9"',
      });
    }

    saveOrder(result.dateKey, text);

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `บันทึกออเดอร์แล้วค่ะ ✅ (วันที่ ${result.displayDate})`,
    });
  }

  // 2) คำถามเกี่ยวกับออเดอร์ที่กำลังจะมาถึง เช่น
  //    "พรุ่งนี้มีออเดอร์อะไรไหม", "วันที่ 13 มีงานอะไรบ้าง", "เช็คออเดอร์วันนี้"
  //    ถามได้ทุกเวลา ไม่ต้องรอถึง 8 โมงเช้า
  if (isOrderQuery(text)) {
    const parsed = parseOrderMessage(text);
    const dateObj = parsed ? dayjs(parsed.dateKey) : dayjs(); // ถ้าไม่ได้ระบุวัน ให้ถือว่าถามถึงวันนี้
    const message = buildSummaryMessage(dateObj);
    return client.replyMessage(event.replyToken, { type: 'text', text: message });
  }

  return null;
}

// ตรวจว่าข้อความนี้เป็น "คำถาม" เกี่ยวกับออเดอร์/งานหรือไม่
// (ต้องมีคำที่บ่งบอกว่าเป็นคำถาม เช่น อะไร/บ้าง/ไหม/เช็ค ประกอบกับคำว่า ออเดอร์ หรือ งาน)
function isOrderQuery(text) {
  const asksSomething = /(อะไร|บ้าง|ไหม|เท่าไหร่|กี่|เช็ค)/.test(text);
  const mentionsOrderOrWork = text.includes('ออเดอร์') || text.includes('งาน');
  return asksSomething && mentionsOrderOrWork;
}

// ---------- สร้างข้อความสรุปของวันที่กำหนด ----------
function buildSummaryMessage(dateObj) {
  const dateKey = dateObj.format('YYYY-MM-DD');
  const displayDate = dateObj.format('DD/MM/YYYY');
  const todayKey = dayjs().format('YYYY-MM-DD');
  const dayLabel = dateKey === todayKey ? `วันนี้ (${displayDate})` : `วันที่ ${displayDate}`;
  const orders = loadOrders()[dateKey] || [];

  if (orders.length === 0) {
    return `📋 ${dayLabel} ไม่มีออเดอร์ค่ะ`;
  }

  const list = orders.map((o, i) => `${i + 1}. ${o}`).join('\n');
  return `📋 ออเดอร์${dayLabel}:\n\n${list}`;
}

// ---------- แจ้งเตือนอัตโนมัติทุกวัน 8:00 น. เวลาไทย ----------
cron.schedule(
  '0 8 * * *',
  async () => {
    if (!GROUP_ID) {
      console.log('ยังไม่ได้ตั้งค่า GROUP_ID จึงข้ามการแจ้งเตือนวันนี้');
      return;
    }
    try {
      const message = buildSummaryMessage(dayjs());
      await client.pushMessage(GROUP_ID, { type: 'text', text: message });
      console.log('ส่งแจ้งเตือน 8 โมงเช้าเรียบร้อย');
    } catch (err) {
      console.error('ส่งแจ้งเตือนไม่สำเร็จ:', err);
    }
  },
  { timezone: 'Asia/Bangkok' }
);

// health check เผื่อ hosting เรียกเช็คว่า server ยังทำงานอยู่
app.get('/', (req, res) => res.send('Bakery order bot is running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
