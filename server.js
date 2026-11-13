require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const DB = path.join(__dirname, 'db.json');
const SECRET = process.env.JWT_SECRET || 'royal-secret-2026';
const ADMIN_EMAIL = 'admin@royal.com';

// ---------- DB ----------
function load() {
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); }
  catch (e) { return { users: [], orders: [], transactions: [], services: defaultServices() }; }
}
function save(db) { fs.writeFileSync(DB, JSON.stringify(db, null, 2)); }

function defaultServices() {
  return [
    { id: '1', name: 'متابعين TikTok', category: 'TikTok', price: 2.5, desc: 'متابعين حقيقيين', min: 100, max: 10000 },
    { id: '2', name: 'لايكات TikTok', category: 'TikTok', price: 1.2, desc: 'لايكات سريعة', min: 100, max: 10000 },
    { id: '3', name: 'متابعين Instagram', category: 'Instagram', price: 3, desc: 'متابعين انستقرام', min: 100, max: 10000 },
    { id: '4', name: 'لايكات Instagram', category: 'Instagram', price: 1.5, desc: 'لايكات انستقرام', min: 100, max: 10000 },
    { id: '5', name: 'مشاهدات YouTube', category: 'YouTube', price: 2, desc: 'مشاهدات يوتيوب', min: 100, max: 50000 },
    { id: '6', name: 'أعضاء Telegram', category: 'Telegram', price: 2.8, desc: 'أعضاء تليجرام', min: 100, max: 10000 },
    { id: '7', name: 'متابعين Facebook', category: 'Facebook', price: 2.5, desc: 'متابعين فيسبوك', min: 100, max: 10000 },
  ];
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.replace('Bearer ', '');
  if (!t) return res.status(401).json({ message: 'غير مسجل' });
  try { req.user = jwt.verify(t, SECRET); next(); }
  catch (e) { return res.status(401).json({ message: 'انتهت الجلسة' }); }
}

// ---------- رابط الإحالة - مهم لـ Render ----------
// https://royal-panel.onrender.com/r/RM-000001 -> /?ref=RM-000001
app.get('/r/:code', (req, res) => {
  res.redirect(`/?ref=${req.params.code}`);
});

// ---------- Auth ----------
app.post('/api/register', async (req, res) => {
  const { email, password, name, refCode } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'اكمل البيانات' });
  const db = load();
  if (db.users.find(u => u.email === email)) return res.status(400).json({ message: 'البريد موجود مسبقاً' });
  const hash = await bcrypt.hash(password, 10);
  const id = db.users.length + 1;
  const memberId = 'RM-' + String(id).padStart(6, '0');
  const user = {
    id, email, password: hash, name: name || email.split('@')[0],
    memberId, referralCode: memberId,
    balance: 0, verified: true, isAdmin: email === ADMIN_EMAIL,
    referredBy: refCode || null,
    createdAt: new Date().toISOString()
  };
  db.users.push(user);

  // مكافأة الإحالة عند التسجيل
  if (refCode) {
    const inviter = db.users.find(u => u.referralCode === refCode || u.memberId === refCode);
    if (inviter && inviter.id !== user.id) {
      inviter.balance += 0.5;
      db.transactions.push({ userId: inviter.id, type: 'referral', amount: 0.5, status: 'done', date: new Date().toISOString(), from: memberId });
      user.balance += 0.1;
      db.transactions.push({ userId: user.id, type: 'welcome', amount: 0.1, status: 'done', date: new Date().toISOString() });
    }
  }
  save(db);
  res.json({ ok: true, message: 'تم إنشاء الحساب ✅' });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const db = load();
  const u = db.users.find(x => x.email === email);
  if (!u) return res.status(400).json({ message: 'الحساب غير موجود' });
  const ok = await bcrypt.compare(password, u.password);
  if (!ok) return res.status(400).json({ message: 'كلمة المرور خطأ' });
  const token = jwt.sign({ id: u.id, email: u.email }, SECRET);
  res.json({ ok: true, token });
});

// ---------- Me + إحصائيات الإحالة ----------
app.get('/api/me', auth, (req, res) => {
  const db = load();
  const u = db.users.find(x => x.id === req.user.id);
  if (!u) return res.status(404).json({ message: 'غير موجود' });
  const invited = db.users.filter(x => x.referredBy === u.referralCode || x.referredBy === u.memberId);
  const earnings = db.transactions.filter(t => t.userId === u.id && t.type === 'referral').reduce((s, t) => s + (t.amount || 0), 0);
  const { password, ...safe } = u;
  res.json({ ...safe, referralCount: invited.length, referralEarnings: earnings });
});

// ---------- Services ----------
app.get('/api/services', (req, res) => {
  const db = load();
  res.json(db.services || defaultServices());
});

// ---------- Orders ----------
app.post('/api/order', auth, (req, res) => {
  const { serviceId, link, quantity } = req.body;
  const db = load();
  const u = db.users.find(x => x.id === req.user.id);
  const s = (db.services || []).find(x => String(x.id) === String(serviceId));
  if (!s) return res.status(400).json({ message: 'الخدمة غير موجودة' });
  if (!link) return res.status(400).json({ message: 'اكتب الرابط' });
  const qty = Number(quantity) || 0;
  const price = (s.price * qty / 1000);
  if (u.balance < price) return res.status(400).json({ message: 'رصيد غير كافي، اشحن رصيدك أولاً' });
  u.balance -= price;
  const order = { id: Date.now(), userId: u.id, service: s.name, link, quantity: qty, price, status: 'pending', date: new Date().toISOString() };
  db.orders.push(order);

  // عمولة الإحالة 10% للمحيل عند كل طلب
  if (u.referredBy) {
    const inviter = db.users.find(x => x.referralCode === u.referredBy || x.memberId === u.referredBy);
    if (inviter) {
      const commission = price * 0.10;
      inviter.balance += commission;
      db.transactions.push({ userId: inviter.id, type: 'referral', amount: commission, status: 'done', date: new Date().toISOString(), from: u.memberId, orderId: order.id });
    }
  }
  save(db);
  const waLink = `https://wa.me/967734591441?text=${encodeURIComponent('طلب جديد 👑\nالخدمة: ' + s.name + '\nالكمية: ' + qty + '\nالرابط: ' + link + '\nرقم العضوية: ' + u.memberId)}`;
  res.json({ ok: true, message: 'تم الطلب ✅', waLink });
});

app.get('/api/orders', auth, (req, res) => {
  const db = load();
  const list = db.orders.filter(o => o.userId === req.user.id).reverse();
  res.json(list);
});

// ---------- Admin ----------
app.get('/api/admin/users', auth, (req, res) => {
  const db = load();
  const me = db.users.find(x => x.id === req.user.id);
  if (!me || !me.isAdmin) return res.status(403).json({ message: 'غير مصرح' });
  res.json(db.users.map(u => { const { password, ...s } = u; return s; }));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on ' + PORT));