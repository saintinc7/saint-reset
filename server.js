const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const users = new Map();      // socketId -> user
const byName = new Map();     // usernameLower -> socketId
const messages = new Map();   // chatId -> array

// ===== Saint Биржа (NFT Gifts) =====
const GIFTS_CATALOG = [
  { id: 'g1', name: 'Arbyz', model: 'Обычная', pattern: 'Crystal Grid', patternPct: '2.1%', bgName: 'Deep Ocean', bgPct: '4%', emoji: '💎', bg: 'linear-gradient(145deg,#0a1628,#1a3a5c)', issued: '1240/5000', supply: '1240/5000', baseValue: 672000, rarity: 'common' },
  { id: 'g2', name: 'Dinya', model: 'Легендарная', pattern: 'Royal Crown', patternPct: '0.4%', bgName: 'Midnight Gold', bgPct: '1.2%', emoji: '👑', bg: 'linear-gradient(145deg,#2a1a0a,#4a3020)', issued: '18/200', supply: '18/200', baseValue: 1800000, rarity: 'legendary' },
  { id: 'g3', name: 'Golub', model: 'Редкая', pattern: 'Feather Light', patternPct: '1.8%', bgName: 'Sky Mist', bgPct: '3%', emoji: '🕊️', bg: 'linear-gradient(145deg,#0a1a14,#1a3a2a)', issued: '890/3000', supply: '890/3000', baseValue: 120000, rarity: 'rare' },
  { id: 'g4', name: 'Saint Star', model: 'Эпическая', pattern: 'Constellation', patternPct: '0.9%', bgName: 'Void Black', bgPct: '2%', emoji: '⭐', bg: 'linear-gradient(145deg,#1a1020,#2a1a3a)', issued: '156/800', supply: '156/800', baseValue: 420000, rarity: 'epic' },
  { id: 'g5', name: 'Neon Heart', model: 'Обычная', pattern: 'Pulse Wave', patternPct: '3.5%', bgName: 'Pink Void', bgPct: '5%', emoji: '💜', bg: 'linear-gradient(145deg,#1a0a1a,#3a1a2a)', issued: '2100/8000', supply: '2100/8000', baseValue: 68000, rarity: 'common' },
  { id: 'g6', name: 'Crystal', model: 'Мифическая', pattern: 'Prism Core', patternPct: '0.1%', bgName: 'Abyss', bgPct: '0.3%', emoji: '🔮', bg: 'linear-gradient(145deg,#0a1a1a,#0a2a2a)', issued: '3/50', supply: '3/50', baseValue: 4500000, rarity: 'mythic' },
  { id: 'g7', name: 'Phoenix', model: 'Эпическая', pattern: 'Flame Wing', patternPct: '0.7%', bgName: 'Ember', bgPct: '1.5%', emoji: '🔥', bg: 'linear-gradient(145deg,#2a0a0a,#4a1a10)', issued: '210/900', supply: '210/900', baseValue: 380000, rarity: 'epic' },
  { id: 'g8', name: 'Ice Crown', model: 'Легендарная', pattern: 'Frost Crystal', patternPct: '0.3%', bgName: 'Glacier', bgPct: '0.8%', emoji: '❄️', bg: 'linear-gradient(145deg,#0a1a2a,#1a2a3a)', issued: '42/300', supply: '42/300', baseValue: 950000, rarity: 'legendary' },
  
  { id: 'g10', name: 'Saint Star', model: 'Golden', pattern: 'Sparkle Burst', patternPct: '0.8%', bgName: 'Night Sky', bgPct: '1.5%', emoji: '⭐', bg: 'linear-gradient(145deg,#1a1200,#3a2a00)', issued: '320/2000', supply: '320/2000', baseValue: 250000, rarity: 'epic', animated: true },
  { id: 'g11', name: 'Aurora Dove', model: 'Mythic', pattern: 'Northern Light', patternPct: '0.2%', bgName: 'Polar Night', bgPct: '0.5%', emoji: '🕊️', bg: 'linear-gradient(145deg,#0a1a2a,#1a3a4a)', issued: '12/100', supply: '12/100', baseValue: 2200000, rarity: 'mythic', animated: true },
  { id: 'g12', name: 'Neon Pulse', model: 'Rare', pattern: 'Waveform', patternPct: '1.4%', bgName: 'Cyber', bgPct: '2.5%', emoji: '💜', bg: 'linear-gradient(145deg,#1a0a2a,#2a1a4a)', issued: '780/4000', supply: '780/4000', baseValue: 95000, rarity: 'rare', animated: true },
  { id: 'g9', name: 'Eternal Candle', model: 'Pinstripe', pattern: 'Calm Wolf', patternPct: '0.5%', bgName: 'Black', bgPct: '2%', emoji: '🕯️', bg: 'linear-gradient(145deg,#0d0d0d,#1a1a1a)', issued: '45192/46590', supply: '45192/46590', baseValue: 145270, rarity: 'rare' },
];

// instanceId -> { catalogId, owner, price, forSale, serial }
const giftInstances = new Map();
let giftSerial = 100;

// ===== Saint Numbers (+999 000 000 … +999 099 999) =====
// numberStr "999000066" -> { owner, price, forSale }
const saintNumbers = new Map();
const userNumber = new Map(); // usernameLower -> numberStr

function formatSaintNum(n) {
  // n is 9 digits starting with 999
  const s = String(n);
  return '+' + s.slice(0,3) + ' ' + s.slice(3,6) + ' ' + s.slice(6);
}

function scoreNumber(nStr) {
  // higher = cooler / more expensive
  const d = nStr.slice(3); // 6 digits after 999
  let score = 1;
  if (/^(\d)\1{5}$/.test(d)) score = 100;           // 000000
  else if (/^(\d)\1{4}/.test(d) || /(\d)\1{4}$/.test(d)) score = 50;
  else if (/^(\d)\1{3}/.test(d)) score = 25;
  else if (/012345|123456|234567|345678|456789|987654|876543|765432|654321|543210/.test(d)) score = 40;
  else if (/(\d)\1{2}/.test(d) && /(\d)\1(\d)\2/.test(d)) score = 20;
  else if (/(\d)\1{2}/.test(d)) score = 12;
  else if (/(\d)\1/.test(d)) score = 5;
  else if (/0{3,}/.test(d)) score = 15;
  // low numbers
  const num = parseInt(d, 10);
  if (num < 100) score = Math.max(score, 30);
  else if (num < 1000) score = Math.max(score, 18);
  else if (num < 10000) score = Math.max(score, 8);
  return score;
}

function priceForNumber(nStr) {
  const s = scoreNumber(nStr);
  return Math.floor(5000 * s * (0.8 + Math.random() * 0.5));
}

// Seed some cool numbers on market
const seedNums = [
  '999000000','999000001','999000007','999000111','999001234',
  '999012345','999066666','999077777','999088888','999099999',
  '999000666','999111111','999123456','999000042','999000100',
  '999055555','999010101','999000999','999011111','999000013'
];
seedNums.forEach(n => {
  if (!saintNumbers.has(n)) {
    saintNumbers.set(n, { owner: null, price: priceForNumber(n), forSale: true });
  }
});

function publicNumber(nStr, data) {
  return {
    number: nStr,
    display: formatSaintNum(nStr),
    owner: data.owner,
    price: data.price,
    forSale: data.forSale,
    score: scoreNumber(nStr)
  };
}

const vault = new Map(); // usernameLower -> Set of gift instance ids


function createGiftInstance(catalogId, owner, forSale = false, price = 0) {
  giftSerial++;
  const id = 'inst_' + giftSerial;
  const cat = GIFTS_CATALOG.find(g => g.id === catalogId);
  giftInstances.set(id, {
    id,
    catalogId,
    owner: owner || null,
    price: price || (cat ? Math.floor(cat.baseValue * 0.9) : 0),
    forSale: !!forSale,
    serial: giftSerial
  });
  return id;
}

// Seed marketplace + give Golub some
['g1','g2','g4','g5','g6','g7'].forEach(cid => {
  const cat = GIFTS_CATALOG.find(g => g.id === cid);
  createGiftInstance(cid, null, true, cat ? Math.floor(cat.baseValue * 0.85 + Math.random()*cat.baseValue*0.3) : 100000);
});
createGiftInstance('g3', 'Golub', false);
createGiftInstance('g1', 'Golub', true, 999999);
createGiftInstance('g8', null, true, 1100000);
createGiftInstance('g9', null, true, 155000);
createGiftInstance('g9', 'Golub', false);
createGiftInstance('g10', null, true, 280000);
createGiftInstance('g11', null, true, 2400000);
createGiftInstance('g12', null, true, 110000);
createGiftInstance('g10', 'Golub', false);


function publicGift(inst) {
  const cat = GIFTS_CATALOG.find(g => g.id === inst.catalogId) || {};
  return {
    id: inst.id,
    name: cat.name || 'Gift',
    model: cat.model || '',
    pattern: cat.pattern || '',
    patternPct: cat.patternPct || '',
    bgName: cat.bgName || '',
    bgPct: cat.bgPct || '',
    emoji: cat.emoji || '🎁',
    bg: cat.bg || '#1a1a2a',
    issued: cat.issued || '',
    supply: cat.supply || cat.issued || '',
    rarity: cat.rarity || 'common',
    value: cat.baseValue || 0,
    owner: inst.owner,
    price: inst.price,
    forSale: inst.forSale,
    serial: inst.serial,
    animated: !!cat.animated,
    inVault: false
  };
}

function chatId(a, b) {
  return [String(a).toLowerCase(), String(b).toLowerCase()].sort().join(':');
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    avatar: u.avatar,
    online: true,
    verified: !!u.verified,
    pro: !!u.pro,
    role: u.role || 'user',
    bio: u.bio || '',
    coins: u.coins || 0,
    saintNumber: userNumber.get(u.username.toLowerCase()) ? formatSaintNum(userNumber.get(u.username.toLowerCase())) : null
  };
}

io.on('connection', (socket) => {
  console.log('+ connect', socket.id);

  socket.on('auth', (data, cb) => {
    try {
      let username = String(data.username || '').replace(/^@/, '').trim();
      const name = String(data.name || username).trim() || username;
      if (username.length < 2) return cb({ error: 'Username слишком короткий' });

      const isCreator = username.toLowerCase() === 'golub';
      const oldId = byName.get(username.toLowerCase());
      if (oldId && oldId !== socket.id && users.has(oldId)) {
        io.to(oldId).emit('kicked', { reason: 'Вход с другого устройства' });
        users.delete(oldId);
      }

      const user = {
        id: crypto.randomUUID(),
        socketId: socket.id,
        username,
        name,
        avatar: isCreator ? '🕊️' : name[0].toUpperCase(),
        role: isCreator ? 'creator' : 'user',
        verified: isCreator,
        pro: isCreator,
        coins: isCreator ? 100000 : 500,
        bio: isCreator ? 'Создатель Saint · Saint Inc.' : (data.bio || ''),
        online: true,
        lastSeen: Date.now()
      };

      users.set(socket.id, user);
      byName.set(username.toLowerCase(), socket.id);
      socket.user = user;
      socket.join('lobby');

      const list = Array.from(users.values()).map(publicUser);
      io.emit('users', list);
      cb({ ok: true, user: publicUser(user) });
      console.log('auth', username);
    } catch (e) {
      cb({ error: 'Ошибка авторизации' });
    }
  });

  socket.on('get_users', (cb) => {
    const list = Array.from(users.values())
      .filter(u => u.socketId !== socket.id)
      .map(publicUser);
    cb(list);
  });

  socket.on('message', (data) => {
    const from = socket.user;
    if (!from || !data || !data.to || !data.text) return;
    const toName = String(data.to).replace(/^@/, '').toLowerCase();
    const toSocketId = byName.get(toName);
    const id = chatId(from.username, toName);
    const msg = {
      id: crypto.randomUUID(),
      chatId: id,
      from: from.username,
      fromName: from.name,
      fromAvatar: from.avatar,
      text: String(data.text).slice(0, 2000),
      time: Date.now()
    };
    if (!messages.has(id)) messages.set(id, []);
    messages.get(id).push(msg);
    if (messages.get(id).length > 200) messages.get(id).shift();
    if (toSocketId) io.to(toSocketId).emit('message', msg);
    socket.emit('message', msg);
  });

  socket.on('history', (data, cb) => {
    if (!socket.user || !data || !data.with) return cb([]);
    const id = chatId(socket.user.username, data.with);
    cb(messages.get(id) || []);
  });

  socket.on('typing', (data) => {
    if (!socket.user || !data || !data.to) return;
    const toId = byName.get(String(data.to).replace(/^@/, '').toLowerCase());
    if (toId) io.to(toId).emit('typing', { from: socket.user.username, name: socket.user.name });
  });

  socket.on('stop_typing', (data) => {
    if (!socket.user || !data || !data.to) return;
    const toId = byName.get(String(data.to).replace(/^@/, '').toLowerCase());
    if (toId) io.to(toId).emit('stop_typing', { from: socket.user.username });
  });

  socket.on('update_profile', (data) => {
    const u = socket.user;
    if (!u) return;
    if (typeof data.bio === 'string') u.bio = data.bio.slice(0, 200);
    if (typeof data.name === 'string' && data.name.trim()) u.name = data.name.trim().slice(0, 40);
    users.set(socket.id, u);
    io.emit('users', Array.from(users.values()).map(publicUser));
  });

  // ========== WebRTC Signaling ==========
  socket.on('call-user', (data) => {
    if (!socket.user || !data || !data.to) return;
    const toId = byName.get(String(data.to).replace(/^@/, '').toLowerCase());
    if (!toId) {
      socket.emit('call-failed', { reason: 'Пользователь не в сети' });
      return;
    }
    io.to(toId).emit('incoming-call', {
      from: socket.user.username,
      fromName: socket.user.name,
      fromAvatar: socket.user.avatar,
      offer: data.offer,
      isVideo: !!data.isVideo
    });
  });

  socket.on('call-accepted', (data) => {
    if (!socket.user || !data || !data.to) return;
    const toId = byName.get(String(data.to).replace(/^@/, '').toLowerCase());
    if (toId) {
      io.to(toId).emit('call-accepted', {
        from: socket.user.username,
        answer: data.answer
      });
    }
  });

  socket.on('call-rejected', (data) => {
    if (!socket.user || !data || !data.to) return;
    const toId = byName.get(String(data.to).replace(/^@/, '').toLowerCase());
    if (toId) io.to(toId).emit('call-rejected', { from: socket.user.username });
  });

  socket.on('ice-candidate', (data) => {
    if (!socket.user || !data || !data.to) return;
    const toId = byName.get(String(data.to).replace(/^@/, '').toLowerCase());
    if (toId) {
      io.to(toId).emit('ice-candidate', {
        from: socket.user.username,
        candidate: data.candidate
      });
    }
  });

  socket.on('call-ended', (data) => {
    if (!socket.user || !data || !data.to) return;
    const toId = byName.get(String(data.to).replace(/^@/, '').toLowerCase());
    if (toId) io.to(toId).emit('call-ended', { from: socket.user.username });
  });

  // Admin
  socket.on('admin', (data, cb) => {
    if (!socket.user || socket.user.role !== 'creator') return cb({ error: 'Нет прав' });
    const targetName = String(data.username || '').replace(/^@/, '').toLowerCase();
    const targetId = byName.get(targetName);
    if (!targetId || !users.has(targetId)) return cb({ error: 'Пользователь не в сети' });
    const target = users.get(targetId);
    if (data.action === 'give_pro') {
      target.pro = true;
      io.to(targetId).emit('notify', { text: '⭐ Вам выдан Saint Pro от @Golub' });
      io.emit('users', Array.from(users.values()).map(publicUser));
      return cb({ ok: true });
    }
    if (data.action === 'give_coins') {
      const amount = Math.min(Math.max(Number(data.amount) || 0, 0), 1000000);
      target.coins = (target.coins || 0) + amount;
      io.to(targetId).emit('notify', { text: `💰 +${amount} S от @Golub` });
      return cb({ ok: true });
    }
    cb({ error: 'Неизвестное действие' });
  });


  // ===== Saint Биржа =====
  socket.on('market_list', (cb) => {
    const list = Array.from(giftInstances.values())
      .filter(g => g.forSale)
      .map(publicGift);
    cb(list);
  });

  socket.on('my_gifts', (cb) => {
    if (!socket.user) return cb([]);
    const list = Array.from(giftInstances.values())
      .filter(g => g.owner && g.owner.toLowerCase() === socket.user.username.toLowerCase())
      .map(publicGift);
    cb(list);
  });

  socket.on('buy_gift', (data, cb) => {
    if (!socket.user || !data || !data.id) return cb({ error: 'Ошибка' });
    const inst = giftInstances.get(data.id);
    if (!inst || !inst.forSale) return cb({ error: 'Подарок не продаётся' });
    const buyer = socket.user;
    if ((buyer.coins || 0) < inst.price) return cb({ error: 'Недостаточно S' });
    // transfer
    buyer.coins -= inst.price;
    if (inst.owner) {
      // find seller if online and credit
      const sellerId = byName.get(inst.owner.toLowerCase());
      if (sellerId && users.has(sellerId)) {
        users.get(sellerId).coins = (users.get(sellerId).coins || 0) + inst.price;
        io.to(sellerId).emit('notify', { text: `💰 Продан ${publicGift(inst).name} за ${inst.price.toLocaleString()} S` });
      }
    }
    inst.owner = buyer.username;
    inst.forSale = false;
    users.set(socket.id, buyer);
    cb({ ok: true, gift: publicGift(inst), coins: buyer.coins });
    io.emit('market_update');
  });

  socket.on('sell_gift', (data, cb) => {
    if (!socket.user || !data || !data.id) return cb({ error: 'Ошибка' });
    const inst = giftInstances.get(data.id);
    if (!inst || !inst.owner || inst.owner.toLowerCase() !== socket.user.username.toLowerCase()) {
      return cb({ error: 'Это не ваш подарок' });
    }
    const price = Math.max(1000, Number(data.price) || inst.price);
    inst.price = price;
    inst.forSale = true;
    cb({ ok: true, gift: publicGift(inst) });
    io.emit('market_update');
  });

  socket.on('unlist_gift', (data, cb) => {
    if (!socket.user || !data || !data.id) return cb({ error: 'Ошибка' });
    const inst = giftInstances.get(data.id);
    if (!inst || !inst.owner || inst.owner.toLowerCase() !== socket.user.username.toLowerCase()) {
      return cb({ error: 'Это не ваш подарок' });
    }
    inst.forSale = false;
    cb({ ok: true });
    io.emit('market_update');
  });


  // ===== Saint Blockchain (Vault) =====
  socket.on('vault_list', (cb) => {
    if (!socket.user) return cb([]);
    const key = socket.user.username.toLowerCase();
    const ids = vault.get(key) || new Set();
    const list = [];
    ids.forEach(id => {
      const inst = giftInstances.get(id);
      if (inst) {
        const g = publicGift(inst);
        g.inVault = true;
        list.push(g);
      }
    });
    cb(list);
  });

  socket.on('vault_deposit', (data, cb) => {
    if (!socket.user || !data || !data.id) return cb({ error: 'Ошибка' });
    const inst = giftInstances.get(data.id);
    if (!inst || !inst.owner || inst.owner.toLowerCase() !== socket.user.username.toLowerCase()) {
      return cb({ error: 'Это не ваш подарок' });
    }
    if (inst.forSale) return cb({ error: 'Сначала снимите с продажи' });
    const key = socket.user.username.toLowerCase();
    if (!vault.has(key)) vault.set(key, new Set());
    vault.get(key).add(data.id);
    cb({ ok: true });
    io.to(socket.id).emit('notify', { text: '🔒 Подарок перемещён в Saint Blockchain' });
  });

  socket.on('vault_withdraw', (data, cb) => {
    if (!socket.user || !data || !data.id) return cb({ error: 'Ошибка' });
    const key = socket.user.username.toLowerCase();
    const set = vault.get(key);
    if (!set || !set.has(data.id)) return cb({ error: 'Нет в хранилище' });
    set.delete(data.id);
    cb({ ok: true });
    io.to(socket.id).emit('notify', { text: 'Подарок выведен из Blockchain' });
  });

  // filter my_gifts to exclude vaulted
  socket.on('my_gifts_safe', (cb) => {
    if (!socket.user) return cb([]);
    const key = socket.user.username.toLowerCase();
    const inVault = vault.get(key) || new Set();
    const list = Array.from(giftInstances.values())
      .filter(g => g.owner && g.owner.toLowerCase() === key && !inVault.has(g.id))
      .map(publicGift);
    cb(list);
  });


  // ===== Saint Numbers =====
  socket.on('numbers_market', (cb) => {
    const list = [];
    saintNumbers.forEach((data, n) => {
      if (data.forSale) list.push(publicNumber(n, data));
    });
    list.sort((a,b) => b.score - a.score);
    cb(list);
  });

  socket.on('my_number', (cb) => {
    if (!socket.user) return cb(null);
    const n = userNumber.get(socket.user.username.toLowerCase());
    if (!n) return cb(null);
    const data = saintNumbers.get(n);
    cb(data ? publicNumber(n, data) : null);
  });

  socket.on('buy_number', (data, cb) => {
    if (!socket.user || !data || !data.number) return cb({ error: 'Ошибка' });
    const n = String(data.number).replace(/\D/g,'');
    if (!n.startsWith('999') || n.length !== 9) return cb({ error: 'Неверный формат' });
    const info = saintNumbers.get(n);
    if (!info || !info.forSale) return cb({ error: 'Номер не продаётся' });
    // one number per user
    if (userNumber.has(socket.user.username.toLowerCase())) {
      return cb({ error: 'У вас уже есть Saint Number. Сначала продайте текущий.' });
    }
    if ((socket.user.coins || 0) < info.price) return cb({ error: 'Недостаточно S' });
    socket.user.coins -= info.price;
    if (info.owner) {
      const sid = byName.get(info.owner.toLowerCase());
      if (sid && users.has(sid)) {
        users.get(sid).coins = (users.get(sid).coins || 0) + info.price;
        io.to(sid).emit('notify', { text: 'Номер ' + formatSaintNum(n) + ' продан за ' + info.price.toLocaleString() + ' S' });
      }
      userNumber.delete(info.owner.toLowerCase());
    }
    info.owner = socket.user.username;
    info.forSale = false;
    userNumber.set(socket.user.username.toLowerCase(), n);
    users.set(socket.id, socket.user);
    cb({ ok: true, number: publicNumber(n, info), coins: socket.user.coins });
    io.emit('numbers_update');
  });

  socket.on('sell_number', (data, cb) => {
    if (!socket.user) return cb({ error: 'Ошибка' });
    const n = userNumber.get(socket.user.username.toLowerCase());
    if (!n) return cb({ error: 'У вас нет номера' });
    const info = saintNumbers.get(n);
    if (!info) return cb({ error: 'Ошибка' });
    const price = Math.max(1000, Number(data.price) || info.price);
    info.price = price;
    info.forSale = true;
    cb({ ok: true, number: publicNumber(n, info) });
    io.emit('numbers_update');
  });

  socket.on('unlist_number', (cb) => {
    if (!socket.user) return cb({ error: 'Ошибка' });
    const n = userNumber.get(socket.user.username.toLowerCase());
    if (!n) return cb({ error: 'Нет номера' });
    const info = saintNumbers.get(n);
    if (info) info.forSale = false;
    cb({ ok: true });
    io.emit('numbers_update');
  });

  socket.on('find_by_number', (data, cb) => {
    const raw = String(data.number || '').replace(/\D/g,'');
    if (!raw) return cb({ error: 'Введите номер' });
    let n = raw;
    if (n.length === 6) n = '999' + n;
    if (n.length === 9 && n.startsWith('999')) {
      const info = saintNumbers.get(n);
      if (info && info.owner) {
        const sid = byName.get(info.owner.toLowerCase());
        const u = sid && users.get(sid);
        if (u) return cb({ ok: true, user: publicUser(u), number: formatSaintNum(n) });
        return cb({ ok: true, user: { username: info.owner, name: info.owner, avatar: info.owner[0], online: false }, number: formatSaintNum(n) });
      }
    }
    cb({ error: 'Номер не найден или не привязан' });
  });

  socket.on('disconnect', () => {
    const u = users.get(socket.id);
    if (u) {
      byName.delete(u.username.toLowerCase());
      users.delete(socket.id);
      io.emit('users', Array.from(users.values()).map(publicUser));
      console.log('- disconnect', u.username);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🕊️ Saint Live → http://localhost:${PORT}`);
});
