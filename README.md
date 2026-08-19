# Omar Chat 💬

Realtime web chat app (زي WhatsApp/Messenger) — Node.js + Express + Socket.IO + SQLite.

يدعم:
- تسجيل حساب / دخول (JWT + كلمة سر مشفّرة bcrypt)
- محادثات فردية (1-to-1)
- جروبات (اختار أكتر من شخص + اسم للجروب)
- رسايل فورية Real-time عن طريق Socket.IO (من غير ما تعمل refresh)
- مؤشر "بيكتب..." (typing indicator)
- تخزين دائم في SQLite (الرسايل والمحادثات محفوظة حتى لو السيرفر اتقفل وفتح تاني)
- واجهة عربي (RTL) بستايل شبيه بواتساب

---

## 1. تشغيله محلي (على جهازك)

```bash
npm install
cp .env.example .env      # لو مش موجود
npm run dev
```

هيفتح على: `http://localhost:3000`

افتحه في تابين مختلفين (أو متصفح عادي + متصفح incognito) وسجّل حسابين مختلفين عشان تجرب المحادثة بينهم.

> ملاحظة: قاعدة البيانات (SQLite) بتتخزن في `data/chat.db` جنب المشروع. الملف ده بيتعمل أوتوماتيك أول ما تشغّل السيرفر.

---

## 2. اشتغاله أونلاين فعلاً (Hosting)

عشان يبقى شغال زي واتساب من أي مكان على الإنترنت، لازم تعمل Deploy للسيرفر على منصة hosting بتدعم:
- Node.js طويل المدى (long-running process) — مش serverless functions، عشان Socket.IO محتاج اتصال مستمر (WebSocket).
- Persistent disk، عشان ملف الـ SQLite ميتمسحش كل ما تعمل deploy جديد.

**ملاحظة مهمة:** المشروع بيستخدم `node:sqlite` (قاعدة بيانات مدمجة جوه Node.js نفسه من غير أي مكتبة خارجية محتاجة compile). ده يحل مشكلة شائعة جدًا في الـ hosting وهي إن مكتبات زي `better-sqlite3` بتحتاج تبني native binary وقت الـ install، ولو المنصة معندهاش build tools مظبوطة بيفشل السيرفر بصمت (وده كان سبب الـ "Failed to fetch" اللي واجهته). دلوقتي مفيش أي مكتبة native — الـ Dockerfile المرفق بيضمن نفس بيئة Node 22 في أي مكان.

### الطريقة الموصى بها: Docker (مضمونة تشتغل في أي مكان)

المشروع فيه `Dockerfile` جاهز. أي منصة بتدعم Docker (Railway, Render, Fly.io, أي VPS) هتبني وتشغّل نفس البيئة بالظبط اللي اتعمل عليها الاختبار.

### خطوات النشر على Railway (موصى بيها):

1. اعمل حساب على railway.app وسجّل دخول بـ GitHub.
2. ارفع المشروع ده (بكل ملفاته) على GitHub repo.
3. من Railway: New Project → Deploy from GitHub repo. Railway هيكتشف `railway.json` ويستخدم الـ Dockerfile تلقائي.
4. من تبويب Variables ضيف:
   - `JWT_SECRET` = سلسلة عشوائية طويلة (اعمل `openssl rand -hex 32` وانسخ الناتج)
5. عشان الداتا تفضل محفوظة بين الـ deployments: من تبويب Volumes ضيف Volume وخليه mounted على `/data`. الـ `DATABASE_PATH` متظبطة بالفعل في الـ Dockerfile على `/data/chat.db`.
6. Railway هيديك رابط عام (مثلاً `your-app.up.railway.app`) — ده اللينك اللي أي حد يقدر يفتحه من على النت.

### خطوات النشر على Render:

المشروع فيه `render.yaml` جاهز (Blueprint) بيظبط كل حاجة أوتوماتيك — الـ Docker build، الـ persistent disk على `/data`، ومتغير `JWT_SECRET` بيتولد لوحده. من Render: New → Blueprint → اختار الـ repo.

> لو حبيت لاحقًا تتوسع (آلاف المستخدمين)، وقتها تنقل من SQLite لـ Postgres مُدار (Railway/Neon بيوفروا ده مجانًا لحد حجم معين) — بس مش لازم للبداية.

### لو الـ deploy فشل تاني

افتح الـ Runtime Logs (مش الـ Build Logs بس) وشوف هل فيه سطر "Chat app running on http://localhost:3000". لو مش موجود، انسخ آخر رسالة Error من اللوجز وأنا أحدد السبب بالظبط.

---

## 3. هيكلة المشروع

```
chat-app/
  src/
    server.js      # Express + Socket.IO + كل الـ API routes
    db.js           # فتح قاعدة بيانات SQLite
    schema.sql       # تعريف الجداول
  public/
    index.html       # شاشة الدخول + شاشة الشات
    style.css
    app.js           # منطق الواجهة (fetch API + socket.io-client)
  data/               # هنا بيتحفظ ملف قاعدة البيانات (اتعمل أوتوماتيك)
  .env.example
```

---

## 4. أفكار للتطوير لاحقًا

- إرسال صور/ملفات (Multer + تخزين على S3 أو Cloudflare R2)
- علامة "اتقرأت" (read receipts) باستخدام جدول `lastReadAt` الموجود بالفعل
- إشعارات Push (Web Push API) لما يوصلك رسالة والتطبيق مقفول
- تطبيق موبايل بنفس الـ backend (React Native / Flutter) لأن الـ API والـ Socket.IO مستقلين عن الواجهة
