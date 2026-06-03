# BrainPlus Design System

> v0.1.0 | 2026-06-03 | Normcore

## Philosophy

Remove until it breaks. Add back only the last element. No emoji. No decoration. All icons from lucide-react.

---

## Page skeleton

Every page follows exactly one structure. The top bar is a functional area (icon + title + actions). The content area fills the remaining space.

```
┌─ Top bar ─────────────────────────────────────┐
│  Icon  Title              Actions              │  h-11 px-4
├────────────────────────────────────────────────┤
│                                                │
│  Content                                       │  flex-1 overflow-auto
│                                                │
└────────────────────────────────────────────────┘
```

### Template

```tsx
<div className="flex h-full flex-col">
  <div className="flex h-11 items-center gap-2 border-b border-border px-4">
    <IconName className="h-4 w-4 text-muted-foreground shrink-0" />
    <h2 className="text-sm font-semibold">Page Title</h2>
    <div className="flex-1" />
    {/* Action buttons: h-7 text-xs */}
  </div>
  <div className="flex-1 overflow-auto p-4">
    {/* Content */}
  </div>
</div>
```

### Top bar specification

| Property | Value | Tailwind |
|----------|-------|----------|
| Height | 44px | `h-11` |
| Horizontal padding | 16px | `px-4` |
| Layout | Flex row, centered, 8px gap | `flex items-center gap-2` |
| Title icon | 16px, muted | `h-4 w-4 text-muted-foreground shrink-0` |
| Title text | 14px, semibold | `text-sm font-semibold` |
| Action spacer | Flex grow | `flex-1` |
| Action buttons | 28px height, 12px text | `h-7 text-xs` |
| Bottom border | Only when content scrolls | `border-b border-border` |

### Content area specification

| Property | Value | Tailwind |
|----------|-------|----------|
| Growth | Fill remaining height | `flex-1` |
| Scroll | Vertical auto | `overflow-auto` |
| Padding | 16px all sides | `p-4` |

---

## Two-panel layout

When a page needs a left panel, the top bar remains full-width. The panels sit below it.

```tsx
<div className="flex h-full flex-col">
  {/* Top bar: full width */}
  <div className="flex h-11 items-center gap-2 border-b border-border px-4">
    ...
  </div>
  {/* Panels */}
  <div className="flex flex-1 overflow-hidden">
    <div className="w-72 flex-col border-r border-border">
      {/* Left panel content */}
    </div>
    <div className="flex-1 overflow-auto p-4">
      {/* Right panel content */}
    </div>
  </div>
</div>
```

| Property | Value |
|----------|-------|
| Left panel width | `w-72` (diary) or `w-80` (inspiration) or `w-64` (files) |
| Panel divider | `border-r border-border` on left panel |
| Panel scroll | Internal `overflow-auto` on each panel |
| Panel headers | Removed. All controls in the top bar. |

---

## Icon mapping

Each page uses the same icon as its sidebar navigation item.

| Sidebar nav | Icon | Page component |
|-------------|------|----------------|
| AI 助手 | `Bot` | ChatPage (ConversationBar uses `MessageSquare`) |
| AI 工具箱 | `MessageSquare` | AIPage |
| 日记 | `BookOpen` | DiaryPage |
| 灵感记录 | `Lightbulb` | InspirationPage |
| Skills | `Package` | SkillsPage |
| 文件 | `FolderOpen` | FileManagerPage |

---

## Border rules

| When | Rule |
|------|------|
| Top bar over scrolling content | `border-b border-border` on top bar |
| Navigation panel (persistent) | `border-r border-border` on panel |
| Cards, inputs, fieldsets | `border border-border rounded-lg` |
| Everything else | **No border.** Use spacing and background contrast. |

**Never:**
- Two consecutive `border-b` on sibling elements
- `border-b` immediately followed by `border-t` (double line)
- Colored borders for decoration
- Panel-internal header with its own `border-b` (move controls to top bar)

---

## Color tokens

| Token | Usage |
|-------|-------|
| `bg-background` | Page background |
| `bg-card` | Sidebar |
| `bg-muted` | Tab bar container |
| `bg-muted/30` | Subtle row emphasis |
| `bg-accent` | Active list item |
| `bg-primary` | Primary buttons, active indicators |
| `border-border` | Structural dividers only |
| `text-foreground` | Primary text |
| `text-muted-foreground` | Secondary text, icons, captions |

---

## Typography

| Role | Class |
|------|-------|
| Page title | `text-sm font-semibold` |
| Section label | `text-xs font-medium text-muted-foreground` |
| Body | `text-sm` |
| Caption | `text-xs text-muted-foreground` |
| Micro | `text-[10px] text-muted-foreground/50` |
| Button label | `text-xs` |

---

## Icons

- **Source:** lucide-react only. Never emoji.
- **Size hierarchy:**
  - Page title icon: `h-4 w-4`
  - Tab/button icon: `h-3.5 w-3.5`
  - Inline micro icon: `h-3 w-3`
- **Color:** `text-muted-foreground` by default. Inherits from parent on hover/active.

---

## Reference implementation

**FileManagerPage** is the canonical example. Study it when adding new pages.

Key traits:
- Single top bar spanning full width (icon + title + actions)
- Optional second row for breadcrumbs/path (shares a single `border-b`)
- Two-panel content below with `border-r` on the navigation panel
- Internal panel headers use `h-11` for visual rhythm but no `border-b`
- All action buttons are `h-7 text-xs`

---

## Page checklist

| Page | Skeleton | Top bar h-11 px-4 | Content p-4 | Panels unified | Extra borders removed |
|------|:---:|:---:|:---:|:---:|:---:|
| ChatPage | ✓ | ✓ | — | — | ✓ |
| AIPage | ✓ | ✓ | — | — | ✓ |
| DiaryPage | ✓ | ✓ | — | ✓ | ✓ |
| InspirationPage | ✓ | ✓ | — | ✓ | ✓ |
| SkillsPage | ✓ | ✓ | ✓ | — | ✓ |
| SettingsPage | ✓ | ✓ | ✓ | — | ✓ |
| FileManagerPage | ✓ | ✓ | — | ✓ | ✓ |
