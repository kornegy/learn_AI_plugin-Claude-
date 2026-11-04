---
schema: 1
kind: topic
id: cpp/pointers
subject: cpp
title: Указатели
aliases:
  - pointers
  - pointer
created: 2026-10-01
updated: 2026-10-11
prerequisites:
  - cpp/variables
  - cpp/memory-basics
level: 3
provisional: false
level_source: evidence
regressed_on: null
last_assessed: 2026-10-11
evidence_counts:
  explanation: 1
  application: 2
misconceptions:
  - id: addr-vs-value
    description: Путает адрес переменной (&x) и значение по адресу (*p)
    status: open
    first_seen: 2026-10-11
    last_seen: 2026-10-11
    occurrences: 1
review:
  due: 2026-10-12
  stability: 0.64
  difficulty: 7.39
  reps: 2
  lapses: 1
  state: review
  last_review: 2026-10-11
---

<!-- mentor:section status -->
## Статус
**3 · Есть понимание, но слабое** · последняя проверка: 2026-10-11 · повторить: 2026-10-12
<!-- mentor:end -->

<!-- mentor:section summary -->
## Кратко
Указатель хранит адрес другого объекта в памяти; через `*p` можно читать и менять этот объект.
<!-- mentor:end -->

<!-- mentor:section studied -->
## Что уже изучено
<!-- mentor:end -->

<!-- mentor:section understands -->
## Что понимает
- 2026-10-11 · Зачем нужны указатели; что &x даёт адрес
<!-- mentor:end -->

<!-- mentor:section gaps -->
## Что пока не понимает
- 2026-10-11 · Когда писать *p, а когда p
<!-- mentor:end -->

<!-- mentor:section errors -->
## Допущенные ошибки
- addr-vs-value: Путает адрес переменной (&x) и значение по адресу (*p) — open, 1× (2026-10-11 … 2026-10-11)
<!-- mentor:end -->

<!-- mentor:section evidence -->
## Доказательства понимания
- 2026-10-08 · explanation · success · independent · learning — зачем нужны указатели "указатель — как записка с адресом квартиры"
- 2026-10-08 · application · success · assisted (hint 1) · learning — предсказал вывод &x
- 2026-10-11 · application · fail · independent · learning — написал *p = &x
<!-- mentor:end -->

<!-- mentor:section to_review -->
## Что повторить
<!-- mentor:end -->
