# Техническое задание: первый уровень подводного shoot’em up

## Рабочее название

**Abyssal Front: South Pole**

Оригинальная игра должна передавать ощущения аркадного underwater run-and-gun/shoot’em up 1990-х: плотный поток врагов, управляемый темп прокрутки, крупные механические боссы, насыщенная пиксельная анимация и разрушение окружения. Это не требование копировать название, персонажей, спрайты, музыку или конкретные карты *In the Hunt*.

## 1. Референс и границы достоверности

### Подтверждено источниками

- Референс: *In the Hunt* (Irem, arcade, 1993), в Японии — *Kaitei Daisensō / Undersea War*.
- Игрок управляет подводной лодкой **Granvia**.
- Сеттинг: большая часть Земли затоплена после таяния полярных льдов; противник — организация D.A.S., готовящая superweapon.
- Жанр: горизонтальный underwater scrolling shooter для одного или двух игроков.
- Игрок может двигать лодку в восьми направлениях, стрелять вперёд торпедами и вверх глубинными бомбами.
- Скорость прокрутки зависит от движения лодки: движение вперёд ускоряет экран, движение назад замедляет.
- В уровне действует time limit.
- Доступны weapon power-ups: усиленный machine gun, wave cannon и spread/cracker shot.
- Всего в игре шесть длинных этапов; первый музыкальный трек называется **South Pole**.
- Первый упоминаемый stage boss — **Argock**.
- Визуальные сильные стороны референса: детализированный hand-drawn pixel art, яркие цвета, крупные анимации, плотные взрывы, механические underwater сооружения и выразительные boss encounters.

### Не подтверждено источниками

Открытые описания не дают полного stage map, точного порядка врагов, точного состава декораций первого этапа и полного сценария боя с Argock. Все пункты ниже, отмеченные **[РЕКОНСТРУКЦИЯ]**, — production design для новой игры, а не утверждение о дословном устройстве оригинального уровня.

## 2. Цель уровня

Игрок проводит боевую субмарину **Nereid-01** через затопленный южнополярный промышленный пояс, уничтожает узлы связи D.A.S. и разрушает мобильную ледовую боевую платформу в финальном бою.

Цели игрока:

1. Достичь северного края уровня.
2. Уничтожить минимум три D.A.S. relay node.
3. Собрать и применить хотя бы один weapon upgrade.
4. Победить финального босса **Argock-class Icebreaker** — оригинальный аналог референсного Argock; имя можно заменить при юридической проверке.

Длительность первого прохождения: **6–8 минут**, включая boss fight. Оптимальный speedrun: **3–4 минуты**.

## 3. Целевая платформа и камера

- Формат: 2D side-scrolling shooter.
- Логическое игровое поле: **320×240 px**, масштабирование integer.
- Целевой display: 16:9 с сохранением безопасной игровой области; опциональный режим 4:3.
- Ориентир частоты: 60 FPS.
- Camera: horizontal side view, игрок может двигаться назад и вперёд внутри активной зоны.
- World: tile/grid-based collision layer + sprite actors + parallax background.
- Рендер: nearest-neighbor для pixel art; никаких сглаженных спрайтов.
- На экране одновременно: player, 8–16 малых врагов, 1–3 средних объекта, projectiles, particles и foreground occluders без падения ниже 60 FPS на целевом железе.

## 4. Управление

### Базовая раскладка

| Действие | Keyboard/Gamepad | Поведение |
|---|---|---|
| Движение | WASD / левый stick | 8 направлений; инерция; упор в границы |
| Основной огонь | J / gamepad face button | Торпеда вперёд; удержание разрешено |
| Верхний огонь | K / gamepad shoulder button | Медленная depth charge вверх, затем падение и взрыв |
| Pause | Escape / Start | Пауза, remap controls, quit confirmation |

### Модель движения

- Подлодка имеет acceleration/deceleration, но отзывчивость должна оставаться аркадной.
- Максимальная скорость по горизонтали ниже скорости быстрых врагов; evasive movement достигается вертикальным маневром.
- При движении вперёд camera scroll speed плавно повышается.
- При движении назад camera scroll speed плавно понижается, но не останавливается дольше короткого grace period.
- Time limit продолжает уменьшаться при любом направлении движения.
- Столкновение с геометрией наносит damage, но не должно мгновенно убивать игрока, кроме специальных hazards.

## 5. Боевая система

### Player submarine

- HP: 3 units на стандартной сложности.
- Death: короткая взрывная анимация, потеря текущего weapon tier, checkpoint restart.
- Основной торпедный боезапас бесконечен.
- Depth charge имеет cooldown 0.45–0.60 s; projectile медленнее торпеды и наносит высокий урон снизу.
- У каждого оружия ясный силуэт и цветовой код; цвет не должен быть единственным способом различения.

### Оружие

1. **Standard Torpedo** — прямой среднебыстрый снаряд, стабильный урон.
2. **Heavy Machine Gun** — быстрая очередь, меньший урон снаряда, широкий hit coverage.
3. **Wave Cannon** — медленный волновой projectile, проходит через мелкие цели.
4. **Cracker Spread** — веер снарядов, эффективен против групп.
5. **Depth Charge** — верхний запуск, затем падение; уничтожает мины, нижние платформы и крупные weak points.

Weapon drop должен быть читаем за 0.5 s до появления: carrier drone, короткий flash, пиктограмма, звук pickup.

### Очки и бонусы

- Красные star-orbs: +100 / +500 очков; собирать можно безопасным проходом.
- Уничтожение цели без промаха заполняет короткий chain meter.
- Разрушение scenery-object даёт малый bonus и открывает путь или скрывает опасность.
- Не превращать score system в обязательную валюту для прохождения.

## 6. Структура первого уровня [РЕКОНСТРУКЦИЯ]

### Сегмент A — Ice Shelf Approach, 0:00–1:30

**Задача:** безопасно обучить управлению высотой, двумя типами огня и влиянию скорости на camera.

- Холодная сине-зелёная вода, ледяной потолок сверху, тёмный seabed снизу.
- На заднем плане: слоистые ледяные поля, трещины с голубым glow, дальние исследовательские башни.
- Враги: малые D.A.S. scout drones, медленные floating mines, один surface aircraft, атакующий сверху.
- Первый carrier drone появляется вне опасного потока; гарантированно выдаёт Heavy Machine Gun.
- Игрок видит mine под собой и должен впервые применить depth charge.
- Scroll-speed tutorial: короткий безопасный corridor показывает разницу между движением вперёд и торможением назад.
- Checkpoint ставится после первого крупного ледяного обвала.

### Сегмент B — Flooded Refinery, 1:30–3:20

**Задача:** ввести вертикальное чтение поля и разрушение объектов.

- Затопленная refinery: трубы, резервуары, кабели, контейнеры, аварийные лампы.
- Foreground pipes частично перекрывают фон, но не закрывают lethal projectile более чем на 0.2 s.
- Враги выходят из dock doors, шахт и разрушенных окон; spawn должен иметь telegraph flash или звук.
- Уязвимые fuel tanks взрываются цепочкой, меняя маршрут и открывая бонусную нишу.
- Обязательная группа: враги сверху + мина снизу, чтобы игрок чередовал torpedo и depth charge.
- Второй carrier выдаёт Wave Cannon или Cracker Spread; выбор рандомизируется только после первого прохождения, не ломая баланс.
- До конца сегмента игрок должен получить хотя бы один upgrade даже при минимальном score.

### Сегмент C — Polar Trench, 3:20–5:10

**Задача:** поднять напряжение перед боссом.

- Узкий trench под ледяной плитой; камера немного ускоряется.
- Появляются быстрые torpedoes, escort formations и collapsing ice hazards.
- Через foreground проходят крупные силуэты китоподобных машин/ледоколов; они создают ощущение масштаба, но не наносят урон без ясного warning.
- Один короткий вертикальный pocket допускает обход основного потока и даёт star-orbs.
- Перед arena — тихий 2–3-секундный участок с дальним силуэтом босса, звуковым cue и восстановлением читаемости HUD.
- Второй checkpoint перед boss gate.

### Segment D — Boss Arena, 5:10–6:30

**Босс:** Argock-class Icebreaker [РЕКОНСТРУКЦИЯ для новой игры]

Форма: огромный автономный ледовый бур с корабельной рубкой, подводными турелями и rotating drill core. Босс занимает 55–70% высоты экрана, но оставляет минимум две линии для evasive movement.

Фазы:

1. **Patrol pass** — босс входит справа; запускает две горизонтальные очереди и мины сверху. Weak points подсвечены коротким amber flash.
2. **Drill charge** — босс закрывает одну треть арены, разгоняется по прямой; игрок уклоняется вверх/вниз, depth charge бьёт в нижний exposed module.
3. **Escort release** — раскрываются два drone bay; small drones прикрывают верхний и нижний weak point. Уничтожение bays снижает интенсивность спавна.
4. **Core exposed** — после разрушения трёх модулей раскрывается energy core. Ограниченное окно 12 s; затем boss повторяет phase 2 с меньшим HP.
5. **Defeat** — последовательное разрушение брони, steam, sparks, cascading explosions; финальный взрыв не должен закрывать victory state или HUD.

Boss HP должен позволять победить за 45–75 s при сохранении стартового оружия и за 25–45 s с upgrade.

## 7. Враги и hazards

| Класс | Поведение | Контрмера |
|---|---|---|
| Scout drone | Прямой заход, короткая очередь | Torpedo |
| Mine | Плавает в fixed lane, proximity trigger | Depth charge или обход |
| Surface aircraft | Заходит сверху, бросает быстрый снаряд | Движение + upward fire |
| Hunter sub | Преследует игрока, меняет высоту | Burst fire, vertical dodge |
| Turret barge | Медленный объект с защищённым корпусом | Уничтожить support/weak point |
| Ice collapse | Ледяной chunk с telegraph crack | Сместиться в свободную lane |
| Refinery tank | Static destructible scenery | Fire; chain reaction |

Правило fairness: любой быстрый projectile получает минимум 0.25 s визуального или звукового telegraph, если он появляется за пределами камеры.

## 8. HUD и обратная связь

HUD минималистичный, крупный, читаемый на 320×240:

- `1P SCORE` / `2P SCORE`.
- `TIME` с визуальным warning при 25% и 10% остатка.
- `POWER` с icon текущего оружия и tier.
- `LIFE` или 3 discrete HP pips.
- Малый `BOSS` bar только во время boss encounter.

Feedback:

- попадание: 1–2 frame hit flash, metallic sound;
- pickup: icon + короткий цветовой burst;
- damage player: red edge flash, distinct low-frequency cue, invulnerability blink 1.0 s;
- checkpoint: короткая надпись без остановки игры;
- time warning: разреженный beep, частота возрастает только в последних 10%.

## 9. Художественное направление

### Ключевые признаки

- Детализированный pixel art с hand-animated sprites, не flat vector art.
- Палитра: глубокий navy/teal фон, ледяной cyan, sea-green, ржавый orange, warning red, тёплый yellow для pickups.
- Сильный contrast между холодной водой и тёплыми промышленными огнями.
- Много маленьких движений: пузырьки, водоросли, cables, steam, fish silhouettes, rotating machinery.
- Parallax минимум 4 слоя: distant ice, midground wreckage, playfield structures, foreground debris.
- Взрывы ступенчатые: flash → smoke bubble → fragments → fading particles.
- Субмарина тяжёлая и механическая, но silhouette должна читаться мгновенно.
- Bosses должны выглядеть как moving machines, собранные из крупных читаемых модулей.

### Запреты

- Не копировать оригинальные Granvia, Argock, логотип Irem, экранные спрайты, stage tiles или soundtrack.
- Не использовать AI-generated assets без ручного контроля silhouettes, tile seams, animation loops и лицензии.
- Не делать фон настолько контрастным, чтобы он конкурировал с projectile layer.
- Не маскировать lethal hazards декоративными деталями.

## 10. Звук

- Оригинальный динамичный chiptune/arcade soundtrack с отдельной темой **South Pole-inspired**, но без семплирования или мелодического копирования референса.
- Музыка: 150–175 BPM, bass pulse, metallic percussion, короткие loop-фразы; boss layer добавляет low drone.
- SFX: torpedo launch, depth-charge fall, underwater impact, metal hit, alarm, pickup, boss armor break.
- Mix priority: player damage > enemy projectile > weapon fire > scenery ambience.
- Все важные gameplay cues различимы без музыки.

## 11. Техническая реализация

- Fixed timestep simulation: 60 Hz.
- Отдельные слои: background parallax, collision geometry, hazards, actors, projectiles, foreground, HUD.
- Object pooling для projectiles, particles и enemy spawns.
- Deterministic spawn pattern для arcade mode; seed сохраняется в replay/debug build.
- Collision masks: player, player weapon, enemy, enemy weapon, scenery, pickup.
- Camera movement не должен менять world simulation speed.
- Save только high score, settings и unlocks; первый уровень полностью проходим без сохранения.
- Debug overlay: FPS, camera speed, timer, player coordinates, active actors, collision boxes, spawn IDs.
- Accessibility: remappable controls, reduced-flash option, audio sliders, high-contrast projectile option, pause anytime.

## 12. Баланс и тестирование

### Обязательные сценарии

1. Новый игрок проходит Segment A, получает upgrade и понимает два типа стрельбы без текста tutorial.
2. Опытный игрок может замедлить камеру для чтения hazard, но не stall-ить уровень бесконечно.
3. Игрок без upgrade всё ещё может победить boss при грамотном уклонении.
4. Два игрока не блокируют друг друга collision-ом.
5. Все lethal projectiles читаемы на базовой 320×240 области.
6. При потере жизни checkpoint не удаляет прогресс уровня и не создаёт softlock.
7. Boss arena не имеет случайной неизбежной комбинации projectile + terrain.

### Метрики при playtest

- Средний игрок получает первую смерть между 2:00 и 4:00 на Normal.
- Первое прохождение boss arena: 2–4 попытки после освоения уровня.
- Не менее 90% testers замечают первый weapon carrier.
- Не менее 80% testers применяют depth charge до конца Segment A.
- Ни один тестер не должен терять HP из-за projectile, появившегося вне safe read window.

## 13. Definition of Done

Уровень считается готовым, если:

- есть полный playable path от spawn до boss victory;
- все четыре сегмента имеют финальные collision bounds и checkpoint behavior;
- есть минимум 5 типов врагов, 2 destructible scenery systems и 3 upgrade types;
- boss имеет 4+ читаемых attack patterns, damage states и defeat sequence;
- уровень стабильно держит 60 FPS на целевой платформе;
- HUD, pause, remap, sound settings и restart работают;
- normal/easy/hard дают разные плотность врагов и timer pressure;
- нет placeholder-графики в gameplay capture;
- проведены accessibility, controller, two-player и low-performance playtests;
- все ассеты оригинальны либо имеют подтверждённую лицензию.

## 14. Deliverables

1. Level design document и annotated map.
2. Graybox playable build.
3. Final tile set: background, midground, foreground, hazards.
4. Nereid-01 sprite sheet с idle, move, fire, damage, death.
5. Enemy sprite sheets и projectile atlas.
6. Boss sprite sheet, phase VFX и explosion animation.
7. Original South Pole-inspired music loop и SFX pack.
8. HUD assets, controller mapping и accessibility settings.
9. Playtest report с metrics из раздела 12.
10. Marketing keyframe/slide: 16:9 scene из первого уровня с подписью gameplay features.

## Источники исследования

- [Wikipedia — In the Hunt](https://en.wikipedia.org/wiki/In_the_Hunt) — общие сведения, Granvia, D.A.S., управление, upgrades, Argock, релизы.
- [Hardcore Gaming 101 — In the Hunt](http://www.hardcoregaming101.net/in-the-hunt/) — шесть этапов, трек South Pole, управляемый scroll speed, time limit, weapon behavior и visual style.
- [International Arcade Museum — In the Hunt](https://www.arcade-museum.com/game_detail.php?game_id=8184) — arcade hardware, controls и reference screenshots.
- [Reference gameplay screenshot 1](https://www.arcade-museum.com/images-game/28/in-the-hunt-28281.jpg)
- [Reference gameplay screenshot 2](https://www.arcade-museum.com/images-game/28/in-the-hunt-28280.jpg)
- [Reference gameplay screenshot 3](https://www.arcade-museum.com/images-game/28/in-the-hunt-28279.jpg)
- [Reference gameplay screenshot 4](https://www.arcade-museum.com/images-game/28/in-the-hunt-28278.jpg)
- [Reference gameplay screenshot 5](https://www.arcade-museum.com/images-game/15/in-the-hunt-15471.jpg)

> Важное примечание: источники подтверждают общие mechanics и первый boss reference, но не предоставляют достоверную полную карту первого уровня. Поэтому конкретная сегментация, spawn tables, boss phases и narrative цели в этом документе — проектная реконструкция для новой оригинальной игры.
