// セーブデータ（進み具合は localStorage、写真は IndexedDB）と設定。
const KEY = 'aquablue.save.v1';
const SKEY = 'aquablue.settings.v1';

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* 保存できない環境でも遊べるようにする */
    }
  },
};

export const DEFAULT_SETTINGS = {
  bgm: 0.7,
  se: 0.8,
  sens: 1.0,
  invertY: false,
  quality: 'high',
  fov: 62,
  help: true,
  padGlyphs: 'auto',
};

export const Save = {
  data: null,
  settings: { ...DEFAULT_SETTINGS },

  loadSettings() {
    try {
      const s = JSON.parse(store.get(SKEY) || 'null');
      if (s) this.settings = { ...DEFAULT_SETTINGS, ...s };
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
    return this.settings;
  },
  writeSettings() {
    store.set(SKEY, JSON.stringify(this.settings));
  },

  exists() {
    try {
      const d = JSON.parse(store.get(KEY) || 'null');
      return !!(d && d.v === 1);
    } catch {
      return false;
    }
  },
  load() {
    try {
      const d = JSON.parse(store.get(KEY) || 'null');
      if (d && d.v === 1) this.data = { ...this.blank(), ...d };
    } catch {
      this.data = null;
    }
    return this.data;
  },
  blank() {
    return {
      v: 1,
      fragments: [],
      species: {},
      photos: 0,
      dives: 0,
      playTime: 0,
      ending: false,
      seenAreas: [],
      prologue: false,
      created: Date.now(),
    };
  },
  newGame() {
    // 図鑑と写真は残したいという人もいるので、エンディング後のやり直しでも写真は消さない
    this.data = this.blank();
    this.write();
  },
  write() {
    if (this.data) store.set(KEY, JSON.stringify(this.data));
  },
  ensure() {
    if (!this.data) this.data = this.load() || this.blank();
    return this.data;
  },
};

// ---- 写真アルバム（IndexedDB）----
const DB = 'aquablue';
const OS = 'photos';
let dbp = null;
const memPhotos = [];

function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OS)) db.createObjectStore(OS, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

export const Album = {
  async add(photo) {
    const db = await openDB();
    if (!db) {
      memPhotos.push(photo);
      return;
    }
    await new Promise((res) => {
      const tx = db.transaction(OS, 'readwrite');
      tx.objectStore(OS).put(photo);
      tx.oncomplete = res;
      tx.onerror = res;
    });
  },
  async all() {
    const db = await openDB();
    if (!db) return memPhotos.slice().sort((a, b) => b.time - a.time);
    return new Promise((res) => {
      const tx = db.transaction(OS, 'readonly');
      const req = tx.objectStore(OS).getAll();
      req.onsuccess = () => res((req.result || []).sort((a, b) => b.time - a.time));
      req.onerror = () => res([]);
    });
  },
  async remove(id) {
    const db = await openDB();
    if (!db) {
      const i = memPhotos.findIndex((p) => p.id === id);
      if (i >= 0) memPhotos.splice(i, 1);
      return;
    }
    await new Promise((res) => {
      const tx = db.transaction(OS, 'readwrite');
      tx.objectStore(OS).delete(id);
      tx.oncomplete = res;
      tx.onerror = res;
    });
  },
  async get(id) {
    const db = await openDB();
    if (!db) return memPhotos.find((p) => p.id === id) || null;
    return new Promise((res) => {
      const tx = db.transaction(OS, 'readonly');
      const req = tx.objectStore(OS).get(id);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    });
  },
};
