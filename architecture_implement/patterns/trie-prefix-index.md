name: trie-prefix-index
title: Trie Prefix Index
category: data
aliases: [prefix-tree, trie]
tags: [search, data-structures, autocomplete, read-optimized]
related: [content-addressable-storage, caching-strategies]
---

# Trie Prefix Index

## What

Дерево, в котором каждый узел представляет один символ, а путь от корня до узла — это префикс. Все слова с общим префиксом разделяют общий путь в дереве. Используется для мгновенного поиска всех ключей, начинающихся на заданный префикс.

Для autocomplete trie расширяется: каждый узел хранит **top-K наиболее релевантных завершений** своего префикса (pre-computed). Запрос к trie — O(P + K), где P — длина префикса, K — количество результатов.

## Why

- **O(P) lookup** — независимо от словаря, только длина запроса влияет на время.
- **Prefix sharing** — общие префиксы хранятся один раз (memory efficient для словарей с общим корнем).
- **Top-K per node** — eliminates tree traversal при каждом запросе: просто идём по узлам до конца префикса, берём pre-computed список.

## When to use

- Autocomplete / typeahead в search box.
- IP routing tables (CIDR prefix matching — longest prefix match).
- Spell checker, dictionary lookup.
- Command-line completion, IDE IntelliSense.

**Когда НЕ использовать:**

- Полнотекстовый поиск (инфикс, суффикс) — нужен инвертированный индекс.
- Часто обновляемые данные (trie дорог в write, read-optimized структура).
- Очень длинные ключи с малым overlap — overhead структуры превысит выгоду.

## How

### Базовая структура

```
Словарь: ["go", "google", "golang", "gopher"]

Trie:
root
└─ g
   └─ o          (top-K: ["google", "golang", "go", "gopher"])
      ├─ [end]   "go"
      ├─ o
      │  └─ g
      │     └─ l
      │        └─ e [end]   "google"
      ├─ l
      │  └─ a
      │     └─ n
      │        └─ g [end]   "golang"
      └─ p
         └─ h
            └─ e
               └─ r [end]   "gopher"
```

Каждый узел хранит:
```
TrieNode {
    children: Map<char, TrieNode>   // 26 для ASCII, HashMap для Unicode
    is_end: bool
    top_k: List<(term, score)>      // pre-computed, отсортированный по score
}
```

### Compressed Trie (Patricia / Radix Trie)

Узлы с одним ребёнком схлопываются в одну метку. Экономит память при длинных уникальных суффиксах:

```
Обычный trie: g→o→p→h→e→r
Compressed:   g→o→"pher"
```

Использование: структуры типа `map<string, TrieNode>` вместо посимвольных узлов. IP routing — radix tree (Linux kernel `lib/radix-tree.c`).

### Top-K per node

При каждом обновлении trie (batch или incremental) пересчитываем top-K для каждого узла:

```
Алгоритм обновления:
  insert(term, score):
    traverse prefix of term
    at each node on path:
      if term not in node.top_k:
        insert (term, score) into node.top_k
        sort by score descending
        truncate to K elements
      elif score > node.top_k[term].score:
        update score + re-sort
```

Queries: просто `node.top_k` после обхода префикса — O(1) для ответа.

### Шардинг

Trie не помещается в память одного сервера при размере словаря > 10M терминов. Шардинг по первым 2–3 символам:

```
Shard mapping:
  prefix "a*"   → Shard 1
  prefix "b*"   → Shard 2
  ...
  prefix "za*"  → Shard 52
  ...

Или hash(prefix[:2]) % N_shards
```

Router знает маппинг → перенаправляет запрос к нужному шарду. Для репликации: каждый шард → primary + 2 replicas (read от replicas, write к primary).

### Сериализация и кэширование

Trie-шард хранится in-memory. При старте сервиса — загружается из снапшота:

```
Trie → serialize to bytes (Protocol Buffers / Cap'n Proto / custom)
     → persist to S3 / object store

На старте:
  load snapshot → deserialize → serve
  Загрузка 1 GB trie ~ 5-10 секунд (приемлемо для rollout)
```

Горячие префиксы кэшируются в Redis / Memcached — большинство запросов это "go", "fa", "am" и т.п. — CDN тоже применим для top-1000 префиксов.

### Обновление trie

```
Batch (обычно достаточно):
  Каждые 1-24 часа: пересобрать trie из агрегированных логов → заменить снапшот.
  Zero-downtime: blue-green swap (новый trie → переключить роутер).

Incremental (real-time):
  Новый термин → обновить путь от корня до end-узла.
  Проблема: write lock на ветку, конкуренция с reads.
  Решение: copy-on-write branch update или lock per subtree.
```

## Diagram

```
Client: "goo"
    │
    ▼
Router (shard lookup: "go*" → Shard 3)
    │
    ▼
Trie Shard 3 (in-memory)
    root → g → o → o
                    └─ top_k: [("google", 9812), ("good", 7341), ("goodnight", 2100)]
    │
    ▼
Response: ["google", "good", "goodnight"]
    │
    ▼
Client renders dropdown
```

## Pitfalls

- **Unicode / CJK** — посимвольный trie на unicode: узлы по rune, не byte. Иначе границы символов ломаются.
- **Top-K stale** — если score меняется часто, top-K быстро устаревает. Нужен периодический rebuild vs incremental update.
- **Memory explosion** — хранить top-K=(50) на каждом узле × 10M узлов = много. Обычно K=5-10 достаточно.
- **Hot shard** — префиксы "a", "e", "i" намного горячее "x", "q". Нужна взвешенная балансировка при шардинге.

## Variations

- **Ternary Search Trie (TST)** — три ребра per узел (left/mid/right), более cache-friendly чем HashMap children.
- **DAWG (Directed Acyclic Word Graph)** — сжатый trie с разделёнными суффиксами; меньше памяти, но сложнее build.
- **FST (Finite State Transducer)** — Lucene использует для term dictionary: maps terms → term metadata. Очень компактен.

## Used in case studies

- [[009-search-autocomplete]] — основной паттерн typeahead

## References

- Alex Xu, *System Design Interview Vol. 1*, Chapter 13
- Lucene FST — term dictionary internals
- Apache Lucene — Edge N-Gram tokenizer
- Linux kernel radix tree (lib/radix-tree.c)
