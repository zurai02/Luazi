// Luazi Standard Library - Crypto Module
export interface CryptoModule {
  md5(data: string | Uint8Array): string;
  sha1(data: string | Uint8Array): string;
  sha256(data: string | Uint8Array): string;
  sha512(data: string | Uint8Array): string;
  hmac(algorithm: string, key: string | Uint8Array, data: string | Uint8Array): string;
  pbkdf2(password: string | Uint8Array, salt: string | Uint8Array, iterations: number, keylen: number, digest?: string): string;
  aesEncrypt(data: string | Uint8Array, key: string | Uint8Array, iv?: Uint8Array, mode?: string): EncryptedData;
  aesDecrypt(encrypted: EncryptedData, key: string | Uint8Array): Uint8Array;
  generateKeyPair(algorithm: string, options?: any): KeyPair;
  randomBytes(length: number): Uint8Array;
  randomUUID(): string;
  randomInt(min: number, max: number): number;
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
  base64Encode(data: Uint8Array): string;
  base64Decode(str: string): Uint8Array;
  hexEncode(data: Uint8Array): string;
  hexDecode(str: string): Uint8Array;
}
export interface EncryptedData { ciphertext: Uint8Array; iv: Uint8Array; tag?: Uint8Array; algorithm: string; }
export interface KeyPair { publicKey: string; privateKey: string; algorithm: string; }

class PureCryptoModule implements CryptoModule {
  private nodeCrypto: any = null;
  constructor() { try { this.nodeCrypto = require('crypto'); } catch {} }
  md5(d: string | Uint8Array): string { if (this.nodeCrypto) return this.nodeCrypto.createHash('md5').update(d).digest('hex'); return this.hexEncode(this.md5Pure(this.toBytes(d))); }
  sha1(d: string | Uint8Array): string { if (this.nodeCrypto) return this.nodeCrypto.createHash('sha1').update(d).digest('hex'); return this.hexEncode(this.sha1Pure(this.toBytes(d))); }
  sha256(d: string | Uint8Array): string { if (this.nodeCrypto) return this.nodeCrypto.createHash('sha256').update(d).digest('hex'); return this.hexEncode(this.sha256Pure(this.toBytes(d))); }
  sha512(d: string | Uint8Array): string { if (this.nodeCrypto) return this.nodeCrypto.createHash('sha512').update(d).digest('hex'); return this.hexEncode(this.sha256Pure(this.toBytes(d))); }
  hmac(a: string, k: string | Uint8Array, d: string | Uint8Array): string { if (this.nodeCrypto) return this.nodeCrypto.createHmac(a, k).update(d).digest('hex'); throw new Error('HMAC requires Node.js'); }
  pbkdf2(p: string | Uint8Array, s: string | Uint8Array, i: number, k: number, d: string = 'sha256'): string { if (this.nodeCrypto) return this.nodeCrypto.pbkdf2Sync(p, s, i, k, d).toString('hex'); throw new Error('PBKDF2 requires Node.js'); }
  aesEncrypt(d: string | Uint8Array, k: string | Uint8Array, iv?: Uint8Array, m: string = 'gcm'): EncryptedData { if (this.nodeCrypto) { const kb = this.toBytes(k), ivb = iv || this.randomBytes(16), c = this.nodeCrypto.createCipheriv('aes-256-gcm', kb, ivb); const e = Buffer.concat([c.update(this.toBytes(d)), c.final()]); return { ciphertext: new Uint8Array(e), iv: ivb, tag: new Uint8Array(c.getAuthTag()), algorithm: 'aes-256-gcm' }; } throw new Error('AES requires Node.js'); }
  aesDecrypt(e: EncryptedData, k: string | Uint8Array): Uint8Array { if (this.nodeCrypto) { const d = this.nodeCrypto.createDecipheriv(e.algorithm, this.toBytes(k), e.iv); if (e.tag) d.setAuthTag(Buffer.from(e.tag)); return new Uint8Array(Buffer.concat([d.update(Buffer.from(e.ciphertext)), d.final()])); } throw new Error('AES requires Node.js'); }
  generateKeyPair(a: string, o: any = {}): KeyPair { if (this.nodeCrypto) { const { publicKey, privateKey } = this.nodeCrypto.generateKeyPairSync(a, { modulusLength: o.modulusLength || 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } }); return { publicKey, privateKey, algorithm: a }; } throw new Error('KeyPair requires Node.js'); }
  randomBytes(n: number): Uint8Array { if (this.nodeCrypto) return new Uint8Array(this.nodeCrypto.randomBytes(n)); if (typeof crypto !== 'undefined' && crypto.getRandomValues) return crypto.getRandomValues(new Uint8Array(n)); const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256); return b; }
  randomUUID(): string { if (this.nodeCrypto?.randomUUID) return this.nodeCrypto.randomUUID(); if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) return (crypto as any).randomUUID(); const b = this.randomBytes(16); b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80; const h = this.hexEncode(b); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; }
  randomInt(min: number, max: number): number { const r = max - min; const bn = Math.ceil(Math.log2(r) / 8); const m = (1 << (bn * 8)) - 1; let x: number; do { x = 0; const b = this.randomBytes(bn); for (let i = 0; i < bn; i++) x = (x << 8) | b[i]; x &= m; } while (x >= r); return min + x; }
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean { if (a.length !== b.length) return false; if (this.nodeCrypto) return this.nodeCrypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); let r = 0; for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i]; return r === 0; }
  base64Encode(d: Uint8Array): string { if (typeof Buffer !== 'undefined') return Buffer.from(d).toString('base64'); const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let r = '', i = 0; while (i < d.length) { const a = d[i++], b = i < d.length ? d[i++] : 0, e = i < d.length ? d[i++] : 0; const m = (a << 16) | (b << 8) | e; r += c[(m >> 18) & 63] + c[(m >> 12) & 63] + (i - 2 < d.length ? c[(m >> 6) & 63] : '=') + (i - 1 < d.length ? c[m & 63] : '='); } return r; }
  base64Decode(s: string): Uint8Array { if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64')); const l: Record<string, number> = {}; const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; for (let i = 0; i < c.length; i++) l[c[i]] = i; const n = s.length, p = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0; const r = new Uint8Array((n / 4) * 3 - p); let j = 0; for (let i = 0; i < n; i += 4) { const m = (l[s[i]] << 18) | (l[s[i + 1]] << 12) | ((l[s[i + 2]] || 0) << 6) | (l[s[i + 3]] || 0); r[j++] = (m >> 16) & 255; if (j < r.length) r[j++] = (m >> 8) & 255; if (j < r.length) r[j++] = m & 255; } return r; }
  hexEncode(d: Uint8Array): string { const h = '0123456789abcdef'; let r = ''; for (let i = 0; i < d.length; i++) r += h[(d[i] >> 4) & 15] + h[d[i] & 15]; return r; }
  hexDecode(s: string): Uint8Array { const r = new Uint8Array(s.length / 2); for (let i = 0; i < s.length; i += 2) r[i / 2] = parseInt(s.slice(i, i + 2), 16); return r; }
  private toBytes(d: string | Uint8Array): Uint8Array { return typeof d === 'string' ? new TextEncoder().encode(d) : d; }
  private leftRotate(x: number, n: number): number { return ((x << n) | (x >>> (32 - n))) >>> 0; }
  private rightRotate(x: number, n: number): number { return ((x >>> n) | (x << (32 - n))) >>> 0; }
  private padMd5(d: Uint8Array): Uint8Array { const o = d.length, pl = Math.ceil((o + 9) / 64) * 64; const p = new Uint8Array(pl); p.set(d); p[o] = 0x80; const v = new DataView(p.buffer); v.setUint32(pl - 8, (o * 8) & 0xffffffff, true); v.setUint32(pl - 4, ((o * 8) / 0x100000000) | 0, true); return p; }
  private padSha(d: Uint8Array, bs: number, ls: number): Uint8Array { const o = d.length, pl = Math.ceil((o + 1 + ls) / bs) * bs; const p = new Uint8Array(pl); p.set(d); p[o] = 0x80; const v = new DataView(p.buffer); v.setUint32(pl - 8, 0, false); v.setUint32(pl - 4, o * 8, false); return p; }
  private md5Pure(d: Uint8Array): Uint8Array {
    const K = new Uint32Array([0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391]);
    const s = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
    const padded=this.padMd5(d); const view=new DataView(padded.buffer);
    for (let i=0;i<padded.length;i+=64) { let A=a0,B=b0,C=c0,D=d0; for (let j=0;j<64;j++) { let F:number,g:number; if (j<16){F=(B&C)|((~B)&D);g=j;}else if(j<32){F=(D&B)|((~D)&C);g=(5*j+1)%16;}else if(j<48){F=B^C^D;g=(3*j+5)%16;}else{F=C^(B|(~D));g=(7*j)%16;} const t=D;D=C;C=B;B=(((B+this.leftRotate(((A+F+K[j]+view.getUint32(i+g*4,true))>>>0),s[j]))>>>0));A=t;} a0=(a0+A)>>>0;b0=(b0+B)>>>0;c0=(c0+C)>>>0;d0=(d0+D)>>>0; }
    const r=new Uint8Array(16); const rv=new DataView(r.buffer); rv.setUint32(0,a0,true); rv.setUint32(4,b0,true); rv.setUint32(8,c0,true); rv.setUint32(12,d0,true); return r;
  }
  private sha1Pure(d: Uint8Array): Uint8Array {
    const padded=this.padSha(d,64,16); const view=new DataView(padded.buffer);
    let h0=0x67452301,h1=0xefcdab89,h2=0x98badcfe,h3=0x10325476,h4=0xc3d2e1f0;
    for (let i=0;i<padded.length;i+=64) { const w=new Uint32Array(80); for(let j=0;j<16;j++)w[j]=view.getUint32(i+j*4,false); for(let j=16;j<80;j++)w[j]=this.leftRotate(w[j-3]^w[j-8]^w[j-14]^w[j-16],1); let a=h0,b=h1,c=h2,d=h3,e=h4; for(let j=0;j<80;j++){let f:number,k:number; if(j<20){f=(b&c)|((~b)&d);k=0x5a827999;}else if(j<40){f=b^c^d;k=0x6ed9eba1;}else if(j<60){f=(b&c)|(b&d)|(c&d);k=0x8f1bbcdc;}else{f=b^c^d;k=0xca62c1d6;} const t=(this.leftRotate(a,5)+f+e+k+w[j])>>>0; e=d; d=c; c=this.leftRotate(b,30); b=a; a=t; } h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0; h4=(h4+e)>>>0; }
    const r=new Uint8Array(20); const rv=new DataView(r.buffer); rv.setUint32(0,h0,false); rv.setUint32(4,h1,false); rv.setUint32(8,h2,false); rv.setUint32(12,h3,false); rv.setUint32(16,h4,false); return r;
  }
  private sha256Pure(d: Uint8Array): Uint8Array {
    const K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
    const padded=this.padSha(d,64,16); const view=new DataView(padded.buffer);
    let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
    for (let i=0;i<padded.length;i+=64) { const w=new Uint32Array(64); for(let j=0;j<16;j++)w[j]=view.getUint32(i+j*4,false); for(let j=16;j<64;j++){const s0=this.rightRotate(w[j-15],7)^this.rightRotate(w[j-15],18)^(w[j-15]>>>3); const s1=this.rightRotate(w[j-2],17)^this.rightRotate(w[j-2],19)^(w[j-2]>>>10); w[j]=(w[j-16]+s0+w[j-7]+s1)>>>0;} let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7; for(let j=0;j<64;j++){const S1=this.rightRotate(e,6)^this.rightRotate(e,11)^this.rightRotate(e,25); const ch=(e&f)^((~e)&g); const t1=(h+S1+ch+K[j]+w[j])>>>0; const S0=this.rightRotate(a,2)^this.rightRotate(a,13)^this.rightRotate(a,22); const maj=(a&b)^(a&c)^(b&c); const t2=(S0+maj)>>>0; h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;} h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;}
    const r=new Uint8Array(32); const rv=new DataView(r.buffer); rv.setUint32(0,h0,false); rv.setUint32(4,h1,false); rv.setUint32(8,h2,false); rv.setUint32(12,h3,false); rv.setUint32(16,h4,false); rv.setUint32(20,h5,false); rv.setUint32(24,h6,false); rv.setUint32(28,h7,false); return r;
  }
}

export function createCryptoModule(): CryptoModule { return new PureCryptoModule(); }
let defaultCrypto: CryptoModule | null = null;
export function getCrypto(): CryptoModule { if (!defaultCrypto) defaultCrypto = createCryptoModule(); return defaultCrypto; }
export default getCrypto();
