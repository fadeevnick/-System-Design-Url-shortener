# Metrics Reference

Все метрики доступны через:

```bash
curl http://localhost:3000/metrics
```

Метрики хранятся в памяти процесса. После restart приложения они обнуляются.

## 1. `http_requests_total`

Пример:

```text
http_requests_total{method="GET",route="/:shortCode",status="302"} 457443
http_requests_total{method="GET",route="/:shortCode",status="404"} 7
http_requests_total{method="POST",route="/shorten",status="201"} 3
```

Что означает:

```text
сколько HTTP requests обработало приложение,
разбитых по method, route и status.
```

Для URL shortener самое важное:

```text
GET /:shortCode status=302
```

Это успешные redirects.

Если видим:

```text
status="500"
```

значит приложение падало на request path.

Если видим:

```text
status="404"
```

значит кто-то запросил shortCode, которого нет в базе.

Как меряем:

В controller вокруг request handler:

```text
при завершении request:
  increment http_requests_total{method, route, status}
```

Зачем:

Это server-side счетчик requests. Если снимать эту метрику раз в минуту, можно считать server-side RPS:

```text
requests per second = delta(http_requests_total) / seconds
```

Пример:

```text
было 100000
стало 160000
прошло 60 секунд
RPS = 60000 / 60 = 1000
```

## 2. `http_request_duration`

Пример:

```text
http_request_duration{method="GET",route="/:shortCode",status="302"}_avg_ms 13
http_request_duration{method="GET",route="/:shortCode",status="302"}_max_ms 2538
```

Что означает:

```text
сколько времени request провел внутри NestJS handler.
```

Для redirect это примерно:

```text
получить shortCode из URL
вызвать urlsService.resolve(shortCode)
получить longUrl из PostgreSQL
отправить 302 response
```

Как меряем:

В controller:

```text
startedAt = Date.now()
...
observeMs('http_request_duration', Date.now() - startedAt, labels)
```

То есть это wall-clock duration на стороне приложения.

Что означают поля:

```text
_avg_ms
cumulative average с момента старта процесса

_max_ms
самый медленный request с момента старта процесса
```

Как читать:

```text
http_request_duration_avg_ms низкий, http_request_duration_max_ms высокий
=> обычно быстро, но были spikes.

http_request_duration_max_ms ~= db_pool_wait_duration_max_ms
=> самый длинный HTTP request в основном ждал DB connection.

http_request_duration_avg_ms ~= db_pool_wait_duration_avg_ms + db_query_duration_avg_ms
=> latency в основном объясняется DB path.
```

Ограничение:

У нас пока нет app-side histogram buckets, поэтому app-side p95/p99 из `/metrics` получить нельзя. p95/p99 берем из k6, а app metrics используем для объяснения причины.

## 3. `db_read_total`

Пример:

```text
db_read_total{operation="resolve_short_code"} 457450
```

Что означает:

```text
сколько DB reads сделал redirect path.
```

В нашем baseline:

```text
1 successful redirect = 1 SELECT в PostgreSQL
```

Как меряем:

В `UrlsService.resolve()` после SQL query:

```text
SELECT long_url FROM urls WHERE short_code = $1
increment db_read_total{operation="resolve_short_code"}
```

Как читать:

Если за тест:

```text
GET /:shortCode 302 delta = 100000
db_read_total delta = 100000
```

то:

```text
dbReadsPerSuccessfulRequest = 1
```

Это доказывает:

```text
каждый redirect напрямую связан с PostgreSQL read.
```

Почему важно:

Это ключевая метрика перед Redis.

Если workload `hot-read`, и мы видим:

```text
100000 redirects
100000 DB reads
```

то cache-aside потенциально мог бы сделать:

```text
100000 redirects
примерно 1 DB read после cache miss
остальное Redis hits
```

Но это пока thought experiment, не решение.

## 4. `db_write_total`

Пример:

```text
db_write_total{operation="insert_url"} 3
db_write_total{operation="update_short_code"} 3
```

Что означает:

```text
сколько write operations сделало приложение.
```

Для `POST /shorten` у нас сейчас два DB write:

```text
1. INSERT INTO urls (long_url) VALUES (...) RETURNING id
2. UPDATE urls SET short_code = base62(id) WHERE id = ...
```

Почему два:

Потому что `id` генерирует PostgreSQL через `BIGSERIAL`, а `shortCode = base62(id)`. Сначала надо получить `id`, потом посчитать `shortCode`, потом записать его обратно.

Как читать:

Для read-heavy тестов ожидаем:

```text
db_write_total почти не растет
db_read_total растет сильно
```

Для `write-burst` ожидаем:

```text
insert_url ~= number of created URLs
update_short_code ~= number of created URLs
```

## 5. `db_pool_max_configured`

Пример:

```text
db_pool_max_configured 100
```

Что означает:

```text
какой max size у pg.Pool в приложении.
```

Это значение из:

```text
PG_POOL_MAX
```

Как меряем:

В `recordPoolSnapshot()` читаем:

```text
this.pool.options.max
```

Зачем:

Чтобы в `/metrics` сразу видеть, с каким pool size был тест:

```text
PG_POOL_MAX=50
PG_POOL_MAX=100
```

Иначе легко перепутать результаты.

## 6. `db_pool_total_count`

Пример:

```text
db_pool_total_count 10
```

Что означает:

```text
сколько DB connections сейчас открыто в pool.
```

Это текущее значение на момент последнего snapshot, не максимум.

`total_count` включает:

```text
db_pool_active_count + db_pool_idle_count
```

После теста часто можно увидеть:

```text
db_pool_total_count 10
db_pool_idle_count 10
```

Даже если во время теста было 100 connections.

Почему:

После нагрузки pool может закрыть лишние idle connections, или последний snapshot был уже в спокойном состоянии.

Для пиков важнее:

```text
db_pool_total_count_max_observed
```

## 7. `db_pool_idle_count`

Пример:

```text
db_pool_idle_count 10
```

Что означает:

```text
сколько DB connections сейчас свободны.
```

Если после теста:

```text
db_pool_total_count = 10
db_pool_idle_count = 10
db_pool_active_count = 0
```

это значит:

```text
сейчас нагрузки нет, все connections свободны.
```

Это не доказывает, что во время теста очереди не было.

## 8. `db_pool_active_count`

Пример:

```text
db_pool_active_count 0
```

Что означает:

```text
сколько DB connections сейчас заняты query/request'ами.
```

Считаем так:

```text
db_pool_active_count = db_pool_total_count - db_pool_idle_count
```

В спокойном состоянии обычно:

```text
db_pool_active_count = 0
```

Во время нагрузки может быть:

```text
db_pool_active_count = 100
```

## 9. `db_pool_waiting_count`

Пример:

```text
db_pool_waiting_count 0
```

Что означает:

```text
сколько requests прямо сейчас ждут свободное DB connection.
```

Если:

```text
db_pool_waiting_count > 0
```

значит pool стал очередью.

Но это snapshot. После теста почти всегда будет `0`.

Поэтому для пиков важнее:

```text
db_pool_waiting_count_max_observed
```

## 10. `db_pool_total_count_max_observed`

Пример:

```text
db_pool_total_count_max_observed 100
```

Что означает:

```text
максимальное количество одновременно открытых DB connections в pool с момента старта app.
```

Важно: это не счетчик "сколько connections было создано суммарно".

Это high-water mark:

```text
max(db_pool_active_count + db_pool_idle_count)
```

Пример:

```text
t1: db_pool_active_count=10, db_pool_idle_count=0,  db_pool_total_count=10
t2: db_pool_active_count=80, db_pool_idle_count=20, db_pool_total_count=100
t3: db_pool_active_count=5,  db_pool_idle_count=95, db_pool_total_count=100
```

Тогда:

```text
db_pool_total_count_max_observed = 100
db_pool_active_count_max_observed = 80
```

Как читать:

```text
db_pool_max_configured = 100
db_pool_total_count_max_observed = 100
```

значит приложение реально доросло до лимита pool по открытым connections.

Если:

```text
db_pool_max_configured = 100
db_pool_total_count_max_observed = 25
```

значит pool не расширялся выше 25 одновременно открытых connections.

Зачем:

RDS лимитируется одновременно открытыми connections. Поэтому эта метрика полезна для connection capacity и сравнения с CloudWatch `DatabaseConnections`.

## 11. `db_pool_active_count_max_observed`

Пример:

```text
db_pool_active_count_max_observed 100
```

Что означает:

```text
максимальное число одновременно занятых DB connections.
```

Это одна из самых важных метрик saturation.

Как читать:

```text
db_pool_active_count_max_observed == db_pool_max_configured
```

значит pool был полностью занят.

Если одновременно:

```text
db_pool_waiting_count_max_observed > 0
```

значит requests стояли в очереди за connection.

Пример:

```text
db_pool_max_configured = 100
db_pool_active_count_max_observed = 100
db_pool_waiting_count_max_observed = 497
```

Вывод:

```text
в пике все 100 DB connections были заняты,
и еще до 497 requests ждали в очереди.
```

## 12. `db_pool_waiting_count_max_observed`

Пример:

```text
db_pool_waiting_count_max_observed 497
```

Что означает:

```text
максимальный размер очереди requests, которые ждали DB connection.
```

Это прямой индикатор pool bottleneck.

Как читать:

```text
db_pool_waiting_count_max_observed = 0
```

Pool не был очередью.

```text
db_pool_waiting_count_max_observed > 0
```

В какой-то момент requests ждали connection.

```text
db_pool_waiting_count_max_observed очень высокий
```

Pool был сильно насыщен, возможны latency spikes.

Пример:

```text
db_pool_waiting_count_max_observed = 497
db_pool_wait_duration_max_ms = 2405
```

Это значит:

```text
в пике очередь была большой,
и самый долгий request ждал connection примерно 2.4 секунды.
```

## 13. `db_pool_wait_duration`

Пример:

```text
db_pool_wait_duration{operation="resolve_short_code"}_avg_ms 4
db_pool_wait_duration{operation="resolve_short_code"}_max_ms 2405
```

Что означает:

```text
сколько времени request ждал, пока pg.Pool выдаст connection.
```

Как меряем:

В `connectWithMetrics()`:

```text
startedAt = Date.now()
client = await pool.connect()
duration = Date.now() - startedAt
observeMs('db_pool_wait_duration', duration)
```

То есть это время до получения DB client.

Что означают поля:

```text
_avg_ms
cumulative average ожидания connection с момента старта процесса

_max_ms
самое долгое ожидание connection с момента старта процесса
```

Если свободное connection есть:

```text
pool wait ~= 0ms
```

Если все connections заняты:

```text
request ждет очередь
pool wait растет
```

Как читать:

```text
db_pool_wait_duration_avg_ms низкий, db_pool_wait_duration_max_ms высокий
=> обычно connection получаем быстро, но были spikes.

db_pool_wait_duration_avg_ms высокий
=> много requests регулярно ждут connection.

db_pool_wait_duration_max_ms примерно равен http_request_duration_max_ms
=> самый медленный HTTP request в основном ждал connection.
```

Пример:

```text
db_pool_wait_duration_avg_ms = 4
db_pool_wait_duration_max_ms = 2405
http_request_duration_max_ms = 2538
```

Вывод:

```text
средний request нормальный,
но worst-case request почти весь провел в ожидании pool.
```

## 14. `db_query_duration`

Пример:

```text
db_query_duration{operation="resolve_short_code"}_avg_ms 9
db_query_duration{operation="resolve_short_code"}_max_ms 634
```

Что означает:

```text
сколько времени занял сам SQL query после получения connection.
```

Как меряем:

В `queryWithMetrics()`:

```text
startedAt = Date.now()
await client.query(...)
duration = Date.now() - startedAt
observeMs('db_query_duration', duration)
```

Для redirect query это:

```text
SELECT long_url FROM urls WHERE short_code = $1
```

Что входит в это время:

```text
отправка query из Node.js в PostgreSQL
обработка query в PostgreSQL
возврат результата
ожидание ответа в Node.js
```

Что не входит:

```text
ожидание свободного connection в pool
```

Потому что pool wait измеряется отдельно.

Что означают поля:

```text
_avg_ms
cumulative average SQL query duration с момента старта процесса

_max_ms
самый долгий SQL query с момента старта процесса
```

Как читать:

```text
db_query_duration_avg_ms растет, db_pool_wait_duration_avg_ms низкий
=> bottleneck после получения connection.

db_query_duration_avg_ms растет вместе с RDS CPU
=> возможно DB CPU bottleneck.

db_query_duration_avg_ms растет вместе с RDS ReadLatency/ReadIOPS
=> возможно storage bottleneck.

db_query_duration_avg_ms растет, но RDS CPU/IO/network нормальные
=> возможно overhead большого числа коротких DB round trips,
   Postgres scheduling,
   network RTT,
   или client/app side overhead.
```

Пример:

```text
db_query_duration_avg_ms = 9
db_query_duration_max_ms = 634
```

Это говорит:

```text
обычно SELECT быстрый,
но были отдельные query path spikes.
```

## 15. Operation labels

Примеры:

```text
operation="resolve_short_code"
operation="insert_url"
operation="update_short_code"
operation="begin_create_short_url"
operation="commit_create_short_url"
operation="rollback_create_short_url"
```

Зачем нужны labels:

Чтобы не смешивать разные DB операции.

Redirect path:

```text
resolve_short_code
```

Write path:

```text
begin_create_short_url
insert_url
update_short_code
commit_create_short_url
rollback_create_short_url
```

Для Redis/cache решения нас больше всего интересует:

```text
resolve_short_code
```

Потому что Redis cache-aside будет оптимизировать именно read path.

## Как складывается один redirect request

Для успешного request:

```text
GET /abc
```

Внутри примерно так:

```text
1. controller starts timer
2. service calls pool.connect()
   -> db_pool_wait_duration

3. service runs SELECT
   -> db_query_duration{operation="resolve_short_code"}

4. service increments db_read_total

5. controller returns 302

6. controller records:
   http_requests_total{GET, /:shortCode, 302}
   http_request_duration{GET, /:shortCode, 302}
```

Идеально:

```text
http duration ~= pool wait + query duration + small app overhead
```

Пример:

```text
db_pool_wait_duration_avg_ms = 4
db_query_duration_avg_ms = 9
http_request_duration_avg_ms = 13
```

Очень чистая картина:

```text
4 + 9 ~= 13
```

Это значит, что почти вся latency redirect path объясняется DB pool + DB query.

## Как читать примерные метрики

Пример:

```text
db_read_total 457450

db_pool_max_configured 100
db_pool_active_count_max_observed 100
db_pool_waiting_count_max_observed 497

db_pool_wait_duration{operation="resolve_short_code"}_avg_ms 4
db_pool_wait_duration{operation="resolve_short_code"}_max_ms 2405

db_query_duration{operation="resolve_short_code"}_avg_ms 9
db_query_duration{operation="resolve_short_code"}_max_ms 634

http_request_duration{method="GET",route="/:shortCode",status="302"}_avg_ms 13
http_request_duration{method="GET",route="/:shortCode",status="302"}_max_ms 2538
```

Интерпретация:

```text
1. Redirect path сильно связан с PostgreSQL:
   457k reads.

2. Pool реально доходил до лимита:
   db_pool_active_count_max_observed = 100 из db_pool_max_configured = 100.

3. В пике была большая очередь:
   db_pool_waiting_count_max_observed = 497.

4. Средний request был быстрым:
   http_request_duration_avg_ms = 13.

5. Но tail latency была большой:
   http_request_duration_max_ms = 2538.

6. Главная причина worst-case latency:
   db_pool_wait_duration_max_ms = 2405.
```

То есть для такого теста:

```text
p95 по k6 может быть хорошим,
но есть tail spikes из-за DB pool saturation.
```

## Важные ограничения текущих метрик

1. Они хранятся в памяти процесса.

После restart все обнуляется.

2. Это cumulative metrics.

Если не рестартить app, `avg_ms` будет смешивать несколько тестов.

3. Нет histogram buckets.

Мы не можем получить app-side p95/p99 из `/metrics`, только avg/max.

4. `max` cumulative.

Если один раз был spike 2.5s, `max` будет показывать 2.5s до restart.

5. Gauges - snapshot, max gauges - peak.

```text
db_pool_waiting_count
```

может быть `0` после теста, но:

```text
db_pool_waiting_count_max_observed
```

покажет, что во время теста очередь была.

6. `db_pool_total_count_max_observed` не показывает connection churn.

Он показывает максимум одновременно открытых connections. Если нужно знать, сколько connections создавалось и закрывалось суммарно, нужны отдельные counters на события pool.

7. Duration metrics не рендерят `_count` и `_sum_ms`.

Мы специально оставляем `/metrics` компактным:

```text
*_avg_ms
*_max_ms
```

Поэтому для чистого теста перед каждым run нужно перезапускать app. Если нужен interval average без restart, надо вернуть `_count/_sum_ms` или перейти на Prometheus histograms.

## Самая полезная формула

Для redirect path:

```text
HTTP latency ~= pool wait + DB query + app overhead
```

Если видим:

```text
http_request_duration_avg_ms = 13
db_pool_wait_duration_avg_ms = 4
db_query_duration_avg_ms = 9
```

значит app overhead почти нулевой, а весь request - это DB path.

Это важный вывод для system design:

```text
baseline API -> PostgreSQL работает,
но read path полностью зависит от PostgreSQL round trip.
```
