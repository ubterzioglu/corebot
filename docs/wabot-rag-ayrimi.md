# Wabot ve AI/RAG Ayrımı

Bu doküman, `corteqs_wabot` içinde son yapılan ayrımı açıklar: WhatsApp onboarding botu ile AI/RAG soru-cevap modu artık aynı akış değil, birbirinden ayrılmış iki davranış olarak çalışır.

## Kısa özet

- Wabot'un ana işi artık deterministik onboarding ve yönlendirme akışını yürütmek.
- AI/RAG tarafı sadece kullanıcı menüden özellikle `5` seçerse devreye giren ayrı bir "bilgi modu".
- Bu ayrımın merkezinde `wa_users.conversation_mode` alanı var.
- Varsayılan mod `flow`.
- AI modu aktif olduğunda bot, mevcut onboarding adımını ilerletmez; gelen serbest metni RAG API'sine yollar.
- Kayıt/form akışı içindeyken kullanıcı `5` yazsa bile AI moduna geçiş engellenir.

## Neden bu ayrım yapıldı?

Önceden serbest metin ile onboarding/state-machine davranışı birbirine karışma riski taşıyordu. Yeni yapı ile:

- onboarding adımları bozulmuyor,
- kullanıcı yanlışlıkla kayıt akışından çıkmıyor,
- AI soruları ayrı bir moda alınıyor,
- form ve onboarding mantığı daha güvenli şekilde genişletilebiliyor.

## Veri modeli değişikliği

`supabase/migrations/003_add_conversation_mode.sql` ile `wa_users` tablosuna şu alan eklendi:

```sql
ALTER TABLE wa_users
ADD COLUMN IF NOT EXISTS conversation_mode text DEFAULT 'flow';

UPDATE wa_users
SET conversation_mode = 'flow'
WHERE conversation_mode IS NULL;
```

Beklenen değerler:

- `flow`: normal wabot akışı
- `rag`: AI bilgi modu

## Çalışma mantığı

### 1. Normal bot modu

`conversation_mode = 'flow'` iken bot mevcut `current_step` state machine'ine göre çalışır.

Ana akışlar:

- `WELCOME`
- `MENU`
- kayıt akışı:
  - `ASK_CATEGORY`
  - `ASK_FULL_NAME`
  - `ASK_COUNTRY`
  - `ASK_CITY`
  - `ASK_ORGANIZATION`
  - `ASK_OCCUPATION_INTEREST`
  - `ASK_EMAIL`
  - `ASK_PHONE`
  - `ASK_DISCOVERY_SOURCE`
  - `ASK_REFERRAL_CODE`
  - `ASK_DEMANDS`
  - `ASK_WHATSAPP_GROUP_INTEREST`
  - `ASK_PRIVACY_CONSENT`
- yönlendirme akışları:
  - `REDIRECT`
  - `REFERRAL_ASK`
  - `DONE`

### 2. AI/RAG modu

Kullanıcı `MENU` veya güvenli bir serbest durumdayken `5` seçerse:

- `current_step` olduğu gibi kalır
- `conversation_mode` -> `rag` yapılır
- kullanıcıya AI welcome mesajı döner

Bu moddayken:

- gelen mesaj `askRag(text)` ile dış RAG API'sine gider
- bot onboarding alanlarını update etmez
- bot state progression yapmaz

Çıkış davranışı:

- kullanıcı `çık` yazarsa sadece `conversation_mode = 'flow'` olur
- kullanıcı `m`, `menü`, `menu`, `ana menü` yazarsa:
  - `current_step = 'MENU'`
  - `conversation_mode = 'flow'`

## RAG API kontratı

Wabot tarafı bir retrieval sistemi çalıştırmıyor. Sadece harici API çağırıyor.

Kullanılan env'ler:

- `RAG_API_URL`
- `RAG_API_SECRET` (opsiyonel, varsa `Bearer` header olarak ekleniyor)

Beklenen request:

```json
{
  "question": "Kullanıcının yazdığı serbest metin"
}
```

Beklenen response:

```json
{
  "answer": "Kullanıcıya dönecek metin"
}
```

Fallback davranışı:

- `answer` yoksa: `Bu konuda net bilgi bulamadım.`
- API hatası / network hatası varsa: `Şu anda bilgi sistemine bağlanamıyorum. Lütfen daha sonra tekrar deneyin.`

## Kritik guard kuralı

Kayıt akışı sırasında kullanıcı `5` yazarak AI moduna geçemez.

Bot şu cevabı verir:

`Şu an kayıt adımındayız. AI soruları için ana menüye dönüp 5'i seçebilirsiniz.`

Bu guard aşağıdaki kayıt adımlarında korunuyor:

- `ASK_CATEGORY`
- `ASK_FULL_NAME`
- `ASK_COUNTRY`
- `ASK_CITY`
- `ASK_ORGANIZATION`
- `ASK_OCCUPATION_INTEREST`
- `ASK_EMAIL`
- `ASK_PHONE`
- `ASK_DISCOVERY_SOURCE`
- `ASK_REFERRAL_CODE`
- `ASK_DEMANDS`
- `ASK_WHATSAPP_GROUP_INTEREST`
- `ASK_PRIVACY_CONSENT`
- `REDIRECT`
- `REFERRAL_ASK`

Amaç: form/onboarding verisi toplanırken sohbetin AI moduna sapmaması.

## Form agent için net sınırlar

Form tarafında çalışan başka AI agent aşağıdaki prensiplere göre ilerlemeli:

- Wabot onboarding akışı ile AI bilgi modunu tek akış gibi ele almamalı.
- `current_step` ile `conversation_mode` ayrı sorumluluklar olarak düşünülmeli.
- Form tarafı yeni alan ekleyecekse bunlar onboarding/state machine alanları olarak tasarlanmalı; AI/RAG alanı ile karıştırılmamalı.
- Serbest metin AI cevaplama mantığı form submit mantığının içine gömülmemeli.
- Kullanıcı form doldururken AI yardım istenecekse, bu ayrı bir UX kararı olmalı; mevcut wabot davranışını otomatik bozacak şekilde tasarlanmamalı.

## Form agent için önerilen mimari yorum

Diğer agent bu sistemi şöyle okumalı:

- `flow` = veri toplama / onboarding / yönlendirme motoru
- `rag` = bilgi verme motoru
- `submissions` = tamamlanan kayıtların operasyonel çıktısı
- `wa_users` = konuşma durumu + onboarding state kaynağı

Yani form agent'ın görevi:

- onboarding alanlarını toplamak,
- doğrulamak,
- gerekirse `submissions` ile eşlemek,
- ama AI bilgi modunu onboarding state geçişleriyle birleştirmemek

## Şu an test ile doğrulanan davranışlar

Testler aşağıdakileri doğruluyor:

- menüde `5` seçilince AI moduna girilir
- AI modunda serbest metin RAG API'sine gider
- AI modunda `current_step` değişmez
- `çık` ile AI modundan temiz çıkılır
- `m` ile ana menüye dönülür ve mod `flow` olur
- kayıt akışı ortasında `5` yazmak AI moduna geçirmez
- menüde serbest metin artık otomatik RAG fallback'i yapmaz

## Form agent'a verilecek tek cümlelik özet

`corteqs_wabot` içinde AI/RAG artık onboarding botunun doğal fallback'i değil; `wa_users.conversation_mode` ile yönetilen, yalnızca menüden bilinçli olarak açılan ayrı bir bilgi modu.
