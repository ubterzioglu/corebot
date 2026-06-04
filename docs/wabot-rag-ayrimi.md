# Wabot ve AI/RAG Ayrımı

Bu doküman, `corteqs_wabot` içindeki güncel ayrımı açıklar: WhatsApp botu artık kayıt toplamaz; yönlendirme, öneri toplama ve AI bilgi modu birbirinden net biçimde ayrıdır.

## Kısa özet

- Wabot'un ana işi artık deterministik menü, yönlendirme ve öneri akışlarını yürütmek.
- AI/RAG tarafı sadece kullanıcı menüden özellikle `5` seçerse devreye giren ayrı bir bilgi modu.
- Bu ayrımın merkezinde `wa_users.conversation_mode` alanı var.
- Varsayılan mod `flow`.
- AI modu aktif olduğunda bot mevcut akışı ilerletmez; gelen serbest metni RAG API'sine yollar.
- Eski WhatsApp kayıt state'lerinde kalan kullanıcılar güvenli biçimde ana menüye geri alınır.

## Neden bu ayrım yapıldı?

Bu bot içinden kayıt alma akışı kaldırıldı. Böylece:

- WhatsApp tarafı daha sade ve daha az kırılgan hale geldi,
- kullanıcılar doğrudan doğru akışa yönlendiriliyor,
- detaylı veri toplama form tarafında kalıyor,
- AI cevaplama davranışı yönlendirme akışlarıyla karışmıyor.

## Veri modeli değişikliği

`wa_users.conversation_mode` alanı iki mod taşır:

- `flow`: normal wabot akışı
- `rag`: AI bilgi modu

## Çalışma mantığı

### 1. Normal bot modu

`conversation_mode = 'flow'` iken bot `current_step` state machine'ine göre çalışır.

Aktif akışlar:

- `WELCOME`
- `MENU`
- yönlendirme akışları:
  - `REDIRECT`
  - `REFERRAL_ASK`
  - `DONE`
- öneri akışı:
  - `ASK_SUGGESTION_MESSAGE`
  - `ASK_SUGGESTION_CONTACT_PERMISSION`
  - `ASK_SUGGESTION_CONTACT_PHONE`

Kaldırılan eski kayıt akışları:

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

Bu state'lerden biriyle gelen kullanıcıya bot şu davranışı uygular:

- `current_step = 'MENU'`
- `conversation_mode = 'flow'`
- kullanıcıya kayıt akışının kaldırıldığı ve menüye döndüğü bilgisi verilir

### 2. AI/RAG modu

Kullanıcı `MENU` veya güvenli bir serbest durumdayken `5` seçerse:

- `current_step` olduğu gibi kalır
- `conversation_mode` -> `rag` yapılır
- kullanıcıya AI welcome mesajı döner

Geçiş döneminde eski alışkanlıkları kırmamak için `6` da AI seçimi olarak kabul edilir; ama menüde gösterilen güncel seçenek `5`tir.

Bu moddayken:

- gelen mesaj `askRag(text)` ile dış RAG API'sine gider
- bot state progression yapmaz
- suggestion veya yönlendirme akışlarını ilerletmez

Çıkış davranışı:

- kullanıcı `çık` yazarsa sadece `conversation_mode = 'flow'` olur
- kullanıcı `m`, `menü`, `menu`, `ana menü` yazarsa:
  - `current_step = 'MENU'`
  - `conversation_mode = 'flow'`

## RAG API kontratı

Wabot tarafı retrieval sistemi çalıştırmıyor; sadece harici API çağırıyor.

Kullanılan env'ler:

- `RAG_API_URL`
- `RAG_API_SECRET` (opsiyonel, varsa `Bearer` header olarak eklenir)

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

Aktif bir yönlendirme veya öneri akışı sırasında kullanıcı `5` yazarak AI moduna geçemez.

Bot şu cevabı verir:

`Şu an aktif bir akıştayız. AI soruları için ana menüye dönüp 5'i seçebilirsiniz.`

Bu guard aşağıdaki state'lerde korunur:

- `ASK_SUGGESTION_MESSAGE`
- `ASK_SUGGESTION_CONTACT_PERMISSION`
- `ASK_SUGGESTION_CONTACT_PHONE`
- `REDIRECT`
- `REFERRAL_ASK`

## Mimari yorum

Bu sistemi şöyle okumak gerekir:

- `flow` = yönlendirme ve yapılandırılmış kısa akış motoru
- `rag` = bilgi verme motoru
- `submissions` = artık form tarafındaki operasyonel kayıtların kaynağı
- `wa_suggestions` = WhatsApp içinden bırakılan istek ve öneriler
- `wa_users` = konuşma durumu + akış state kaynağı

## Şu an test ile doğrulanan davranışlar

- menüde `5` seçilince AI moduna girilir
- geçiş için menüde `6` da halen AI olarak kabul edilir
- AI modunda serbest metin RAG API'sine gider
- AI modunda `current_step` değişmez
- `çık` ile AI modundan temiz çıkılır
- `m` ile ana menüye dönülür ve mod `flow` olur
- kaldırılmış kayıt step'leri kullanıcıyı ana menüye geri alır
- aktif suggestion/yönlendirme akışında `5` yazmak AI moduna geçirmez
- menüde serbest metin artık otomatik RAG fallback'i yapmaz

## Tek cümlelik özet

`corteqs_wabot` içinde AI/RAG, yönlendirme botunun fallback'i değil; menüden bilinçli açılan ayrı bir bilgi modu ve WhatsApp içi kayıt akışı artık bu bottan çıkarılmış durumda.
