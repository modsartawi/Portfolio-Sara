# دليل تشغيل IT Executive Portfolio Hub على سيرفر الشركة

## محتويات الحزمة
- تطبيق React (Vite) كصفحة واحدة (SPA) يعمل من جهة المتصفح فقط.
- مصدر البيانات: **Google Sheet مباشر (للقراءة فقط)** — يُحمَّل عند كل فتح للصفحة.
- ملفات Docker لتشغيل التطبيق داخل Container عبر **nginx** كملفات ثابتة.
- **لا يوجد** Cloudflare أو قاعدة بيانات أو مصادقة أو بيانات مدمجة؛ لا تُخزَّن أي أسرار داخل الصورة.

## آلية العمل
```
المسؤول يعدّل Google Sheet  ──▶  المستخدم يفتح الصفحة  ──▶  المتصفح يقرأ config.json ثم رابط CSV
                                                        └─▶  يجلب CSV ويحلّله ويعرضه
```
- الشيت هو مصدر الحقيقة الوحيد: عدّل الشيت ثم أعِد تحميل الصفحة لتظهر البيانات المحدثة.
- روابط الشيت تُحقَن في الـContainer وقت التشغيل من متغيّري البيئة `SHEET_CSV_PROJECTS` و`SHEET_CSV_MILESTONES`، لذلك يمكن
  تغيير الشيت **دون إعادة بناء الصورة**.
- لا يوجد تخزين مؤقت داخل التطبيق؛ كل تحميل يجلب البيانات من جديد (Google يخزّن CSV مؤقتًا ~دقيقة إلى دقيقتين).

## إعداد Google Sheet (مرة واحدة)
1. أبقِ بيانات المشاريع في تبويب **`Master Portfolio`** (`gid=1001`) مع صف عناوين مطابق تمامًا
   (١٢ عمودًا): `Project ID`, `Project Name`, `IT Department`, `Strategic Domain`, `Priority`,
   `Status`, `RAG Health`, `Decision Required`, `Start Date`, `End Date`, `Owner`, `Notes`.
   والمعالم في تبويب **`Milestones`** (`gid=1002`): `Project ID`, `Project Name`,
   `IT Department`, `Milestone Name`, `Due Date`, `Status`.
   ملاحظة: التبويب `gid=0` أصبح لوحة معلومات داخل الشيت نفسه وليس مصدر بيانات.
2. شارك الشيت للقراءة فقط: `Share → General access → Anyone with the link → Viewer`.
3. رابط الـCSV يكون بالشكل:
   ```
   https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv&gid=<TAB_GID>
   ```
   ضع رابط المشاريع في `SHEET_CSV_PROJECTS` ورابط المعالم في `SHEET_CSV_MILESTONES` داخل `docker-compose.yml`.
> صيغ التواريخ المقبولة: `YYYY-MM-DD` أو `10-Sep-2026` أو `M/D/YYYY`. حالة المشروع
> (قادم / جارٍ / مكتمل) تُحسب تلقائيًا من تاريخي البداية والنهاية.

## المتطلبات
### الطريقة الأولى: Docker (الموصى بها)
- Docker Engine أو Docker Desktop.
- صلاحية فتح منفذ داخلي مثل 8080.
- Reverse Proxy داخلي مثل IIS أو Nginx لإضافة HTTPS واسم نطاق داخلي.
- **وصول المتصفحات إلى `docs.google.com` عبر HTTPS** (لأن الجلب يتم من المتصفح). إن كانت الشبكة
  تمنع ذلك، فعّل بديل الوسيط في `docker/nginx.conf` (راجع القسم 7 في `RUNBOOK_DOCKER_GOOGLE_SHEETS.md`)
  ليتم الجلب من الـContainer بدلًا من المتصفح.

### الطريقة الثانية: بناء محلي ثم استضافة الملفات الثابتة
- Node.js 22.13 أو أحدث، وpnpm 11.25.
- وصول مؤقت إلى npm registry أثناء تثبيت المكتبات لأول مرة.

---

# الطريقة الأولى: Docker (الموصى بها)

1. انسخ المشروع إلى مجلد على السيرفر.
2. عدّل `docker-compose.yml` وضع روابط الشيت في `SHEET_CSV_PROJECTS` و`SHEET_CSV_MILESTONES` (واختياريًا `REFRESH_SECONDS`).
3. ابنِ وشغّل:

```bash
docker compose up -d --build
```

4. افتح التطبيق داخل الشبكة:

```
http://SERVER-IP:8080
```

5. أنشئ Internal DNS مثل `it-portfolio.company.local` واربطه بالتطبيق عبر IIS أو Nginx Reverse
   Proxy، ثم فعّل HTTPS بشهادة الشركة.

## تغيير الشيت أو مدة التحديث (بدون إعادة بناء)
عدّل `SHEET_CSV_PROJECTS` أو `SHEET_CSV_MILESTONES` أو `REFRESH_SECONDS` في `docker-compose.yml` ثم:
```bash
docker compose up -d
```
> `REFRESH_SECONDS` (الافتراضي 300 ثانية) يجعل التبويبات المفتوحة تُحدّث نفسها تلقائيًا؛ ضع `0`
> للجلب عند التحميل فقط.

## أوامر التشغيل
```bash
docker compose stop            # إيقاف
docker compose start           # تشغيل مجددًا
docker compose logs -f         # عرض السجلات
docker compose up -d --build   # نشر تعديلات على الكود
```

---

# الطريقة الثانية: بناء محلي (ملفات ثابتة)

1. افتح Terminal داخل مجلد المشروع.
2. ثبّت المكتبات:

```bash
pnpm install --frozen-lockfile
```

3. ابنِ التطبيق (النتيجة في مجلد `dist/`):

```bash
pnpm build
```

4. استضِف محتوى مجلد `dist/` على أي خادم ملفات ثابتة (Nginx أو IIS)، وتأكد من وجود ملف
   `config.json` بجانب `index.html` يحتوي على رابط الشيت:

```json
{ "csvProjects": "https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv&gid=1001",
  "csvMilestones": "https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv&gid=1002",
  "refreshSeconds": 300 }
```

> ملاحظة: التطبيق ملفات ثابتة فقط — لا يلزم تشغيل Node.js على السيرفر في هذه الطريقة.

---

# إعداد Nginx كـReverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name it-portfolio.company.local;

    ssl_certificate /path/to/company.crt;
    ssl_certificate_key /path/to/company.key;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

# إعدادات الأمان المقترحة

- اجعل الرابط متاحًا فقط من شبكة الشركة أو الـVPN.
- لا تفتح منفذ 8080 للإنترنت؛ اسمح بالوصول من الـReverse Proxy فقط.
- استخدم HTTPS بشهادة داخلية.
- شارك الشيت **للقراءة فقط**، وتأكد أن بياناته غير سرّية (لأنه متاح لمن يملك الرابط).
- افحص الحزمة وفق سياسات Cybersecurity قبل تشغيلها.

# ملاحظة مهمة

البيانات تُقرأ مباشرةً من Google Sheet الذي يديره المسؤول؛ أي تعديل في الشيت يظهر في التطبيق
عند إعادة تحميل الصفحة. للتفاصيل الكاملة (الإعداد، التشغيل، الأعطال الشائعة) راجع
`RUNBOOK_DOCKER_GOOGLE_SHEETS.md`.
