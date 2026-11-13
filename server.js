require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'royal_secret_12345';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || '967734591441';

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.log('❌ DB Error:', err.message));

// ===== الموديلات =====
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true },
  name: { type: String, default: 'عضو الملكي' },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  balance: { type: Number, default: 0 },
  memberId: { type: String, unique: true, sparse: true },
  createdAt: { type: Date, default: Date.now }
}));

const Order = mongoose.model('Order', new mongoose.Schema({
  userId: String,
  email: String,
  service: String,
  link: String,
  quantity: Number,
  price: Number,
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}));

// ===== الحماية =====
function auth(req, res, next){
  const h = req.headers.authorization || '';
  const token = h.replace('Bearer ','');
  if(!token) return res.status(401).json({message:'لا يوجد توكن'});
  try{ req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch(e){ return res.status(401).json({message:'توكن غير صالح'}); }
}
function isAdmin(req,res,next){
  const userEmail = req.user.email || req.user.username;
  if(userEmail === ADMIN_EMAIL) return next();
  return res.status(403).json({message:'ليس أدمن'});
}

// ===== الصفحات =====
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'admin.html')); });
app.get('/admin.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'admin.html')); });

// ===== تسجيل =====
app.post('/api/register', async (req, res) => {
  try {
    const email = (req.body.email || req.body.username || '').trim().toLowerCase();
    const password = req.body.password;
    const name = req.body.name || email.split('@')[0] || 'عضو الملكي';
    if (!email || !password) return res.status(400).json({ message: 'اكتب البريد وكلمة السر' });
    if (password.length < 6) return res.status(400).json({ message: 'كلمة السر لازم 6 احرف على الأقل' });
    const exists = await User.findOne({ $or: [{email}, {username: email}] });
    if (exists) return res.status(400).json({ message: 'الحساب موجود بالفعل' });
    const hashed = await bcrypt.hash(password, 10);
    const count = await User.countDocuments();
    const memberId = 'RM-' + String(count + 1).padStart(6, '0');
    const user = new User({ email, username: email, name, password: hashed, memberId });
    await user.save();
    res.json({ message: 'تم إنشاء الحساب بنجاح ✅' });
  } catch (e) { console.log(e.message); res.status(400).json({ message: 'خطأ في إنشاء الحساب' }); }
});

// ===== دخول =====
app.post('/api/login', async (req, res) => {
  try {
    const email = (req.body.email || req.body.username || '').trim().toLowerCase();
    const password = req.body.password;
    if(!email || !password) return res.status(400).json({ message: 'اكتب البريد وكلمة السر' });
    const user = await User.findOne({ $or: [{email}, {username: email}] });
    if (!user) return res.status(400).json({ message: 'المستخدم غير موجود' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ message: 'كلمة السر خطأ' });
    const token = jwt.sign({ id: user._id, email: user.email || user.username, username: user.email || user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { name: user.name, email: user.email || user.username, balance: user.balance, memberId: user.memberId, isAdmin: (user.email || user.username) === ADMIN_EMAIL }, message: 'تم الدخول بنجاح ✅' });
  } catch (e) { res.status(500).json({ message: 'خطأ في السيرفر' }); }
});

// ===== بياناتي =====
app.get('/api/me', auth, async (req,res)=>{
  try{
    const user = await User.findById(req.user.id);
    if(!user) return res.status(404).json({message:'المستخدم غير موجود'});
    const email = user.email || user.username;
    res.json({ name: user.name, email, balance: user.balance || 0, memberId: user.memberId || 'RM-000001', isAdmin: email === ADMIN_EMAIL });
  }catch(e){ res.status(401).json({message:'التوكن غير صالح'}); }
});

// ===== الخدمات =====
const SERVICES = [
  { id: 'tiktok_follow', name: 'متابعين تيك توك 👑', category: 'TikTok', price: 1.5, min: 100, max: 100000, desc: 'متابعين حقيقيين - تسليم سريع' },
  { id: 'tiktok_likes', name: 'لايكات تيك توك ❤️', category: 'TikTok', price: 0.8, min: 100, max: 50000, desc: 'لايكات عالية الجودة' },
  { id: 'tiktok_views', name: 'مشاهدات تيك توك 👁️', category: 'TikTok', price: 0.5, min: 1000, max: 1000000, desc: 'مشاهدات سريعة' },
  { id: 'insta_follow', name: 'متابعين انستقرام 📸', category: 'Instagram', price: 2.0, min: 100, max: 50000, desc: 'متابعين انستا - ضمان' },
  { id: 'insta_likes', name: 'لايكات انستقرام ❤️', category: 'Instagram', price: 0.9, min: 100, max: 20000, desc: 'لايكات سريعة' },
  { id: 'yt_subs', name: 'مشتركين يوتيوب ▶️', category: 'YouTube', price: 3.5, min: 100, max: 10000, desc: 'مشتركين حقيقيين' },
  { id: 'tg_members', name: 'أعضاء تليجرام ✈️', category: 'Telegram', price: 1.2, min: 100, max: 50000, desc: 'أعضاء قناة / قروب' },
  { id: 'fb_follow', name: 'متابعين فيسبوك 👍', category: 'Facebook', price: 1.8, min: 100, max: 50000, desc: 'متابعين صفحة فيسبوك' },
];
app.get('/api/services', (req,res)=>{ res.json(SERVICES); });

// ===== إنشاء طلب + خصم + واتساب =====
app.post('/api/order', auth, async (req,res)=>{
  try{
    const { serviceId, link, quantity } = req.body;
    if(!serviceId || !link || !quantity) return res.status(400).json({message:'أكمل كل البيانات'});
    const service = SERVICES.find(s=>s.id===serviceId);
    if(!service) return res.status(404).json({message:'الخدمة غير موجودة'});
    const qty = Number(quantity);
    if(qty < service.min || qty > service.max) return res.status(400).json({message:`الكمية لازم بين ${service.min} و ${service.max}`});
    const price = (service.price * qty / 1000);
    const user = await User.findById(req.user.id);
    if(!user) return res.status(404).json({message:'المستخدم غير موجود'});
    if((user.balance || 0) < price) return res.status(400).json({message:`رصيدك غير كافي! تحتاج ${price.toFixed(2)}$ ورصيدك ${(user.balance||0).toFixed(2)}$`});
    user.balance -= price;
    await user.save();
    const order = new Order({ userId: user._id, email: user.email || user.username, service: service.name, link, quantity: qty, price, status: 'pending' });
    await order.save();
    const waMsg = encodeURIComponent(`🔥 طلب جديد - خدمات الملكي 👑\n\n👤 المستخدم: ${user.email || user.username}\n🆔 عضوية: ${user.memberId}\n🛍️ الخدمة: ${service.name}\n🔗 الرابط: ${link}\n📦 الكمية: ${qty}\n💰 السعر: ${price.toFixed(2)}$\n🆔 رقم الطلب: ${order._id}\n\nافتح لوحة الأدمن للتأكيد`);
    const waLink = `https://wa.me/${ADMIN_WHATSAPP}?text=${waMsg}`;
    res.json({message:`تم الطلب ✅ تم خصم ${price.toFixed(2)}$ - رصيدك الجديد ${(user.balance).toFixed(2)}$`, order, balance: user.balance, waLink});
  }catch(e){ console.log(e); res.status(500).json({message:'خطأ في السيرفر'}); }
});

app.get('/api/orders', auth, async (req,res)=>{
  const orders = await Order.find({ userId: req.user.id }).sort({createdAt:-1});
  res.json(orders);
});

// ===== الأدمن =====
app.get('/api/admin/users', auth, isAdmin, async (req,res)=>{
  const users = await User.find().select('-password').sort({createdAt:-1});
  res.json(users);
});
app.post('/api/admin/add-balance', auth, isAdmin, async (req,res)=>{
  const email = (req.body.email || '').trim().toLowerCase();
  const amount = Number(req.body.amount);
  const user = await User.findOne({ $or: [{email}, {username: email}, {memberId: req.body.email}] });
  if(!user) return res.status(404).json({message:'المستخدم غير موجود'});
  user.balance = (user.balance || 0) + amount;
  await user.save();
  res.json({message:`تم شحن ${amount}$ ✅ رصيده الجديد: ${user.balance}$`, balance:user.balance});
});
app.get('/api/admin/orders', auth, isAdmin, async (req,res)=>{
  const orders = await Order.find().sort({createdAt:-1}).limit(200);
  res.json(orders);
});
app.post('/api/admin/order-status', auth, isAdmin, async (req,res)=>{
  const { orderId, status } = req.body;
  const order = await Order.findById(orderId);
  if(!order) return res.status(404).json({message:'الطلب غير موجود'});
  if(status==='cancelled' && order.status!=='cancelled'){
    const user = await User.findById(order.userId);
    if(user){ user.balance = (user.balance||0) + order.price; await user.save(); }
  }
  order.status = status;
  await order.save();
  res.json({message:'تم تحديث الطلب ✅', order});
});
app.post('/api/admin/transfer', auth, isAdmin, async (req,res)=>{
  const { membershipNumber, amount } = req.body;
  const user = await User.findOne({ memberId: membershipNumber });
  if(!user) return res.json({message:"المستخدم غير موجود ❌"});
  user.balance = (user.balance || 0) + Number(amount);
  await user.save();
  res.json({message:`تم تحويل ${amount} إلى ${user.name} ✅ رصيده الجديد: ${user.balance}`});
});
app.get('/api/admin/user/:membershipNumber', auth, isAdmin, async (req,res)=>{
  const user = await User.findOne({ memberId: req.params.membershipNumber });
  if(!user) return res.json({error:"not found"});
  res.json(user);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
