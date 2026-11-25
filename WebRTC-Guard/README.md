# WebRTC Guard — Chrome Extension (MV3)

افزونه خصوصی و آفلاین برای محدودسازی WebRTC در Chrome (نسخه 119 به بعد).

## نصب روی Chrome

1. فایل ZIP را Extract کن.
2. آدرس `chrome://extensions` را باز کن.
3. گزینه **Developer mode** را فعال کن.
4. **Load unpacked** را بزن و پوشه **extension** را انتخاب کن (نه خود فایل ZIP).
5. آیکون WebRTC Guard را از منوی Extensions پین کن.
6. پیش‌فرض روی **مسدودسازی روشن** است. یک‌بار دکمه «بارگذاری مجدد تب‌های وب‌سایت» را بزن تا روی تب‌های باز هم اعمال شود (فرم‌های ذخیره‌نشده ممکن است پاک شوند).

## نحوه کار

- **ON (مسدودسازی روشن):** WebRTC Guard اسکریپت `guard.js` را به‌صورت ثبت دائمی، `document_start`، در محیط `MAIN` و iframeها تزریق می‌کند و `RTCPeerConnection`، `webkitRTCPeerConnection`، `getUserMedia` و `getDisplayMedia` را محدود می‌کند. همچنین `chrome.privacy.network.webRTCIPHandlingPolicy` را روی `disable_non_proxied_udp` می‌گذارد تا مسیر UDP غیرپراکسی محدود شود.
- **OFF:** اسکریپت برای صفحات جدید ثبت نیست؛ تنظیم WebRTC IP این افزونه با `clear()` آزاد می‌شود. سایت‌های قبلی که اسکریپت در آن‌ها اجرا شده برای بازگشت APIها به Reload نیاز دارند.
- بعد از هر تغییر حالت، برای **قطع اتصال‌های موجود یا بازیابی APIها** از داخل افزونه دکمه بارگذاری مجدد تب‌ها را بزن. هیچ تبی بدون تأییدت رفرش نمی‌شود.

## تست

1. وقتی محافظت روشن است، صفحه `https://browserleaks.com/webrtc` را از نو بارگذاری کن. نباید ICE candidate از طریق `RTCPeerConnection` ساخته شود.
2. در Console یک وب‌سایت عادی امتحان کن:

   ```js
   new RTCPeerConnection();
   ```

   باید `NotAllowedError: Blocked by WebRTC Guard` بدهد.
3. برای آزمایش OFF سوییچ را خاموش کن، همان تب را Reload کن و دوباره تست بگیر.

## محدودیت‌ها و امنیت

- این افزونه **موتور داخلی WebRTC در Chrome را حذف نمی‌کند** و نمی‌تواند تضمین مطلق «صفر لیک» بدهد؛ WebRTC در مسیرهای داخلی مرورگر، قبل از تزریق یا در contextهای غیرقابل تزریق ممکن است متفاوت رفتار کند.
- صفحات داخلی Chrome و Web Store قابل تزریق نیستند. حالت Incognito فقط با فعال کردن **Allow in Incognito** در صفحه تنظیمات افزونه تحت پوشش قرار می‌گیرد؛ آن را جداگانه تست کن.
- Policyهای ادمین و سایر افزونه‌ها ممکن است روی تنظیم UDP اولویت داشته باشند. در پنجره افزونه وضعیت نشان داده می‌شود. `disable_non_proxied_udp` به معنی قطع کامل WebRTC در سطح شبکه نیست.
- تغییر حالت **بدون Reload** روی تب‌های از قبل باز شده تضمین نمی‌شود. این رفتار عمدی و برای جلوگیری از دستکاری مجدد صفحه توسط خود سایت است.
- VPN Kill Switch و تنظیمات DNS جدا هستند. جلوگیری از WebRTC leak، جایگزین محافظت کل ترافیک اینترنت نیست.
- همه کدها محلی است؛ از هیچ CDN، سرور، Telemetry، سرویس تحلیلی یا مجوز درخواست شبکه مستقیم استفاده نمی‌شود. مجوز دسترسی به وب‌سایت‌ها برای اجرای اسکریپت در همه صفحات ضروری است.
- برای بررسی مجوزها و سورس، فایل‌های `manifest.json`، `background.js` و `guard.js` را بخوان.

## فایل‌ها

- `extension/` — پوشه قابل نصب با Load unpacked
- `extension/background.js` — مدیریت وضعیت، ثبت اسکریپت و Chrome Privacy API
- `extension/guard.js` — محدودسازی APIها در `MAIN` world
- `extension/popup.*` — رابط RTL با سوییچ و دکمه Reload
