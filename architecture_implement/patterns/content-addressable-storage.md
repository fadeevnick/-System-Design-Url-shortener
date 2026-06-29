---
name: content-addressable-storage
title: Content-Addressable Storage (CAS)
category: data
aliases: [cas]
tags: [storage, deduplication, immutability, distributed-systems]
related: [content-deduplication, chunked-upload]
---

# Content-Addressable Storage (CAS)

## What

Схема хранения, в которой адрес объекта — это криптографический хэш его содержимого (обычно SHA-256). Два объекта с одинаковым содержимым → один и тот же адрес → автоматическая дедупликация. Объекты immutable: записанный блок никогда не изменяется.

## Why

- **Дедупликация** — один и тот же фрагмент файла (например, заголовок PDF) хранится один раз даже у миллионов пользователей.
- **Целостность** — адрес одновременно является proof of content: подменить содержимое незаметно нельзя.
- **Кэшируемость** — immutable блоки можно кэшировать на CDN бесконечно (cache-busting не нужен).
- **Идемпотентность записи** — повторный upload одного блока не создаёт дубль, просто возвращает тот же адрес.

## When to use

- Файловые хранилища с дедупликацией (Dropbox block server, Git object store, IPFS).
- Хранение immutable артефактов: Docker layers, Maven/npm packages, backup chunks.
- Контент-доставка с CDN: URL содержит хэш → вечный TTL.

**Когда НЕ использовать:**

- Объекты, которые нужно обновлять in-place (мутабельные данные) — CAS требует новый write на каждое изменение.
- Очень мелкие объекты (< 1 KB) — overhead на hash и metadata превышает выгоду.

## How

### Chunking + CAS

Перед записью большой файл делится на блоки фиксированного или переменного размера:

```
File: vacation.mp4 (500 MB)
   ├── chunk_0: SHA256 = a3f1... (4 MB)
   ├── chunk_1: SHA256 = 9b2c... (4 MB)
   ├── chunk_2: SHA256 = a3f1... (4 MB)  ← дубль chunk_0, хранится один раз
   └── chunk_N: SHA256 = e77d... (2 MB)
```

Файл в Metadata DB представлен как `file_id → [chunk_hash_0, chunk_hash_1, ..., chunk_hash_N]`. Реальные данные — только уникальные хэши в Block Store.

### Fixed vs Variable-Length Chunking

| Подход | Размер блока | Дедупликация | Особенности |
|---|---|---|---|
| **Fixed-size** | 4–16 MB | Плохая при сдвиге (вставка байта ломает все границы) | Простота, Dropbox early |
| **Content-Defined Chunking (CDC)** | ~4 MB avg, переменный | Хорошая даже при сдвиге | Rabin fingerprint / FastCDC; используется в restic, Borg, IPFS |

CDC использует rolling hash (напр. Rabin polynomial) для поиска "естественных" границ в контенте — сдвиг одного байта не меняет большинство границ.

### Lookup: exists check before upload

```
Client → Metadata API: PUT /file
         Request includes chunk hashes list

Metadata API → Block Store: batch exists_check(hashes)
             ← {exists: [a3f1...], missing: [9b2c..., e77d...]}

Client uploads only missing chunks:
  POST /blocks/9b2c...
  POST /blocks/e77d...

Metadata API → commit file record
```

Экономия: если файл уже загружен другим пользователем — клиент не передаёт ни байта данных.

### Cross-user deduplication

Два пользователя загружают одинаковый файл — блоки хранятся один раз. Политика доступа — только через Metadata (кто имеет право видеть какой file_id), данные в Block Store анонимны. Это "server-side dedup" — клиент не знает, что чужие данные физически совпадают с его.

**Caveat**: cross-user dedup поднимает вопрос Privacy. Если пользователь А удалил файл, а данные физически нужны пользователю B — GC не должен их удалять. Нужен reference counting.

### Garbage Collection

```
Block Store периодически (напр. еженедельно):
  1. Снимок всех chunk hashes из Metadata DB (active set)
  2. Список всех ключей в Block Store
  3. diff = Block Store keys − active set
  4. Удаление или перемещение в cold storage
```

Двухфазный GC: сначала mark (отметить unreachable блоки), затем sweep (удалить). Между фазами новые uploads не теряются.

## Diagram

```
Client
  │  file split into chunks
  │  chunk_hash = SHA256(chunk_data)
  │
  ▼
Metadata Service
  │  exists_check([hash_0, hash_1, ...])
  │  returns missing hashes
  │
  ├─────────────► Block Store (CAS)
  │               key = SHA256 of content
  │               value = raw bytes
  │               immutable, deduplicated
  │
  └─ commit: file_id → [hash_0, hash_1, hash_2, ...]
             stored in Metadata DB (Postgres / RocksDB)
```

## Pitfalls

- **Хэш-коллизии** — SHA-256 практически исключает их, но алгоритм должен быть криптографическим (не CRC32, не MD5).
- **Малые файлы** — не разбивать на чанки файлы меньше threshold (напр. < 512 KB). Inline в Metadata или хранить как один блок.
- **GC race** — новый блок может быть записан между snapshot и sweep → не удалять блоки моложе grace period (напр. 24 часа).
- **Reference counting overflow** — при очень высоком dedup ratio (один популярный блок у миллионов пользователей) счётчик ссылок может стать горячей точкой.

## Variations

- **Git object store** — объекты (blob, tree, commit) адресуются по SHA-1 (→ SHA-256 в Git 2.x). Граф коммитов построен на CAS.
- **IPFS** — распределённый CAS с content-addressed routing (CID = multihash).
- **Docker layers** — каждый layer — immutable CAS объект; shared base layers не дублируются между образами.
- **Merkle Tree / Merkle DAG** — иерархический CAS: хэш директории = хэш от хэшей файлов → эффективная проверка целостности дерева.

## Used in case studies

- [[008-distributed-file-storage]] — основной паттерн Block Server в Dropbox-подобной системе
- [[006-web-crawler]] — content-deduplication через fingerprints (near-CAS)

## References

- Dropbox Tech Blog — How we Scaled Dropbox
- FastCDC: A Fast and Efficient Content-Defined Chunking Algorithm
- git-internals — Git Object Storage
- IPFS Whitepaper
