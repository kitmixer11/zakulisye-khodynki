# Визуальные материалы «Закулисья Ходынки»

## Видео и звук v0.3

- `public/assets/video/intro.mp4` — пользовательский `D:/big media/мое/суселисье.mp4`, скопирован без изменений; 32 секунды, 1920×1080.
- `public/assets/audio/behind-door.mp3` — пользовательский `за дверью.mp3`, случайная реплика в укрытии.
- `public/assets/audio/shot.mp3` — пользовательский `шот.mp3`, случайная реакция на монстра.
- `public/assets/audio/back-off.mp3` — пользовательский `отъебись.mp3`, альтернативная реакция на монстра.

MP3 скопированы из Downloads без изменения исходников. В v0.3 музыка, лампы и шаги синтезировались; в v0.4 они заменены записями, перечисленными ниже. Дыхание и сердцебиение пока синтезируются локально через Web Audio в `src/audio.js`. Тексты вступления и финала согласованы пользователем и находятся в `src/cinematics.js`.

## Принятый стиль

Узкий жилой коридор: тёплая охристая штукатурка, чёрно-зелёные стальные двери, плитка, низкий потолок и холодные люминесцентные лампы. Поверхности выполнены с мягкими гранями, как на присланном изображении. Меню — тёмный фон, состаренный золотистый текст, Cormorant Garamond, три игровых пункта. HUD — небольшой указатель цели и контекстные подсказки.

## Файлы и происхождение

| Файл в проекте                                     | Источник                                           | Назначение                                       |
| -------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| `public/assets/monster/front.png`                  | Пользователь: `спереди.png`                        | Передний ракурс                                  |
| `public/assets/monster/back.png`                   | Пользователь: `сзади.png`                          | Задний ракурс                                    |
| `public/assets/monster/side.png`                   | Пользователь: `сбоку.png`                          | Боковой ракурс, зеркалируется для второй стороны |
| `public/assets/monster/angry.png`                  | Пользователь: `эмоция.png`                         | Нападение и экран поражения                      |
| `public/assets/environment/corridor-reference.png` | Пользователь: `коридор.png`                        | Референс для построения объёмных коридоров       |
| `public/assets/environment/menu-background.png`    | Встроенный `image_gen`, по референсам пользователя | Готовый отдельный фон главного меню              |

Пользовательские PNG скопированы без перерисовки. Все четыре ракурса имеют размер 725×893 и настоящий альфа-канал (проверено). Масштаб в мире — 2,39 м по высоте плоскости; центр и положение ног согласованы исходными одинаковыми полотнами. Изображения используются с sRGB, линейной фильтрацией, mipmaps, alpha test и записью глубины. Монстр поворачивается вокруг вертикальной оси; выбор изображения зависит от его направления движения и положения камеры. Коллизии и поиск пути независимы от картинки.

Коридор не используется как плоская декорация игрового уровня: стены, потолок, двери и пол — настоящая геометрия. Текстуры поверхностей генерируются кодом под утверждённый стиль. Полные квартиры пока заменены небольшими прихожими; глазок показывает ту же живую 3D-сцену через отдельный проход рендера с круглой маской и искажением.

## Промпт фона меню

Режим: встроенный генератор изображений. Референс 1 — `коридор.png`, референс 2 — `эмоция.png`. Итог скопирован в проект и подключён в CSS.

```text
Use case: stylized-concept. Create a finished 16:9 landscape main menu background illustration for a Russian residential corridor horror game. Reference 1 is the exact approved environment style: narrow apartment corridor, ochre beige faceted plaster, dark charcoal steel apartment doors, dirty square glossy tiled floor, low suspended ceiling, greenish fluorescent lights, painterly low-poly 3D horror. Reference 2 is the approved green glass absinthe skull bottle creature. Compose a NEW cinematic view from the entrance, long hallway receding towards a closed end door on the right half of the image. Left 40 percent is close, dark, textured corridor wall and deep shadow, quiet negative space for a game title and menu which will be added in HTML. On the far right mid-distance, the same creature is barely peeking from a slightly ajar apartment door: recognizable green bottle skull and one claw, subtle and threatening, not a giant foreground character. Strong depth, amber wall light and cold sickly green fluorescent pools, soft haze, grounded dark horror, painterly faceted surfaces consistent with both references. Keep useful midtones on right so doors and floor remain visible. No text, no letters, no title, no UI, no logos, no watermark. Wide 1920x1080 composition.
```

## Найденные записи v0.4 — CC0

- `public/assets/audio/step-1.ogg` … `step-6.ogg`: [Footsteps — GboxMikeFozzy](https://opengameart.org/content/footsteps-0). Автор записал шаги в подземном переходе; шесть отдельных файлов. CC0. Исходные OGG сохранены без изменений, при декодировании пики приводятся к 0,85; в игре чередуются варианты и слегка меняется скорость.
- `public/assets/audio/lamp.mp3`: [Fluorescent light buzzing — Rvgerxini](https://freesound.org/people/Rvgerxini/sounds/474312/). CC0. Используется публичный HQ MP3 с https://cdn.freesound.org/previews/474/474312_9453283-hq.mp3. В игре фильтр 950 Гц и тихое затухание по расстоянию.
- `public/assets/audio/menu-horror.ogg`: [Tragic ambient main menu — brandon75689, опубликовано HaelDB](https://opengameart.org/content/tragic-ambient-main-menu). На странице предложены CC0 и OGA-BY 3.0; выбран вариант CC0. Оригинальный файл 100 секунд сохранён без изменений. Для игрового цикла код берёт отрезок 1,5–89 секунд и смешивает границу на протяжении 1,5 секунды.

Источники и лицензии проверены 5 сентября 2026. [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) разрешает копирование, изменение и коммерческое использование без обязательной атрибуции. Авторы указаны здесь для сохранения происхождения материалов.

## Скример и двери v0.4.1

- `public/assets/audio/screamer.mp3` — звуковая дорожка из пользовательского `C:/Users/kitmi/Downloads/alert_orig (1) (1).mp4`, длительность около 10 секунд. FFmpeg: `-map 0:a:0 -vn -c:a libmp3lame -q:a 2`. Видео и исходный звук не изменены, MP3 сохранён отдельно.
- `public/assets/audio/door-open.mp3` — [Door Open SFX — Oiboo](https://opengameart.org/content/door-open-sfx), CC0. Из оригинального WAV взят отрезок от 0,58 секунды длительностью 1,95 секунды, чтобы убрать тишину перед действием; MP3 VBR quality 2.
- `public/assets/audio/door-close-1.ogg` … `door-close-4.ogg` — [4 Door Closes — StarNinjas](https://opengameart.org/content/4-door-closes), CC0. Файлы из ZIP скопированы без изменения, воспроизводится случайный вариант. [Профиль автора StarNinjas](https://opengameart.org/users/starninjas).

Страницы источников и лицензии проверены 5 сентября 2026. Для дверей используется небольшая вариация скорости; громкость дверей монстра уменьшается с расстоянием и за закрытой дверью укрытия.
