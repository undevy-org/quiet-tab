# Overlay modals — design spec (final)

**Статус:** утверждено (final)  
**Дата:** 2026-10-06  
**Область:** desktop dialogs (§4–7, §12), city modal (§8–11), общие overlay-form patterns  
**Не в scope:** tooltip, desktop status chip, add menu (§1–3 без изменений)

---

## Визуальный референс (утверждено в brainstorming)

Точные пропорции и компоновка **не пересказываются в prose** — для всего, что владелец согласовал глазами, **канон = правая колонка** mockup:

| Референс | Путь |
|----------|------|
| Production baseline (аудит) | [`docs/superpowers/mockups/2026-10-06-overlay-modals/baseline-production-catalog.html`](../mockups/2026-10-06-overlay-modals/baseline-production-catalog.html) |
| **Target для разработки** | [`docs/superpowers/mockups/2026-10-06-overlay-modals/approved-target-comparison.html`](../mockups/2026-10-06-overlay-modals/approved-target-comparison.html) |

Секции mockup **4–12** (правая колонка) = обязательный visual acceptance. Секции **1–3** — без изменений (левая и правая колонки совпадают).

Temporary Visual Companion server (`.superpowers/brainstorm/`) **не** является архивом; после финализации остановлен.

---

## Цели

1. Единый **modal actions** footer (две кнопки, 50/50, иконки).
2. Единый **vertical rhythm** content → actions без «дыр» и без лишних horizontal dividers.
3. Формы **Add link / Edit link / Edit weather** — Direction **B** + **D** (см. ниже).
4. City modal — без feedback reserve и без «Current:»; change city с prefill.
5. Delete link vs hide weather — разная семантика и **разные иконки** на primary/destructive commit.

---

## Токены (точные значения)

Новый токен добавить в `design-tokens.css`:

| Token | Value | Use |
|-------|-------|-----|
| `--modal-actions-margin-top` | **16px** | От последнего content-элемента (или текста ошибки) до **верхнего края** ряда modal actions |

Существующие (не менять значения, только usage):

| Token | Value | Use |
|-------|-------|-----|
| `--surface-modal-padding` | **20px** | Padding карточки; **единственный** нижний inset под кнопками |
| `--surface-modal-max-width` | **420px** | `min()` с viewport margin |
| `--form-footer-gap` | **8px** | Gap между двумя кнопками actions |
| `--control-height` | **40px** | Min-height кнопок и полей |
| `--control-gap-icon` | **6px** | Gap иконка–текст в кнопке |
| `--form-row-gap` | **12px** | Label ↔ control в row (Direction B) |
| `--form-row-padding-y` | **12px** | Vertical padding form row (после снятия border — см. B) |
| `--font-size-sm` | **13px** | Row labels |
| `--font-size-title` | **18px** | Modal titles |
| `--title-margin-bottom` | **12px** | Под заголовком |

**City modal error gap (локально, не permanent reserve):** **8px** `margin-top` у `.status--error` над actions (когда ошибка видима).

**Anti-patterns:**

- Не использовать `--form-footer-padding-y` (**14px**) для modal actions bottom/top в dialogs/city modal.
- Не суммировать `--surface-modal-padding` + footer padding снизу.
- Нет `border-top` на `.favorite-form__row` внутри modal dialogs.
- Нет `border-top` на modal actions row.
- Нет `min-height` reserve на `.city-modal__feedback`.

---

## Modal actions (все modals §4–8–11, §12)

- **Count:** ровно **2** кнопки.
- **Layout:** `display: flex`; `gap: var(--form-footer-gap)`; каждая кнопка `flex: 1`; `min-height: var(--control-height)`; `justify-content: center`; иконка + label.
- **Margin above row:** `margin-top: var(--modal-actions-margin-top)` (**16px**).
- **Order:** secondary (Cancel / Not now) **слева**; commit **справа**.

### Иконки на commit (Lucide / `icons.js`)

| Modal | Правая кнопка | Класс | Иконка |
|-------|----------------|-------|--------|
| Add link | Add | `button--primary` | `check` |
| Edit link | Save | `button--primary` | `check` |
| Edit weather | Save | `button--primary` | `check` |
| City modal | Save | `button--primary` | `check` |
| Delete link? | Delete | `button--danger` | **`trash2`** |
| Hide temperature? | Hide | `button--primary` | **`eyeOff`** (не trash2) |

Secondary всегда: **`x`** + Cancel / Not now.

### Copy (English UI)

| § | Title | Body | Buttons |
|---|-------|------|---------|
| 6 | Delete link? | This removes the link from your grid. | Cancel \| Delete |
| 12 | Hide temperature? | This hides the tile from your grid. You can add it again from Add. | Cancel \| Hide |

---

## Direction B — desktop form dialogs (§4, 5, 7)

**Scope:** `.desktop-dialog` forms (Add link, Edit link, Edit weather).

1. **Row dividers:** убрать `border-top` у `.favorite-form__row` в modal (оставить только spacing: `padding: var(--form-row-padding-y) 0`, first row без лишнего top border).
2. **Labels:** сохранить grid **100px** label + control (`--form-label-width`).
3. **Segmented (scoped to `.desktop-dialog`):** выбранный сегмент **не** `background: var(--primary)`.

   **Soft selected (exact):**

   ```css
   .desktop-dialog .segmented__option:has(input:checked) {
     background: var(--soft-fill-strong);
     color: var(--text);
     font-weight: var(--font-weight-control);
     box-shadow: inset 0 0 0 1px var(--border-control);
   }
   ```

   Unselected: muted text как сейчас. Глобальный `--primary` / segmented вне dialogs **не менять**.

4. **Footer:** не `.favorite-form__footer` с border-top; unified **modal actions** row (см. выше). Confirm-delete (§6) — те же 50/50, не `justify-content: flex-end`.

**§5 Edit link:** только Cancel \| Save — **нет** Delete в footer (Delete только §6 через edit mode «−», task B).

---

## Direction D — edit weather city row (§7)

Заменить `.desktop-dialog__city` + `text-button`:

- Одна form row: label **City** (`--form-label-width`).
- Control: **`city-field`** — визуально как `.favorite-input` (height 40px, `--border-control`, `--radius-control`), full width of control column.
- Content: truncated city label + trailing hint **Change** (`--font-size-md` / **12px** muted для hint в mock).
- Interaction (task B): tap открывает city modal (stacked); не underline link.

Size row: тот же Direction B segmented.

---

## City modal (§8–11)

1. **Feedback reserve:** удалить постоянный `min-height` у `.city-modal__feedback` и логику `--city-feedback-reserve` / `.city-modal__dialog--compact` для reserve (переписать `placePopover` / tests — task B).
2. **Errors:** `.status--error` только когда есть текст; **8px** над actions; карточка может расти — **accepted** (отказ от «кнопки не двигаются»).
3. **Change city:** убрать `.city-modal__current` / copy «Current: …»; **prefill** `input` текущим городом (display label, task B).
4. **Actions:** те же правила modal actions (`margin-top: 16px`, 50/50). Убрать отдельный hardcoded `margin-top: 16px` только на `.city-modal__actions` в пользу общего токена.

First-run description paragraph — **без изменений copy**.

---

## Product logic (Task B — отдельная реализация)

| Flow | Behavior |
|------|----------|
| Delete favorite | Только edit mode «−» → §6 Delete link? |
| Edit link | No Delete button |
| Hide weather metric | Edit mode «−» → §12 confirm → hide on Hide |
| Change city | Prefill input; open from §7 city-field or stacked §11 |

Task A (visual/CSS/DOM) и Task B (services, dialogs, E2E) могут идти отдельными PR; visual mock уже включает §12 target.

---

## Acceptance criteria

### Visual (Task A)

- [ ] Правая колонка `approved-target-comparison.html` достижима в product (§4–12) при 420px modal width, light theme.
- [ ] `--modal-actions-margin-top: 16px` в tokens + единый actions block в CSS.
- [ ] Direction B + D в §4, 5, 7; city §8–11; §6 footer 50/50.
- [ ] `design-system.md` обновлён (follow-up).

### Logic (Task B)

- [ ] Edit link без Delete; weather «−» → §12; city prefill; feedback reserve removed; docs/E2E under old reserve updated.

---

## Implementation handoff

1. **Task A** — CSS/DOM по target mock + token.  
2. **Task B** — flows + copy + `placePopover` simplification.  
3. Verification: side-by-side с `approved-target-comparison.html` (target column).

---

## Changelog

| Version | Date | Note |
|---------|------|------|
| v0.1–v0.3 | 2026-10-06 | Brainstorming drafts |
| **final** | 2026-10-06 | Утверждено; mockups archived; §12 Hide → eyeOff |
